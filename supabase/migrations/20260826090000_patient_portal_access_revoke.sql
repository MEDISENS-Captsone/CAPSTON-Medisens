-- Patient Account Phase 8: the one patient-initiated write RPC identified
-- in §11.1/§6.3 that Phase 5 did not yet build -- revoking an
-- AUTHORIZED_CAREGIVER grant. Confirmed via a fresh inspection of live
-- RLS (pg_policy) that this is a genuine gap, not an oversight to work
-- around client-side: patient_access_grants carries only three SELECT
-- policies (own account, self-holder, staff) and no UPDATE/DELETE policy
-- for any authenticated role, so there is currently no client write path
-- to this table at all -- exactly as §12.2 specifies ("No client writes;
-- revocation goes through the RPC").
--
-- Revised before deployment (pre-deployment security review): the first
-- draft of this migration had patient_portal_access_list() return the raw
-- patient_access_grants.id UUID, which then reached the browser verbatim
-- in the RPC response and was sent back as-is to
-- patient_portal_access_revoke(). That is a raw internal identifier
-- reaching the client -- exactly what §13 R4's opaque-token rule exists
-- to prevent, even though the UUID was never rendered in the DOM. Fixed
-- by reusing the existing opaque-token architecture (§13 R4,
-- patient_portal_record_token): a new HMAC-based
-- patient_portal_grant_token(grant_id, patient_id) helper, returned as
-- access_token from patient_portal_access_list() instead of grant_id, and
-- accepted (alongside p_patient_id, mirroring
-- patient_portal_visit_detail's (p_patient_id, p_visit_token) shape) by
-- patient_portal_access_revoke() -- which resolves the real grant
-- server-side by recomputing the token per candidate row, never by
-- trusting a client-supplied id. Because patient_portal_access_list() was
-- already deployed in Phase 5 with the old `grant_id uuid` shape, it must
-- be dropped before it can be recreated with a different column type
-- (CREATE OR REPLACE cannot change RETURNS TABLE, same issue as the
-- Phase 7 lab_results correction).
--
-- The token is identifier hygiene, not the authorization boundary --
-- authorization is unchanged and still fully server-side:
-- - The caller must hold an active SELF grant on the given patient_id
--   (patient_portal_is_self_holder, already used by
--   patient_portal_access_list/_recent_access).
-- - The target grant (resolved from the token) must belong to that same
--   patient_id -- a token minted for one patient cannot be replayed
--   against another, because the token itself is bound to (grant_id,
--   patient_id) and the lookup is scoped `where g.patient_id = p_patient_id`.
-- - The target grant's relationship must be exactly
--   'AUTHORIZED_CAREGIVER'. A 'GUARDIAN' grant is refused unconditionally
--   -- there is no age check to bypass, because this RPC never revokes a
--   GUARDIAN relationship regardless of the patient's age (§6.3, §15
--   "Patient (any age) attempts to remove their guardian's access").
-- - A 'SELF' grant is likewise refused (this RPC removes caregiver
--   access, never a patient's own access to their own record).
-- - An unresolvable token raises the same generic error as "not found",
--   never distinguishing a malformed token from a since-revoked grant.
-- - Revoking an already-revoked grant is a no-op, not an error (the
--   client may retry safely; §17 Phase 8 "repeated submission
--   protection").

create or replace function public.patient_portal_grant_token(p_grant_id uuid, p_patient_id bigint)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
  select encode(
    hmac(
      'access-grant:' || p_grant_id::text || ':' || p_patient_id::text,
      (select secret from public.patient_portal_token_secret limit 1),
      'sha256'
    ),
    'hex'
  );
$$;

-- Deliberately not granted to authenticated/anon/PUBLIC -- only ever
-- called from inside the SECURITY DEFINER functions below, same as
-- patient_portal_record_token.
revoke execute on function public.patient_portal_grant_token(uuid, bigint) from PUBLIC, anon, authenticated;

drop function if exists public.patient_portal_access_list(bigint);

create or replace function public.patient_portal_access_list(p_patient_id bigint)
returns table (
  access_token text,
  relationship text,
  granted_at timestamptz,
  revocable boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.patient_portal_is_self_holder(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  perform public.patient_portal_write_audit('view', p_patient_id, 'patient_access_grant', 'Viewed access list.');

  return query
  select
    public.patient_portal_grant_token(g.id, g.patient_id) as access_token,
    g.relationship,
    g.granted_at,
    (g.relationship = 'AUTHORIZED_CAREGIVER') as revocable
  from public.patient_access_grants g
  where g.patient_id = p_patient_id
    and g.revoked_at is null
  order by g.granted_at asc;
end;
$$;

revoke execute on function public.patient_portal_access_list(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_access_list(bigint) to authenticated;

create or replace function public.patient_portal_access_revoke(p_patient_id bigint, p_access_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_grant record;
  v_caller_account_id uuid;
begin
  if not public.patient_portal_is_self_holder(p_patient_id) then
    raise exception 'Not authorized for this record.';
  end if;

  select g.id, g.relationship, g.revoked_at
  into v_grant
  from public.patient_access_grants g
  where g.patient_id = p_patient_id
    and public.patient_portal_grant_token(g.id, g.patient_id) = p_access_token;

  if not found then
    raise exception 'Access grant not found.';
  end if;

  if v_grant.relationship <> 'AUTHORIZED_CAREGIVER' then
    raise exception 'This access cannot be removed here. Please visit the RHU.';
  end if;

  if v_grant.revoked_at is not null then
    -- Already revoked -- idempotent success, so a retried/duplicate tap
    -- never surfaces an error.
    return;
  end if;

  select a.id into v_caller_account_id
  from public.patient_accounts a
  where a.auth_user_id = (select auth.uid());

  update public.patient_access_grants
  set revoked_at = now(), revoked_by = v_caller_account_id
  where id = v_grant.id;

  perform public.patient_portal_write_audit('revoke', p_patient_id, 'patient_access_grant', 'Removed caregiver access to this health record.');
end;
$$;

revoke execute on function public.patient_portal_access_revoke(bigint, text) from PUBLIC, anon;
grant execute on function public.patient_portal_access_revoke(bigint, text) to authenticated;

-- ============================================================
-- Pre-deployment security review finding #2: patient_correction_requests'
-- Phase 2 INSERT policy (patient_correction_requests_insert_self_or_guardian)
-- correctly forces account_id ownership and patient_portal_can_correct()
-- (SELF/GUARDIAN only), but never constrained the row's own
-- status/resolved_at/resolved_by columns. A direct client insert (e.g. a
-- raw PostgREST call bypassing CorrectionRequestForm.tsx) could set
-- status = 'resolved' (a real, checked-constraint-valid value) and
-- resolved_by to a real profiles.id, fabricating a request that looks
-- already staff-reviewed. There is no UPDATE policy for authenticated on
-- this table, so this INSERT-time gap is the only place to close. Fixed
-- with ALTER POLICY (this table's own RLS is otherwise unchanged) rather
-- than a new corrective policy, since Postgres supports altering an
-- existing policy's WITH CHECK expression directly.
-- ============================================================

alter policy patient_correction_requests_insert_self_or_guardian
  on public.patient_correction_requests
  with check (
    (
      exists (
        select 1 from public.patient_accounts a
        where a.id = patient_correction_requests.account_id
          and a.auth_user_id = (select auth.uid())
      )
    )
    and public.patient_portal_can_correct(patient_id)
    and status = 'submitted'
    and resolved_at is null
    and resolved_by is null
  );
