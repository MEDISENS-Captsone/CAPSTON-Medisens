-- Patient Account Phase 9 finding (whitelist/field-leak audit): a fresh
-- automated scan of every consumed Patient Portal RPC response found
-- patient_portal_my_records() -- deployed since Phase 5 and never
-- touched by the Phase 8 patient_portal_access_list() opaque-token
-- correction, because it is a different RPC -- still returning the raw
-- patient_access_grants.id primary key as `grant_id`. This reaches the
-- browser on every session load (getPatientPortalSession() ->
-- fetchMyRecords() -> PatientGrantSummary.id), used only as a React list
-- key / selected-grant identifier in PortalShell.tsx and
-- PersonSwitcher.tsx -- it is never sent back to any RPC as an argument,
-- so nothing about its value needs to be the real database id.
--
-- Fix: reuse the existing opaque-token architecture (§13 R4,
-- patient_portal_grant_token(), already created in Phase 8 for
-- patient_portal_access_list()) instead of inventing a second scheme.
-- The column is renamed grant_id uuid -> grant_token text so the type
-- change is self-documenting; renaming forces every caller to be
-- re-checked rather than silently reinterpreting the same column name.
--
-- Because patient_portal_my_records() was deployed in Phase 5
-- (20260824170000_patient_account_phase5_read_api.sql), this is a new
-- corrective migration, not an edit to that file. The return shape
-- changes, so the function must be dropped before it is recreated (same
-- constraint as every prior shape-changing correction this project has
-- made). No dependency on this function exists (pg_depend re-checked
-- against the live project before writing this); a plain DROP FUNCTION
-- is safe and CASCADE is not used.
--
-- Everything else -- the caller-scoped WHERE clause (own account, active
-- status, unrevoked, unexpired), STABLE volatility (this function has
-- never written anything, so no Phase 5 volatility-fix issue applies
-- here), and execute grants -- is unchanged.

drop function if exists public.patient_portal_my_records();

create or replace function public.patient_portal_my_records()
returns table (
  grant_token text,
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
  select
    public.patient_portal_grant_token(g.id, g.patient_id) as grant_token,
    g.patient_id,
    g.relationship,
    g.scope,
    g.granted_at
  from public.patient_access_grants g
  join public.patient_accounts a on a.id = g.account_id
  where a.auth_user_id = (select auth.uid())
    and a.status = 'active'
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now());
$$;

revoke execute on function public.patient_portal_my_records() from PUBLIC, anon;
grant execute on function public.patient_portal_my_records() to authenticated;
