-- Patient Account Phase 8 correction: patient_portal_access_list() had no
-- patient-safe way to identify *who* holds each grant -- only the
-- relationship type (e.g. "Authorized caregiver"), which is meaningless
-- once more than one person could plausibly hold that relationship on a
-- record. Confirmed via a fresh inspection of the deployed function
-- (pg_get_functiondef) that no name field exists; this is a genuine
-- Patient Portal read-contract gap, not a frontend omission.
--
-- Smallest correction: one new output column, `holder_name text`, joined
-- from patient_accounts.display_name -- the same field the account's own
-- "Signed in as <display_name>" line already exposes to that account
-- itself, and already patient-safe by design (§11: patient_accounts
-- describes "the person logging in"; display_name is what they are
-- called, not an internal identifier). No auth_user_id, no
-- patient_accounts.id, no email, no identity_verified_* metadata is
-- selected or returned -- only display_name.
--
-- Because 20260826090000_patient_portal_access_revoke.sql (which last
-- defined this function) is already deployed, this is a new corrective
-- migration, not an edit to that file. The return shape changes (a
-- column is added), so the function must be dropped before it can be
-- recreated, same constraint as the two earlier Phase 5/8 shape changes.
-- No dependency on this function exists (pg_depend re-checked against the
-- live project before writing this), so a plain DROP FUNCTION is safe
-- and CASCADE is not used.
--
-- Everything else -- opaque access_token (unchanged), server-side
-- self-holder authorization, the audit write, ordering, and the
-- `revocable` computation -- is byte-identical to the deployed version.

drop function if exists public.patient_portal_access_list(bigint);

create or replace function public.patient_portal_access_list(p_patient_id bigint)
returns table (
  access_token text,
  holder_name text,
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
    a.display_name as holder_name,
    g.relationship,
    g.granted_at,
    (g.relationship = 'AUTHORIZED_CAREGIVER') as revocable
  from public.patient_access_grants g
  join public.patient_accounts a on a.id = g.account_id
  where g.patient_id = p_patient_id
    and g.revoked_at is null
  order by g.granted_at asc;
end;
$$;

revoke execute on function public.patient_portal_access_list(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_access_list(bigint) to authenticated;
