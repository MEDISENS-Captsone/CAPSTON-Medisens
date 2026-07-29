-- Security Phase 2B: protect patient archive fields from direct client updates.
--
-- Ordinary patient profile updates remain direct table updates, but archive
-- state fields can only be changed by trusted server-side roles such as the
-- existing archive-patient-record Edge Function service-role client.

create or replace function public.prevent_patient_archive_field_client_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if new.archive_status is distinct from old.archive_status
    or new.archived_at is distinct from old.archived_at
    or new.archived_by is distinct from old.archived_by
    or new.archive_reason is distinct from old.archive_reason
    or new.archive_reviewed_at is distinct from old.archive_reviewed_at
    or new.archive_reviewed_by is distinct from old.archive_reviewed_by
    or new.archive_protected is distinct from old.archive_protected
  then
    raise exception 'Patient archive fields cannot be updated directly.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_patient_archive_fields_before_update
  on public.patients;

create trigger protect_patient_archive_fields_before_update
before update on public.patients
for each row
execute function public.prevent_patient_archive_field_client_update();

drop policy if exists "Staff can update patients"
  on public.patients;

create policy "Staff can update patients"
on public.patients
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('BHW', 'nurse', 'doctor', 'midwives')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('BHW', 'nurse', 'doctor', 'midwives')
  )
);
