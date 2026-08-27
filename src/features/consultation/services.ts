import { supabase } from '../../lib/supabase/client';
import { logAuditEvent } from '../audit/services';

export type WorkflowPayload = Record<string, unknown>;

export async function saveInitialConsultationWithVitals(
    consultationPayload: WorkflowPayload,
    vitalsPayload: WorkflowPayload,
): Promise<number> {
    // The RPC inserts both clinical records in one database transaction. This
    // avoids an impossible client-side rollback: intake roles deliberately
    // have no DELETE policy on initial_consultation.
    const { data: consultationId, error } = await supabase.rpc('record_initial_intake', {
        p_initial: consultationPayload,
        p_vitals: vitalsPayload,
    });

    if (error) throw new Error('initial_intake: ' + error.message);
    if (typeof consultationId !== 'number') throw new Error('initial_intake: no consultation ID returned');

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

// Finalizes a consultation and (optionally) creates/updates its follow-up in
// a single database transaction via the complete_consultation RPC, so a
// follow-up write failure can never leave the consultation stuck Completed
// without it -- see 20260830140000_atomic_complete_consultation.sql.
export async function completeConsultationAtomic(
    consultationId: number | null,
    consultationPayload: WorkflowPayload,
    followUpPayload: WorkflowPayload | null,
): Promise<number> {
    const { data, error } = await supabase.rpc('complete_consultation', {
        p_consultation_id: consultationId,
        p_consultation: consultationPayload,
        p_follow_up: followUpPayload,
    });
    if (error) throw error;
    const resolvedConsultationId = data as number;

    void logAuditEvent({
        action: 'update',
        module: 'Consultation',
        recordId: resolvedConsultationId,
        recordType: 'consultation',
        description: followUpPayload
            ? 'Completed consultation and scheduled follow-up.'
            : 'Completed consultation.',
        metadata: {
            consultation_id: resolvedConsultationId,
            patient_id: consultationPayload.patient_id as string | number | undefined,
            follow_up_scheduled: Boolean(followUpPayload),
        },
    });

    return resolvedConsultationId;
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
