-- Staff account lifecycle: preserve historical attribution while allowing
-- administrators to disable staff access safely.

alter table public.profiles
  add column is_active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.profiles(id);

alter table public.profiles
  add constraint profiles_deactivation_state_check check (
    (is_active and deactivated_at is null and deactivated_by is null)
    or
    (not is_active and deactivated_at is not null)
  );

comment on column public.profiles.is_active is
  'Whether this staff account may access MediSens. Historical profiles remain present when false.';
comment on column public.profiles.deactivated_at is
  'Time this staff account was deactivated. Null for active accounts.';
comment on column public.profiles.deactivated_by is
  'Administrator profile that deactivated this account. Historical attribution is preserved.';

create or replace function public.guard_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_other_active_admins integer;
begin
  if old.role = 'admin'
     and old.is_active
     and (
       tg_op = 'DELETE'
       or new.role <> 'admin'
       or not new.is_active
     ) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('medisens.staff-account-lifecycle', 0)
    );

    select count(*)::integer into v_other_active_admins
    from public.profiles as p
    where p.role = 'admin'
      and p.is_active
      and p.id <> old.id;

    if v_other_active_admins = 0 then
      raise exception using errcode = '23514', message = 'last_active_admin';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function public.guard_last_active_admin() from public, anon, authenticated;

create trigger guard_last_active_admin_lifecycle
before update of role, is_active or delete on public.profiles
for each row execute function public.guard_last_active_admin();

create or replace function public.deactivate_staff_profile(
  p_target_user_id uuid,
  p_actor_user_id uuid
)
returns table (
  profile_id uuid,
  was_deactivated boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.profiles%rowtype;
  v_actor public.profiles%rowtype;
  v_active_admin_count integer;
begin
  -- Serialize all deactivation decisions so concurrent requests cannot both
  -- remove the final active administrator.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('medisens.staff-account-lifecycle', 0)
  );

  select p.* into v_actor
  from public.profiles as p
  where p.id = p_actor_user_id;

  if not found or v_actor.role <> 'admin' or not v_actor.is_active then
    raise exception using
      errcode = '42501',
      message = 'active_admin_required';
  end if;

  if p_target_user_id = p_actor_user_id then
    raise exception using
      errcode = '42501',
      message = 'self_deactivation_blocked';
  end if;

  select p.* into v_target
  from public.profiles as p
  where p.id = p_target_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'target_profile_not_found';
  end if;

  if not v_target.is_active then
    return query select v_target.id, false;
    return;
  end if;

  if v_target.role = 'admin' then
    select count(*)::integer into v_active_admin_count
    from public.profiles as p
    where p.role = 'admin' and p.is_active;

    if v_active_admin_count <= 1 then
      raise exception using
        errcode = '23514',
        message = 'last_active_admin';
    end if;
  end if;

  update public.profiles as p
  set is_active = false,
      deactivated_at = pg_catalog.clock_timestamp(),
      deactivated_by = p_actor_user_id
  where p.id = p_target_user_id;

  return query select p_target_user_id, true;
end;
$function$;

revoke all on function public.deactivate_staff_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.deactivate_staff_profile(uuid, uuid) to service_role;

create or replace function public.delete_staff_profile(
  p_target_user_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.profiles%rowtype;
  v_actor public.profiles%rowtype;
  v_active_admin_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('medisens.staff-account-lifecycle', 0)
  );

  select p.* into v_actor
  from public.profiles as p
  where p.id = p_actor_user_id;

  if not found or v_actor.role <> 'admin' or not v_actor.is_active then
    raise exception using errcode = '42501', message = 'active_admin_required';
  end if;

  if p_target_user_id = p_actor_user_id then
    raise exception using errcode = '42501', message = 'self_delete_blocked';
  end if;

  select p.* into v_target
  from public.profiles as p
  where p.id = p_target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'target_profile_not_found';
  end if;

  if v_target.role = 'admin' and v_target.is_active then
    select count(*)::integer into v_active_admin_count
    from public.profiles as p
    where p.role = 'admin' and p.is_active;

    if v_active_admin_count <= 1 then
      raise exception using errcode = '23514', message = 'last_active_admin';
    end if;
  end if;

  -- Intentional NO ACTION foreign keys remain the authoritative eligibility
  -- check. PostgreSQL raises 23503 rather than deleting attribution.
  delete from public.profiles as p where p.id = p_target_user_id;
  return p_target_user_id;
end;
$function$;

revoke all on function public.delete_staff_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_staff_profile(uuid, uuid) to service_role;

-- Existing policies that call get_my_role() now fail closed for an inactive
-- profile even while a previously issued access token remains unexpired.
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
    and p.is_active;
$function$;

revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_role() to authenticated, service_role;
