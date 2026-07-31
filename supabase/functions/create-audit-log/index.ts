import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

const ALLOWED_ACTIONS = new Set(["login", "logout", "create", "update", "view", "generate", "dispense", "archived", "restored"]);
const ALLOWED_MODULES = new Set(["Authentication", "Administration", "Patient Records", "Consultation", "Census Entry", "Laboratory", "Pharmacy", "Reports", "Patient Archive"]);
const ALLOWED_RECORD_TYPES = new Set(["profile", "patient", "consultation", "initial_consultation", "follow_up", "fhsis_log", "lab_request", "lab_result", "prescription", "report", null]);
const ALLOWED_METADATA_KEYS = new Set([
  "source",
  "status",
  "result",
  "category",
  "mode",
  "action_scope",
  "count",
  "patient_id",
  "consultation_id",
  "initial_consultation_id",
  "labrequest_id",
  "labresult_id",
  "prescription_id",
  "followup_id",
  "profile_id",
  "name_updated",
]);

function auditLogFailure(stage: string, details: Record<string, unknown>) {
  console.error("[MEDISENS audit] create-audit-log failed", { stage, ...details });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (rawValue == null || ["string", "number", "boolean"].includes(typeof rawValue)) {
      safe[key] = rawValue;
    }
  }
  return safe;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      auditLogFailure("configuration", {
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasAnonKey: Boolean(SUPABASE_ANON_KEY),
        hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      });
      throw new Error("Supabase function secrets are not configured.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      auditLogFailure("auth_header", { reason: "missing_authorization_header" });
      return jsonResponse({ error: "Missing authorization header.", stage: "auth_header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      auditLogFailure("auth_user", {
        reason: "invalid_session",
        message: authError?.message ?? null,
      });
      return jsonResponse({ error: "Invalid session.", stage: "auth_user" }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      auditLogFailure("profile_lookup", {
        user_id: authData.user.id,
        message: profileError?.message ?? null,
        hasProfile: Boolean(profile),
      });
      return jsonResponse({ error: "Profile lookup failed.", stage: "profile_lookup" }, 403);
    }

    const body = await req.json();
    const action = cleanText(body.action, 60);
    const moduleName = cleanText(body.module, 80);
    const recordType = cleanText(body.record_type, 80);

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      auditLogFailure("validation", { reason: "unsupported_action", action });
      return jsonResponse({ error: "Unsupported audit action.", stage: "validation" }, 400);
    }
    if (!moduleName || !ALLOWED_MODULES.has(moduleName)) {
      auditLogFailure("validation", { reason: "unsupported_module", module: moduleName });
      return jsonResponse({ error: "Unsupported audit module.", stage: "validation" }, 400);
    }
    if (!ALLOWED_RECORD_TYPES.has(recordType)) {
      auditLogFailure("validation", { reason: "unsupported_record_type", record_type: recordType });
      return jsonResponse({ error: "Unsupported audit record type.", stage: "validation" }, 400);
    }

    const { error: insertError } = await adminClient.from("audit_logs").insert([{
      user_id: authData.user.id,
      user_name: profile.full_name ?? authData.user.email ?? "Unknown user",
      user_role: profile.role,
      action,
      module: moduleName,
      record_id: cleanText(body.record_id, 120),
      record_type: recordType,
      description: cleanText(body.description, 300),
      metadata: cleanMetadata(body.metadata),
    }]);

    if (insertError) {
      auditLogFailure("insert", {
        user_id: authData.user.id,
        action,
        module: moduleName,
        record_type: recordType,
        code: insertError.code ?? null,
        message: insertError.message,
        details: insertError.details ?? null,
        hint: insertError.hint ?? null,
      });
      return jsonResponse({
        error: "Audit log could not be saved.",
        stage: "insert",
        code: insertError.code ?? null,
        message: insertError.message,
      }, 400);
    }
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected audit log failure.";
    auditLogFailure("unexpected", { message });
    return jsonResponse({ error: message, stage: "unexpected" }, 400);
  }
});
