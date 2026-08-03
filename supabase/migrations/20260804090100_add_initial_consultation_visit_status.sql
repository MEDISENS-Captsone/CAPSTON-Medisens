-- Add an explicit visit-disposition workflow to initial_consultation so
-- nurse intake can mark a visit "completed" (no doctor needed) or
-- "referred" (needs doctor), instead of the doctor queue implicitly
-- inferring "needs doctor" from "no consultation row yet exists".
--
-- Column name is `visit_disposition` (not `visit_status`/`referred_by`) to
-- avoid colliding with the existing free-text `referred_by` display field,
-- which is unrelated routing/display data and is left untouched.

set check_function_bodies = off;

alter table public.initial_consultation
  add column if not exists visit_disposition text not null default 'pending';

-- Backfill of pre-existing rows.
--
-- `add column ... default 'pending'` marks every historical row 'pending',
-- which is wrong in both directions once the doctor queue filters strictly on
-- 'referred':
--   * rows that already have a linked consultation row were already seen by a
--     doctor historically -> they must read 'completed' so they never
--     reappear in the queue;
--   * rows with no linked consultation row are genuinely still awaiting a
--     doctor -> they must read 'referred' so the stricter queue filter does
--     not silently drop them.
-- This runs before the guard trigger is created, so it is not blocked by the
-- immutability rules below.
update public.initial_consultation i
set visit_disposition = case
  when exists (
    select 1
    from public.consultation c
    where c.initial_consultation_id = i.initialconsultation_id
  ) then 'completed'
  else 'referred'
end
where i.visit_disposition = 'pending';

alter table public.initial_consultation
  drop constraint if exists initial_consultation_visit_disposition_check;

alter table public.initial_consultation
  add constraint initial_consultation_visit_disposition_check
  check (visit_disposition in ('pending', 'referred', 'completed'));

-- Guard for disposition updates.
--
-- Two independent rules:
--
-- 1. Isolation: an update that changes visit_disposition may not change any
--    other column on the row. Intake staff get a row-level RLS UPDATE policy
--    (Postgres RLS cannot be scoped to a column), so this trigger is the only
--    thing preventing that policy from becoming a general write grant over
--    the whole clinical record. The OLD/NEW comparison below covers *every*
--    other column, present and future, because it diffs the whole row image
--    minus visit_disposition rather than enumerating fields.
--
-- 2. Correction window: a disposition may be corrected (nurse referred by
--    mistake, or marked complete when the doctor still needs to see the
--    patient) only while no doctor consultation exists for that intake. Once
--    a consultation row exists the doctor has acted, and the disposition
--    freezes so a patient cannot be yanked into or out of the queue after the
--    fact.
--
-- SECURITY DEFINER with a fixed empty search_path: the consultation-existence
-- check must be authoritative and must not be defeatable by the caller's RLS
-- visibility of public.consultation or by search_path manipulation. The
-- function returns no data, only raises.
create or replace function public.guard_initial_consultation_visit_disposition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_disposition is distinct from old.visit_disposition then
    if (pg_catalog.to_jsonb(new) - 'visit_disposition') is distinct from (pg_catalog.to_jsonb(old) - 'visit_disposition') then
      raise exception 'Visit disposition update cannot include other field changes';
    end if;

    if new.visit_disposition not in ('pending', 'referred', 'completed') then
      raise exception 'Invalid visit disposition %', new.visit_disposition;
    end if;

    if exists (
      select 1
      from public.consultation c
      where c.initial_consultation_id = new.initialconsultation_id
    ) then
      raise exception 'Visit disposition cannot be changed after a doctor consultation exists for this visit';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_initial_consultation_visit_disposition() from public;
revoke all on function public.guard_initial_consultation_visit_disposition() from anon;

drop trigger if exists guard_initial_consultation_visit_disposition on public.initial_consultation;
create trigger guard_initial_consultation_visit_disposition
  before update on public.initial_consultation
  for each row
  execute function public.guard_initial_consultation_visit_disposition();

-- RLS: allow nurse to update initial_consultation rows, following the role
-- check pattern from 20260714130331_harden_initial_consultation_vital_sign_rls.sql.
--
-- Nurse only, deliberately: nurse is the only role with an
-- initial_consultation INSERT policy and the only role with a reachable
-- intake UI (the initial-consultation form is rendered exclusively inside the
-- nurse dashboard). Midwives have no intake or intake-correction workflow, so
-- granting them UPDATE here would be an unused widening of write access.
--
-- The trigger above restricts what such an update may actually change
-- (visit_disposition only, and only before a doctor consultation exists), so
-- this row-level policy does not become a general write grant.
drop policy if exists "initial_consultation_update_visit_disposition" on public.initial_consultation;

create policy "initial_consultation_update_visit_disposition"
on public.initial_consultation
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'nurse'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'nurse'
  )
);
