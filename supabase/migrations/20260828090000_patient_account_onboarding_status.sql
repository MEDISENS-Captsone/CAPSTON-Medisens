-- Patient Account Phase 9B Step 4 correction: staff-safe onboarding status.
--
-- Root cause: patient_activation_codes has zero authenticated policies
-- (Phase 2, by design -- it is service-role only, since it holds
-- code_hash and attempt counters). For SELF/GUARDIAN, patient-activation-
-- issue writes a row there but patient_accounts is not created until
-- patient-activation-complete succeeds, so staff reopening a patient
-- record after issuing a SELF/GUARDIAN code had no way to see that
-- anything was in flight -- the read model fell back to "Not activated"
-- as if nothing had ever been issued, risking duplicate issuance.
--
-- patient_accounts.pin_updated_at already reliably distinguishes
-- setup-complete from setup-pending for rows that exist: it is set only
-- by patient-activation-complete's PIN-setting branches (both the fresh
-- SELF/GUARDIAN branch and the existing-account/caregiver branch), never
-- at row creation. The account-only caregiver path
-- (patient-caregiver-activation-issue) creates its patient_accounts row
-- with pin_updated_at null and status already 'active', so a null
-- pin_updated_at on an existing row is a reliable, already-available
-- signal that a caregiver has not finished PIN setup -- no new backend
-- contract is needed for that case, only a staff UI change to read the
-- column already selectable under patient_accounts_select_staff_support.
--
-- The SELF/GUARDIAN "issued but no account yet" case has no existing
-- field to read from, because there is no row to read pin_updated_at
-- from. This migration adds the smallest possible purpose-built read
-- contract for that one gap: a SECURITY DEFINER function that returns
-- only relationship, holder_name (populated for GUARDIAN, per the
-- Phase 3 correction in 20260826130000), and expires_at for a still-
-- valid (unconsumed, unexpired) ACTIVATION-purpose code on a given
-- patient. It never returns the code itself, its hash, its id, its
-- target_account_id, or its attempt counter, and it authorizes the
-- caller itself (via profiles.role) rather than relying on a table
-- grant, so patient_activation_codes remains fully inaccessible through
-- direct browser table reads -- this function is the only new way to
-- learn anything about that table from the client, and it is a narrow
-- projection, not a table grant.

create or replace function public.patient_account_onboarding_pending(p_patient_id bigint)
returns table (
  relationship text,
  holder_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select c.relationship, c.holder_name, c.expires_at
  from public.patient_activation_codes c
  where c.patient_id = p_patient_id
    and c.purpose = 'ACTIVATION'
    and c.relationship in ('SELF', 'GUARDIAN')
    and c.consumed_at is null
    and c.expires_at > now()
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'nurse', 'BHW', 'midwives')
    )
  order by c.created_at desc;
$$;

revoke execute on function public.patient_account_onboarding_pending(bigint) from PUBLIC, anon;
grant execute on function public.patient_account_onboarding_pending(bigint) to authenticated;

comment on function public.patient_account_onboarding_pending(bigint) is
  'Staff-only, patient-scoped read of any still-valid SELF/GUARDIAN activation code (docs/patientAccount.md Phase 9B Step 4 correction). Deliberately excludes AUTHORIZED_CAREGIVER, whose onboarding state is already derivable from patient_accounts.pin_updated_at once the account row exists. Never returns the code, its hash, its id, or an attempt counter. Authorization is enforced inside the function body (STAFF_ISSUING_ROLES-equivalent role check), not via a table grant -- patient_activation_codes itself keeps zero authenticated policies and stays revoked from authenticated entirely.';

-- ============================================================
-- Assertions
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'patient_account_onboarding_pending'
      and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'patient_account_onboarding_pending must not be executable by anon/PUBLIC';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_activation_codes'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'patient_activation_codes must still carry zero authenticated policies';
  end if;
end;
$$;
