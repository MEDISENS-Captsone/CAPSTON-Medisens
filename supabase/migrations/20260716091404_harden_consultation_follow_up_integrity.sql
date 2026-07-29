set check_function_bodies = off;

create or replace function public.guard_consultation_integrity()
returns trigger
language plpgsql
as $$
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
    ) then
      raise exception 'Consultation update includes fields outside the doctor workflow';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_consultation_integrity on public.consultation;
create trigger guard_consultation_integrity
  before insert or update on public.consultation
  for each row
  execute function public.guard_consultation_integrity();

create or replace function public.guard_follow_up_integrity()
returns trigger
language plpgsql
as $$
declare
  consultation_patient_id public.patients.id%type;
begin
  if new.patient_id is null then
    raise exception 'Follow-up records require a patient';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = new.patient_id
  ) then
    raise exception 'Follow-up records require a valid patient';
  end if;

  if new.follow_up_status is not null and new.follow_up_status not in ('pending', 'done') then
    raise exception 'Invalid follow-up status';
  end if;

  if new.consultation_id is not null then
    select c.patient_id
    into consultation_patient_id
    from public.consultation c
    where c.consultation_id = new.consultation_id;

    if not found then
      raise exception 'Follow-up records require a valid consultation';
    end if;

    if consultation_patient_id is distinct from new.patient_id then
      raise exception 'Follow-up patient must match the consultation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.patient_id is distinct from old.patient_id then
      raise exception 'Follow-up patient cannot be changed';
    end if;

    if old.consultation_id is not null and new.consultation_id is distinct from old.consultation_id then
      raise exception 'Follow-up consultation cannot be changed';
    end if;

    if old.follow_up_status = 'done' and new.follow_up_status is distinct from old.follow_up_status then
      raise exception 'Completed follow-up status cannot be changed';
    end if;

    if (
      to_jsonb(new)
        - 'followup_id'
        - 'patient_id'
        - 'consultation_id'
        - 'visit_date'
        - 'visit_time'
        - 'mode_of_transaction'
        - 'mode_of_transfer'
        - 'chief_complaint'
        - 'diagnosis'
        - 'history_of_present_illness'
        - 'bp'
        - 'heart_rate'
        - 'respiratory_rate'
        - 'temperature'
        - 'o2_saturation'
        - 'weight'
        - 'height'
        - 'muac'
        - 'nutritional_status'
        - 'bmi'
        - 'visual_acuity_left'
        - 'visual_acuity_right'
        - 'blood_type'
        - 'general_survey'
        - 'medication_treatment'
        - 'lab_results'
        - 'signature_url'
        - 'follow_up_status'
    ) is distinct from (
      to_jsonb(old)
        - 'followup_id'
        - 'patient_id'
        - 'consultation_id'
        - 'visit_date'
        - 'visit_time'
        - 'mode_of_transaction'
        - 'mode_of_transfer'
        - 'chief_complaint'
        - 'diagnosis'
        - 'history_of_present_illness'
        - 'bp'
        - 'heart_rate'
        - 'respiratory_rate'
        - 'temperature'
        - 'o2_saturation'
        - 'weight'
        - 'height'
        - 'muac'
        - 'nutritional_status'
        - 'bmi'
        - 'visual_acuity_left'
        - 'visual_acuity_right'
        - 'blood_type'
        - 'general_survey'
        - 'medication_treatment'
        - 'lab_results'
        - 'signature_url'
        - 'follow_up_status'
    ) then
      raise exception 'Follow-up update includes fields outside the doctor workflow';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_follow_up_integrity on public.follow_up;
create trigger guard_follow_up_integrity
  before insert or update on public.follow_up
  for each row
  execute function public.guard_follow_up_integrity();
