-- Complete Consultation was previously two separate client-side writes:
--   1) upsertConsultation(...) with status='Completed'
--   2) upsertFollowUpByConsultation(...) (only when a follow-up was requested)
-- If (2) failed after (1) succeeded, the consultation was left permanently
-- "Completed" without its required follow-up, and no way to retry the
-- follow-up half short of manually re-opening the record. This RPC performs
-- both writes in a single Postgres function invocation, which Postgres runs
-- as one transaction: any exception (including a failed follow_up insert)
-- rolls back the consultation write too, so a Completed consultation can
-- never exist without its required follow-up.
--
-- Column lists are enumerated explicitly (mirroring record_initial_intake's
-- pattern) rather than spreading the incoming jsonb directly into the
-- update/insert, so this RPC cannot be used to write columns outside the
-- doctor workflow fields the UI already exposes.
--
-- Idempotency: re-invoking with the same consultation_id is safe. The
-- consultation UPDATE setting status='Completed' a second time is a no-op
-- transition (old.status = new.status = 'Completed'), which
-- guard_consultation_status_update already permits (it only blocks moving
-- OFF of Completed). The follow_up half re-uses the same
-- "update if a row already exists for this consultation_id, else insert"
-- check already used by upsertFollowUpByConsultation, so retries update the
-- same row instead of inserting a duplicate.
create or replace function public.complete_consultation(
  p_consultation_id bigint,
  p_consultation jsonb,
  p_follow_up jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_patient_id public.patients.id%type;
  v_consultation_id bigint;
  v_existing_followup_id bigint;
begin
  select p.role
  into v_role
  from public.profiles p
  where p.id = (select auth.uid());

  if v_role is distinct from 'doctor' then
    raise exception 'Completing a consultation is restricted to doctors' using errcode = '42501';
  end if;

  v_patient_id := (p_consultation ->> 'patient_id');

  if v_patient_id is null then
    raise exception 'Completing a consultation requires a patient';
  end if;

  if not exists (select 1 from public.patients p where p.id = v_patient_id) then
    raise exception 'Completing a consultation requires a valid patient';
  end if;

  if p_consultation_id is not null then
    if not exists (select 1 from public.consultation c where c.consultation_id = p_consultation_id) then
      raise exception 'Consultation not found';
    end if;

    update public.consultation set
      family_history = p_consultation ->> 'family_history',
      past_med_surge_history = p_consultation ->> 'past_med_surge_history',
      immunization_history = p_consultation ->> 'immunization_history',
      smoking_status = p_consultation ->> 'smoking_status',
      smoking_sticks_per_day = (p_consultation ->> 'smoking_sticks_per_day')::int,
      smoking_years = (p_consultation ->> 'smoking_years')::int,
      drinking_status = p_consultation ->> 'drinking_status',
      drinking_frequency = p_consultation ->> 'drinking_frequency',
      drinking_years = (p_consultation ->> 'drinking_years')::int,
      menarche_age = (p_consultation ->> 'menarche_age')::int,
      sexual_onset_age = (p_consultation ->> 'sexual_onset_age')::int,
      is_menopause = p_consultation ->> 'is_menopause',
      menopause_age = (p_consultation ->> 'menopause_age')::int,
      lmp = p_consultation ->> 'lmp',
      interval_cycle = p_consultation ->> 'interval_cycle',
      period_duration = p_consultation ->> 'period_duration',
      pads_per_day = (p_consultation ->> 'pads_per_day')::int,
      birth_control_method = p_consultation ->> 'birth_control_method',
      gravidity = (p_consultation ->> 'gravidity')::int,
      parity = (p_consultation ->> 'parity')::int,
      delivery_type = p_consultation ->> 'delivery_type',
      full_term_count = (p_consultation ->> 'full_term_count')::int,
      premature_count = (p_consultation ->> 'premature_count')::int,
      abortion_count = (p_consultation ->> 'abortion_count')::int,
      living_children_count = (p_consultation ->> 'living_children_count')::int,
      pre_eclampsia = p_consultation ->> 'pre_eclampsia',
      medication_treatment = p_consultation ->> 'medication_treatment',
      management_treatment = p_consultation ->> 'management_treatment',
      assessment = p_consultation ->> 'assessment',
      plan = p_consultation ->> 'plan',
      attending_provider = p_consultation ->> 'attending_provider',
      chief_complaints = p_consultation ->> 'chief_complaints',
      diagnosis = p_consultation ->> 'diagnosis',
      hpi = p_consultation ->> 'hpi',
      status = 'Completed',
      completed_at = coalesce(completed_at, now())
    where consultation_id = p_consultation_id;

    v_consultation_id := p_consultation_id;
  else
    insert into public.consultation (
      patient_id, initial_consultation_id,
      family_history, past_med_surge_history, immunization_history,
      smoking_status, smoking_sticks_per_day, smoking_years,
      drinking_status, drinking_frequency, drinking_years,
      menarche_age, sexual_onset_age, is_menopause, menopause_age, lmp,
      interval_cycle, period_duration, pads_per_day, birth_control_method,
      gravidity, parity, delivery_type, full_term_count, premature_count,
      abortion_count, living_children_count, pre_eclampsia,
      medication_treatment, management_treatment, assessment, plan,
      attending_provider, chief_complaints, diagnosis, hpi,
      status, completed_at
    ) values (
      v_patient_id, (p_consultation ->> 'initial_consultation_id')::bigint,
      p_consultation ->> 'family_history', p_consultation ->> 'past_med_surge_history', p_consultation ->> 'immunization_history',
      p_consultation ->> 'smoking_status', (p_consultation ->> 'smoking_sticks_per_day')::int, (p_consultation ->> 'smoking_years')::int,
      p_consultation ->> 'drinking_status', p_consultation ->> 'drinking_frequency', (p_consultation ->> 'drinking_years')::int,
      (p_consultation ->> 'menarche_age')::int, (p_consultation ->> 'sexual_onset_age')::int, p_consultation ->> 'is_menopause', (p_consultation ->> 'menopause_age')::int, p_consultation ->> 'lmp',
      p_consultation ->> 'interval_cycle', p_consultation ->> 'period_duration', (p_consultation ->> 'pads_per_day')::int, p_consultation ->> 'birth_control_method',
      (p_consultation ->> 'gravidity')::int, (p_consultation ->> 'parity')::int, p_consultation ->> 'delivery_type', (p_consultation ->> 'full_term_count')::int, (p_consultation ->> 'premature_count')::int,
      (p_consultation ->> 'abortion_count')::int, (p_consultation ->> 'living_children_count')::int, p_consultation ->> 'pre_eclampsia',
      p_consultation ->> 'medication_treatment', p_consultation ->> 'management_treatment', p_consultation ->> 'assessment', p_consultation ->> 'plan',
      p_consultation ->> 'attending_provider', p_consultation ->> 'chief_complaints', p_consultation ->> 'diagnosis', p_consultation ->> 'hpi',
      'Completed', now()
    )
    returning consultation_id into v_consultation_id;
  end if;

  if p_follow_up is not null then
    select f.followup_id into v_existing_followup_id
    from public.follow_up f
    where f.consultation_id = v_consultation_id;

    if v_existing_followup_id is not null then
      update public.follow_up set
        visit_date = p_follow_up ->> 'visit_date',
        visit_time = p_follow_up ->> 'visit_time',
        mode_of_transaction = p_follow_up ->> 'mode_of_transaction',
        mode_of_transfer = p_follow_up ->> 'mode_of_transfer',
        chief_complaint = p_follow_up ->> 'chief_complaint',
        diagnosis = p_follow_up ->> 'diagnosis',
        history_of_present_illness = p_follow_up ->> 'history_of_present_illness',
        bp = p_follow_up ->> 'bp',
        heart_rate = (p_follow_up ->> 'heart_rate')::int,
        respiratory_rate = (p_follow_up ->> 'respiratory_rate')::int,
        temperature = (p_follow_up ->> 'temperature')::numeric,
        o2_saturation = (p_follow_up ->> 'o2_saturation')::int,
        weight = (p_follow_up ->> 'weight')::numeric,
        height = (p_follow_up ->> 'height')::numeric,
        muac = (p_follow_up ->> 'muac')::numeric,
        nutritional_status = p_follow_up ->> 'nutritional_status',
        bmi = (p_follow_up ->> 'bmi')::numeric,
        visual_acuity_left = p_follow_up ->> 'visual_acuity_left',
        visual_acuity_right = p_follow_up ->> 'visual_acuity_right',
        blood_type = p_follow_up ->> 'blood_type',
        general_survey = p_follow_up ->> 'general_survey',
        medication_treatment = p_follow_up ->> 'medication_treatment',
        lab_results = p_follow_up ->> 'lab_results',
        signature_url = p_follow_up ->> 'signature_url',
        follow_up_status = coalesce(p_follow_up ->> 'follow_up_status', 'pending')
      where consultation_id = v_consultation_id;
    else
      insert into public.follow_up (
        patient_id, consultation_id, visit_date, visit_time,
        mode_of_transaction, mode_of_transfer, chief_complaint, diagnosis,
        history_of_present_illness, bp, heart_rate, respiratory_rate,
        temperature, o2_saturation, weight, height, muac, nutritional_status,
        bmi, visual_acuity_left, visual_acuity_right, blood_type,
        general_survey, medication_treatment, lab_results, signature_url,
        follow_up_status
      ) values (
        v_patient_id, v_consultation_id, p_follow_up ->> 'visit_date', p_follow_up ->> 'visit_time',
        p_follow_up ->> 'mode_of_transaction', p_follow_up ->> 'mode_of_transfer', p_follow_up ->> 'chief_complaint', p_follow_up ->> 'diagnosis',
        p_follow_up ->> 'history_of_present_illness', p_follow_up ->> 'bp', (p_follow_up ->> 'heart_rate')::int, (p_follow_up ->> 'respiratory_rate')::int,
        (p_follow_up ->> 'temperature')::numeric, (p_follow_up ->> 'o2_saturation')::int, (p_follow_up ->> 'weight')::numeric, (p_follow_up ->> 'height')::numeric, (p_follow_up ->> 'muac')::numeric, p_follow_up ->> 'nutritional_status',
        (p_follow_up ->> 'bmi')::numeric, p_follow_up ->> 'visual_acuity_left', p_follow_up ->> 'visual_acuity_right', p_follow_up ->> 'blood_type',
        p_follow_up ->> 'general_survey', p_follow_up ->> 'medication_treatment', p_follow_up ->> 'lab_results', p_follow_up ->> 'signature_url',
        coalesce(p_follow_up ->> 'follow_up_status', 'pending')
      );
    end if;
  end if;

  return v_consultation_id;
end;
$$;

grant execute on function public.complete_consultation(bigint, jsonb, jsonb) to authenticated;
