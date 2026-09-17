import { supabase } from '../../lib/supabase/client';
import type { PatientRegistrationPayload } from '../../types/patient';
import { logAuditEvent } from '../audit/services';

const DUPLICATE_PATIENT_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, bloodType, address, contactNumber, birthday, civilStatus, nationality, religion, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress, created_at, archive_status';

export interface DuplicatePatientCandidate {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    suffix?: string | null;
    age: number | null;
    sex: string;
    bloodType: string;
    address: string;
    contactNumber?: string | number | null;
    birthday: string;
    civilStatus?: string | null;
    nationality?: string | null;
    religion?: string | null;
    educationalAttain?: string | null;
    employmentStatus?: string | null;
    philhealthNo?: string | null;
    philhealthStatus?: string | null;
    category?: string | null;
    categoryOthers?: string | null;
    relativeName?: string | null;
    relativeRelation?: string | null;
    relativeAddress?: string | null;
    created_at?: string | null;
    archive_status?: 'active' | 'archived' | null;
}

export type DuplicateMatchKind = 'strong' | 'demographic_conflict' | 'partial' | 'archived_exact' | 'archived_partial';

export interface DuplicatePatientMatch {
    kind: DuplicateMatchKind;
    patient: DuplicatePatientCandidate;
    conflictingIdentifiers: Array<'contact number' | 'PhilHealth number'>;
}

const normalizeName = (value?: string | null) => (value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-PH')
    .replace(/[^a-z0-9]+/g, '');

const normalizeDigits = (value?: string | number | null) => String(value ?? '').replace(/\D/g, '');

export function normalizePhilippineContact(value?: string | number | null): string {
    const digits = normalizeDigits(value);
    if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
    if (/^9\d{9}$/.test(digits)) return `63${digits}`;
    if (/^639\d{9}$/.test(digits)) return digits;
    return digits;
}

function isSingleEditApart(left: string, right: string): boolean {
    if (left === right || Math.min(left.length, right.length) < 5 || Math.abs(left.length - right.length) > 1) return false;
    if (left.length === right.length) {
        let differences = 0;
        for (let index = 0; index < left.length; index += 1) {
            if (left[index] !== right[index] && ++differences > 1) return false;
        }
        return differences === 1;
    }
    const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
    let shortIndex = 0;
    let longIndex = 0;
    let skipped = false;
    while (shortIndex < shorter.length && longIndex < longer.length) {
        if (shorter[shortIndex] === longer[longIndex]) {
            shortIndex += 1;
            longIndex += 1;
        } else if (skipped) {
            return false;
        } else {
            skipped = true;
            longIndex += 1;
        }
    }
    return true;
}

function classifyDuplicateCandidate(payload: PatientRegistrationPayload, patient: DuplicatePatientCandidate): DuplicatePatientMatch | null {
    const submitted = {
        first: normalizeName(payload.firstName),
        middle: normalizeName(payload.middleName),
        last: normalizeName(payload.lastName),
        sex: normalizeName(payload.sex),
    };
    const existing = {
        first: normalizeName(patient.firstName),
        middle: normalizeName(patient.middleName),
        last: normalizeName(patient.lastName),
        sex: normalizeName(patient.sex),
    };
    const sameSex = submitted.sex !== '' && submitted.sex === existing.sex;
    const exactName = submitted.first === existing.first && submitted.middle === existing.middle && submitted.last === existing.last;
    const exactDemographics = exactName && sameSex;
    const submittedContact = normalizePhilippineContact(payload.contactNumber);
    const existingContact = normalizePhilippineContact(patient.contactNumber);
    const submittedPhilHealth = normalizeDigits(payload.philhealthNo);
    const existingPhilHealth = normalizeDigits(patient.philhealthNo);
    const conflictingIdentifiers: DuplicatePatientMatch['conflictingIdentifiers'] = [];
    if (submittedContact && existingContact && submittedContact !== existingContact) conflictingIdentifiers.push('contact number');
    if (submittedPhilHealth && existingPhilHealth && submittedPhilHealth !== existingPhilHealth) conflictingIdentifiers.push('PhilHealth number');
    const archived = patient.archive_status === 'archived';

    if (exactDemographics) {
        if (archived) return { kind: 'archived_exact', patient, conflictingIdentifiers };
        return { kind: conflictingIdentifiers.length ? 'demographic_conflict' : 'strong', patient, conflictingIdentifiers };
    }

    if (!sameSex) return null;
    const exactFirst = submitted.first === existing.first;
    const exactMiddle = submitted.middle === existing.middle;
    const exactLast = submitted.last === existing.last;
    const conservativePartialName =
        (exactFirst && exactLast && !exactMiddle)
        || (exactLast && exactMiddle && isSingleEditApart(submitted.first, existing.first))
        || (exactFirst && exactMiddle && isSingleEditApart(submitted.last, existing.last));
    if (!conservativePartialName) return null;
    return { kind: archived ? 'archived_partial' : 'partial', patient, conflictingIdentifiers };
}

const MATCH_PRIORITY: Record<DuplicateMatchKind, number> = {
    strong: 5,
    archived_exact: 4,
    demographic_conflict: 3,
    partial: 2,
    archived_partial: 1,
};

export async function findPossibleDuplicatePatient(payload: PatientRegistrationPayload): Promise<DuplicatePatientMatch | null> {
    const { data, error } = await supabase
        .from('patients')
        .select(DUPLICATE_PATIENT_COLUMNS)
        .eq('birthday', payload.birthday)
        .order('id', { ascending: true })
        .limit(50);
    if (error) {
        if (import.meta.env.DEV) {
            console.error('[MEDISENS duplicate preflight] Supabase candidate query failed.', {
                code: error.code,
                message: error.message,
                details: error.details,
                hint: error.hint,
            });
        }
        throw error;
    }
    try {
        const matches = ((data ?? []) as DuplicatePatientCandidate[])
            .map(patient => classifyDuplicateCandidate(payload, patient))
            .filter((match): match is DuplicatePatientMatch => match !== null)
            .sort((left, right) => MATCH_PRIORITY[right.kind] - MATCH_PRIORITY[left.kind]);
        return matches[0] ?? null;
    } catch (error) {
        if (import.meta.env.DEV) {
            console.error('[MEDISENS duplicate preflight] Client-side candidate normalization or classification failed.', {
                candidateCount: data?.length ?? 0,
                error,
            });
        }
        throw error;
    }
}

export interface PatientConsentPayload {
    patient_id: string;
    consent_signer: boolean;
    consent_signature?: string | null;
    consent_personnel: string;
    consent_personnel_signature?: string | null;
    consent_date: string;
}

export async function createPatient(payload: PatientRegistrationPayload, duplicateOverridePatientId?: string): Promise<void> {
    const { data, error } = await supabase.from('patients').insert([payload]).select('id').single();
    if (error) throw error;
    void logAuditEvent({
        action: 'create',
        module: 'Patient Records',
        recordId: data?.id ?? null,
        recordType: 'patient',
        description: duplicateOverridePatientId ? 'Created patient record after possible duplicate warning override.' : 'Created patient record.',
        metadata: duplicateOverridePatientId
            ? { action_scope: 'patient_registration_duplicate_override', source: `possible_duplicate:${duplicateOverridePatientId}` }
            : { action_scope: 'patient_registration' },
    });
}

export async function updatePatientRecord(patientId: string, updates: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('patients').update(updates).eq('id', patientId);
    if (error) throw error;
    const nameFields = ['firstName', 'middleName', 'lastName', 'suffix'];
    const nameUpdated = nameFields.some(field => Object.prototype.hasOwnProperty.call(updates, field));
    await logAuditEvent({
        action: 'update',
        module: 'Patient Records',
        recordId: patientId,
        recordType: 'patient',
        description: 'Updated patient profile',
        metadata: { patient_id: patientId, name_updated: nameUpdated },
    });
}

export async function savePatientConsent(payload: PatientConsentPayload): Promise<void> {
    const { data: existing, error: checkError } = await supabase
        .from('patient_consent')
        .select('consent_id')
        .eq('patient_id', payload.patient_id)
        .maybeSingle();

    if (checkError) throw checkError;
    if (existing) throw new Error('Patient consent is already recorded.');

    const { data, error } = await supabase.from('patient_consent').insert([payload]).select('consent_id').single();
    if (error) throw error;
    void logAuditEvent({
        action: 'create',
        module: 'Patient Records',
        recordId: data?.consent_id ?? null,
        recordType: 'patient_consent',
        description: 'Recorded patient consent.',
        metadata: { patient_id: payload.patient_id, consent_id: data?.consent_id },
    });
}
