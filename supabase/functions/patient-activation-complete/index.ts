// ============================================================
// Supabase Edge Function: patient-activation-complete
// Patient Account Phase 3 -- final step of activation, account-only
// caregiver PIN setup, and staff-mediated recovery. Re-verifies the code
// (and OTP, if this patient has a contact number on file) itself rather
// than trusting a prior patient-activation-verify call, sets the PIN
// under the D-2 password-derivation scheme, and either creates a brand
// new patient_accounts + patient_access_grants (fresh SELF/GUARDIAN
// activation) or updates an existing account's credential (account-only
// caregiver completing setup, or any staff-mediated recovery).
// (docs/patientAccount.md §5.2 step 7-9, §5.2.1 step 4, §5.5 point 2)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  requireEnv,
  hmacHex,
  derivePatientPassword,
  generateMedisensId,
  validatePinPolicy,
  writeAudit,
  isUnder18,
  eighteenthBirthdayIso,
  GENERIC_AUTH_ERROR,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

interface CompletePayload {
  code: string;
  otp?: string;
  pin: string;
}

function errorResponse(status: number, message = GENERIC_AUTH_ERROR) {
  return jsonResponse({ error: message }, status);
}

function validatePayload(value: unknown): CompletePayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const otp = typeof body.otp === "string" ? body.otp.trim() : undefined;
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!code) throw new Error("A code is required.");
  if (!pin) throw new Error("A PIN or password is required.");
  return { code, otp, pin };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-activation-complete] missing configuration");
      return errorResponse(500, "Unable to complete activation right now. Please try again.");
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    let payload: CompletePayload;
    try {
      payload = validatePayload(await req.json());
    } catch (err) {
      return errorResponse(400, err instanceof Error ? err.message : "Invalid request.");
    }

    const pepper = requireEnv("PATIENT_ACTIVATION_CODE_PEPPER");
    const codeHash = await hmacHex(pepper, payload.code);

    const { data: activation, error: activationError } = await adminClient
      .from("patient_activation_codes")
      .select("id, patient_id, relationship, target_account_id, purpose, expires_at, consumed_at, holder_name")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (activationError || !activation) return errorResponse(401);
    if (activation.consumed_at) return errorResponse(401);
    if (new Date(activation.expires_at).getTime() <= Date.now()) return errorResponse(401);

    const { data: patient, error: patientError } = await adminClient
      .from("patients")
      .select("id, firstName, lastName, contactNumber, birthday, archive_status")
      .eq("id", activation.patient_id)
      .maybeSingle();

    if (patientError || !patient) return errorResponse(401);
    if (patient.archive_status === "archived") return errorResponse(409, "This patient record is archived.");

    // Re-verify: if this patient has a contact number, an OTP challenge
    // must exist and have been consumed for this activation code. This is
    // deliberately re-checked here rather than trusting a prior
    // patient-activation-verify response, so completion can never be
    // reached by skipping the OTP step.
    if (patient.contactNumber) {
      const { data: consumedOtp } = await adminClient
        .from("patient_otp_challenges")
        .select("id")
        .eq("activation_code_id", activation.id)
        .not("consumed_at", "is", null)
        .limit(1)
        .maybeSingle();
      if (!consumedOtp) return errorResponse(401, "Please verify your code with the SMS confirmation first.");
    }

    const pinCheck = validatePinPolicy(payload.pin, patient.birthday);
    if (!pinCheck.valid) return errorResponse(422, pinCheck.reason);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    if (activation.target_account_id) {
      // Existing account: account-only caregiver completing PIN setup, or
      // any staff-mediated recovery. Just set the credential.
      const { data: account, error: accountError } = await adminClient
        .from("patient_accounts")
        .select("id, auth_user_id, medisens_id, status")
        .eq("id", activation.target_account_id)
        .maybeSingle();

      if (accountError || !account) return errorResponse(401);

      const derivedPassword = await derivePatientPassword(payload.pin, account.medisens_id);
      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(account.auth_user_id, { password: derivedPassword });
      if (updateAuthError) {
        console.error("[MEDISENS patient-activation-complete] password update failed", { message: updateAuthError.message });
        return errorResponse(500);
      }

      const { error: updateAccountError } = await adminClient
        .from("patient_accounts")
        .update({ pin_updated_at: new Date().toISOString(), failed_attempts: 0, locked_until: null, status: "active" })
        .eq("id", account.id);
      if (updateAccountError) {
        // The Auth password has already changed at this point. Leaving
        // patient_accounts.status/locked_until stale here would desync
        // credential from account state -- patient-login's status/lockout
        // pre-checks would then reject a now-valid PIN, and
        // patient_portal_can_access() requires status='active' to grant
        // anything. Fail loudly rather than let that drift silently.
        console.error("[MEDISENS patient-activation-complete] account update failed", { message: updateAccountError.message });
        return errorResponse(500, "Your PIN was set, but finishing setup failed. Please try signing in, or visit the RHU if it does not work.");
      }

      await adminClient.from("patient_activation_codes").update({ consumed_at: new Date().toISOString() }).eq("id", activation.id);

      await writeAudit(adminClient, {
        userId: null,
        userName: account.medisens_id,
        userRole: "patient",
        action: activation.purpose === "RECOVERY" ? "recover" : "activate",
        recordId: account.id,
        recordType: "patient_account",
        description: activation.purpose === "RECOVERY"
          ? "Patient account credential reset completed."
          : "Account-only caregiver PIN setup completed.",
        metadata: { account_id: account.id },
      });

      const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({
        email: `${account.medisens_id.toLowerCase()}@patient.medisens.local`,
        password: derivedPassword,
      });
      if (signInError || !session.session) {
        console.error("[MEDISENS patient-activation-complete] post-reset sign-in failed", { message: signInError?.message });
        return jsonResponse({ medisensId: account.medisens_id, session: null });
      }

      return jsonResponse({
        medisensId: account.medisens_id,
        session: { access_token: session.session.access_token, refresh_token: session.session.refresh_token },
      }, 201);
    }

    // Fresh SELF/GUARDIAN activation: no account exists yet.
    const medisensId = generateMedisensId();
    const derivedPassword = await derivePatientPassword(payload.pin, medisensId);
    const syntheticEmail = `${medisensId.toLowerCase()}@patient.medisens.local`;

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: syntheticEmail,
      password: derivedPassword,
      email_confirm: true,
      app_metadata: { account_type: "patient" },
    });
    if (createUserError || !createdUser.user) {
      console.error("[MEDISENS patient-activation-complete] auth create failed", { message: createUserError?.message });
      return errorResponse(500);
    }

    // display_name must represent the person who owns/logs into this
    // account, not the patient record being accessed (§17 Phase 8
    // correction). SELF activations are correctly the patient's own name.
    // GUARDIAN activations use the guardian's own name captured at
    // issue time (patient-activation-issue requires it); if an older
    // activation code was issued before that requirement existed and
    // carries no holder_name, this falls back to the MediSens ID rather
    // than ever inventing or reusing the child's name as the guardian's
    // identity.
    const displayName = activation.relationship === "GUARDIAN"
      ? (activation.holder_name || medisensId)
      : ([patient.firstName, patient.lastName].filter(Boolean).join(" ") || medisensId);

    const { data: activationRow, error: activationRowError } = await adminClient
      .from("patient_activation_codes")
      .select("issued_by")
      .eq("id", activation.id)
      .single();
    if (activationRowError || !activationRow) {
      console.error("[MEDISENS patient-activation-complete] issuer lookup failed", { message: activationRowError?.message });
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      return errorResponse(500);
    }
    const issuedBy = activationRow.issued_by;

    const { data: account, error: accountInsertError } = await adminClient
      .from("patient_accounts")
      .insert([{
        auth_user_id: createdUser.user.id,
        medisens_id: medisensId,
        display_name: displayName,
        status: "active",
        pin_updated_at: new Date().toISOString(),
        created_by: issuedBy,
      }])
      .select("id")
      .single();

    if (accountInsertError || !account) {
      console.error("[MEDISENS patient-activation-complete] account insert failed", { message: accountInsertError?.message });
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      return errorResponse(500);
    }

    // Fail closed on minority, re-checked here rather than trusting that
    // patient-activation-issue's own gate was never bypassed (e.g. a code
    // issued before this check existed, or the patient's birthdate being
    // cleared between issue and complete).
    if (activation.relationship === "GUARDIAN" && isUnder18(patient.birthday) !== true) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      return errorResponse(422, "A guardian activation requires a verified patient birthdate showing the patient is under 18.");
    }

    const scope = activation.relationship === "SELF" ? "FULL" : "STANDARD";
    const expiresAt = activation.relationship === "GUARDIAN" ? eighteenthBirthdayIso(patient.birthday) : null;

    const { data: grant, error: grantError } = await adminClient
      .from("patient_access_grants")
      .insert([{
        account_id: account.id,
        patient_id: patient.id,
        relationship: activation.relationship,
        scope,
        granted_by: issuedBy,
        expires_at: expiresAt,
      }])
      .select("id")
      .single();

    if (grantError || !grant) {
      console.error("[MEDISENS patient-activation-complete] grant insert failed", { message: grantError?.message });
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      return errorResponse(500);
    }

    await adminClient.from("patient_account_preferences").insert([{ account_id: account.id }]);
    await adminClient.from("patient_activation_codes").update({ consumed_at: new Date().toISOString() }).eq("id", activation.id);

    await writeAudit(adminClient, {
      userId: issuedBy,
      userName: displayName,
      userRole: "patient",
      action: "activate",
      recordId: account.id,
      recordType: "patient_account",
      description: `Patient Portal ${activation.relationship} activation completed.`,
      metadata: { account_id: account.id, grant_id: grant.id, relationship: activation.relationship },
    });

    const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({
      email: syntheticEmail,
      password: derivedPassword,
    });
    if (signInError || !session.session) {
      console.error("[MEDISENS patient-activation-complete] post-activation sign-in failed", { message: signInError?.message });
      return jsonResponse({ medisensId, session: null }, 201);
    }

    return jsonResponse({
      medisensId,
      session: { access_token: session.session.access_token, refresh_token: session.session.refresh_token },
    }, 201);
  } catch (err) {
    console.error("[MEDISENS patient-activation-complete] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
