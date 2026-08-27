-- Doctor Consultation Lifecycle fix: `consultation` has no status/completion
-- field at all today. "Record Consultation" (Step 4/Diagnosis) silently
-- created/updated a `follow_up` row on every click regardless of whether the
-- doctor had chosen to schedule one, then auto-navigated the doctor out of the
-- wizard -- well before Steps 5-7 (Management, Lab Request, E-Prescription)
-- were necessarily done. There was no durable signal for "today's consultation
-- is actually finished," which the new explicit "Complete Consultation" action
-- (Step 7) needs in order to correctly gate follow-up activation.
--
-- Minimal addition: a `status` column (Draft/Completed) and a `completed_at`
-- timestamp, a guard mirroring the existing lab_request completed-state guard
-- (20260716084759_harden_laboratory_state_transitions.sql) so a Completed
-- consultation cannot be silently reverted to Draft, and the two new columns
-- added to guard_consultation_integrity()'s existing field-allowlist so a plain
-- `consultation` UPDATE that sets them is not rejected by that trigger's
-- generic "fields outside the doctor workflow" check.
--
-- guard_consultation_integrity() is recreated here starting from its latest
-- known-good body (20260830110000_o2a2_fix_active_consultation_field_guard.sql)
-- with only `status`/`completed_at` added to both diff-exclusion lists --
-- every other check (patient/initial_consultation immutability, the vestigial
-- follow_up_date/time/status immutability, past_med_surg(e)_history handling)
-- is preserved byte-for-byte from that migration.
--
-- The offline-sync RPCs (consultation_create/consultation_update, O2A) are
-- deliberately NOT touched -- Complete Consultation is an online-only action
-- that writes through the same direct `consultation` table update the doctor
-- UI's existing "Record Consultation"/lab/prescription saves already use
-- (features/consultation/services.ts: upsertConsultation), not through the
-- offline-sync RPC path, so those RPC allowlists are out of this fix's scope.
alter table public.consultation
    add column if not exists status text not null default 'Draft',
    add column if not exists completed_at timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'consultation_status_check'
    ) then
        alter table public.consultation
            add constraint consultation_status_check check (status in ('Draft', 'Completed'));
    end if;
end $$;

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
        - 'status'
        - 'completed_at'
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
        - 'status'
        - 'completed_at'
    ) then
      raise exception 'Consultation update includes fields outside the doctor workflow';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.guard_consultation_status_update()
returns trigger
language plpgsql
as $$
begin
    if old.status = 'Completed' and new.status is distinct from 'Completed' then
        raise exception 'Completed consultations cannot return to Draft';
    end if;
    return new;
end;
$$;

drop trigger if exists guard_consultation_status_update on public.consultation;
create trigger guard_consultation_status_update
    before update on public.consultation
    for each row
    execute function public.guard_consultation_status_update();
