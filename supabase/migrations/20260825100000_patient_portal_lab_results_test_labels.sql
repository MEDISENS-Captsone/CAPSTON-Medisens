-- Patient Account Phase 7 correction: patient_portal_lab_results() did not
-- return enough patient-safe information for the Lab Results list to show
-- a meaningful test/group name -- only kind/result_token/test_date/
-- performed_by. This is a genuine Phase 5 read-API contract gap
-- discovered while building the Phase 7 list screen, not a redesign: the
-- fix adds one output column, `test_labels text[]`, derived entirely from
-- data the RPC (and its sibling patient_portal_lab_result_detail) already
-- trusts and already whitelists -- known `lab_result.findings` group keys
-- for released results, and known `lab_request.is_*` test flags for
-- pending ones. Nothing new is read from the database; no existing
-- column, table, RLS policy, or trigger changes.
--
-- Does not edit any already-deployed Phase 5 migration in place -- all
-- three (20260824170000, 20260824180000, 20260824190000) deployed
-- successfully.
--
-- Safety properties preserved:
-- - Released labels: only the same seven known findings group keys
--   patient_portal_lab_result_detail() already whitelists
--   (clinicalMicroscopy, bloodChemistry, pregnancyTest, hbsagScreening,
--   hivScreening, parasitology, dengueRdt). Unknown/future keys and
--   generalNotes never appear -- the whitelist is closed, not a
--   blocklist. Malformed/plain-text `findings` (text, not valid JSON, or
--   valid JSON but not a JSON object) yields zero labels for that row,
--   never an error and never raw text.
-- - Pending labels: only known lab_request.is_* flags, mapped to plain
--   snake_case identifiers (frontend labels them; the RPC returns
--   identifiers, not raw column/table/JSON names).
-- - Scope: hivScreening/hbsagScreening (released) and
--   hiv_screening/hbsag_screening (pending) are included only when
--   patient_portal_scope() returns 'FULL' -- a STANDARD-scope caregiver/
--   guardian session cannot learn a sensitive test was even requested or
--   performed, for either released or pending rows (§7.3, §7.5, R14).
-- - No raw ids, no raw JSON, no staff-only notes reach the client at any
--   point -- test_labels is always a flat text[] of known identifiers.

-- Internal-only helper: findings is a free-text column, not guaranteed to
-- be valid JSON (see D-3/§15 "findings is plain text, not JSON"). A
-- SECURITY DEFINER function cannot embed an EXCEPTION block inside a
-- single SQL `return query` statement, so the safe cast is isolated in
-- its own small function, exactly like patient_portal_record_token is
-- isolated -- never granted to any client role, only ever called from
-- inside the other SECURITY DEFINER functions below.
create or replace function public.patient_portal_safe_jsonb(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
begin
  return p_text::jsonb;
exception when others then
  return null;
end;
$$;

revoke execute on function public.patient_portal_safe_jsonb(text) from PUBLIC, anon, authenticated;

-- CREATE OR REPLACE cannot change an existing function's RETURNS TABLE
-- row type (adding `test_labels text[]` below is exactly that change),
-- so the old 4-column signature must be dropped first. Confirmed safe:
-- no view, no other function, and no other pg_depend entry references
-- public.patient_portal_lab_results(bigint) (checked against the live
-- project before writing this), so a plain DROP FUNCTION is sufficient
-- and CASCADE is neither needed nor used.
drop function if exists public.patient_portal_lab_results(bigint);

create or replace function public.patient_portal_lab_results(p_patient_id bigint)
returns table (
  kind text,               -- 'released' | 'pending'
  result_token text,       -- set only for kind = 'released'
  test_date date,
  performed_by text,
  test_labels text[]       -- known, scope-filtered group/test identifiers only
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
    lr.performed_by as performed_by,
    coalesce((
      select array_agg(k order by k)
      from jsonb_object_keys(
        case
          when jsonb_typeof(public.patient_portal_safe_jsonb(lr.findings)) = 'object'
          then public.patient_portal_safe_jsonb(lr.findings)
          else '{}'::jsonb
        end
      ) as k
      where k = any(array['clinicalMicroscopy', 'bloodChemistry', 'pregnancyTest', 'hbsagScreening', 'hivScreening', 'parasitology', 'dengueRdt'])
        and (
          public.patient_portal_scope(p_patient_id) = 'FULL'
          or k <> all(array['hivScreening', 'hbsagScreening'])
        )
    ), array[]::text[]) as test_labels
  from public.lab_result lr
  where lr.patient_id = p_patient_id
    and lr.status = 'Completed'

  union all

  select
    'pending'::text as kind,
    null::text as result_token,
    lreq.request_date::date as test_date,
    null::text as performed_by,
    (
      coalesce((
        select array_agg(x.label order by x.label)
        from (values
          ('cbc', lreq.is_cbc),
          ('cbc_platelet', lreq.is_cbc_platelet),
          ('hgb_hct', lreq.is_hgb_hct),
          ('xray', lreq.is_xray),
          ('ultrasound', lreq.is_ultrasound),
          ('rbs', lreq.is_rbs),
          ('fbs', lreq.is_fbs),
          ('uric_acid', lreq.is_uric_acid),
          ('cholesterol', lreq.is_cholesterol),
          ('urinalysis', lreq.is_urinalysis),
          ('fecalysis', lreq.is_fecalysis),
          ('sputum', lreq.is_sputum),
          ('clinical_microscopy', lreq.is_clinical_microscopy),
          ('blood_chemistry', lreq.is_blood_chemistry),
          ('pregnancy_test', lreq.is_pregnancy_test),
          ('parasitology', lreq.is_parasitology),
          ('dengue_rdt', lreq.is_dengue_rdt)
        ) as x(label, flag)
        where x.flag is true
      ), array[]::text[])
      ||
      case
        when public.patient_portal_scope(p_patient_id) = 'FULL'
        then array_remove(array[
          case when lreq.is_hiv_screening then 'hiv_screening' end,
          case when lreq.is_hbsag_screening then 'hbsag_screening' end
        ], null)
        else array[]::text[]
      end
    ) as test_labels
  from public.lab_request lreq
  where lreq.patient_id = p_patient_id
    and coalesce(lreq.status, 'Pending') <> 'Completed'

  order by test_date desc nulls last;
end;
$$;

revoke execute on function public.patient_portal_lab_results(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_lab_results(bigint) to authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'patient_portal_safe_jsonb'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'patient_portal_safe_jsonb must not be executable by anon/authenticated/PUBLIC';
  end if;
end;
$$;
