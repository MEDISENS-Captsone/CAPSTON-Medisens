import { supabase } from '../../lib/supabase/client';

export type AnalyticsBucket = 'day' | 'week' | 'month';

export interface AnalyticsPeriod {
    from: string;
    toExclusive: string;
    bucket: AnalyticsBucket;
}

export interface AnalyticsRow {
    metric_key: string;
    bucket_start: string | null;
    dimension_key: string | null;
    current_count: number | null;
    previous_count: number | null;
    reliability: string | null;
    excluded_invalid_date_count: number | null;
    fallback_date_count: number | null;
    unknown_status_count: number | null;
    blank_group_count: number | null;
}

export type StaffOperationsMetricGroup = 'completion' | 'turnaround';
export type StaffOperationsRole = 'doctor' | 'laboratory' | 'pharmacist';
export type StaffOperationsAggregationScope = 'staff' | 'role_total';

export interface StaffOperationsAnalyticsRow {
    aggregation_scope: StaffOperationsAggregationScope;
    metric_group: StaffOperationsMetricGroup;
    metric_key:
        | 'consultations_completed'
        | 'follow_ups_completed'
        | 'lab_requests_completed'
        | 'lab_turnaround_minutes'
        | 'prescriptions_dispensed'
        | 'prescription_turnaround_minutes';
    role_key: StaffOperationsRole;
    staff_user_id: string | null;
    staff_display_name: string | null;
    bucket_start: string;
    count_value: number | null;
    duration_minutes_avg: number | null;
    duration_minutes_median: number | null;
    attributed_count: number;
    unattributed_count: number;
    reliability: 'high' | 'medium' | 'approximate';
    attribution_source:
        | 'audit_logs_deduplicated'
        | 'workflow_only_unattributed'
        | 'workflow_events_role_total';
}

export interface BarangayHeatmapRow {
    barangay: string;
    registered_patients: number | null;
    consultations: number | null;
    pending_follow_ups: number | null;
    vaccinations: number | null;
}

export interface DoctorAnalyticsData {
    consultationVolume: AnalyticsRow[];
    followUpActivity: AnalyticsRow[];
    followUpCurrentWorkload: AnalyticsRow[];
    diagnoses: AnalyticsRow[];
    complaints: AnalyticsRow[];
    labActivity: AnalyticsRow[];
    labCurrentWorkload: AnalyticsRow[];
    prescriptionPrescribed: AnalyticsRow[];
    prescriptionDispensed: AnalyticsRow[];
    prescriptionCurrentWorkload: AnalyticsRow[];
    barangayDistribution: AnalyticsRow[];
    barangayHeatmap: BarangayHeatmapRow[];
    dataQuality: AnalyticsRow[];
}

type RpcResult = {
    data: AnalyticsRow[] | null;
    error: { message?: string; code?: string } | null;
};

type BarangayHeatmapRpcResult = {
    data: BarangayHeatmapRow[] | null;
    error: { message?: string; code?: string } | null;
};

async function callAnalyticsRpc(functionName: string, args?: Record<string, string | number>): Promise<AnalyticsRow[]> {
    const client = supabase as unknown as {
        rpc: (name: string, args?: Record<string, string | number>) => Promise<RpcResult>;
    };
    const { data, error } = await client.rpc(functionName, args);

    if (error) {
        throw new Error(error.code === '42501' ? 'permission_denied' : 'analytics_unavailable');
    }

    return data ?? [];
}

async function callBarangayHeatmapRpc(args: Record<string, string | number>): Promise<BarangayHeatmapRow[]> {
    const client = supabase as unknown as {
        rpc: (name: string, args?: Record<string, string | number>) => Promise<BarangayHeatmapRpcResult>;
    };
    const { data, error } = await client.rpc('analytics_barangay_heatmap', args);

    if (error) {
        throw new Error(error.code === '42501' ? 'permission_denied' : 'analytics_unavailable');
    }

    return data ?? [];
}

export async function fetchStaffOperationsAnalytics(
    period: AnalyticsPeriod,
): Promise<StaffOperationsAnalyticsRow[]> {
    const client = supabase as unknown as {
        rpc: (
            name: string,
            args: Record<string, string | number>,
        ) => Promise<{ data: StaffOperationsAnalyticsRow[] | null; error: { code?: string } | null }>;
    };
    const { data, error } = await client.rpc('analytics_staff_operations_g4b', {
        p_from: period.from,
        p_to_exclusive: period.toExclusive,
        p_bucket: period.bucket,
    });

    if (error) throw new Error(error.code === '42501' ? 'permission_denied' : 'analytics_unavailable');
    return data ?? [];
}

export async function fetchBarangayDrilldown(barangay: string, period: AnalyticsPeriod): Promise<AnalyticsRow[]> {
    return callAnalyticsRpc('analytics_barangay_drilldown', {
        p_barangay: barangay,
        p_from: period.from,
        p_to_exclusive: period.toExclusive,
    });
}

export async function fetchDoctorAnalytics(period: AnalyticsPeriod): Promise<DoctorAnalyticsData> {
    const sharedPeriod = {
        p_from: period.from,
        p_to_exclusive: period.toExclusive,
        p_bucket: period.bucket,
    };

    const [
        consultationVolume,
        followUpActivity,
        followUpCurrentWorkload,
        diagnoses,
        complaints,
        labActivity,
        labCurrentWorkload,
        prescriptionPrescribed,
        prescriptionDispensed,
        prescriptionCurrentWorkload,
        barangayDistribution,
        barangayHeatmap,
        dataQuality,
    ] = await Promise.all([
        callAnalyticsRpc('analytics_consultation_volume', sharedPeriod),
        callAnalyticsRpc('analytics_follow_up_activity', { ...sharedPeriod, p_scope: 'historical' }),
        callAnalyticsRpc('analytics_follow_up_activity', { ...sharedPeriod, p_scope: 'current_active_workload' }),
        callAnalyticsRpc('analytics_clinical_text_frequency', {
            p_from: period.from,
            p_to_exclusive: period.toExclusive,
            p_text_kind: 'diagnosis',
            p_source: 'all',
            p_limit: 10,
        }),
        callAnalyticsRpc('analytics_clinical_text_frequency', {
            p_from: period.from,
            p_to_exclusive: period.toExclusive,
            p_text_kind: 'complaint',
            p_source: 'all',
            p_limit: 10,
        }),
        callAnalyticsRpc('analytics_lab_activity', { ...sharedPeriod, p_scope: 'historical' }),
        callAnalyticsRpc('analytics_lab_activity', { ...sharedPeriod, p_scope: 'current_active_workload' }),
        callAnalyticsRpc('analytics_prescription_activity', {
            ...sharedPeriod,
            p_date_mode: 'prescribed',
            p_scope: 'historical',
        }),
        callAnalyticsRpc('analytics_prescription_activity', {
            ...sharedPeriod,
            p_date_mode: 'dispensed',
            p_scope: 'historical',
        }),
        callAnalyticsRpc('analytics_prescription_activity', {
            ...sharedPeriod,
            p_date_mode: 'prescribed',
            p_scope: 'current_active_workload',
        }),
        callAnalyticsRpc('analytics_barangay_distribution'),
        callBarangayHeatmapRpc({
            p_from: period.from,
            p_to_exclusive: period.toExclusive,
        }),
        callAnalyticsRpc('analytics_data_quality', {
            p_from: period.from,
            p_to_exclusive: period.toExclusive,
        }),
    ]);

    return {
        consultationVolume,
        followUpActivity,
        followUpCurrentWorkload,
        diagnoses,
        complaints,
        labActivity,
        labCurrentWorkload,
        prescriptionPrescribed,
        prescriptionDispensed,
        prescriptionCurrentWorkload,
        barangayDistribution,
        barangayHeatmap,
        dataQuality,
    };
}
