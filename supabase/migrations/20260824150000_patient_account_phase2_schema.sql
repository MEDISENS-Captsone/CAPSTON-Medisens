-- Patient Account Phase 2: access model schema and authorization core.
--
-- Lands the seven new tables from docs/patientAccount.md §11, the two
-- authorization functions from §12.1, and the RLS policies from §12.2.
-- No existing table, policy, trigger, or function is touched. No route,
-- component, or Edge Function is created in this migration -- nothing
-- yet consumes this schema (that begins in Phase 3).
--
-- Live-schema facts re-confirmed before writing this migration (via the
-- PostgREST OpenAPI document, read-only, service-role only):
--   - public.patients.id is bigint (format "bigint").
--   - public.profiles.id is uuid.
--   - None of the seven tables below already exist.
--
-- Access model recap (do not special-case any of this in application
-- code later -- it is enforced here):
--   - SELF            -> scope 'FULL',     patient-revocable (AUTHORIZED_CAREGIVER only, not itself)
--   - GUARDIAN        -> scope 'STANDARD', staff-revocable only, expires_at defaults to 18th birthday
--   - AUTHORIZED_CAREGIVER -> scope 'STANDARD', patient (SELF) may revoke it
-- Scope is assigned by the granting Edge Function in Phase 3, never by a
-- column default here, which is why `scope` has no `default` clause.

-- ============================================================
-- Tables
-- ============================================================

create table public.patient_accounts (
  id                    uuid primary key default gen_random_uuid(),
  auth_user_id          uuid not null unique references auth.users(id) on delete cascade,
  medisens_id           text not null unique,
  display_name          text not null,
  status                text not null default 'active' check (status in ('active', 'locked', 'disabled')),
  pin_updated_at        timestamptz,
  failed_attempts       int not null default 0,
  locked_until          timestamptz,
  identity_verified_by  uuid references public.profiles(id),
  identity_verified_at  timestamptz,
  identity_note         text,
  created_at            timestamptz not null default now(),
  created_by            uuid references public.profiles(id)
);
comment on table public.patient_accounts is
  'A Patient Portal login (§4.1). No patient_id column by design -- a login may or may not itself be an RHU patient. identity_verified_* is populated for account-only caregiver activation (§5.2.1), where the account never receives a SELF grant.';

create table public.patient_access_grants (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.patient_accounts(id) on delete cascade,
  patient_id    bigint not null references public.patients(id),
  relationship  text not null check (relationship in ('SELF', 'GUARDIAN', 'AUTHORIZED_CAREGIVER')),
  scope         text not null check (scope in ('FULL', 'STANDARD')),
  granted_at    timestamptz not null default now(),
  granted_by    uuid not null references public.profiles(id),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid
);
comment on table public.patient_access_grants is
  'The authorization edge (§4.1). SELF=FULL scope; GUARDIAN/AUTHORIZED_CAREGIVER=STANDARD scope (§7.3, §4.3). revoked_by intentionally has no FK: a staff revocation records a profiles.id, a patient self-revocation of AUTHORIZED_CAREGIVER records their own patient_accounts.id (§6.3).';

create table public.patient_activation_codes (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         bigint not null references public.patients(id),
  relationship       text not null check (relationship in ('SELF', 'GUARDIAN', 'AUTHORIZED_CAREGIVER')),
  target_account_id  uuid references public.patient_accounts(id),
  code_hash          text not null,
  purpose            text not null check (purpose in ('ACTIVATION', 'RECOVERY')),
  expires_at         timestamptz not null,
  consumed_at        timestamptz,
  attempts           int not null default 0,
  issued_by          uuid not null references public.profiles(id),
  created_at         timestamptz not null default now()
);
comment on table public.patient_activation_codes is
  'Staff-issued activation/recovery codes (§5.2, §5.2.1, §5.5). Never readable by authenticated clients -- service role (Edge Functions) only.';

create table public.patient_otp_challenges (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid references public.patient_accounts(id) on delete cascade,
  activation_code_id  uuid references public.patient_activation_codes(id) on delete cascade,
  code_hash           text not null,
  expires_at          timestamptz not null,
  attempts            int not null default 0,
  consumed_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint patient_otp_challenges_one_ref check (
    (account_id is not null and activation_code_id is null)
    or (account_id is null and activation_code_id is not null)
  )
);
comment on table public.patient_otp_challenges is
  'SMS OTP challenges, fleshed out from §11''s "account_or_code_ref" shorthand as an exclusive account_id/activation_code_id pair rather than an untyped polymorphic column, so referential integrity is enforced. Never readable by authenticated clients -- service role only.';

create table public.patient_account_preferences (
  account_id     uuid primary key references public.patient_accounts(id) on delete cascade,
  text_size      text not null default 'comfortable' check (text_size in ('comfortable', 'large')),
  high_contrast  boolean not null default false,
  language       text not null default 'en',
  sms_reminders  boolean not null default true
);
comment on table public.patient_account_preferences is
  'Self-editable portal preferences (§9.5). language is intentionally unconstrained text -- English-only ships in MVP (D-9), but the column does not encode that as a hard limit.';

create table public.patient_correction_requests (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.patient_accounts(id),
  patient_id       bigint not null references public.patients(id),
  field_group      text not null check (field_group in ('name', 'birthdate', 'address', 'contact', 'philhealth', 'other')),
  requested_value  text not null,
  patient_note     text,
  status           text not null default 'submitted' check (status in ('submitted', 'resolved', 'declined')),
  submitted_at     timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles(id)
);
comment on table public.patient_correction_requests is
  'Patient/guardian-authored correction requests (§9.5). Never a direct write to public.patients -- staff resolve these through the existing patient-edit flow.';

create table public.patient_portal_reference_ranges (
  id            uuid primary key default gen_random_uuid(),
  group_key     text not null,
  test_key      text not null,
  method_label  text,
  unit          text not null,
  range_low     numeric,
  range_high    numeric,
  range_text    text,
  approved_by   uuid not null references public.profiles(id),
  approved_at   timestamptz not null default now(),
  active        boolean not null default true,
  unique (group_key, test_key, method_label)
);
comment on table public.patient_portal_reference_ranges is
  'RHU-laboratory-curated patient-facing reference ranges (§9.4, D-11). A missing or inactive row means no range is shown -- never a fallback to the staff-side LabResultDetailModal constants. Staff-curated only; no client write path in MVP.';

-- ============================================================
-- Indexes
-- ============================================================

-- At most one active grant per (account, patient, relationship).
create unique index patient_access_grants_active_unique
  on public.patient_access_grants (account_id, patient_id, relationship)
  where revoked_at is null;

-- At most one active SELF grant per patient, regardless of which account holds it.
create unique index patient_access_grants_active_self_unique
  on public.patient_access_grants (patient_id)
  where relationship = 'SELF' and revoked_at is null;

-- Phase 2 task 4: explicit lookup indexes for active grants by account / by patient.
create index patient_access_grants_account_active_idx
  on public.patient_access_grants (account_id)
  where revoked_at is null;

create index patient_access_grants_patient_active_idx
  on public.patient_access_grants (patient_id)
  where revoked_at is null;

-- ============================================================
-- RLS: patient_accounts
-- ============================================================

alter table public.patient_accounts enable row level security;

create policy "patient_accounts_select_own"
on public.patient_accounts
for select
to authenticated
using (auth_user_id = (select auth.uid()));

create policy "patient_accounts_select_staff_support"
on public.patient_accounts
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'nurse', 'BHW', 'midwives')
  )
);

revoke all on public.patient_accounts from public, anon;

-- ============================================================
-- RLS: patient_access_grants
-- ============================================================

alter table public.patient_access_grants enable row level security;

create policy "patient_access_grants_select_own_account"
on public.patient_access_grants
for select
to authenticated
using (
  exists (
    select 1 from public.patient_accounts a
    where a.id = patient_access_grants.account_id
      and a.auth_user_id = (select auth.uid())
  )
);

-- A SELF holder can see every grant on their own record (§6.2, §9.5), so
-- they can see who else has access. Caregivers (STANDARD, read-only) do
-- not get this visibility -- only an active SELF grant qualifies.
create policy "patient_access_grants_select_self_holder"
on public.patient_access_grants
for select
to authenticated
using (
  exists (
    select 1
    from public.patient_access_grants self_grant
    join public.patient_accounts self_account on self_account.id = self_grant.account_id
    where self_account.auth_user_id = (select auth.uid())
      and self_grant.relationship = 'SELF'
      and self_grant.patient_id = patient_access_grants.patient_id
      and self_grant.revoked_at is null
      and (self_grant.expires_at is null or self_grant.expires_at > now())
  )
);

create policy "patient_access_grants_select_staff"
on public.patient_access_grants
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'nurse', 'BHW', 'midwives')
  )
);

revoke all on public.patient_access_grants from public, anon;
-- No client INSERT/UPDATE/DELETE policy exists on this table at all.
-- Grants are created only by service-role Edge Functions (§6.1). The one
-- patient-initiated write -- revoking an AUTHORIZED_CAREGIVER grant -- is
-- a Phase 3 SECURITY DEFINER RPC, not a direct table write (§6.3, §11.1).

-- ============================================================
-- RLS: patient_activation_codes / patient_otp_challenges
-- (zero authenticated policies -- service role only)
-- ============================================================

alter table public.patient_activation_codes enable row level security;
revoke all on public.patient_activation_codes from public, anon, authenticated;

alter table public.patient_otp_challenges enable row level security;
revoke all on public.patient_otp_challenges from public, anon, authenticated;

-- ============================================================
-- RLS: patient_account_preferences
-- ============================================================

alter table public.patient_account_preferences enable row level security;

create policy "patient_account_preferences_select_own"
on public.patient_account_preferences
for select
to authenticated
using (
  exists (
    select 1 from public.patient_accounts a
    where a.id = patient_account_preferences.account_id
      and a.auth_user_id = (select auth.uid())
  )
);

create policy "patient_account_preferences_update_own"
on public.patient_account_preferences
for update
to authenticated
using (
  exists (
    select 1 from public.patient_accounts a
    where a.id = patient_account_preferences.account_id
      and a.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.patient_accounts a
    where a.id = patient_account_preferences.account_id
      and a.auth_user_id = (select auth.uid())
  )
);

revoke all on public.patient_account_preferences from public, anon;
-- No client INSERT/DELETE policy: the row is created by the service-role
-- activation flow alongside the account (Phase 3).

-- ============================================================
-- RLS: patient_correction_requests
-- ============================================================

alter table public.patient_correction_requests enable row level security;

create policy "patient_correction_requests_select_own"
on public.patient_correction_requests
for select
to authenticated
using (
  exists (
    select 1 from public.patient_accounts a
    where a.id = patient_correction_requests.account_id
      and a.auth_user_id = (select auth.uid())
  )
);

-- Only SELF and GUARDIAN may submit a correction request (§4.2).
-- AUTHORIZED_CAREGIVER is explicitly read-only, "nothing else" -- it must
-- not satisfy this check even though it is otherwise an active grant on
-- the same patient_id.
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
  and exists (
    select 1
    from public.patient_access_grants g
    join public.patient_accounts ga on ga.id = g.account_id
    where ga.auth_user_id = (select auth.uid())
      and g.patient_id = patient_correction_requests.patient_id
      and g.relationship in ('SELF', 'GUARDIAN')
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  )
);

create policy "patient_correction_requests_select_staff"
on public.patient_correction_requests
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'nurse', 'BHW', 'midwives')
  )
);

create policy "patient_correction_requests_update_staff"
on public.patient_correction_requests
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'nurse', 'BHW', 'midwives')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'nurse', 'BHW', 'midwives')
  )
);

revoke all on public.patient_correction_requests from public, anon;

-- ============================================================
-- RLS: patient_portal_reference_ranges
-- (zero authenticated policies -- read only via the Phase 5 lab-result RPC)
-- ============================================================

alter table public.patient_portal_reference_ranges enable row level security;
revoke all on public.patient_portal_reference_ranges from public, anon, authenticated;

-- ============================================================
-- Authorization functions (§12.1)
-- ============================================================

create or replace function public.patient_portal_can_access(p_patient_id bigint)
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
      and a.status = 'active'
      and g.patient_id = p_patient_id
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

revoke execute on function public.patient_portal_can_access(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_can_access(bigint) to authenticated;

create or replace function public.patient_portal_scope(p_patient_id bigint)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select g.scope
  from public.patient_access_grants g
  join public.patient_accounts a on a.id = g.account_id
  where a.auth_user_id = (select auth.uid())
    and a.status = 'active'
    and g.patient_id = p_patient_id
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
  limit 1;
$$;

revoke execute on function public.patient_portal_scope(bigint) from PUBLIC, anon;
grant execute on function public.patient_portal_scope(bigint) to authenticated;

-- ============================================================
-- Assertions
-- ============================================================

do $$
declare
  v_missing_rls text;
  v_bad_policy_roles text;
  v_anon_grants text;
  v_anon_execute text;
begin
  -- All seven tables must have RLS enabled.
  select string_agg(c.relname, ', ')
  into v_missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'patient_accounts', 'patient_access_grants', 'patient_activation_codes',
      'patient_otp_challenges', 'patient_account_preferences',
      'patient_correction_requests', 'patient_portal_reference_ranges'
    )
    and not c.relrowsecurity;

  if v_missing_rls is not null then
    raise exception 'Patient Account Phase 2 requires RLS enabled on: %', v_missing_rls;
  end if;

  -- activation codes / otp challenges / reference ranges must carry
  -- zero policies naming the authenticated role.
  select string_agg(tablename || ':' || policyname, ', ')
  into v_bad_policy_roles
  from pg_policies
  where schemaname = 'public'
    and tablename in ('patient_activation_codes', 'patient_otp_challenges', 'patient_portal_reference_ranges')
    and 'authenticated' = any(roles);

  if v_bad_policy_roles is not null then
    raise exception 'These tables must have zero authenticated policies: %', v_bad_policy_roles;
  end if;

  -- no new table may grant table-level privileges to anon.
  select string_agg(distinct table_name, ', ')
  into v_anon_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'patient_accounts', 'patient_access_grants', 'patient_activation_codes',
      'patient_otp_challenges', 'patient_account_preferences',
      'patient_correction_requests', 'patient_portal_reference_ranges'
    )
    and grantee = 'anon';

  if v_anon_grants is not null then
    raise exception 'These Patient Account tables must not grant to anon: %', v_anon_grants;
  end if;

  -- the two authorization functions must not be executable by anon or PUBLIC.
  select string_agg(distinct routine_name, ', ')
  into v_anon_execute
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name in ('patient_portal_can_access', 'patient_portal_scope')
    and grantee in ('anon', 'PUBLIC');

  if v_anon_execute is not null then
    raise exception 'These functions must not be executable by anon/PUBLIC: %', v_anon_execute;
  end if;
end;
$$;

-- The scope check constraint must reject any value outside ('FULL','STANDARD').
-- CHECK constraints are enforced synchronously during row insertion, ahead of
-- the AFTER-ROW triggers that implement FK enforcement, so this reliably
-- exercises the constraint rather than failing on the (also-invalid) FKs.
do $$
begin
  begin
    insert into public.patient_access_grants (account_id, patient_id, relationship, scope, granted_by)
    values ('00000000-0000-0000-0000-000000000000', -1, 'SELF', 'BOGUS', '00000000-0000-0000-0000-000000000000');
    raise exception 'Patient Account Phase 2: scope check constraint did not reject an invalid value';
  exception
    when check_violation then
      raise notice 'patient_access_grants.scope check constraint correctly rejected an invalid value';
  end;
end;
$$;

-- Phase 1 invariant must still hold: no automatic staff-privilege grant
-- exists anywhere in this migration, and handle_new_user() is untouched.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
      and pg_get_functiondef(p.oid) not ilike '%insert into%profiles%'
  ) then
    raise exception 'Patient Account Phase 2 must not reintroduce trigger-based profile creation';
  end if;
end;
$$;
