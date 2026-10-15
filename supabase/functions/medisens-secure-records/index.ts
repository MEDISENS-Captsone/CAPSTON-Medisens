import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

type Role = "admin" | "doctor" | "nurse" | "BHW" | "pharmacist" | "labaratory" | "midwives";
type ResourceName =
  | "patients"
  | "initial_consultation"
  | "vital_sign"
  | "consultation"
  | "follow_up"
  | "lab_request"
  | "lab_result"
  | "prescription"
  | "fhsis_logs"
  | "patient_consent";

interface ResourceConfig {
  table: ResourceName;
  idColumn: string;
  patientIdColumn?: string;
  cipherColumn: string;
  sensitiveFields: string[];
}

interface CipherEnvelope {
  v: 1;
  alg: "A256GCM";
  iv: string;
  ciphertext: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const resources: Record<ResourceName, ResourceConfig> = {
  patients: {
    table: "patients",
    idColumn: "id",
    cipherColumn: "pii_ciphertext",
    sensitiveFields: [
      "firstName", "middleName", "lastName", "suffix", "birthday", "nationality",
      "bloodType", "religion", "birthPlace", "address", "contactNumber",
      "educationalAttain", "employmentStatus", "philhealthNo", "relativeName",
      "relativeRelation", "relativeAddress", "relativeContact",
    ],
  },
  initial_consultation: {
    table: "initial_consultation",
    idColumn: "initialconsultation_id",
    patientIdColumn: "patient_id",
    cipherColumn: "clinical_ciphertext",
    sensitiveFields: ["referred_by", "chief_complaint", "diagnosis"],
  },
  vital_sign: {
    table: "vital_sign",
    idColumn: "vitals_id",
    patientIdColumn: "patient_id",
    cipherColumn: "clinical_ciphertext",
    sensitiveFields: [
      "bp", "heart_rate", "respiratory_rate", "temperature", "o2_saturation",
      "weight", "height", "muac", "nutritional_status", "bmi",
      "visual_acuity_left", "visual_acuity_right", "general_survey",
    ],
  },
  consultation: {
    table: "consultation",
    idColumn: "consultation_id",
    patientIdColumn: "patient_id",
    cipherColumn: "clinical_ciphertext",
    sensitiveFields: [
      "family_history", "smoking_status", "smoking_sticks_per_day", "smoking_years",
      "drinking_status", "drinking_frequency", "drinking_years", "immunization_history",
      "menarche_age", "sexual_onset_age", "is_menopause", "menopause_age", "lmp",
      "interval_cycle", "period_duration", "pads_per_day", "birth_control_method",
      "gravidity", "parity", "delivery_type", "full_term_count", "premature_count",
      "abortion_count", "living_children_count", "pre_eclampsia",
      "medication_treatment", "past_med_surge_history", "past_med_surg_history",
      "chief_complaints", "diagnosis", "hpi", "history_present_illness",
      "assessment", "plan", "management_treatment",
    ],
  },
  follow_up: {
    table: "follow_up",
    idColumn: "followup_id",
    patientIdColumn: "patient_id",
    cipherColumn: "clinical_ciphertext",
    sensitiveFields: [
      "chief_complaint", "diagnosis", "history_of_present_illness", "bp",
      "heart_rate", "respiratory_rate", "temperature", "o2_saturation", "weight",
      "height", "muac", "nutritional_status", "bmi", "visual_acuity_left",
      "visual_acuity_right", "blood_type", "general_survey", "medication_treatment",
      "lab_results",
    ],
  },
  lab_request: {
    table: "lab_request",
    idColumn: "labrequest_id",
    patientIdColumn: "patient_id",
    cipherColumn: "sensitive_ciphertext",
    sensitiveFields: ["chief_complaint", "others"],
  },
  lab_result: {
    table: "lab_result",
    idColumn: "labresult_id",
    patientIdColumn: "patient_id",
    cipherColumn: "findings_ciphertext",
    sensitiveFields: ["findings"],
  },
  prescription: {
    table: "prescription",
    idColumn: "prescription_id",
    patientIdColumn: "patient_id",
    cipherColumn: "rx_ciphertext",
    sensitiveFields: ["rx_content"],
  },
  fhsis_logs: {
    table: "fhsis_logs",
    idColumn: "id",
    patientIdColumn: "patient_id",
    cipherColumn: "data_fields_ciphertext",
    sensitiveFields: ["data_fields"],
  },
  patient_consent: {
    table: "patient_consent",
    idColumn: "consent_id",
    patientIdColumn: "patient_id",
    cipherColumn: "signature_ciphertext",
    sensitiveFields: ["consent_signature", "consent_personnel_signature"],
  },
};

const transferProfiles = [
  "firstName", "middleName", "lastName", "suffix", "age", "sex", "civilStatus", "birthday",
  "nationality", "bloodType", "religion", "birthPlace", "address", "contactNumber",
  "educationalAttain", "employmentStatus", "philhealthNo", "philhealthStatus", "category",
  "categoryOthers", "relativeName", "relativeRelation", "relativeAddress", "relativeContact",
] as const;
const transferDomains = [
  { sheet: "Initial Intake", table: "initial_consultation", id: "initialconsultation_id", keys: ["patient_id"], fields: ["consultation_date", "consultation_time", "mode_of_transaction", "referred_by", "mode_of_transfer", "chief_complaint", "diagnosis", "visit_disposition"] },
  { sheet: "Vitals", table: "vital_sign", id: "vitals_id", keys: ["patient_id", "initial_consultation_id"], fields: ["initial_consultation_ref", "bp", "heart_rate", "respiratory_rate", "temperature", "o2_saturation", "weight", "height", "muac", "nutritional_status", "bmi", "visual_acuity_left", "visual_acuity_right", "general_survey"] },
  { sheet: "Consultations", table: "consultation", id: "consultation_id", keys: ["patient_id", "initial_consultation_id"], fields: ["initial_consultation_ref", "source_authority", "family_history", "smoking_status", "smoking_sticks_per_day", "smoking_years", "drinking_status", "drinking_frequency", "drinking_years", "immunization_history", "menarche_age", "sexual_onset_age", "is_menopause", "menopause_age", "lmp", "interval_cycle", "period_duration", "pads_per_day", "birth_control_method", "gravidity", "parity", "delivery_type", "full_term_count", "premature_count", "abortion_count", "living_children_count", "pre_eclampsia", "medication_treatment", "past_med_surge_history", "chief_complaints", "diagnosis", "hpi", "assessment", "plan", "follow_up_date", "follow_up_time", "management_treatment", "attending_provider", "past_med_surg_history", "history_present_illness", "follow_up_status", "status", "completed_at"] },
  { sheet: "Laboratory Requests", table: "lab_request", id: "labrequest_id", keys: ["patient_id", "consultation_id"], fields: ["consultation_ref", "source_authority", "request_date", "lab_no", "chief_complaint", "is_cbc", "is_cbc_platelet", "is_hgb_hct", "is_xray", "is_ultrasound", "is_rbs", "is_fbs", "is_uric_acid", "is_cholesterol", "is_urinalysis", "is_fecalysis", "is_sputum", "others", "requested_by", "status", "is_clinical_microscopy", "is_blood_chemistry", "is_pregnancy_test", "is_hbsag_screening", "is_hiv_screening", "is_parasitology", "is_dengue_rdt"] },
  { sheet: "Laboratory Results", table: "lab_result", id: "labresult_id", keys: ["patient_id", "consultation_id", "labrequest_id"], fields: ["lab_request_ref", "consultation_ref", "source_authority", "date_performed", "findings", "performed_by", "status"] },
  { sheet: "Prescriptions", table: "prescription", id: "prescription_id", keys: ["patient_id", "consultation_id"], fields: ["consultation_ref", "source_authority", "prescription_date", "rx_content", "doctor_name", "license_no", "ptr_no", "status", "dispensed_at"] },
  { sheet: "Follow-Ups", table: "follow_up", id: "followup_id", keys: ["patient_id", "consultation_id"], fields: ["consultation_ref", "source_authority", "visit_date", "visit_time", "mode_of_transaction", "mode_of_transfer", "chief_complaint", "diagnosis", "history_of_present_illness", "bp", "heart_rate", "respiratory_rate", "temperature", "o2_saturation", "weight", "height", "muac", "nutritional_status", "bmi", "visual_acuity_left", "visual_acuity_right", "blood_type", "general_survey", "medication_treatment", "lab_results", "follow_up_status"] },
] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function transferFile(payload: Record<string, unknown>, format: "xlsx" | "csv") {
  const patients = Array.isArray(payload.patients) ? payload.patients as Record<string, unknown>[] : [];
  const profiles = patients.map(value => ({
    source_patient_ref: value.source_patient_ref,
    import_action: "CREATE",
    "update_fields (semicolon-separated)": "",
    ...(value.patient as Record<string, unknown>),
  }));
  const safeCell = (value: unknown) => {
    return value == null ? "" : String(value);
  };
  if (format === "csv") {
    const csvProfiles = patients.map(value => ({ source_patient_ref: value.source_patient_ref, ...(value.patient as Record<string, unknown>) }));
    const headers = ["source_patient_ref", ...transferProfiles, "source_created_at"];
    const rows = [headers, ...csvProfiles.map(row => headers.map(header => row[header]))];
    const csv = rows.map(row => row.map(value => {
      const text = safeCell(value);
      const formulaSafe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${formulaSafe.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const bytes = new TextEncoder().encode(`\uFEFF${csv}`);
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Export exceeds the supported file-size limit.");
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { filename: "MediSens_Patient_Profiles.csv", content_type: "text/csv;charset=utf-8", base64: btoa(binary) };
  }

  const sheetNames = ["Import Manifest", "Patients", ...transferDomains.map(domain => domain.sheet)];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["schema_version", "source_system", "exported_at"],
    ["MEDISENS-PATIENT-TRANSFER-V1", "MEDISENS", new Date().toISOString()],
  ]), "Import Manifest");
  const sheetData: Record<string, Record<string, unknown>[]> = { Patients: profiles };
  const patientRefById = new Map(patients.map(row => [String(row.id), String(row.source_patient_ref)]));
  const idsByTable = new Map<string, Map<string, string>>();
  for (const domain of transferDomains) {
    const records = Array.isArray(payload[domain.table === "initial_consultation" ? "initial_consultations" : domain.table === "vital_sign" ? "vitals" : domain.table === "consultation" ? "consultations" : domain.table === "lab_request" ? "lab_requests" : domain.table === "lab_result" ? "lab_results" : domain.table === "prescription" ? "prescriptions" : "follow_ups"])
      ? payload[domain.table === "initial_consultation" ? "initial_consultations" : domain.table === "vital_sign" ? "vitals" : domain.table === "consultation" ? "consultations" : domain.table === "lab_request" ? "lab_requests" : domain.table === "lab_result" ? "lab_results" : domain.table === "prescription" ? "prescriptions" : "follow_ups"] as Record<string, unknown>[]
      : [];
    const idMap = new Map(records.map(row => [String(row[domain.id]), `${domain.table}:${row[domain.id]}`]));
    idsByTable.set(domain.table, idMap);
    const refHeader = domain.table === "initial_consultation" ? "source_intake_ref" : domain.table === "vital_sign" ? "source_vitals_ref" : domain.table === "consultation" ? "source_consultation_ref" : domain.table === "lab_request" ? "source_lab_request_ref" : domain.table === "lab_result" ? "source_lab_result_ref" : domain.table === "prescription" ? "source_prescription_ref" : "source_follow_up_ref";
    sheetData[domain.sheet] = records.map(row => {
      const output: Record<string, unknown> = {
        source_patient_ref: patientRefById.get(String(row.patient_id)) ?? "",
        [refHeader]: idMap.get(String(row[domain.id])) ?? "",
      };
      for (const field of domain.fields) {
        let value = row[field] ?? "";
        if (field === "initial_consultation_ref") value = idsByTable.get("initial_consultation")?.get(String(row.initial_consultation_id)) ?? "";
        if (field === "consultation_ref") value = idsByTable.get("consultation")?.get(String(row.consultation_id)) ?? "";
        if (field === "lab_request_ref") value = idsByTable.get("lab_request")?.get(String(row.labrequest_id)) ?? "";
        output[field] = value;
      }
      if (["consultation", "lab_request", "lab_result", "prescription", "follow_up"].includes(domain.table)) output.source_authority = "MEDISENS_EXPORT";
      return output;
    });
  }
  for (const domain of transferDomains) {
    const refHeader = domain.table === "initial_consultation" ? "source_intake_ref" : domain.table === "vital_sign" ? "source_vitals_ref" : domain.table === "consultation" ? "source_consultation_ref" : domain.table === "lab_request" ? "source_lab_request_ref" : domain.table === "lab_result" ? "source_lab_result_ref" : domain.table === "prescription" ? "source_prescription_ref" : "source_follow_up_ref";
    const headers = ["source_patient_ref", refHeader, ...domain.fields];
    const rows = sheetData[domain.sheet].map(row => headers.map(header => safeCell(row[header])));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), domain.sheet);
  }
  const profileHeaders = ["source_patient_ref", "import_action", "update_fields (semicolon-separated)", ...transferProfiles, "source_created_at"];
  const safeProfiles = profiles.map(row => profileHeaders.map(header => safeCell(row[header])));
  // Rebuild Patients with the exact versioned import contract.
  workbook.Sheets.Patients = XLSX.utils.aoa_to_sheet([profileHeaders, ...safeProfiles]);
  workbook.SheetNames = sheetNames;
  const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
  const fileSize = Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (fileSize > 10 * 1024 * 1024) throw new Error("Export exceeds the supported file-size limit.");
  return {
    filename: `MediSens_Patient_Transfer_${new Date().toISOString().slice(0, 10)}.xlsx`,
    content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64,
  };
}

function envMapValue(name: string, legacyName: string): string | null {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return raw;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL") ?? null;
const SUPABASE_PUBLIC_KEY =
  envMapValue("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY") ??
  Deno.env.get("ANON_KEY") ??
  null;
const SUPABASE_SECRET_KEY =
  envMapValue("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  null;

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parse32ByteKey(value: string | undefined): Uint8Array | null {
  if (!value) return null;
  try {
    let bytes: Uint8Array;
    if (/^[0-9a-fA-F]{64}$/.test(value)) {
      bytes = new Uint8Array(value.match(/.{2}/g)!.map(part => Number.parseInt(part, 16)));
    } else {
      bytes = fromBase64Url(value.trim());
    }
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

const DATA_KEY_BYTES = parse32ByteKey(Deno.env.get("MEDISENS_DATA_KEY_V1"));
const SEARCH_KEY_BYTES = parse32ByteKey(Deno.env.get("MEDISENS_SEARCH_KEY_V1"));

let aesKeyPromise: Promise<CryptoKey> | null = null;
let hmacKeyPromise: Promise<CryptoKey> | null = null;

function requireCryptoConfigured() {
  if (!DATA_KEY_BYTES || !SEARCH_KEY_BYTES) {
    throw new Error("MediSens encryption keys are not configured.");
  }
}

function aesKey(): Promise<CryptoKey> {
  requireCryptoConfigured();
  aesKeyPromise ??= crypto.subtle.importKey(
    "raw",
    DATA_KEY_BYTES!,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return aesKeyPromise;
}

function hmacKey(): Promise<CryptoKey> {
  requireCryptoConfigured();
  hmacKeyPromise ??= crypto.subtle.importKey(
    "raw",
    SEARCH_KEY_BYTES!,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hmacKeyPromise;
}

async function encryptPayload(payload: Record<string, unknown>, aad: string): Promise<CipherEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const additionalData = new TextEncoder().encode(aad);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    await aesKey(),
    encoded,
  );
  return {
    v: 1,
    alg: "A256GCM",
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
}

async function decryptPayload(envelope: unknown, aad: string): Promise<Record<string, unknown>> {
  if (!envelope || typeof envelope !== "object") return {};
  const value = envelope as Partial<CipherEnvelope>;
  if (value.v !== 1 || value.alg !== "A256GCM" || !value.iv || !value.ciphertext) {
    throw new Error("Unsupported or malformed encrypted payload.");
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64Url(value.iv),
      additionalData: new TextEncoder().encode(aad),
      tagLength: 128,
    },
    await aesKey(),
    fromBase64Url(value.ciphertext),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Decrypted payload is malformed.");
  }
  return parsed as Record<string, unknown>;
}

async function blindIndex(value: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(signature));
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokensFromPayload(payload: Record<string, unknown>): string[] {
  const fields = ["firstName", "middleName", "lastName", "suffix"];
  const normalizedParts = fields.map(field => normalizeName(payload[field])).filter(Boolean);
  const individual = normalizedParts.flatMap(part => part.split(/\s+/).filter(Boolean));
  const full = normalizeName(normalizedParts.join(" "));
  return [...new Set([...individual, ...(full ? [full] : [])])];
}

function normalizeContact(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhilhealth(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractSensitive(row: Record<string, unknown>, config: ResourceConfig): Record<string, unknown> {
  return Object.fromEntries(config.sensitiveFields.map(field => [field, row[field] ?? null]));
}

function stripSensitive(payload: Record<string, unknown>, config: ResourceConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      !config.sensitiveFields.includes(key) &&
      key !== config.cipherColumn &&
      key !== "crypto_ref" &&
      key !== "crypto_version" &&
      key !== "encrypted_at" &&
      key !== "name_token_bidx" &&
      key !== "contact_bidx" &&
      key !== "philhealth_bidx"
    ) {
      out[key] = value;
    }
  }
  return out;
}

function mergeSensitive(
  base: Record<string, unknown>,
  update: Record<string, unknown>,
  config: ResourceConfig,
): Record<string, unknown> {
  const merged = { ...base };
  for (const field of config.sensitiveFields) {
    if (Object.prototype.hasOwnProperty.call(update, field)) merged[field] = update[field];
  }
  return merged;
}

function sanitizeResult(row: Record<string, unknown>, config: ResourceConfig, sensitive: Record<string, unknown>) {
  const result = { ...row, ...sensitive };
  delete result[config.cipherColumn];
  delete result.crypto_ref;
  delete result.crypto_version;
  delete result.encrypted_at;
  delete result.name_token_bidx;
  delete result.contact_bidx;
  delete result.philhealth_bidx;
  return result;
}

async function patientIndexUpdates(sensitive: Record<string, unknown>) {
  const nameTokens = nameTokensFromPayload(sensitive);
  const contact = normalizeContact(sensitive.contactNumber);
  const philhealth = normalizePhilhealth(sensitive.philhealthNo);
  return {
    name_token_bidx: await Promise.all(nameTokens.map(blindIndex)),
    contact_bidx: contact ? await blindIndex(contact) : null,
    philhealth_bidx: philhealth ? await blindIndex(philhealth) : null,
  };
}

async function transferCrypto(table: ResourceName, payload: Record<string, unknown>, cryptoRef = crypto.randomUUID(), mergedSensitive?: Record<string, unknown>) {
  const config = resources[table];
  const sensitive = mergedSensitive ? mergeSensitive(mergedSensitive, payload, config) : extractSensitive(payload, config);
  const result: Record<string, unknown> = {
    crypto_ref: cryptoRef,
    crypto_version: 1,
    encrypted_at: new Date().toISOString(),
    [config.cipherColumn]: await encryptPayload(sensitive, table + ":" + cryptoRef + ":v1"),
  };
  if (table === "patients") Object.assign(result, await patientIndexUpdates(sensitive));
  return result;
}

async function transferProjection(table: ResourceName, raw: Record<string, unknown>, fields: readonly string[]) {
  const config = resources[table];
  const cryptoRef = String(raw.crypto_ref ?? "");
  if (!cryptoRef || !raw[config.cipherColumn]) throw new Error("Encrypted source record is unavailable for transfer.");
  const sensitive = await decryptPayload(raw[config.cipherColumn], table + ":" + cryptoRef + ":v1");
  const merged = { ...raw, ...sensitive };
  return Object.fromEntries(fields.map(field => [field, merged[field] ?? ""]));
}

function getConfig(value: unknown): ResourceConfig {
  if (typeof value !== "string" || !(value in resources)) {
    throw new Error("Unsupported secure resource.");
  }
  return resources[value as ResourceName];
}

async function backfillResource(
  adminClient: ReturnType<typeof createClient>,
  config: ResourceConfig,
  requestedLimit: unknown,
) {
  const parsedLimit = Number(requestedLimit ?? 100);
  const limit = Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 100, 250));
  const { data: rows, error: rowsError } = await adminClient
    .from(config.table).select("*").is(config.cipherColumn, null).limit(limit);
  if (rowsError) throw rowsError;

  let processed = 0;
  for (const rawRow of rows ?? []) {
    const row = rawRow as Record<string, unknown>;
    const cryptoRef = String(row.crypto_ref ?? "");
    if (!cryptoRef) throw new Error("Missing crypto_ref on source row.");
    const sensitive = extractSensitive(row, config);
    const envelope = await encryptPayload(sensitive, config.table + ":" + cryptoRef + ":v1");
    const update: Record<string, unknown> = {
      [config.cipherColumn]: envelope,
      crypto_version: 1,
      encrypted_at: new Date().toISOString(),
    };
    if (config.table === "patients") Object.assign(update, await patientIndexUpdates(sensitive));
    const { error: updateError } = await adminClient
      .from(config.table).update(update).eq(config.idColumn, row[config.idColumn]);
    if (updateError) throw updateError;
    processed += 1;
  }
  return {
    resource: config.table,
    processed,
    remaining_may_exist: processed === limit,
    plaintext_preserved: true,
  };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY || !SUPABASE_SECRET_KEY) {
    return jsonResponse({ error: "Secure service is not configured." }, 500);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 12 * 1024 * 1024) return jsonResponse({ error: "Request exceeds the supported size limit." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return jsonResponse({ error: "Invalid request body." }, 400); }
    const action = typeof body.action === "string" ? body.action : "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authentication required." }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Authentication required." }, 401);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.is_active) {
      return jsonResponse({ error: "Access denied." }, 403);
    }

    if (action === "status") {
      return jsonResponse({
        ready: Boolean(DATA_KEY_BYTES && SEARCH_KEY_BYTES),
        encryption_version: 1,
        write_mode: "dual",
      });
    }

    requireCryptoConfigured();

    if (action === "backfill") {
      if ((profile.role as Role) !== "admin") return jsonResponse({ error: "Access denied." }, 403);
      const config = getConfig(body.resource);
      return jsonResponse(await backfillResource(adminClient, config, body.limit));
    }

    if (action === "bulk_import") {
      if ((profile.role as Role) !== "admin") return jsonResponse({ error: "Access denied." }, 403);
      const sourceSystem = typeof body.source_system === "string" ? body.source_system : "";
      const patients = Array.isArray(body.patients) ? body.patients : null;
      if (!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(sourceSystem) || !patients || patients.length < 1 || patients.length > 100) {
        return jsonResponse({ error: "Invalid transfer manifest or patient count." }, 400);
      }
      let totalRecords = 0;
      const encryptedPatients: Record<string, unknown>[] = [];
      for (const candidate of patients) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Invalid patient transfer row.");
        const patient = candidate as Record<string, unknown>;
        const patientData = patient.patient;
        if (!patientData || typeof patientData !== "object" || Array.isArray(patientData)) throw new Error("Invalid patient profile row.");
        const patientPayload = patientData as Record<string, unknown>;
        const patientRef = String(patient.source_patient_ref ?? "");
        const updateFields = Array.isArray(patient.update_fields) ? patient.update_fields.map(String) : [];
        let existingSensitive: Record<string, unknown> | undefined;
        let existingCryptoRef: string | undefined;
        if (patient.import_action === "UPDATE") {
          const { data: mapping, error: mappingError } = await adminClient.from("patient_transfer_patients")
            .select("patient_id").eq("source_system", sourceSystem).eq("source_patient_ref", patientRef).maybeSingle();
          if (mappingError) throw new Error("Unable to resolve an existing patient mapping.");
          if (mapping?.patient_id) {
            const { data: existing, error: existingError } = await adminClient.from("patients").select("*")
              .eq("id", mapping.patient_id).maybeSingle();
            if (existingError || !existing) throw new Error("Unable to load the mapped patient for a profile update.");
            const row = existing as Record<string, unknown>;
            existingCryptoRef = String(row.crypto_ref ?? "");
            existingSensitive = row.pii_ciphertext
              ? await decryptPayload(row.pii_ciphertext, "patients:" + existingCryptoRef + ":v1")
              : extractSensitive(row, resources.patients);
            for (const field of updateFields) {
              if (!transferProfiles.includes(field as typeof transferProfiles[number]) || !Object.prototype.hasOwnProperty.call(patientPayload, field) || patientPayload[field] === "" || patientPayload[field] == null) {
                throw new Error("Profile update field list is invalid.");
              }
            }
          }
        }
        const cryptoProfilePayload = patient.import_action === "UPDATE"
          ? Object.fromEntries(updateFields.map(field => [field, patientPayload[field]]))
          : patientPayload;
        const patientCrypto = await transferCrypto("patients", cryptoProfilePayload, existingCryptoRef, existingSensitive);
        const patientRecords = Array.isArray(patient.records) ? patient.records : [];
        totalRecords += patientRecords.length;
        if (totalRecords > 5000) return jsonResponse({ error: "Workbook exceeds the 5,000 clinical-record limit." }, 413);
        const encryptedRecords: Record<string, unknown>[] = [];
        for (const item of patientRecords) {
          if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid clinical transfer row.");
          const record = item as Record<string, unknown>;
          const table = String(record.table ?? "") as ResourceName;
          if (!(table in resources) || !transferDomains.some(domain => domain.table === table)) throw new Error("Unsupported clinical transfer category.");
          if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) throw new Error("Invalid clinical record fields.");
          const data = record.data as Record<string, unknown>;
          const crypto = await transferCrypto(table, data);
          encryptedRecords.push({ ...record, crypto });
        }
        encryptedRecords.sort((left, right) => transferDomains.findIndex(domain => domain.table === left.table) - transferDomains.findIndex(domain => domain.table === right.table));
        encryptedPatients.push({ ...patient, update_fields: updateFields, crypto: patientCrypto, records: encryptedRecords });
      }
      const { data, error } = await adminClient.rpc("admin_patient_transfer_import", {
        p_source_system: sourceSystem,
        p_patients: encryptedPatients,
        p_actor_id: authData.user.id,
      });
      if (error) {
        console.error("[MEDISENS secure-records] bulk import rejected", { code: error.code });
        return jsonResponse({ error: "The patient transfer could not be completed. Review the workbook and Admin access." }, 400);
      }
      return jsonResponse({ data });
    }

    if (action === "bulk_export") {
      if ((profile.role as Role) !== "admin") return jsonResponse({ error: "Access denied." }, 403);
      const patientIds = Array.isArray(body.patient_ids) ? body.patient_ids.map(Number) : [];
      const exportFormat = body.format === "csv" ? "csv" : body.format === "xlsx" ? "xlsx" : "";
      if (!exportFormat || !patientIds.length || patientIds.length > 100 || patientIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
        return jsonResponse({ error: "Select between 1 and 100 valid patient records." }, 400);
      }
      let exportOperationId = "";
      try {
      const { data: request, error: requestError } = await adminClient.rpc("admin_patient_transfer_export", {
        p_patient_ids: patientIds,
        p_export_format: exportFormat,
        p_actor_id: authData.user.id,
      });
      if (requestError) throw new Error("Unable to create the authorized export operation.");
      const operation = request as { operation_id: string; patients: Array<{ patient_id: number; source_patient_ref: string }> };
      exportOperationId = operation.operation_id;
      const ids = operation.patients.map(item => Number(item.patient_id));
      const patientRefs = new Map(operation.patients.map(item => [Number(item.patient_id), item.source_patient_ref]));
      const patientSelect = [...new Set(["id", "created_at", ...transferProfiles, ...resources.patients.sensitiveFields, resources.patients.cipherColumn, "crypto_ref"])].join(",");
      const { data: rawPatients, error: patientError } = await adminClient.from("patients").select(patientSelect).in("id", ids).limit(101);
      if (patientError || !rawPatients || rawPatients.length !== ids.length) throw new Error("Patient export selection is unavailable.");
      const exportedPatients = await Promise.all(rawPatients.map(async value => {
        const row = value as Record<string, unknown>;
        const patient = await transferProjection("patients", row, transferProfiles);
        return { id: row.id, source_patient_ref: patientRefs.get(Number(row.id)), patient: { ...patient, source_created_at: row.created_at ?? "" } };
      }));
      const categories: Record<string, Record<string, unknown>[]> = {
        initial_consultations: [], vitals: [], consultations: [], lab_requests: [], lab_results: [], prescriptions: [], follow_ups: [],
      };
      let recordTotal = exportedPatients.length;
      if (exportFormat === "xlsx") {
      const idsByTable = new Map<string, Map<number, string>>();
      const patientByTable = new Map<string, Map<number, number>>();
      const rawRowsByTable = new Map<string, Record<string, unknown>[]>();
      for (const domain of transferDomains) {
        const config = resources[domain.table as ResourceName];
        const select = [...new Set([domain.id, ...domain.keys, ...domain.fields.filter(field => !field.endsWith("_ref") && field !== "source_authority"), ...config.sensitiveFields, config.cipherColumn, "crypto_ref"])].join(",");
        const { data: values, error } = await adminClient.from(domain.table).select(select).in("patient_id", ids).limit(5001);
        if (error) throw new Error("Unable to read an authorized clinical record category.");
        const rows = (values ?? []) as Record<string, unknown>[];
        if (rows.length > 5000 || recordTotal + rows.length > 5000) throw new Error("Export exceeds the supported record limit.");
        recordTotal += rows.length;
        rawRowsByTable.set(domain.table, rows);
        const refMap = new Map(rows.map(row => [Number(row[domain.id]), `${domain.table}:${row[domain.id]}`]));
        idsByTable.set(domain.table, refMap);
        patientByTable.set(domain.table, new Map(rows.map(row => [Number(row[domain.id]), Number(row.patient_id)])));
      }
      for (const domain of transferDomains) {
        const rows = rawRowsByTable.get(domain.table) ?? [];
        const output: Record<string, unknown>[] = [];
        for (const row of rows) {
          const data = await transferProjection(domain.table as ResourceName, row, domain.fields.filter(field => !field.endsWith("_ref") && field !== "source_authority"));
          const item: Record<string, unknown> = {
            ...data,
            [domain.id]: row[domain.id],
            patient_id: row.patient_id,
            source_patient_ref: patientRefs.get(Number(row.patient_id)) ?? "",
          };
          for (const key of domain.keys) {
            const parentTable = key === "initial_consultation_id" ? "initial_consultation" : key === "consultation_id" ? "consultation" : key === "labrequest_id" ? "lab_request" : "";
            if (key !== "patient_id" && row[key] != null && (!parentTable || patientByTable.get(parentTable)?.get(Number(row[key])) !== Number(row.patient_id))) throw new Error("Clinical relationship crosses patient boundaries or is outside the selected export scope.");
            if (row[key] != null && key === "initial_consultation_id" && !idsByTable.get("initial_consultation")?.has(Number(row[key]))) throw new Error("Clinical relationship is outside the selected patient export scope.");
            if (row[key] != null && key === "consultation_id" && !idsByTable.get("consultation")?.has(Number(row[key]))) throw new Error("Clinical relationship is outside the selected patient export scope.");
            if (row[key] != null && key === "labrequest_id" && !idsByTable.get("lab_request")?.has(Number(row[key]))) throw new Error("Clinical relationship is outside the selected patient export scope.");
            if (key === "initial_consultation_id") item.initial_consultation_id = row[key] ?? null;
            if (key === "consultation_id") item.consultation_id = row[key] ?? null;
            if (key === "labrequest_id") item.labrequest_id = row[key] ?? null;
          }
          if (["consultation", "lab_request", "lab_result", "prescription", "follow_up"].includes(domain.table)) item.source_authority = "SOURCE_DATABASE_RECORD";
          output.push(item);
        }
        const category = domain.table === "initial_consultation" ? "initial_consultations" : domain.table === "vital_sign" ? "vitals" : domain.table === "consultation" ? "consultations" : domain.table === "lab_request" ? "lab_requests" : domain.table === "lab_result" ? "lab_results" : domain.table === "prescription" ? "prescriptions" : "follow_ups";
        categories[category] = output;
      }
      }
      const payload = { source_system: "MEDISENS", patients: exportedPatients, ...categories };
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 10 * 1024 * 1024) throw new Error("Export exceeds the supported file-size limit.");
      const file = transferFile(payload, exportFormat);
      const { error: generatedError } = await adminClient.rpc("admin_patient_transfer_export_generated", {
        p_operation_id: operation.operation_id,
        p_record_count: recordTotal,
        p_actor_id: authData.user.id,
      });
      if (generatedError) throw new Error("Unable to record the server-generated export.");
      return jsonResponse({ data: { operation_id: operation.operation_id, status: "GENERATED", ...file } });
      } catch (error) {
        if (exportOperationId) await adminClient.rpc("admin_patient_transfer_export_failed", { p_operation_id: exportOperationId, p_actor_id: authData.user.id });
        throw error;
      }
    }

    if (action === "read") {
      const config = getConfig(body.resource);
      const id = body.id;
      if (id === undefined || id === null || id === "") throw new Error("Record id is required.");

      const { data: row, error } = await userClient
        .from(config.table)
        .select("*")
        .eq(config.idColumn, id)
        .maybeSingle();

      if (error) throw error;
      if (!row) return jsonResponse({ data: null }, 404);

      const record = row as Record<string, unknown>;
      const cryptoRef = String(record.crypto_ref ?? "");
      const sensitive = record[config.cipherColumn]
        ? await decryptPayload(record[config.cipherColumn], config.table + ":" + cryptoRef + ":v1")
        : extractSensitive(record, config);

      return jsonResponse({ data: sanitizeResult(record, config, sensitive) });
    }

    if (action === "list_by_patient") {
      const config = getConfig(body.resource);
      if (!config.patientIdColumn) throw new Error("Resource does not support patient listing.");
      const patientId = body.patient_id;
      if (patientId === undefined || patientId === null || patientId === "") throw new Error("patient_id is required.");

      const { data: rows, error } = await userClient
        .from(config.table)
        .select("*")
        .eq(config.patientIdColumn, patientId);

      if (error) throw error;

      const decrypted = await Promise.all((rows ?? []).map(async rawRow => {
        const record = rawRow as Record<string, unknown>;
        const cryptoRef = String(record.crypto_ref ?? "");
        const sensitive = record[config.cipherColumn]
          ? await decryptPayload(record[config.cipherColumn], config.table + ":" + cryptoRef + ":v1")
          : extractSensitive(record, config);
        return sanitizeResult(record, config, sensitive);
      }));

      return jsonResponse({ data: decrypted });
    }

    if (action === "search_patients") {
      const kind = typeof body.kind === "string" ? body.kind : "name";
      const query = String(body.query ?? "").trim();
      if (!query) return jsonResponse({ data: [] });
      const requestedLimit = Number(body.limit ?? 25);
      const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 25, 50));

      let q = userClient.from("patients").select("*").limit(limit);
      if (kind === "id") {
        q = q.eq("id", query);
      } else if (kind === "contact") {
        const normalized = normalizeContact(query);
        if (!normalized) return jsonResponse({ data: [] });
        q = q.eq("contact_bidx", await blindIndex(normalized));
      } else if (kind === "philhealth") {
        const normalized = normalizePhilhealth(query);
        if (!normalized) return jsonResponse({ data: [] });
        q = q.eq("philhealth_bidx", await blindIndex(normalized));
      } else {
        const tokens = normalizeName(query).split(/\s+/).filter(Boolean);
        if (!tokens.length) return jsonResponse({ data: [] });
        q = q.contains("name_token_bidx", await Promise.all(tokens.map(blindIndex)));
      }

      const { data: rows, error } = await q;
      if (error) throw error;

      const config = resources.patients;
      const decrypted = await Promise.all((rows ?? []).map(async rawRow => {
        const record = rawRow as Record<string, unknown>;
        const cryptoRef = String(record.crypto_ref ?? "");
        const sensitive = record[config.cipherColumn]
          ? await decryptPayload(record[config.cipherColumn], config.table + ":" + cryptoRef + ":v1")
          : extractSensitive(record, config);
        return sanitizeResult(record, config, sensitive);
      }));

      return jsonResponse({ data: decrypted });
    }

    if (action === "write") {
      const config = getConfig(body.resource);
      const operation = body.operation === "insert" ? "insert" : body.operation === "update" ? "update" : null;
      if (!operation) throw new Error("operation must be insert or update.");
      if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
        throw new Error("payload is required.");
      }
      const payload = body.payload as Record<string, unknown>;

      let cryptoRef = crypto.randomUUID();
      let existingSensitive: Record<string, unknown> = {};

      if (operation === "update") {
        const id = body.id;
        if (id === undefined || id === null || id === "") throw new Error("Record id is required for update.");
        const { data: existing, error: existingError } = await userClient
          .from(config.table)
          .select("*")
          .eq(config.idColumn, id)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return jsonResponse({ error: "Record not found." }, 404);

        const row = existing as Record<string, unknown>;
        cryptoRef = String(row.crypto_ref ?? "");
        if (!cryptoRef) throw new Error("Existing record is missing crypto_ref.");
        existingSensitive = row[config.cipherColumn]
          ? await decryptPayload(row[config.cipherColumn], config.table + ":" + cryptoRef + ":v1")
          : extractSensitive(row, config);
      }

      const sensitive = mergeSensitive(existingSensitive, payload, config);
      const envelope = await encryptPayload(sensitive, config.table + ":" + cryptoRef + ":v1");
      const writePayload: Record<string, unknown> = {
        ...stripSensitive(payload, config),
        ...Object.fromEntries(
          config.sensitiveFields
            .filter(field => Object.prototype.hasOwnProperty.call(payload, field))
            .map(field => [field, payload[field]]),
        ),
        [config.cipherColumn]: envelope,
        crypto_ref: cryptoRef,
        crypto_version: 1,
        encrypted_at: new Date().toISOString(),
      };

      if (config.table === "patients") Object.assign(writePayload, await patientIndexUpdates(sensitive));

      if (operation === "insert") {
        const { data, error } = await userClient
          .from(config.table)
          .insert([writePayload])
          .select(config.idColumn)
          .single();
        if (error) throw error;
        return jsonResponse({ data }, 201);
      }

      const { data, error } = await userClient
        .from(config.table)
        .update(writePayload)
        .eq(config.idColumn, body.id)
        .select(config.idColumn)
        .single();
      if (error) throw error;
      return jsonResponse({ data });
    }

    return jsonResponse({ error: "Unsupported secure action." }, 400);
  } catch (error) {
    console.error("[MEDISENS secure-records] request failed", { name: error instanceof Error ? error.name : "unknown" });
    const message = error instanceof Error && error.message === "MediSens encryption keys are not configured."
      ? "Encryption service is not ready."
      : "Secure record operation failed.";
    return jsonResponse({ error: message }, message === "Encryption service is not ready." ? 503 : 400);
  }
});
