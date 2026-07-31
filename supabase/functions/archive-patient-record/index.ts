import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ArchiveAction = "archive" | "restore";

interface ArchiveRequest {
  patient_id?: number | string;
  action?: ArchiveAction;
  reason?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
const ARCHIVE_OPERATOR_ROLE = Deno.env.get("ARCHIVE_OPERATOR_ROLE") ?? "nurse";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanReason(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 500);
}

function parsePayload(value: unknown): Required<ArchiveRequest> {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as ArchiveRequest;
  const patientId = Number(body.patient_id);
  const action = body.action;
  const reason = cleanReason(body.reason);

  if (!Number.isFinite(patientId) || patientId <= 0) throw new Error("A valid patient record is required.");
  if (action !== "archive" && action !== "restore") throw new Error("A valid archive action is required.");
  if (!reason) throw new Error(action === "archive" ? "Archive reason is required." : "Restore reason is required.");

  return { patient_id: patientId, action, reason };
}

function archiveCutoffIso() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  return cutoff.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase function secrets are not configured.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization header." }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Invalid session." }, 401);

    const callerUserId = authData.user.id;
    const { data: callerProfile, error: callerError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", callerUserId)
      .maybeSingle();

    if (callerError || !callerProfile || callerProfile.id !== callerUserId || callerProfile.role !== ARCHIVE_OPERATOR_ROLE) {
      return jsonResponse({ error: "Only nurses can archive or restore patient records." }, 403);
    }

    const payload = parsePayload(await req.json());
    const { data: patient, error: patientError } = await adminClient
      .from("patients")
      .select("id, archive_status, last_activity_at, created_at")
      .eq("id", payload.patient_id)
      .maybeSingle();

    if (patientError) return jsonResponse({ error: "Patient record could not be loaded." }, 400);
    if (!patient) return jsonResponse({ error: "Patient record was not found." }, 404);

    if (payload.action === "archive") {
      if (patient.archive_status && patient.archive_status !== "active") return jsonResponse({ error: "Only active patient records can be archived." }, 400);
      if (!patient.last_activity_at) return jsonResponse({ error: "Last activity date is required before archiving." }, 400);
      if (new Date(patient.last_activity_at).getTime() > new Date(archiveCutoffIso()).getTime()) {
        return jsonResponse({ error: "Patient record is not yet eligible for archiving." }, 400);
      }

      const [{ data: pendingFollowUps, error: followUpError }, { data: pendingLabRequests, error: labError }] = await Promise.all([
        adminClient
          .from("follow_up")
          .select("followup_id")
          .eq("patient_id", payload.patient_id)
          .or("follow_up_status.is.null,follow_up_status.neq.done")
          .limit(1),
        adminClient
          .from("lab_request")
          .select("labrequest_id")
          .eq("patient_id", payload.patient_id)
          .or("status.is.null,status.neq.Completed")
          .limit(1),
      ]);
      if (followUpError || labError) return jsonResponse({ error: "Archive eligibility could not be verified." }, 400);
      if ((pendingFollowUps?.length ?? 0) > 0) return jsonResponse({ error: "Patient has a pending follow-up and cannot be archived." }, 400);
      if ((pendingLabRequests?.length ?? 0) > 0) return jsonResponse({ error: "Patient has an unresolved lab request and cannot be archived." }, 400);
    } else if (patient.archive_status !== "archived") {
      return jsonResponse({ error: "Only archived patient records can be restored." }, 400);
    }

    const now = new Date().toISOString();
    const updatePayload = payload.action === "archive"
      ? {
        archive_status: "archived",
        archived_at: now,
        archived_by: callerUserId,
        archive_reason: payload.reason,
        archive_reviewed_at: now,
        archive_reviewed_by: callerUserId,
      }
      : {
        archive_status: "active",
        archived_at: null,
        archived_by: null,
        archive_reason: payload.reason,
        archive_reviewed_at: now,
        archive_reviewed_by: callerUserId,
      };

    const { error: updateError } = await adminClient
      .from("patients")
      .update(updatePayload)
      .eq("id", payload.patient_id);
    if (updateError) return jsonResponse({ error: "Patient archive state could not be updated." }, 400);

    const eventType = payload.action === "archive" ? "archived" : "restored";
    const { error: eventError } = await adminClient.from("patient_archive_events").insert([{
      patient_id: payload.patient_id,
      event_type: eventType,
      performed_by: callerUserId,
      performed_by_role: callerProfile.role,
      reason: payload.reason,
      metadata: { patient_id: payload.patient_id, source: "archive_patient_record_function" },
    }]);
    if (eventError) return jsonResponse({ error: "Patient archive event could not be recorded." }, 400);

    return jsonResponse({ ok: true, patient_id: payload.patient_id, action: payload.action, event_type: eventType }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive request could not be completed.";
    return jsonResponse({ error: message }, 400);
  }
});
