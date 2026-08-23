-- Phase 8 corrective migration: COALESCE is SQL syntax, not a pg_catalog function.
-- The prior schema-qualified invocation caused every guarded workflow transition
-- to fail before the Nurse/Midwife RPC could update the report status.
create or replace function public.fhsis_guard_report_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.status, old.submitted_at, old.verified_by, old.verified_at, old.returned_at)
      is distinct from (new.status, new.submitted_at, new.verified_by, new.verified_at, new.returned_at)
     and coalesce(pg_catalog.current_setting('medisens.fhsis_transition', true), '') <> 'on' then
    raise exception 'FHSIS report workflow state can only change through its controlled transition functions.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fhsis_guard_report_transition() from public, anon, authenticated;
