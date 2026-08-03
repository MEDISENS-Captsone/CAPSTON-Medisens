import { supabase } from '../../lib/supabase/client';
import type { PatientRegistrationPayload } from '../../types/patient';
import { logAuditEvent } from '../audit/services';

export interface PatientConsentPayload {
    patient_id: string;
    consent_signer: boolean;
    consent_signature?: string | null;
    consent_personnel: string;
    consent_personnel_signature?: string | null;
    consent_date: string;
}

export async function createPatient(payload: PatientRegistrationPayload): Promise<void> {
    const { error } = await supabase.from('patients').insert([payload]);
    if (error) throw error;
    void logAuditEvent({
        action: 'create',
        module: 'Patient Records',
        recordId: null,
        recordType: 'patient',
        description: 'Created patient record.',
        metadata: { action_scope: 'patient_registration' },
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
