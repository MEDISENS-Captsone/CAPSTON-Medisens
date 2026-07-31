set check_function_bodies = off;

create or replace function public.guard_prescription_create()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if new.status is distinct from 'Pending' then
        raise exception 'Prescription must start as pending';
    end if;

    if new.dispensed_at is not null then
        raise exception 'Pending prescription cannot have a dispensed timestamp';
    end if;

    return new;
end;
$$;

drop trigger if exists guard_prescription_create
on public.prescription;

create trigger guard_prescription_create
before insert on public.prescription
for each row
execute function public.guard_prescription_create();

create or replace function public.guard_prescription_dispensing_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_profile_role text;
    dispensing_fields_changed boolean;
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

    dispensing_fields_changed :=
        new.status is distinct from old.status
        or new.dispensed_at is distinct from old.dispensed_at;

    if not dispensing_fields_changed then
        return new;
    end if;

    if old.status = 'Dispensed' then
        raise exception 'Dispensed prescription cannot be changed';
    end if;

    if old.status is distinct from 'Pending'
       or new.status is distinct from 'Dispensed'
       or old.dispensed_at is not null
       or new.dispensed_at is null then
        raise exception 'Invalid prescription dispensing transition';
    end if;

    return new;
end;
$$;
