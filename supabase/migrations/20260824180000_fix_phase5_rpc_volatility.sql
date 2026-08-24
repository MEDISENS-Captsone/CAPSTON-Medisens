-- Patient Account Phase 5 correction: fix STABLE-vs-write conflict
-- (does not edit 20260824170000_patient_account_phase5_read_api.sql).
--
-- Live-gate finding: every read RPC that calls
-- patient_portal_write_audit() (an INSERT) was declared STABLE. PostgREST
-- runs STABLE/IMMUTABLE-declared functions in a read-only transaction, so
-- the nested audit INSERT failed with Postgres 25006 "cannot execute
-- INSERT in a read-only transaction" -- breaking patient_portal_profile,
-- _visits, _visit_detail, _medicines, _lab_results, _lab_result_detail,
-- _vaccinations, _follow_ups, _access_list, and _home outright.
-- patient_portal_can_access/_scope (Phase 2) and patient_portal_
-- record_token/_my_records/_recent_access (Phase 5) never call the audit
-- helper and were correctly unaffected.
--
-- Fix: redeclare the ten affected functions as VOLATILE (the default --
-- simply omitting the `stable` keyword), via CREATE OR REPLACE FUNCTION.
-- Bodies, whitelists, authorization checks, and audit calls are
-- byte-identical to 20260824170000; only the volatility category changes,
-- because these functions do, correctly, write (an audit row) on every
-- call and must not claim otherwise.

create or replace function public.patient_portal_profile(p_patient_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  select jsonb_build_object(
    'firstName', p."firstName",
    'middleName', p."middleName",
    'lastName', p."lastName",
    'suffix', p.suffix,
    'birthday', p.birthday,
    'age', p.age,
    'sex', p.sex,
    'civilStatus', p."civilStatus",
    'address', p.address,
    'contactNumber', p."contactNumber",
    'bloodType', p."bloodType",
    'philhealthNo', p."philhealthNo",
    'philhealthStatus', p."philhealthStatus"
  )
  into v_result
  from public.patients p
  where p.id = p_patient_id;

  perform public.patient_portal_write_audit('view', p_patient_id, 'patient_account', 'Viewed profile.');

  return v_result;
end;
$$;

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
      coalesce(c.consultation_date, null)::date as visit_date,
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
    (select min(fu.visit_date) from public.follow_up fu where fu.consultation_id = v.consultation_id and coalesce(fu.follow_up_status, '') <> 'done') as follow_up_date
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

  select c.consultation_id, c.consultation_date, c.chief_complaints, c.diagnosis, c.plan,
         c.management_treatment, c.attending_provider, ic.chief_complaint as ic_chief_complaint,
         ic.diagnosis as ic_diagnosis
  into v_consultation
  from public.consultation c
  left join public.initial_consultation ic on ic.initialconsultation_id = c.initial_consultation_id
  where c.patient_id = p_patient_id
    and public.patient_portal_record_token('visit-c', c.consultation_id, p_patient_id) = p_visit_token;

  if found then
    v_result := jsonb_build_object(
      'visitDate', v_consultation.consultation_date,
      'reason', coalesce(nullif(btrim(v_consultation.chief_complaints), ''), nullif(btrim(v_consultation.ic_chief_complaint), '')),
      'diagnosis', coalesce(nullif(btrim(v_consultation.diagnosis), ''), nullif(btrim(v_consultation.ic_diagnosis), '')),
      'recommendation', coalesce(nullif(btrim(v_consultation.plan), ''), nullif(btrim(v_consultation.management_treatment), '')),
      'attendingProvider', v_consultation.attending_provider,
      'medicineCount', (select count(*)::int from public.prescription rx where rx.consultation_id = v_consultation.consultation_id),
      'labCount', (select count(*)::int from public.lab_result lr where lr.consultation_id = v_consultation.consultation_id and lr.status = 'Completed'),
      'followUpDate', (select min(fu.visit_date) from public.follow_up fu where fu.consultation_id = v_consultation.consultation_id and coalesce(fu.follow_up_status, '') <> 'done')
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
    prescribed_date := rec.prescription_date;
    doctor_name := rec.doctor_name;
    medications := v_parsed;
    malformed := v_malformed;
    claimed := (rec.status = 'Dispensed');
    claimed_date := rec.dispensed_at::date;
    return next;
  end loop;
end;
$$;

create or replace function public.patient_portal_lab_results(p_patient_id bigint)
returns table (
  kind text,
  result_token text,
  test_date date,
  performed_by text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed lab results list.');

  return query
  select
    'released'::text as kind,
    public.patient_portal_record_token('lab-result', lr.labresult_id, p_patient_id) as result_token,
    lr.date_performed::date as test_date,
    lr.performed_by as performed_by
  from public.lab_result lr
  where lr.patient_id = p_patient_id
    and lr.status = 'Completed'

  union all

  select
    'pending'::text as kind,
    null::text as result_token,
    lreq.request_date::date as test_date,
    null::text as performed_by
  from public.lab_request lreq
  where lreq.patient_id = p_patient_id
    and coalesce(lreq.status, 'Pending') <> 'Completed'

  order by test_date desc nulls last;
end;
$$;

create or replace function public.patient_portal_lab_result_detail(p_patient_id bigint, p_result_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rec record;
  v_scope text;
  v_findings jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_group_key text;
  v_group_value jsonb;
  v_test_key text;
  v_test_value jsonb;
  v_test_entries jsonb;
  v_range record;
  v_sensitive_keys text[] := array['hivScreening', 'hbsagScreening'];
  v_known_keys text[] := array['clinicalMicroscopy', 'bloodChemistry', 'pregnancyTest', 'hbsagScreening', 'hivScreening', 'parasitology', 'dengueRdt'];
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  v_scope := public.patient_portal_scope(p_patient_id);

  select lr.labresult_id, lr.date_performed, lr.performed_by, lr.findings
  into rec
  from public.lab_result lr
  where lr.patient_id = p_patient_id
    and lr.status = 'Completed'
    and public.patient_portal_record_token('lab-result', lr.labresult_id, p_patient_id) = p_result_token;

  if not found then
    raise exception 'Lab result not found.';
  end if;

  begin
    v_findings := rec.findings::jsonb;
  exception when others then
    v_findings := null;
  end;

  if v_findings is not null and jsonb_typeof(v_findings) = 'object' then
    for v_group_key in select jsonb_object_keys(v_findings)
    loop
      continue when not (v_group_key = any(v_known_keys));
      continue when v_scope is distinct from 'FULL' and v_group_key = any(v_sensitive_keys);

      v_group_value := v_findings -> v_group_key;
      continue when v_group_value is null or jsonb_typeof(v_group_value) <> 'object';

      v_test_entries := '[]'::jsonb;
      for v_test_key in select jsonb_object_keys(v_group_value)
      loop
        v_test_value := v_group_value -> v_test_key;

        select rr.unit, rr.range_low, rr.range_high, rr.range_text
        into v_range
        from public.patient_portal_reference_ranges rr
        where rr.group_key = v_group_key
          and rr.test_key = v_test_key
          and rr.active = true
        limit 1;

        v_test_entries := v_test_entries || jsonb_build_array(jsonb_build_object(
          'testKey', v_test_key,
          'value', v_test_value,
          'unit', v_range.unit,
          'rangeLow', v_range.range_low,
          'rangeHigh', v_range.range_high,
          'rangeText', v_range.range_text
        ));

        v_range := null;
      end loop;

      v_groups := v_groups || jsonb_build_array(jsonb_build_object('groupKey', v_group_key, 'tests', v_test_entries));
    end loop;
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed lab result detail.');

  return jsonb_build_object(
    'testDate', rec.date_performed,
    'performedBy', rec.performed_by,
    'groups', v_groups
  );
end;
$$;

create or replace function public.patient_portal_vaccinations(p_patient_id bigint)
returns table (
  vaccine_name text,
  vaccine_category text,
  dose_label text,
  date_given date,
  next_due_date date,
  facility text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_log record;
  v_fields jsonb;
  v_records jsonb;
  v_rec jsonb;
  v_has_bcg boolean := false;
begin
  if not public.patient_portal_can_access(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, null, 'Viewed vaccinations.');

  for v_log in
    select fl.data_fields
    from public.fhsis_logs fl
    where fl.patient_id = p_patient_id
      and fl.category = 'vaccination'
  loop
    v_has_bcg := false;
    v_fields := coalesce(v_log.data_fields, '{}'::jsonb);
    v_records := coalesce(v_fields -> 'vaccine_records', '[]'::jsonb);

    if jsonb_typeof(v_records) = 'array' then
      for v_rec in select * from jsonb_array_elements(v_records)
      loop
        continue when nullif(btrim(coalesce(v_rec ->> 'vaccine_name', '')), '') is null;

        if lower(v_rec ->> 'vaccine_name') = 'bcg' then
          v_has_bcg := true;
        end if;

        vaccine_name := v_rec ->> 'vaccine_name';
        vaccine_category := v_rec ->> 'vaccine_category';
        dose_label := v_rec ->> 'dose_label';
        date_given := nullif(v_rec ->> 'date_given', '')::date;
        next_due_date := nullif(v_rec ->> 'next_due_date', '')::date;
        facility := v_rec ->> 'facility';
        return next;
      end loop;
    end if;

    if not v_has_bcg and nullif(btrim(coalesce(v_fields ->> 'bcg_date', '')), '') is not null then
      vaccine_name := 'BCG';
      vaccine_category := 'Child Care / Core RHU Immunization';
      dose_label := 'Birth dose';
      date_given := nullif(v_fields ->> 'bcg_date', '')::date;
      next_due_date := null;
      facility := null;
      return next;
    end if;
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
    fu.visit_date,
    nullif(btrim(fu.chief_complaint), '') as reason,
    nullif(btrim(fu.diagnosis), '') as diagnosis,
    coalesce(nullif(fu.follow_up_status, ''), 'Scheduled') as status
  from public.follow_up fu
  where fu.patient_id = p_patient_id
  order by fu.visit_date desc nulls last;
end;
$$;

create or replace function public.patient_portal_access_list(p_patient_id bigint)
returns table (
  grant_id uuid,
  relationship text,
  granted_at timestamptz,
  revocable boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.patient_portal_is_self_holder(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, 'patient_access_grant', 'Viewed access list.');

  return query
  select g.id, g.relationship, g.granted_at, (g.relationship = 'AUTHORIZED_CAREGIVER') as revocable
  from public.patient_access_grants g
  where g.patient_id = p_patient_id
    and g.revoked_at is null
  order by g.granted_at asc;
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

  select fu.visit_date, nullif(btrim(fu.chief_complaint), '') as reason
  into v_next_follow_up
  from public.follow_up fu
  where fu.patient_id = p_patient_id
    and fu.visit_date >= current_date
    and coalesce(fu.follow_up_status, '') <> 'done'
  order by fu.visit_date asc
  limit 1;

  select lr.date_performed
  into v_recent_lab
  from public.lab_result lr
  where lr.patient_id = p_patient_id
    and lr.status = 'Completed'
    and lr.date_performed >= (current_date - interval '30 days')
  order by lr.date_performed desc
  limit 1;

  select rx.prescription_date
  into v_recent_medicine
  from public.prescription rx
  where rx.patient_id = p_patient_id
    and rx.prescription_date >= (current_date - interval '30 days')
  order by rx.prescription_date desc
  limit 1;

  select c.consultation_date as visit_date, nullif(btrim(c.diagnosis), '') as diagnosis
  into v_last_visit
  from public.consultation c
  where c.patient_id = p_patient_id
  order by c.consultation_date desc
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

-- Grants/revokes are unchanged by CREATE OR REPLACE FUNCTION (they were
-- already set correctly by 20260824170000 and are not touched here).

do $$
declare
  v_still_stable text;
begin
  select string_agg(p.proname, ', ')
  into v_still_stable
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'patient_portal_profile', 'patient_portal_visits', 'patient_portal_visit_detail',
      'patient_portal_medicines', 'patient_portal_lab_results', 'patient_portal_lab_result_detail',
      'patient_portal_vaccinations', 'patient_portal_follow_ups', 'patient_portal_access_list',
      'patient_portal_home'
    )
    and p.provolatile = 's';

  if v_still_stable is not null then
    raise exception 'These Patient Portal RPCs must not be STABLE (they write audit rows): %', v_still_stable;
  end if;
end;
$$;
