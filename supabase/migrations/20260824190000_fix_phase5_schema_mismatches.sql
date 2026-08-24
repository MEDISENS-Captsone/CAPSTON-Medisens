-- Patient Account Phase 5 correction #2: fix schema-mismatch bugs found
-- by the re-run live gate after the volatility fix (20260824180000).
-- Does not edit either prior Phase 5 migration in place -- both deployed
-- successfully, so per the standing rule this is a new corrective
-- migration.
--
-- Two independent live-schema mismatches, confirmed via
-- information_schema.columns against the linked project:
--
-- 1. `consultation` has NO `consultation_date` (or `created_at`) column
--    in the live schema (only `initial_consultation` does). Every
--    reference to `c.consultation_date` in patient_portal_visits,
--    patient_portal_visit_detail, and patient_portal_home raised
--    Postgres 42703 "column c.consultation_date does not exist" --
--    which, in the gate harness, also broke the *setup* step that
--    inserts a synthetic consultation row with that field, cascading
--    into empty results for medicines/labs (their prescription/lab rows
--    were never created because the consultation insert failed first).
--    Fix: derive a consultation's visit date from its joined
--    initial_consultation row's `consultation_date` (nullable when a
--    consultation has no initial_consultation_id).
--
-- 2. `follow_up.visit_date`, `lab_result.date_performed`, and
--    `prescription.prescription_date` are `text` columns in the live
--    schema, not `date`. Comparing or returning them as `date` without
--    an explicit `::date` cast raised 42804 ("Returned type text does
--    not match expected type date") in patient_portal_follow_ups'
--    RETURN QUERY, and 42883 ("operator does not exist: text >= date")
--    in patient_portal_home's freshness comparisons. Fix: cast
--    explicitly everywhere such a column is compared against a date/
--    interval expression or returned through a typed `date` output
--    column.

create or replace function public.patient_portal_visits(p_patient_id bigint, p_limit int default 10, p_offset int default 0)
returns table (
  visit_token text,
  visit_date date,
  reason text,
  diagnosis text,
  medicine_count int,
  lab_count int,
  follow_up_date date
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed visit list.');

  return query
  with visits as (
    select
      public.patient_portal_record_token('visit-c', c.consultation_id, p_patient_id) as visit_token,
      ic.consultation_date::date as visit_date,
      coalesce(nullif(btrim(c.chief_complaints), ''), nullif(btrim(ic.chief_complaint), '')) as reason,
      coalesce(nullif(btrim(c.diagnosis), ''), nullif(btrim(ic.diagnosis), '')) as diagnosis,
      c.consultation_id as consultation_id
    from public.consultation c
    left join public.initial_consultation ic on ic.initialconsultation_id = c.initial_consultation_id
    where c.patient_id = p_patient_id

    union all

    select
      public.patient_portal_record_token('visit-i', ic.initialconsultation_id, p_patient_id) as visit_token,
      ic.consultation_date::date as visit_date,
      nullif(btrim(ic.chief_complaint), '') as reason,
      nullif(btrim(ic.diagnosis), '') as diagnosis,
      null::bigint as consultation_id
    from public.initial_consultation ic
    where ic.patient_id = p_patient_id
      and not exists (
        select 1 from public.consultation c2
        where c2.initial_consultation_id = ic.initialconsultation_id
      )
  )
  select
    v.visit_token,
    v.visit_date,
    v.reason,
    v.diagnosis,
    (select count(*)::int from public.prescription rx where rx.consultation_id = v.consultation_id) as medicine_count,
    (select count(*)::int from public.lab_result lr where lr.consultation_id = v.consultation_id and lr.status = 'Completed') as lab_count,
    (select min(fu.visit_date::date) from public.follow_up fu where fu.consultation_id = v.consultation_id and coalesce(fu.follow_up_status, '') <> 'done') as follow_up_date
  from visits v
  order by v.visit_date desc nulls last
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.patient_portal_visit_detail(p_patient_id bigint, p_visit_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_consultation record;
  v_initial record;
  v_result jsonb;
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  select c.consultation_id, ic.consultation_date as visit_date, c.chief_complaints, c.diagnosis, c.plan,
         c.management_treatment, c.attending_provider, ic.chief_complaint as ic_chief_complaint,
         ic.diagnosis as ic_diagnosis
  into v_consultation
  from public.consultation c
  left join public.initial_consultation ic on ic.initialconsultation_id = c.initial_consultation_id
  where c.patient_id = p_patient_id
    and public.patient_portal_record_token('visit-c', c.consultation_id, p_patient_id) = p_visit_token;

  if found then
    v_result := jsonb_build_object(
      'visitDate', v_consultation.visit_date,
      'reason', coalesce(nullif(btrim(v_consultation.chief_complaints), ''), nullif(btrim(v_consultation.ic_chief_complaint), '')),
      'diagnosis', coalesce(nullif(btrim(v_consultation.diagnosis), ''), nullif(btrim(v_consultation.ic_diagnosis), '')),
      'recommendation', coalesce(nullif(btrim(v_consultation.plan), ''), nullif(btrim(v_consultation.management_treatment), '')),
      'attendingProvider', v_consultation.attending_provider,
      'medicineCount', (select count(*)::int from public.prescription rx where rx.consultation_id = v_consultation.consultation_id),
      'labCount', (select count(*)::int from public.lab_result lr where lr.consultation_id = v_consultation.consultation_id and lr.status = 'Completed'),
      'followUpDate', (select min(fu.visit_date::date) from public.follow_up fu where fu.consultation_id = v_consultation.consultation_id and coalesce(fu.follow_up_status, '') <> 'done')
    );
    perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed visit detail.');
    return v_result;
  end if;

  select ic.initialconsultation_id, ic.consultation_date, ic.chief_complaint, ic.diagnosis
  into v_initial
  from public.initial_consultation ic
  where ic.patient_id = p_patient_id
    and public.patient_portal_record_token('visit-i', ic.initialconsultation_id, p_patient_id) = p_visit_token;

  if found then
    v_result := jsonb_build_object(
      'visitDate', v_initial.consultation_date,
      'reason', nullif(btrim(v_initial.chief_complaint), ''),
      'diagnosis', nullif(btrim(v_initial.diagnosis), ''),
      'recommendation', null,
      'attendingProvider', null,
      'medicineCount', 0,
      'labCount', 0,
      'followUpDate', null
    );
    perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed visit detail.');
    return v_result;
  end if;

  raise exception 'Visit not found.';
end;
$$;

create or replace function public.patient_portal_medicines(p_patient_id bigint)
returns table (
  prescription_token text,
  prescribed_date date,
  doctor_name text,
  medications jsonb,
  malformed boolean,
  claimed boolean,
  claimed_date date
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rec record;
  v_parsed jsonb;
  v_malformed boolean;
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed medicines.');

  for rec in
    select rx.prescription_id, rx.prescription_date, rx.doctor_name, rx.rx_content, rx.status, rx.dispensed_at
    from public.prescription rx
    where rx.patient_id = p_patient_id
    order by rx.prescription_date desc nulls last
  loop
    v_malformed := false;
    v_parsed := '[]'::jsonb;

    if rec.rx_content is not null then
      begin
        v_parsed := rec.rx_content::jsonb;
        if jsonb_typeof(v_parsed) <> 'array' then
          v_malformed := true;
          v_parsed := '[]'::jsonb;
        end if;
      exception when others then
        v_malformed := true;
        v_parsed := '[]'::jsonb;
      end;
    end if;

    prescription_token := public.patient_portal_record_token('prescription', rec.prescription_id, p_patient_id);
    prescribed_date := rec.prescription_date::date;
    doctor_name := rec.doctor_name;
    medications := v_parsed;
    malformed := v_malformed;
    claimed := (rec.status = 'Dispensed');
    claimed_date := rec.dispensed_at::date;
    return next;
  end loop;
end;
$$;

create or replace function public.patient_portal_follow_ups(p_patient_id bigint)
returns table (
  follow_up_token text,
  visit_date date,
  reason text,
  diagnosis text,
  status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed follow-ups.');

  return query
  select
    public.patient_portal_record_token('follow-up', fu.followup_id, p_patient_id) as follow_up_token,
    fu.visit_date::date as visit_date,
    nullif(btrim(fu.chief_complaint), '') as reason,
    nullif(btrim(fu.diagnosis), '') as diagnosis,
    coalesce(nullif(fu.follow_up_status, ''), 'Scheduled') as status
  from public.follow_up fu
  where fu.patient_id = p_patient_id
  order by fu.visit_date::date desc nulls last;
end;
$$;

create or replace function public.patient_portal_home(p_patient_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_scope text;
  v_next_follow_up record;
  v_recent_lab record;
  v_recent_medicine record;
  v_last_visit record;
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  v_scope := public.patient_portal_scope(p_patient_id);

  select fu.visit_date::date as visit_date, nullif(btrim(fu.chief_complaint), '') as reason
  into v_next_follow_up
  from public.follow_up fu
  where fu.patient_id = p_patient_id
    and fu.visit_date::date >= current_date
    and coalesce(fu.follow_up_status, '') <> 'done'
  order by fu.visit_date::date asc
  limit 1;

  select lr.date_performed::date as date_performed
  into v_recent_lab
  from public.lab_result lr
  where lr.patient_id = p_patient_id
    and lr.status = 'Completed'
    and lr.date_performed::date >= (current_date - interval '30 days')
  order by lr.date_performed::date desc
  limit 1;

  select rx.prescription_date::date as prescription_date
  into v_recent_medicine
  from public.prescription rx
  where rx.patient_id = p_patient_id
    and rx.prescription_date::date >= (current_date - interval '30 days')
  order by rx.prescription_date::date desc
  limit 1;

  select ic.consultation_date::date as visit_date, nullif(btrim(c.diagnosis), '') as diagnosis
  into v_last_visit
  from public.consultation c
  left join public.initial_consultation ic on ic.initialconsultation_id = c.initial_consultation_id
  where c.patient_id = p_patient_id
  order by ic.consultation_date::date desc nulls last
  limit 1;

  perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed Home.');

  return jsonb_build_object(
    'scope', v_scope,
    'nextFollowUpDate', v_next_follow_up.visit_date,
    'recentLabResultDate', v_recent_lab.date_performed,
    'recentMedicineDate', v_recent_medicine.prescription_date,
    'lastVisitDate', v_last_visit.visit_date,
    'lastVisitDiagnosis', v_last_visit.diagnosis
  );
end;
$$;
