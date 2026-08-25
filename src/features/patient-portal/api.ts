import { patientSupabase } from '../../lib/supabase/patientClient';

// Patient Account Phase 6 — thin wrappers over the Phase 5 read-API RPCs
// (docs/patientAccount.md §11.1). This is the *only* source of clinical
// Patient Portal data: nothing in src/app/patient or
// src/components/patient-portal ever queries patients, consultation,
// initial_consultation, follow_up, fhsis_logs, or any other clinical
// table directly. Every response here is already the patient-safe
// boundary (whitelisted columns, release gates, scope filtering, opaque
// tokens) -- these wrappers add types only, never additional filtering.

export type GrantRelationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';
export type GrantScope = 'FULL' | 'STANDARD';

export interface PortalMyRecord {
    /** Opaque, HMAC-derived token (patient_portal_grant_token) -- never
     * the raw patient_access_grants.id UUID. Used only as a stable list
     * key / selected-grant identifier; never sent to any RPC. */
    grantToken: string;
    patientId: number;
    relationship: GrantRelationship;
    scope: GrantScope;
    grantedAt: string;
}

export interface PortalProfile {
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    suffix: string | null;
    birthday: string | null;
    age: number | null;
    sex: string | null;
    civilStatus: string | null;
    address: string | null;
    contactNumber: string | null;
    bloodType: string | null;
    philhealthNo: string | null;
    philhealthStatus: string | null;
}

export interface PortalHome {
    scope: GrantScope;
    nextFollowUpDate: string | null;
    recentLabResultDate: string | null;
    recentMedicineDate: string | null;
    lastVisitDate: string | null;
    lastVisitDiagnosis: string | null;
}

export interface PortalVisit {
    visitToken: string;
    visitDate: string | null;
    reason: string | null;
    diagnosis: string | null;
    medicineCount: number;
    labCount: number;
    followUpDate: string | null;
}

export interface PortalVisitDetail {
    visitDate: string | null;
    reason: string | null;
    diagnosis: string | null;
    recommendation: string | null;
    attendingProvider: string | null;
    medicineCount: number;
    labCount: number;
    followUpDate: string | null;
}

export interface PortalVaccination {
    vaccineName: string;
    vaccineCategory: string | null;
    doseLabel: string | null;
    dateGiven: string | null;
    nextDueDate: string | null;
    facility: string | null;
}

export interface PortalFollowUp {
    followUpToken: string;
    visitDate: string | null;
    reason: string | null;
    diagnosis: string | null;
    status: string;
}

export interface PortalMedicationItem {
    name: string | null;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    quantity: string | null;
}

export interface PortalPrescription {
    prescriptionToken: string;
    prescribedDate: string | null;
    doctorName: string | null;
    medications: PortalMedicationItem[];
    malformed: boolean;
    claimed: boolean;
    claimedDate: string | null;
}

export interface PortalLabResultListItem {
    kind: 'released' | 'pending';
    resultToken: string | null;
    testDate: string | null;
    performedBy: string | null;
    testLabels: string[];
}

export interface PortalLabResultTest {
    testKey: string;
    value: unknown;
    unit: string | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    rangeText: string | null;
}

export interface PortalLabResultGroup {
    groupKey: string;
    tests: PortalLabResultTest[];
}

export interface PortalLabResultDetail {
    testDate: string | null;
    performedBy: string | null;
    groups: PortalLabResultGroup[];
}

/** A portal RPC call raised (unauthorized, not found, tampered token, or a
 * transient failure) -- callers show a patient-friendly error, never this
 * message or the underlying Supabase error text. */
export class PortalApiError extends Error {}

async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await patientSupabase.rpc(fn, args);
    if (error) throw new PortalApiError(error.message);
    return data as T;
}

export function fetchMyRecords(): Promise<PortalMyRecord[]> {
    return callRpc<Array<{ grant_token: string; patient_id: number; relationship: GrantRelationship; scope: GrantScope; granted_at: string }>>(
        'patient_portal_my_records',
    ).then((rows) =>
        (rows ?? []).map((r) => ({
            grantToken: r.grant_token,
            patientId: r.patient_id,
            relationship: r.relationship,
            scope: r.scope,
            grantedAt: r.granted_at,
        })),
    );
}

export function fetchProfile(patientId: number): Promise<PortalProfile> {
    return callRpc<Record<string, unknown>>('patient_portal_profile', { p_patient_id: patientId }).then((row) => ({
        firstName: (row.firstName as string) ?? null,
        middleName: (row.middleName as string) ?? null,
        lastName: (row.lastName as string) ?? null,
        suffix: (row.suffix as string) ?? null,
        birthday: (row.birthday as string) ?? null,
        age: (row.age as number) ?? null,
        sex: (row.sex as string) ?? null,
        civilStatus: (row.civilStatus as string) ?? null,
        address: (row.address as string) ?? null,
        contactNumber: (row.contactNumber as string) ?? null,
        bloodType: (row.bloodType as string) ?? null,
        philhealthNo: (row.philhealthNo as string) ?? null,
        philhealthStatus: (row.philhealthStatus as string) ?? null,
    }));
}

export function fetchHome(patientId: number): Promise<PortalHome> {
    return callRpc<Record<string, unknown>>('patient_portal_home', { p_patient_id: patientId }).then((row) => ({
        scope: row.scope as GrantScope,
        nextFollowUpDate: (row.nextFollowUpDate as string) ?? null,
        recentLabResultDate: (row.recentLabResultDate as string) ?? null,
        recentMedicineDate: (row.recentMedicineDate as string) ?? null,
        lastVisitDate: (row.lastVisitDate as string) ?? null,
        lastVisitDiagnosis: (row.lastVisitDiagnosis as string) ?? null,
    }));
}

export function fetchVisits(patientId: number, limit: number, offset: number): Promise<PortalVisit[]> {
    return callRpc<Array<Record<string, unknown>>>('patient_portal_visits', {
        p_patient_id: patientId,
        p_limit: limit,
        p_offset: offset,
    }).then((rows) =>
        (rows ?? []).map((r) => ({
            visitToken: r.visit_token as string,
            visitDate: (r.visit_date as string) ?? null,
            reason: (r.reason as string) ?? null,
            diagnosis: (r.diagnosis as string) ?? null,
            medicineCount: (r.medicine_count as number) ?? 0,
            labCount: (r.lab_count as number) ?? 0,
            followUpDate: (r.follow_up_date as string) ?? null,
        })),
    );
}

export function fetchVisitDetail(patientId: number, visitToken: string): Promise<PortalVisitDetail> {
    return callRpc<Record<string, unknown>>('patient_portal_visit_detail', {
        p_patient_id: patientId,
        p_visit_token: visitToken,
    }).then((row) => ({
        visitDate: (row.visitDate as string) ?? null,
        reason: (row.reason as string) ?? null,
        diagnosis: (row.diagnosis as string) ?? null,
        recommendation: (row.recommendation as string) ?? null,
        attendingProvider: (row.attendingProvider as string) ?? null,
        medicineCount: (row.medicineCount as number) ?? 0,
        labCount: (row.labCount as number) ?? 0,
        followUpDate: (row.followUpDate as string) ?? null,
    }));
}

export function fetchVaccinations(patientId: number): Promise<PortalVaccination[]> {
    return callRpc<Array<Record<string, unknown>>>('patient_portal_vaccinations', { p_patient_id: patientId }).then((rows) =>
        (rows ?? []).map((r) => ({
            vaccineName: r.vaccine_name as string,
            vaccineCategory: (r.vaccine_category as string) ?? null,
            doseLabel: (r.dose_label as string) ?? null,
            dateGiven: (r.date_given as string) ?? null,
            nextDueDate: (r.next_due_date as string) ?? null,
            facility: (r.facility as string) ?? null,
        })),
    );
}

export function fetchFollowUps(patientId: number): Promise<PortalFollowUp[]> {
    return callRpc<Array<Record<string, unknown>>>('patient_portal_follow_ups', { p_patient_id: patientId }).then((rows) =>
        (rows ?? []).map((r) => ({
            followUpToken: r.follow_up_token as string,
            visitDate: (r.visit_date as string) ?? null,
            reason: (r.reason as string) ?? null,
            diagnosis: (r.diagnosis as string) ?? null,
            status: r.status as string,
        })),
    );
}

function toMedicationItems(value: unknown): PortalMedicationItem[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
        const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
            name: typeof record.name === 'string' && record.name.trim() ? record.name : null,
            dosage: typeof record.dosage === 'string' && record.dosage.trim() ? record.dosage : null,
            frequency: typeof record.frequency === 'string' && record.frequency.trim() ? record.frequency : null,
            duration: typeof record.duration === 'string' && record.duration.trim() ? record.duration : null,
            quantity: typeof record.quantity === 'string' && record.quantity.trim() ? record.quantity : null,
        };
    });
}

export function fetchMedicines(patientId: number): Promise<PortalPrescription[]> {
    return callRpc<Array<Record<string, unknown>>>('patient_portal_medicines', { p_patient_id: patientId }).then((rows) =>
        (rows ?? []).map((r) => ({
            prescriptionToken: r.prescription_token as string,
            prescribedDate: (r.prescribed_date as string) ?? null,
            doctorName: (r.doctor_name as string) ?? null,
            medications: toMedicationItems(r.medications),
            malformed: Boolean(r.malformed),
            claimed: Boolean(r.claimed),
            claimedDate: (r.claimed_date as string) ?? null,
        })),
    );
}

export function fetchLabResults(patientId: number): Promise<PortalLabResultListItem[]> {
    return callRpc<Array<Record<string, unknown>>>('patient_portal_lab_results', { p_patient_id: patientId }).then((rows) =>
        (rows ?? []).map((r) => ({
            kind: r.kind as 'released' | 'pending',
            resultToken: (r.result_token as string) ?? null,
            testDate: (r.test_date as string) ?? null,
            performedBy: (r.performed_by as string) ?? null,
            testLabels: Array.isArray(r.test_labels) ? (r.test_labels as string[]) : [],
        })),
    );
}

export function fetchLabResultDetail(patientId: number, resultToken: string): Promise<PortalLabResultDetail> {
    return callRpc<Record<string, unknown>>('patient_portal_lab_result_detail', {
        p_patient_id: patientId,
        p_result_token: resultToken,
    }).then((row) => ({
        testDate: (row.testDate as string) ?? null,
        performedBy: (row.performedBy as string) ?? null,
        groups: (((row.groups as Array<Record<string, unknown>>) ?? []).map((g) => ({
            groupKey: g.groupKey as string,
            tests: ((g.tests as Array<Record<string, unknown>>) ?? []).map((t) => ({
                testKey: t.testKey as string,
                value: t.value,
                unit: (t.unit as string) ?? null,
                rangeLow: (t.rangeLow as number) ?? null,
                rangeHigh: (t.rangeHigh as number) ?? null,
                rangeText: (t.rangeText as string) ?? null,
            })),
        }))),
    }));
}

// ============================================================
// Phase 8 -- People who can access this record, recent access, and the
// self-service writes RLS/an RPC already permits (§9.5, §11.1, §12.2).
// ============================================================

export interface PortalAccessGrant {
    /** Opaque, HMAC-derived token (patient_portal_grant_token) -- never
     * the raw patient_access_grants.id UUID. Identifier hygiene only; the
     * real authorization check happens server-side in
     * patient_portal_access_revoke(). */
    accessToken: string;
    /** The holding account's display_name (§11) -- never an email, auth
     * user id, patient_accounts id, or identity-verification field. */
    holderName: string;
    relationship: GrantRelationship;
    grantedAt: string;
    revocable: boolean;
}

export function fetchAccessList(patientId: number): Promise<PortalAccessGrant[]> {
    return callRpc<Array<Record<string, unknown>>>('patient_portal_access_list', { p_patient_id: patientId }).then((rows) =>
        (rows ?? []).map((r) => ({
            accessToken: r.access_token as string,
            holderName: (r.holder_name as string) ?? '',
            relationship: r.relationship as GrantRelationship,
            grantedAt: r.granted_at as string,
            revocable: Boolean(r.revocable),
        })),
    );
}

/** The one patient-initiated write RPC (§6.3, §11.1) -- server-side
 * refuses anything but the caller's own SELF-held AUTHORIZED_CAREGIVER
 * grants; this wrapper adds no logic of its own. Takes the opaque
 * access_token from fetchAccessList(), never a raw grant id. */
export async function revokeAccessGrant(patientId: number, accessToken: string): Promise<void> {
    const { error } = await patientSupabase.rpc('patient_portal_access_revoke', { p_patient_id: patientId, p_access_token: accessToken });
    if (error) throw new PortalApiError(error.message);
}

export interface PortalRecentAccessEntry {
    actorLabel: string;
    action: string;
    occurredAt: string;
}

export function fetchRecentAccess(patientId: number, limit = 20, offset = 0): Promise<PortalRecentAccessEntry[]> {
    return callRpc<Array<Record<string, unknown>>>('patient_portal_recent_access', {
        p_patient_id: patientId,
        p_limit: limit,
        p_offset: offset,
    }).then((rows) =>
        (rows ?? []).map((r) => ({
            actorLabel: r.actor_label as string,
            action: r.action as string,
            occurredAt: r.occurred_at as string,
        })),
    );
}

export type CorrectionFieldGroup = 'name' | 'birthdate' | 'address' | 'contact' | 'philhealth' | 'other';
export type CorrectionStatus = 'submitted' | 'resolved' | 'declined';

export interface PortalCorrectionRequest {
    id: string;
    fieldGroup: CorrectionFieldGroup;
    requestedValue: string;
    patientNote: string | null;
    status: CorrectionStatus;
    submittedAt: string;
}

/** Correction requests write directly to patient_correction_requests --
 * no RPC exists or is needed. The Phase 2 RLS policy
 * (`patient_correction_requests_insert_self_or_guardian`) already
 * enforces, server-side, that the row's account_id belongs to the caller
 * and that patient_portal_can_correct(patient_id) is true (SELF/GUARDIAN
 * only -- an AUTHORIZED_CAREGIVER's insert is refused by the database
 * itself, not merely hidden in the UI). This function never trusts a
 * client-supplied account_id for anything but what RLS will itself
 * re-verify. */
export async function submitCorrectionRequest(params: {
    accountId: string;
    patientId: number;
    fieldGroup: CorrectionFieldGroup;
    requestedValue: string;
    patientNote?: string;
}): Promise<void> {
    const { error } = await patientSupabase.from('patient_correction_requests').insert({
        account_id: params.accountId,
        patient_id: params.patientId,
        field_group: params.fieldGroup,
        requested_value: params.requestedValue,
        patient_note: params.patientNote || null,
    });
    if (error) throw new PortalApiError(error.message);
}

/** Own correction-request history -- RLS already restricts this to the
 * caller's own account_id (patient_correction_requests_select_own). */
export async function fetchCorrectionRequests(patientId: number): Promise<PortalCorrectionRequest[]> {
    const { data, error } = await patientSupabase
        .from('patient_correction_requests')
        .select('id, field_group, requested_value, patient_note, status, submitted_at')
        .eq('patient_id', patientId)
        .order('submitted_at', { ascending: false });
    if (error) throw new PortalApiError(error.message);
    return (data ?? []).map((r) => ({
        id: r.id,
        fieldGroup: r.field_group,
        requestedValue: r.requested_value,
        patientNote: r.patient_note,
        status: r.status,
        submittedAt: r.submitted_at,
    }));
}

export interface PortalPreferences {
    textSize: 'comfortable' | 'large';
    highContrast: boolean;
    smsReminders: boolean;
    /** Interface language only (§17 Phase 9C) -- never applied to
     * clinician-authored/free-text clinical data, medication names, lab
     * test names, or diagnoses, which always render exactly as recorded
     * regardless of this value. */
    language: 'en' | 'fil';
}

/** Own preferences row -- RLS restricts SELECT/UPDATE to the caller's own
 * account_id (patient_account_preferences_select_own/_update_own). A
 * missing row (e.g. an older account-only caregiver activation, §5.2.1)
 * is not an error -- callers fall back to defaults. */
export async function fetchPreferences(accountId: string): Promise<PortalPreferences | null> {
    const { data, error } = await patientSupabase
        .from('patient_account_preferences')
        .select('text_size, high_contrast, sms_reminders, language')
        .eq('account_id', accountId)
        .maybeSingle();
    if (error) throw new PortalApiError(error.message);
    if (!data) return null;
    return {
        textSize: data.text_size === 'large' ? 'large' : 'comfortable',
        highContrast: Boolean(data.high_contrast),
        smsReminders: data.sms_reminders !== false,
        language: data.language === 'fil' ? 'fil' : 'en',
    };
}

export async function updatePreferences(accountId: string, patch: Partial<{ textSize: 'comfortable' | 'large'; highContrast: boolean; smsReminders: boolean; language: 'en' | 'fil' }>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.textSize !== undefined) row.text_size = patch.textSize;
    if (patch.highContrast !== undefined) row.high_contrast = patch.highContrast;
    if (patch.smsReminders !== undefined) row.sms_reminders = patch.smsReminders;
    if (patch.language !== undefined) row.language = patch.language;
    const { error } = await patientSupabase.from('patient_account_preferences').update(row).eq('account_id', accountId);
    if (error) throw new PortalApiError(error.message);
}

/** Self-service PIN change (§9.5) -- the one credential write with no
 * existing client path; calls the purpose-built patient-change-pin Edge
 * Function with the caller's own session token. Never sends the PIN
 * anywhere but this one call, and never touches Supabase Auth directly
 * (§5.4 D-2 -- the PIN is never presented to GoTrue from the client). */
export async function changePin(currentPin: string, newPin: string): Promise<void> {
    const { data: { session } } = await patientSupabase.auth.getSession();
    if (!session) throw new PortalApiError('Please sign in again.');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const response = await fetch(`${supabaseUrl}/functions/v1/patient-change-pin`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ currentPin, newPin }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new PortalApiError(body?.error || 'Unable to change your PIN right now.');
    }
}
