-- Patient Account Phase 2 correction: fix infinite RLS recursion on
-- patient_access_grants, and a second symptom of the same root cause in
-- patient_correction_requests' INSERT policy (does not edit
-- 20260824150000_patient_account_phase2_schema.sql).
--
-- Live-gate finding: any authenticated read of patient_access_grants
-- raised Postgres 42P17 "infinite recursion detected in policy for
-- relation \"patient_access_grants\"". Root cause: the
-- patient_access_grants_select_self_holder policy's USING clause
-- contains a correlated subquery against patient_access_grants itself
-- (to find the caller's own active SELF grant), evaluated under the
-- `authenticated` role -- so Postgres has to re-apply this table's own
-- RLS policies to answer the policy's own subquery, which requires
-- evaluating the same policy again, and so on.
--
-- Fix: move the "does the caller hold an active SELF grant on this
-- patient?" check into a SECURITY DEFINER function, the same pattern
-- already used for patient_portal_can_access / patient_portal_scope.
-- A SECURITY DEFINER function's internal query runs with the owning
-- role's privileges, which is not subject to the calling role's RLS
-- policies on this table, so the self-reference no longer recurses.
--
-- This does not change who can see what -- only how the same rule is
-- evaluated. The policy still grants visibility only to a caller who
-- currently holds an active, non-expired SELF grant on that patient_id;
-- caregivers and guardians (never SELF) still see only their own grant
-- row via the separate "own account" policy, unchanged.

create or replace function public.patient_portal_is_self_holder(p_patient_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.patient_access_grants g
    join public.patient_accounts a on a.id = g.account_id
    where a.auth_user_id = (select auth.uid())
      and g.relationship = 'SELF'
      and g.patient_id = p_patient_id
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

revoke execute on function public.patient_portal_is_self_holder(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_is_self_holder(bigint) to authenticated;

drop policy if exists "patient_access_grants_select_self_holder" on public.patient_access_grants;

create policy "patient_access_grants_select_self_holder"
on public.patient_access_grants
for select
to authenticated
using (
  public.patient_portal_is_self_holder(patient_access_grants.patient_id)
);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_access_grants'
      and policyname = 'patient_access_grants_select_self_holder'
  ) then
    raise exception 'patient_access_grants_select_self_holder policy is missing after the recursion fix';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'patient_portal_is_self_holder' and p.prosecdef
  ) then
    raise exception 'public.patient_portal_is_self_holder must exist and remain SECURITY DEFINER';
  end if;
end;
$$;

-- Same root cause, second symptom: patient_correction_requests_insert_self_or_guardian
-- (20260824150000) also contains a raw correlated subquery against
-- patient_access_grants, evaluated under the `authenticated` role. That
-- subquery is subject to patient_access_grants' own RLS, which requires
-- evaluating the (now-fixed) self-holder policy -- but even a
-- non-recursive policy on the *target* table doesn't help here, because
-- the query is against a *different* table's WITH CHECK clause reading
-- patient_access_grants: it still needs a SECURITY DEFINER indirection
-- to avoid depending on the caller's own row-visibility into
-- patient_access_grants (a GUARDIAN, for example, only sees their own
-- grant row per policy, which is besides the point -- WITH CHECK
-- evaluation should not depend on what the caller can SELECT elsewhere).

create or replace function public.patient_portal_can_correct(p_patient_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.patient_access_grants g
    join public.patient_accounts a on a.id = g.account_id
    where a.auth_user_id = (select auth.uid())
      and g.relationship in ('SELF', 'GUARDIAN')
      and g.patient_id = p_patient_id
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

revoke execute on function public.patient_portal_can_correct(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_can_correct(bigint) to authenticated;

drop policy if exists "patient_correction_requests_insert_self_or_guardian" on public.patient_correction_requests;

create policy "patient_correction_requests_insert_self_or_guardian"
on public.patient_correction_requests
for insert
to authenticated
with check (
  exists (
    select 1 from public.patient_accounts a
    where a.id = patient_correction_requests.account_id
      and a.auth_user_id = (select auth.uid())
  )
  and public.patient_portal_can_correct(patient_correction_requests.patient_id)
);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_correction_requests'
      and policyname = 'patient_correction_requests_insert_self_or_guardian'
  ) then
    raise exception 'patient_correction_requests_insert_self_or_guardian policy is missing after the fix';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'patient_portal_can_correct' and p.prosecdef
  ) then
    raise exception 'public.patient_portal_can_correct must exist and remain SECURITY DEFINER';
  end if;
end;
$$;
