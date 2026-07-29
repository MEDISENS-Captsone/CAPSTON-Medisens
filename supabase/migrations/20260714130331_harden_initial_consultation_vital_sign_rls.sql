set check_function_bodies = off;

alter table public.initial_consultation enable row level security;
alter table public.vital_sign enable row level security;

drop policy if exists "Allow authenticated selects" on public.initial_consultation;
drop policy if exists "Allow authenticated inserts" on public.initial_consultation;
drop policy if exists "Allow authenticated selects" on public.vital_sign;
drop policy if exists "Allow authenticated inserts" on public.vital_sign;

create policy "initial_consultation_select_clinical_roles"
on public.initial_consultation
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

create policy "initial_consultation_insert_nurse"
on public.initial_consultation
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'nurse'
    )
);

create policy "vital_sign_select_doctor"
on public.vital_sign
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'doctor'
    )
);

create policy "vital_sign_insert_nurse"
on public.vital_sign
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'nurse'
    )
);
