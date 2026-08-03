-- Allow midwives to perform initial intake, mirroring the existing nurse grants.
--
-- Context: intake (initial_consultation + vital_sign, then a Complete/Refer
-- visit disposition) was previously reachable only from the nurse dashboard.
-- The midwife shell now mounts the same shared initial-consultation form, so
-- midwives need the same — and only the same — write access nurses already
-- have for that flow.
--
-- Scope notes:
--   * Purely additive. Nothing existing is dropped or widened. RLS policies
--     are OR'd, so a separate midwife policy is a smaller and safer diff than
--     rewriting the nurse policies to a role list, and it keeps the nurse
--     grants auditable on their own.
--   * INSERT only on initial_consultation and vital_sign — exactly what
--     20260714130331_harden_initial_consultation_vital_sign_rls.sql gives
--     nurse. No SELECT change: initial_consultation SELECT already includes
--     'midwives', and vital_sign SELECT stays doctor-only.
--   * No patient_consent access is granted here. Consent capture remains
--     BHW-only per 20260804090000_move_consent_signing_to_bhw.sql; midwives
--     keep read-only consent visibility through the existing care-team SELECT
--     policy.
--   * The stored midwife role string is 'midwives' (plural), matching
--     src/types/user.ts and the existing policies in this schema.

create policy "initial_consultation_insert_midwife"
on public.initial_consultation
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'midwives'
    )
);

create policy "vital_sign_insert_midwife"
on public.vital_sign
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'midwives'
    )
);

-- Visit-disposition correction grant, mirroring
-- "initial_consultation_update_visit_disposition" (nurse) from
-- 20260804090100_add_initial_consultation_visit_status.sql.
--
-- This is a row-level UPDATE policy because Postgres RLS cannot be scoped to a
-- single column. What such an update may actually change is still constrained
-- by the existing BEFORE UPDATE trigger
-- guard_initial_consultation_visit_disposition, which (a) rejects any update
-- that changes visit_disposition together with any other column, and (b)
-- freezes the disposition once a doctor consultation row exists for the visit.
-- Midwives therefore gain exactly the nurse's scope, not a general write grant.
create policy "initial_consultation_update_visit_disposition_midwife"
on public.initial_consultation
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'midwives'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'midwives'
    )
);
