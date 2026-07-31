import { supabase } from '../../lib/supabase/client';
import { safeTrim } from '../../lib/utils/strings';
import { logAuditEvent } from '../audit/services';

// Helper to get the current logged-in user
const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

export const midwifeAPI = {
    /**
     * Fetches all registered patients from the central registry.
     */
    getPatients: async () => {
        const { data, error } = await supabase
            .from('patients')
            .select('id, firstName, lastName, address, birthday, sex, age')
            .or('archive_status.eq.active,archive_status.is.null')
            .order('lastName', { ascending: true });

        if (error) {
            console.error('Error fetching patients:', error);
            throw error;
        }
        return data || [];
    },

    /**
     * Fetches FHSIS logs (Target Client List) filtered by the active reporting month.
     * Joins with the patients table to retrieve demographic data.
     */
    getFHSISLogs: async (reportMonth: string) => {
        const { data, error } = await supabase
            .from('fhsis_logs')
            .select(`
                id,
                patient_id,
                category,
                data_fields,
                report_month,
                created_at,
                patients (
                    firstName,
                    lastName,
                    address
                )
            `)
            .eq('report_month', reportMonth)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching FHSIS logs:', error);
            throw error;
        }
        
        // Flatten the relationship for easier mapping in the UI
        return (data || []).map(record => {
            // Safely extract patient data to satisfy both TypeScript and Supabase runtime
            const patientData: any = Array.isArray(record.patients) ? record.patients[0] : record.patients;

            return {
                ...record,
                patientName: patientData ? safeTrim(`${patientData.firstName || ''} ${patientData.lastName || ''}`) : 'Unknown Patient',
                address: patientData?.address || 'N/A'
            };
        });
    },

    /**
     * Summarizes the monthly counts for the Doctor's view.
     */
    getMonthlySummary: async (reportMonth: string) => {
        const { data, error } = await supabase
            .from('fhsis_logs')
            .select('category')
            .eq('report_month', reportMonth);

        if (error) {
            console.error('Error fetching summary:', error);
            throw error;
        }

        // Count records per category
        const summary = data.reduce((acc: any, curr: any) => {
            acc[curr.category] = (acc[curr.category] || 0) + 1;
            return acc;
        }, {});

        return summary;
    },

    /**
     * Inserts a new FHSIS entry and links it via patient_id.
     */
    saveFHSISLog: async (payload: { patientId: number; category: string; data: any }) => {
        const user = await getCurrentUser();
        
        const { data, error } = await supabase
            .from('fhsis_logs')
            .insert([{
                patient_id: payload.patientId,
                category: payload.category,
                data_fields: payload.data, // Stored securely in JSONB column
                report_month: new Date().toISOString().substring(0, 7),
                encoded_by: user?.id || null
            }])
            .select();

        if (error) {
            console.error('Error saving FHSIS log:', error);
            throw error;
        }
        const saved = Array.isArray(data) ? data[0] : null;
        void logAuditEvent({
            action: 'create',
            module: 'Census Entry',
            recordId: saved?.id,
            recordType: 'fhsis_log',
            description: 'Created FHSIS census entry.',
            metadata: {
                count: saved?.id ? 1 : 0,
                patient_id: payload.patientId,
                category: payload.category,
            },
        });
        
        return data;
    }
};
