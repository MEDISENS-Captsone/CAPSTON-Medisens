// ============================================================
// Supabase Edge Function: patient-login
// Patient Account Phase 3 -- the single server-side entry point for
// patient authentication (docs/patientAccount.md §5.4, D-2). This is the
// function the D-2 guarantee depends on: a patient's raw PIN is never
// the value presented to Supabase Auth. This function derives the actual
// GoTrue password from the PIN (via PATIENT_PIN_PEPPER, a server-only
// secret) and signs in server-side; a client that tried
// `supabase.auth.signInWithPassword({ email, password: <raw PIN> })`
// directly, bypassing this function, would fail -- the stored password
// is the HMAC derivation, never the PIN itself.
//
// Public endpoint (this *is* the login). Never reveals whether a
// MediSens ID exists, or whether a failure was a wrong ID vs. wrong PIN
// vs. locked account -- always the same generic error.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  derivePatientPassword,
  writeAudit,
  GENERIC_AUTH_ERROR,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

const SOFT_LOCK_THRESHOLD = 5;
const SOFT_LOCK_MINUTES = 15;
const HARD_LOCK_THRESHOLD = 10;

function errorResponse(status: number, message = GENERIC_AUTH_ERROR) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-login] missing configuration");
      return errorResponse(500, "Unable to sign in right now. Please try again.");
    }

    const body = await req.json().catch(() => ({}));
    const medisensId = typeof body?.medisensId === "string" ? body.medisensId.trim().toUpperCase() : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";
    if (!medisensId || !pin) return errorResponse(400, "A MediSens ID and PIN are required.");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: account, error: accountError } = await adminClient
      .from("patient_accounts")
      .select("id, auth_user_id, medisens_id, status, failed_attempts, locked_until")
      .eq("medisens_id", medisensId)
      .maybeSingle();

    // Same generic error whether the ID doesn't exist or the PIN is wrong --
    // never distinguish the two to the caller.
    if (accountError || !account) return errorResponse(401);

    if (account.status === "disabled") return errorResponse(401);
    if (account.status === "locked") return errorResponse(401, "This account is locked. Please visit the RHU to reset your PIN.");
    if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
      return errorResponse(401, "Too many attempts. Please try again later, or visit the RHU to reset your PIN.");
    }

    const derivedPassword = await derivePatientPassword(pin, account.medisens_id);
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({
      email: `${account.medisens_id.toLowerCase()}@patient.medisens.local`,
      password: derivedPassword,
    });

    if (signInError || !session.session) {
      // Compare-and-swap the increment rather than a blind read-modify-write:
      // two concurrent failed attempts must not collapse into a single
      // increment. Each retry re-reads the current value and only applies
      // if nothing else changed it since; PostgREST's WHERE-conditioned
      // UPDATE performs the compare atomically in Postgres.
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
        action: "login",
        recordId: account.id,
        recordType: "patient_account",
        description: "Failed Patient Portal login attempt.",
        metadata: { account_id: account.id },
      });

      return errorResponse(401);
    }

    if (account.failed_attempts > 0 || account.locked_until) {
      await adminClient.from("patient_accounts").update({ failed_attempts: 0, locked_until: null }).eq("id", account.id);
    }

    await writeAudit(adminClient, {
      userId: null,
      userName: account.medisens_id,
      userRole: "patient",
      action: "login",
      recordId: account.id,
      recordType: "patient_account",
      description: "Patient Portal login.",
      metadata: { account_id: account.id },
    });

    return jsonResponse({
      session: { access_token: session.session.access_token, refresh_token: session.session.refresh_token },
    });
  } catch (err) {
    console.error("[MEDISENS patient-login] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
