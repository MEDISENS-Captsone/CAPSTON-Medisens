-- Corrective, one-row fixture repair for lab_request #35.
--
-- Root cause: LabEncodePanel.tsx (Laboratory Encode Result redesign) rendered and
-- enabled "Save Laboratory Results" even when a request had zero tests recognized
-- by the current Laboratory module's seven supported flags (is_clinical_microscopy,
-- is_blood_chemistry, is_pregnancy_test, is_hbsag_screening, is_hiv_screening,
-- is_parasitology, is_dengue_rdt) and no `others` text. Clicking Save on request #35
-- (a fixture row whose only set flags are the legacy is_cbc/is_xray/is_sputum
-- columns -- see investigation below) produced an all-blank lab_result row
-- (labresult_id 40) and marked the request Completed. That frontend bug is already
-- fixed (hasValidTests guard, both in the UI and defensively inside handleSave).
-- The bad lab_result row (40) has already been deleted out-of-band.
--
-- Investigation findings (recorded here for the audit trail):
--   * is_cbc/is_cbc_platelet/is_hgb_hct/is_xray/is_ultrasound/is_rbs/is_fbs/
--     is_uric_acid/is_cholesterol/is_urinalysis/is_fecalysis/is_sputum are NOT
--     deprecated at the schema/read level: migration 20260825100000
--     (patient_portal_lab_results) explicitly reads and surfaces every one of them
--     to patients as legitimate pending-test labels. They remain live, valid columns.
--   * They ARE dead at the write level: neither current lab-request creation path
--     (src/app/lab-request/index.tsx, src/app/consultation/index.tsx
--     handleSaveLabRequest) sets any of them -- both only ever populate the seven
--     newer is_* flags. No live UI can produce a new row shaped like #35 today.
--   * Given request #35's placeholder-looking staff names (requested_by
--     "Dr. Juan Dela Cruz", lab_result.performed_by "Harry") and the confirmed
--     absence of any current creation path for this flag shape, this row is
--     historical/fixture data from before the seven-flag redesign, not a
--     reachable production state.
--   * Because is_cbc/is_xray/is_sputum remain live, patient-facing data, `Pending`
--     is the semantically correct terminal state for this request -- it did
--     legitimately request three tests, the Laboratory staff module just doesn't
--     yet know how to display those particular flags (a separate, frontend
--     display-gap finding, not itself repaired by this migration).
--
-- Guard preserved: guard_lab_request_status_update() (20260716084759) still
-- unconditionally blocks Completed -> earlier-state transitions for every other
-- row. It is disabled here only for the single UPDATE statement below, only after
-- an explicit precondition check confirms lab_request 35 still matches its exact
-- known-bad shape (Completed, none of the seven current flags set, no `others`
-- text, the legacy flags set, and no lab_result row present). If the row does not
-- match -- including if this migration is mistakenly re-run after the row has
-- already been repaired, or run against a different database -- the migration
-- raises and aborts without disabling the trigger or touching any row.
do $$
declare
  row_matches boolean;
begin
  select
    lr.status = 'Completed'
    and coalesce(lr.is_clinical_microscopy, false) is false
    and coalesce(lr.is_blood_chemistry, false) is false
    and coalesce(lr.is_pregnancy_test, false) is false
    and coalesce(lr.is_hbsag_screening, false) is false
    and coalesce(lr.is_hiv_screening, false) is false
    and coalesce(lr.is_parasitology, false) is false
    and coalesce(lr.is_dengue_rdt, false) is false
    and coalesce(nullif(btrim(lr.others), ''), '') = ''
    and coalesce(lr.is_cbc, false) is true
    and coalesce(lr.is_xray, false) is true
    and coalesce(lr.is_sputum, false) is true
    and not exists (select 1 from public.lab_result res where res.labrequest_id = lr.labrequest_id)
  into row_matches
  from public.lab_request lr
  where lr.labrequest_id = 35;

  if row_matches is not true then
    raise exception 'lab_request 35 no longer matches the expected known-bad fixture shape -- aborting corrective repair without changing anything';
  end if;

  alter table public.lab_request disable trigger guard_lab_request_status_update;

  update public.lab_request
  set status = 'Pending'
  where labrequest_id = 35;

  alter table public.lab_request enable trigger guard_lab_request_status_update;
end $$;
