// ============================================================
// Supabase Edge Function: patient-account-recover
// Patient Account Phase 3 -- self-service SMS OTP recovery
// (docs/patientAccount.md §5.5, point 1). Staff-mediated recovery (point 2)
// is the SAME Edge Function family as activation -- see
// patient-activation-issue with purpose="RECOVERY", then the normal
// patient-activation-verify / patient-activation-complete steps.
//
// This function only covers the path available to an account whose
// underlying patient record has a contact number on file, reached
// through that account's own SELF grant (a caregiver-only account has no
// patient record of its own and therefore no phone number to send an
// OTP to -- it must use staff-mediated recovery).
//
// Public endpoint. Never reveals whether a MediSens ID exists.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  requireEnv,
  hmacHex,
  generateOtp,
  sendSms,
  derivePatientPassword,
  validatePinPolicy,
  writeAudit,
  GENERIC_AUTH_ERROR,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 3;

// Generic response for the "request" step regardless of whether the ID
// exists, has a contact number, or a code was actually sent -- constant
// shape, no timing-distinguishable branch left visible to the caller.
const REQUEST_ACK = { message: "If that MediSens ID has a phone number on file, a verification code was sent to it." };

function errorResponse(status: number, message = GENERIC_AUTH_ERROR) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-account-recover] missing configuration");
      return errorResponse(500, "Unable to process this request right now. Please try again.");
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const step = body?.step === "verify" ? "verify" : "request";
    const medisensId = typeof body?.medisensId === "string" ? body.medisensId.trim().toUpperCase() : "";
    if (!medisensId) return errorResponse(400, "A MediSens ID is required.");

    const { data: account } = await adminClient
      .from("patient_accounts")
      .select("id, auth_user_id, medisens_id, status")
      .eq("medisens_id", medisensId)
      .maybeSingle();

    // The account's own contact number comes from a patient record it
    // holds a SELF grant on. A caregiver-only account has none.
    let contactNumber: string | null = null;
    if (account) {
      const { data: selfGrant } = await adminClient
        .from("patient_access_grants")
        .select("patient_id")
        .eq("account_id", account.id)
        .eq("relationship", "SELF")
        .is("revoked_at", null)
        .maybeSingle();
      if (selfGrant) {
        const { data: patient } = await adminClient
          .from("patients")
          .select("contactNumber")
          .eq("id", selfGrant.patient_id)
          .maybeSingle();
        contactNumber = patient?.contactNumber ?? null;
      }
    }

    if (step === "request") {
      if (!account || !contactNumber) return jsonResponse(REQUEST_ACK);

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await adminClient
        .from("patient_otp_challenges")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
        .gte("created_at", oneHourAgo);
      if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) return jsonResponse(REQUEST_ACK);

      const otpPepper = requireEnv("PATIENT_OTP_PEPPER");
      const otp = generateOtp();
      const otpHash = await hmacHex(otpPepper, otp);
      await adminClient.from("patient_otp_challenges").insert([{
        account_id: account.id,
        code_hash: otpHash,
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      }]);
      await sendSms(contactNumber, `Your MediSens account recovery code is ${otp}. It expires in 5 minutes.`);
      return jsonResponse(REQUEST_ACK);
    }

    // step === "verify"
    const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
    const newPin = typeof body?.newPin === "string" ? body.newPin : "";
    if (!otp || !newPin) return errorResponse(400, "A code and a new PIN are required.");
    if (!account) return errorResponse(401);

    const { data: challenge, error: challengeError } = await adminClient
      .from("patient_otp_challenges")
      .select("id, code_hash, expires_at, consumed_at, attempts")
      .eq("account_id", account.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError || !challenge) return errorResponse(401);
    if (new Date(challenge.expires_at).getTime() <= Date.now()) return errorResponse(401);
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) return errorResponse(429, "Too many attempts. Please request a new code.");

    const otpPepper = requireEnv("PATIENT_OTP_PEPPER");
    const submittedHash = await hmacHex(otpPepper, otp);
    if (submittedHash !== challenge.code_hash) {
      await adminClient.from("patient_otp_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
      return errorResponse(401);
    }

    // patient birthday isn't looked up here for the PIN-policy substring
    // check (this path has no single unambiguous patient record for a
    // caregiver account, and for a SELF account it is available via the
    // grant above) -- fetch it best-effort when a SELF grant exists.
    let birthday: string | null = null;
    const { data: selfGrant2 } = await adminClient
      .from("patient_access_grants")
      .select("patient_id")
      .eq("account_id", account.id)
      .eq("relationship", "SELF")
      .is("revoked_at", null)
      .maybeSingle();
    if (selfGrant2) {
      const { data: p } = await adminClient.from("patients").select("birthday").eq("id", selfGrant2.patient_id).maybeSingle();
      birthday = p?.birthday ?? null;
    }

    const pinCheck = validatePinPolicy(newPin, birthday);
    if (!pinCheck.valid) return errorResponse(422, pinCheck.reason);

    await adminClient.from("patient_otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);

    const derivedPassword = await derivePatientPassword(newPin, account.medisens_id);
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(account.auth_user_id, { password: derivedPassword });
    if (updateAuthError) {
      console.error("[MEDISENS patient-account-recover] password update failed", { message: updateAuthError.message });
      return errorResponse(500);
    }

    const { error: updateAccountError } = await adminClient.from("patient_accounts").update({
      pin_updated_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
      status: "active",
    }).eq("id", account.id);
    if (updateAccountError) {
      // Same reasoning as patient-activation-complete: the Auth password
      // already changed, so a stale status/locked_until here would desync
      // credential from account state rather than merely reset a
      // bookkeeping timestamp. Fail loudly instead of returning
      // recovered:true over an account that may still read as locked.
      console.error("[MEDISENS patient-account-recover] account update failed", { message: updateAccountError.message });
      return errorResponse(500, "Your PIN was reset, but finishing recovery failed. Please try signing in, or visit the RHU if it does not work.");
    }

    await writeAudit(adminClient, {
      userId: null,
      userName: account.medisens_id,
      userRole: "patient",
      action: "recover",
      recordId: account.id,
      recordType: "patient_account",
      description: "Patient account recovered via SMS OTP.",
      metadata: { account_id: account.id },
    });

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({
      email: `${account.medisens_id.toLowerCase()}@patient.medisens.local`,
      password: derivedPassword,
    });
    if (signInError || !session.session) {
      return jsonResponse({ recovered: true, session: null });
    }

    return jsonResponse({
      recovered: true,
      session: { access_token: session.session.access_token, refresh_token: session.session.refresh_token },
    });
  } catch (err) {
    console.error("[MEDISENS patient-account-recover] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
