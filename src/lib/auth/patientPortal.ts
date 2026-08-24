import { patientSupabase } from '../supabase/patientClient';

// Patient Account Phase 4 — session guard for the Patient Portal.
//
// Built exclusively on patientSupabase (never the staff client) and on
// reads that are already RLS-protected and non-clinical as of Phase 2:
// the account's own patient_accounts row (its own display name /
// MediSens ID, never a patient's clinical identity) and its own
// patient_access_grants rows (relationship + patient_id only).
//
// patient_portal_my_records() (docs/patientAccount.md §11.1) does not
// exist until Phase 5 -- this guard reads the same two Phase-2 tables
// that RPC will eventually wrap, so it is a temporary, equally-safe
// stand-in, not a shortcut around RLS. No `patients` row, and no other
// clinical table, is read here at all.
//
// This guard is UX only. It decides what the shell shows; it grants no
// access itself. Every actual authorization decision remains server-side
// (patient_portal_can_access, patient_portal_scope, RLS) once Phase 5
// RPCs exist.

export type GrantRelationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';

export interface PatientAccountSummary {
    id: string;
    medisensId: string;
    displayName: string;
}

export interface PatientGrantSummary {
    id: string;
    patientId: number;
    relationship: GrantRelationship;
}

export interface PatientPortalSession {
    account: PatientAccountSummary;
    grants: PatientGrantSummary[];
}

/**
 * Resolves the current Patient Portal session, if any.
 *
 * Returns `null` when there is no session, the underlying auth user no
 * longer has a patient_accounts row (e.g. a disabled/removed account), or
 * the account's own row cannot be read. Never throws for these expected
 * "not signed in" / "no longer valid" cases.
 */
export async function getPatientPortalSession(): Promise<PatientPortalSession | null> {
    const { data: { session } } = await patientSupabase.auth.getSession();
    if (!session) return null;

    const { data: account, error: accountError } = await patientSupabase
        .from('patient_accounts')
        .select('id, medisens_id, display_name')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

    if (accountError || !account) return null;

    const { data: grantRows, error: grantsError } = await patientSupabase
        .from('patient_access_grants')
        .select('id, patient_id, relationship, revoked_at, expires_at')
        .eq('account_id', account.id);

    if (grantsError) return null;

    const now = Date.now();
    const activeGrants: PatientGrantSummary[] = (grantRows ?? [])
        .filter((g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > now))
        .map((g) => ({ id: g.id, patientId: g.patient_id, relationship: g.relationship as GrantRelationship }));

    return {
        account: { id: account.id, medisensId: account.medisens_id, displayName: account.display_name },
        grants: activeGrants,
    };
}

/** Signs out of the Patient Portal only. Never touches the staff client. */
export async function signOutPatientPortal(): Promise<void> {
    await patientSupabase.auth.signOut();
}
