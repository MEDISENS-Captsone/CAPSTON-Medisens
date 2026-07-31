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
export type StaffOperationsAggregationScope = 'staff' | 'role_total' | 'period_total';

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

// Each analytics request resolves independently. A failed request stays an explicit
// error: it is never represented as an empty array, so the UI cannot mistake a failure
// for "no records".
export type AnalyticsResult<T> =
    | { status: 'ok'; rows: T; stale?: boolean }
    | { status: 'error'; message: AnalyticsErrorCode };

export type AnalyticsErrorCode = 'permission_denied' | 'analytics_unavailable';

export interface DoctorAnalyticsData {
    consultationVolume: AnalyticsResult<AnalyticsRow[]>;
    followUpActivity: AnalyticsResult<AnalyticsRow[]>;
    followUpCurrentWorkload: AnalyticsResult<AnalyticsRow[]>;
    diagnoses: AnalyticsResult<AnalyticsRow[]>;
    complaints: AnalyticsResult<AnalyticsRow[]>;
    labActivity: AnalyticsResult<AnalyticsRow[]>;
    labCurrentWorkload: AnalyticsResult<AnalyticsRow[]>;
    prescriptionPrescribed: AnalyticsResult<AnalyticsRow[]>;
    prescriptionDispensed: AnalyticsResult<AnalyticsRow[]>;
    prescriptionCurrentWorkload: AnalyticsResult<AnalyticsRow[]>;
    barangayDistribution: AnalyticsResult<AnalyticsRow[]>;
    barangayHeatmap: AnalyticsResult<BarangayHeatmapRow[]>;
    // Explicit request-level failure metadata.
    requestErrors: Partial<Record<AnalyticsRequestKey, AnalyticsErrorCode>>;
    succeededRequestCount: number;
    failedRequestCount: number;
}

export type AnalyticsRequestKey = Exclude<
    keyof DoctorAnalyticsData,
    'requestErrors' | 'succeededRequestCount' | 'failedRequestCount'
>;

export const ANALYTICS_REQUEST_KEYS: readonly AnalyticsRequestKey[] = [
    'consultationVolume',
    'followUpActivity',
    'followUpCurrentWorkload',
    'diagnoses',
    'complaints',
    'labActivity',
    'labCurrentWorkload',
    'prescriptionPrescribed',
    'prescriptionDispensed',
    'prescriptionCurrentWorkload',
    'barangayDistribution',
    'barangayHeatmap',
];

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

// analytics_barangay_distribution takes no period arguments: it is all-time active
// patient distribution and does not change when the selected period changes. It is
// resolved once per page session and reused. An in-flight promise is shared so
// concurrent callers cannot start a second request, and a failed request is not
// cached, so a later load can still retry.
let barangayDistributionCache: AnalyticsRow[] | null = null;
let barangayDistributionRequest: Promise<AnalyticsRow[]> | null = null;

function fetchBarangayDistributionCached(): Promise<AnalyticsRow[]> {
    if (barangayDistributionCache) return Promise.resolve(barangayDistributionCache);
    if (!barangayDistributionRequest) {
        barangayDistributionRequest = callAnalyticsRpc('analytics_barangay_distribution')
            .then(rows => {
                barangayDistributionCache = rows;
                return rows;
            })
            .catch(error => {
                barangayDistributionRequest = null;
                throw error;
            });
    }
    return barangayDistributionRequest;
}

export async function fetchDoctorAnalytics(period: AnalyticsPeriod): Promise<DoctorAnalyticsData> {
    const sharedPeriod = {
        p_from: period.from,
        p_to_exclusive: period.toExclusive,
        p_bucket: period.bucket,
    };

    const settled = await Promise.allSettled([
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
        fetchBarangayDistributionCached(),
        callBarangayHeatmapRpc({
            p_from: period.from,
            p_to_exclusive: period.toExclusive,
        }),
    ]);

    const requestErrors: Partial<Record<AnalyticsRequestKey, AnalyticsErrorCode>> = {};
    let succeededRequestCount = 0;
    let failedRequestCount = 0;

    const results = {} as Record<AnalyticsRequestKey, AnalyticsResult<never>>;
    ANALYTICS_REQUEST_KEYS.forEach((key, index) => {
        const outcome = settled[index];
        if (outcome.status === 'fulfilled') {
            succeededRequestCount += 1;
            results[key] = { status: 'ok', rows: outcome.value as never };
            return;
        }
        failedRequestCount += 1;
        const message: AnalyticsErrorCode =
            outcome.reason instanceof Error && outcome.reason.message === 'permission_denied'
                ? 'permission_denied'
                : 'analytics_unavailable';
        requestErrors[key] = message;
        results[key] = { status: 'error', message };
    });

    return {
        ...(results as unknown as Omit<
            DoctorAnalyticsData,
            'requestErrors' | 'succeededRequestCount' | 'failedRequestCount'
        >),
        requestErrors,
        succeededRequestCount,
        failedRequestCount,
    };
}

// On refresh a section that fails keeps the rows it last loaded successfully, flagged
// stale, so a transient failure does not wipe content the user is looking at.
export function mergeDoctorAnalytics(
    previous: DoctorAnalyticsData | null,
    next: DoctorAnalyticsData,
): DoctorAnalyticsData {
    if (!previous) return next;

    const merged = { ...next };
    ANALYTICS_REQUEST_KEYS.forEach(key => {
        const nextResult = next[key];
        const previousResult = previous[key];
        if (nextResult.status === 'error' && previousResult.status === 'ok') {
            (merged[key] as AnalyticsResult<unknown>) = {
                status: 'ok',
                rows: previousResult.rows,
                stale: true,
            };
        }
    });
    return merged;
}
