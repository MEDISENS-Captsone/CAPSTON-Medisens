// ============================================================
// Supabase Edge Function: patient-access-grant
// Patient Account Phase 3 -- the single, staff-only path that creates a
// GUARDIAN or AUTHORIZED_CAREGIVER grant against an existing
// patient_accounts row (docs/patientAccount.md §6.1). SELF grants are
// never created here -- they only ever come from
// patient-activation-complete's fresh-activation branch.
//
// Phase 9B correction: the caller now identifies the existing account by
// medisensId, not the raw patient_accounts.id UUID. Confirmed before this
// change that accountId had no genuine existing caller anywhere in the
// repository (grepped for every invocation of this function -- none
// exist outside this file's own comments and ad hoc test harnesses), so
// accountId is removed outright rather than kept alongside medisensId --
// there is no real caller whose backward compatibility would need
// preserving, and keeping a second identifier path would only add an
// unused attack surface. patient_accounts.id is resolved here, from the
// caller-supplied medisensId, entirely server-side; it is never accepted
// from, or returned to, the client. Scope was never client-suppliable
// before this change and still is not -- it stays hardcoded to
// 'STANDARD' below, so there is no elevation path to close.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  requireStaffCaller,
  STAFF_ISSUING_ROLES,
  writeAudit,
  isUnder18,
  eighteenthBirthdayIso,
} from "../_shared/patientPortal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

// Matches generateMedisensId()'s own output shape exactly: MS- plus two
// 4-character groups drawn from the visually-unambiguous SAFE_ALPHABET
// (excludes 0/O, 1/I/L). A value that doesn't match this shape is
// rejected before ever touching the database -- distinct from "well
// formed but no such account", which the lookup below still reports
// separately.
const MEDISENS_ID_PATTERN = /^MS-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/;

type GrantableRelationship = "GUARDIAN" | "AUTHORIZED_CAREGIVER";

interface GrantPayload {
  medisensId: string;
  patientId: number;
  relationship: GrantableRelationship;
  patientPresentConsent?: boolean;
}

function errorResponse(status: number, message = "Unable to create this access grant. Please try again.") {
  return jsonResponse({ error: message }, status);
}

function validatePayload(value: unknown): GrantPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  // Same normalization patient-login already applies to a caller-typed
  // MediSens ID: trim, uppercase. The lookup below is an exact match only
  // -- no partial/fuzzy search, no name/birthday/phone fallback.
  const medisensId = typeof body.medisensId === "string" ? body.medisensId.trim().toUpperCase() : "";
  const patientId = Number(body.patientId);
  const relationship = body.relationship;
  const patientPresentConsent = body.patientPresentConsent === true;

  if (!medisensId) throw new Error("A MediSens ID is required.");
  if (!MEDISENS_ID_PATTERN.test(medisensId)) throw new Error("That MediSens ID is not a valid format.");
  if (!Number.isFinite(patientId) || patientId <= 0) throw new Error("A valid patientId is required.");
  if (relationship !== "GUARDIAN" && relationship !== "AUTHORIZED_CAREGIVER") {
    throw new Error("relationship must be GUARDIAN or AUTHORIZED_CAREGIVER.");
  }

  return { medisensId, patientId, relationship: relationship as GrantableRelationship, patientPresentConsent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed.");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[MEDISENS patient-access-grant] missing configuration");
      return errorResponse(500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse(401, "Missing authorization header.");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const staff = await requireStaffCaller(adminClient, userClient, STAFF_ISSUING_ROLES);
    if (!staff) return errorResponse(403, "Only RHU staff may grant Patient Portal access.");

    let payload: GrantPayload;
    try {
      payload = validatePayload(await req.json());
    } catch (err) {
      return errorResponse(400, err instanceof Error ? err.message : "Invalid request.");
    }

    if (payload.relationship === "AUTHORIZED_CAREGIVER" && !payload.patientPresentConsent) {
      return errorResponse(422, "The patient must be present and consenting to authorize a caregiver.");
    }

    // Resolve the account server-side from the caller-supplied MediSens ID.
    // account.id (the raw patient_accounts UUID) is used only internally
    // below (the duplicate-grant check and the insert's account_id column)
    // -- it is never included in any response.
    const { data: account, error: accountError } = await adminClient
      .from("patient_accounts")
      .select("id, status")
      .eq("medisens_id", payload.medisensId)
      .maybeSingle();
    if (accountError || !account) return errorResponse(404, "Patient Portal account not found.");
    if (account.status !== "active") {
      return errorResponse(422, "This account cannot receive new access right now. Please visit the RHU.");
    }

    const { data: patient, error: patientError } = await adminClient
      .from("patients")
      .select("id, archive_status, birthday")
      .eq("id", payload.patientId)
      .maybeSingle();
    if (patientError || !patient) return errorResponse(404, "Patient record not found.");
    if (patient.archive_status === "archived") return errorResponse(409, "This patient record is archived.");

    let expiresAt: string | null = null;
    if (payload.relationship === "GUARDIAN") {
      const under18 = isUnder18(patient.birthday);
      if (under18 === null) {
        return errorResponse(422, "This patient's birthdate is not on file, so guardian eligibility cannot be verified.");
      }
      if (!under18) {
        return errorResponse(422, "A guardian grant requires the patient to be under 18.");
      }
      expiresAt = eighteenthBirthdayIso(patient.birthday);
    }

    const { data: existingActive, error: existingError } = await adminClient
      .from("patient_access_grants")
      .select("id")
      .eq("account_id", account.id)
      .eq("patient_id", payload.patientId)
      .eq("relationship", payload.relationship)
      .is("revoked_at", null)
      .limit(1);

    if (existingError) {
      console.error("[MEDISENS patient-access-grant] existing-grant lookup failed", { message: existingError.message });
      return errorResponse(500);
    }
    if (existingActive && existingActive.length > 0) {
      return errorResponse(409, "This account already has an active grant of this type on this record.");
    }

    // scope is always STANDARD here -- only patient-activation-complete's
    // fresh-SELF branch ever writes 'FULL' (§7.3, §6.1).
    const { data: grant, error: grantError } = await adminClient
      .from("patient_access_grants")
      .insert([{
        account_id: account.id,
        patient_id: payload.patientId,
        relationship: payload.relationship,
        scope: "STANDARD",
        granted_by: staff.userId,
        expires_at: expiresAt,
      }])
      .select("id")
      .single();

    if (grantError || !grant) {
      console.error("[MEDISENS patient-access-grant] insert failed", { message: grantError?.message });
      const status = grantError?.code === "23505" ? 409 : 500;
      return errorResponse(status, grantError?.code === "23505" ? "This account already has an active grant of this type on this record." : undefined);
    }

    await writeAudit(adminClient, {
      userId: staff.userId,
      userName: staff.fullName,
      userRole: staff.role,
      action: "grant",
      recordId: grant.id,
      recordType: "patient_access_grant",
      description: `Granted ${payload.relationship} access.`,
      // audit_logs is a staff/system-only table (§7.4) -- account_id and
      // medisens_id here are an internal audit trail, never returned to
      // any client response.
      metadata: { account_id: account.id, medisens_id: payload.medisensId, grant_id: grant.id, relationship: payload.relationship },
    });

    // grant.id (the raw patient_access_grants UUID) is used above only for
    // the audit-log record_id/metadata -- confirmed via a fresh repository
    // grep that no caller consumes grantId from this response, so it is
    // not returned. Nothing about the staff UI needs a database
    // identifier back; relationship/scope/expiresAt is the complete
    // patient-safe confirmation.
    return jsonResponse({ relationship: payload.relationship, scope: "STANDARD", expiresAt }, 201);
  } catch (err) {
    console.error("[MEDISENS patient-access-grant] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
