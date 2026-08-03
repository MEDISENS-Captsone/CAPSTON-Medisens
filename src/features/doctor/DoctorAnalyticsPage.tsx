import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Icon } from '../../components/shared/Icon';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import malvarBarangaysGeoJsonRaw from '../../assets/geo/malvar-barangays.geojson?raw';
import { fetchBarangayDrilldown, fetchDoctorAnalytics, fetchStaffOperationsAnalytics, mergeDoctorAnalytics } from './doctorAnalyticsService';
import type { AnalyticsBucket, AnalyticsErrorCode, AnalyticsPeriod, AnalyticsResult, AnalyticsRow, BarangayHeatmapRow, DoctorAnalyticsData, StaffOperationsAnalyticsRow, StaffOperationsRole } from './doctorAnalyticsService';

type PresetKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type AnalyticsWorkspaceRole = 'doctor' | 'midwives';
type AnalyticsView = 'clinical' | 'geographic' | 'staff';
type WorkloadChartVariant = 'followup' | 'lab' | 'prescription';
type BarangayHeatmapMetric = 'registered' | 'consultations' | 'pendingFollowUps' | 'vaccinations';
type GeoPosition = [number, number];
type GeoRing = GeoPosition[];
type GeoPolygon = GeoRing[];
type GeoMultiPolygon = GeoPolygon[];
type BarangayGeometry = { type: 'Polygon'; coordinates: GeoPolygon } | { type: 'MultiPolygon'; coordinates: GeoMultiPolygon };
type BarangayBoundaryFeature = {
    type: 'Feature';
    geometry: BarangayGeometry;
    properties: { adm4_en: string };
    id?: string | number;
};
type ProjectedPath = BarangayBoundaryFeature & { path: string };

const PRESETS: Array<{ key: PresetKey; label: string; bucket: AnalyticsBucket }> = [
    { key: 'today', label: 'Today', bucket: 'day' },
    { key: 'week', label: 'This Week', bucket: 'day' },
    { key: 'month', label: 'This Month', bucket: 'day' },
    { key: 'quarter', label: 'This Quarter', bucket: 'week' },
    { key: 'year', label: 'This Year', bucket: 'month' },
];

// Registered Patients is an all-time active-patient metric by definition and is sourced
// from analytics_barangay_distribution. The activity metrics are scoped to the selected
// period and come from analytics_barangay_heatmap. The two sources are never mixed.
type BarangayMetricScope = 'all-time' | 'period';

const BARANGAY_HEATMAP_METRICS: Array<{
    key: BarangayHeatmapMetric;
    label: string;
    field: keyof Pick<BarangayHeatmapRow, 'registered_patients' | 'consultations' | 'pending_follow_ups' | 'vaccinations'>;
    valueLabel: string;
    scope: BarangayMetricScope;
    scopeLabel: string;
    scopeDescription: string;
}> = [
    {
        key: 'registered', label: 'Registered Patients', field: 'registered_patients', valueLabel: 'registered patients',
        scope: 'all-time', scopeLabel: 'All-time',
        scopeDescription: 'All-time active patient distribution by barangay.',
    },
    {
        key: 'consultations', label: 'Consultations', field: 'consultations', valueLabel: 'consultations',
        scope: 'period', scopeLabel: 'Selected period',
        scopeDescription: 'Consultations recorded in the selected period, by barangay.',
    },
    {
        key: 'pendingFollowUps', label: 'Pending Follow-ups', field: 'pending_follow_ups', valueLabel: 'pending follow-ups',
        scope: 'period', scopeLabel: 'Selected period',
        scopeDescription: 'Pending follow-ups recorded in the selected period, by barangay.',
    },
    {
        key: 'vaccinations', label: 'Vaccinations', field: 'vaccinations', valueLabel: 'vaccinations',
        scope: 'period', scopeLabel: 'Selected period',
        scopeDescription: 'Vaccinations recorded in the selected period, by barangay.',
    },
];

const EMPTY_PERIOD_METRIC_MESSAGE = 'No activity recorded for the selected period.';

const ANALYTICS_VIEWS: Array<{ key: AnalyticsView; label: string; roles: readonly AnalyticsWorkspaceRole[] }> = [
    { key: 'clinical', label: 'Clinical Analytics', roles: ['doctor', 'midwives'] },
    { key: 'geographic', label: 'Geographic Analytics', roles: ['doctor', 'midwives'] },
    { key: 'staff', label: 'Staff Operations', roles: ['doctor'] },
];

const DEFAULT_ANALYTICS_VIEW: AnalyticsView = 'clinical';

function getAllowedViews(role: AnalyticsWorkspaceRole): AnalyticsView[] {
    return ANALYTICS_VIEWS.filter(view => view.roles.includes(role)).map(view => view.key);
}

function resolveAnalyticsView(value: string | null, role: AnalyticsWorkspaceRole): AnalyticsView {
    const allowed = getAllowedViews(role);
    const candidate = (value ?? '').trim().toLowerCase() as AnalyticsView;
    return allowed.includes(candidate) ? candidate : DEFAULT_ANALYTICS_VIEW;
}

function readViewFromLocation(role: AnalyticsWorkspaceRole): AnalyticsView {
    if (typeof window === 'undefined') return DEFAULT_ANALYTICS_VIEW;
    return resolveAnalyticsView(new URLSearchParams(window.location.search).get('view'), role);
}

function writeViewToLocation(view: AnalyticsView, mode: 'push' | 'replace') {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === view && mode === 'push') return;
    params.set('view', view);
    const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    if (mode === 'push') window.history.pushState({}, '', url);
    else window.history.replaceState({}, '', url);
}

function isoDate(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

const DEFAULT_PRESET: PresetKey = 'month';
const PRESET_KEYS: readonly PresetKey[] = ['today', 'week', 'month', 'quarter', 'year', 'custom'];

interface PeriodSelection {
    preset: PresetKey;
    customFrom: string;
    customTo: string;
}

// The date inputs and the ?to= parameter are both inclusive; only the RPC boundary is
// exclusive. This converts the internal exclusive bound back for display and URL use.
function inclusiveEndDate(toExclusive: string): string {
    const parsed = parseLocalDate(toExclusive);
    return parsed ? isoDate(addDays(parsed, -1)) : toExclusive;
}

function defaultPeriodSelection(): PeriodSelection {
    const fallback = getPresetPeriod(DEFAULT_PRESET);
    return {
        preset: DEFAULT_PRESET,
        customFrom: fallback.from,
        customTo: inclusiveEndDate(fallback.toExclusive),
    };
}

// Unknown presets, malformed or reversed dates, and ranges beyond 366 days all normalize
// to the default Month period. getCustomPeriod already rejects the last two cases.
function resolvePeriodSelection(
    presetValue: string | null,
    fromValue: string | null,
    toValue: string | null,
): PeriodSelection {
    const fallback = defaultPeriodSelection();
    const candidate = (presetValue ?? '').trim().toLowerCase() as PresetKey;
    if (!PRESET_KEYS.includes(candidate)) return fallback;
    if (candidate !== 'custom') return { ...fallback, preset: candidate };
    if (!fromValue || !toValue) return fallback;
    if (!getCustomPeriod(fromValue, toValue)) return fallback;
    return { preset: 'custom', customFrom: fromValue, customTo: toValue };
}

function readPeriodSelectionFromLocation(): PeriodSelection {
    if (typeof window === 'undefined') return defaultPeriodSelection();
    const params = new URLSearchParams(window.location.search);
    return resolvePeriodSelection(params.get('preset'), params.get('from'), params.get('to'));
}

// Period changes always replaceState. Pushing them would bury the previous tab under one
// history entry per preset click, so back/forward stays reserved for tab navigation.
function writePeriodToLocation(selection: PeriodSelection) {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('preset', selection.preset);
    if (selection.preset === 'custom') {
        params.set('from', selection.customFrom);
        params.set('to', selection.customTo);
    } else {
        params.delete('from');
        params.delete('to');
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function buildPeriod(from: Date, toExclusive: Date, bucket: AnalyticsBucket): AnalyticsPeriod {
    return { from: isoDate(from), toExclusive: isoDate(toExclusive), bucket };
}

function getPresetPeriod(preset: PresetKey, now = new Date()): AnalyticsPeriod {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = today;
    let toExclusive = addDays(today, 1);
    let bucket: AnalyticsBucket = 'day';

    if (preset === 'week') {
        const day = today.getDay();
        const offset = day === 0 ? 6 : day - 1;
        from = addDays(today, -offset);
        toExclusive = addDays(from, 7);
    } else if (preset === 'month') {
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        toExclusive = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    } else if (preset === 'quarter') {
        const quarterMonth = Math.floor(today.getMonth() / 3) * 3;
        from = new Date(today.getFullYear(), quarterMonth, 1);
        toExclusive = new Date(today.getFullYear(), quarterMonth + 3, 1);
        bucket = 'week';
    } else if (preset === 'year') {
        from = new Date(today.getFullYear(), 0, 1);
        toExclusive = new Date(today.getFullYear() + 1, 0, 1);
        bucket = 'month';
    }

    return buildPeriod(from, toExclusive, bucket);
}

function parseLocalDate(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
}

function getCustomPeriod(fromValue: string, toValue: string): AnalyticsPeriod | null {
    const from = parseLocalDate(fromValue);
    const toInclusive = parseLocalDate(toValue);
    if (!from || !toInclusive) return null;
    const toExclusive = addDays(toInclusive, 1);
    const days = Math.round((toExclusive.getTime() - from.getTime()) / 86400000);
    if (days <= 0 || days > 366) return null;
    const bucket: AnalyticsBucket = days > 120 ? 'month' : days > 31 ? 'week' : 'day';
    return buildPeriod(from, toExclusive, bucket);
}

function sumCurrent(rows: AnalyticsRow[], predicate?: (row: AnalyticsRow) => boolean): number {
    return rows.reduce((sum, row) => {
        if (predicate && !predicate(row)) return sum;
        return sum + (row.current_count ?? 0);
    }, 0);
}

function titleCase(value: string | null): string {
    if (!value) return 'Unspecified';
    return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalizeBarangayKey(value: string | null | undefined): string {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function statusMatches(value: string, patterns: string[]): boolean {
    return patterns.some(pattern => value.includes(pattern));
}

function reliabilityTone(value: string | null): 'green' | 'amber' | 'slate' {
    if (value === 'Reliable') return 'green';
    if (value === 'Partially Reliable') return 'amber';
    return 'slate';
}

function sumPrevious(rows: AnalyticsRow[], predicate?: (row: AnalyticsRow) => boolean): number {
    return rows.reduce((sum, row) => {
        if (predicate && !predicate(row)) return sum;
        return sum + (row.previous_count ?? 0);
    }, 0);
}

function formatDelta(current: number, previous: number): string {
    if (previous === 0) return current === 0 ? 'No change' : 'New activity';
    const percent = Math.round(((current - previous) / previous) * 100);
    if (percent === 0) return 'No change';
    return `${percent > 0 ? '+' : ''}${percent}% vs previous`;
}

function deltaTone(current: number, previous: number): 'up' | 'down' | 'flat' {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'flat';
}

function analyticsErrorText(code: AnalyticsErrorCode): string {
    return code === 'permission_denied'
        ? 'Analytics access is limited to authorized clinical analytics accounts.'
        : healthcareErrorMessage('load analytics');
}

// Localized failure notice for a single panel. Distinct from EmptyState: this means the
// request failed, not that there are no records.
function DataUnavailable({ code, onRetry, isRetrying }: { code: AnalyticsErrorCode; onRetry?: () => void; isRetrying?: boolean }) {
    return (
        <div className="doctor-analytics-inline-alert m-4" role="alert">
            <Icon name="alert-triangle" className="h-4 w-4" />
            <span>{analyticsErrorText(code)}</span>
            {onRetry && code !== 'permission_denied' && (
                <button type="button" className="clinical-filter-button" onClick={onRetry} disabled={isRetrying}>
                    {isRetrying ? 'Retrying' : 'Retry'}
                </button>
            )}
        </div>
    );
}

// Shown when a refresh failed but the previous rows are still on screen, so retained
// content is never mistaken for a fresh reading.
function StaleNotice() {
    return (
        <p className="doctor-stale-notice" role="status">
            Last refresh failed. Showing previously loaded data.
        </p>
    );
}

// Panels that read several requests fail as a unit: if any source failed, the panel
// cannot show a truthful total, so it reports the failure instead of a partial sum.
function combineResults<T>(...results: Array<AnalyticsResult<T[]>>): AnalyticsResult<T[]> {
    const failed = results.find(result => result.status === 'error');
    if (failed && failed.status === 'error') return failed;
    const rows = results.flatMap(result => (result.status === 'ok' ? result.rows : []));
    const stale = results.some(result => result.status === 'ok' && result.stale);
    return stale ? { status: 'ok', rows, stale } : { status: 'ok', rows };
}

function renderResult<T>(
    result: AnalyticsResult<T>,
    render: (rows: T) => React.ReactNode,
    onRetry?: () => void,
    isRetrying?: boolean,
): React.ReactNode {
    if (result.status === 'error') {
        return <DataUnavailable code={result.message} onRetry={onRetry} isRetrying={isRetrying} />;
    }
    return (
        <>
            {result.stale && <StaleNotice />}
            {render(result.rows)}
        </>
    );
}

function MetricCard({ label, value, note, comparison, tone = 'flat' }: { label: string; value: number | null; note: string; comparison?: string; tone?: 'up' | 'down' | 'flat' }) {
    return (
        <div className="doctor-insight-card">
            <div className="doctor-insight-topline">
                <div className="doctor-insight-label">{label}</div>
                {comparison && <span className={`doctor-comparison-badge is-${tone}`}>{comparison}</span>}
            </div>
            <div className="doctor-insight-value tabular-nums">{value === null ? 'Unavailable' : value.toLocaleString()}</div>
            <div className="doctor-insight-note">{value === null ? 'This metric could not be loaded' : note}</div>
        </div>
    );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="doctor-analytics-section-heading">
            <h2>{title}</h2>
            <p>{subtitle}</p>
        </div>
    );
}

function SectionPanel({ title, subtitle, children, className = '' }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={`ops-panel doctor-dashboard-card min-w-0 ${className}`}>
            <div className="ops-panel-header">
                <div className="min-w-0">
                    <h2 className="ops-panel-title">{title}</h2>
                    <p className="ops-panel-subtitle">{subtitle}</p>
                </div>
            </div>
            {children}
        </section>
    );
}

// Mirrors the completed-vs-pending status bar: head, bar, two legend items.
function StatusBarSkeleton() {
    return (
        <div className="doctor-status-bar-chart" aria-hidden="true">
            <div className="doctor-status-bar-head">
                <div>
                    <Skeleton className="clinical-skeleton-line w-24" />
                    <Skeleton className="mt-2 h-6 w-16" />
                </div>
                <Skeleton className="h-6 w-12" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="doctor-status-bar-legend">
                <Skeleton className="clinical-skeleton-line w-full" />
                <Skeleton className="clinical-skeleton-line w-full" />
            </div>
        </div>
    );
}

function ClinicalAnalyticsSkeleton() {
    return (
        <>
            <section aria-label="Loading analytics summary" className="doctor-kpi-strip">
                {[0, 1, 2, 3].map(item => (
                    <div className="doctor-insight-card" key={item} aria-hidden="true">
                        <Skeleton className="clinical-skeleton-line w-28" />
                        <Skeleton className="mt-4 h-9 w-16" />
                        <Skeleton className="clinical-skeleton-line mt-4 w-32" />
                    </div>
                ))}
            </section>

            <section aria-label="Loading primary analytics insights" className="doctor-analytics-section">
                <SectionHeading title="Primary Insight" subtitle="Preparing service activity and current workload." />
                <div className="doctor-primary-grid">
                    <div className="doctor-primary-chart">
                        <SectionPanel title="Service Trend" subtitle="Preparing consultation trend.">
                            <div className="doctor-analytics-chart-skeleton" aria-hidden="true">
                                <Skeleton className="h-full w-full" />
                            </div>
                        </SectionPanel>
                    </div>
                    <div className="doctor-primary-side">
                        <SectionPanel title="Most Frequent Concern" subtitle="Preparing concern summary.">
                            <div className="doctor-signal-stack">
                                <Skeleton className="h-16 w-full" />
                            </div>
                        </SectionPanel>
                    </div>
                </div>
            </section>

            <section aria-label="Loading operational workload" className="doctor-analytics-section">
                <SectionHeading title="Operational Workload" subtitle="Preparing service status mixes." />
                <div className="doctor-operational-grid">
                    <SectionPanel title="Follow-up Completion" subtitle="Preparing follow-up status.">
                        <StatusBarSkeleton />
                    </SectionPanel>
                    <SectionPanel title="Lab Request Status" subtitle="Preparing lab status.">
                        <StatusBarSkeleton />
                    </SectionPanel>
                    <SectionPanel title="Prescription Status" subtitle="Preparing prescription status.">
                        <StatusBarSkeleton />
                    </SectionPanel>
                </div>
            </section>

            <section aria-label="Loading clinical insights" className="doctor-analytics-section">
                <SectionHeading title="Clinical Insights" subtitle="Preparing recorded diagnoses." />
                <div className="doctor-clinical-grid">
                    <SectionPanel title="Top Diagnoses" subtitle="Preparing diagnosis distribution.">
                        <div className="doctor-diagnosis-donut-layout" aria-hidden="true">
                            <Skeleton className="doctor-diagnosis-donut-skeleton" />
                            <div className="doctor-diagnosis-legend-skeleton">
                                {[0, 1, 2, 3, 4].map(row => (
                                    <Skeleton className="h-9 w-full" key={row} />
                                ))}
                            </div>
                        </div>
                    </SectionPanel>
                </div>
            </section>

            <section aria-label="Loading detailed records" className="doctor-analytics-section">
                <SectionHeading title="Detailed Records" subtitle="Preparing aggregate tables." />
                <SectionPanel title="Details" subtitle="Preparing supporting tables.">
                    <div className="doctor-analytics-tabs" aria-hidden="true">
                        {[0, 1, 2].map(item => <Skeleton className="h-8 w-32" key={item} />)}
                    </div>
                    <div className="doctor-detail-panel" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map(row => (
                            <Skeleton className="clinical-skeleton-line mt-3 w-full" key={row} />
                        ))}
                    </div>
                </SectionPanel>
            </section>
        </>
    );
}

function GeographicAnalyticsSkeleton() {
    return (
        <section aria-label="Loading geographic insights" className="doctor-analytics-section">
            <SectionHeading title="Geographic Insights" subtitle="Preparing barangay distribution." />
            <div className="doctor-geographic-command">
                <div className="doctor-geographic-panel doctor-geographic-ranking-panel">
                    <Skeleton className="clinical-skeleton-line w-32" />
                    <div className="doctor-geographic-skeleton">
                        {[0, 1, 2, 3, 4].map(item => (
                            <div className="doctor-barangay-skeleton-row" key={item}>
                                <Skeleton className="h-7 w-7 rounded-full" />
                                <div className="min-w-0 flex-1">
                                    <Skeleton className="clinical-skeleton-line w-32" />
                                    <Skeleton className="clinical-skeleton-line mt-2 w-full" />
                                </div>
                                <Skeleton className="clinical-skeleton-line w-10" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="doctor-geographic-panel doctor-geographic-map-panel">
                    <Skeleton className="clinical-skeleton-line w-40" />
                    <div className="doctor-map-metric-selector" aria-hidden="true">
                        {[0, 1, 2, 3].map(item => <Skeleton className="h-7 w-24" key={item} />)}
                    </div>
                    <div className="doctor-map-skeleton-stage" aria-hidden="true">
                        <Skeleton className="h-full w-full" />
                    </div>
                    <Skeleton className="doctor-map-skeleton-legend" />
                </div>
                <div className="doctor-geographic-panel doctor-geographic-summary-panel">
                    <Skeleton className="clinical-skeleton-line w-36" />
                    <Skeleton className="mt-3 h-20 w-full" />
                    <div className="doctor-coverage-summary">
                        {[0, 1, 2, 3].map(item => <Skeleton className="h-16 w-full" key={item} />)}
                    </div>
                </div>
            </div>
        </section>
    );
}

function AnalyticsSkeleton({ view }: { view: AnalyticsView }) {
    return (
        <div className="doctor-analytics-content-shell" aria-live="polite" aria-busy="true">
            {view === 'geographic' ? <GeographicAnalyticsSkeleton /> : <ClinicalAnalyticsSkeleton />}
        </div>
    );
}

function SummaryRow({ label, value, note }: { label: string; value: number; note: string }) {
    return (
        <div className="doctor-analytics-summary-row">
            <div className="min-w-0">
                <div className="doctor-analytics-row-label">{label}</div>
                <div className="doctor-analytics-row-note">{note}</div>
            </div>
            <strong className="doctor-analytics-row-value tabular-nums">{value.toLocaleString()}</strong>
        </div>
    );
}

function formatBucketDate(value: string | null, bucket: AnalyticsBucket): string {
    if (!value) return 'Total';
    const parsed = parseLocalDate(value);
    if (!parsed) return value;
    return parsed.toLocaleDateString('en-PH', bucket === 'month'
        ? { month: 'short', year: '2-digit' }
        : { month: 'short', day: 'numeric' });
}

function safePercent(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
}

function chartPoint(index: number, value: number, count: number, axisMax: number) {
    const width = 100;
    const height = 100;
    const x = count <= 1 ? width / 2 : (index / (count - 1)) * width;
    const y = height - (value / axisMax) * height;
    return { x, y };
}

function svgPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function ServiceTrendChart({ rows, bucket }: { rows: AnalyticsRow[]; bucket: AnalyticsBucket }) {
    if (rows.length === 0) {
        return <EmptyState title="No consultation trend" description="No consultation aggregates were returned for this period." className="m-4" />;
    }

    const maxValue = Math.max(...rows.flatMap(row => [row.current_count ?? 0, row.previous_count ?? 0]), 1);
    const axisMax = Math.max(4, Math.ceil(maxValue / 4) * 4);
    const ticks = [axisMax, Math.round(axisMax * 0.75), Math.round(axisMax * 0.5), Math.round(axisMax * 0.25), 0];
    const currentPoints = rows.map((row, index) => chartPoint(index, row.current_count ?? 0, rows.length, axisMax));
    const previousPoints = rows.map((row, index) => chartPoint(index, row.previous_count ?? 0, rows.length, axisMax));
    const labelStride = rows.length > 12 ? Math.ceil(rows.length / 6) : rows.length > 7 ? 2 : 1;

    // role="group", not role="img": an img is an atomic leaf, which would hide the
    // focusable per-point labels below from screen readers.
    return (
        <div className="doctor-line-chart" role="group" aria-label="Consultations per bucket, current period compared with the same bucket in the previous period">
            <div className="doctor-line-legend">
                <span><i className="is-current" />Current period</span>
                <span><i className="is-previous" />Previous period, same bucket</span>
            </div>
            <div className="doctor-line-frame">
                <div className="doctor-line-y-axis" aria-hidden="true">
                    {ticks.map((tick, index) => <span key={`${tick}-${index}`} className="tabular-nums">{tick}</span>)}
                </div>
                <div className="doctor-line-plot">
                    <div className="doctor-line-grid" aria-hidden="true">{ticks.map((_, index) => <i key={index} />)}</div>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="doctor-line-svg" aria-hidden="true">
                        <path className="doctor-line-area" d={`${svgPath(currentPoints)} L 100 100 L 0 100 Z`} />
                        <path className="doctor-line-path is-previous" d={svgPath(previousPoints)} />
                        <path className="doctor-line-path is-current" d={svgPath(currentPoints)} />
                    </svg>
                    <div
                        className="doctor-line-hitpoints"
                        style={{ '--doctor-point-gap': `${100 / Math.max(rows.length - 1, 1)}%` } as React.CSSProperties}
                    >
                        {rows.map((row, index) => {
                            const current = row.current_count ?? 0;
                            const previous = row.previous_count ?? 0;
                            const point = currentPoints[index];
                            return (
                                <span
                                    key={`${row.bucket_start ?? 'period'}-${index}`}
                                    className="doctor-line-point"
                                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                                    tabIndex={0}
                                    role="img"
                                    data-value={`${formatBucketDate(row.bucket_start, bucket)}: ${current.toLocaleString()} current, ${previous.toLocaleString()} previous period`}
                                    aria-label={`${formatBucketDate(row.bucket_start, bucket)}: ${current.toLocaleString()} current, ${previous.toLocaleString()} previous period`}
                                />
                            );
                        })}
                    </div>
                    <div className="doctor-line-x-axis">
                        {rows.map((row, index) => (
                            <span
                                key={`${row.bucket_start ?? 'period'}-${index}`}
                                className={index % labelStride === 0 || index === rows.length - 1 ? '' : 'is-hidden'}
                                style={{ left: `${(index / Math.max(rows.length - 1, 1)) * 100}%` }}
                            >
                                {formatBucketDate(row.bucket_start, bucket)}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

const DIAGNOSIS_DONUT_COLORS = ['is-blue', 'is-green', 'is-amber', 'is-violet', 'is-slate'];

function DiagnosisDonutChart({ rows }: { rows: AnalyticsRow[] }) {
    const diagnoses = rows.slice(0, 5).map((row, index) => ({
        key: `${row.metric_key}-${row.dimension_key ?? 'all'}-${index}`,
        label: titleCase(row.dimension_key),
        value: row.current_count ?? 0,
        color: DIAGNOSIS_DONUT_COLORS[index],
    }));
    const total = diagnoses.reduce((sum, diagnosis) => sum + diagnosis.value, 0);
    const circumference = 2 * Math.PI * 45;
    let offset = 0;

    if (diagnoses.length === 0 || total === 0) {
        return <EmptyState title="No diagnosis aggregates" description="No diagnosis aggregates were returned for this period." className="m-4" />;
    }

    return (
        <div className="doctor-diagnosis-donut-layout">
            <figure className="doctor-diagnosis-donut-figure">
                <svg className="doctor-diagnosis-donut" viewBox="0 0 120 120" role="img" aria-label={`Top diagnoses distribution. ${total.toLocaleString()} total records.`}>
                    <circle className="doctor-diagnosis-donut-track" cx="60" cy="60" r="45" />
                    {diagnoses.map(diagnosis => {
                        const percentage = safePercent(diagnosis.value, total);
                        const segmentLength = (diagnosis.value / total) * circumference;
                        const segmentOffset = offset;
                        offset += segmentLength;
                        const detail = `${diagnosis.label}: ${diagnosis.value.toLocaleString()} records, ${percentage}% of the displayed top diagnoses`;
                        return (
                            <circle
                                key={diagnosis.key}
                                className={`doctor-diagnosis-donut-segment ${diagnosis.color}`}
                                cx="60"
                                cy="60"
                                r="45"
                                pathLength={circumference}
                                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                                strokeDashoffset={-segmentOffset}
                                tabIndex={0}
                                role="img"
                                aria-label={detail}
                            >
                                <title>{detail}</title>
                            </circle>
                        );
                    })}
                    <text x="60" y="56" className="doctor-diagnosis-donut-total" textAnchor="middle">{total.toLocaleString()}</text>
                    <text x="60" y="68" className="doctor-diagnosis-donut-caption" textAnchor="middle">records</text>
                </svg>
                <figcaption>Top {diagnoses.length} diagnosis categories in the selected period</figcaption>
            </figure>
            <ul className="doctor-diagnosis-legend" aria-label="Diagnosis chart legend">
                {diagnoses.map(diagnosis => {
                    const percentage = safePercent(diagnosis.value, total);
                    return (
                        <li key={diagnosis.key}>
                            <span className={`doctor-diagnosis-legend-swatch ${diagnosis.color}`} aria-hidden="true" />
                            <span className="doctor-diagnosis-legend-label">{diagnosis.label}</span>
                            <strong className="tabular-nums">{diagnosis.value.toLocaleString()}</strong>
                            <span className="doctor-diagnosis-legend-percent tabular-nums">{percentage}%</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function isCoordinatePair(value: unknown): value is GeoPosition {
    return Array.isArray(value)
        && value.length >= 2
        && typeof value[0] === 'number'
        && typeof value[1] === 'number'
        && Number.isFinite(value[0])
        && Number.isFinite(value[1]);
}

function isClosedRing(ring: unknown): ring is GeoRing {
    if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isCoordinatePair)) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1];
}

function isPolygonCoordinates(value: unknown): value is GeoPolygon {
    return Array.isArray(value) && value.length > 0 && value.every(isClosedRing);
}

function isMultiPolygonCoordinates(value: unknown): value is GeoMultiPolygon {
    return Array.isArray(value) && value.length > 0 && value.every(isPolygonCoordinates);
}

function validateMalvarBarangayBoundaries(value: unknown): BarangayBoundaryFeature[] {
    if (!value || typeof value !== 'object') return [];
    const collection = value as { type?: unknown; features?: unknown };
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return [];

    const features: BarangayBoundaryFeature[] = [];
    for (const item of collection.features) {
        if (!item || typeof item !== 'object') return [];
        const feature = item as { type?: unknown; geometry?: unknown; properties?: unknown; id?: string | number };
        if (feature.type !== 'Feature' || !feature.geometry || typeof feature.geometry !== 'object') return [];

        const geometry = feature.geometry as { type?: unknown; coordinates?: unknown };
        const properties = feature.properties as { adm4_en?: unknown } | null;
        if (!properties || typeof properties.adm4_en !== 'string' || normalizeBarangayKey(properties.adm4_en) === '') return [];

        if (geometry.type === 'Polygon' && isPolygonCoordinates(geometry.coordinates)) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: geometry.coordinates },
                properties: { adm4_en: properties.adm4_en.trim().replace(/\s+/g, ' ') },
                id: feature.id,
            });
        } else if (geometry.type === 'MultiPolygon' && isMultiPolygonCoordinates(geometry.coordinates)) {
            features.push({
                type: 'Feature',
                geometry: { type: 'MultiPolygon', coordinates: geometry.coordinates },
                properties: { adm4_en: properties.adm4_en.trim().replace(/\s+/g, ' ') },
                id: feature.id,
            });
        } else {
            return [];
        }
    }

    return features;
}

function parseGeoJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

const MALVAR_BARANGAY_BOUNDARIES = validateMalvarBarangayBoundaries(parseGeoJson(malvarBarangaysGeoJsonRaw));
const MALVAR_MAP_VIEWBOX = { width: 1000, height: 680, padding: 24 };

function polygonList(geometry: BarangayGeometry): GeoPolygon[] {
    return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function getBoundaryBounds(features: BarangayBoundaryFeature[]) {
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    for (const feature of features) {
        for (const polygon of polygonList(feature.geometry)) {
            for (const ring of polygon) {
                for (const [lon, lat] of ring) {
                    minLon = Math.min(minLon, lon);
                    maxLon = Math.max(maxLon, lon);
                    minLat = Math.min(minLat, lat);
                    maxLat = Math.max(maxLat, lat);
                }
            }
        }
    }

    return { minLon, maxLon, minLat, maxLat };
}

function buildProjectedPaths(features: BarangayBoundaryFeature[]): ProjectedPath[] {
    if (features.length === 0) return [];
    const { minLon, maxLon, minLat, maxLat } = getBoundaryBounds(features);
    const drawableWidth = MALVAR_MAP_VIEWBOX.width - MALVAR_MAP_VIEWBOX.padding * 2;
    const drawableHeight = MALVAR_MAP_VIEWBOX.height - MALVAR_MAP_VIEWBOX.padding * 2;
    const lonRange = Math.max(maxLon - minLon, 0.000001);
    const latRange = Math.max(maxLat - minLat, 0.000001);
    const scale = Math.min(drawableWidth / lonRange, drawableHeight / latRange);
    const offsetX = (MALVAR_MAP_VIEWBOX.width - lonRange * scale) / 2;
    const offsetY = (MALVAR_MAP_VIEWBOX.height - latRange * scale) / 2;

    return features.map(feature => {
        const path = polygonList(feature.geometry).map(polygon => (
            polygon.map(ring => ring.map(([lon, lat], index) => {
                const x = offsetX + (lon - minLon) * scale;
                const y = offsetY + (maxLat - lat) * scale;
                return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
            }).join(' ') + ' Z').join(' ')
        )).join(' ');
        return { ...feature, path };
    });
}

const PROJECTED_MALVAR_BARANGAYS = buildProjectedPaths(MALVAR_BARANGAY_BOUNDARIES);
const BARANGAY_MAP_PALETTE = [
    '#5A81FA',
    '#6F8DFA',
    '#8399F5',
    '#7380D6',
    '#4D59BE',
    '#2B318A',
    '#7A8EE4',
    '#9CA9F2',
    '#6372D2',
    '#4D67E6',
    '#869BFF',
    '#5660B8',
    '#7B82CC',
    '#A6B6FF',
    '#6678E8',
    '#3E459E',
];

function mapFillClass(count: number, maxCount: number): string {
    if (count <= 0 || maxCount <= 0) return 'is-empty';
    const ratio = count / maxCount;
    if (ratio >= 0.8) return 'is-highest';
    if (ratio >= 0.55) return 'is-high';
    if (ratio >= 0.3) return 'is-medium';
    return 'is-low';
}

function MalvarBarangayMap({
    boundaries,
    countsByKey,
    metricTotal,
    metricLabel,
    valueLabel,
    scopeLabel,
    emptyMessage,
    hasValues,
    selectedBarangay,
    onSelectBarangay,
}: {
    boundaries: ProjectedPath[];
    countsByKey: Map<string, number>;
    metricTotal: number;
    metricLabel: string;
    valueLabel: string;
    scopeLabel: string;
    emptyMessage: string;
    hasValues: boolean;
    selectedBarangay: string | null;
    onSelectBarangay: (barangay: string) => void;
}) {
    const [hoveredBarangay, setHoveredBarangay] = useState<string | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
    const maxCount = Math.max(...boundaries.map(feature => countsByKey.get(normalizeBarangayKey(feature.properties.adm4_en)) ?? 0), 0);
    const activeBarangay = hoveredBarangay ?? selectedBarangay ?? boundaries[0]?.properties.adm4_en ?? null;
    const activeCount = activeBarangay ? countsByKey.get(normalizeBarangayKey(activeBarangay)) ?? 0 : 0;
    const activePercent = safePercent(activeCount, metricTotal);
    const tooltipStyle = tooltipPosition
        ? {
            '--doctor-map-tooltip-x': `${tooltipPosition.x}px`,
            '--doctor-map-tooltip-y': `${tooltipPosition.y}px`,
        } as React.CSSProperties
        : undefined;

    function updateTooltipPosition(event: React.PointerEvent<SVGPathElement>) {
        const stage = event.currentTarget.closest('.doctor-map-stage');
        if (!(stage instanceof HTMLElement)) return;
        const rect = stage.getBoundingClientRect();
        const tooltipWidth = 188;
        const tooltipHeight = 92;
        const gutter = 12;
        const offset = 14;
        const x = Math.round(Math.min(Math.max(event.clientX - rect.left + offset, gutter), Math.max(gutter, rect.width - tooltipWidth - gutter)));
        const y = Math.round(Math.min(Math.max(event.clientY - rect.top + offset, gutter), Math.max(gutter, rect.height - tooltipHeight - gutter)));
        setTooltipPosition(previous => previous?.x === x && previous?.y === y ? previous : { x, y });
    }

    function clearTooltipIfLeavingBarangays(event: React.PointerEvent<SVGPathElement>) {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Element && nextTarget.closest('.doctor-map-barangay')) return;
        setHoveredBarangay(null);
        setTooltipPosition(null);
    }

    if (boundaries.length === 0) {
        return <MalvarMapPlaceholderContent />;
    }

    return (
        <div className="doctor-map-choropleth">
            <div className="doctor-map-stage">
                <svg
                    viewBox={`0 0 ${MALVAR_MAP_VIEWBOX.width} ${MALVAR_MAP_VIEWBOX.height}`}
                    className="doctor-malvar-map"
                    role="img"
                    aria-label={`Interactive Malvar barangay ${metricLabel.toLowerCase()} heatmap, ${scopeLabel.toLowerCase()}`}
                >
                    {boundaries.map((feature, index) => {
                        const barangay = feature.properties.adm4_en;
                        const key = normalizeBarangayKey(barangay);
                        const count = countsByKey.get(key) ?? 0;
                        const percent = safePercent(count, metricTotal);
                        const isSelected = normalizeBarangayKey(selectedBarangay) === key;
                        const mapStyle = {
                            '--doctor-map-base': BARANGAY_MAP_PALETTE[index % BARANGAY_MAP_PALETTE.length],
                        } as React.CSSProperties;
                        return (
                            <path
                                key={feature.id ?? barangay}
                                d={feature.path}
                                role="button"
                                tabIndex={0}
                                className={`doctor-map-barangay ${mapFillClass(count, maxCount)} ${isSelected ? 'is-selected' : ''}`}
                                style={mapStyle}
                                aria-label={`${barangay}: ${count.toLocaleString()} ${valueLabel}, ${percent}% of ${metricLabel.toLowerCase()}, ${scopeLabel.toLowerCase()}`}
                                onPointerEnter={(event) => {
                                    setHoveredBarangay(current => current === barangay ? current : barangay);
                                    updateTooltipPosition(event);
                                }}
                                onPointerMove={updateTooltipPosition}
                                onPointerLeave={clearTooltipIfLeavingBarangays}
                                onFocus={() => setHoveredBarangay(barangay)}
                                onBlur={() => {
                                    setHoveredBarangay(null);
                                    setTooltipPosition(null);
                                }}
                                onClick={() => onSelectBarangay(barangay)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onSelectBarangay(barangay);
                                    }
                                }}
                            />
                        );
                    })}
                </svg>
                {activeBarangay && (
                    <div className={`doctor-map-tooltip ${tooltipPosition ? 'is-floating' : ''}`} style={tooltipStyle} role="status" aria-live="polite">
                        <span>{activeBarangay}</span>
                        <strong className="tabular-nums">{activeCount.toLocaleString()}</strong>
                        <small className="tabular-nums">{activePercent}% of {metricLabel.toLowerCase()} &middot; {scopeLabel}</small>
                    </div>
                )}
                <div className="doctor-map-legend" aria-label={`Map color legend for ${metricLabel.toLowerCase()}, ${scopeLabel.toLowerCase()}`}>
                    <span>Low</span>
                    <i className="is-empty" />
                    <i className="is-low" />
                    <i className="is-medium" />
                    <i className="is-high" />
                    <i className="is-highest" />
                    <span>High</span>
                    <span className="doctor-map-legend-scope">{scopeLabel}</span>
                </div>
                {!hasValues && (
                    <p className="doctor-map-empty-note" role="status">{emptyMessage}</p>
                )}
            </div>
        </div>
    );
}

function MalvarMapPlaceholderContent() {
    return (
        <div className="doctor-map-placeholder-body">
            <div className="doctor-map-frame" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
            </div>
            <div>
                <strong>Map boundary unavailable</strong>
                <p>A valid local Malvar barangay boundary file is required before the interactive map can be rendered.</p>
            </div>
        </div>
    );
}

function metricTotal(rows: AnalyticsRow[], metricKey: string, dimensionKey?: string): number {
    return rows.reduce((sum, row) => {
        if (row.metric_key !== metricKey) return sum;
        if (dimensionKey && normalizeBarangayKey(row.dimension_key) !== normalizeBarangayKey(dimensionKey)) return sum;
        return sum + (row.current_count ?? 0);
    }, 0);
}

function metricRows(rows: AnalyticsRow[], metricKey: string): AnalyticsRow[] {
    return rows.filter(row => row.metric_key === metricKey && (row.current_count ?? 0) > 0);
}

function DrilldownMetric({ label, value, note }: { label: string; value: number; note?: string }) {
    return (
        <div className="doctor-geo-detail-metric">
            <span>{label}</span>
            <strong className="tabular-nums">{value.toLocaleString()}</strong>
            {note && <small>{note}</small>}
        </div>
    );
}

function GeographicDrilldownPanel({
    barangay,
    rows,
    isLoading,
    error,
}: {
    barangay: string | null;
    rows: AnalyticsRow[];
    isLoading: boolean;
    error: string | null;
}) {
    if (!barangay) {
        return (
            <SectionPanel title="Barangay Aggregate Detail" subtitle="Select a barangay from the map or ranking list.">
                <EmptyState title="No barangay selected" description="Choose a barangay to review aggregate service activity." className="m-4" />
            </SectionPanel>
        );
    }

    if (isLoading && rows.length === 0) {
        return (
            <SectionPanel title="Barangay Aggregate Detail" subtitle={`Preparing aggregate metrics for ${barangay}.`}>
                <div className="doctor-geo-detail-skeleton" aria-hidden="true">
                    {[0, 1, 2, 3].map(item => <Skeleton key={item} className="h-20 w-full" />)}
                    <Skeleton className="h-32 w-full" />
                </div>
            </SectionPanel>
        );
    }

    const registered = metricTotal(rows, 'barangay_registered_patients');
    const male = metricTotal(rows, 'barangay_sex_distribution', 'male');
    const female = metricTotal(rows, 'barangay_sex_distribution', 'female');
    const consultations = metricTotal(rows, 'barangay_consultations');
    const followUps = metricTotal(rows, 'barangay_follow_ups');
    const pendingFollowUps = metricTotal(rows, 'barangay_pending_follow_ups');
    const vaccinations = metricTotal(rows, 'barangay_vaccinations');
    const maternalCare = metricTotal(rows, 'barangay_maternal_care_records');
    const labRequests = metricTotal(rows, 'barangay_lab_requests');
    const prescriptions = metricTotal(rows, 'barangay_prescriptions');
    const ageRows = metricRows(rows, 'barangay_age_distribution');
    const topDiagnoses = metricRows(rows, 'barangay_top_diagnoses').slice(0, 5);
    const topComplaints = metricRows(rows, 'barangay_top_complaints').slice(0, 5);
    const suppressedDiagnoses = metricTotal(rows, 'barangay_suppressed_diagnoses');
    const suppressedComplaints = metricTotal(rows, 'barangay_suppressed_complaints');
    const maxAge = Math.max(...ageRows.map(row => row.current_count ?? 0), 1);
    const maxClinical = Math.max(...[...topDiagnoses, ...topComplaints].map(row => row.current_count ?? 0), 1);

    return (
        <SectionPanel title="Barangay Aggregate Detail" subtitle={`${barangay} aggregate-only drill-down for the selected period.`}>
            <div className="doctor-geo-detail-panel">
                {isLoading && <div className="doctor-geo-detail-updating" role="status">Updating</div>}
                {error && (
                    <div className="doctor-geo-detail-error" role="alert">
                        {error}
                    </div>
                )}
                <div className="doctor-geo-detail-metrics">
                    <DrilldownMetric label="Registered Patients" value={registered} note="active records" />
                    <DrilldownMetric label="Male" value={male} />
                    <DrilldownMetric label="Female" value={female} />
                    <DrilldownMetric label="Consultations" value={consultations} note="selected period" />
                    <DrilldownMetric label="Follow-ups" value={followUps} note={`${pendingFollowUps.toLocaleString()} pending`} />
                    <DrilldownMetric label="Vaccinations" value={vaccinations} note="records counted" />
                    <DrilldownMetric label="Maternal Care" value={maternalCare} note="records" />
                    <DrilldownMetric label="Lab Requests" value={labRequests} />
                    <DrilldownMetric label="Prescriptions" value={prescriptions} />
                </div>

                <div className="doctor-geo-detail-grid">
                    <div className="doctor-geo-detail-card">
                        <div className="doctor-geo-detail-card-title">Age-group Distribution</div>
                        {ageRows.length === 0 ? (
                            <p className="doctor-geo-detail-empty">No age-group aggregate data for this barangay.</p>
                        ) : (
                            <div className="doctor-geo-bars">
                                {ageRows.map(row => {
                                    const value = row.current_count ?? 0;
                                    return (
                                        <div className="doctor-geo-bar-row" key={row.dimension_key ?? 'unknown'}>
                                            <span>{titleCase(row.dimension_key)}</span>
                                            <i><b style={{ width: `${Math.max((value / maxAge) * 100, value ? 6 : 0)}%` }} /></i>
                                            <strong className="tabular-nums">{value.toLocaleString()}</strong>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="doctor-geo-detail-card">
                        <div className="doctor-geo-detail-card-title">Privacy-safe Clinical Signals</div>
                        <ClinicalSignalList title="Top Diagnoses" rows={topDiagnoses} maxValue={maxClinical} suppressedCount={suppressedDiagnoses} />
                        <ClinicalSignalList title="Top Complaints" rows={topComplaints} maxValue={maxClinical} suppressedCount={suppressedComplaints} />
                    </div>
                </div>
            </div>
        </SectionPanel>
    );
}

function ClinicalSignalList({ title, rows, maxValue, suppressedCount }: { title: string; rows: AnalyticsRow[]; maxValue: number; suppressedCount: number }) {
    return (
        <div className="doctor-geo-clinical-list">
            <div className="doctor-geo-clinical-heading">{title}</div>
            {rows.length === 0 ? (
                <p className="doctor-geo-detail-empty">No privacy-safe aggregate rows to show.</p>
            ) : (
                rows.map(row => {
                    const value = row.current_count ?? 0;
                    return (
                        <div className="doctor-geo-bar-row" key={`${row.metric_key}-${row.dimension_key}`}>
                            <span title={titleCase(row.dimension_key)}>{titleCase(row.dimension_key)}</span>
                            <i><b style={{ width: `${Math.max((value / maxValue) * 100, value ? 6 : 0)}%` }} /></i>
                            <strong className="tabular-nums">{value.toLocaleString()}</strong>
                        </div>
                    );
                })
            )}
            {suppressedCount > 0 && (
                <small className="doctor-geo-suppression-note">{suppressedCount.toLocaleString()} low-count categor{suppressedCount === 1 ? 'y' : 'ies'} hidden to protect patient privacy.</small>
            )}
        </div>
    );
}

function GeographicInsightsSection({
    distributionResult,
    heatmapResult,
    selectedHeatmapMetric,
    onSelectHeatmapMetric,
    drilldownRows,
    isDrilldownLoading,
    drilldownError,
    selectedBarangay,
    onSelectBarangay,
    onRetry,
    isRetrying,
}: {
    distributionResult: AnalyticsResult<AnalyticsRow[]>;
    heatmapResult: AnalyticsResult<BarangayHeatmapRow[]>;
    onRetry: () => void;
    isRetrying: boolean;
    selectedHeatmapMetric: BarangayHeatmapMetric;
    onSelectHeatmapMetric: (metric: BarangayHeatmapMetric) => void;
    drilldownRows: AnalyticsRow[];
    isDrilldownLoading: boolean;
    drilldownError: string | null;
    selectedBarangay: string | null;
    onSelectBarangay: (barangay: string) => void;
}) {
    const selectedMetric = BARANGAY_HEATMAP_METRICS.find(metric => metric.key === selectedHeatmapMetric) ?? BARANGAY_HEATMAP_METRICS[0];
    // Each metric names the one source it reads, so a failure in the other source does
    // not suppress a metric that loaded fine.
    const activeSourceResult = selectedMetric.scope === 'all-time' ? distributionResult : heatmapResult;
    const rows = distributionResult.status === 'ok' ? distributionResult.rows : [];
    const heatmapRows = heatmapResult.status === 'ok' ? heatmapResult.rows : [];
    const coverageDistribution = rows
        .filter(row => row.dimension_key && row.dimension_key !== 'Unspecified' && row.dimension_key !== 'Outside Malvar')
        .map(row => ({ label: titleCase(row.dimension_key), value: row.current_count ?? 0 }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const metricDistribution = heatmapRows
        .filter(row => row.barangay)
        .map(row => ({ label: titleCase(row.barangay), value: row[selectedMetric.field] ?? 0 }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    // Each metric reads from exactly one source. An empty period metric must never fall
    // back to the all-time distribution: that silently changes what the ranking means.
    const distribution = selectedMetric.scope === 'all-time' ? coverageDistribution : metricDistribution;
    const hasMetricValues = distribution.some(row => row.value > 0);
    const topRows = distribution.slice(0, 8);
    const metricTotal = distribution.reduce((sum, row) => sum + row.value, 0);
    const recognizedPatients = coverageDistribution.reduce((sum, row) => sum + row.value, 0);
    const unspecified = sumCurrent(rows, row => row.dimension_key === 'Unspecified');
    const outside = sumCurrent(rows, row => row.dimension_key === 'Outside Malvar');
    const totalActivePatients = recognizedPatients + unspecified + outside;
    const mappedCoverageRate = safePercent(recognizedPatients, totalActivePatients);
    const countsByBarangayKey = useMemo(() => {
        const counts = new Map<string, number>();
        for (const row of distribution) {
            const key = normalizeBarangayKey(row.label);
            if (!key) continue;
            counts.set(key, (counts.get(key) ?? 0) + row.value);
        }
        return counts;
    }, [distribution]);
    const maxValue = Math.max(...topRows.map(row => row.value), 1);
    const selected = selectedBarangay
        ? distribution.find(row => normalizeBarangayKey(row.label) === normalizeBarangayKey(selectedBarangay))
            ?? { label: selectedBarangay, value: countsByBarangayKey.get(normalizeBarangayKey(selectedBarangay)) ?? 0 }
        : topRows[0] ?? null;
    const coverageStyle = { '--doctor-coverage-rate': `${mappedCoverageRate}%` } as React.CSSProperties;

    return (
        <section aria-label="Geographic insights" className="doctor-analytics-section">
            <SectionHeading title="Geographic Insights" subtitle={selectedMetric.scopeDescription} />
            <div className="doctor-geographic-command">
                <div className="doctor-geographic-panel doctor-geographic-ranking-panel">
                    <div className="doctor-geographic-panel-heading">
                        <div>
                            <h3>{selectedMetric.label} by Barangay</h3>
                            <p>{selectedMetric.scopeLabel} ranking</p>
                        </div>
                    </div>
                    {activeSourceResult.status === 'error' ? (
                        <DataUnavailable code={activeSourceResult.message} onRetry={onRetry} isRetrying={isRetrying} />
                    ) : !hasMetricValues ? (
                        selectedMetric.scope === 'period' ? (
                            <EmptyState title="No activity in this period" description={EMPTY_PERIOD_METRIC_MESSAGE} className="m-4" />
                        ) : (
                            <EmptyState title="No barangay distribution" description="No all-time active patient distribution was returned." className="m-4" />
                        )
                    ) : (
                        <div className="doctor-barangay-chart">
                            {activeSourceResult.status === 'ok' && activeSourceResult.stale && <StaleNotice />}
                            <ol className="doctor-barangay-list">
                                {topRows.map((row, index) => {
                                    const percent = safePercent(row.value, metricTotal);
                                    const isSelected = selected?.label === row.label;
                                    return (
                                        <li key={row.label}>
                                            <button
                                                type="button"
                                                className={`doctor-barangay-row ${isSelected ? 'is-selected' : ''}`}
                                                onClick={() => onSelectBarangay(row.label)}
                                                aria-pressed={isSelected}
                                            >
                                                <span className="doctor-ranking-index tabular-nums">{index + 1}</span>
                                                <span className="doctor-barangay-main">
                                                    <span className="doctor-barangay-meta">
                                                        <span className="doctor-barangay-label" title={row.label}>{row.label}</span>
                                                        <strong className="tabular-nums">{row.value.toLocaleString()}</strong>
                                                    </span>
                                                    <span className="doctor-barangay-track" aria-hidden="true">
                                                        <span className={row.value > 0 ? 'is-nonzero' : ''} style={{ width: `${safePercent(row.value, maxValue)}%` }} />
                                                    </span>
                                                </span>
                                                <span className="doctor-barangay-percent tabular-nums">{percent}%</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    )}
                </div>

                <div className="doctor-geographic-panel doctor-geographic-map-panel">
                    <div className="doctor-geographic-panel-heading">
                        <div>
                            <h3>Malvar Barangay Map</h3>
                            <p>{selectedMetric.label} across Malvar barangays &middot; {selectedMetric.scopeLabel}</p>
                        </div>
                    </div>
                    <div className="doctor-map-placeholder">
                        <div className="doctor-map-metric-selector" role="group" aria-label="Barangay heatmap metric">
                            {BARANGAY_HEATMAP_METRICS.map(metric => (
                                <button
                                    key={metric.key}
                                    type="button"
                                    className={metric.key === selectedHeatmapMetric ? 'is-active' : ''}
                                    aria-pressed={metric.key === selectedHeatmapMetric}
                                    onClick={() => onSelectHeatmapMetric(metric.key)}
                                >
                                    {metric.label}
                                </button>
                            ))}
                        </div>
                        <MalvarBarangayMap
                            boundaries={PROJECTED_MALVAR_BARANGAYS}
                            countsByKey={countsByBarangayKey}
                            metricTotal={metricTotal}
                            metricLabel={selectedMetric.label}
                            valueLabel={selectedMetric.valueLabel}
                            scopeLabel={selectedMetric.scopeLabel}
                            emptyMessage={selectedMetric.scope === 'period' ? EMPTY_PERIOD_METRIC_MESSAGE : 'No all-time distribution available.'}
                            hasValues={hasMetricValues}
                            selectedBarangay={selectedBarangay}
                            onSelectBarangay={onSelectBarangay}
                        />
                    </div>
                </div>

                <div className="doctor-geographic-panel doctor-geographic-summary-panel">
                    <div className="doctor-geographic-panel-heading">
                        <div>
                            <h3>Geographic Summary</h3>
                            <p>All-time coverage and selected barangay</p>
                        </div>
                    </div>
                    {selected && (
                        <div className="doctor-barangay-selection" aria-live="polite">
                            <span>Selected barangay &middot; {selectedMetric.scopeLabel}</span>
                            <strong>{selected.label}</strong>
                            {hasMetricValues ? (
                                <div>
                                    <span><b className="tabular-nums">{selected.value.toLocaleString()}</b> {selectedMetric.valueLabel}</span>
                                    <span><b className="tabular-nums">{safePercent(selected.value, metricTotal)}%</b> of {selectedMetric.label.toLowerCase()}</span>
                                </div>
                            ) : (
                                <div>
                                    <span>{selectedMetric.scope === 'period' ? EMPTY_PERIOD_METRIC_MESSAGE : 'No all-time distribution available.'}</span>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="doctor-coverage-summary">
                        <div className="doctor-coverage-rate-card">
                            <div className="doctor-coverage-ring" style={coverageStyle} role="img" aria-label={`${mappedCoverageRate}% mapped coverage rate`}>
                                <div>
                                    <strong className="tabular-nums">{mappedCoverageRate}%</strong>
                                    <span>Mapped</span>
                                </div>
                            </div>
                            <div className="doctor-coverage-rate-copy">
                                <span>Mapped Coverage Rate</span>
                                <strong className="tabular-nums">{recognizedPatients.toLocaleString()} / {totalActivePatients.toLocaleString()}</strong>
                                <small>recognized barangay patients of total active registered patients (all-time)</small>
                            </div>
                        </div>
                        <div className="doctor-coverage-metric-grid">
                            <div className="doctor-coverage-metric">
                                <span>Barangays Represented (all-time)</span>
                                <strong className="tabular-nums">{coverageDistribution.filter(row => row.value > 0).length.toLocaleString()}</strong>
                            </div>
                            <div className="doctor-coverage-metric">
                                <span>Recognized Barangay Data</span>
                                <strong className="tabular-nums">{recognizedPatients.toLocaleString()}</strong>
                            </div>
                            <div className="doctor-coverage-metric">
                                <span>Unspecified Locations</span>
                                <strong className="tabular-nums">{unspecified.toLocaleString()}</strong>
                            </div>
                            <div className="doctor-coverage-metric">
                                <span>Outside Malvar</span>
                                <strong className="tabular-nums">{outside.toLocaleString()}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="doctor-geographic-detail-wrap">
                <GeographicDrilldownPanel barangay={selected?.label ?? selectedBarangay} rows={drilldownRows} isLoading={isDrilldownLoading} error={drilldownError} />
            </div>
        </section>
    );
}

function buildStatusRows(rows: AnalyticsRow[]) {
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
        if (!row.dimension_key) return acc;
        acc[row.dimension_key] = (acc[row.dimension_key] ?? 0) + (row.current_count ?? 0);
        return acc;
    }, {});
    const visibleRows = Object.entries(grouped)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    const total = visibleRows.reduce((sum, row) => sum + row.count, 0);

    return { visibleRows, total };
}

function summarizeWorkloadStatus(rows: AnalyticsRow[], variant: WorkloadChartVariant) {
    const { visibleRows, total } = buildStatusRows(rows);
    const completedPatterns = variant === 'prescription' ? ['dispensed', 'completed', 'complete'] : ['completed', 'complete', 'done'];
    const pendingPatterns = ['pending', 'open', 'scheduled', 'requested'];
    const completed = visibleRows.reduce((sum, row) => {
        const key = row.label.toLowerCase();
        return statusMatches(key, completedPatterns) ? sum + row.count : sum;
    }, 0);
    const pending = visibleRows.reduce((sum, row) => {
        const key = row.label.toLowerCase();
        return statusMatches(key, pendingPatterns) ? sum + row.count : sum;
    }, 0);
    const other = Math.max(total - completed - pending, 0);
    const completedPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const pendingPercent = total > 0 ? Math.round((pending / total) * 100) : 0;

    return { visibleRows, total, completed, pending, other, completedPercent, pendingPercent };
}

// One encoding for every completed-vs-pending status mix. Segment widths are the exact
// percentages, with no minimum-width padding, so the bar cannot overstate a small share.
function ServiceStatusBar({
    totalLabel,
    total,
    completedLabel,
    completed,
    completedPercent,
    pending,
    pendingPercent,
}: {
    totalLabel: string;
    total: number;
    completedLabel: string;
    completed: number;
    completedPercent: number;
    pending: number;
    pendingPercent: number;
}) {
    return (
        <div className="doctor-status-bar-chart">
            <div className="doctor-status-bar-head">
                <div>
                    <span>{totalLabel}</span>
                    <strong className="tabular-nums">{total.toLocaleString()}</strong>
                </div>
                <div className="doctor-status-bar-key">
                    <span>{completedLabel}</span>
                    <strong className="tabular-nums">{completedPercent}%</strong>
                </div>
            </div>
            <div
                className="doctor-status-bar"
                role="img"
                aria-label={`${total.toLocaleString()} total, ${completed.toLocaleString()} ${completedLabel.toLowerCase()} (${completedPercent}%), ${pending.toLocaleString()} pending (${pendingPercent}%)`}
            >
                <span className="is-completed" style={{ width: `${completedPercent}%` }} />
                <span className="is-pending" style={{ width: `${pendingPercent}%` }} />
            </div>
            <div className="doctor-status-bar-legend">
                <div className="doctor-status-bar-item is-completed">
                    <span>{completedLabel}</span>
                    <strong className="tabular-nums">{completed.toLocaleString()}</strong>
                    <small className="tabular-nums">{completedPercent}%</small>
                </div>
                <div className="doctor-status-bar-item is-pending">
                    <span>Pending</span>
                    <strong className="tabular-nums">{pending.toLocaleString()}</strong>
                    <small className="tabular-nums">{pendingPercent}%</small>
                </div>
            </div>
        </div>
    );
}

function PrescriptionStatusChart({ pending, dispensed }: { pending: number; dispensed: number }) {
    const total = pending + dispensed;
    if (total === 0) {
        return <EmptyState title="No prescription status" description="No prescription status counts were returned for this period." className="m-4" />;
    }

    return (
        <ServiceStatusBar
            totalLabel="Total Prescriptions"
            total={total}
            completedLabel="Dispensed"
            completed={dispensed}
            completedPercent={safePercent(dispensed, total)}
            pending={pending}
            pendingPercent={safePercent(pending, total)}
        />
    );
}

function FollowUpGauge({ rows }: { rows: AnalyticsRow[] }) {
    const { visibleRows, total, completed, pending, completedPercent, pendingPercent } = summarizeWorkloadStatus(rows, 'followup');
    if (visibleRows.length === 0 || total === 0) {
        return <EmptyState title="No follow-ups yet" description="No follow-up activity was returned for this period." className="m-4" />;
    }

    return (
        <ServiceStatusBar
            totalLabel="Total Follow-ups"
            total={total}
            completedLabel="Completed"
            completed={completed}
            completedPercent={completedPercent}
            pending={pending}
            pendingPercent={pendingPercent}
        />
    );
}

function LabStatusChart({ rows, emptyTitle }: { rows: AnalyticsRow[]; emptyTitle: string }) {
    const { visibleRows, total, completed, pending, completedPercent, pendingPercent } = summarizeWorkloadStatus(rows, 'lab');

    if (visibleRows.length === 0) {
        return <EmptyState title={emptyTitle} description="No status aggregates were returned for this period." className="m-4" />;
    }

    return (
        <ServiceStatusBar
            totalLabel="Total Requests"
            total={total}
            completedLabel="Completed"
            completed={completed}
            completedPercent={completedPercent}
            pending={pending}
            pendingPercent={pendingPercent}
        />
    );
}

type StaffCountMetricKey =
    | 'consultations_completed'
    | 'follow_ups_completed'
    | 'lab_requests_completed'
    | 'prescriptions_dispensed';
type StaffTurnaroundMetricKey = 'lab_turnaround_minutes' | 'prescription_turnaround_minutes';
type StaffChartMetric = 'count' | 'turnaround';

const STAFF_CATEGORIES: Array<{ key: StaffOperationsRole; label: string; subtitle: string }> = [
    { key: 'doctor', label: 'Doctor', subtitle: 'Consultations and follow-ups completed within the selected period.' },
    { key: 'laboratory', label: 'Laboratory', subtitle: 'Laboratory requests completed within the selected period.' },
    { key: 'pharmacist', label: 'Pharmacy', subtitle: 'Prescriptions dispensed within the selected period.' },
];

const STAFF_COUNT_METRICS: Record<StaffOperationsRole, Array<{ key: StaffCountMetricKey; label: string; note: string }>> = {
    doctor: [
        { key: 'consultations_completed', label: 'Consultations Completed', note: 'Completed in the selected period' },
        { key: 'follow_ups_completed', label: 'Follow-ups Completed', note: 'Follow-ups marked done in the period' },
    ],
    laboratory: [
        { key: 'lab_requests_completed', label: 'Lab Requests Completed', note: 'First completed result per request' },
    ],
    pharmacist: [
        { key: 'prescriptions_dispensed', label: 'Prescriptions Dispensed', note: 'Dispensed in the selected period' },
    ],
};

const STAFF_TURNAROUND_METRICS: Record<
    StaffOperationsRole,
    { key: StaffTurnaroundMetricKey; label: string; medianLabel: string } | null
> = {
    doctor: null,
    laboratory: {
        key: 'lab_turnaround_minutes',
        label: 'Lab Turnaround',
        medianLabel: 'Median turnaround from recorded request date',
    },
    pharmacist: {
        key: 'prescription_turnaround_minutes',
        label: 'Prescription Turnaround',
        medianLabel: 'Median turnaround from recorded prescription date',
    },
};

// Start fields are date-only values read as Asia/Manila local midnight, so turnaround is
// operationally approximate even though the backend statistics themselves are exact.
const TURNAROUND_APPROXIMATION_NOTE =
    'Turnaround starts from date-only recorded values interpreted as local midnight, so these durations are operationally approximate and are not exact staff response times.';

// role_total rows are grouped per bucket, so a single period-level median is still not
// available from the RPC. Per-bucket medians must never be combined into one figure;
// only an explicit period-level rollup row can supply it.
// Staff-scoped rows are never rendered and never counted. Bucket-level figures come from
// role_total rows and selected-period turnaround comes from period_total rows, so the
// scopes are never mixed or double-counted.
function roleTotalRows(rows: StaffOperationsAnalyticsRow[]): StaffOperationsAnalyticsRow[] {
    return rows.filter(row => row.aggregation_scope === 'role_total');
}

function findPeriodTotalRow(
    rows: StaffOperationsAnalyticsRow[],
    role: StaffOperationsRole,
    metricKey: StaffTurnaroundMetricKey,
): StaffOperationsAnalyticsRow | null {
    return rows.find(row =>
        row.aggregation_scope === 'period_total'
        && row.role_key === role
        && row.metric_key === metricKey) ?? null;
}

function staffRowsForMetric(
    rows: StaffOperationsAnalyticsRow[],
    role: StaffOperationsRole,
    metricKey: string,
): StaffOperationsAnalyticsRow[] {
    return rows.filter(row => row.role_key === role && row.metric_key === metricKey);
}

// Durations do not read on a count axis, where ticks land on arbitrary minute values.
// The axis is rounded up to four steps drawn from real time intervals instead.
const DURATION_AXIS_STEPS_MINUTES = [
    5, 10, 15, 30,
    60, 120, 180, 360, 720,
    1440, 2880, 4320, 10080, 20160, 43200,
];

function durationAxisMax(maxMinutes: number): number {
    const step = DURATION_AXIS_STEPS_MINUTES.find(candidate => candidate * 4 >= maxMinutes);
    if (step) return step * 4;
    // Beyond the ladder, round up to whole 30-day steps.
    const monthly = 43200;
    return Math.ceil(maxMinutes / (monthly * 4)) * monthly * 4;
}

function formatDurationMinutes(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes < 0) return '—';
    if (minutes < 60) return `${Math.round(minutes).toLocaleString()} min`;
    const hours = minutes / 60;
    if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
    const days = hours / 24;
    return `${days.toFixed(days < 10 ? 1 : 0)} days`;
}


function sumStaffCount(rows: StaffOperationsAnalyticsRow[]): number {
    return rows.reduce((total, row) => total + (row.count_value ?? 0), 0);
}

function sumStaffAttribution(rows: StaffOperationsAnalyticsRow[]): { attributed: number; unattributed: number } {
    return rows.reduce(
        (totals, row) => ({
            attributed: totals.attributed + (row.attributed_count ?? 0),
            unattributed: totals.unattributed + (row.unattributed_count ?? 0),
        }),
        { attributed: 0, unattributed: 0 },
    );
}

function collectStaffBuckets(rows: StaffOperationsAnalyticsRow[]): string[] {
    return Array.from(new Set(rows.map(row => row.bucket_start))).sort();
}

function staffCountSeries(rows: StaffOperationsAnalyticsRow[], buckets: string[]): number[] {
    const totals = new Map<string, number>();
    rows.forEach(row => {
        totals.set(row.bucket_start, (totals.get(row.bucket_start) ?? 0) + (row.count_value ?? 0));
    });
    return buckets.map(bucket => totals.get(bucket) ?? 0);
}

function StaffMetricTile({ label, value, note, meta }: { label: string; value: string; note: string; meta?: string }) {
    return (
        <div className="doctor-insight-card">
            <div className="doctor-insight-topline">
                <div className="doctor-insight-label">{label}</div>
            </div>
            <div className="doctor-insight-value tabular-nums">{value}</div>
            {meta && <div className="doctor-staff-tile-meta tabular-nums">{meta}</div>}
            <div className="doctor-insight-note">{note}</div>
        </div>
    );
}

function StaffOperationsTrendChart({
    buckets,
    bucket,
    series,
    emptyTitle,
    emptyDescription,
    formatValue = (value: number) => value.toLocaleString(),
    axisMode = 'count',
}: {
    buckets: string[];
    bucket: AnalyticsBucket;
    series: Array<{ label: string; values: number[]; variant: 'is-current' | 'is-previous' }>;
    emptyTitle: string;
    emptyDescription: string;
    formatValue?: (value: number) => string;
    axisMode?: 'count' | 'duration';
}) {
    if (buckets.length === 0) {
        return <EmptyState title={emptyTitle} description={emptyDescription} className="m-4" />;
    }

    const maxValue = Math.max(...series.flatMap(item => item.values), 1);
    const axisMax = axisMode === 'duration' ? durationAxisMax(maxValue) : Math.max(4, Math.ceil(maxValue / 4) * 4);
    const ticks = [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0];
    const labelStride = buckets.length > 12 ? Math.ceil(buckets.length / 6) : buckets.length > 7 ? 2 : 1;
    const plotted = series.map(item => ({
        ...item,
        points: item.values.map((value, index) => chartPoint(index, value, buckets.length, axisMax)),
    }));

    return (
        <div className="doctor-line-chart" role="group" aria-label={`Trend for ${series.map(item => item.label).join(' and ')}`}>
            <div className="doctor-line-legend">
                {plotted.map(item => (
                    <span key={item.label}><i className={item.variant} />{item.label}</span>
                ))}
            </div>
            <div className="doctor-line-frame">
                <div className="doctor-line-y-axis" aria-hidden="true">
                    {ticks.map((tick, index) => <span key={`${tick}-${index}`} className="tabular-nums">{formatValue(tick)}</span>)}
                </div>
                <div className="doctor-line-plot">
                    <div className="doctor-line-grid" aria-hidden="true">{ticks.map((_, index) => <i key={index} />)}</div>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="doctor-line-svg" aria-hidden="true">
                        {plotted.map(item => (
                            <path key={item.label} className={`doctor-line-path ${item.variant}`} d={svgPath(item.points)} />
                        ))}
                    </svg>
                    <div
                        className="doctor-line-hitpoints"
                        style={{ '--doctor-point-gap': `${100 / Math.max(buckets.length - 1, 1)}%` } as React.CSSProperties}
                    >
                        {buckets.map((bucketStart, index) => (
                            <span
                                key={bucketStart}
                                className="doctor-line-point"
                                style={{ left: `${plotted[0].points[index].x}%`, top: `${plotted[0].points[index].y}%` }}
                                tabIndex={0}
                                role="img"
                                data-value={`${formatBucketDate(bucketStart, bucket)}: ${plotted.map(item => `${formatValue(item.values[index])} ${item.label.toLowerCase()}`).join(', ')}`}
                                aria-label={`${formatBucketDate(bucketStart, bucket)}: ${plotted.map(item => `${formatValue(item.values[index])} ${item.label.toLowerCase()}`).join(', ')}`}
                            />
                        ))}
                    </div>
                    <div className="doctor-line-x-axis">
                        {buckets.map((bucketStart, index) => (
                            <span
                                key={bucketStart}
                                className={index % labelStride === 0 || index === buckets.length - 1 ? '' : 'is-hidden'}
                                style={{ left: `${(index / Math.max(buckets.length - 1, 1)) * 100}%` }}
                            >
                                {formatBucketDate(bucketStart, bucket)}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StaffOperationsSkeleton() {
    return (
        <div className="doctor-staff-shell" aria-live="polite" aria-busy="true">
            <div className="doctor-staff-toolbar" aria-hidden="true">
                <div className="clinical-filter-group">
                    {[0, 1, 2].map(item => <Skeleton className="h-8 w-24" key={item} />)}
                </div>
            </div>
            <div className="doctor-staff-metrics">
                {[0, 1, 2].map(item => (
                    <div className="doctor-insight-card" key={item} aria-hidden="true">
                        <Skeleton className="clinical-skeleton-line w-28" />
                        <Skeleton className="mt-3 h-8 w-16" />
                        <Skeleton className="clinical-skeleton-line mt-2 w-32" />
                    </div>
                ))}
            </div>
            <SectionPanel title="Completed Activity Trend" subtitle="Preparing operational trend.">
                <div className="doctor-analytics-chart-skeleton" aria-hidden="true">
                    <Skeleton className="h-full w-full" />
                </div>
            </SectionPanel>
            <SectionPanel title="Attribution" subtitle="Preparing attribution summary.">
                <div className="doctor-staff-attribution" aria-hidden="true">
                    {[0, 1].map(item => (
                        <div className="doctor-analytics-summary-row" key={item}>
                            <div className="min-w-0 flex-1">
                                <Skeleton className="clinical-skeleton-line w-28" />
                                <Skeleton className="clinical-skeleton-line mt-2 w-40" />
                            </div>
                            <Skeleton className="h-5 w-10" />
                        </div>
                    ))}
                </div>
            </SectionPanel>
            <section className="doctor-analytics-note" aria-hidden="true">
                <Skeleton className="h-4 w-4 rounded-full" />
                <div className="min-w-0 flex-1">
                    <Skeleton className="clinical-skeleton-line w-48" />
                    <Skeleton className="clinical-skeleton-line mt-2 w-full" />
                </div>
            </section>
        </div>
    );
}

function StaffOperationsSection({
    period,
    rows,
    isLoading,
    error,
    category,
    onSelectCategory,
    chartMetric,
    onSelectChartMetric,
}: {
    period: AnalyticsPeriod;
    rows: StaffOperationsAnalyticsRow[] | null;
    isLoading: boolean;
    error: string | null;
    category: StaffOperationsRole;
    onSelectCategory: (category: StaffOperationsRole) => void;
    chartMetric: StaffChartMetric;
    onSelectChartMetric: (metric: StaffChartMetric) => void;
}) {

    const countMetrics = STAFF_COUNT_METRICS[category];
    const turnaroundMetric = STAFF_TURNAROUND_METRICS[category];
    const activeCategory = STAFF_CATEGORIES.find(item => item.key === category) ?? STAFF_CATEGORIES[0];

    // Doctor has no supported turnaround metric, so the toggle must not offer one.
    const effectiveChartMetric: StaffChartMetric = turnaroundMetric ? chartMetric : 'count';

    // Only role_total rows reach the UI. Staff-scoped rows carry names and per-person
    // figures and are dropped here, which also prevents double-counting the two scopes.
    const categoryRows = useMemo(
        () => roleTotalRows(rows ?? []).filter(row => row.role_key === category),
        [rows, category],
    );

    const turnaroundRows = useMemo(
        () => (turnaroundMetric
            ? staffRowsForMetric(categoryRows, category, turnaroundMetric.key)
                .filter(row => row.duration_minutes_median !== null)
                .sort((left, right) => left.bucket_start.localeCompare(right.bucket_start))
            : []),
        [categoryRows, category, turnaroundMetric],
    );

    // Exact selected-period statistics, computed by the RPC from raw workflow intervals.
    // Never derive these from the bucket-level role_total rows.
    const periodTurnaround = useMemo(
        () => (turnaroundMetric ? findPeriodTotalRow(rows ?? [], category, turnaroundMetric.key) : null),
        [rows, category, turnaroundMetric],
    );
    const periodMedianMinutes = periodTurnaround?.duration_minutes_median ?? null;
    const periodAverageMinutes = periodTurnaround?.duration_minutes_avg ?? null;

    const countRows = useMemo(
        () => countMetrics.flatMap(metric => staffRowsForMetric(categoryRows, category, metric.key)),
        [categoryRows, category, countMetrics],
    );

    const buckets = useMemo(() => collectStaffBuckets(countRows), [countRows]);

    const series = useMemo(
        () => countMetrics.map((metric, index) => ({
            label: metric.label,
            variant: (index === 0 ? 'is-current' : 'is-previous') as 'is-current' | 'is-previous',
            values: staffCountSeries(staffRowsForMetric(categoryRows, category, metric.key), buckets),
        })),
        [buckets, categoryRows, category, countMetrics],
    );

    const attribution = useMemo(() => sumStaffAttribution(countRows), [countRows]);
    const attributionTotal = attribution.attributed + attribution.unattributed;
    const attributedPercent = attributionTotal === 0 ? 0 : Math.round((attribution.attributed / attributionTotal) * 100);

    const reliabilityLevels = useMemo(
        () => Array.from(new Set(countRows.map(row => row.reliability))),
        [countRows],
    );

    const hasTurnaroundRows = turnaroundRows.length > 0;

    const isInitialLoading = isLoading && rows === null;
    const isRefreshing = isLoading && rows !== null;

    return (
        <section aria-label="Staff activity and service operations" className="doctor-analytics-section">
            <SectionHeading
                title="Staff Activity & Service Operations"
                subtitle="Aggregate completed workflow activity by service area. Not an individual performance score."
            />

            <div className="doctor-staff-toolbar">
                <div className="clinical-filter-group" role="group" aria-label="Staff operations category">
                    {STAFF_CATEGORIES.map(item => (
                        <button
                            key={item.key}
                            type="button"
                            className={`clinical-filter-button ${category === item.key ? 'is-active' : ''}`}
                            aria-pressed={category === item.key}
                            onClick={() => onSelectCategory(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className={`doctor-analytics-updating ${isRefreshing ? 'is-visible' : ''}`} role="status" aria-live="polite">
                    <span className="doctor-analytics-spinner" aria-hidden="true" />
                    <span>Updating</span>
                </div>
            </div>

            <p className="doctor-staff-scope">{activeCategory.subtitle} {period.from} to {period.toExclusive}.</p>

            {error && (
                <div className="doctor-analytics-inline-alert" role="alert">
                    <Icon name="alert-triangle" className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}

            {isInitialLoading ? (
                <StaffOperationsSkeleton />
            ) : rows === null ? (
                <EmptyState
                    title="Staff Operations data unavailable"
                    description={error ? 'The Staff Operations request failed. Clinical and Geographic Analytics are unaffected.' : 'No Staff Operations data has been loaded for this period.'}
                />
            ) : (
                <div className="doctor-staff-shell">
                    <div className="doctor-staff-metrics">
                        {countMetrics.map(metric => (
                            <StaffMetricTile
                                key={metric.key}
                                label={metric.label}
                                value={sumStaffCount(staffRowsForMetric(categoryRows, category, metric.key)).toLocaleString()}
                                note={metric.note}
                            />
                        ))}
                        {turnaroundMetric && (
                            <StaffMetricTile
                                label={turnaroundMetric.label}
                                value={periodMedianMinutes === null ? 'No data' : formatDurationMinutes(periodMedianMinutes)}
                                note={periodMedianMinutes === null
                                    ? 'No valid turnaround intervals recorded in this period'
                                    : turnaroundMetric.medianLabel}
                                meta={periodMedianMinutes !== null && periodAverageMinutes !== null
                                    ? `Average ${formatDurationMinutes(periodAverageMinutes)}`
                                    : undefined}
                            />
                        )}
                    </div>

                    <SectionPanel
                        title={effectiveChartMetric === 'turnaround' && turnaroundMetric ? 'Turnaround Trend' : 'Completed Activity Trend'}
                        subtitle={effectiveChartMetric === 'turnaround' && turnaroundMetric
                            ? turnaroundMetric.medianLabel
                            : 'Completed workflow events over the selected period.'}
                    >
                        {turnaroundMetric && (
                            <div className="doctor-staff-chart-toggle" role="group" aria-label="Trend metric">
                                <button
                                    type="button"
                                    className={`clinical-filter-button ${effectiveChartMetric === 'count' ? 'is-active' : ''}`}
                                    aria-pressed={effectiveChartMetric === 'count'}
                                    onClick={() => onSelectChartMetric('count')}
                                >
                                    Completed count
                                </button>
                                <button
                                    type="button"
                                    className={`clinical-filter-button ${effectiveChartMetric === 'turnaround' ? 'is-active' : ''}`}
                                    aria-pressed={effectiveChartMetric === 'turnaround'}
                                    onClick={() => onSelectChartMetric('turnaround')}
                                >
                                    Turnaround
                                </button>
                            </div>
                        )}
                        {effectiveChartMetric === 'turnaround' && turnaroundMetric ? (
                            <StaffOperationsTrendChart
                                buckets={turnaroundRows.map(row => row.bucket_start)}
                                bucket={period.bucket}
                                series={[{
                                    label: 'Median turnaround',
                                    variant: 'is-current',
                                    values: turnaroundRows.map(row => row.duration_minutes_median ?? 0),
                                }]}
                                formatValue={formatDurationMinutes}
                                axisMode="duration"
                                emptyTitle="No turnaround intervals"
                                emptyDescription="No valid turnaround intervals were recorded for this category in the selected period."
                            />
                        ) : (
                            <StaffOperationsTrendChart
                                buckets={buckets}
                                bucket={period.bucket}
                                series={series}
                                emptyTitle="No activity in this period"
                                emptyDescription="No completed activity was recorded for this category in the selected period."
                            />
                        )}
                    </SectionPanel>

                    <SectionPanel
                        title="Attribution"
                        subtitle="How much completed activity could be linked to a staff account through audit logs."
                    >
                        {attributionTotal === 0 ? (
                            <EmptyState title="No activity to attribute" description="No completed activity was recorded for this category in the selected period." className="m-4" />
                        ) : (
                            <div className="doctor-staff-attribution">
                                <SummaryRow label="Attributed activity" value={attribution.attributed} note={`${attributedPercent}% of completed activity`} />
                                <SummaryRow label="Unattributed activity" value={attribution.unattributed} note="Completed, but not linkable to a staff account" />
                            </div>
                        )}
                    </SectionPanel>

                    <section className="doctor-analytics-note">
                        <Icon name="alert-triangle" className="h-4 w-4" />
                        <div>
                            <strong>Attribution and reliability limits</strong>
                            <p>
                                Attribution is derived from deduplicated audit logs and is incomplete, so unattributed activity is shown rather than hidden.
                                {reliabilityLevels.length > 0 && ` Backend reliability for the displayed counts: ${reliabilityLevels.join(', ')}.`}
                                {turnaroundMetric && (hasTurnaroundRows || periodMedianMinutes !== null) && ` ${TURNAROUND_APPROXIMATION_NOTE}`}
                                {' '}These figures describe recorded workflow activity, not individual staff performance, and are not comparable across service areas.
                            </p>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}

function AnalyticsNoteCard() {
    return (
        <section className="doctor-analytics-note">
            <Icon name="alert-triangle" className="h-4 w-4" />
            <div>
                <strong>Aggregate clinical records</strong>
                <p>Analytics are generated from aggregate clinical records. Free-text diagnoses and complaints may include spelling or wording variations.</p>
            </div>
        </section>
    );
}

function AggregateTable({ rows, emptyTitle }: { rows: AnalyticsRow[]; emptyTitle: string }) {
    if (rows.length === 0) {
        return <EmptyState title={emptyTitle} description="No aggregate rows were returned for the selected period." className="m-4" />;
    }

    return (
        <div className="clinical-table-scroll">
            <table className="clinical-table doctor-analytics-detail-table min-w-[760px]">
                <colgroup>
                    <col className="doctor-table-col-metric" />
                    <col className="doctor-table-col-group" />
                    <col className="doctor-table-col-number" />
                    <col className="doctor-table-col-number" />
                    <col className="doctor-table-col-state" />
                </colgroup>
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Group</th>
                        <th className="doctor-table-number">Current</th>
                        <th className="doctor-table-number">Previous</th>
                        <th className="doctor-table-state">Reliability</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${row.metric_key}-${row.dimension_key ?? 'all'}-${row.bucket_start ?? 'none'}-${index}`}>
                            <td>
                                <div className="clinical-primary">{titleCase(row.metric_key)}</div>
                                {row.bucket_start && <div className="clinical-secondary">{row.bucket_start}</div>}
                            </td>
                            <td>{titleCase(row.dimension_key)}</td>
                            <td className="doctor-table-number tabular-nums">{(row.current_count ?? 0).toLocaleString()}</td>
                            <td className="doctor-table-number tabular-nums">{row.previous_count === null ? 'n/a' : (row.previous_count ?? 0).toLocaleString()}</td>
                            <td className="doctor-table-state"><span className={`doctor-reliability-text is-${reliabilityTone(row.reliability)}`}>{row.reliability ?? 'Informational'}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface DetailFilterState {
    service: string | null;
    status: string | null;
}

const EMPTY_DETAIL_FILTERS: DetailFilterState = { service: null, status: null };

// Options come from the rows actually returned for the active period, so a filter can
// never offer a value the backend did not produce.
function distinctRowValues(rows: AnalyticsRow[], pick: (row: AnalyticsRow) => string | null): string[] {
    const values = rows.map(pick).filter((value): value is string => Boolean(value));
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

// Filters scope the Detailed Records table only. Clinical KPI cards and every chart stay
// bound to the unfiltered fetch, so a table filter can never restate a period total.
function FilterableAggregateTable({
    rows,
    emptyTitle,
    emptyDescription,
    filters,
    onChangeFilters,
}: {
    rows: AnalyticsRow[];
    emptyTitle: string;
    emptyDescription: string;
    filters: DetailFilterState;
    onChangeFilters: (filters: DetailFilterState) => void;
}) {
    const serviceOptions = useMemo(() => distinctRowValues(rows, row => row.metric_key), [rows]);
    const statusOptions = useMemo(() => distinctRowValues(rows, row => row.dimension_key), [rows]);

    const filteredRows = useMemo(() => rows.filter(row =>
        (!filters.service || row.metric_key === filters.service)
        && (!filters.status || row.dimension_key === filters.status)), [rows, filters]);

    if (rows.length === 0) {
        return <EmptyState title={emptyTitle} description={emptyDescription} className="m-4" />;
    }

    const isFiltered = Boolean(filters.service || filters.status);
    // A filter with a single option offers no choice, so it is not rendered.
    const showService = serviceOptions.length > 1;
    const showStatus = statusOptions.length > 1;

    return (
        <>
            {(showService || showStatus) && (
                <div className="doctor-detail-filters">
                    {showService && (
                        <label className="doctor-detail-filter">
                            <span>Service</span>
                            <select
                                className="clinical-input min-h-9"
                                value={filters.service ?? ''}
                                onChange={event => onChangeFilters({ ...filters, service: event.target.value || null })}
                            >
                                <option value="">All services</option>
                                {serviceOptions.map(option => (
                                    <option key={option} value={option}>{titleCase(option)}</option>
                                ))}
                            </select>
                        </label>
                    )}
                    {showStatus && (
                        <label className="doctor-detail-filter">
                            <span>Status</span>
                            <select
                                className="clinical-input min-h-9"
                                value={filters.status ?? ''}
                                onChange={event => onChangeFilters({ ...filters, status: event.target.value || null })}
                            >
                                <option value="">All statuses</option>
                                {statusOptions.map(option => (
                                    <option key={option} value={option}>{titleCase(option)}</option>
                                ))}
                            </select>
                        </label>
                    )}
                    {/* Clearing is handled by the single shared Reset filters control. */}
                    {isFiltered && (
                        <span className="doctor-detail-filter-count tabular-nums" role="status" aria-live="polite">
                            Showing {filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows
                        </span>
                    )}
                </div>
            )}
            {filteredRows.length === 0 ? (
                <EmptyState
                    title="No records match these filters"
                    description="Records exist for this period, but none match the active Service and Status selection."
                    className="m-4"
                />
            ) : (
                <AggregateTable rows={filteredRows} emptyTitle={emptyTitle} />
            )}
        </>
    );
}

function FrequencyTable({ rows, emptyTitle }: { rows: AnalyticsRow[]; emptyTitle: string }) {
    if (rows.length === 0) {
        return <EmptyState title={emptyTitle} description="No free-text aggregate rows were returned for this period." className="m-4" />;
    }

    return (
        <div className="doctor-frequency-table-wrap">
            <table className="clinical-table doctor-analytics-detail-table doctor-frequency-table">
                <caption className="sr-only">Recorded diagnosis aggregates for the selected reporting period</caption>
                <colgroup>
                    <col className="doctor-frequency-col-metric" />
                    <col className="doctor-frequency-col-group" />
                    <col className="doctor-frequency-col-number" />
                    <col className="doctor-frequency-col-number" />
                    <col className="doctor-frequency-col-state" />
                </colgroup>
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Group</th>
                        <th className="doctor-table-number">Current</th>
                        <th className="doctor-table-number">Previous</th>
                        <th className="doctor-table-state">Reliability</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${row.metric_key}-${row.dimension_key ?? 'all'}-${index}`}>
                            <td data-label="Metric">
                                <div className="clinical-primary">{titleCase(row.metric_key)}</div>
                            </td>
                            <td data-label="Group">{titleCase(row.dimension_key)}</td>
                            <td data-label="Current" className="doctor-table-number tabular-nums">{(row.current_count ?? 0).toLocaleString()}</td>
                            <td data-label="Previous" className="doctor-table-number tabular-nums">{row.previous_count === null ? 'n/a' : (row.previous_count ?? 0).toLocaleString()}</td>
                            <td data-label="Reliability" className="doctor-table-state"><span className={`doctor-reliability-text is-${reliabilityTone(row.reliability)}`}>{row.reliability ?? 'Informational'}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const DETAIL_TABS = [
    { key: 'clinical', label: 'Recorded Diagnoses' },
    { key: 'laboratory', label: 'Lab Trends' },
    { key: 'prescriptions', label: 'Prescription Trends' },
] as const;

// ARIA tabs pattern: horizontal arrows move between tabs, Home/End jump to the ends.
// Returns the index to move to, or null when the key is not a tablist key.
function nextTabIndex(key: string, current: number, count: number): number | null {
    if (count === 0) return null;
    if (key === 'ArrowRight') return (current + 1) % count;
    if (key === 'ArrowLeft') return (current - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
}

export function DoctorAnalyticsPage({ isOnline, role = 'doctor' }: { isOnline: boolean; role?: AnalyticsWorkspaceRole }) {
    const [detailTab, setDetailTab] = useState<'clinical' | 'laboratory' | 'prescriptions'>('clinical');
    const workspaceTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const detailTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [detailFilters, setDetailFilters] = useState<DetailFilterState>(EMPTY_DETAIL_FILTERS);
    const availableViews = useMemo(() => ANALYTICS_VIEWS.filter(view => view.roles.includes(role)), [role]);
    const [activeView, setActiveView] = useState<AnalyticsView>(() => readViewFromLocation(role));
    const initialPeriodSelection = useMemo(() => readPeriodSelectionFromLocation(), []);
    const [preset, setPreset] = useState<PresetKey>(initialPeriodSelection.preset);
    const [selectedBarangay, setSelectedBarangay] = useState<string | null>(null);
    const [selectedHeatmapMetric, setSelectedHeatmapMetric] = useState<BarangayHeatmapMetric>('registered');
    const defaultCustomPeriod = useMemo(() => getPresetPeriod(DEFAULT_PRESET), []);
    const [customFrom, setCustomFrom] = useState(initialPeriodSelection.customFrom);
    const [customTo, setCustomTo] = useState(initialPeriodSelection.customTo);
    // Staff selectors live here so they survive the tab switches that unmount the section.
    const [staffCategory, setStaffCategory] = useState<StaffOperationsRole>('doctor');
    const [staffChartMetric, setStaffChartMetric] = useState<StaffChartMetric>('count');
    const [data, setData] = useState<DoctorAnalyticsData | null>(null);
    const [barangayDrilldown, setBarangayDrilldown] = useState<AnalyticsRow[]>([]);
    const [isBarangayDrilldownLoading, setIsBarangayDrilldownLoading] = useState(false);
    const [drilldownError, setDrilldownError] = useState<string | null>(null);
    const lastDrilldownRequestKey = useRef<string | null>(null);
    const [drilldownRetryToken, setDrilldownRetryToken] = useState(0);
    const defaultBarangayRef = useRef<string | null>(null);
    const [activePeriod, setActivePeriod] = useState<AnalyticsPeriod>(defaultCustomPeriod);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const clinicalRequestKeyRef = useRef<string | null>(null);
    const [clinicalRetryToken, setClinicalRetryToken] = useState(0);
    const [staffRows, setStaffRows] = useState<StaffOperationsAnalyticsRow[] | null>(null);
    const [isStaffLoading, setIsStaffLoading] = useState(false);
    const [staffError, setStaffError] = useState<string | null>(null);
    const staffRequestKeyRef = useRef<string | null>(null);

    // Normalize the URL on mount (and whenever the role changes) so an invalid or
    // unauthorized ?view= value is rewritten to the default without adding history noise.
    useEffect(() => {
        const resolved = readViewFromLocation(role);
        setActiveView(resolved);
        writeViewToLocation(resolved, 'replace');
    }, [role]);

    // Browser back/forward between analytics tabs. The period is re-read too so a history
    // entry written before a period change cannot leave the URL and the UI disagreeing.
    useEffect(() => {
        const handlePopState = () => {
            setActiveView(readViewFromLocation(role));
            const selection = readPeriodSelectionFromLocation();
            setPreset(selection.preset);
            setCustomFrom(selection.customFrom);
            setCustomTo(selection.customTo);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [role]);

    // Mirror the period into the URL so a refresh restores it. replaceState only: see
    // writePeriodToLocation for why period changes must not create history entries.
    useEffect(() => {
        writePeriodToLocation({ preset, customFrom, customTo });
    }, [preset, customFrom, customTo]);

    const selectView = (view: AnalyticsView) => {
        const resolved = resolveAnalyticsView(view, role);
        setActiveView(resolved);
        writeViewToLocation(resolved, 'push');
    };

    // Activation follows focus, so arrowing selects the tab through the same
    // selectView path a click uses and the ?view= URL state stays in step.
    const handleWorkspaceTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const next = nextTabIndex(event.key, index, availableViews.length);
        if (next === null) return;
        event.preventDefault();
        selectView(availableViews[next].key);
        workspaceTabRefs.current[next]?.focus();
    };

    const selectDetailTab = (key: typeof DETAIL_TABS[number]['key']) => {
        setDetailTab(key);
        setDetailFilters(EMPTY_DETAIL_FILTERS);
    };

    const handleDetailTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const next = nextTabIndex(event.key, index, DETAIL_TABS.length);
        if (next === null) return;
        event.preventDefault();
        selectDetailTab(DETAIL_TABS[next].key);
        detailTabRefs.current[next]?.focus();
    };

    const customPeriod = useMemo(() => getCustomPeriod(customFrom, customTo), [customFrom, customTo]);
    const period = useMemo(() => preset === 'custom' ? customPeriod : getPresetPeriod(preset), [customPeriod, preset]);
    const displayPeriod = period ?? activePeriod;
    // Period validation is a shared-filter failure, not a data-fetch failure, so it is
    // surfaced on every tab rather than alongside the Clinical fetch error.
    const periodError = period ? null : 'Choose a valid custom range from 1 to 366 days.';


    // Re-selecting the barangay that is already selected is a no-op state update, so after
    // a failed drill-down it would never re-run the effect. A retry token makes that click
    // an explicit retry without disturbing normal selection changes.
    const handleSelectBarangay = (barangay: string) => {
        if (normalizeBarangayKey(barangay) === normalizeBarangayKey(selectedBarangay)) {
            if (drilldownError) setDrilldownRetryToken(token => token + 1);
            return;
        }
        setSelectedBarangay(barangay);
    };
    const isInitialLoading = isLoading && !data;
    const isRefreshing = isLoading && Boolean(data);
    // Staff Operations owns its own data, loading and error states, so a Clinical or
    // Geographic RPC failure must not blank it.
    const isStaffOnlyView = activeView === 'staff' && role === 'doctor';
    // Midwives can only reach these two views, so their fetching is unchanged.
    const needsClinicalData = activeView === 'clinical' || activeView === 'geographic';
    // The shared period is dirty whenever it is not the default Month preset. Custom dates
    // only matter while the custom preset is active, so they are not compared separately.
    const isPeriodDirty = preset !== DEFAULT_PRESET;
    const isActiveViewDirty = (() => {
        if (activeView === 'clinical') return Boolean(detailFilters.service || detailFilters.status);
        if (activeView === 'geographic') {
            const barangayIsDefault = !selectedBarangay
                || normalizeBarangayKey(selectedBarangay) === normalizeBarangayKey(defaultBarangayRef.current);
            return selectedHeatmapMetric !== 'registered' || !barangayIsDefault;
        }
        return isStaffOnlyView && (staffCategory !== 'doctor' || staffChartMetric !== 'count');
    })();
    const canReset = isPeriodDirty || isActiveViewDirty;

    // Resets the shared period plus the active tab's own state only. Filters belonging to
    // tabs that are not visible are left alone so nothing changes out of sight.
    const resetFilters = () => {
        setPreset(DEFAULT_PRESET);
        const fallback = defaultPeriodSelection();
        setCustomFrom(fallback.customFrom);
        setCustomTo(fallback.customTo);

        if (activeView === 'clinical') {
            setDetailFilters(EMPTY_DETAIL_FILTERS);
        } else if (activeView === 'geographic') {
            setSelectedHeatmapMetric('registered');
            setSelectedBarangay(null);
        } else if (isStaffOnlyView) {
            setStaffCategory('doctor');
            setStaffChartMetric('count');
        }
    };

    // Staff Operations is Doctor-only and lazy: the RPC is never called for other roles
    // or while another tab is active. Failures stay local to this tab.
    useEffect(() => {
        if (!isStaffOnlyView || !period) return;

        const requestKey = `${period.from}|${period.toExclusive}|${period.bucket}`;
        if (staffRequestKeyRef.current === requestKey) return;
        staffRequestKeyRef.current = requestKey;

        let isCurrent = true;
        setIsStaffLoading(true);
        setStaffError(null);

        void (async () => {
            try {
                const result = await fetchStaffOperationsAnalytics(period);
                // Ignore a response whose request is no longer the newest one.
                if (isCurrent && staffRequestKeyRef.current === requestKey) setStaffRows(result);
            } catch (err) {
                logError('Failed to load staff operations analytics', err);
                if (isCurrent && staffRequestKeyRef.current === requestKey) {
                    staffRequestKeyRef.current = null;
                    setStaffError(err instanceof Error && err.message === 'permission_denied'
                        ? 'Staff Operations access is limited to Doctor accounts.'
                        : healthcareErrorMessage('load staff operations'));
                }
            } finally {
                if (isCurrent) setIsStaffLoading(false);
            }
        })();

        return () => {
            isCurrent = false;
        };
    }, [isStaffOnlyView, period]);

    useEffect(() => {
        // Clinical and Geographic share one fetch; Staff Operations has its own. Skipping
        // this while Staff is active avoids firing all Clinical RPCs for a hidden tab.
        // The request key lives in a ref, so returning to a period that already succeeded
        // is deduplicated and reuses the cached data instead of refetching.
        if (!needsClinicalData) return;

        if (!period) {
            setIsLoading(false);
            return;
        }

        // Stable key: the period memo produces a new object on every preset change, so
        // object identity would refetch all analytics RPCs for an identical range.
        const requestKey = `${period.from}|${period.toExclusive}|${period.bucket}`;
        if (clinicalRequestKeyRef.current === requestKey) return;
        clinicalRequestKeyRef.current = requestKey;

        let isCurrent = true;
        setIsLoading(true);
        setError(null);

        void (async () => {
            try {
                const result = await fetchDoctorAnalytics(period);
                // Ignore a response whose request is no longer the newest one.
                if (isCurrent && clinicalRequestKeyRef.current === requestKey) {
                    setData(previous => mergeDoctorAnalytics(previous, result));
                    setActivePeriod(period);
                    // A page-level error is reserved for a total failure; individual
                    // request failures are reported by the affected panel.
                    setError(result.succeededRequestCount === 0
                        ? analyticsErrorText(result.requestErrors.consultationVolume ?? 'analytics_unavailable')
                        : null);
                }
            } catch (err) {
                logError('Failed to load clinical analytics', err);
                if (isCurrent && clinicalRequestKeyRef.current === requestKey) {
                    // Clear the key so the same range can be retried.
                    clinicalRequestKeyRef.current = null;
                    setError(err instanceof Error && err.message === 'permission_denied'
                        ? 'Analytics access is limited to authorized clinical analytics accounts.'
                        : healthcareErrorMessage('load analytics'));
                }
            } finally {
                if (isCurrent) setIsLoading(false);
            }
        })();

        return () => {
            isCurrent = false;
        };
    }, [needsClinicalData, period, clinicalRetryToken]);

    useEffect(() => {
        if (!data || selectedBarangay) return;
        if (data.barangayDistribution.status !== 'ok') return;
        const firstBarangay = data.barangayDistribution.rows
            .filter(row => row.dimension_key && row.dimension_key !== 'Unspecified' && row.dimension_key !== 'Outside Malvar' && (row.current_count ?? 0) > 0)
            .sort((a, b) => (b.current_count ?? 0) - (a.current_count ?? 0) || titleCase(a.dimension_key).localeCompare(titleCase(b.dimension_key)))[0];
        if (firstBarangay?.dimension_key) {
            const defaultBarangay = titleCase(firstBarangay.dimension_key);
            // Remembered so the Reset control can tell an auto-selected default from a
            // barangay the user actually picked.
            defaultBarangayRef.current = defaultBarangay;
            setSelectedBarangay(defaultBarangay);
        }
    }, [data, selectedBarangay]);

    useEffect(() => {
        // The drill-down only backs the Geographic tab, so it is not requested while
        // another tab is active. Returning to Geographic with the same barangay and
        // period is deduplicated against the stored key and reuses the retained rows.
        if (activeView !== 'geographic') return;
        if (!selectedBarangay || !displayPeriod) return;
        // Captured after the guard so the request uses the values this effect run checked,
        // rather than relying on narrowing surviving into the async closure.
        const barangay = selectedBarangay;
        const period = displayPeriod;
        let isCurrent = true;
        const requestKey = `${normalizeBarangayKey(barangay)}|${period.from}|${period.toExclusive}`;
        if (lastDrilldownRequestKey.current === requestKey) return;
        lastDrilldownRequestKey.current = requestKey;

        async function loadBarangayDrilldown() {
            setIsBarangayDrilldownLoading(true);
            setDrilldownError(null);
            try {
                const result = await fetchBarangayDrilldown(barangay, period);
                if (isCurrent) setBarangayDrilldown(result);
            } catch (err) {
                logError('Failed to load barangay drill-down analytics', err);
                if (isCurrent) {
                    // Clear the key so re-selecting the same barangay and period retries
                    // instead of being deduplicated against the failed request. Previous
                    // drill-down rows are kept so the panel does not blank on failure.
                    if (lastDrilldownRequestKey.current === requestKey) lastDrilldownRequestKey.current = null;
                    setDrilldownError(err instanceof Error && err.message === 'permission_denied'
                        ? 'Barangay drill-down is limited to authorized clinical analytics accounts.'
                        : 'Unable to load barangay drill-down. Please try again.');
                }
            } finally {
                if (isCurrent) setIsBarangayDrilldownLoading(false);
            }
        }

        void loadBarangayDrilldown();

        return () => {
            isCurrent = false;
        };
    }, [activeView, displayPeriod, selectedBarangay, drilldownRetryToken]);

    const overview = useMemo(() => {
        if (!data) return null;
        // A metric whose source request failed stays null. It is never summed to zero,
        // so the KPI card reports "Unavailable" instead of an invented figure.
        const pendingValue = (result: AnalyticsResult<AnalyticsRow[]>) => result.status === 'ok'
            ? sumCurrent(result.rows, row => row.dimension_key === 'pending')
            : null;
        const pendingItems = [
            { label: 'Follow-ups', value: pendingValue(data.followUpCurrentWorkload) },
            { label: 'Laboratory', value: pendingValue(data.labCurrentWorkload) },
            { label: 'Prescriptions', value: pendingValue(data.prescriptionCurrentWorkload) },
        ];
        const consultationCurrent = data.consultationVolume.status === 'ok' ? sumCurrent(data.consultationVolume.rows) : null;
        const consultationPrevious = data.consultationVolume.status === 'ok' ? sumPrevious(data.consultationVolume.rows) : null;
        const concernResult = combineResults(data.diagnoses, data.complaints);
        const topConcern = concernResult.status === 'ok'
            ? [...concernResult.rows].sort((a, b) => (b.current_count ?? 0) - (a.current_count ?? 0))[0] ?? null
            : null;
        // Only metrics that actually loaded can compete for "largest backlog".
        const availablePending = pendingItems.filter((item): item is { label: string; value: number } => item.value !== null);
        const attentionArea = availablePending.length > 0
            ? availablePending.reduce((current, item) => item.value > current.value ? item : current)
            : null;

        return {
            consultations: consultationCurrent,
            consultationDelta: consultationCurrent !== null && consultationPrevious !== null
                ? formatDelta(consultationCurrent, consultationPrevious)
                : undefined,
            consultationTone: consultationCurrent !== null && consultationPrevious !== null
                ? deltaTone(consultationCurrent, consultationPrevious)
                : 'flat' as const,
            followUpsPending: pendingItems[0].value,
            labPending: pendingItems[1].value,
            prescriptionsPending: pendingItems[2].value,
            concernResult,
            topConcernLabel: titleCase(topConcern?.dimension_key ?? null),
            topConcernCount: topConcern?.current_count ?? 0,
            attentionArea,
        };
    }, [data]);

    // Retry reuses the existing batch fetch: it clears the request key so the current
    // period is no longer deduplicated, then bumps a token to re-run the effect. Ignored
    // while a load is already in flight, so repeated clicks cannot stack requests.
    const retryClinicalAnalytics = () => {
        if (isLoading) return;
        clinicalRequestKeyRef.current = null;
        setClinicalRetryToken(token => token + 1);
    };

    // Binds the shared retry affordance to every section-level result.
    const renderSection = <T,>(result: AnalyticsResult<T>, render: (rows: T) => React.ReactNode): React.ReactNode =>
        renderResult(result, render, retryClinicalAnalytics, isLoading);

    // The largest backlog is called out on its own KPI card instead of repeating the same
    // figure in a separate signal card.
    const pendingNote = (area: string) => overview && overview.attentionArea && overview.attentionArea.label === area && overview.attentionArea.value > 0
        ? 'Largest pending backlog'
        : 'Current active workload';

    const prescriptionStatus = useMemo(() => {
        if (!data) return null;
        const combined = combineResults(data.prescriptionCurrentWorkload, data.prescriptionDispensed);
        if (combined.status === 'error') return combined;
        return {
            status: 'ok' as const,
            pending: data.prescriptionCurrentWorkload.status === 'ok'
                ? sumCurrent(data.prescriptionCurrentWorkload.rows, row => row.dimension_key === 'pending')
                : 0,
            dispensed: data.prescriptionDispensed.status === 'ok' ? sumCurrent(data.prescriptionDispensed.rows) : 0,
        };
    }, [data]);

    return (
        <div className="pwa-page-pad doctor-analytics-dashboard">
            {!isOnline && (
                <div role="status" className="rounded-lg border border-[var(--amber-border)] bg-[var(--amber-surface)] px-4 py-3 text-sm font-semibold text-[var(--amber-text-dark)]">
                    Analytics may be out of date while the workstation is offline.
                </div>
            )}

            <header className="doctor-analytics-period">
                <div className="doctor-analytics-period-intro">
                    <span className="doctor-analytics-eyebrow">Clinical intelligence</span>
                    <h2 className="doctor-analytics-page-title">Analytics Overview</h2>
                    <p className="doctor-analytics-page-description">Review service activity, community coverage, and operational performance.</p>
                    <p className="doctor-analytics-period-label">
                        <span>Reporting period</span>
                        <strong className="tabular-nums">{displayPeriod.from} to {displayPeriod.toExclusive}</strong>
                    </p>
                </div>
                <div className="doctor-analytics-controls">
                    <span className="doctor-analytics-control-label">Period</span>
                    <div className="clinical-filter-group" aria-label="Analytics date presets">
                        {PRESETS.map(item => (
                            <button
                                key={item.key}
                                type="button"
                                className={`clinical-filter-button ${preset === item.key ? 'is-active' : ''}`}
                                aria-pressed={preset === item.key}
                                disabled={isRefreshing && preset === item.key}
                                onClick={() => setPreset(item.key)}
                            >
                                {item.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`clinical-filter-button ${preset === 'custom' ? 'is-active' : ''}`}
                            aria-pressed={preset === 'custom'}
                            disabled={isRefreshing && preset === 'custom'}
                            onClick={() => setPreset('custom')}
                        >
                            Custom
                        </button>
                    </div>
                    {canReset && (
                        <button type="button" className="clinical-filter-button" onClick={resetFilters}>
                            Reset filters
                        </button>
                    )}
                    <div className={`doctor-analytics-updating ${isRefreshing ? 'is-visible' : ''}`} role="status" aria-live="polite">
                        <span className="doctor-analytics-spinner" aria-hidden="true" />
                        <span>Updating</span>
                    </div>
                </div>
                {preset === 'custom' && (
                    <div className="doctor-custom-period">
                        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-semibold text-[var(--text-2)]">
                            From
                            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="clinical-input min-h-9" disabled={isRefreshing && preset === 'custom'} />
                        </label>
                        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-semibold text-[var(--text-2)]">
                            To
                            <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="clinical-input min-h-9" disabled={isRefreshing && preset === 'custom'} />
                        </label>
                        <span className="pb-2 text-xs font-medium text-[var(--text-3)]">Maximum 366 days. End date is included.</span>
                    </div>
                )}
            </header>

            <div className="doctor-workspace-tabs" role="tablist" aria-label="Analytics workspace">
                {availableViews.map((view, index) => (
                    <button
                        key={view.key}
                        type="button"
                        role="tab"
                        id={`analytics-tab-${view.key}`}
                        ref={element => { workspaceTabRefs.current[index] = element; }}
                        aria-selected={activeView === view.key}
                        aria-controls={`analytics-panel-${view.key}`}
                        tabIndex={activeView === view.key ? 0 : -1}
                        className={`clinical-filter-button ${activeView === view.key ? 'is-active' : ''}`}
                        onClick={() => selectView(view.key)}
                        onKeyDown={event => handleWorkspaceTabKeyDown(event, index)}
                    >
                        {view.label}
                    </button>
                ))}
            </div>

            {periodError && (
                <div className="doctor-analytics-inline-alert" role="alert">
                    <Icon name="alert-triangle" className="h-4 w-4" />
                    <span>{periodError}</span>
                </div>
            )}

            {error && !isStaffOnlyView && (
                <div className="doctor-analytics-inline-alert" role="alert">
                    <Icon name="alert-triangle" className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}

            {isStaffOnlyView ? (
                <div className="doctor-analytics-content-shell" role="tabpanel" id="analytics-panel-staff" aria-labelledby="analytics-tab-staff">
                    <StaffOperationsSection
                        period={displayPeriod}
                        rows={staffRows}
                        isLoading={isStaffLoading}
                        error={staffError}
                        category={staffCategory}
                        onSelectCategory={setStaffCategory}
                        chartMetric={staffChartMetric}
                        onSelectChartMetric={setStaffChartMetric}
                    />
                </div>
            ) : !data || !overview ? (
                isInitialLoading ? (
                    <AnalyticsSkeleton view={activeView} />
                ) : (
                    <EmptyState title="No analytics available" description="No aggregate analytics rows were returned." />
                )
            ) : data.succeededRequestCount === 0 ? (
                // Nothing loaded at all. Individual panels would each repeat the same
                // failure, so the workspace reports it once.
                <div className="doctor-analytics-failure">
                    <EmptyState
                        title="Analytics could not be loaded"
                        description="No analytics data could be retrieved for this period. Check the connection and try again."
                    />
                    <button
                        type="button"
                        className="clinical-filter-button"
                        onClick={retryClinicalAnalytics}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Retrying' : 'Retry'}
                    </button>
                </div>
            ) : (
            <div className="doctor-analytics-content-shell">
                {activeView === 'clinical' && (
                <div className="doctor-analytics-view" role="tabpanel" id="analytics-panel-clinical" aria-labelledby="analytics-tab-clinical">
                <section aria-label="Top analytics summary" className="doctor-kpi-strip">
                    <MetricCard
                        label="Consultations Completed"
                        value={overview.consultations}
                        note="Selected period"
                        comparison={overview.consultationDelta}
                        tone={overview.consultationTone}
                    />
                    <MetricCard label="Pending Follow-ups" value={overview.followUpsPending} note={pendingNote('Follow-ups')} />
                    <MetricCard label="Pending Labs" value={overview.labPending} note={pendingNote('Laboratory')} />
                    <MetricCard label="Pending Prescriptions" value={overview.prescriptionsPending} note={pendingNote('Prescriptions')} />
                </section>

                <section aria-label="Primary analytics insights" className="doctor-analytics-section">
                    <SectionHeading title="Primary Insight" subtitle="Service activity and current workload at a glance." />
                    <div className="doctor-primary-grid">
                        <div className="doctor-primary-chart">
                            <SectionPanel title="Service Trend" subtitle="Consultations over time, compared with the previous equal period." className="doctor-trend-panel">
                                {renderSection(data.consultationVolume, rows => (
                                    <ServiceTrendChart rows={rows} bucket={displayPeriod.bucket} />
                                ))}
                            </SectionPanel>
                        </div>
                        <div className="doctor-primary-side">
                            <SectionPanel title="Most Frequent Concern" subtitle="Most recorded diagnosis or complaint in this period.">
                                <div className="doctor-signal-stack">
                                    <div className="doctor-signal-card">
                                        <span>Most Frequent Concern</span>
                                        <strong>{overview.topConcernLabel}</strong>
                                        <small className="tabular-nums">{overview.topConcernCount.toLocaleString()} record{overview.topConcernCount !== 1 ? 's' : ''}</small>
                                    </div>
                                </div>
                            </SectionPanel>
                        </div>
                    </div>
                </section>

                <section aria-label="Operational workload" className="doctor-analytics-section">
                    <SectionHeading title="Operational Workload" subtitle="Follow-up, laboratory, and prescription status mixes that may need coordination." />
                    <div className="doctor-operational-grid">
                        <SectionPanel title="Follow-up Completion" subtitle="Return-visit status for the selected period.">
                            {renderSection(data.followUpActivity, rows => <FollowUpGauge rows={rows} />)}
                        </SectionPanel>
                        <SectionPanel title="Lab Request Status" subtitle="Laboratory request status mix.">
                            {renderSection(combineResults(data.labCurrentWorkload, data.labActivity), rows => (
                                <LabStatusChart rows={rows} emptyTitle="No lab status" />
                            ))}
                        </SectionPanel>
                        <SectionPanel title="Prescription Status" subtitle="Prescribing and dispensing status mix.">
                            {prescriptionStatus === null || prescriptionStatus.status === 'error'
                                ? <DataUnavailable code={prescriptionStatus?.status === 'error' ? prescriptionStatus.message : 'analytics_unavailable'} onRetry={retryClinicalAnalytics} isRetrying={isLoading} />
                                : <PrescriptionStatusChart pending={prescriptionStatus.pending} dispensed={prescriptionStatus.dispensed} />}
                        </SectionPanel>
                    </div>
                </section>

                <section aria-label="Clinical insights" className="doctor-analytics-section">
                    <SectionHeading title="Clinical Insights" subtitle="The most common free-text diagnoses in this period." />
                    <div className="doctor-clinical-grid">
                        <SectionPanel title="Top Diagnoses" subtitle="Most frequently recorded diagnosis text.">
                            {renderSection(data.diagnoses, rows => <DiagnosisDonutChart rows={rows} />)}
                        </SectionPanel>
                    </div>
                </section>

                <AnalyticsNoteCard />

                <section aria-label="Detailed records" className="doctor-analytics-section">
                    <SectionHeading title="Detailed Records" subtitle="Secondary aggregate tables for drill-down review." />
                    <SectionPanel title="Details" subtitle="Supporting aggregate tables for closer review.">
                        <div className="doctor-analytics-tabs" role="tablist" aria-label="Analytics detail">
                            {DETAIL_TABS.map(({ key, label }, index) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    id={`analytics-detail-tab-${key}`}
                                    ref={element => { detailTabRefs.current[index] = element; }}
                                    aria-selected={detailTab === key}
                                    aria-controls={`analytics-detail-panel-${key}`}
                                    tabIndex={detailTab === key ? 0 : -1}
                                    className={`clinical-filter-button ${detailTab === key ? 'is-active' : ''}`}
                                    onClick={() => selectDetailTab(key)}
                                    onKeyDown={event => handleDetailTabKeyDown(event, index)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div
                            className="doctor-detail-panel"
                            role="tabpanel"
                            id={`analytics-detail-panel-${detailTab}`}
                            aria-labelledby={`analytics-detail-tab-${detailTab}`}
                        >
                            {detailTab === 'clinical' && (
                                <div className="doctor-recorded-diagnoses">
                                    <h3 className="doctor-detail-heading">Recorded Diagnoses</h3>
                                    {renderSection(data.diagnoses, rows => <FrequencyTable rows={rows} emptyTitle="No diagnosis aggregates" />)}
                                </div>
                            )}
                            {detailTab === 'laboratory' && renderSection(
                                combineResults(data.labCurrentWorkload, data.labActivity),
                                rows => (
                                    <FilterableAggregateTable
                                        rows={rows}
                                        emptyTitle="No lab activity"
                                        emptyDescription="No laboratory aggregate rows were returned for the selected period."
                                        filters={detailFilters}
                                        onChangeFilters={setDetailFilters}
                                    />
                                ),
                            )}
                            {detailTab === 'prescriptions' && renderSection(
                                combineResults(data.prescriptionCurrentWorkload, data.prescriptionPrescribed, data.prescriptionDispensed),
                                rows => (
                                    <FilterableAggregateTable
                                        rows={rows}
                                        emptyTitle="No prescription activity"
                                        emptyDescription="No prescription aggregate rows were returned for the selected period."
                                        filters={detailFilters}
                                        onChangeFilters={setDetailFilters}
                                    />
                                ),
                            )}
                        </div>
                    </SectionPanel>
                </section>
                </div>
                )}

                {activeView === 'geographic' && (
                    <div className="doctor-analytics-view" role="tabpanel" id="analytics-panel-geographic" aria-labelledby="analytics-tab-geographic">
                    <GeographicInsightsSection
                        distributionResult={data.barangayDistribution}
                        heatmapResult={data.barangayHeatmap}
                        selectedHeatmapMetric={selectedHeatmapMetric}
                        onSelectHeatmapMetric={setSelectedHeatmapMetric}
                        drilldownRows={barangayDrilldown}
                        isDrilldownLoading={isBarangayDrilldownLoading}
                        drilldownError={drilldownError}
                        selectedBarangay={selectedBarangay}
                        onSelectBarangay={handleSelectBarangay}
                        onRetry={retryClinicalAnalytics}
                        isRetrying={isLoading}
                    />
                    </div>
                )}

            </div>
            )}
        </div>
    );
}
