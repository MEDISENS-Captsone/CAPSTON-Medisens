// ============================================================
// Patient Account Phase 3 — shared helpers for the patient-* Edge
// Functions. Centralizes the security-critical logic (credential
// derivation, code/OTP hashing, PIN policy, phone/SMS) so it exists in
// exactly one place rather than being copy-pasted across seven
// functions. Everything else (CORS headers, jsonResponse, per-function
// auth wiring) stays duplicated per the existing repo convention (see
// create-user/index.ts, send-followup-reminders/index.ts).
// ============================================================

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// A single generic error for every patient-facing auth/activation/recovery
// failure. Never distinguishes "wrong PIN" from "no such MediSens ID" from
// "code expired" -- that distinction is only ever in the server log.
export const GENERIC_AUTH_ERROR = "That MediSens ID, code, or PIN was not recognized. Please try again.";

// ---------------------------------------------------------------
// Crypto: HMAC-SHA256 over Deno's Web Crypto, hex-encoded.
// ---------------------------------------------------------------

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(signature);
}

/**
 * Derives the value actually stored as a patient auth user's Supabase Auth
 * password. This is the D-2 guarantee: the raw PIN a patient types is never
 * the value presented to GoTrue. A client that tried
 * `supabase.auth.signInWithPassword({ email, password: <raw PIN> })`
 * directly would fail, because the stored password is this HMAC, not the
 * PIN -- only `patient-login` (holding PATIENT_PIN_PEPPER, a server-only
 * secret) can compute the value GoTrue actually expects.
 *
 * ROTATION WARNING: every patient's derived Auth password is a function of
 * this pepper. Rotating PATIENT_PIN_PEPPER (e.g. in Supabase project
 * secrets) immediately invalidates every existing patient's stored Auth
 * password, and patient-login would derive a different value than what
 * GoTrue has on file -- every patient would be locked out simultaneously,
 * indistinguishable from a mass "forgot PIN" event, with no automatic
 * recovery. There is no rotation/re-derivation system in this phase; if the
 * pepper is ever rotated, every patient account needs its password reset
 * through the existing staff-mediated recovery path (or an explicit,
 * separately-designed migration) before that account can sign in again.
 * Do not rotate this secret without planning for that.
 */
export async function derivePatientPassword(pin: string, salt: string): Promise<string> {
  const pepper = requireEnv("PATIENT_PIN_PEPPER");
  return hmacHex(pepper, `${salt}:${pin}`);
}

// ---------------------------------------------------------------
// Random code/ID generation
// ---------------------------------------------------------------

// Excludes visually ambiguous characters (0/O, 1/I/L) -- these codes are
// read aloud or handwritten at the RHU counter.
const SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomFromAlphabet(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/** 8-character activation/recovery code, e.g. "7K9QXM2P". */
export function generateActivationCode(): string {
  return randomFromAlphabet(8, SAFE_ALPHABET);
}

/** MediSens ID, e.g. "MS-7K9Q-XM2P". Opaque -- never derived from patient data. */
export function generateMedisensId(): string {
  return `MS-${randomFromAlphabet(4, SAFE_ALPHABET)}-${randomFromAlphabet(4, SAFE_ALPHABET)}`;
}

/** 6-digit numeric OTP. */
export function generateOtp(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => (b % 10).toString()).join("");
}

// ---------------------------------------------------------------
// PIN / password policy (§5.4) -- validated server-side, never trusted
// from the client beyond this check.
// ---------------------------------------------------------------

const COMMON_WEAK_PINS = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555",
  "666666", "777777", "888888", "999999", "123456", "654321",
  "123123", "112233", "121212", "010101", "159753", "147258",
  "102030", "202020",
]);

function isSequential(pin: string): boolean {
  const digits = pin.split("").map(Number);
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[i - 1] + 1) ascending = false;
    if (digits[i] !== digits[i - 1] - 1) descending = false;
  }
  return ascending || descending;
}

function isRepeatedDigit(pin: string): boolean {
  return new Set(pin.split("")).size === 1;
}

function containsBirthdateSubstring(pin: string, birthday: string | null | undefined): boolean {
  if (!birthday) return false;
  const digitsOnly = birthday.replace(/\D/g, ""); // YYYYMMDD from a date input
  if (digitsOnly.length < 4) return false;
  const yyyymmdd = digitsOnly;
  const mmdd = digitsOnly.slice(4, 8);
  const yyyy = digitsOnly.slice(0, 4);
  const ddmmyyyy = digitsOnly.length === 8
    ? digitsOnly.slice(6, 8) + digitsOnly.slice(4, 6) + digitsOnly.slice(0, 4)
    : "";
  return [yyyymmdd, mmdd, yyyy, ddmmyyyy].some((candidate) => candidate.length >= 4 && pin.includes(candidate));
}

export interface PinPolicyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Accepts either a 6+ digit numeric PIN or an 8+ character password
 * (§5.4). Server-side only -- the client's own input validation is not a
 * security boundary.
 */
export function validatePinPolicy(secret: string, birthday?: string | null): PinPolicyResult {
  if (!secret || typeof secret !== "string") return { valid: false, reason: "A PIN or password is required." };

  const isNumericPin = /^\d+$/.test(secret);

  if (isNumericPin) {
    if (secret.length < 6) return { valid: false, reason: "A numeric PIN must be at least 6 digits." };
    if (COMMON_WEAK_PINS.has(secret)) return { valid: false, reason: "That PIN is too common. Please choose another." };
    if (isSequential(secret)) return { valid: false, reason: "That PIN is a simple sequence. Please choose another." };
    if (isRepeatedDigit(secret)) return { valid: false, reason: "That PIN repeats the same digit. Please choose another." };
    if (containsBirthdateSubstring(secret, birthday)) {
      return { valid: false, reason: "That PIN is based on your birthdate. Please choose another." };
    }
    return { valid: true };
  }

  if (secret.length < 8) {
    return { valid: false, reason: "A password must be at least 8 characters, or use a 6+ digit PIN instead." };
  }
  return { valid: true };
}

// ---------------------------------------------------------------
// SMS (iProg) -- same provider/pattern as send-followup-reminders/index.ts.
// ---------------------------------------------------------------

const IPROG_SMS_URL = "https://www.iprogsms.com/api/v1/sms_messages";

export function formatPhoneNumber(number: string): string {
  const cleaned = String(number).replace(/\D/g, "");
  if (cleaned.startsWith("63")) return cleaned;
  if (cleaned.startsWith("0")) return "63" + cleaned.slice(1);
  if (cleaned.startsWith("9")) return "63" + cleaned;
  return cleaned;
}

export async function sendSms(phoneNumber: string, message: string): Promise<{ ok: boolean; status: number }> {
  const apiToken = requireEnv("IPROG_API_TOKEN");
  const formattedNumber = formatPhoneNumber(phoneNumber);
  const response = await fetch(IPROG_SMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number: formattedNumber, message, api_token: apiToken }),
  });
  return { ok: response.ok, status: response.status };
}

// ---------------------------------------------------------------
// Env / config
// ---------------------------------------------------------------

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

export const STAFF_ISSUING_ROLES = new Set(["BHW", "nurse", "midwives", "admin"]);

export interface StaffCaller {
  userId: string;
  role: string;
  fullName: string;
}

/** Confirms the request is on behalf of an authenticated staff member with
 * one of the given roles, resolved through profiles -- never through
 * client-supplied metadata. */
export async function requireStaffCaller(
  adminClient: { from: (table: string) => any },
  userClient: { auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> } },
  allowedRoles: Set<string>,
): Promise<StaffCaller | null> {
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile || !allowedRoles.has(profile.role)) return null;

  return { userId: authData.user.id, role: profile.role, fullName: profile.full_name ?? "" };
}

export interface AuditInsert {
  userId: string | null;
  userName: string;
  userRole: string;
  action: "activate" | "grant" | "revoke" | "recover" | "view";
  recordId: string | null;
  recordType: "patient_account" | "patient_access_grant" | "patient_correction_request" | null;
  description: string;
  metadata?: Record<string, unknown>;
}

/** Direct audit_logs insert via the service-role client, matching the
 * pattern already used in send-followup-reminders/index.ts. Module is
 * always "Patient Portal" for this function family. */
export async function writeAudit(adminClient: { from: (table: string) => any }, entry: AuditInsert): Promise<void> {
  const { error } = await adminClient.from("audit_logs").insert([{
    user_id: entry.userId,
    user_name: entry.userName,
    user_role: entry.userRole,
    action: entry.action,
    module: "Patient Portal",
    record_id: entry.recordId,
    record_type: entry.recordType,
    description: entry.description,
    metadata: entry.metadata ?? {},
  }]);
  if (error) {
    console.error("[MEDISENS patient-portal audit] insert failed", { message: error.message, action: entry.action });
  }
}

/** Whether a patient is under 18 as of now, from patients.birthday
 * (YYYY-MM-DD). Returns null if birthday is missing -- callers must treat
 * that as "cannot verify minority" and fail safe. */
export function isUnder18(birthday: string | null | undefined): boolean | null {
  if (!birthday) return null;
  const dob = new Date(birthday);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age < 18;
}

/** The patient's 18th-birthday timestamp, for GUARDIAN grants' expires_at. */
export function eighteenthBirthdayIso(birthday: string | null | undefined): string | null {
  if (!birthday) return null;
  const dob = new Date(birthday);
  if (Number.isNaN(dob.getTime())) return null;
  const eighteenth = new Date(Date.UTC(dob.getUTCFullYear() + 18, dob.getUTCMonth(), dob.getUTCDate()));
  return eighteenth.toISOString();
}
