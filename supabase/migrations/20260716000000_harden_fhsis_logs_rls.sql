-- Security Phase 2F: harden fhsis_logs RLS.
--
-- Replace the broad authenticated ALL policy with verb-specific policies for
-- confirmed FHSIS reporting, census, patient history, and vaccination workflows.
-- Normal authenticated users receive no DELETE policy.

alter table public.fhsis_logs enable row level security;

drop policy if exists "Allow authenticated access"
  on public.fhsis_logs;

drop policy if exists "fhsis_logs_select_current_readers"
  on public.fhsis_logs;
drop policy if exists "fhsis_logs_insert_confirmed_workflows"
  on public.fhsis_logs;
drop policy if exists "fhsis_logs_update_vaccination_workflow"
  on public.fhsis_logs;

create policy "fhsis_logs_select_current_readers"
on public.fhsis_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('BHW', 'nurse', 'doctor', 'midwives')
  )
);

create policy "fhsis_logs_insert_confirmed_workflows"
on public.fhsis_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'midwives'
        or (
          p.role in ('BHW', 'nurse', 'doctor')
          and category = 'vaccination'
        )
      )
  )
);

create policy "fhsis_logs_update_vaccination_workflow"
on public.fhsis_logs
for update
to authenticated
using (
  category = 'vaccination'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('BHW', 'nurse', 'doctor', 'midwives')
  )
)
with check (
  category = 'vaccination'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('BHW', 'nurse', 'doctor', 'midwives')
  )
);
