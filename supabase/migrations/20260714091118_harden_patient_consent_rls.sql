-- Security Phase 2A: harden patient_consent RLS.
--
-- Replace the broad authenticated ALL policy with role-specific policies for
-- the existing consent workflow. Normal authenticated users receive no DELETE
-- policy.

alter table public.patient_consent enable row level security;

drop policy if exists "Allow authenticated users full access to patient_consent"
  on public.patient_consent;

drop policy if exists "patient_consent_select_for_care_team"
  on public.patient_consent;
drop policy if exists "patient_consent_insert_for_midwives"
  on public.patient_consent;
drop policy if exists "patient_consent_update_for_midwives"
  on public.patient_consent;

create policy "patient_consent_select_for_care_team"
on public.patient_consent
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('BHW', 'midwives', 'nurse', 'doctor')
  )
);

create policy "patient_consent_insert_for_midwives"
on public.patient_consent
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'midwives'
  )
);

create policy "patient_consent_update_for_midwives"
on public.patient_consent
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'midwives'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'midwives'
  )
);
