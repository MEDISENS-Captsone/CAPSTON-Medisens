import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface DeleteUserPayload {
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logFailure(stage: string, details: Record<string, unknown>) {
  console.error("[MEDISENS delete-user] failed", { stage, ...details });
}

function errorResponse(status = 400) {
  return jsonResponse({ error: "Unable to delete the user account. Please try again." }, status);
}

function validatePayload(value: unknown): DeleteUserPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!userId) throw new Error("User id is required.");

  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405);

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      logFailure("configuration", {
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasAnonKey: Boolean(SUPABASE_ANON_KEY),
        hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      });
      return errorResponse(500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logFailure("authorization", { reason: "missing_authorization_header" });
      return errorResponse(401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      logFailure("auth_user", { message: authError?.message ?? null });
      return errorResponse(401);
    }

    const callerUserId = authData.user.id;

    const { data: callerProfile, error: callerError } = await adminClient
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", callerUserId)
      .maybeSingle();

    if (callerError || !callerProfile || callerProfile.role !== ADMIN_ROLE) {
      logFailure("authorization", {
        reason: callerError ? "profile_lookup_error" : "admin_required",
        message: callerError?.message ?? null,
        caller_user_id: callerUserId,
        caller_role: callerProfile?.role ?? null,
      });
      return errorResponse(403);
    }

    const payload = validatePayload(await req.json());

    if (payload.userId === callerUserId) {
      logFailure("authorization", {
        reason: "self_delete_blocked",
        caller_user_id: callerUserId,
      });
      return errorResponse(403);
    }

    const { data: targetProfile, error: targetLookupError } = await adminClient
      .from("profiles")
      .select("id, full_name, role, email")
      .eq("id", payload.userId)
      .maybeSingle();

    if (targetLookupError || !targetProfile) {
      logFailure("target_lookup", {
        target_user_id: payload.userId,
        message: targetLookupError?.message ?? null,
      });
      return errorResponse(404);
    }

    if (targetProfile.role === ADMIN_ROLE) {
      const { count: adminCount, error: adminCountError } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", ADMIN_ROLE);

      if (adminCountError || (adminCount ?? 0) <= 1) {
        logFailure("last_admin_check", {
          target_user_id: payload.userId,
          admin_count: adminCount ?? null,
          message: adminCountError?.message ?? null,
        });
        return errorResponse(403);
      }
    }

    const { error: deleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", payload.userId);

    if (deleteError) {
      logFailure("profile_delete", {
        target_user_id: payload.userId,
        target_role: targetProfile.role,
        message: deleteError.message,
      });
      return errorResponse(400);
    }

    const { error: auditError } = await adminClient.from("audit_logs").insert([{
      user_id: callerUserId,
      user_name: callerProfile.full_name ?? authData.user.email ?? "Unknown user",
      user_role: callerProfile.role,
      action: "delete",
      module: "Administration",
      record_id: payload.userId,
      record_type: "profile",
      description: "Deleted RHU user account.",
      metadata: {
        profile_id: payload.userId,
        action_scope: "user_account",
        deleted_role: targetProfile.role,
      },
    }]);

    if (auditError) {
      logFailure("audit_insert", {
        target_user_id: payload.userId,
        caller_user_id: callerUserId,
        message: auditError.message,
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    logFailure("unexpected", {
      message: err instanceof Error ? err.message : "Unexpected delete-user failure.",
    });
    return errorResponse(400);
  }
});
