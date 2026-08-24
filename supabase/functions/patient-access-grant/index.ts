// ============================================================
// Supabase Edge Function: patient-access-grant
// Patient Account Phase 3 -- the single, staff-only path that creates a
// GUARDIAN or AUTHORIZED_CAREGIVER grant against an existing
// patient_accounts row (docs/patientAccount.md §6.1). SELF grants are
// never created here -- they only ever come from
// patient-activation-complete's fresh-activation branch.
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

type GrantableRelationship = "GUARDIAN" | "AUTHORIZED_CAREGIVER";

interface GrantPayload {
  accountId: string;
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
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const patientId = Number(body.patientId);
  const relationship = body.relationship;
  const patientPresentConsent = body.patientPresentConsent === true;

  if (!accountId) throw new Error("accountId is required.");
  if (!Number.isFinite(patientId) || patientId <= 0) throw new Error("A valid patientId is required.");
  if (relationship !== "GUARDIAN" && relationship !== "AUTHORIZED_CAREGIVER") {
    throw new Error("relationship must be GUARDIAN or AUTHORIZED_CAREGIVER.");
  }

  return { accountId, patientId, relationship: relationship as GrantableRelationship, patientPresentConsent };
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

    const { data: account, error: accountError } = await adminClient
      .from("patient_accounts")
      .select("id, status")
      .eq("id", payload.accountId)
      .maybeSingle();
    if (accountError || !account) return errorResponse(404, "Patient Portal account not found.");

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
      .eq("account_id", payload.accountId)
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
        account_id: payload.accountId,
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
      metadata: { account_id: payload.accountId, grant_id: grant.id, relationship: payload.relationship },
    });

    return jsonResponse({ grantId: grant.id, relationship: payload.relationship, scope: "STANDARD", expiresAt }, 201);
  } catch (err) {
    console.error("[MEDISENS patient-access-grant] unexpected", { message: err instanceof Error ? err.message : String(err) });
    return errorResponse(500);
  }
});
