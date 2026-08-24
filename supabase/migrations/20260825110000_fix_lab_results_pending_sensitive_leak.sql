-- Patient Account Phase 7 correction #2: patient_portal_lab_results()
-- still returned a pending row for a sensitive-only lab request under
-- STANDARD scope, with an empty test_labels array. The row's mere
-- presence (with a date, via "A test requested on <date> is not yet
-- available.") leaked that a sensitive test had been requested -- exactly
-- the disclosure §7.3/§7.5/R14 exist to prevent, just moved from the
-- labels into the row's existence.
--
-- Fix, enforced in the RPC (never in React): a pending row is omitted
-- entirely for a STANDARD-scope caller only when the request contains at
-- least one sensitive flag (is_hiv_screening / is_hbsag_screening) AND no
-- non-sensitive flag at all. A request with a mix of safe and sensitive
-- flags still appears, with only the safe labels (already correct
-- behavior from 20260825100000, unchanged here). A request with no
-- flags set at all is not "sensitive" by omission -- it still appears,
-- with an empty test_labels array, exactly as before.
--
-- Because 20260825100000_patient_portal_lab_results_test_labels.sql is
-- already deployed, this is a new corrective migration, not an edit to
-- that file. The return shape (kind, result_token, test_date,
-- performed_by, test_labels) is unchanged, so a plain CREATE OR REPLACE
-- is sufficient -- no DROP is needed this time.
--
-- Preserved unchanged: released-result FULL/STANDARD filtering, the
-- audit write, the closed group-key whitelist, opaque result tokens,
-- malformed/plain-text findings handling, patient_portal_safe_jsonb, and
-- patient_portal_lab_result_detail() (not touched by this migration).

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
    -- Omit the row entirely for STANDARD scope when the request is
    -- sensitive-only: at least one of is_hiv_screening/is_hbsag_screening
    -- is true, and none of the non-sensitive is_* flags are true. A
    -- request with no flags at all (has_safe = false, has_sensitive =
    -- false) is not sensitive-only and still appears -- the omission is
    -- keyed strictly on "sensitive present AND nothing safe present",
    -- never on "nothing safe present" alone.
    and not (
      public.patient_portal_scope(p_patient_id) <> 'FULL'
      and (coalesce(lreq.is_hiv_screening, false) or coalesce(lreq.is_hbsag_screening, false))
      and not (
        coalesce(lreq.is_cbc, false) or coalesce(lreq.is_cbc_platelet, false) or coalesce(lreq.is_hgb_hct, false)
        or coalesce(lreq.is_xray, false) or coalesce(lreq.is_ultrasound, false) or coalesce(lreq.is_rbs, false)
        or coalesce(lreq.is_fbs, false) or coalesce(lreq.is_uric_acid, false) or coalesce(lreq.is_cholesterol, false)
        or coalesce(lreq.is_urinalysis, false) or coalesce(lreq.is_fecalysis, false) or coalesce(lreq.is_sputum, false)
        or coalesce(lreq.is_clinical_microscopy, false) or coalesce(lreq.is_blood_chemistry, false)
        or coalesce(lreq.is_pregnancy_test, false) or coalesce(lreq.is_parasitology, false) or coalesce(lreq.is_dengue_rdt, false)
      )
    )

  order by test_date desc nulls last;
end;
$$;

revoke execute on function public.patient_portal_lab_results(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_lab_results(bigint) to authenticated;
