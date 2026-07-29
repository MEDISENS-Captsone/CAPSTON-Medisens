import { supabase } from '../../lib/supabase/client';
import { logAuditEvent } from '../audit/services';

export type WorkflowPayload = Record<string, unknown>;

export async function saveInitialConsultationWithVitals(
    consultationPayload: WorkflowPayload,
    vitalsPayload: WorkflowPayload,
): Promise<number> {
    const { data: consultation, error: consultationError } = await supabase
        .from('initial_consultation')
        .insert([consultationPayload])
        .select('initialconsultation_id')
        .single();

    if (consultationError) throw new Error('initial_consultation: ' + consultationError.message);

    const consultationId = consultation.initialconsultation_id as number;
    const { error: vitalsError } = await supabase
        .from('vital_sign')
        .insert([{ ...vitalsPayload, initial_consultation_id: consultationId }]);

    if (vitalsError) {
        await supabase.from('initial_consultation').delete().eq('initialconsultation_id', consultationId);
        throw new Error('vital_sign: ' + vitalsError.message);
    }

    void logAuditEvent({
        action: 'create',
        module: 'Consultation',
        recordId: consultationId,
        recordType: 'initial_consultation',
        description: 'Created initial consultation record.',
        metadata: {
            initial_consultation_id: consultationId,
            patient_id: consultationPayload.patient_id as string | number | undefined,
        },
    });

    return consultationId;
}

export async function upsertConsultation(payload: WorkflowPayload, consultationId?: number | null): Promise<number> {
    if (consultationId) {
        const { error } = await supabase.from('consultation').update(payload).eq('consultation_id', consultationId);
        if (error) throw error;
        void logAuditEvent({
            action: 'update',
            module: 'Consultation',
            recordId: consultationId,
            recordType: 'consultation',
            description: 'Updated doctor consultation record.',
            metadata: { consultation_id: consultationId, patient_id: payload.patient_id as string | number | undefined },
        });
        return consultationId;
    }

    const { data, error } = await supabase
        .from('consultation')
        .insert([payload])
        .select('consultation_id')
        .single();

    if (error) throw error;
    const newId = data.consultation_id as number;
    void logAuditEvent({
        action: 'create',
        module: 'Consultation',
        recordId: newId,
        recordType: 'consultation',
        description: 'Created doctor consultation record.',
        metadata: { consultation_id: newId, patient_id: payload.patient_id as string | number | undefined },
    });
    return newId;
}

export async function upsertFollowUpByConsultation(consultationId: number, payload: WorkflowPayload): Promise<void> {
    const { data: existing, error: checkError } = await supabase
        .from('follow_up')
        .select('followup_id, patient_id')
        .eq('consultation_id', consultationId)
        .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
        const { error } = await supabase.from('follow_up').update(payload).eq('consultation_id', consultationId);
        if (error) throw error;
        void logAuditEvent({
            action: 'update',
            module: 'Consultation',
            recordId: existing.followup_id as string | number | null,
            recordType: 'follow_up',
            description: 'Updated follow-up record.',
            metadata: {
                followup_id: existing.followup_id as string | number | undefined,
                consultation_id: consultationId,
                patient_id: (payload.patient_id || existing.patient_id) as string | number | undefined,
                status: payload.follow_up_status as string | undefined,
            },
        });
        return;
    }

    const { data, error } = await supabase
        .from('follow_up')
        .insert([payload])
        .select('followup_id')
        .single();
    if (error) throw error;
    const followupId = data.followup_id as number;
    void logAuditEvent({
        action: 'create',
        module: 'Consultation',
        recordId: followupId,
        recordType: 'follow_up',
        description: 'Created follow-up record.',
        metadata: {
            followup_id: followupId,
            consultation_id: consultationId,
            patient_id: payload.patient_id as string | number | undefined,
            status: payload.follow_up_status as string | undefined,
        },
    });
}

export async function upsertLatestFollowUpByPatient(patientId: string, payload: WorkflowPayload): Promise<void> {
    const { data: existing, error: checkError } = await supabase
        .from('follow_up')
        .select('followup_id')
        .eq('patient_id', patientId)
        .order('followup_id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
        const { error } = await supabase.from('follow_up').update(payload).eq('followup_id', existing.followup_id);
        if (error) throw error;
        void logAuditEvent({
            action: 'update',
            module: 'Consultation',
            recordId: existing.followup_id as string | number,
            recordType: 'follow_up',
            description: 'Updated follow-up record.',
            metadata: {
                followup_id: existing.followup_id as string | number,
                patient_id: patientId,
                status: payload.follow_up_status as string | undefined,
            },
        });
        return;
    }

    const { data, error } = await supabase
        .from('follow_up')
        .insert([payload])
        .select('followup_id')
        .single();
    if (error) throw error;
    const followupId = data.followup_id as number;
    void logAuditEvent({
        action: 'create',
        module: 'Consultation',
        recordId: followupId,
        recordType: 'follow_up',
        description: 'Created follow-up record.',
        metadata: {
            followup_id: followupId,
            patient_id: patientId,
            status: payload.follow_up_status as string | undefined,
        },
    });
}

export async function createLabRequest(payload: WorkflowPayload): Promise<void> {
    const { error } = await supabase.from('lab_request').insert([{ ...payload, status: 'Pending' }]);
    if (error) throw error;
    void logAuditEvent({
        action: 'create',
        module: 'Laboratory',
        recordId: null,
        recordType: 'lab_request',
        description: 'Created laboratory request.',
        metadata: {
            consultation_id: payload.consultation_id as string | number | undefined,
            patient_id: payload.patient_id as string | number | undefined,
        },
    });
}

export async function createPrescription(payload: WorkflowPayload): Promise<void> {
    const { error } = await supabase.from('prescription').insert([payload]);
    if (error) throw error;
    void logAuditEvent({
        action: 'create',
        module: 'Pharmacy',
        recordId: null,
        recordType: 'prescription',
        description: 'Created prescription for pharmacy queue.',
        metadata: {
            consultation_id: payload.consultation_id as string | number | undefined,
            patient_id: payload.patient_id as string | number | undefined,
        },
    });
}
