-- Move patient consent capture from midwives to BHW.
--
-- Rationale: consent must now be recorded immediately after BHW registers a
-- new resident, rather than later in the midwife workflow. This keeps consent
-- capture as the very first clinical-adjacent step for a patient, before any
-- downstream care-team workflow (nurse intake, midwife care, doctor
-- consultation) proceeds. Midwives retain SELECT visibility (care-team
-- continuity of care) but lose the ability to insert/update consent records
-- going forward. Existing patient_consent rows, audit history, and the
-- care-team SELECT policy are left untouched.

drop policy if exists "patient_consent_insert_for_midwives" on public.patient_consent;
drop policy if exists "patient_consent_update_for_midwives" on public.patient_consent;

create policy "patient_consent_insert_for_bhw"
on public.patient_consent
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'BHW'
  )
);

create policy "patient_consent_update_for_bhw"
on public.patient_consent
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'BHW'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'BHW'
  )
);

-- patient_consent_select_for_care_team is intentionally left unchanged so
-- BHW, midwives, nurse, and doctor can all still view existing consent
-- records for continuity of care.
