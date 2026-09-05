import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface DeactivateUserPayload {
  userId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
const ADMIN_ROLE = Deno.env.get("ADMIN_ROLE") ?? "admin";
const AUTH_BAN_DURATION = "876000h";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logFailure(stage: string, details: Record<string, unknown>) {
  console.error("[MEDISENS deactivate-user] failed", { stage, ...details });
}

function errorResponse(status = 400, code = "deactivation_failed") {
  return jsonResponse({
    error: "Unable to deactivate the user account. Please try again.",
    code,
  }, status);
}

function validatePayload(value: unknown): DeactivateUserPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) throw new Error("User id is required.");
  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "method_not_allowed");

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      logFailure("configuration", {
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasAnonKey: Boolean(SUPABASE_ANON_KEY),
        hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      });
      return errorResponse(500, "configuration_error");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse(401, "authentication_required");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      logFailure("auth_user", { message: authError?.message ?? null });
      return errorResponse(401, "authentication_required");
    }

    const callerUserId = authData.user.id;
    const { data: callerProfile, error: callerError } = await adminClient
      .from("profiles")
      .select("id, role, full_name, is_active")
      .eq("id", callerUserId)
      .maybeSingle();

    if (callerError || !callerProfile || callerProfile.role !== ADMIN_ROLE || !callerProfile.is_active) {
      logFailure("authorization", {
        caller_user_id: callerUserId,
        caller_role: callerProfile?.role ?? null,
        caller_active: callerProfile?.is_active ?? null,
        message: callerError?.message ?? null,
      });
      return errorResponse(403, "active_admin_required");
    }

    const payload = validatePayload(await req.json());
    const { data: lifecycleRows, error: lifecycleError } = await adminClient.rpc(
      "deactivate_staff_profile",
      { p_target_user_id: payload.userId, p_actor_user_id: callerUserId },
    );

    if (lifecycleError) {
      const code = lifecycleError.message === "last_active_admin"
        ? "last_active_admin"
        : lifecycleError.message === "self_deactivation_blocked"
        ? "self_deactivation_blocked"
        : lifecycleError.message === "target_profile_not_found"
        ? "not_found"
        : "deactivation_failed";
      logFailure("profile_deactivation", {
        target_user_id: payload.userId,
        caller_user_id: callerUserId,
        code: lifecycleError.code,
        message: lifecycleError.message,
      });
      return errorResponse(code === "not_found" ? 404 : code === "deactivation_failed" ? 400 : 403, code);
    }

    const lifecycle = Array.isArray(lifecycleRows) ? lifecycleRows[0] : lifecycleRows;
    const { error: banError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      ban_duration: AUTH_BAN_DURATION,
    });

    if (banError) {
      logFailure("auth_ban", {
        target_user_id: payload.userId,
        caller_user_id: callerUserId,
        message: banError.message,
      });
      // The profile remains inactive and application authorization fails closed.
      // A repeated request is safe and retries the Auth ban.
      return errorResponse(500, "auth_disable_pending");
    }

    const wasDeactivated = lifecycle?.was_deactivated === true;
    if (wasDeactivated) {
      const { error: auditError } = await adminClient.from("audit_logs").insert([{
        user_id: callerUserId,
        user_name: callerProfile.full_name ?? authData.user.email ?? "Unknown user",
        user_role: callerProfile.role,
        action: "deactivate",
        module: "Administration",
        record_id: payload.userId,
        record_type: "profile",
        description: "Deactivated RHU staff account while preserving historical attribution.",
        metadata: { profile_id: payload.userId, action_scope: "user_account" },
      }]);
      if (auditError) {
        logFailure("audit_insert", {
          target_user_id: payload.userId,
          caller_user_id: callerUserId,
          message: auditError.message,
        });
      }
    }

    return jsonResponse({ ok: true, status: "deactivated", alreadyInactive: !wasDeactivated });
  } catch (err) {
    logFailure("unexpected", {
      message: err instanceof Error ? err.message : "Unexpected deactivate-user failure.",
    });
    return errorResponse(400);
  }
});
