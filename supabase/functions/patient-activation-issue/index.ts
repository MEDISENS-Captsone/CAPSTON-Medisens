// ============================================================
// Supabase Edge Function: patient-activation-issue
// Patient Account Phase 3 -- staff issues a SELF or GUARDIAN activation
// code (or, with purpose="RECOVERY", a staff-mediated reset code for an
// existing account) against a verified patient record (docs/patientAccount.md §5.2, §5.5).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  requireStaffCaller,
  requireEnv,
  STAFF_ISSUING_ROLES,
  generateActivationCode,
  hmacHex,
  sendSms,
  writeAudit,
  isUnder18,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

type Relationship = "SELF" | "GUARDIAN";
type Purpose = "ACTIVATION" | "RECOVERY";

interface IssuePayload {
  patientId: number;
  relationship: Relationship;
  purpose: Purpose;
  targetAccountId?: string; // required when purpose = "RECOVERY"
  // The activating GUARDIAN's own name, staff-entered at the counter --
  // never the patient's name, never client-inferred. Required for a
  // GUARDIAN activation so patient-activation-complete can set
  // patient_accounts.display_name to the actual account holder, the same
  // way patient-caregiver-activation-issue already collects `fullName`
  // for an account-only caregiver. Not used for SELF (the patient's own
  // name from `patients` is already the correct, authoritative value).
  holderName?: string;
}

function errorResponse(status: number, message = "Unable to issue the activation code. Please try again.") {
  return jsonResponse({ error: message }, status);
}

function validatePayload(value: unknown): IssuePayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const patientId = Number(body.patientId);
  const relationship = body.relationship;
  const purpose = body.purpose === "RECOVERY" ? "RECOVERY" : "ACTIVATION";
  const targetAccountId = typeof body.targetAccountId === "string" ? body.targetAccountId : undefined;
  const holderName = typeof body.holderName === "string" ? body.holderName.trim() : undefined;

  if (!Number.isFinite(patientId) || patientId <= 0) throw new Error("A valid patientId is required.");
  if (relationship !== "SELF" && relationship !== "GUARDIAN") throw new Error("relationship must be SELF or GUARDIAN.");
  if (purpose === "RECOVERY" && !targetAccountId) throw new Error("targetAccountId is required for a recovery code.");
  if (purpose === "ACTIVATION" && relationship === "GUARDIAN" && !holderName) {
    throw new Error("The guardian's full name is required to issue a guardian activation code.");
  }

  return { patientId, relationship, purpose, targetAccountId, holderName };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-activation-issue] missing configuration");
      return errorResponse(500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse(401, "Missing authorization header.");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const staff = await requireStaffCaller(adminClient, userClient, STAFF_ISSUING_ROLES);
    if (!staff) return errorResponse(403, "Only RHU staff may issue an activation code.");

    let payload: IssuePayload;
    try {
      payload = validatePayload(await req.json());
    } catch (err) {
      return errorResponse(400, err instanceof Error ? err.message : "Invalid request.");
    }

    const { data: patient, error: patientError } = await adminClient
      .from("patients")
      .select("id, contactNumber, archive_status, firstName, lastName, birthday")
      .eq("id", payload.patientId)
      .maybeSingle();

    if (patientError || !patient) return errorResponse(404, "Patient record not found.");
    if (patient.archive_status === "archived") {
      return errorResponse(409, "This patient record is archived and cannot be activated for Patient Portal access.");
    }

    // Fail closed on minority: a GUARDIAN code must never be issuable for a
    // patient who cannot be verified as under 18 (missing birthdate or an
    // adult patient), mirroring patient-access-grant's own check. Re-checked
    // again in patient-activation-complete before the grant is written.
    if (payload.purpose === "ACTIVATION" && payload.relationship === "GUARDIAN" && isUnder18(patient.birthday) !== true) {
      return errorResponse(422, "A guardian activation requires a verified patient birthdate showing the patient is under 18.");
    }

    if (payload.purpose === "ACTIVATION") {
      const { data: existingActive, error: existingError } = await adminClient
        .from("patient_access_grants")
        .select("id")
        .eq("patient_id", payload.patientId)
        .eq("relationship", payload.relationship)
        .is("revoked_at", null)
        .limit(1);

      if (existingError) {
        console.error("[MEDISENS patient-activation-issue] existing-grant lookup failed", { message: existingError.message });
        return errorResponse(500);
      }
      if (existingActive && existingActive.length > 0) {
        return errorResponse(409, `This patient already has an active ${payload.relationship.toLowerCase()} account.`);
      }
    } else {
      // RECOVERY: confirm the target account exists and is actually tied to
      // this patient/relationship before issuing a reset code for it.
      const { data: targetAccount, error: targetError } = await adminClient
        .from("patient_accounts")
        .select("id")
        .eq("id", payload.targetAccountId)
        .maybeSingle();
      if (targetError || !targetAccount) return errorResponse(404, "Account not found.");
    }

    const code = generateActivationCode();
    const pepper = requireEnv("PATIENT_ACTIVATION_CODE_PEPPER");
    const codeHash = await hmacHex(pepper, code);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error: insertError } = await adminClient
      .from("patient_activation_codes")
      .insert([{
        patient_id: payload.patientId,
        relationship: payload.relationship,
        target_account_id: payload.targetAccountId ?? null,
        code_hash: codeHash,
        purpose: payload.purpose,
        expires_at: expiresAt,
        issued_by: staff.userId,
        holder_name: payload.relationship === "GUARDIAN" ? payload.holderName : null,
      }])
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[MEDISENS patient-activation-issue] insert failed", { message: insertError?.message });
      return errorResponse(500);
    }

    let smsSent = false;
    if (patient.contactNumber) {
      const label = payload.purpose === "RECOVERY" ? "MediSens account reset code" : "MediSens Patient Portal activation code";
      const { ok } = await sendSms(
        patient.contactNumber,
        `Your ${label} is ${code}. It expires in 48 hours. Do not share this code with anyone.`,
      );
      smsSent = ok;
    }

    await writeAudit(adminClient, {
      userId: staff.userId,
      userName: staff.fullName,
      userRole: staff.role,
      action: "activate",
      recordId: String(payload.patientId),
      recordType: "patient_account",
      description: payload.purpose === "RECOVERY"
        ? "Issued a staff-mediated Patient Portal recovery code."
        : `Issued a Patient Portal ${payload.relationship} activation code.`,
      metadata: { relationship: payload.relationship },
    });

    return jsonResponse({
      code,
      expiresAt,
      smsSent,
      patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" "),
    }, 201);
  } catch (err) {
    console.error("[MEDISENS patient-activation-issue] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
