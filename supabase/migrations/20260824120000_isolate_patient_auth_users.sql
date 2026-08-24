-- Patient Account Phase 1: auth isolation (security prerequisite).
--
-- public.handle_new_user() currently inserts a profiles row with a
-- hard-coded role of 'nurse' for every auth.users insert, with no
-- exception. Every existing clinical SELECT policy grants full read to
-- 'nurse'. Before any patient-facing auth user can be created (Patient
-- Account Phase 3+), that trigger must stop creating a staff profile for
-- patient accounts, or a patient would receive a complete staff-level
-- view of the RHU database on first login.
--
-- This migration redefines handle_new_user() to skip the profiles insert
-- only when the new auth user carries app_metadata.account_type = 'patient'.
-- app_metadata is not user-writable (only a service-role client or the
-- Supabase Auth admin API can set it), which is why it is the correct
-- discriminator; user_metadata must never be used for this check because
-- it is client-controlled at signup.
--
-- The staff path (no account_type, or any value other than 'patient') is
-- byte-identical to the current behavior: insert into public.profiles
-- with role 'nurse', upsert full_name/email on conflict. Staff-created
-- accounts still get their real role from the create-user Edge Function's
-- subsequent service-role upsert, exactly as today.
--
-- No profiles policies, no clinical table, and no other function are
-- touched by this migration.

do $$
declare
  v_profiles_policy_count_before int;
begin
  select count(*) into v_profiles_policy_count_before
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles';

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    raise exception 'Patient auth isolation requires an existing public.handle_new_user() to redefine';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created'
  ) then
    raise exception 'Patient auth isolation requires the existing on_auth_user_created trigger on auth.users';
  end if;

  perform set_config('medisens.profiles_policy_count_before', v_profiles_policy_count_before::text, true);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Patient Portal auth users are isolated from the staff profile table.
  -- app_metadata is set only by service-role/admin-API calls (Patient
  -- Account activation Edge Functions, from Phase 3 onward), never by the
  -- client, so this check cannot be spoofed from a public sign-up.
  if new.raw_app_meta_data ->> 'account_type' = 'patient' then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'nurse'
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email;

  return new;
end;
$$;

-- create or replace preserves existing grants (execute already revoked
-- from PUBLIC, anon, authenticated by 20260714072705); the trigger
-- definition itself is unchanged, so it is not recreated here.

do $$
declare
  v_profiles_policy_count_after int;
  v_profiles_policy_count_before int;
begin
  select count(*) into v_profiles_policy_count_after
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles';

  v_profiles_policy_count_before := current_setting('medisens.profiles_policy_count_before')::int;

  if v_profiles_policy_count_after is distinct from v_profiles_policy_count_before then
    raise exception 'Patient auth isolation must not change public.profiles policies (before=%, after=%)',
      v_profiles_policy_count_before, v_profiles_policy_count_after;
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created'
  ) then
    raise exception 'Patient auth isolation removed the on_auth_user_created trigger unexpectedly';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user' and p.prosecdef
  ) then
    raise exception 'Patient auth isolation: handle_new_user() must remain SECURITY DEFINER';
  end if;
end;
$$;
