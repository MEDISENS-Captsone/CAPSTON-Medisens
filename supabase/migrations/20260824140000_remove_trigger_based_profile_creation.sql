-- Patient Account Phase 1: close the privilege window left open by
-- Supabase Auth metadata timing (corrective migration, does not edit
-- 20260824120000_isolate_patient_auth_users.sql).
--
-- Live diagnostic evidence (read-only pg_catalog inspection against the
-- linked project):
--   - public.handle_new_user() (oid 40089) already contains the Phase 1
--     condition on new.raw_app_meta_data ->> 'account_type' = 'patient'.
--   - on_auth_user_created is ENABLED and points directly at that oid.
--   - No second trigger/function inserts into public.profiles.
--   - supabase_migrations.schema_migrations genuinely records
--     20260824120000, and its live function body matches the migration.
-- So this is not a deployment mismatch: the code that shipped is exactly
-- the code that is running.
--
-- The remaining gap is timing, not logic. GoTrue's admin "create user"
-- call does not reliably populate raw_app_meta_data as part of the same
-- INSERT that fires this AFTER INSERT trigger for every code path; the
-- Phase 1 live gate showed a patient-flagged test user still received a
-- profiles row. Any condition evaluated inside an AFTER INSERT trigger on
-- auth.users is therefore untrustworthy as a security boundary here,
-- because the field it depends on is not guaranteed to be visible yet.
--
-- The fix does not look for a more "reliable" column to key off inside
-- the trigger. It removes the trigger's ability to create a profile at
-- all. Inspection of supabase/functions/create-user/index.ts confirms
-- staff provisioning already performs its own unconditional
-- `adminClient.from('profiles').upsert({ id, email, full_name, role })`
-- immediately after admin.createUser(), independent of whatever the
-- trigger does or does not insert first. That upsert is the only thing
-- that has ever determined a staff member's real role in production —
-- the trigger's prior 'nurse' insert was always just a same-transaction
-- placeholder immediately overwritten by that upsert. Removing the
-- placeholder removes the window without changing what staff accounts
-- end up with.
--
-- No other code path creates an auth user (grep confirms create-user is
-- the only caller of auth.admin.createUser / auth.signUp in the repo),
-- so this is a complete fix, not a partial mitigation.

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    raise exception 'Expected public.handle_new_user() to exist before this corrective migration';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created'
      and t.tgenabled <> 'D'
  ) then
    raise exception 'Expected on_auth_user_created to be enabled on auth.users before this corrective migration';
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff profiles are created explicitly and exclusively by the
  -- create-user Edge Function's service-role upsert, immediately after
  -- it calls auth.admin.createUser(). Patient Portal accounts (Patient
  -- Account Phase 3+) never receive a profiles row at all. This trigger
  -- intentionally does nothing on every auth.users insert, staff or
  -- patient, public sign-up or admin-created: there is no condition here
  -- for any code path to race against, so there is no privilege window.
  return new;
end;
$$;

-- create or replace preserves existing grants: execute on
-- handle_new_user() was already revoked from PUBLIC, anon, authenticated
-- by 20260714072705_restrict_internal_security_definer_functions.sql.
-- The trigger definition itself is unchanged and is not recreated here.

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created'
      and t.tgenabled <> 'D'
  ) then
    raise exception 'This corrective migration must not disable or remove on_auth_user_created';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user' and p.prosecdef
  ) then
    raise exception 'public.handle_new_user() must remain SECURITY DEFINER';
  end if;

  if pg_get_functiondef(
    (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'handle_new_user')
  ) ilike '%insert into%profiles%' then
    raise exception 'public.handle_new_user() must not contain any insert into public.profiles after this migration';
  end if;
end;
$$;
