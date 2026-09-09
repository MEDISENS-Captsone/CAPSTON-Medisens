-- Phase 5: server-authorized Downtime Reference Import.
-- This migration intentionally accepts only validated V1 nurse-intake data.
-- Doctor, Laboratory, Pharmacy, Follow-Up, and new-patient writes remain out
-- of scope. No client can insert into these tables directly; the RPC is the
-- only write path and records importer/attribution metadata separately.

create table if not exists public.downtime_import_batches (
  id uuid primary key default gen_random_uuid(),
  template_version text not null,
  source text not null default 'Paper Downtime Record',
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default timezone('utc', now()),
  status text not null default 'COMPLETED' check (status in ('COMPLETED', 'COMPLETED_WITH_ERRORS', 'REJECTED')),
  summary jsonb not null default '{}'::jsonb,
  constraint downtime_import_batches_source_check check (source = 'Paper Downtime Record'),
  constraint downtime_import_batches_summary_object_check check (jsonb_typeof(summary) = 'object')
);

create table if not exists public.downtime_import_records (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.downtime_import_batches(id) on delete cascade,
  downtime_reference text not null unique,
  patient_id bigint not null references public.patients(id),
  source text not null default 'Paper Downtime Record',
  actual_service_date date not null,
  actual_service_time time not null,
  responsible_staff_reference text,
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default timezone('utc', now()),
  initial_consultation_id bigint references public.initial_consultation(initialconsultation_id),
  status text not null check (status in ('READY', 'IMPORTED', 'ERROR', 'DUPLICATE', 'CONFLICT', 'SKIPPED')),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint downtime_import_records_source_check check (source = 'Paper Downtime Record'),
  constraint downtime_import_records_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists downtime_import_records_batch_idx on public.downtime_import_records (batch_id);
create index if not exists downtime_import_records_patient_idx on public.downtime_import_records (patient_id, imported_at desc);

alter table public.downtime_import_batches enable row level security;
alter table public.downtime_import_records enable row level security;

drop policy if exists "Nurses read own downtime import batches" on public.downtime_import_batches;
create policy "Nurses read own downtime import batches"
on public.downtime_import_batches for select to authenticated
using (imported_by = (select auth.uid()));

drop policy if exists "Nurses read own downtime import records" on public.downtime_import_records;
create policy "Nurses read own downtime import records"
on public.downtime_import_records for select to authenticated
using (imported_by = (select auth.uid()));

revoke all on table public.downtime_import_batches from public, anon, authenticated;
revoke all on table public.downtime_import_records from public, anon, authenticated;
grant select on table public.downtime_import_batches, public.downtime_import_records to authenticated;
grant usage, select on sequence public.downtime_import_records_id_seq to postgres;

create or replace function public.import_downtime_batch(
  p_template_version text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_batch_id uuid;
  v_row jsonb;
  v_index integer := 0;
  v_reference text;
  v_patient_id bigint;
  v_service_date date;
  v_service_time time;
  v_initial jsonb;
  v_vitals jsonb;
  v_initial_id bigint;
  v_status text;
  v_message text;
  v_results jsonb := '[]'::jsonb;
  v_ready integer := 0;
  v_imported integer := 0;
  v_duplicate integer := 0;
  v_error integer := 0;
  v_skipped integer := 0;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor;
  if v_actor is null or coalesce(v_role, '') <> 'nurse' then
    raise exception 'Downtime import is restricted to nurses' using errcode = '42501';
  end if;
  if p_template_version is distinct from 'MEDISENS-DOWNTIME-V1' then
    raise exception 'Unsupported downtime workbook version' using errcode = '22023';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'Downtime import requires at least one record' using errcode = '22023';
  end if;
  if jsonb_array_length(p_records) > 500 then
    raise exception 'Downtime import batch exceeds the 500-record limit' using errcode = '22023';
  end if;

  insert into public.downtime_import_batches (template_version, imported_by, status)
  values (p_template_version, v_actor, 'COMPLETED')
  returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_records)
  loop
    v_index := v_index + 1;
    v_reference := nullif(btrim(v_row ->> 'downtime_reference'), '');
    v_status := 'READY';
    v_message := null;

    if v_reference is null then
      v_status := 'ERROR'; v_message := 'downtime_reference is required';
    elsif not v_reference ~ '^DT-[0-9]{8}-[0-9]{3,}$' then
      v_status := 'ERROR'; v_message := 'downtime_reference must match DT-YYYYMMDD-NNN';
    elsif exists (select 1 from public.downtime_import_records r where r.downtime_reference = v_reference) then
      v_status := 'DUPLICATE'; v_message := 'Downtime reference was already imported';
    elsif coalesce(v_row ->> 'source', '') <> 'Paper Downtime Record' then
      v_status := 'ERROR'; v_message := 'source must be Paper Downtime Record';
    elsif coalesce(v_row ->> 'patient_id', '') !~ '^[0-9]+$' then
      v_status := 'ERROR'; v_message := 'patient_id must be a whole number';
    else
      v_patient_id := (v_row ->> 'patient_id')::bigint;
      if not exists (
        select 1 from public.patients p
        where p.id = v_patient_id
          and p.archive_status = 'active'
          and exists (select 1 from public.patient_consent c where c.patient_id = p.id)
      ) then
        v_status := 'ERROR'; v_message := 'Patient must exist, be active, and have consent';
      elsif coalesce(v_row ->> 'actual_service_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        v_status := 'ERROR'; v_message := 'actual_service_date must use YYYY-MM-DD';
      elsif coalesce(v_row ->> 'actual_service_time', '') !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then
        v_status := 'ERROR'; v_message := 'actual_service_time must use HH:MM';
      elsif coalesce(v_row ->> 'consultation_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        v_status := 'ERROR'; v_message := 'consultation_date must use YYYY-MM-DD';
      elsif coalesce(v_row ->> 'consultation_time', '') !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then
        v_status := 'ERROR'; v_message := 'consultation_time must use HH:MM';
      elsif nullif(btrim(v_row ->> 'chief_complaint'), '') is null then
        v_status := 'ERROR'; v_message := 'chief_complaint is required';
      elsif coalesce(v_row ->> 'visit_disposition', '') not in ('pending', 'referred', 'completed') then
        v_status := 'ERROR'; v_message := 'visit_disposition is invalid';
      end if;
    end if;

    if v_status = 'READY' then
      v_service_date := (v_row ->> 'actual_service_date')::date;
      v_service_time := (v_row ->> 'actual_service_time')::time;
      v_initial := jsonb_build_object(
        'patient_id', v_patient_id,
        'consultation_date', v_row ->> 'consultation_date',
        'consultation_time', v_row ->> 'consultation_time',
        'mode_of_transaction', v_row ->> 'mode_of_transaction',
        'referred_by', v_row ->> 'referred_by',
        'mode_of_transfer', v_row ->> 'mode_of_transfer',
        'chief_complaint', v_row ->> 'chief_complaint',
        'diagnosis', null,
        'visit_disposition', v_row ->> 'visit_disposition'
      );
      v_vitals := coalesce(v_row -> 'vitals', '{}'::jsonb) || jsonb_build_object('patient_id', v_patient_id);
      begin
        v_initial_id := public.record_initial_intake(v_initial, v_vitals, null);
        insert into public.downtime_import_records (
          batch_id, downtime_reference, patient_id, actual_service_date, actual_service_time,
          responsible_staff_reference, imported_by, initial_consultation_id, status, message, metadata
        ) values (
          v_batch_id, v_reference, v_patient_id, v_service_date, v_service_time,
          nullif(v_row ->> 'responsible_staff_reference', ''), v_actor, v_initial_id, 'IMPORTED',
          'Imported by the authorized Nurse encoder; clinical authorship remains role-owned.',
          jsonb_build_object('template_version', p_template_version, 'source', 'Paper Downtime Record')
        );
        insert into public.audit_logs (user_id, user_role, action, module, record_id, record_type, description, metadata)
        values (v_actor, v_role, 'create', 'Downtime Reference Import', v_initial_id::text, 'initial_consultation',
          'Imported a paper downtime Nurse intake record.',
          jsonb_build_object('downtime_reference', v_reference, 'patient_id', v_patient_id, 'actual_service_date', v_service_date, 'actual_service_time', v_service_time, 'source', 'Paper Downtime Record'));
        v_imported := v_imported + 1;
      exception when others then
        v_status := 'ERROR'; v_message := 'Record could not be imported safely'; v_error := v_error + 1;
      end;
    elsif v_status = 'DUPLICATE' then
      v_duplicate := v_duplicate + 1;
    else
      v_error := v_error + 1;
    end if;

    if v_status = 'READY' then v_ready := v_ready + 1; end if;
    if v_status = 'SKIPPED' then v_skipped := v_skipped + 1; end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_index, 'downtime_reference', v_reference, 'status', case when v_status = 'READY' then 'IMPORTED' else v_status end, 'message', v_message));
  end loop;

  update public.downtime_import_batches
  set status = case when v_error > 0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end,
      summary = jsonb_build_object('imported', v_imported, 'errors', v_error, 'duplicates', v_duplicate, 'skipped', v_skipped)
  where id = v_batch_id;

  return jsonb_build_object('batch_id', v_batch_id, 'template_version', p_template_version, 'results', v_results, 'summary', jsonb_build_object('imported', v_imported, 'errors', v_error, 'duplicates', v_duplicate, 'skipped', v_skipped));
end;
$$;

revoke all on function public.import_downtime_batch(text, jsonb) from public, anon, service_role;
grant execute on function public.import_downtime_batch(text, jsonb) to authenticated;
