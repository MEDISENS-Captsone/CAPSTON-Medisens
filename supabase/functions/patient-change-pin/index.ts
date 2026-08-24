// ============================================================
// Supabase Edge Function: patient-change-pin
// Patient Account Phase 8 -- the one self-service credential write
// identified in §9.5's Privacy & Security zone ("Change PIN") that no
// existing function covers. patient-account-recover (Phase 3) is the
// "I no longer know my PIN" path (OTP or staff-mediated); this is the
// distinct "I know my current PIN and want to set a new one" path, only
// reachable from an authenticated Patient Portal session.
//
// Same D-2 guarantee as every other patient credential path: the PIN is
// never presented to GoTrue directly, in either direction. The *current*
// PIN is verified by deriving its GoTrue password and attempting a
// server-side sign-in (proof of knowledge, not a client-supplied
// boolean); the *new* PIN is derived the same way patient-activation-
// complete already derives a fresh credential.
//
// Pre-deployment security review: current-PIN verification shares
// patient-login's own failed_attempts/locked_until columns and lockout
// thresholds (5 -> 15-minute soft lock, 10 -> hard lock, §5.4). Without
// this, an attacker holding a valid session JWT (e.g. a stolen/replayed
// token) could call this endpoint as an unthrottled six-digit
// current-PIN guessing oracle, completely bypassing patient-login's own
// lockout. The two paths intentionally share one counter per account --
// a wrong PIN here counts exactly like a wrong PIN at sign-in, so an
// attacker cannot combine two separate five-attempt budgets.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  derivePatientPassword,
  validatePinPolicy,
  writeAudit,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

// Identical thresholds to patient-login (§5.4) -- the two paths share the
// same patient_accounts.failed_attempts/locked_until state.
const SOFT_LOCK_THRESHOLD = 5;
const SOFT_LOCK_MINUTES = 15;
const HARD_LOCK_THRESHOLD = 10;

interface ChangePinPayload {
  currentPin: string;
  newPin: string;
}

function errorResponse(status: number, message = "Unable to change your PIN right now. Please try again.") {
  return jsonResponse({ error: message }, status);
}

function validatePayload(value: unknown): ChangePinPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const currentPin = typeof body.currentPin === "string" ? body.currentPin : "";
  const newPin = typeof body.newPin === "string" ? body.newPin : "";
  if (!currentPin) throw new Error("Your current PIN is required.");
  if (!newPin) throw new Error("A new PIN is required.");
  return { currentPin, newPin };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-change-pin] missing configuration");
      return errorResponse(500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse(401, "Please sign in again.");

    // Resolves the caller's own identity from their own Patient Portal
    // session JWT -- the same "who is calling" pattern the staff-caller
    // functions use (a user-scoped client reading its own auth.getUser()),
    // just for a patient session instead of a staff one. This function
    // only ever acts on the caller's own account; it never accepts an
    // account id or patient id from the request body.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return errorResponse(401, "Please sign in again.");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: account, error: accountError } = await adminClient
      .from("patient_accounts")
      .select("id, medisens_id, status, failed_attempts, locked_until")
      .eq("auth_user_id", callerData.user.id)
      .maybeSingle();
    if (accountError || !account) return errorResponse(401, "Please sign in again.");
    if (account.status === "disabled") return errorResponse(403, "This account cannot change its PIN right now. Please visit the RHU.");
    if (account.status === "locked") return errorResponse(401, "This account is locked. Please visit the RHU to reset your PIN.");
    if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
      return errorResponse(401, "Too many attempts. Please try again later, or visit the RHU to reset your PIN.");
    }

    let payload: ChangePinPayload;
    try {
      payload = validatePayload(await req.json());
    } catch (err) {
      return errorResponse(400, err instanceof Error ? err.message : "Invalid request.");
    }

    // Proof of knowledge of the *current* PIN: derive its password and
    // attempt a real sign-in, exactly what patient-login does. A wrong
    // current PIN fails here with the same generic message a wrong new-
    // PIN-policy failure would use -- this endpoint never confirms or
    // denies whether the account/PIN combination "exists" beyond what the
    // caller, already holding a valid session, already knows.
    const currentDerivedPassword = await derivePatientPassword(payload.currentPin, account.medisens_id);
    const verifyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: `${account.medisens_id.toLowerCase()}@patient.medisens.local`,
      password: currentDerivedPassword,
    });

    if (verifyError) {
      // Same compare-and-swap increment patient-login uses -- two
      // concurrent wrong attempts must not collapse into a single
      // increment.
      let attempted = 0;
      let currentFailedAttempts = account.failed_attempts;
      while (attempted < 3) {
        attempted++;
        const nextFailedAttempts = currentFailedAttempts + 1;
        const update: Record<string, unknown> = { failed_attempts: nextFailedAttempts };
        if (nextFailedAttempts >= HARD_LOCK_THRESHOLD) {
          update.status = "locked";
        } else if (nextFailedAttempts >= SOFT_LOCK_THRESHOLD) {
          update.locked_until = new Date(Date.now() + SOFT_LOCK_MINUTES * 60 * 1000).toISOString();
        }
        const { data: updatedRows } = await adminClient
          .from("patient_accounts")
          .update(update)
          .eq("id", account.id)
          .eq("failed_attempts", currentFailedAttempts)
          .select("id");
        if (updatedRows && updatedRows.length > 0) break;

        const { data: refreshed } = await adminClient
          .from("patient_accounts")
          .select("failed_attempts")
          .eq("id", account.id)
          .maybeSingle();
        if (!refreshed) break;
        currentFailedAttempts = refreshed.failed_attempts;
      }

      await writeAudit(adminClient, {
        userId: null,
        userName: account.medisens_id,
        userRole: "patient",
        action: "recover",
        recordId: account.id,
        recordType: "patient_account",
        description: "Failed current-PIN verification during a PIN change attempt.",
        metadata: { account_id: account.id },
      });

      return errorResponse(401, "Your current PIN was not recognized. Please try again.");
    }

    if (account.failed_attempts > 0 || account.locked_until) {
      await adminClient.from("patient_accounts").update({ failed_attempts: 0, locked_until: null }).eq("id", account.id);
    }

    // Fetch the patient this account holds SELF over, if any, purely to
    // reuse the birthdate-substring check in validatePinPolicy -- a
    // caregiver-only account (no patient_id anywhere on patient_accounts,
    // §5.2.1) simply gets no birthdate check, same as its original
    // activation.
    const { data: selfGrant } = await adminClient
      .from("patient_access_grants")
      .select("patient_id")
      .eq("account_id", account.id)
      .eq("relationship", "SELF")
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    let birthday: string | null = null;
    if (selfGrant) {
      const { data: patient } = await adminClient.from("patients").select("birthday").eq("id", selfGrant.patient_id).maybeSingle();
      birthday = patient?.birthday ?? null;
    }

    const pinCheck = validatePinPolicy(payload.newPin, birthday);
    if (!pinCheck.valid) return errorResponse(422, pinCheck.reason);

    const newDerivedPassword = await derivePatientPassword(payload.newPin, account.medisens_id);
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(callerData.user.id, { password: newDerivedPassword });
    if (updateAuthError) {
      console.error("[MEDISENS patient-change-pin] password update failed", { message: updateAuthError.message });
      return errorResponse(500);
    }

    const { error: updateAccountError } = await adminClient
      .from("patient_accounts")
      .update({ pin_updated_at: new Date().toISOString(), failed_attempts: 0, locked_until: null })
      .eq("id", account.id);
    if (updateAccountError) {
      console.error("[MEDISENS patient-change-pin] account update failed", { message: updateAccountError.message });
      // The Auth password already changed at this point -- same
      // fail-loudly reasoning as patient-activation-complete's account-only
      // branch, since leaving pin_updated_at/failed_attempts stale here
      // would desync credential state from patient-login's own checks.
      return errorResponse(500, "Your PIN was changed, but finishing the update failed. Please sign in with your new PIN, or visit the RHU if it does not work.");
    }

    await writeAudit(adminClient, {
      userId: null,
      userName: account.medisens_id,
      userRole: "patient",
      action: "recover",
      recordId: account.id,
      recordType: "patient_account",
      description: "Patient changed their own PIN.",
      metadata: { account_id: account.id },
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[MEDISENS patient-change-pin] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
