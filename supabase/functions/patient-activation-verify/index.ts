// ============================================================
// Supabase Edge Function: patient-activation-verify
// Patient Account Phase 3 -- the patient (or account-only caregiver, or a
// staff-issued recovery code holder) submits the code they were given.
// Public endpoint (no staff session) -- the code itself is the credential
// being checked. Never reveals which part of the input was wrong.
// (docs/patientAccount.md §5.2 step 6, §5.2.1 step 4)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  requireEnv,
  hmacHex,
  generateOtp,
  sendSms,
  GENERIC_AUTH_ERROR,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 5 * 60 * 1000;

interface VerifyPayload {
  code: string;
  otp?: string;
}

function errorResponse(status: number, message = GENERIC_AUTH_ERROR) {
  return jsonResponse({ error: message }, status);
}

function validatePayload(value: unknown): VerifyPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const otp = typeof body.otp === "string" ? body.otp.trim() : undefined;
  if (!code) throw new Error("A code is required.");
  return { code, otp };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-activation-verify] missing configuration");
      return errorResponse(500, "Unable to verify the code right now. Please try again.");
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    let payload: VerifyPayload;
    try {
      payload = validatePayload(await req.json());
    } catch {
      return errorResponse(400);
    }

    const pepper = requireEnv("PATIENT_ACTIVATION_CODE_PEPPER");
    const codeHash = await hmacHex(pepper, payload.code);

    const { data: activation, error: activationError } = await adminClient
      .from("patient_activation_codes")
      .select("id, patient_id, relationship, target_account_id, purpose, expires_at, consumed_at, holder_name")
      .eq("code_hash", codeHash)
      .maybeSingle();

    // Generic error whether the code is wrong, unknown, expired, or already used.
    if (activationError || !activation) return errorResponse(401);
    if (activation.consumed_at) return errorResponse(401);
    if (new Date(activation.expires_at).getTime() <= Date.now()) return errorResponse(401);

    const { data: patient } = await adminClient
      .from("patients")
      .select("contactNumber, firstName, lastName")
      .eq("id", activation.patient_id)
      .maybeSingle();

    // Step 6 correction: the activation UI needs to show the account
    // holder's own name separately from whose health record the
    // activation grants access to (docs/patientAccount.md §17 Phase 9B
    // Step 6 task §12) -- patient-activation-verify previously returned
    // only {verified, otpRequired}, with no way for the client to
    // display this distinction without guessing. This adds three
    // display-only fields, never a secret/UUID/hash: `relationship`
    // (already public knowledge to whoever holds the physical code --
    // it was printed on the Step 5 activation slip), `holderName`
    // (target_account_id's own display_name when this code updates an
    // existing account -- account-only caregiver PIN setup or a
    // recovery code; the GUARDIAN activation code's own holder_name
    // column for a fresh guardian activation; the patient's own name for
    // a fresh SELF activation), and `accessPatientName` (the patient
    // record's display name, so a GUARDIAN/CAREGIVER screen can say
    // "Access to: <name>'s health record" -- omitted for SELF, where
    // holder and accessed record are the same person).
    let holderName: string | null = null;
    if (activation.target_account_id) {
      const { data: targetAccount } = await adminClient
        .from("patient_accounts")
        .select("display_name")
        .eq("id", activation.target_account_id)
        .maybeSingle();
      holderName = targetAccount?.display_name ?? null;
    } else if (activation.relationship === "GUARDIAN") {
      holderName = activation.holder_name ?? null;
    } else {
      holderName = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") || null : null;
    }
    const accessPatientName = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") || null : null;
    const verifiedContext = { relationship: activation.relationship, holderName, accessPatientName };

    const hasContactNumber = Boolean(patient?.contactNumber);

    if (!hasContactNumber) {
      // No number on file: the code alone stands (it was handed over in person).
      return jsonResponse({ verified: true, otpRequired: false, ...verifiedContext });
    }

    const otpPepper = requireEnv("PATIENT_OTP_PEPPER");

    if (!payload.otp) {
      // First call for a contact-number-bearing patient: issue the OTP.
      const otp = generateOtp();
      const otpHash = await hmacHex(otpPepper, otp);
      const { error: otpInsertError } = await adminClient.from("patient_otp_challenges").insert([{
        activation_code_id: activation.id,
        code_hash: otpHash,
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      }]);
      if (otpInsertError) {
        console.error("[MEDISENS patient-activation-verify] otp insert failed", { message: otpInsertError.message });
        return errorResponse(500, "Unable to send a verification code right now. Please try again.");
      }
      await sendSms(patient!.contactNumber, `Your MediSens verification code is ${otp}. It expires in 5 minutes.`);
      return jsonResponse({ verified: false, otpRequired: true });
    }

    // Second call: check the OTP against the most recent unconsumed challenge for this code.
    const { data: challenge, error: challengeError } = await adminClient
      .from("patient_otp_challenges")
      .select("id, code_hash, expires_at, consumed_at, attempts")
      .eq("activation_code_id", activation.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError || !challenge) return errorResponse(401);
    if (new Date(challenge.expires_at).getTime() <= Date.now()) return errorResponse(401);
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      return errorResponse(429, "Too many attempts. Please request a new code.");
    }

    const submittedHash = await hmacHex(otpPepper, payload.otp);
    if (submittedHash !== challenge.code_hash) {
      await adminClient.from("patient_otp_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
      return errorResponse(401);
    }

    await adminClient.from("patient_otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);

    return jsonResponse({ verified: true, otpRequired: false, ...verifiedContext });
  } catch (err) {
    console.error("[MEDISENS patient-activation-verify] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
