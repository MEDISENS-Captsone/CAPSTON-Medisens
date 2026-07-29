import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Role = "doctor" | "nurse" | "BHW" | "pharmacist" | "labaratory" | "admin" | "midwives";

interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  role: Role;
}

const ALLOWED_ROLES = new Set<Role>(["doctor", "nurse", "BHW", "pharmacist", "labaratory", "admin", "midwives"]);

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
  console.error("[MEDISENS create-user] failed", { stage, ...details });
}

function errorResponse(status = 400) {
  return jsonResponse({ error: "Unable to create user account. Please try again." }, status);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ALLOWED_ROLES.has(value as Role);
}

function validatePayload(value: unknown): CreateUserPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body.");
  const body = value as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = body.role;

  if (!email || !email.includes("@")) throw new Error("A valid email address is required.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (!fullName) throw new Error("Full name is required.");
  if (!isRole(role)) throw new Error("A valid role is required.");

  return { email, password, fullName, role };
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
      .select("id, role")
      .eq("id", callerUserId)
      .maybeSingle();

    if (callerError) {
      logFailure("profile_lookup", {
        reason: "profile_lookup_error",
        message: callerError.message,
        caller_user_id: callerUserId,
      });
      return errorResponse(403);
    }

    if (!callerProfile) {
      logFailure("profile_lookup", {
        reason: "profile_not_found",
        caller_user_id: callerUserId,
      });
      return errorResponse(403);
    }

    if (callerProfile.id !== callerUserId) {
      logFailure("authorization", {
        reason: "profile_user_mismatch",
        caller_user_id: callerUserId,
        profile_id: callerProfile.id,
      });
      return errorResponse(403);
    }

    if (callerProfile.role !== ADMIN_ROLE) {
      logFailure("authorization", {
        reason: "role_mismatch",
        expected_role: ADMIN_ROLE,
        actual_role: callerProfile.role ?? null,
        caller_user_id: callerUserId,
      });
      return errorResponse(403);
    }

    const payload = validatePayload(await req.json());

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName },
    });

    if (createError || !createdUser.user) {
      logFailure("auth_create", {
        email: payload.email,
        message: createError?.message ?? "missing_created_user",
      });
      return errorResponse(400);
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: createdUser.user.id,
        email: payload.email,
        full_name: payload.fullName,
        role: payload.role,
      });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      logFailure("profile_upsert", {
        created_user_id: createdUser.user.id,
        email: payload.email,
        requested_role: payload.role,
        message: profileError.message,
      });
      return errorResponse(400);
    }

    return jsonResponse({
      user: {
        id: createdUser.user.id,
        email: payload.email,
        full_name: payload.fullName,
        role: payload.role,
      },
    }, 201);
  } catch (err) {
    logFailure("unexpected", {
      message: err instanceof Error ? err.message : "Unexpected create-user failure.",
    });
    return errorResponse(400);
  }
});
