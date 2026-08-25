-- Offline Sync Phase O2A.1: consultation integrity-guard drift fix.
--
-- Live verification during O2A found guard_consultation_integrity()'s
-- whole-row diff exclusion list predates 5 columns that exist on the
-- live `consultation` table today:
--   follow_up_date, follow_up_time, follow_up_status,
--   past_med_surg_history, history_present_illness
-- (ordinal positions 36, 37, 57, 54, 56 -- all added to the table after
-- this trigger function was originally written).
--
-- These 5 are NOT one homogeneous group -- inspecting the live doctor
-- consultation UI/payload (src/app/consultation/index.tsx,
-- buildConsultationPayload()) shows two different situations:
--
--   1. `past_med_surg_history` and `history_present_illness` are
--      correctly-spelled duplicates of two fields the doctor workflow
--      already edits today under different (legacy-misspelled/short)
--      names: `past_med_surge_history` and `hpi`. Same clinical meaning,
--      just a second column. There is no reason to treat the
--      correctly-spelled twin as less editable than the one currently
--      wired up -- both should be ordinary, doctor-editable clinical
--      content, so a future cleanup that switches the app over to the
--      correctly-spelled column is not blocked by this trigger.
--
--   2. `follow_up_date`, `follow_up_time`, and `follow_up_status` on
--      `consultation` are a *different* concept from the columns of the
--      same name on the dedicated `follow_up` table -- grepping the
--      entire frontend confirms no current code path reads or writes
--      these three columns on `consultation` at all; the real follow-up
--      workflow lives entirely in the separate `follow_up` table (with
--      its own guard_follow_up_integrity trigger). These three are
--      vestigial/superseded columns with no legitimate doctor-editing
--      use today. The correct fix is NOT to open them up for editing --
--      it is to make their existing (accidental) immutability
--      intentional and explicit, exactly like patient_id /
--      initial_consultation_id / attending_provider, so a future
--      accidental write is rejected with a clear, specific message
--      instead of falling into the generic "fields outside the doctor
--      workflow" catch-all.
--
-- Not addressed by this migration (found during investigation, out of
-- this ticket's 5-column scope, needs its own follow-up): the
-- misspelled `past_med_surge_history` column that buildConsultationPayload
-- actually writes on every consultation save is ALSO absent from this
-- trigger's exclusion list -- meaning a value change to that specific
-- field going through an UPDATE could already be rejected today by the
-- generic diff check. That is a pre-existing, separate defect from the
-- 5 columns this phase was scoped to fix and is called out here for a
-- dedicated follow-up rather than folded into this change.

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

    -- Explicit, named immutability for the three vestigial follow-up-
    -- shadow columns (see header comment) -- these are not part of the
    -- doctor's editable content set and were never meant to be, so a
    -- change attempt now gets a specific, honest error instead of the
    -- generic catch-all below.
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
        - 'revision'
        - 'updated_at'
    ) then
      raise exception 'Consultation update includes fields outside the doctor workflow';
    end if;
  end if;

  return new;
end;
$function$;

-- The O2A consultation_update() RPC's own allow-list must grow in step
-- with the trigger's -- otherwise the two correctly-spelled/newly-
-- editable columns would pass the guard but still be silently
-- unreachable through the validated write path (the RPC would just
-- never include them in its dynamic SET clause). follow_up_date/
-- follow_up_time/follow_up_status remain deliberately absent, matching
-- their new explicit immutability above.
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
    'past_med_surg_history', 'history_present_illness'
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
