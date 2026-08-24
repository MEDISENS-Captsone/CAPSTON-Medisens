import { supabase } from '../../lib/supabase/client';

// Patient Account Phase 9B Step 3 -- read-only staff-side queries for the
// Patient Account section of PatientDetailModal. Uses the normal STAFF
// Supabase client (never patientSupabase) and relies entirely on the
// existing Phase 2 RLS (patient_accounts_select_staff_support,
// patient_access_grants_select_staff) -- both already restricted to the
// same four roles as PATIENT_ACCOUNT_STAFF_ROLES. This module adds no
// new authorization of its own; a role outside that set gets zero rows
// back from Postgres regardless of what this code does.
//
// Every query below selects explicit columns only -- no select('*') --
// and never selects patient_accounts.id, auth_user_id, the synthetic
// @patient.medisens.local email, identity_verified_*, failed_attempts,
// locked_until, or any patient_access_grants.id/account_id. The nested
// `patient_accounts(...)` embed below is resolved by PostgREST from the
// existing account_id foreign key -- it never requires selecting that
// foreign key or the referenced primary key to work, so neither ever
// reaches the browser.

export type PatientAccountGrantRelationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';
export type PatientAccountStatus = 'active' | 'disabled' | 'locked';

export interface PatientAccountAccessRow {
    relationship: PatientAccountGrantRelationship;
    scope: 'FULL' | 'STANDARD';
    grantedAt: string;
    holderName: string;
    holderMedisensId: string;
    holderStatus: PatientAccountStatus;
}

export interface PatientAccountAccessInfo {
    /** The row where relationship === 'SELF', if any -- the patient's own
     * account. `null` means this patient has no Patient Portal account. */
    selfAccount: PatientAccountAccessRow | null;
    /** Every other active (non-revoked) grant on this patient -- the
     * "People with access" list. Never includes the SELF row. */
    otherAccess: PatientAccountAccessRow[];
}

interface RawGrantRow {
    relationship: PatientAccountGrantRelationship;
    scope: 'FULL' | 'STANDARD';
    granted_at: string;
    // PostgREST returns an embedded to-one relationship as an object when
    // the FK column is unique-constrained per row (it is here: exactly
    // one patient_accounts row per grant), but types it as possibly an
    // array depending on schema introspection -- handled defensively below.
    patient_accounts: { display_name: string; medisens_id: string; status: PatientAccountStatus } | { display_name: string; medisens_id: string; status: PatientAccountStatus }[] | null;
}

function unwrapAccount(row: RawGrantRow): { display_name: string; medisens_id: string; status: PatientAccountStatus } | null {
    if (!row.patient_accounts) return null;
    return Array.isArray(row.patient_accounts) ? (row.patient_accounts[0] ?? null) : row.patient_accounts;
}

export async function fetchPatientAccountAccess(patientId: string | number): Promise<PatientAccountAccessInfo> {
    // "Currently active access" mirrors the same two conditions
    // patient_portal_can_access()/patient_portal_is_self_holder() already
    // enforce server-side for the Patient Portal itself (§12.1):
    // revoked_at is null AND (expires_at is null OR expires_at > now()).
    // A GUARDIAN grant that has aged past the patient's 18th birthday
    // (§4.3) must stop appearing here the same way it stops granting
    // portal access, even though nothing ever revoked it. Filtered
    // server-side via .or() -- expires_at itself is never added to the
    // select list, since the filter doesn't require it in the response
    // and the UI has no genuine use for showing it.
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from('patient_access_grants')
        .select('relationship, scope, granted_at, patient_accounts(display_name, medisens_id, status)')
        .eq('patient_id', patientId)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('granted_at', { ascending: true });

    if (error) throw error;

    const rows: PatientAccountAccessRow[] = (data ?? [])
        .map((row) => {
            const account = unwrapAccount(row as unknown as RawGrantRow);
            if (!account) return null;
            return {
                relationship: (row as unknown as RawGrantRow).relationship,
                scope: (row as unknown as RawGrantRow).scope,
                grantedAt: (row as unknown as RawGrantRow).granted_at,
                holderName: account.display_name,
                holderMedisensId: account.medisens_id,
                holderStatus: account.status,
            };
        })
        .filter((row): row is PatientAccountAccessRow => row !== null);

    const selfAccount = rows.find((r) => r.relationship === 'SELF') ?? null;
    const otherAccess = rows.filter((r) => r.relationship !== 'SELF');

    return { selfAccount, otherAccess };
}
