set check_function_bodies = off;

alter table public.lab_request enable row level security;
alter table public.lab_result enable row level security;
alter table public.prescription enable row level security;

create or replace function public.guard_prescription_dispensing_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_profile_role text;
begin
    select p.role
      into current_profile_role
      from public.profiles p
     where p.id = (select auth.uid());

    if current_profile_role = 'pharmacist'
       and (to_jsonb(new) - array['status', 'dispensed_at'])
           is distinct from
           (to_jsonb(old) - array['status', 'dispensed_at']) then
        raise exception 'Prescription update is not allowed';
    end if;

    return new;
end;
$$;

drop trigger if exists guard_prescription_dispensing_update
on public.prescription;

create trigger guard_prescription_dispensing_update
before update on public.prescription
for each row
execute function public.guard_prescription_dispensing_update();

drop policy if exists "Allow authenticated selects" on public.lab_request;
drop policy if exists "Allow authenticated inserts" on public.lab_request;
drop policy if exists "Allow authenticated updates" on public.lab_request;
drop policy if exists "Allow authenticated selects" on public.lab_result;
drop policy if exists "Allow authenticated inserts" on public.lab_result;
drop policy if exists "Allow authenticated updates" on public.lab_result;
drop policy if exists "Allow authenticated selects" on public.prescription;
drop policy if exists "Allow authenticated inserts" on public.prescription;
drop policy if exists "Allow authenticated updates" on public.prescription;

create policy "lab_request_select_current_readers"
on public.lab_request
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role in ('BHW', 'nurse', 'doctor', 'midwives', 'labaratory')
    )
);

create policy "lab_request_insert_doctor"
on public.lab_request
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'doctor'
    )
);

create policy "lab_request_update_laboratory"
on public.lab_request
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'labaratory'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'labaratory'
    )
);

create policy "lab_result_select_current_readers"
on public.lab_result
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role in ('BHW', 'nurse', 'doctor', 'midwives', 'labaratory')
    )
);

create policy "lab_result_insert_laboratory"
on public.lab_result
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'labaratory'
    )
);

create policy "lab_result_update_laboratory"
on public.lab_result
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'labaratory'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'labaratory'
    )
);

create policy "prescription_select_current_readers"
on public.prescription
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role in ('BHW', 'nurse', 'doctor', 'midwives', 'pharmacist')
    )
);

create policy "prescription_insert_doctor"
on public.prescription
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'doctor'
    )
);

create policy "prescription_update_pharmacist"
on public.prescription
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'pharmacist'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'pharmacist'
    )
);
