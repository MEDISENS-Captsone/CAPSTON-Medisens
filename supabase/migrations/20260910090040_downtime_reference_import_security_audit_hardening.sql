-- Phase 6: security and audit hardening for the V1 downtime import.
-- The importer remains limited to active Nurses.  Clinical staff attribution
-- is resolved from active profiles on the server and is never trusted as a
-- free-form workbook value.

alter table public.downtime_import_records
  add column if not exists responsible_staff_id uuid references public.profiles(id);

create index if not exists downtime_import_records_responsible_staff_idx
  on public.downtime_import_records (responsible_staff_id, imported_at desc);

revoke insert, update, delete, truncate on table public.downtime_import_batches from authenticated;
revoke insert, update, delete, truncate on table public.downtime_import_records from authenticated;

-- Audit rows are written by trusted server-side functions only.  The existing
-- RLS SELECT policy remains the read boundary for authorized staff.
revoke insert, update, delete, truncate on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

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
  v_staff_reference text;
  v_responsible_staff_id uuid;
  v_staff_matches integer;
  v_results jsonb := '[]'::jsonb;
  v_imported integer := 0;
  v_duplicate integer := 0;
  v_error integer := 0;
  v_skipped integer := 0;
begin
  select p.role into v_role
  from public.profiles as p
  where p.id = v_actor
    and p.is_active;

  if v_actor is null or coalesce(v_role, '') <> 'nurse' then
    raise exception 'Downtime import is restricted to active nurses' using errcode = '42501';
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
    v_reference := nullif(pg_catalog.btrim(v_row ->> 'downtime_reference'), '');
    v_status := 'READY';
    v_message := null;
    v_responsible_staff_id := null;
    v_staff_reference := nullif(pg_catalog.btrim(v_row ->> 'responsible_staff_reference'), '');

    if v_reference is null then
      v_status := 'ERROR'; v_message := 'downtime_reference is required';
    elsif not v_reference ~ '^DT-[0-9]{8}-[0-9]{3,}$' then
      v_status := 'ERROR'; v_message := 'downtime_reference must match DT-YYYYMMDD-NNN';
    elsif exists (select 1 from public.downtime_import_records as r where r.downtime_reference = v_reference) then
      v_status := 'DUPLICATE'; v_message := 'Downtime reference was already imported';
    elsif coalesce(v_row ->> 'source', '') <> 'Paper Downtime Record' then
      v_status := 'ERROR'; v_message := 'source must be Paper Downtime Record';
    elsif coalesce(v_row ->> 'patient_id', '') !~ '^[0-9]+$' then
      v_status := 'ERROR'; v_message := 'patient_id must be a whole number';
    else
      v_patient_id := (v_row ->> 'patient_id')::bigint;
      if not exists (
        select 1 from public.patients as p
        where p.id = v_patient_id
          and p.archive_status = 'active'
          and exists (select 1 from public.patient_consent as c where c.patient_id = p.id)
      ) then
        v_status := 'ERROR'; v_message := 'Patient must exist, be active, and have consent';
      elsif coalesce(v_row ->> 'actual_service_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or coalesce(v_row ->> 'actual_service_time', '') !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
         or coalesce(v_row ->> 'consultation_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or coalesce(v_row ->> 'consultation_time', '') !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then
        v_status := 'ERROR'; v_message := 'Service and consultation date/time values are malformed';
      elsif nullif(pg_catalog.btrim(v_row ->> 'chief_complaint'), '') is null then
        v_status := 'ERROR'; v_message := 'chief_complaint is required';
      elsif coalesce(v_row ->> 'visit_disposition', '') not in ('pending', 'referred', 'completed') then
        v_status := 'ERROR'; v_message := 'visit_disposition is invalid';
      elsif v_staff_reference is not null then
        select count(*)::integer into v_staff_matches
        from public.profiles as p
        where p.is_active
          and p.role in ('nurse', 'midwives')
          and (
            (v_staff_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and p.id = v_staff_reference::uuid)
            or lower(p.email) = lower(v_staff_reference)
            or lower(p.full_name) = lower(v_staff_reference)
          );
        if v_staff_matches <> 1 then
          v_status := 'ERROR';
          v_message := 'Responsible clinical staff must resolve to exactly one active Nurse or Midwife profile';
        else
          select p.id into v_responsible_staff_id
          from public.profiles as p
          where p.is_active
            and p.role in ('nurse', 'midwives')
            and (
              (v_staff_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and p.id = v_staff_reference::uuid)
              or lower(p.email) = lower(v_staff_reference)
              or lower(p.full_name) = lower(v_staff_reference)
            );
        end if;
      end if;
    end if;

    if v_status = 'READY' then
      begin
        v_service_date := (v_row ->> 'actual_service_date')::date;
        v_service_time := (v_row ->> 'actual_service_time')::time;
        perform (v_row ->> 'consultation_date')::date;
        perform (v_row ->> 'consultation_time')::time;
      exception when others then
        v_status := 'ERROR'; v_message := 'Service and consultation date/time values are invalid';
      end;
    end if;

    if v_status = 'READY' then
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
          responsible_staff_reference, responsible_staff_id, imported_by, initial_consultation_id,
          status, message, metadata
        ) values (
          v_batch_id, v_reference, v_patient_id, v_service_date, v_service_time,
          v_staff_reference, v_responsible_staff_id, v_actor, v_initial_id, 'IMPORTED',
          'Imported by the authorized Nurse encoder; clinical authorship remains role-owned.',
          jsonb_build_object('template_version', p_template_version, 'source', 'Paper Downtime Record', 'responsible_staff_id', v_responsible_staff_id)
        );
        insert into public.audit_logs (user_id, user_role, action, module, record_id, record_type, description, metadata)
        values (v_actor, v_role, 'create', 'Downtime Reference Import', v_initial_id::text, 'initial_consultation',
          'Imported a paper downtime Nurse intake record.',
          jsonb_build_object('batch_id', v_batch_id, 'downtime_reference', v_reference, 'patient_id', v_patient_id,
            'actual_service_date', v_service_date, 'actual_service_time', v_service_time,
            'responsible_staff_reference', v_staff_reference, 'responsible_staff_id', v_responsible_staff_id,
            'imported_by', v_actor, 'source', 'Paper Downtime Record', 'status', 'IMPORTED'));
        v_status := 'IMPORTED';
        v_imported := v_imported + 1;
      exception when unique_violation then
        v_status := 'DUPLICATE'; v_message := 'Downtime reference was already imported'; v_duplicate := v_duplicate + 1;
      when others then
        v_status := 'ERROR'; v_message := 'Record could not be imported safely'; v_error := v_error + 1;
      end;
    elsif v_status = 'DUPLICATE' then
      v_duplicate := v_duplicate + 1;
    else
      v_error := v_error + 1;
    end if;

    if v_status in ('ERROR', 'DUPLICATE') then
      insert into public.audit_logs (user_id, user_role, action, module, record_id, record_type, description, metadata)
      values (v_actor, v_role, 'create', 'Downtime Reference Import', null, 'report',
        'Downtime import row was not imported.',
        jsonb_build_object('batch_id', v_batch_id, 'downtime_reference', v_reference,
          'status', v_status, 'message', v_message, 'row', v_index,
          'source', 'Paper Downtime Record', 'imported_by', v_actor));
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'row', v_index, 'downtime_reference', v_reference, 'status', v_status, 'message', v_message));
  end loop;

  update public.downtime_import_batches
  set status = case when v_error > 0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end,
      summary = jsonb_build_object('imported', v_imported, 'errors', v_error, 'duplicates', v_duplicate, 'skipped', v_skipped)
  where id = v_batch_id;

  insert into public.audit_logs (user_id, user_role, action, module, record_id, record_type, description, metadata)
  values (v_actor, v_role, 'create', 'Downtime Reference Import', v_batch_id::text, 'report',
    'Completed a downtime reference import batch.',
    jsonb_build_object('batch_id', v_batch_id, 'template_version', p_template_version,
      'source', 'Paper Downtime Record', 'status', case when v_error > 0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end,
      'imported', v_imported, 'errors', v_error, 'duplicates', v_duplicate, 'skipped', v_skipped,
      'imported_by', v_actor));

  return jsonb_build_object('batch_id', v_batch_id, 'template_version', p_template_version,
    'results', v_results, 'summary', jsonb_build_object('imported', v_imported, 'errors', v_error, 'duplicates', v_duplicate, 'skipped', v_skipped));
end;
$$;

revoke all on function public.import_downtime_batch(text, jsonb) from public, anon, service_role;
grant execute on function public.import_downtime_batch(text, jsonb) to authenticated;
