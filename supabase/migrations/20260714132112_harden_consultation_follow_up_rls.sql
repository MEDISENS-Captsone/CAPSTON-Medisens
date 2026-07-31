set check_function_bodies = off;

alter table public.consultation enable row level security;
alter table public.follow_up enable row level security;

drop policy if exists "Allow authenticated selects" on public.consultation;
drop policy if exists "Allow authenticated inserts" on public.consultation;
drop policy if exists "Allow authenticated selects" on public.follow_up;
drop policy if exists "Allow authenticated inserts" on public.follow_up;
drop policy if exists "Doctors can manage consultations" on public.consultation;

create policy "consultation_select_clinical_roles"
on public.consultation
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role in ('BHW', 'nurse', 'doctor', 'midwives')
    )
);

create policy "consultation_insert_doctor"
on public.consultation
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

create policy "consultation_update_doctor"
on public.consultation
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'doctor'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'doctor'
    )
);

create policy "follow_up_select_current_readers"
on public.follow_up
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role in ('BHW', 'nurse', 'doctor', 'midwives')
    )
);

create policy "follow_up_insert_doctor"
on public.follow_up
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

create policy "follow_up_update_doctor"
on public.follow_up
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'doctor'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'doctor'
    )
);
