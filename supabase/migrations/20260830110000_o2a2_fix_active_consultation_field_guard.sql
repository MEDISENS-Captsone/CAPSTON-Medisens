-- Offline Sync Phase O2A.2: active consultation field guard fix.
--
-- Reconfirmed live (schema, guard_consultation_integrity(), and
-- src/app/consultation/index.tsx) that `past_med_surge_history` is the
-- column the doctor consultation UI genuinely reads, displays
-- (CONSULTATION_LOAD_COLUMNS), and writes on every save
-- (buildConsultationPayload()) -- and that it is absent from both
-- guard_consultation_integrity()'s legitimate-content exclusion list and
-- consultation_update()'s allow-list. This is the pre-existing defect
-- flagged (but explicitly deferred) during O2A.1: a doctor's UPDATE that
-- actually changes this field's value is rejected today by the generic
-- "fields outside the doctor workflow" catch-all.
--
-- This migration adds exactly this one column to both places. It does
-- NOT touch its correctly-spelled twin `past_med_surg_history` (already
-- fixed in O2A.1), does not rename or drop either column, and does not
-- migrate data between them -- that stays a separate, optional
-- schema-cleanup decision.

create or replace function public.guard_consultation_integrity()
returns trigger
language plpgsql
as $function$
declare
  initial_patient_id public.patients.id%type;
begin
  if new.patient_id is null then
    raise exception 'Consultations require a patient';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = new.patient_id
  ) then
    raise exception 'Consultations require a valid patient';
  end if;

  if new.initial_consultation_id is not null then
    select i.patient_id
    into initial_patient_id
    from public.initial_consultation i
    where i.initialconsultation_id = new.initial_consultation_id;

    if not found then
      raise exception 'Consultations require a valid initial consultation';
    end if;

    if initial_patient_id is distinct from new.patient_id then
      raise exception 'Consultation patient must match the initial consultation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.patient_id is distinct from old.patient_id then
      raise exception 'Consultation patient cannot be changed';
    end if;

    if new.initial_consultation_id is distinct from old.initial_consultation_id then
      raise exception 'Consultation initial consultation cannot be changed';
    end if;

    if new.attending_provider is distinct from old.attending_provider then
      raise exception 'Consultation attending provider cannot be changed';
    end if;

    if new.follow_up_date is distinct from old.follow_up_date then
      raise exception 'Consultation follow_up_date is not editable (use the follow_up table)';
    end if;

    if new.follow_up_time is distinct from old.follow_up_time then
      raise exception 'Consultation follow_up_time is not editable (use the follow_up table)';
    end if;

    if new.follow_up_status is distinct from old.follow_up_status then
      raise exception 'Consultation follow_up_status is not editable (use the follow_up table)';
    end if;

    if (
      to_jsonb(new)
        - 'consultation_id'
        - 'patient_id'
        - 'initial_consultation_id'
        - 'attending_provider'
        - 'family_history'
        - 'immunization_history'
        - 'smoking_status'
        - 'smoking_sticks_per_day'
        - 'smoking_years'
        - 'drinking_status'
        - 'drinking_frequency'
        - 'drinking_years'
        - 'menarche_age'
        - 'sexual_onset_age'
        - 'is_menopause'
        - 'menopause_age'
        - 'lmp'
        - 'interval_cycle'
        - 'period_duration'
        - 'pads_per_day'
        - 'birth_control_method'
        - 'gravidity'
        - 'parity'
        - 'delivery_type'
        - 'full_term_count'
        - 'premature_count'
        - 'abortion_count'
        - 'living_children_count'
        - 'pre_eclampsia'
        - 'medication_treatment'
        - 'management_treatment'
        - 'chief_complaints'
        - 'diagnosis'
        - 'hpi'
        - 'assessment'
        - 'plan'
        - 'past_med_surg_history'
        - 'history_present_illness'
        - 'past_med_surge_history'
        - 'revision'
        - 'updated_at'
    ) is distinct from (
      to_jsonb(old)
        - 'consultation_id'
        - 'patient_id'
        - 'initial_consultation_id'
        - 'attending_provider'
        - 'family_history'
        - 'immunization_history'
        - 'smoking_status'
        - 'smoking_sticks_per_day'
        - 'smoking_years'
        - 'drinking_status'
        - 'drinking_frequency'
        - 'drinking_years'
        - 'menarche_age'
        - 'sexual_onset_age'
        - 'is_menopause'
        - 'menopause_age'
        - 'lmp'
        - 'interval_cycle'
        - 'period_duration'
        - 'pads_per_day'
        - 'birth_control_method'
        - 'gravidity'
        - 'parity'
        - 'delivery_type'
        - 'full_term_count'
        - 'premature_count'
        - 'abortion_count'
        - 'living_children_count'
        - 'pre_eclampsia'
        - 'medication_treatment'
        - 'management_treatment'
        - 'chief_complaints'
        - 'diagnosis'
        - 'hpi'
        - 'assessment'
        - 'plan'
        - 'past_med_surg_history'
        - 'history_present_illness'
        - 'past_med_surge_history'
        - 'revision'
        - 'updated_at'
    ) then
      raise exception 'Consultation update includes fields outside the doctor workflow';
    end if;
  end if;

  return new;
end;
$function$;

-- consultation_update()'s allow-list gains the one active field so the
-- validated write path can actually reach it now that the guard permits
-- it. Everything else (role check, idempotency, revision-check,
-- immutable-field exclusion) is unchanged from O2A.1.
create or replace function public.consultation_update(p_operation_id uuid, p_consultation_id bigint, p_base_revision integer, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_existing public.applied_operations%rowtype;
  v_current_revision integer;
  v_new_revision integer;
  v_set text := '';
  v_key text;
  v_allowed text[] := array[
    'family_history', 'immunization_history', 'smoking_status', 'smoking_sticks_per_day', 'smoking_years',
    'drinking_status', 'drinking_frequency', 'drinking_years', 'menarche_age', 'sexual_onset_age', 'is_menopause',
    'menopause_age', 'lmp', 'interval_cycle', 'period_duration', 'pads_per_day', 'birth_control_method',
    'gravidity', 'parity', 'delivery_type', 'full_term_count', 'premature_count', 'abortion_count',
    'living_children_count', 'pre_eclampsia', 'medication_treatment', 'management_treatment',
    'chief_complaints', 'diagnosis', 'hpi', 'assessment', 'plan',
    'past_med_surg_history', 'history_present_illness', 'past_med_surge_history'
  ];
  v_result jsonb;
begin
  if p_operation_id is null then
    return jsonb_build_object('outcome', 'validation_failed', 'message', 'operationId is required');
  end if;

  select p.role into v_role from public.profiles p where p.id = (select auth.uid());
  if coalesce(v_role, '') <> 'doctor' then
    return jsonb_build_object('outcome', 'unauthorized');
  end if;

  select * into v_existing from public.applied_operations
  where operation_id = p_operation_id and entity_type = 'consultation' and operation_type = 'update';
  if found then
    return v_existing.result || jsonb_build_object('outcome', 'already_applied');
  end if;

  select revision into v_current_revision from public.consultation where consultation_id = p_consultation_id for update;
  if not found then
    return jsonb_build_object('outcome', 'validation_failed', 'message', 'consultation not found');
  end if;

  if v_current_revision is distinct from p_base_revision then
    return jsonb_build_object('outcome', 'conflict', 'currentRevision', v_current_revision);
  end if;

  for v_key in select jsonb_object_keys(p_payload) loop
    if v_key = any(v_allowed) then
      v_set := v_set || format('%I = %L, ', v_key, p_payload->>v_key);
    end if;
  end loop;

  if v_set = '' then
    return jsonb_build_object('outcome', 'validation_failed', 'message', 'no updatable fields provided');
  end if;
  v_set := left(v_set, length(v_set) - 2);

  begin
    execute format('update public.consultation set %s where consultation_id = %L', v_set, p_consultation_id);
  exception when others then
    return jsonb_build_object('outcome', 'invalid_transition', 'message', sqlerrm);
  end;

  select revision into v_new_revision from public.consultation where consultation_id = p_consultation_id;
  v_result := jsonb_build_object('outcome', 'success', 'serverId', p_consultation_id, 'revision', v_new_revision);

  insert into public.applied_operations (operation_id, entity_type, operation_type, actor_id, server_record_id, result)
  values (p_operation_id, 'consultation', 'update', (select auth.uid()), p_consultation_id, v_result);

  return v_result;
end;
$$;

revoke all on function public.consultation_update(uuid, bigint, integer, jsonb) from public, anon;
grant execute on function public.consultation_update(uuid, bigint, integer, jsonb) to authenticated;

-- consultation_create() also gains the column so a doctor can set it at
-- creation time via the validated path too (INSERT was never blocked by
-- the guard -- this is purely so the RPC accepts the same field the live
-- UI already sends).
create or replace function public.consultation_create(p_operation_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_existing public.applied_operations%rowtype;
  v_id bigint;
  v_result jsonb;
begin
  if p_operation_id is null then
    return jsonb_build_object('outcome', 'validation_failed', 'message', 'operationId is required');
  end if;

  select p.role into v_role from public.profiles p where p.id = (select auth.uid());
  if coalesce(v_role, '') <> 'doctor' then
    return jsonb_build_object('outcome', 'unauthorized');
  end if;

  select * into v_existing from public.applied_operations
  where operation_id = p_operation_id and entity_type = 'consultation' and operation_type = 'create';
  if found then
    return v_existing.result || jsonb_build_object('outcome', 'already_applied');
  end if;

  begin
    insert into public.consultation (
      patient_id, initial_consultation_id, attending_provider,
      family_history, immunization_history, smoking_status, smoking_sticks_per_day, smoking_years,
      drinking_status, drinking_frequency, drinking_years, menarche_age, sexual_onset_age, is_menopause,
      menopause_age, lmp, interval_cycle, period_duration, pads_per_day, birth_control_method,
      gravidity, parity, delivery_type, full_term_count, premature_count, abortion_count,
      living_children_count, pre_eclampsia, medication_treatment, management_treatment,
      chief_complaints, diagnosis, hpi, assessment, plan, past_med_surg_history,
      history_present_illness, past_med_surge_history, follow_up_status
    ) values (
      nullif(p_payload->>'patient_id', '')::bigint,
      nullif(p_payload->>'initial_consultation_id', '')::bigint,
      p_payload->>'attending_provider',
      p_payload->>'family_history', p_payload->>'immunization_history', p_payload->>'smoking_status',
      nullif(p_payload->>'smoking_sticks_per_day', '')::bigint, nullif(p_payload->>'smoking_years', '')::bigint,
      p_payload->>'drinking_status', p_payload->>'drinking_frequency', nullif(p_payload->>'drinking_years', '')::bigint,
      nullif(p_payload->>'menarche_age', '')::bigint, nullif(p_payload->>'sexual_onset_age', '')::bigint,
      p_payload->>'is_menopause', nullif(p_payload->>'menopause_age', '')::bigint, p_payload->>'lmp',
      p_payload->>'interval_cycle', p_payload->>'period_duration', nullif(p_payload->>'pads_per_day', '')::bigint,
      p_payload->>'birth_control_method', nullif(p_payload->>'gravidity', '')::bigint, nullif(p_payload->>'parity', '')::bigint,
      p_payload->>'delivery_type', nullif(p_payload->>'full_term_count', '')::bigint, nullif(p_payload->>'premature_count', '')::bigint,
      nullif(p_payload->>'abortion_count', '')::bigint, nullif(p_payload->>'living_children_count', '')::bigint,
      p_payload->>'pre_eclampsia', p_payload->>'medication_treatment', p_payload->>'management_treatment',
      p_payload->>'chief_complaints', p_payload->>'diagnosis', p_payload->>'hpi', p_payload->>'assessment', p_payload->>'plan',
      p_payload->>'past_med_surg_history', p_payload->>'history_present_illness', p_payload->>'past_med_surge_history',
      coalesce(p_payload->>'follow_up_status', 'pending')
    )
    returning consultation_id into v_id;
  exception when others then
    return jsonb_build_object('outcome', 'validation_failed', 'message', sqlerrm);
  end;

  v_result := jsonb_build_object('outcome', 'success', 'serverId', v_id, 'revision', 1);

  insert into public.applied_operations (operation_id, entity_type, operation_type, actor_id, server_record_id, result)
  values (p_operation_id, 'consultation', 'create', (select auth.uid()), v_id, v_result);

  return v_result;
end;
$$;

revoke all on function public.consultation_create(uuid, jsonb) from public, anon;
grant execute on function public.consultation_create(uuid, jsonb) to authenticated;
