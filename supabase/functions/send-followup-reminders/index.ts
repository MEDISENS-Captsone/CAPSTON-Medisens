// ============================================================
// Supabase Edge Function: send-followup-reminders
// Triggered daily by pg_cron to send SMS reminders 1 day
// before a patient's follow-up visit via iProg SMS API
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IPROG_SMS_URL = "https://www.iprogsms.com/api/v1/sms_messages";
const REMINDER_SECRET_HEADER = "x-followup-reminder-secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `${REMINDER_SECRET_HEADER}, authorization, x-client-info, apikey, content-type`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Edge Functions read secrets from Deno.env (set in Supabase Dashboard)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IPROG_API_TOKEN = Deno.env.get("IPROG_API_TOKEN")!;
const FOLLOWUP_REMINDER_SECRET = Deno.env.get("FOLLOWUP_REMINDER_SECRET")!;

type ReminderCounts = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logReminderFailure(stage: string, details: Record<string, unknown>) {
  console.error("[MEDISENS follow-up reminders]", { stage, ...details });
}

function formatPhoneNumber(number: string): string {
  const cleaned = String(number).replace(/\D/g, "");
  if (cleaned.startsWith("63")) return cleaned;
  if (cleaned.startsWith("0")) return "63" + cleaned.slice(1);
  if (cleaned.startsWith("9")) return "63" + cleaned;
  return cleaned;
}

async function sendSMS(phoneNumber: string, message: string) {
  const formattedNumber = formatPhoneNumber(phoneNumber);

  const response = await fetch(IPROG_SMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: formattedNumber,
      message,
      api_token: IPROG_API_TOKEN,
    }),
  });

  let result: unknown = null;
  try {
    result = await response.json();
  } catch (error) {
    logReminderFailure("sms_response_parse", {
      status: response.status,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { formattedNumber, result, ok: response.ok, status: response.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestedSecret = req.headers.get(REMINDER_SECRET_HEADER);
  if (!FOLLOWUP_REMINDER_SECRET || requestedSecret !== FOLLOWUP_REMINDER_SECRET) {
    logReminderFailure("authorization", {
      hasConfiguredSecret: Boolean(FOLLOWUP_REMINDER_SECRET),
      hasRequestSecret: Boolean(requestedSecret),
      method: req.method,
    });
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !IPROG_API_TOKEN) {
      logReminderFailure("configuration", {
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        hasIprogToken: Boolean(IPROG_API_TOKEN),
      });
      return jsonResponse({ error: "Unable to process reminders." }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Tomorrow's date in PH time (UTC+8)
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    console.log("[MEDISENS follow-up reminders] checking scheduled follow-ups", {
      reminderDate: tomorrowStr,
    });

    const { data: followUps, error: followUpError } = await supabase
      .from("follow_up")
      .select("followup_id, visit_date, patient_id")
      .eq("visit_date", tomorrowStr);

    if (followUpError) {
      logReminderFailure("follow_up_query", {
        code: followUpError.code,
        message: followUpError.message,
        details: followUpError.details,
      });
      return jsonResponse({ error: "Unable to process reminders." }, 500);
    }

    const counts: ReminderCounts = {
      processed: followUps?.length ?? 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    if (!followUps || followUps.length === 0) {
      return jsonResponse(counts);
    }

    for (const followUp of followUps) {
      const { followup_id: followUpId, visit_date, patient_id } = followUp;

      const { data: reminderLog, error: reminderLogError } = await supabase
        .from("audit_logs")
        .select("id")
        .eq("module", "Follow-up Reminders")
        .eq("action", "generate")
        .eq("record_type", "follow_up")
        .eq("record_id", String(followUpId))
        .filter("metadata->>reminder_date", "eq", tomorrowStr)
        .maybeSingle();

      if (reminderLogError) {
        logReminderFailure("idempotency_lookup", {
          followUpId,
          code: reminderLogError.code,
          message: reminderLogError.message,
          details: reminderLogError.details,
        });
        counts.failed += 1;
        continue;
      }

      if (reminderLog) {
        counts.skipped += 1;
        continue;
      }

      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("contactNumber")
        .eq("id", patient_id)
        .single();

      if (patientError || !patient?.contactNumber) {
        logReminderFailure("patient_contact_lookup", {
          followUpId,
          patientId: patient_id,
          code: patientError?.code ?? null,
          message: patientError?.message ?? null,
        });
        counts.skipped += 1;
        continue;
      }

      const message =
        `Hello! This is a reminder that you have a follow-up visit scheduled ` +
        `tomorrow, ${visit_date}. Please make sure to come on time. ` +
        `If you need to reschedule, please contact us as soon as possible. Thank you!`;

      const { formattedNumber, ok, result, status } = await sendSMS(patient.contactNumber, message);

      if (!ok) {
        logReminderFailure("sms_send", {
          followUpId,
          patientId: patient_id,
          formattedNumber,
          status,
          providerResponse: result,
        });
        counts.failed += 1;
        continue;
      }

      const { error: auditError } = await supabase.from("audit_logs").insert([{
        user_id: null,
        user_name: "System",
        user_role: "system",
        action: "generate",
        module: "Follow-up Reminders",
        record_id: String(followUpId),
        record_type: "follow_up",
        description: "Follow-up reminder SMS sent.",
        metadata: {
          reminder_date: tomorrowStr,
          followup_id: followUpId,
          patient_id,
          status: "sent",
        },
      }]);

      if (auditError) {
        logReminderFailure("idempotency_record", {
          followUpId,
          patientId: patient_id,
          code: auditError.code,
          message: auditError.message,
          details: auditError.details,
        });
      }

      console.log("[MEDISENS follow-up reminders] SMS sent", {
        followUpId,
        patientId: patient_id,
        formattedNumber,
      });
      counts.sent += 1;
    }

    return jsonResponse(counts);
  } catch (error) {
    logReminderFailure("unexpected", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    return jsonResponse({ error: "Unable to process reminders." }, 500);
  }
});
