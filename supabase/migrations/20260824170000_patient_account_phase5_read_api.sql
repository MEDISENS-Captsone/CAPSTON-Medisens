-- Patient Account Phase 5: patient-safe read API RPCs (docs/patientAccount.md §11.1).
--
-- No existing clinical table, policy, or trigger is touched. No patient-facing
-- RLS policy is added to any clinical table (§11.1's own reasoning: those rows
-- carry staff-only columns, so a row-level grant would leak them the moment
-- anyone wrote `select *`). Every RPC below is a SECURITY DEFINER function
-- that: resolves the caller via auth.uid(), calls patient_portal_can_access()
-- (Phase 2) and raises if false, selects only whitelisted columns, applies
-- the release gates from §7.2, writes an audit row, and returns opaque
-- tokens instead of raw consultation_id/labresult_id/labrequest_id values.
--
-- Live schema re-confirmed via the PostgREST OpenAPI document (read-only,
-- service-role) before writing this migration -- see column lists below;
-- consultation has no `remarks`/`doctor_name` column in the live schema
-- (only `attending_provider`), and lab_request carries seven additional
-- is_* flags (clinical_microscopy/blood_chemistry/pregnancy_test/
-- hbsag_screening/hiv_screening/parasitology/dengue_rdt) beyond the twelve
-- itemization.ts already knows about.

create extension if not exists pgcrypto with schema extensions;

-- Resolve gen_random_bytes/hmac by search_path rather than hard-qualifying
-- them to `extensions.` -- pgcrypto may already be installed in a
-- different schema on this project (CREATE EXTENSION IF NOT EXISTS is a
-- no-op when it is, and does not relocate it), so unqualified calls under
-- this session's search_path are the portable choice. All function
-- definitions below carry the same search_path explicitly.
set search_path = public, extensions, pg_catalog;

-- ============================================================
-- Opaque record tokens (§13 R4)
-- ============================================================
--
-- A one-row secret table, same isolation pattern as
-- patient_activation_codes/patient_otp_challenges: RLS enabled, zero
-- policies for any client role, so only a SECURITY DEFINER function
-- (which bypasses RLS as the owning role) can ever read it. Keeping the
-- secret in a table rather than embedded in function source matters
-- because pg_proc.prosrc is not access-controlled -- any authenticated
-- role can read a function's SQL body, so a literal secret in the
-- function definition would not actually be secret.

create table public.patient_portal_token_secret (
  id boolean primary key default true,
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  constraint patient_portal_token_secret_singleton check (id)
);

insert into public.patient_portal_token_secret default values;

alter table public.patient_portal_token_secret enable row level security;
revoke all on public.patient_portal_token_secret from public, anon, authenticated;

create or replace function public.patient_portal_record_token(p_type text, p_id bigint, p_patient_id bigint)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
  select encode(
    hmac(
      p_type || ':' || p_id::text || ':' || p_patient_id::text,
      (select secret from public.patient_portal_token_secret limit 1),
      'sha256'
    ),
    'hex'
  );
$$;

-- Deliberately not granted to authenticated/anon/PUBLIC -- only ever
-- called from inside the other SECURITY DEFINER functions below, which
-- execute as this function's owner regardless of the original caller.
revoke execute on function public.patient_portal_record_token(text, bigint, bigint) from PUBLIC, anon, authenticated;

-- ============================================================
-- Shared audit helper
-- ============================================================

create or replace function public.patient_portal_write_audit(
  p_action text,
  p_patient_id bigint,
  p_record_type text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_account record;
begin
  select a.id, a.medisens_id
  into v_account
  from public.patient_accounts a
  where a.auth_user_id = (select auth.uid());

  if not found then
    return;
  end if;

  insert into public.audit_logs (user_id, user_name, user_role, action, module, record_id, record_type, description, metadata)
  values (
    null,
    v_account.medisens_id,
    'patient',
    p_action,
    'Patient Portal',
    v_account.id::text,
    p_record_type,
    p_description,
    jsonb_build_object('account_id', v_account.id, 'patient_id', p_patient_id)
  );
end;
$$;

revoke execute on function public.patient_portal_write_audit(text, bigint, text, text) from PUBLIC, anon, authenticated;

-- ============================================================
-- 1. patient_portal_my_records()
-- ============================================================
-- Same shape Phase 4's temporary direct-table guard already reads under
-- RLS; this is the audited, proper replacement for it. patient_id is
-- returned as-is (not tokenised) because it is already how the caller
-- addresses every other RPC below, exactly like the already-deployed
-- patient_portal_can_access/patient_portal_scope (Phase 2) -- the opaque-
-- token requirement is for record-level ids (consultation/lab result),
-- not the patient_id parameter itself.

create or replace function public.patient_portal_my_records()
returns table (
  grant_id uuid,
  patient_id bigint,
  relationship text,
  scope text,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select g.id, g.patient_id, g.relationship, g.scope, g.granted_at
  from public.patient_access_grants g
  join public.patient_accounts a on a.id = g.account_id
  where a.auth_user_id = (select auth.uid())
    and a.status = 'active'
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now());
$$;

revoke execute on function public.patient_portal_my_records() from PUBLIC, anon;
grant execute on function public.patient_portal_my_records() to authenticated;

-- ============================================================
-- 2. patient_portal_profile(p_patient_id)
-- ============================================================
-- Straight §7.1 whitelist from patients. No archive_*, no relative*
-- (third-party data, §7.4), no philhealth/consent internals beyond the
-- two whitelisted fields.

create or replace function public.patient_portal_profile(p_patient_id bigint)
returns jsonb
language plpgsql
stable
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

revoke execute on function public.patient_portal_profile(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_profile(bigint) to authenticated;

-- ============================================================
-- 3. patient_portal_visits / patient_portal_visit_detail
-- ============================================================
-- A "visit" is keyed on the doctor consultation when one exists
-- (consultation.initial_consultation_id links it back), otherwise on the
-- standalone initial_consultation row -- the same collapsing rule as
-- §9.2, so a single day's intake + doctor consultation never renders as
-- two visits.

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
stable
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

revoke execute on function public.patient_portal_visits(bigint, int, int) from PUBLIC, anon;
grant execute on function public.patient_portal_visits(bigint, int, int) to authenticated;

create or replace function public.patient_portal_visit_detail(p_patient_id bigint, p_visit_token text)
returns jsonb
language plpgsql
stable
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

revoke execute on function public.patient_portal_visit_detail(bigint, text) from PUBLIC, anon;
grant execute on function public.patient_portal_visit_detail(bigint, text) to authenticated;

-- ============================================================
-- 4. patient_portal_medicines(p_patient_id)
-- ============================================================
-- rx_content is parsed here, not trusted from any prior client-side
-- parse. Malformed content (mirrors prescriptionParser.ts's own
-- "malformed" branch) never raises -- it returns malformed:true so a
-- caller renders the friendly §9.3 message instead of a parser/DB error.

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
stable
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

revoke execute on function public.patient_portal_medicines(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_medicines(bigint) to authenticated;

-- ============================================================
-- 5. patient_portal_lab_results / patient_portal_lab_result_detail
-- ============================================================
-- Released results only (status = 'Completed'); pending requests appear
-- as safe metadata with no values. STANDARD scope excludes the
-- hivScreening/hbsagScreening findings groups entirely -- and, for
-- pending requests, excludes those same categories from the "requested
-- tests" list too, so a STANDARD-scope caregiver/guardian session never
-- learns a sensitive test was even requested (§7.3, §7.5).

create or replace function public.patient_portal_lab_results(p_patient_id bigint)
returns table (
  kind text,               -- 'released' | 'pending'
  result_token text,       -- set only for kind = 'released'
  test_date date,
  performed_by text
)
language plpgsql
stable
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

revoke execute on function public.patient_portal_lab_results(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_lab_results(bigint) to authenticated;

create or replace function public.patient_portal_lab_result_detail(p_patient_id bigint, p_result_token text)
returns jsonb
language plpgsql
stable
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
      -- Only known, whitelisted group keys are ever rendered -- unknown
      -- keys (and generalNotes, pending D-3) are dropped silently, never
      -- surfaced as raw JSON.
      continue when not (v_group_key = any(v_known_keys));
      -- STANDARD scope: sensitive groups are omitted entirely, not
      -- redacted -- no trace that they exist.
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

revoke execute on function public.patient_portal_lab_result_detail(bigint, text) from PUBLIC, anon;
grant execute on function public.patient_portal_lab_result_detail(bigint, text) to authenticated;

-- ============================================================
-- 6. patient_portal_vaccinations(p_patient_id)
-- ============================================================
-- Mirrors src/features/patients/itemization.ts's normalizeVaccineRecords,
-- including the legacy bcg_date synthesis, without importing that TS
-- module (SQL cannot). Reads fhsis_logs but writes nothing -- the FHSIS
-- workspaces and vaccineService.ts are untouched.

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
stable
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

revoke execute on function public.patient_portal_vaccinations(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_vaccinations(bigint) to authenticated;

-- ============================================================
-- 7. patient_portal_follow_ups(p_patient_id)
-- ============================================================

create or replace function public.patient_portal_follow_ups(p_patient_id bigint)
returns table (
  follow_up_token text,
  visit_date date,
  reason text,
  diagnosis text,
  status text
)
language plpgsql
stable
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

revoke execute on function public.patient_portal_follow_ups(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_follow_ups(bigint) to authenticated;

-- ============================================================
-- 8. patient_portal_access_list(p_patient_id)
-- ============================================================
-- Mirrors the patient_access_grants RLS "self holder" policy from Phase
-- 2/2-correction: only a caller who holds an active SELF grant on this
-- patient may see the full grant list.

create or replace function public.patient_portal_access_list(p_patient_id bigint)
returns table (
  grant_id uuid,
  relationship text,
  granted_at timestamptz,
  revocable boolean
)
language plpgsql
stable
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

revoke execute on function public.patient_portal_access_list(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_access_list(bigint) to authenticated;

-- ============================================================
-- 9. patient_portal_recent_access(p_patient_id)
-- ============================================================
-- Portal-origin rows only (module = 'Patient Portal'), never staff
-- activity (D-7). actor_label distinguishes "you" from another
-- authorized account without fabricating a name neither party has
-- consented to share through this endpoint.

create or replace function public.patient_portal_recent_access(p_patient_id bigint, p_limit int default 20, p_offset int default 0)
returns table (
  actor_label text,
  action text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_caller_account_id uuid;
begin
  if not public.patient_portal_is_self_holder(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  select a.id into v_caller_account_id
  from public.patient_accounts a
  where a.auth_user_id = (select auth.uid());

  return query
  select
    case when (al.metadata ->> 'account_id')::uuid = v_caller_account_id then 'You' else 'Another authorized account' end as actor_label,
    al.action,
    al.created_at
  from public.audit_logs al
  where al.module = 'Patient Portal'
    and (al.metadata ->> 'patient_id')::bigint = p_patient_id
  order by al.created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.patient_portal_recent_access(bigint, int, int) from PUBLIC, anon;
grant execute on function public.patient_portal_recent_access(bigint, int, int) to authenticated;

-- ============================================================
-- 10. patient_portal_home(p_patient_id)
-- ============================================================
-- The §9.1 attention items, as one JSON object rather than a bespoke
-- table shape -- Phase 8/6 UI is not built here, so this stays a plain,
-- directly-testable aggregate rather than guessing the eventual client
-- contract in more detail than the blueprint specifies.

create or replace function public.patient_portal_home(p_patient_id bigint)
returns jsonb
language plpgsql
stable
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

revoke execute on function public.patient_portal_home(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_home(bigint) to authenticated;

-- ============================================================
-- Assertions
-- ============================================================

do $$
declare
  v_missing text;
begin
  select string_agg(expected, ', ')
  into v_missing
  from unnest(array[
    'patient_portal_my_records', 'patient_portal_profile', 'patient_portal_visits',
    'patient_portal_visit_detail', 'patient_portal_medicines', 'patient_portal_lab_results',
    'patient_portal_lab_result_detail', 'patient_portal_vaccinations', 'patient_portal_follow_ups',
    'patient_portal_access_list', 'patient_portal_recent_access', 'patient_portal_home'
  ]) as expected
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = expected
  );

  if v_missing is not null then
    raise exception 'Patient Account Phase 5 is missing expected RPC(s): %', v_missing;
  end if;

  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name like 'patient_portal_%'
      and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'A patient_portal_%% function is executable by anon/PUBLIC';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'patient_portal_token_secret'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'patient_portal_token_secret must not be readable by any client role';
  end if;
end;
$$;
