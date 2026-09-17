import { supabase } from '../../lib/supabase/client';

export type StaffCorrectionFieldGroup = 'name' | 'birthdate' | 'address' | 'contact' | 'philhealth' | 'other';
export type StaffCorrectionStatus = 'submitted' | 'resolved' | 'declined';

export interface StaffCorrectionRequest {
    id: string;
    patientId: string;
    fieldGroup: StaffCorrectionFieldGroup;
    requestedValue: string;
    patientNote: string | null;
    status: StaffCorrectionStatus;
    submittedAt: string;
    resolvedAt: string | null;
    resolvedBy: string | null;
}

const CORRECTION_REQUEST_COLUMNS =
    'id, patient_id, field_group, requested_value, patient_note, status, submitted_at, resolved_at, resolved_by';

export async function fetchPatientCorrectionRequests(patientId: string): Promise<StaffCorrectionRequest[]> {
    const { data, error } = await supabase
        .from('patient_correction_requests')
        .select(CORRECTION_REQUEST_COLUMNS)
        .eq('patient_id', patientId)
        .order('submitted_at', { ascending: false });

    if (error) throw error;

    return (data ?? [])
        .map(request => ({
            id: request.id as string,
            patientId: String(request.patient_id),
            fieldGroup: request.field_group as StaffCorrectionFieldGroup,
            requestedValue: request.requested_value as string,
            patientNote: request.patient_note as string | null,
            status: request.status as StaffCorrectionStatus,
            submittedAt: request.submitted_at as string,
            resolvedAt: request.resolved_at as string | null,
            resolvedBy: request.resolved_by as string | null,
        }))
        .sort((left, right) => {
            const leftPending = left.status === 'submitted' ? 0 : 1;
            const rightPending = right.status === 'submitted' ? 0 : 1;
            if (leftPending !== rightPending) return leftPending - rightPending;
            return Date.parse(right.submittedAt) - Date.parse(left.submittedAt);
        });
}

export async function reviewPatientCorrectionRequest(params: {
    requestId: string;
    patientId: string;
    outcome: Exclude<StaffCorrectionStatus, 'submitted'>;
}): Promise<void> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error('No authenticated staff user is available.');

    const { data, error } = await supabase
        .from('patient_correction_requests')
        .update({
            status: params.outcome,
            resolved_at: new Date().toISOString(),
            resolved_by: userData.user.id,
        })
        .eq('id', params.requestId)
        .eq('patient_id', params.patientId)
        .eq('status', 'submitted')
        .select('id')
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('This correction request is no longer pending.');
}
