set check_function_bodies = off;

create or replace function public.guard_lab_request_create()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from 'Pending' then
    raise exception 'Lab requests must start in Pending status';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_lab_request_create on public.lab_request;
create trigger guard_lab_request_create
  before insert on public.lab_request
  for each row
  execute function public.guard_lab_request_create();

create or replace function public.guard_lab_request_status_update()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Laboratory request updates are limited to status';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'Completed' then
    raise exception 'Completed lab requests cannot return to an earlier state';
  end if;

  if coalesce(old.status, 'Pending') = 'Pending' and new.status = 'Completed' then
    return new;
  end if;

  raise exception 'Invalid lab request status transition';
end;
$$;

drop trigger if exists guard_lab_request_status_update on public.lab_request;
create trigger guard_lab_request_status_update
  before update on public.lab_request
  for each row
  execute function public.guard_lab_request_status_update();

create or replace function public.guard_lab_result_completion()
returns trigger
language plpgsql
as $$
declare
  request_record public.lab_request%rowtype;
begin
  if new.labrequest_id is null then
    raise exception 'Lab results require a lab request';
  end if;

  select *
  into request_record
  from public.lab_request
  where labrequest_id = new.labrequest_id;

  if not found then
    raise exception 'Lab results require a valid lab request';
  end if;

  if new.status is distinct from 'Completed' then
    raise exception 'Lab results must be Completed';
  end if;

  if new.patient_id is distinct from request_record.patient_id then
    raise exception 'Lab result patient must match the lab request';
  end if;

  if new.consultation_id is distinct from request_record.consultation_id then
    raise exception 'Lab result consultation must match the lab request';
  end if;

  if nullif(btrim(coalesce(new.findings, '')), '') is null then
    raise exception 'Lab results require findings';
  end if;

  if nullif(btrim(coalesce(new.performed_by, '')), '') is null then
    raise exception 'Lab results require a performer';
  end if;

  if new.date_performed is null then
    raise exception 'Lab results require a performed date';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_lab_result_completion on public.lab_result;
create trigger guard_lab_result_completion
  before insert or update on public.lab_result
  for each row
  execute function public.guard_lab_result_completion();

create or replace function public.sync_lab_request_completed_from_result()
returns trigger
language plpgsql
as $$
begin
  update public.lab_request
  set status = 'Completed'
  where labrequest_id = new.labrequest_id
    and coalesce(status, 'Pending') = 'Pending';

  return new;
end;
$$;

drop trigger if exists sync_lab_request_completed_from_result on public.lab_result;
create trigger sync_lab_request_completed_from_result
  after insert or update of status on public.lab_result
  for each row
  when (new.status = 'Completed')
  execute function public.sync_lab_request_completed_from_result();
