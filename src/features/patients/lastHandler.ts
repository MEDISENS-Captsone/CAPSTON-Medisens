import { supabase } from '../../lib/supabase/client';

export interface LastPatientHandler {
    staffName: string | null;
    staffRole: string | null;
    action: string;
    occurredAt: string;
}

interface AuditCandidate {
    user_name: string | null;
    user_role: string | null;
    action: string;
    created_at: string;
}

const meaningfulModules = ['Patient Records', 'Consultation', 'Laboratory', 'Pharmacy', 'Census Entry', 'Patient Archive'];
const meaningfulActions = ['create', 'update', 'dispense', 'archived', 'restored'];
const auditColumns = 'user_name, user_role, action, created_at';

function latestCandidate(candidates: Array<AuditCandidate | null | undefined>): AuditCandidate | null {
    return candidates.filter((candidate): candidate is AuditCandidate => Boolean(candidate))
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;
}

export function formatLastPatientAction(handler: Pick<LastPatientHandler, 'action'>): string {
    const labels: Record<string, string> = {
        create: 'Created patient-related record',
        update: 'Updated patient-related record',
        dispense: 'Dispensed prescription',
        archived: 'Archived patient record',
        restored: 'Restored patient record',
    };
    return labels[handler.action] ?? 'Managed patient record';
}

export async function fetchLastPatientHandler(patientId: string): Promise<LastPatientHandler | null> {
    const patientIdText = String(patientId);
    const baseQuery = () => supabase
        .from('audit_logs')
        .select(auditColumns)
        .in('module', meaningfulModules)
        .in('action', meaningfulActions)
        .order('created_at', { ascending: false })
        .limit(1);

    const [metadataResult, patientRecordResult] = await Promise.all([
        baseQuery().eq('metadata->>patient_id', patientIdText).maybeSingle(),
        baseQuery().eq('record_type', 'patient').eq('record_id', patientIdText).maybeSingle(),
    ]);

    if (metadataResult.error) throw metadataResult.error;
    if (patientRecordResult.error) throw patientRecordResult.error;

    const latest = latestCandidate([metadataResult.data as AuditCandidate | null, patientRecordResult.data as AuditCandidate | null]);
    if (!latest) return null;

    return {
        staffName: latest.user_name,
        staffRole: latest.user_role,
        action: latest.action,
        occurredAt: latest.created_at,
    };
}
