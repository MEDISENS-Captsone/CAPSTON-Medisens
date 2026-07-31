// ============================================================
// Follow-Up SMS Reminder Invocation Script
// Invokes the protected Supabase Edge Function locally.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const FOLLOWUP_REMINDER_SECRET = process.env.FOLLOWUP_REMINDER_SECRET;
const FOLLOWUP_REMINDER_FUNCTION_URL =
  process.env.FOLLOWUP_REMINDER_FUNCTION_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send-followup-reminders` : null);

if (!FOLLOWUP_REMINDER_FUNCTION_URL || !FOLLOWUP_REMINDER_SECRET) {
  throw new Error(
    "Missing FOLLOWUP_REMINDER_FUNCTION_URL or FOLLOWUP_REMINDER_SECRET. Set SUPABASE_URL or FOLLOWUP_REMINDER_FUNCTION_URL before running."
  );
}

async function invokeFollowUpReminderFunction() {
  const response = await fetch(FOLLOWUP_REMINDER_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-followup-reminder-secret": FOLLOWUP_REMINDER_SECRET,
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = { error: "Reminder function returned an unreadable response." };
  }

  if (!response.ok) {
    console.error("Follow-up reminder invocation failed.", {
      status: response.status,
      body,
    });
    process.exitCode = 1;
    return;
  }

  console.log("Follow-up reminder invocation completed.", body);
}

invokeFollowUpReminderFunction().catch((error) => {
  console.error("Follow-up reminder invocation failed.", error);
  process.exit(1);
});
