-- Record initial intake and vital signs atomically. Client DELETE access is
-- intentionally absent from these clinical tables, so compensating deletes
-- cannot safely implement rollback after the first insert succeeds.
--
-- This migration may be applied to a schema whose earlier hardening migrations
-- were applied manually. Validate the actual database objects instead of
-- relying on migration-history rows before changing any function or grant.
do $$
declare
  missing_columns text[];
begin
  if to_regclass('public.initial_consultation') is null
     or to_regclass('public.vital_sign') is null
     or to_regclass('public.consultation') is null then
    raise exception 'Intake remediation requires the initial_consultation, vital_sign, and consultation tables';
  end if;

  if to_regprocedure('public.guard_consultation_integrity()') is null then
    raise exception 'Intake remediation requires public.guard_consultation_integrity()';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'public.consultation'::regclass
      and t.tgname = 'guard_consultation_integrity'
      and n.nspname = 'public'
      and p.proname = 'guard_consultation_integrity'
      and not t.tgisinternal
  ) then
    raise exception 'Intake remediation requires the guard_consultation_integrity trigger on public.consultation';
  end if;

  select array_agg(format('public.%I.%I', required.table_name, required.column_name)
                   order by required.table_name, required.column_name)
  into missing_columns
  from (
    values
      ('initial_consultation', 'initialconsultation_id'),
      ('initial_consultation', 'patient_id'),
      ('initial_consultation', 'consultation_date'),
      ('initial_consultation', 'consultation_time'),
      ('initial_consultation', 'mode_of_transaction'),
      ('initial_consultation', 'referred_by'),
      ('initial_consultation', 'mode_of_transfer'),
      ('initial_consultation', 'chief_complaint'),
      ('initial_consultation', 'diagnosis'),
      ('initial_consultation', 'visit_disposition'),
      ('vital_sign', 'patient_id'),
      ('vital_sign', 'initial_consultation_id'),
      ('vital_sign', 'bp'),
      ('vital_sign', 'heart_rate'),
      ('vital_sign', 'respiratory_rate'),
      ('vital_sign', 'temperature'),
      ('vital_sign', 'o2_saturation'),
      ('vital_sign', 'weight'),
      ('vital_sign', 'height'),
      ('vital_sign', 'nutritional_status'),
      ('vital_sign', 'bmi'),
      ('vital_sign', 'visual_acuity_left'),
      ('vital_sign', 'visual_acuity_right'),
      ('vital_sign', 'general_survey')
  ) as required(table_name, column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = required.table_name
   and c.column_name = required.column_name
  where c.column_name is null;

  if missing_columns is not null then
    raise exception 'Intake remediation requires columns: %', array_to_string(missing_columns, ', ');
  end if;
end;
$$;

create or replace function public.record_initial_intake(
  p_initial jsonb,
  p_vitals jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_patient_id public.patients.id%type;
  v_vitals_patient_id public.patients.id%type;
  v_initial_consultation_id bigint;
begin
  select p.role
  into v_role
  from public.profiles p
  where p.id = (select auth.uid());

  if coalesce(v_role, '') not in ('nurse', 'midwives') then
    raise exception 'Initial intake is restricted to nurses and midwives' using errcode = '42501';
  end if;

  v_patient_id := p_initial ->> 'patient_id';
  v_vitals_patient_id := p_vitals ->> 'patient_id';

  if v_patient_id is null or v_vitals_patient_id is distinct from v_patient_id then
    raise exception 'Initial intake and vital signs must reference the same patient';
  end if;

  if not exists (
    select 1 from public.patients p where p.id = v_patient_id
  ) then
    raise exception 'Initial intake requires a valid patient';
  end if;

  insert into public.initial_consultation (
    patient_id,
    consultation_date,
    consultation_time,
    mode_of_transaction,
    referred_by,
    mode_of_transfer,
    chief_complaint,
    diagnosis,
    visit_disposition
  ) values (
    v_patient_id,
    p_initial ->> 'consultation_date',
    p_initial ->> 'consultation_time',
    p_initial ->> 'mode_of_transaction',
    p_initial ->> 'referred_by',
    p_initial ->> 'mode_of_transfer',
    p_initial ->> 'chief_complaint',
    p_initial ->> 'diagnosis',
    p_initial ->> 'visit_disposition'
  )
  returning initialconsultation_id into v_initial_consultation_id;

  insert into public.vital_sign (
    patient_id,
    initial_consultation_id,
    bp,
    heart_rate,
    respiratory_rate,
    temperature,
    o2_saturation,
    weight,
    height,
    nutritional_status,
    bmi,
    visual_acuity_left,
    visual_acuity_right,
    general_survey
  ) values (
    v_patient_id,
    v_initial_consultation_id,
    p_vitals ->> 'bp',
    nullif(p_vitals ->> 'heart_rate', '')::numeric,
    nullif(p_vitals ->> 'respiratory_rate', '')::numeric,
    nullif(p_vitals ->> 'temperature', '')::numeric,
    nullif(p_vitals ->> 'o2_saturation', '')::numeric,
    nullif(p_vitals ->> 'weight', '')::numeric,
    nullif(p_vitals ->> 'height', '')::numeric,
    p_vitals ->> 'nutritional_status',
    nullif(p_vitals ->> 'bmi', '')::numeric,
    p_vitals ->> 'visual_acuity_left',
    p_vitals ->> 'visual_acuity_right',
    p_vitals ->> 'general_survey'
  );

  return v_initial_consultation_id;
end;
$$;

revoke all on function public.record_initial_intake(jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_initial_intake(jsonb, jsonb) to authenticated;

-- Keep the integrity guard restrictive while allowing the two existing Doctor
-- consultation fields that the form already submits on update.
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
        - 'assessment'
        - 'plan'
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
    ) then
      raise exception 'Consultation update includes fields outside the doctor workflow';
    end if;
  end if;

  return new;
end;
$$;
