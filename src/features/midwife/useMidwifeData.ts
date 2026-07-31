import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase/client';
import { midwifeAPI } from './api';

export const useMidwifeData = () => {
    const [patients, setPatients] = useState<any[]>([]);
    const [records, setRecords] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);

    const refreshData = useCallback(async () => {
        setIsLoading(true);
        const currentMonth = new Date().toISOString().substring(0, 7);

        // 1. Fetch Patients — join patient_consent so consent status is accurate
        try {
            const { data, error } = await supabase
                .from('patients')
                .select(`
                    id,
                    firstName,
                    lastName,
                    middleName,
                    suffix,
                    sex,
                    age,
                    birthday,
                    birthPlace,
                    bloodType,
                    nationality,
                    religion,
                    civilStatus,
                    address,
                    contactNumber,
                    educationalAttain,
                    employmentStatus,
                    philhealthNo,
                    philhealthStatus,
                    category,
                    categoryOthers,
                    relativeName,
                    relativeRelation,
                    relativeAddress,
                    created_at,
                    patient_consent ( consent_id )
                `)
                .or('archive_status.eq.active,archive_status.is.null')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Normalize consent_signed as a boolean on each patient object
            const normalized = (data || []).map((p: any) => ({
                ...p,
                consent_signed: Array.isArray(p.patient_consent)
                    ? p.patient_consent.length > 0
                    : p.patient_consent !== null && p.patient_consent !== undefined,
            }));

            setPatients(normalized);
        } catch (err) {
                console.error("Error fetching patients:", err);
            setPatients([]);
        }

        // 2. Fetch Census Records
        try {
            const recs = await midwifeAPI.getFHSISLogs(currentMonth);
            setRecords(recs || []);
        } catch (err) {
                console.error("Error fetching census records:", err);
            setRecords([]);
        }

        // 3. Fetch Summary
        try {
            const summ = await midwifeAPI.getMonthlySummary(currentMonth);
            setSummary(summ || {});
        } catch (err) {
                console.error("Error fetching summary:", err);
            setSummary({});
        }

        setIsLoading(false);
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    return { patients, records, summary, isLoading, refreshData };
};
