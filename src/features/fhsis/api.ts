import { supabase } from '../../lib/supabase/client';
import { isEditableTemplateValue } from './validation';
import { getFhsisTemplate } from './template';
import type {
    CreateFhsisReportInput,
    FhsisReport,
    FhsisReportContext,
    FhsisReportDetail,
    FhsisReportReview,
    FhsisReportStatus,
    FhsisReportValue,
    SaveFhsisReportValueInput,
} from './types';

type DatabaseReport = {
    id: string; report_type: 'm1-brgy'; template_version: string; reporting_month: string; barangay_name: string; bhs_name: string;
    municipality_city_name: string; province_name: string; projected_population: number; status: FhsisReportStatus; created_by: string;
    submitted_at: string | null; verified_by: string | null; verified_at: string | null; returned_at: string | null; created_at: string; updated_at: string;
};
type DatabaseValue = { id: string; report_id: string; indicator_key: string; dimension_key: string; value: number | null; remarks: string | null; updated_by: string; created_at: string; updated_at: string };
type DatabaseReview = { id: string; report_id: string; reviewer_id: string; action: FhsisReportReview['action']; reason: string | null; notes: string | null; created_at: string };

const reportColumns = 'id, report_type, template_version, reporting_month, barangay_name, bhs_name, municipality_city_name, province_name, projected_population, status, created_by, submitted_at, verified_by, verified_at, returned_at, created_at, updated_at';

function mapReport(row: DatabaseReport): FhsisReport {
    return { id: row.id, reportType: row.report_type, templateVersion: row.template_version, reportingMonth: row.reporting_month, barangayName: row.barangay_name, bhsName: row.bhs_name, municipalityCityName: row.municipality_city_name, provinceName: row.province_name, projectedPopulation: row.projected_population, status: row.status, createdBy: row.created_by, submittedAt: row.submitted_at, verifiedBy: row.verified_by, verifiedAt: row.verified_at, returnedAt: row.returned_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapValue(row: DatabaseValue): FhsisReportValue {
    return { id: row.id, reportId: row.report_id, indicatorKey: row.indicator_key, dimensionKey: row.dimension_key, value: row.value, remarks: row.remarks, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapReview(row: DatabaseReview): FhsisReportReview {
    return { id: row.id, reportId: row.report_id, reviewerId: row.reviewer_id, action: row.action, reason: row.reason, notes: row.notes, createdAt: row.created_at };
}

async function currentUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('You must be signed in to work with FHSIS reports.');
    return data.user.id;
}

export async function findFhsisReport(context: FhsisReportContext): Promise<FhsisReport | null> {
    const { data, error } = await supabase.from('fhsis_reports').select(reportColumns).eq('report_type', 'm1-brgy').eq('reporting_month', context.reportingMonth).eq('barangay_name', context.barangayName).eq('bhs_name', context.bhsName).maybeSingle();
    if (error) throw error;
    return data ? mapReport(data as DatabaseReport) : null;
}

export async function createFhsisReport(input: CreateFhsisReportInput): Promise<FhsisReport> {
    const createdBy = await currentUserId();
    const { data, error } = await supabase.from('fhsis_reports').insert({
        report_type: 'm1-brgy', template_version: 'v1', reporting_month: input.reportingMonth, barangay_name: input.barangayName,
        bhs_name: input.bhsName, municipality_city_name: input.municipalityCityName, province_name: input.provinceName,
        projected_population: input.projectedPopulation, created_by: createdBy,
    }).select(reportColumns).single();
    if (error) throw error;
    return mapReport(data as DatabaseReport);
}

export async function listFhsisReportHistory(): Promise<readonly FhsisReport[]> {
    const { data, error } = await supabase.from('fhsis_reports').select(reportColumns).order('reporting_month', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return (data as DatabaseReport[] | null ?? []).map(mapReport);
}

// PostgREST caps unbounded selects at its configured max row count (1000 by
// default). An M1 BRGY report can hold well over 1000 values, so this reads
// fhsis_report_values in successive .range() pages rather than one select.
const REPORT_VALUES_PAGE_SIZE = 1000;

async function fetchAllFhsisReportValues(reportId: string): Promise<DatabaseValue[]> {
    const rows: DatabaseValue[] = [];
    for (let from = 0; ; from += REPORT_VALUES_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('fhsis_report_values')
            .select('id, report_id, indicator_key, dimension_key, value, remarks, updated_by, created_at, updated_at')
            .eq('report_id', reportId)
            .order('created_at')
            .range(from, from + REPORT_VALUES_PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...((data as DatabaseValue[] | null) ?? []));
        if (!data || data.length < REPORT_VALUES_PAGE_SIZE) break;
    }
    return rows;
}

export async function loadFhsisReport(reportId: string): Promise<FhsisReportDetail | null> {
    const [reportResult, values, reviewsResult] = await Promise.all([
        supabase.from('fhsis_reports').select(reportColumns).eq('id', reportId).maybeSingle(),
        fetchAllFhsisReportValues(reportId),
        supabase.from('fhsis_report_reviews').select('id, report_id, reviewer_id, action, reason, notes, created_at').eq('report_id', reportId).order('created_at'),
    ]);
    if (reportResult.error) throw reportResult.error;
    if (reviewsResult.error) throw reviewsResult.error;
    if (!reportResult.data) return null;
    return { report: mapReport(reportResult.data as DatabaseReport), values: values.map(mapValue), reviews: (reviewsResult.data as DatabaseReview[] | null ?? []).map(mapReview) };
}

export async function saveFhsisReportValue(input: SaveFhsisReportValueInput): Promise<void> {
    const report = await loadFhsisReport(input.reportId);
    if (!report) throw new Error('FHSIS report not found.');
    const template = getFhsisTemplate(report.report.reportType, report.report.templateVersion);
    if (!isEditableTemplateValue(template, input.indicatorKey, input.dimensionKey)) throw new Error('This FHSIS value is not an editable template field.');
    if (input.value !== null && (!Number.isInteger(input.value) || input.value < 0)) throw new Error('FHSIS values must be non-negative whole numbers.');

    const updatedBy = await currentUserId();
    const { error } = await supabase.from('fhsis_report_values').upsert({
        report_id: input.reportId, indicator_key: input.indicatorKey, dimension_key: input.dimensionKey, value: input.value,
        remarks: input.remarks?.trim() || null, updated_by: updatedBy,
    }, { onConflict: 'report_id,indicator_key,dimension_key' });
    if (error) throw error;
}

export async function submitFhsisReport(reportId: string): Promise<void> {
    const { error } = await supabase.rpc('submit_fhsis_report', { p_report_id: reportId });
    if (error) throw error;
}
export async function returnFhsisReport(reportId: string, reason: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('return_fhsis_report', { p_report_id: reportId, p_reason: reason, p_notes: notes ?? null });
    if (error) throw error;
}
export async function verifyFhsisReport(reportId: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('verify_fhsis_report', { p_report_id: reportId, p_notes: notes ?? null });
    if (error) throw error;
}

export interface FhsisStaffProfile {
    fullName: string | null;
    role: string | null;
}

/**
 * Resolves a staff member's display name/role for a given user id, reusing
 * the same `profiles` table already used elsewhere in the app (see
 * src/lib/auth/roles.ts and the Admin user list) to turn a raw user id into
 * something a Nurse or Midwife can read. Returns null on any failure (e.g.
 * RLS denies reading another user's profile) so callers can fall back
 * gracefully instead of surfacing a raw id.
 */
export async function getFhsisStaffProfile(userId: string | null): Promise<FhsisStaffProfile | null> {
    if (!userId) return null;
    try {
        const { data, error } = await supabase.from('profiles').select('full_name, role').eq('id', userId).maybeSingle();
        if (error || !data) return null;
        return { fullName: (data as { full_name: string | null }).full_name ?? null, role: (data as { role: string | null }).role ?? null };
    } catch {
        return null;
    }
}
