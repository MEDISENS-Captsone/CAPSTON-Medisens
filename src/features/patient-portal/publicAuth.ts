// Patient Account Phase 9B Step 6 -- shared caller for the pre-auth
// patient-* Edge Functions (patient-login, patient-activation-verify,
// patient-activation-complete). These run before any Patient Portal
// session exists, so they are called with a plain fetch + the anon key
// only -- never through `patientSupabase.functions.invoke`, which would
// attach whatever session (if any) is currently in patientSupabase's own
// storage. Never logs the request or response body (which may contain a
// PIN, activation code, or OTP).

export interface PublicFunctionError {
    error: string;
}

/** Calls a public (pre-auth) patient-* Edge Function. Returns the parsed
 * JSON body regardless of HTTP status -- callers branch on `response.ok`
 * plus the body's own `error` field, since these functions always return
 * a JSON error body (never a raw framework error) on failure. Throws
 * only on a genuine network/parse failure, which the caller maps to a
 * generic "try again" message -- never a raw error string. */
export async function callPublicPatientFunction<T>(name: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T | PublicFunctionError | null }> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
}

export const PUBLIC_FUNCTION_GENERIC_ERROR = "Something went wrong. Please try again.";

/** Extracts a patient-safe error message from a callPublicPatientFunction
 * result. Every patient-* Edge Function already crafts its own
 * patient-readable `error` string server-side (docs/patientAccount.md --
 * "never reveal whether a MediSens ID exists" is a *server*-side
 * decision already baked into which message it chooses to send) -- this
 * only falls back to a generic client-side message when the response
 * body itself is missing or malformed, never invents a more specific one. */
export function extractErrorMessage(data: unknown): string {
    if (data && typeof data === 'object' && 'error' in data && typeof (data as PublicFunctionError).error === 'string') {
        return (data as PublicFunctionError).error;
    }
    return PUBLIC_FUNCTION_GENERIC_ERROR;
}
