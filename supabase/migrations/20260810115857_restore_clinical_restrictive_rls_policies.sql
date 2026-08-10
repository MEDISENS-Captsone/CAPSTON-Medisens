-- Restore audited restrictive clinical RLS policies before removing broad grants.
-- Assertions abort the transaction before cleanup if safety preconditions fail.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('initial_consultation', 'vital_sign', 'consultation', 'follow_up')
      and not c.relrowsecurity
  ) then
    raise exception 'Clinical RLS remediation requires RLS enabled on every target table';
  end if;

  if (
    select count(*)
    from pg_policies p
    where p.schemaname = 'public'
      and (p.tablename, p.policyname, p.cmd) in (
        ('initial_consultation', 'initial_consultation_insert_midwife', 'INSERT'),
        ('initial_consultation', 'initial_consultation_update_visit_disposition', 'UPDATE'),
        ('initial_consultation', 'initial_consultation_update_visit_disposition_midwife', 'UPDATE'),
        ('vital_sign', 'vital_sign_insert_midwife', 'INSERT'),
        ('follow_up', 'Doctors can update follow_ups', 'UPDATE')
      )
  ) <> 5 then
    raise exception 'Clinical RLS remediation requires existing narrow midwife and doctor follow-up policies';
  end if;
end;
$$;

drop policy if exists "initial_consultation_select_clinical_roles" on public.initial_consultation;
drop policy if exists "initial_consultation_insert_nurse" on public.initial_consultation;
drop policy if exists "vital_sign_select_doctor" on public.vital_sign;
drop policy if exists "vital_sign_insert_nurse" on public.vital_sign;
drop policy if exists "consultation_select_clinical_roles" on public.consultation;
drop policy if exists "consultation_insert_doctor" on public.consultation;
drop policy if exists "consultation_update_doctor" on public.consultation;
drop policy if exists "follow_up_select_current_readers" on public.follow_up;
drop policy if exists "follow_up_insert_doctor" on public.follow_up;

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

do $$
begin
  if exists (
    select 1
    from (
      values
        ('initial_consultation', 'initial_consultation_select_clinical_roles', 'SELECT'),
        ('initial_consultation', 'initial_consultation_insert_nurse', 'INSERT'),
        ('vital_sign', 'vital_sign_select_doctor', 'SELECT'),
        ('vital_sign', 'vital_sign_insert_nurse', 'INSERT'),
        ('consultation', 'consultation_select_clinical_roles', 'SELECT'),
        ('consultation', 'consultation_insert_doctor', 'INSERT'),
        ('consultation', 'consultation_update_doctor', 'UPDATE'),
        ('follow_up', 'follow_up_select_current_readers', 'SELECT'),
        ('follow_up', 'follow_up_insert_doctor', 'INSERT')
    ) as required(tablename, policyname, cmd)
    left join pg_policies p
      on p.schemaname = 'public'
     and p.tablename = required.tablename
     and p.policyname = required.policyname
     and p.cmd = required.cmd
    where p.policyname is null
  ) then
    raise exception 'Clinical RLS remediation did not restore every required restrictive policy';
  end if;
end;
$$;

drop policy if exists "Allow authenticated selects" on public.initial_consultation;
drop policy if exists "Allow authenticated inserts" on public.initial_consultation;
drop policy if exists "Allow authenticated selects" on public.vital_sign;
drop policy if exists "Allow authenticated inserts" on public.vital_sign;
drop policy if exists "Allow authenticated selects" on public.consultation;
drop policy if exists "Allow authenticated inserts" on public.consultation;
drop policy if exists "Doctor full access on consultations" on public.consultation;
drop policy if exists "Allow authenticated selects" on public.follow_up;
drop policy if exists "Allow authenticated inserts" on public.follow_up;

do $$
begin
  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('initial_consultation', 'vital_sign', 'consultation', 'follow_up')
      and p.cmd = 'DELETE'
  ) then
    raise exception 'Clinical RLS remediation forbids client DELETE policies on target tables';
  end if;
end;
$$;
