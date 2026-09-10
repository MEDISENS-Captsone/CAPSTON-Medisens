-- Temporary local-only Phase 7 harness. All identifiers and patient data are synthetic.
begin;

create temporary table phase7_expected (
  name text primary key,
  passed boolean not null
) on commit drop;

do $$
declare
  nurse uuid := '00000000-0000-4000-8000-000000000701';
  nurse_two uuid := '00000000-0000-4000-8000-000000000702';
  doctor uuid := '00000000-0000-4000-8000-000000000703';
  inactive_nurse uuid := '00000000-0000-4000-8000-000000000704';
  patient_one bigint := 970001;
  patient_two bigint := 970002;
  archived_patient bigint := 970003;
  result jsonb;
  initial_count integer;
  audit_count integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
  values
    (nurse, 'authenticated', 'authenticated', 'synthetic.nurse@example.test', 'synthetic', now()),
    (nurse_two, 'authenticated', 'authenticated', 'synthetic.midwife@example.test', 'synthetic', now()),
    (doctor, 'authenticated', 'authenticated', 'synthetic.doctor@example.test', 'synthetic', now()),
    (inactive_nurse, 'authenticated', 'authenticated', 'synthetic.inactive@example.test', 'synthetic', now());

  insert into public.profiles (id, role, full_name, email, is_active, deactivated_at)
  values
    (nurse, 'nurse', 'Synthetic Nurse One', 'synthetic.nurse@example.test', true, null),
    (nurse_two, 'midwives', 'Synthetic Midwife Two', 'synthetic.midwife@example.test', true, null),
    (doctor, 'doctor', 'Synthetic Doctor Three', 'synthetic.doctor@example.test', true, null),
    (inactive_nurse, 'nurse', 'Synthetic Inactive Nurse', 'synthetic.inactive@example.test', false, '2098-01-01 00:00:00+00');

  insert into public.patients (id, "firstName", "lastName", archive_status, consent_signed)
  overriding system value
  values
    (patient_one, 'Synthetic', 'Patient One', 'active', true),
    (patient_two, 'Synthetic', 'Patient Two', 'active', true),
    (archived_patient, 'Synthetic', 'Archived Patient', 'archived', true);

  insert into public.patient_consent (patient_id, consent_signer, consent_signature)
  values
    (patient_one, true, 'synthetic-signature-one'),
    (patient_two, true, 'synthetic-signature-two'),
    (archived_patient, true, 'synthetic-signature-archived');

  perform set_config('request.jwt.claim.sub', nurse::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Valid existing-patient encounter with UUID attribution.
  select public.import_downtime_batch('MEDISENS-DOWNTIME-V1', jsonb_build_array(jsonb_build_object(
    'downtime_reference', 'DT-20990101-701', 'source', 'Paper Downtime Record', 'patient_id', patient_one,
    'actual_service_date', '2099-01-01', 'actual_service_time', '10:25',
    'consultation_date', '2099-01-01', 'consultation_time', '10:25',
    'chief_complaint', 'Synthetic cough', 'visit_disposition', 'completed',
    'responsible_staff_reference', nurse::text, 'vitals', jsonb_build_object('bp', '120/80', 'heart_rate', '72')
  ))) into result;
  if result #>> '{summary,imported}' <> '1' or result #>> '{results,0,status}' <> 'IMPORTED' then
    raise exception 'valid encounter failed: %', result;
  end if;
  insert into phase7_expected values ('valid encounter', true);

  -- Multiple valid encounters in one batch, including email attribution.
  select public.import_downtime_batch('MEDISENS-DOWNTIME-V1', jsonb_build_array(
    jsonb_build_object('downtime_reference', 'DT-20990101-702', 'source', 'Paper Downtime Record', 'patient_id', patient_one,
      'actual_service_date', '2099-01-01', 'actual_service_time', '11:00', 'consultation_date', '2099-01-01', 'consultation_time', '11:00',
      'chief_complaint', 'Synthetic headache', 'visit_disposition', 'pending', 'responsible_staff_reference', 'synthetic.midwife@example.test'),
    jsonb_build_object('downtime_reference', 'DT-20990101-703', 'source', 'Paper Downtime Record', 'patient_id', patient_two,
      'actual_service_date', '2099-01-01', 'actual_service_time', '11:30', 'consultation_date', '2099-01-01', 'consultation_time', '11:30',
      'chief_complaint', 'Synthetic fever', 'visit_disposition', 'referred', 'responsible_staff_reference', 'Synthetic Midwife Two')
  )) into result;
  if result #>> '{summary,imported}' <> '2' then raise exception 'multiple valid encounters failed: %', result; end if;
  insert into phase7_expected values ('multiple valid encounters', true);

  -- Duplicate reference is rejected without a second clinical record.
  select count(*) into initial_count from public.initial_consultation where patient_id = patient_one;
  select public.import_downtime_batch('MEDISENS-DOWNTIME-V1', jsonb_build_array(
    jsonb_build_object('downtime_reference', 'DT-20990101-701', 'source', 'Paper Downtime Record', 'patient_id', patient_one,
      'actual_service_date', '2099-01-01', 'actual_service_time', '12:00', 'consultation_date', '2099-01-01', 'consultation_time', '12:00',
      'chief_complaint', 'Duplicate synthetic record', 'visit_disposition', 'completed')
  )) into result;
  if result #>> '{summary,duplicates}' <> '1' then raise exception 'duplicate was not rejected: %', result; end if;
  select count(*) into audit_count from public.initial_consultation where patient_id = patient_one;
  if audit_count <> initial_count then raise exception 'duplicate created clinical state'; end if;
  insert into phase7_expected values ('duplicate reference', true);

  -- Unknown, archived, missing, and malformed records are blocked.
  select public.import_downtime_batch('MEDISENS-DOWNTIME-V1', jsonb_build_array(
    jsonb_build_object('downtime_reference', 'DT-20990101-704', 'source', 'Paper Downtime Record', 'patient_id', 979999,
      'actual_service_date', '2099-01-01', 'actual_service_time', '12:30', 'consultation_date', '2099-01-01', 'consultation_time', '12:30', 'chief_complaint', 'Unknown', 'visit_disposition', 'completed'),
    jsonb_build_object('downtime_reference', 'DT-20990101-705', 'source', 'Paper Downtime Record', 'patient_id', archived_patient,
      'actual_service_date', '2099-01-01', 'actual_service_time', '12:35', 'consultation_date', '2099-01-01', 'consultation_time', '12:35', 'chief_complaint', 'Archived', 'visit_disposition', 'completed'),
    jsonb_build_object('downtime_reference', 'DT-20990101-706', 'source', 'Paper Downtime Record', 'patient_id', patient_two,
      'actual_service_date', '2099-02-31', 'actual_service_time', '12:40', 'consultation_date', '2099-01-01', 'consultation_time', '12:40', 'chief_complaint', 'Bad date', 'visit_disposition', 'completed'),
    jsonb_build_object('downtime_reference', 'DT-20990101-707', 'patient_id', patient_two,
      'actual_service_date', '2099-01-01', 'actual_service_time', '12:45', 'consultation_date', '2099-01-01', 'consultation_time', '12:45', 'chief_complaint', 'Missing source', 'visit_disposition', 'completed')
  )) into result;
  if (result #>> '{summary,errors}')::integer <> 4 then raise exception 'invalid patient/date/source cases failed: %', result; end if;
  insert into phase7_expected values ('invalid patient archived date source', true);

  -- Unauthorized and ambiguous staff references are rejected.
  select public.import_downtime_batch('MEDISENS-DOWNTIME-V1', jsonb_build_array(
    jsonb_build_object('downtime_reference', 'DT-20990101-708', 'source', 'Paper Downtime Record', 'patient_id', patient_two,
      'actual_service_date', '2099-01-01', 'actual_service_time', '13:00', 'consultation_date', '2099-01-01', 'consultation_time', '13:00',
      'chief_complaint', 'Wrong role', 'visit_disposition', 'completed', 'responsible_staff_reference', doctor::text),
    jsonb_build_object('downtime_reference', 'DT-20990101-709', 'source', 'Paper Downtime Record', 'patient_id', patient_two,
      'actual_service_date', '2099-01-01', 'actual_service_time', '13:05', 'consultation_date', '2099-01-01', 'consultation_time', '13:05',
      'chief_complaint', 'Unknown staff', 'visit_disposition', 'completed', 'responsible_staff_reference', 'not-a-staff-record')
  )) into result;
  if (result #>> '{summary,errors}')::integer <> 2 then raise exception 'staff authorization cases failed: %', result; end if;
  insert into phase7_expected values ('staff authorization', true);

  -- Numeric vital validation fails safely and does not leave an intake behind.
  select count(*) into initial_count from public.initial_consultation where patient_id = patient_two;
  select public.import_downtime_batch('MEDISENS-DOWNTIME-V1', jsonb_build_array(
    jsonb_build_object('downtime_reference', 'DT-20990101-710', 'source', 'Paper Downtime Record', 'patient_id', patient_two,
      'actual_service_date', '2099-01-01', 'actual_service_time', '13:10', 'consultation_date', '2099-01-01', 'consultation_time', '13:10',
      'chief_complaint', 'Bad vital', 'visit_disposition', 'completed', 'vitals', jsonb_build_object('heart_rate', 'not-a-number'))
  )) into result;
  if (result #>> '{summary,errors}')::integer <> 1 then raise exception 'bad vital was not rejected: %', result; end if;
  select count(*) into audit_count from public.initial_consultation where patient_id = patient_two;
  if audit_count <> initial_count then raise exception 'bad vital left partial clinical state'; end if;
  insert into phase7_expected values ('rollback invalid vital', true);

  -- Inactive importer cannot invoke the function.
  perform set_config('request.jwt.claim.sub', inactive_nurse::text, true);
  begin
    perform public.import_downtime_batch('MEDISENS-DOWNTIME-V1', '[]'::jsonb);
    raise exception 'inactive importer unexpectedly succeeded';
  exception when sqlstate '42501' then
    insert into phase7_expected values ('inactive importer denied', true);
  end;

  -- Audit rows include imported record, batch, source, timestamps, attribution, and status.
  select count(*) into audit_count
  from public.audit_logs
  where module = 'Downtime Reference Import'
    and metadata ->> 'source' = 'Paper Downtime Record'
    and metadata ? 'batch_id'
    and metadata ? 'imported_by';
  if audit_count < 3 then raise exception 'audit evidence incomplete: % rows', audit_count; end if;
  insert into phase7_expected values ('audit verification', true);

  if (select count(*) from phase7_expected where passed) <> 8 then
    raise exception 'not all Phase 7 assertions were recorded';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.downtime_import_batches (template_version, imported_by)
    values ('MEDISENS-DOWNTIME-V1', '00000000-0000-4000-8000-000000000701');
    raise exception 'direct batch insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.audit_logs (action, module)
    values ('create', 'Downtime Reference Import');
    raise exception 'direct audit insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

select * from phase7_expected order by name;
rollback;
