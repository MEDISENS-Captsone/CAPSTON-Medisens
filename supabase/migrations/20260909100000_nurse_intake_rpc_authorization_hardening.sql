-- Corrective hardening for the pending Nurse Intake snapshot/replay RPCs.
--
-- This is deliberately additive: 20260830090000 is already deployed and
-- 20260905190000 may exist in another environment.  The rules below mirror
-- the current Nurse Initial Consultation worklist: a patient must be active
-- and have a recorded patient_consent row.  MediSens does not use a
-- nurse-to-patient assignment model, so no assignment requirement is added.

create or replace function public.record_initial_intake(
  p_initial jsonb,
  p_vitals jsonb,
  p_operation_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id public.patients.id%type;
  v_vitals_patient_id public.patients.id%type;
  v_initial_consultation_id bigint;
  v_existing public.applied_operations%rowtype;
begin
  if coalesce(public.get_my_role(), '') not in ('nurse', 'midwives') then
    raise exception 'Initial intake is restricted to active nurses and midwives' using errcode = '42501';
  end if;

  if p_operation_id is not null then
    select * into v_existing
    from public.applied_operations
    where operation_id = p_operation_id
      and entity_type = 'initial_consultation'
      and operation_type = 'create';

    if found then
      if v_existing.actor_id is distinct from (select auth.uid()) then
        raise exception 'This intake operation belongs to a different staff account' using errcode = '42501';
      end if;
      return (v_existing.result ->> 'serverId')::bigint;
    end if;
  end if;

  v_patient_id := nullif(p_initial ->> 'patient_id', '')::bigint;
  v_vitals_patient_id := nullif(p_vitals ->> 'patient_id', '')::bigint;

  if v_patient_id is null or v_vitals_patient_id is distinct from v_patient_id then
    raise exception 'Initial intake and vital signs must reference the same patient';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = v_patient_id
      and coalesce(p.archive_status::text, 'active') = 'active'
      and exists (
        select 1 from public.patient_consent pc where pc.patient_id = p.id
      )
  ) then
    raise exception 'Initial intake requires an active patient with recorded consent' using errcode = '42501';
  end if;

  insert into public.initial_consultation (
    patient_id, consultation_date, consultation_time, mode_of_transaction,
    referred_by, mode_of_transfer, chief_complaint, diagnosis, visit_disposition
  ) values (
    v_patient_id, p_initial ->> 'consultation_date', p_initial ->> 'consultation_time',
    p_initial ->> 'mode_of_transaction', p_initial ->> 'referred_by',
    p_initial ->> 'mode_of_transfer', p_initial ->> 'chief_complaint',
    p_initial ->> 'diagnosis', p_initial ->> 'visit_disposition'
  ) returning initialconsultation_id into v_initial_consultation_id;

  insert into public.vital_sign (
    patient_id, initial_consultation_id, bp, heart_rate, respiratory_rate,
    temperature, o2_saturation, weight, height, nutritional_status, bmi,
    visual_acuity_left, visual_acuity_right, general_survey
  ) values (
    v_patient_id, v_initial_consultation_id, p_vitals ->> 'bp',
    nullif(p_vitals ->> 'heart_rate', '')::numeric,
    nullif(p_vitals ->> 'respiratory_rate', '')::numeric,
    nullif(p_vitals ->> 'temperature', '')::numeric,
    nullif(p_vitals ->> 'o2_saturation', '')::numeric,
    nullif(p_vitals ->> 'weight', '')::numeric,
    nullif(p_vitals ->> 'height', '')::numeric,
    p_vitals ->> 'nutritional_status', nullif(p_vitals ->> 'bmi', '')::numeric,
    p_vitals ->> 'visual_acuity_left', p_vitals ->> 'visual_acuity_right',
    p_vitals ->> 'general_survey'
  );

  if p_operation_id is not null then
    insert into public.applied_operations (
      operation_id, entity_type, operation_type, actor_id, server_record_id, result
    ) values (
      p_operation_id, 'initial_consultation', 'create', (select auth.uid()),
      v_initial_consultation_id,
      jsonb_build_object('outcome', 'success', 'serverId', v_initial_consultation_id, 'revision', 1)
    );
  end if;

  return v_initial_consultation_id;
end;
$$;

create or replace function public.get_nurse_intake_snapshot(p_patient_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest_id bigint;
begin
  if coalesce(public.get_my_role(), '') <> 'nurse' then
    raise exception 'Nurse intake snapshots are restricted to active nurses' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and coalesce(p.archive_status::text, 'active') = 'active'
      and exists (
        select 1 from public.patient_consent pc where pc.patient_id = p.id
      )
  ) then
    raise exception 'Patient is not available for Nurse intake' using errcode = '42501';
  end if;

  select max(ic.initialconsultation_id) into v_latest_id
  from public.initial_consultation ic
  where ic.patient_id = p_patient_id;

  return jsonb_build_object('latestIntakeId', v_latest_id, 'capturedAt', statement_timestamp());
end;
$$;

create or replace function public.replay_nurse_initial_intake(
  p_initial jsonb,
  p_vitals jsonb,
  p_operation_id uuid,
  p_expected_latest_intake_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id bigint;
  v_vitals_patient_id bigint;
  v_current_latest_id bigint;
  v_consultation_id bigint;
  v_existing public.applied_operations%rowtype;
begin
  if coalesce(public.get_my_role(), '') <> 'nurse' then
    return jsonb_build_object('outcome', 'unauthorized');
  end if;
  if p_operation_id is null then
    return jsonb_build_object('outcome', 'validation_failed', 'message', 'operationId is required');
  end if;

  v_patient_id := nullif(p_initial ->> 'patient_id', '')::bigint;
  v_vitals_patient_id := nullif(p_vitals ->> 'patient_id', '')::bigint;
  if v_patient_id is null or v_vitals_patient_id is distinct from v_patient_id then
    return jsonb_build_object('outcome', 'validation_failed', 'message', 'Initial intake and vital signs must reference the same patient');
  end if;

  select * into v_existing
  from public.applied_operations
  where operation_id = p_operation_id
    and entity_type = 'initial_consultation'
    and operation_type = 'create';
  if found then
    if v_existing.actor_id is distinct from (select auth.uid()) then
      return jsonb_build_object('outcome', 'unauthorized');
    end if;
    return jsonb_build_object('outcome', 'already_applied', 'serverId', (v_existing.result ->> 'serverId')::bigint);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('medisens:nurse-intake:' || v_patient_id::text, 0));

  -- Re-check after obtaining the same patient lock used by every intake insert.
  select * into v_existing
  from public.applied_operations
  where operation_id = p_operation_id
    and entity_type = 'initial_consultation'
    and operation_type = 'create';
  if found then
    if v_existing.actor_id is distinct from (select auth.uid()) then
      return jsonb_build_object('outcome', 'unauthorized');
    end if;
    return jsonb_build_object('outcome', 'already_applied', 'serverId', (v_existing.result ->> 'serverId')::bigint);
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = v_patient_id
      and coalesce(p.archive_status::text, 'active') = 'active'
      and exists (
        select 1 from public.patient_consent pc where pc.patient_id = p.id
      )
  ) then
    return jsonb_build_object('outcome', 'unauthorized');
  end if;

  select max(ic.initialconsultation_id) into v_current_latest_id
  from public.initial_consultation ic
  where ic.patient_id = v_patient_id;
  if v_current_latest_id is distinct from p_expected_latest_intake_id then
    return jsonb_build_object(
      'outcome', 'conflict',
      'code', 'nurse_intake_stale_snapshot',
      'expectedLatestIntakeId', p_expected_latest_intake_id,
      'currentLatestIntakeId', v_current_latest_id
    );
  end if;

  v_consultation_id := public.record_initial_intake(p_initial, p_vitals, p_operation_id);
  return jsonb_build_object('outcome', 'success', 'serverId', v_consultation_id);
end;
$$;

revoke all on function public.record_initial_intake(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.record_initial_intake(jsonb, jsonb, uuid) to authenticated;
revoke all on function public.get_nurse_intake_snapshot(bigint) from public, anon;
grant execute on function public.get_nurse_intake_snapshot(bigint) to authenticated;
revoke all on function public.replay_nurse_initial_intake(jsonb, jsonb, uuid, bigint) from public, anon;
grant execute on function public.replay_nurse_initial_intake(jsonb, jsonb, uuid, bigint) to authenticated;
