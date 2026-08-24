import type { Role } from '../../types/user';

// Patient Account Phase 9B Step 3 -- which staff roles may see/manage
// Patient Portal account information in the staff UI.
//
// This is a frontend-safe mirror of STAFF_ISSUING_ROLES in
// supabase/functions/_shared/patientPortal.ts (currently
// `new Set(["BHW", "nurse", "midwives", "admin"])`), which every
// Patient Account Edge Function (patient-activation-issue,
// patient-caregiver-activation-issue, patient-access-grant, the
// RECOVERY branch of patient-activation-issue) already authorizes
// against server-side. It is also, not coincidentally, the exact role
// list the Phase 2 `patient_accounts_select_staff_support` and
// `patient_access_grants_select_staff` RLS policies grant read access
// to -- a role outside this set cannot read patient_accounts /
// patient_access_grants at all, regardless of what the frontend shows.
//
// No independent frontend role list is invented here; this file exists
// only because the server-side Set lives in a Deno Edge Function module
// the browser bundle cannot import. If STAFF_ISSUING_ROLES is ever
// changed server-side, this constant must be updated to match in the
// same change -- there is deliberately no single shared source between
// the Deno and browser runtimes for this value today.
export const PATIENT_ACCOUNT_STAFF_ROLES: ReadonlySet<Role> = new Set(['BHW', 'nurse', 'midwives', 'admin']);

export function canSeePatientAccountSection(role: Role | null | undefined): boolean {
    return role != null && PATIENT_ACCOUNT_STAFF_ROLES.has(role);
}
