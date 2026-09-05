-- Nurse intake offline conflict detection. The snapshot is the latest intake
-- identifier for a patient (or null when none exists), not patients.revision.

-- Every intake writer (RPC or policy-authorized direct insert) participates in
-- the same patient-scoped transaction lock, closing the check/insert race.
create or replace function public.lock_initial_intake_patient()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('medisens:nurse-intake:' || new.patient_id::text, 0));
  return new;
end;
$$;

drop trigger if exists initial_consultation_patient_lock on public.initial_consultation;
create trigger initial_consultation_patient_lock
before insert on public.initial_consultation
for each row execute function public.lock_initial_intake_patient();

create or replace function public.get_nurse_intake_snapshot(p_patient_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest_id bigint;
begin
  if public.get_my_role() <> 'nurse' then
    raise exception 'Nurse intake snapshots are restricted to active nurses' using errcode = '42501';
  end if;
  if not exists (select 1 from public.patients where id = p_patient_id) then
    raise exception 'Initial intake requires a valid patient' using errcode = '22023';
  end if;
  select max(initialconsultation_id) into v_latest_id
  from public.initial_consultation where patient_id = p_patient_id;
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
  if public.get_my_role() <> 'nurse' then
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

  -- Serialize all offline replay checks for this patient. The existing
  -- record_initial_intake call executes in this same transaction.
  perform pg_advisory_xact_lock(hashtextextended('medisens:nurse-intake:' || v_patient_id::text, 0));

  select * into v_existing from public.applied_operations
  where operation_id = p_operation_id
    and entity_type = 'initial_consultation'
    and operation_type = 'create';
  if found then
    return jsonb_build_object(
      'outcome', 'already_applied',
      'serverId', (v_existing.result ->> 'serverId')::bigint
    );
  end if;

  select max(initialconsultation_id) into v_current_latest_id
  from public.initial_consultation where patient_id = v_patient_id;
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

revoke all on function public.get_nurse_intake_snapshot(bigint) from public, anon;
grant execute on function public.get_nurse_intake_snapshot(bigint) to authenticated;
revoke all on function public.replay_nurse_initial_intake(jsonb, jsonb, uuid, bigint) from public, anon;
grant execute on function public.replay_nurse_initial_intake(jsonb, jsonb, uuid, bigint) to authenticated;
