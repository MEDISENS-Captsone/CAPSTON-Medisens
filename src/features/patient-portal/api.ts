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
    grantId: string;
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
    return callRpc<Array<{ grant_id: string; patient_id: number; relationship: GrantRelationship; scope: GrantScope; granted_at: string }>>(
        'patient_portal_my_records',
    ).then((rows) =>
        (rows ?? []).map((r) => ({
            grantId: r.grant_id,
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
