import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../supabase/migrations/20261015185631_admin_patient_bulk_transfer.sql', import.meta.url), 'utf8');
const edge = await readFile(new URL('../../supabase/functions/admin-patient-transfer/index.ts', import.meta.url), 'utf8');
const ui = await readFile(new URL('../../src/features/patient-transfer/AdminPatientTransferPage.tsx', import.meta.url), 'utf8');
const nurse = await readFile(new URL('../../src/features/downtime-import/NurseImportExportPage.tsx', import.meta.url), 'utf8');
const crypto = await readFile(new URL('../../supabase/functions/medisens-secure-records/index.ts', import.meta.url), 'utf8');

test('transfer endpoints validate a live Admin profile and do not trust client roles', () => {
  assert.match(edge, /auth\.getUser\(\)/);
  assert.match(edge, /profile\.role!=='admin'\|\|profile\.is_active!==true/);
  assert.doesNotMatch(edge, /body\.role/);
  assert.match(migration, /revoke all on function public\.admin_patient_transfer_import\(text,jsonb,uuid\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.admin_patient_transfer_import\(text,jsonb,uuid\) to service_role/);
});

test('database contract covers patient records and linked clinical tables with bounded transactions', () => {
  for (const table of ['patients','initial_consultation','vital_sign','consultation','lab_request','lab_result','prescription','follow_up']) assert.ok(migration.includes(`public.${table}`), `${table} should be covered`);
  assert.match(migration, /jsonb_array_length\(p_patients\) not between 1 and 100/);
  assert.match(migration, /octet_length\(p_patients::text\)>10485760/);
  assert.match(migration, /patient_transfer_patients/);
  assert.match(migration, /patient_transfer_records/);
  assert.match(migration, /v_patient_records/);
});

test('transfer uses MediSens encryption and exports only projected workbook fields', () => {
  const exportBody = migration.slice(migration.indexOf('create or replace function public.admin_patient_transfer_export('), migration.indexOf('create or replace function public.admin_patient_transfer_export_generated('));
  assert.doesNotMatch(exportBody, /to_jsonb\s*\(/i);
  assert.doesNotMatch(ui, /pii_ciphertext|clinical_ciphertext|rx_ciphertext|findings_ciphertext|sensitive_ciphertext|crypto_ref|blind_index/i);
  assert.match(crypto, /name: "AES-GCM"/);
  assert.match(crypto, /async function transferCrypto/);
  assert.match(crypto, /async function transferProjection/);
  assert.match(crypto, /if \(!cryptoRef \|\| !raw\[config\.cipherColumn\]\) throw new Error\("Encrypted source record is unavailable for transfer\."\)/);
  assert.doesNotMatch(crypto.slice(crypto.indexOf('async function transferProjection'), crypto.indexOf('function getConfig')), /extractSensitive\(raw, config\)/);
  assert.match(crypto, /action === "bulk_import"/);
  assert.match(crypto, /action === "bulk_export"/);
  assert.match(crypto, /function transferFile\(/);
  assert.match(crypto, /XLSX\.write\(workbook, \{ bookType: "xlsx", type: "base64" \}\)/);
  assert.match(crypto, /content_type: "application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
  assert.match(migration, /pii_ciphertext/);
  assert.match(migration, /findings_ciphertext/);
  assert.match(edge, /auth\.getUser\(\)/);
});

test('same-system export writes deterministic patient and clinical source mappings before delivery', () => {
  const exportBody = migration.slice(migration.indexOf('create or replace function public.admin_patient_transfer_export('), migration.indexOf('create or replace function public.admin_patient_transfer_export_generated('));
  assert.match(exportBody, /'MEDISENS-PATIENT-'\|\|p\.id::text/);
  assert.match(exportBody, /insert into public\.patient_transfer_records\(source_system,source_record_ref,source_patient_ref,table_name,record_id,created_by\)/);
  assert.match(exportBody, /source\.table_name\|\|':'\|\|source\.record_id::text/);
  assert.match(exportBody, /Clinical source mapping is already bound to another patient or record/);
});

test('profile updates require an explicit field allowlist and preserve omitted columns', () => {
  assert.match(migration, /jsonb_typeof\(v_patient->'update_fields'\) <> 'array'/);
  assert.match(migration, /UPDATE fields are invalid/);
  assert.match(migration, /else p\."firstName" end/);
  assert.match(migration, /else p\."relativeContact" end/);
  assert.match(ui, /update_fields \(semicolon-separated\)/);
  assert.match(ui, /UPDATE requires an explicit list of present, non-empty profile fields/);
});

test('clinical source references bind to the same patient and expected destination type', () => {
  assert.match(migration, /source_record_ref=v_row->>'initial_consultation_ref' and r\.source_patient_ref=v_ref and r\.table_name='initial_consultation'/);
  assert.match(migration, /source_record_ref=v_row->>'consultation_ref' and r\.source_patient_ref=v_ref and r\.table_name='consultation'/);
  assert.match(migration, /source_record_ref=v_row->>'lab_request_ref' and r\.source_patient_ref=v_ref and r\.table_name='lab_request'/);
  assert.match(migration, /cm\.source_patient_ref=v_ref and cm\.table_name='consultation'/);
  assert.match(migration, /source reference is already mapped to another patient or record type/);
  assert.match(crypto, /patientByTable\.get\(parentTable\)\?\.get\(Number\(row\[key\]\)\) !== Number\(row\.patient_id\)/);
  assert.match(crypto, /Clinical relationship crosses patient boundaries/);
});

test('export receipt cannot supply counts and history distinguishes generation from completion', () => {
  assert.doesNotMatch(edge, /p_record_count|body\.record_count/);
  assert.match(crypto, /p_record_count: recordTotal/);
  assert.match(migration, /record_count=p_record_count/);
  assert.match(migration, /status='GENERATED'/);
  assert.match(migration, /status='GENERATED'.*status='COMPLETED'/s);
  assert.match(ui, /action:'export_complete'/);
  assert.match(ui, /action:'export_failed'/);
  assert.match(migration, /browser_download_started/);
});

test('existing clinical state triggers remain in place and transfer never disables them', async () => {
  const labGuards = await readFile(new URL('../../supabase/migrations/20260716084759_harden_laboratory_state_transitions.sql', import.meta.url), 'utf8');
  const rxGuards = await readFile(new URL('../../supabase/migrations/20260716082840_harden_prescription_dispensing_transitions.sql', import.meta.url), 'utf8');
  assert.match(labGuards, /Lab requests must start in Pending status/);
  assert.match(labGuards, /guard_lab_result_completion/);
  assert.match(rxGuards, /Prescription must start as pending/);
  assert.match(rxGuards, /Invalid prescription dispensing transition/);
  assert.doesNotMatch(migration, /disable trigger|session_replication_role/);
  assert.match(migration, /insert into public\.lab_result[\s\S]*?'Completed'/);
  assert.match(migration, /update public\.prescription set status='Dispensed',dispensed_at=v_row->>'dispensed_at'/);
  assert.match(migration, /status='Completed' where labrequest_id=v_target_id and status='Pending'/);
});

test('workbook workflow rejects unsupported/formula data and preserves stable references', () => {
  for (const sheet of ['Import Manifest','Patients','Initial Intake','Vitals','Consultations','Laboratory Requests','Laboratory Results','Prescriptions','Follow-Ups']) assert.ok(ui.includes(sheet), `${sheet} sheet should be declared`);
  assert.match(ui, /formula-like values are not accepted/);
  assert.match(ui, /relationship is invalid/);
  assert.match(ui, /source_patient_ref/);
  assert.match(ui, /source_record_ref/);
  assert.match(ui, /import_action/);
});

test('Nurse module retains only downtime import and account-owned history', () => {
  assert.match(nurse, /DowntimeReferenceImportPage/);
  assert.match(nurse, /downtime_import_batches/);
  assert.doesNotMatch(nurse, /Patient Records|patient-transfer/);
});
