-- Analytics is a clinical/operational Doctor surface. Admin system activity
-- remains available through the existing Audit Log, not these RPCs.
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

  if v_role is distinct from 'doctor' then
    raise exception 'Analytics access is limited to Doctor accounts.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function analytics_private.require_analytics_role() from public, anon, authenticated;
