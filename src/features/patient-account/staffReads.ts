import { supabase } from '../../lib/supabase/client';

// Patient Account Phase 9B Step 3/4 -- read-only staff-side queries for the
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
//
// Step 4 correction: patient_accounts.pin_updated_at is now also
// selected. It is set only by patient-activation-complete's PIN-setting
// branches, never at row creation -- so a null value on an existing row
// is a reliable signal that the account holder has not finished setup
// yet (this is how an account-only caregiver, whose row is created
// eagerly with status='active' by patient-caregiver-activation-issue,
// is told apart from one who has actually set a PIN). It is never
// rendered as a raw timestamp, only used to derive `state` below.

export type PatientAccountGrantRelationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';
export type PatientAccountStatus = 'active' | 'disabled' | 'locked';
/** Staff-facing onboarding state for one account/grant row (task: four-state
 * model). `setup_pending` means the account exists (or, for a freshly
 * issued SELF/GUARDIAN code, an activation is in flight) but is not yet
 * usable for normal Patient Portal login. */
export type PatientAccountOnboardingState = 'setup_pending' | 'active' | 'unavailable';

export interface PatientAccountAccessRow {
    relationship: PatientAccountGrantRelationship;
    scope: 'FULL' | 'STANDARD';
    grantedAt: string;
    holderName: string;
    holderMedisensId: string;
    holderStatus: PatientAccountStatus;
    state: PatientAccountOnboardingState;
}

/** A SELF/GUARDIAN activation code that was issued and is still valid
 * (unconsumed, unexpired) but has not yet been completed -- so no
 * patient_accounts row exists for it yet. Read via the
 * `patient_account_onboarding_pending` RPC (Step 4 correction), never
 * from patient_activation_codes directly. */
export interface PendingActivation {
    relationship: 'SELF' | 'GUARDIAN';
    holderName: string | null;
    expiresAt: string;
}

export interface PatientAccountAccessInfo {
    /** The row where relationship === 'SELF', if any -- the patient's own
     * account. `null` means this patient has no Patient Portal account yet
     * (it may still have a pending SELF activation -- see `pendingSelf`). */
    selfAccount: PatientAccountAccessRow | null;
    /** Every other active (non-revoked) grant on this patient -- the
     * "People with access" list. Never includes the SELF row. */
    otherAccess: PatientAccountAccessRow[];
    /** A still-valid, not-yet-completed SELF activation code, if one was
     * issued and `selfAccount` is still null. */
    pendingSelf: PendingActivation | null;
    /** Still-valid, not-yet-completed GUARDIAN activation codes. A
     * completed GUARDIAN grant appears in `otherAccess` instead; this list
     * only ever holds codes with no account behind them yet. */
    pendingGuardians: PendingActivation[];
}

function deriveState(status: PatientAccountStatus, pinUpdatedAt: string | null): PatientAccountOnboardingState {
    if (status !== 'active') return 'unavailable';
    if (!pinUpdatedAt) return 'setup_pending';
    return 'active';
}

interface RawGrantRow {
    relationship: PatientAccountGrantRelationship;
    scope: 'FULL' | 'STANDARD';
    granted_at: string;
    // PostgREST returns an embedded to-one relationship as an object when
    // the FK column is unique-constrained per row (it is here: exactly
    // one patient_accounts row per grant), but types it as possibly an
    // array depending on schema introspection -- handled defensively below.
    patient_accounts: RawAccountEmbed | RawAccountEmbed[] | null;
}

interface RawAccountEmbed {
    display_name: string;
    medisens_id: string;
    status: PatientAccountStatus;
    pin_updated_at: string | null;
}

function unwrapAccount(row: RawGrantRow): RawAccountEmbed | null {
    if (!row.patient_accounts) return null;
    return Array.isArray(row.patient_accounts) ? (row.patient_accounts[0] ?? null) : row.patient_accounts;
}

interface RawPendingRow {
    relationship: 'SELF' | 'GUARDIAN';
    holder_name: string | null;
    expires_at: string;
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
    const [grantsResult, pendingResult] = await Promise.all([
        supabase
            .from('patient_access_grants')
            .select('relationship, scope, granted_at, patient_accounts(display_name, medisens_id, status, pin_updated_at)')
            .eq('patient_id', patientId)
            .is('revoked_at', null)
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
            .order('granted_at', { ascending: true }),
        // Step 4 correction: patient_activation_codes itself stays fully
        // inaccessible to authenticated clients (Phase 2 RLS unchanged) --
        // this RPC is a narrow, staff-role-checked projection, never a
        // table grant. See 20260828090000_patient_account_onboarding_status.sql.
        supabase.rpc('patient_account_onboarding_pending', { p_patient_id: patientId }),
    ]);

    if (grantsResult.error) throw grantsResult.error;
    if (pendingResult.error) throw pendingResult.error;

    const rows: PatientAccountAccessRow[] = (grantsResult.data ?? [])
        .map((row) => {
            const account = unwrapAccount(row as unknown as RawGrantRow);
            if (!account) return null;
            const typed = row as unknown as RawGrantRow;
            return {
                relationship: typed.relationship,
                scope: typed.scope,
                grantedAt: typed.granted_at,
                holderName: account.display_name,
                holderMedisensId: account.medisens_id,
                holderStatus: account.status,
                state: deriveState(account.status, account.pin_updated_at),
            };
        })
        .filter((row): row is PatientAccountAccessRow => row !== null);

    const selfAccount = rows.find((r) => r.relationship === 'SELF') ?? null;
    const otherAccess = rows.filter((r) => r.relationship !== 'SELF');

    const pendingRows = (pendingResult.data ?? []) as RawPendingRow[];
    const pendingSelf = selfAccount
        ? null
        : (() => {
              const found = pendingRows.find((r) => r.relationship === 'SELF');
              return found ? { relationship: 'SELF' as const, holderName: found.holder_name, expiresAt: found.expires_at } : null;
          })();

    // A pending GUARDIAN code only matters here if no completed GUARDIAN
    // grant already covers the same relationship (the issue function
    // itself refuses a second GUARDIAN code once a GUARDIAN grant is
    // active, so in practice these lists don't overlap -- this filter is
    // defensive, not load-bearing).
    const hasCompletedGuardian = otherAccess.some((r) => r.relationship === 'GUARDIAN');
    const pendingGuardians = hasCompletedGuardian
        ? []
        : pendingRows
              .filter((r) => r.relationship === 'GUARDIAN')
              .map((r) => ({ relationship: 'GUARDIAN' as const, holderName: r.holder_name, expiresAt: r.expires_at }));

    return { selfAccount, otherAccess, pendingSelf, pendingGuardians };
}

export interface PatientAccountLookupResult {
    displayName: string;
    medisensId: string;
    status: PatientAccountStatus;
}

/** Patient Account Phase 9B Step 4 -- exact MediSens ID lookup for staff
 * reusing an existing account (docs/patientAccount.md §6.1, task §6). Uses
 * the same `patient_accounts_select_staff_support` RLS policy as
 * `fetchPatientAccountAccess` above -- staff outside those four roles get
 * zero rows regardless. Selects only medisens_id/display_name/status;
 * never the internal account UUID or auth_user_id. This is an exact
 * match only -- no partial/fuzzy search, matching patient-access-grant's
 * own server-side lookup. */
export async function lookupPatientAccountByMedisensId(medisensId: string): Promise<PatientAccountLookupResult | null> {
    const { data, error } = await supabase
        .from('patient_accounts')
        .select('display_name, medisens_id, status')
        .eq('medisens_id', medisensId)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return { displayName: data.display_name, medisensId: data.medisens_id, status: data.status };
}
