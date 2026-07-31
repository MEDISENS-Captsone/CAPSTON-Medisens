import { supabase } from '../../lib/supabase/client';
import { logAuditEvent } from '../audit/services';
import { cleanVaccineRecord, type VaccineRecord } from '../vaccines/vaccineOptions';
import { normalizeVaccineRecords } from './itemization';

interface VaccinationLog {
    id: number | string;
    data_fields: Record<string, unknown> | null;
}

async function getVaccinationLog(patientId: string): Promise<VaccinationLog | null> {
    const { data, error } = await supabase
        .from('fhsis_logs')
        .select('id, data_fields')
        .eq('patient_id', patientId)
        .eq('category', 'vaccination')
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return {
        id: data.id as number | string,
        data_fields: (data.data_fields || {}) as Record<string, unknown>,
    };
}

export async function saveVaccineRecord(patientId: string, record: VaccineRecord): Promise<void> {
    const now = new Date().toISOString().substring(0, 7);
    const cleanRecord = cleanVaccineRecord(record);

    const existingLog = await getVaccinationLog(patientId);

    if (existingLog) {
        const currentFields = (existingLog.data_fields || {}) as Record<string, unknown>;
        const existingRecords = normalizeVaccineRecords(currentFields);
        const existingIndex = existingRecords.findIndex(item => item.id === cleanRecord.id);
        const auditAction = existingIndex >= 0 ? 'update' : 'create';
        const vaccineRecords = existingIndex >= 0
            ? existingRecords.map(item => item.id === cleanRecord.id ? cleanRecord : item)
            : [...existingRecords, cleanRecord];

        const updatedFields = {
            ...currentFields,
            vaccine_records: vaccineRecords,
        };

        const { error } = await supabase
            .from('fhsis_logs')
            .update({ data_fields: updatedFields })
            .eq('id', existingLog.id);

        if (error) throw error;
        void logAuditEvent({
            action: auditAction,
            module: 'Census Entry',
            recordId: existingLog.id,
            recordType: 'fhsis_log',
            description: auditAction === 'create' ? 'Created vaccination record.' : 'Updated vaccination record.',
            metadata: {
                patient_id: patientId,
                category: 'vaccination',
                action_scope: 'vaccination_record',
                status: auditAction === 'create' ? 'created' : 'updated',
                count: vaccineRecords.length,
            },
        });
    } else {
        const { data: user } = await supabase.auth.getUser();

        const { data, error } = await supabase
            .from('fhsis_logs')
            .insert([{
                patient_id: patientId,
                category: 'vaccination',
                data_fields: { vaccine_records: [cleanRecord] },
                report_month: now,
                encoded_by: user?.user?.id || null,
            }])
            .select('id')
            .single();

        if (error) throw error;
        void logAuditEvent({
            action: 'create',
            module: 'Census Entry',
            recordId: data.id as string | number,
            recordType: 'fhsis_log',
            description: 'Created vaccination record.',
            metadata: {
                patient_id: patientId,
                category: 'vaccination',
                action_scope: 'vaccination_record',
                status: 'created',
                count: 1,
            },
        });
    }
}

export async function fetchVaccineRecords(patientId: string): Promise<VaccineRecord[]> {
    const existingLog = await getVaccinationLog(patientId);

    if (!existingLog) return [];

    const fields = existingLog.data_fields;
    if (!fields) return [];

    return normalizeVaccineRecords(fields);
}

export async function removeVaccineRecord(patientId: string, vaccineId: string): Promise<void> {
    const existingLog = await getVaccinationLog(patientId);

    if (!existingLog) return;

    const currentFields = (existingLog.data_fields || {}) as Record<string, unknown>;
    const existingRecords = normalizeVaccineRecords(currentFields);

    const updatedRecords = existingRecords.filter(record => record.id !== vaccineId);

    const { error } = await supabase
        .from('fhsis_logs')
        .update({
            data_fields: {
                ...currentFields,
                vaccine_records: updatedRecords,
            },
        })
        .eq('id', existingLog.id);

    if (error) throw error;
    void logAuditEvent({
        action: 'update',
        module: 'Census Entry',
        recordId: existingLog.id,
        recordType: 'fhsis_log',
        description: 'Removed vaccination record.',
        metadata: {
            patient_id: patientId,
            category: 'vaccination',
            action_scope: 'vaccination_record',
            status: 'removed',
            count: updatedRecords.length,
        },
    });
}
