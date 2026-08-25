// ============================================================
// Supabase Edge Function: patient-caregiver-activation-issue
// Patient Account Phase 3 -- account-only caregiver activation
// (docs/patientAccount.md §5.2.1). Creates the caregiver's patient_accounts
// row directly (no patient_id column, no SELF grant, ever), plus an
// activation code so the caregiver can set their own PIN through the
// same patient-activation-verify / patient-activation-complete steps
// used everywhere else. The AUTHORIZED_CAREGIVER grant itself is created
// separately, by patient-access-grant, per §6.1.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  requireStaffCaller,
  requireEnv,
  STAFF_ISSUING_ROLES,
  generateActivationCode,
  generateMedisensId,
  hmacHex,
  sendSms,
  writeAudit,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

interface IssuePayload {
  patientId: number;
  fullName: string;
  identityNote: string;
  contactNumber?: string;
}

function errorResponse(status: number, message = "Unable to issue caregiver activation. Please try again.") {
  return jsonResponse({ error: message }, status);
}

function validatePayload(value: unknown): IssuePayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const patientId = Number(body.patientId);
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const identityNote = typeof body.identityNote === "string" ? body.identityNote.trim() : "";
  const contactNumber = typeof body.contactNumber === "string" ? body.contactNumber.trim() : undefined;

  if (!Number.isFinite(patientId) || patientId <= 0) throw new Error("A valid patientId is required.");
  if (!fullName) throw new Error("The caregiver's full name is required.");
  if (!identityNote) throw new Error("A short note on how identity was verified is required.");

  return { patientId, fullName, identityNote, contactNumber };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-caregiver-activation-issue] missing configuration");
      return errorResponse(500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse(401, "Missing authorization header.");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const staff = await requireStaffCaller(adminClient, userClient, STAFF_ISSUING_ROLES);
    if (!staff) return errorResponse(403, "Only RHU staff may issue a caregiver activation.");

    let payload: IssuePayload;
    try {
      payload = validatePayload(await req.json());
    } catch (err) {
      return errorResponse(400, err instanceof Error ? err.message : "Invalid request.");
    }

    const { data: patient, error: patientError } = await adminClient
      .from("patients")
      .select("id, archive_status")
      .eq("id", payload.patientId)
      .maybeSingle();

    if (patientError || !patient) return errorResponse(404, "Patient record not found.");
    if (patient.archive_status === "archived") {
      return errorResponse(409, "This patient record is archived and cannot be granted new caregiver access.");
    }

    const medisensId = generateMedisensId();

    // A random, unrecoverable placeholder password -- nobody knows it,
    // including this function once it returns. It is discarded the moment
    // patient-activation-complete sets the real, PIN-derived password. The
    // account cannot be signed into until that step succeeds.
    const placeholderBytes = new Uint8Array(32);
    crypto.getRandomValues(placeholderBytes);
    const placeholderPassword = Array.from(placeholderBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: `${medisensId.toLowerCase()}@patient.medisens.local`,
      password: placeholderPassword,
      email_confirm: true,
      app_metadata: { account_type: "patient" },
    });
    if (createUserError || !createdUser.user) {
      console.error("[MEDISENS patient-caregiver-activation-issue] auth create failed", { message: createUserError?.message });
      return errorResponse(500);
    }

    const { data: account, error: accountInsertError } = await adminClient
      .from("patient_accounts")
      .insert([{
        auth_user_id: createdUser.user.id,
        medisens_id: medisensId,
        display_name: payload.fullName,
        status: "active",
        identity_verified_by: staff.userId,
        identity_verified_at: new Date().toISOString(),
        identity_note: payload.identityNote,
        created_by: staff.userId,
        // Step 7 correction: this is the caregiver's own verified number,
        // collected in this same request -- persisted so self-service PIN
        // recovery has a contact to send an OTP to. An account-only
        // caregiver has no patient record, so without this the account
        // would have no recovery path at all (docs/patientAccount.md
        // Phase 9B Step 7). Still optional: recovery's own request step
        // stays non-disclosing whether or not this is set.
        recovery_contact_number: payload.contactNumber ?? null,
      }])
      .select("id")
      .single();

    if (accountInsertError || !account) {
      console.error("[MEDISENS patient-caregiver-activation-issue] account insert failed", { message: accountInsertError?.message });
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      return errorResponse(500);
    }

    const code = generateActivationCode();
    const pepper = requireEnv("PATIENT_ACTIVATION_CODE_PEPPER");
    const codeHash = await hmacHex(pepper, code);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error: codeInsertError } = await adminClient.from("patient_activation_codes").insert([{
      patient_id: payload.patientId,
      relationship: "AUTHORIZED_CAREGIVER",
      target_account_id: account.id,
      code_hash: codeHash,
      purpose: "ACTIVATION",
      expires_at: expiresAt,
      issued_by: staff.userId,
    }]);

    if (codeInsertError) {
      console.error("[MEDISENS patient-caregiver-activation-issue] code insert failed", { message: codeInsertError.message });
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      return errorResponse(500);
    }

    let smsSent = false;
    if (payload.contactNumber) {
      // Used transiently to deliver this one code; never persisted anywhere.
      const { ok } = await sendSms(
        payload.contactNumber,
        `Your MediSens Patient Portal activation code is ${code}. It expires in 48 hours. Do not share this code with anyone.`,
      );
      smsSent = ok;
    }

    await writeAudit(adminClient, {
      userId: staff.userId,
      userName: staff.fullName,
      userRole: staff.role,
      action: "activate",
      recordId: account.id,
      recordType: "patient_account",
      description: "Issued an account-only caregiver activation.",
      metadata: { account_id: account.id, relationship: "AUTHORIZED_CAREGIVER" },
    });

    return jsonResponse({ code, medisensId, expiresAt, smsSent }, 201);
  } catch (err) {
    console.error("[MEDISENS patient-caregiver-activation-issue] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
