import { patientSupabase } from '../supabase/patientClient';
import { fetchMyRecords, fetchProfile, type GrantScope } from '../../features/patient-portal/api';

// Patient Account Phase 6 — session guard for the Patient Portal.
//
// Built exclusively on patientSupabase (never the staff client). The
// account's own identity (its own display name / MediSens ID -- never a
// patient's clinical identity) still comes from its own patient_accounts
// row, which RLS already restricts to `auth_user_id = auth.uid()` (§12.2)
// and no RPC wraps. The grant list now comes from the audited
// patient_portal_my_records() RPC (§11.1) instead of Phase 4's temporary
// direct read of patient_access_grants -- same authorization boundary
// (RLS), but the real, audited read path. Each grant's record name is
// resolved via patient_portal_profile(), the only patient-safe source for
// a name (§7.1 -- names live on `patients`, which this guard never reads
// directly).
//
// This guard is UX only. It decides what the shell shows; it grants no
// access itself. Every actual authorization decision remains server-side
// (patient_portal_can_access, patient_portal_scope, RLS).

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
    scope: GrantScope;
    recordName: string;
}

export interface PatientPortalSession {
    account: PatientAccountSummary;
    grants: PatientGrantSummary[];
}

function fullName(profile: { firstName: string | null; lastName: string | null }): string {
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
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

    let records;
    try {
        records = await fetchMyRecords();
    } catch {
        return null;
    }

    const grants: PatientGrantSummary[] = await Promise.all(
        records.map(async (record) => {
            let recordName = '';
            try {
                const profile = await fetchProfile(record.patientId);
                recordName = fullName(profile);
            } catch {
                // A name lookup failing (e.g. a transient network error)
                // must not hide the grant itself -- the switcher and
                // context bar fall back to the plain relationship label.
            }
            return {
                id: record.grantId,
                patientId: record.patientId,
                relationship: record.relationship,
                scope: record.scope,
                recordName,
            };
        }),
    );

    return {
        account: { id: account.id, medisensId: account.medisens_id, displayName: account.display_name },
        grants,
    };
}

/** Signs out of the Patient Portal only. Never touches the staff client. */
export async function signOutPatientPortal(): Promise<void> {
    await patientSupabase.auth.signOut();
}
