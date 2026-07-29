-- Allow Doctor and Midwife users to execute the shared analytics aggregate RPC layer.
-- Public analytics RPCs still grant EXECUTE only to authenticated users and each RPC
-- calls this helper before returning aggregate-only data.

create or replace function analytics_private.require_analytics_role()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Analytics access requires authentication.' using errcode = '42501';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(p.role))
  into v_role
  from public.profiles as p
  where p.id::text = (select auth.uid())::text
  limit 1;

  if v_role is null or v_role not in ('doctor', 'midwives') then
    raise exception 'Analytics access is limited to Doctor and Midwife accounts.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function analytics_private.require_analytics_role() from public, anon, authenticated;
