-- Clinical and Geographic Analytics are shared by Doctor and Midwife users.
-- Staff Operations must use a separate Doctor-only authorization boundary.
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
    raise exception 'Analytics access is limited to authorized clinical analytics accounts.' using errcode = '42501';
  end if;
end;
$$;

comment on function analytics_private.require_analytics_role() is
  'Authorizes Clinical and Geographic Analytics for doctor and midwives only. Do not use for Staff Operations, which must remain Doctor-only.';

revoke all on function analytics_private.require_analytics_role()
from public, anon, authenticated;
