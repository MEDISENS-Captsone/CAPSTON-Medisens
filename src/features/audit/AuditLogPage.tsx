import { useEffect, useMemo, useState } from 'react';
import { fetchAuditLogs, type AuditLog, type AuditLogFilters } from './services';
import { Icon } from '../../components/shared/Icon';
import { EmptyState } from '../../components/shared/EmptyState';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';

const PAGE_SIZE = 25;
const ROLES = ['admin', 'doctor', 'nurse', 'BHW', 'midwives', 'pharmacist', 'labaratory'];
const MODULES = ['Authentication', 'Administration', 'Patient Records', 'Consultation', 'Census Entry', 'Laboratory', 'Pharmacy', 'Reports'];
const ACTIONS = ['login', 'logout', 'create', 'update', 'view', 'generate', 'dispense', 'delete', 'archive'];
const RECORD_TYPES = ['profile', 'patient', 'consultation', 'initial_consultation', 'fhsis_log', 'lab_request', 'lab_result', 'prescription', 'report'];
const DOT = '\u2022';
type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';

const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'lastMonth', label: 'Last Month' },
    { id: 'all', label: 'All Time' },
    { id: 'custom', label: 'Custom Range' },
];

const actionStyles: Record<string, { label: string; icon: string; className: string }> = {
    create: { label: 'Create', icon: 'plus', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    update: { label: 'Update', icon: 'edit', className: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-2)]' },
    login: { label: 'Login', icon: 'lock', className: 'border-violet-200 bg-violet-50 text-violet-700' },
    logout: { label: 'Logout', icon: 'logout', className: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-2)]' },
    generate: { label: 'Generate Report', icon: 'printer', className: 'border-orange-200 bg-orange-50 text-orange-700' },
    delete: { label: 'Delete', icon: 'trash', className: 'border-red-200 bg-red-50 text-red-700' },
    archive: { label: 'Archive', icon: 'inbox', className: 'border-red-200 bg-red-50 text-red-700' },
    dispense: { label: 'Dispense', icon: 'pill', className: 'border-teal-200 bg-teal-50 text-teal-700' },
    view: { label: 'View', icon: 'file-text', className: 'border-[var(--border)] bg-white text-[var(--text-2)]' },
};

const moduleStyles: Record<string, { icon: string; className: string }> = {
    Authentication: { icon: 'lock', className: 'bg-violet-50 text-violet-700 ring-violet-100' },
    Administration: { icon: 'shield-plus', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border)]' },
    'Patient Records': { icon: 'id-card', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border-soft)]' },
    Consultation: { icon: 'stethoscope', className: 'bg-teal-50 text-teal-700 ring-teal-100' },
    'Census Entry': { icon: 'clipboard', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border-soft)]' },
    Laboratory: { icon: 'flask', className: 'bg-purple-50 text-purple-700 ring-purple-100' },
    Pharmacy: { icon: 'pill', className: 'bg-teal-50 text-teal-700 ring-teal-100' },
    Reports: { icon: 'chart', className: 'bg-orange-50 text-orange-700 ring-orange-100' },
};

function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const time = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

    if (target === today) return `Today ${DOT} ${time}`;
    if (target === today - 86400000) return `Yesterday ${DOT} ${time}`;
    return `${date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} ${DOT} ${time}`;
}

function todayInputValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPresetRange(range: Exclude<DatePreset, 'custom'>): Pick<AuditLogFilters, 'fromDate' | 'toDate'> {
    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);

    if (range === 'all') return { fromDate: undefined, toDate: undefined };
    if (range === 'yesterday') {
        from.setDate(now.getDate() - 1);
        to.setDate(now.getDate() - 1);
    }
    if (range === '7d') from.setDate(now.getDate() - 6);
    if (range === '30d') from.setDate(now.getDate() - 29);
    if (range === 'thisMonth') from.setDate(1);
    if (range === 'lastMonth') {
        from.setMonth(now.getMonth() - 1, 1);
        to.setDate(0);
    }

    return { fromDate: todayInputValue(from), toDate: todayInputValue(to) };
}

function prettify(value: string | null | undefined) {
    if (!value) return '-';
    return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function formatRecord(log: AuditLog) {
    if (log.related_patient_label) return log.related_patient_label;
    if (log.record_type === 'patient' && log.record_id) return `Patient #${log.record_id}`;
    if (!log.record_id && !log.record_type) return '-';
    return `${prettify(log.record_type)}${log.record_id ? ` #${shortId(log.record_id)}` : ''}`;
}

function shortId(value: string) {
    return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function safeMetadataEntries(metadata: Record<string, unknown>) {
    return Object.entries(metadata || {}).filter(([, value]) => value == null || ['string', 'number', 'boolean'].includes(typeof value));
}

function ActionBadge({ action }: { action: string }) {
    const style = actionStyles[action] ?? { label: prettify(action), icon: 'file-text', className: 'border-[var(--border)] bg-white text-[var(--text-2)]' };
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${style.className}`}>
            <Icon name={style.icon} className="h-3.5 w-3.5" />
            {style.label}
        </span>
    );
}

function ModuleBadge({ module }: { module: string }) {
    const style = moduleStyles[module] ?? { icon: 'file-text', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border-soft)]' };
    return (
        <span className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold ring-1 ${style.className}`}>
            <Icon name={style.icon} className="h-3.5 w-3.5" />
            {module}
        </span>
    );
}

function DetailDrawer({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
    useEffect(() => {
        if (!log) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [log, onClose]);

    if (!log) return null;

    const metadata = safeMetadataEntries(log.metadata);

    return (
        <ClinicalDrawer
            title="Audit Entry Details"
            labelledBy="audit-details-title"
            onClose={onClose}
            subtitle="Read-only review of a recorded system event."
            className="max-w-[560px]"
        >
                <div className="space-y-5">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <ActionBadge action={log.action} />
                            <ModuleBadge module={log.module} />
                        </div>
                        <p className="text-sm font-semibold text-[var(--text-2)]">{log.description || 'No description recorded.'}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DetailItem label="User" value={log.user_name || 'Unknown user'} />
                        <DetailItem label="Role" value={prettify(log.user_role)} />
                        <DetailItem label="Date & Time" value={formatTimestamp(log.created_at)} />
                        <DetailItem label="Affected Record" value={formatRecord(log)} />
                        <DetailItem label="Module" value={log.module} />
                        <DetailItem label="Action" value={actionStyles[log.action]?.label ?? prettify(log.action)} />
                    </div>

                    <section className="rounded-lg border border-[var(--border)]">
                        <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Safe Metadata</h4>
                        </div>
                        {metadata.length === 0 ? (
                            <p className="px-4 py-4 text-sm font-medium text-[var(--text-secondary)]">No safe metadata was recorded for this event.</p>
                        ) : (
                            <dl className="divide-y divide-[var(--border-soft)]">
                                {metadata.map(([key, value]) => (
                                    <div key={key} className="grid grid-cols-2 gap-3 px-4 py-3 text-sm">
                                        <dt className="font-bold text-[var(--text-secondary)]">{prettify(key)}</dt>
                                        <dd className="break-words font-semibold text-[var(--text)]">{String(value)}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </section>
                </div>
        </ClinicalDrawer>
    );
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--text)]">{value || '-'}</div>
        </div>
    );
}

export function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(0);
    const [filters, setFilters] = useState<AuditLogFilters>({ pageSize: PAGE_SIZE });
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    const pageCount = Math.max(Math.ceil(count / PAGE_SIZE), 1);
    const queryFilters = useMemo(() => ({ ...filters, page, pageSize: PAGE_SIZE }), [filters, page]);
    const visibleCount = logs.length;

    useEffect(() => {
        let cancelled = false;
        async function loadLogs() {
            setIsLoading(true);
            setError('');
            try {
                const result = await fetchAuditLogs(queryFilters);
                if (!cancelled) {
                    setLogs(result.logs);
                    setCount(result.count);
                }
            } catch (loadError) {
                logError('Failed to load audit logs', loadError);
                if (!cancelled) setError(healthcareErrorMessage('load audit logs'));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        void loadLogs();
        return () => { cancelled = true; };
    }, [queryFilters]);

    const setFilter = (key: keyof AuditLogFilters, value: string) => {
        setPage(0);
        setFilters(prev => ({ ...prev, [key]: value || undefined }));
    };

    const applyDatePreset = (preset: DatePreset) => {
        setPage(0);
        setDatePreset(preset);
        if (preset === 'custom') return;
        setFilters(prev => ({ ...prev, ...getPresetRange(preset) }));
    };

    const datePresetButtonClass = (preset: DatePreset) => (
        datePreset === preset
            ? 'clinical-filter-button is-active'
            : 'clinical-filter-button'
    );

    const setCustomDate = (key: 'fromDate' | 'toDate', value: string) => {
        setDatePreset('custom');
        setFilter(key, value);
    };

    return (
        <div className="pwa-page-pad flex flex-col pwa-panel-gap">
            <section className="ops-panel overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--surface-subtle)]/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-base font-bold text-[var(--text)]">Audit Log</h2>
                        <p className="text-sm font-medium text-[var(--text-secondary)]">Read-only system activity log for administrative and clinical governance review.</p>
                        <p className="mt-2 flex max-w-3xl gap-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                            <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-2)]" />
                            User activities are recorded for accountability, security, and compliance with the Philippine Data Privacy Act of 2012.
                        </p>
                    </div>
                    <div className="flex max-w-full flex-wrap gap-2" aria-label="Audit log date presets">
                        {DATE_PRESETS.map(preset => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyDatePreset(preset.id)}
                                className={`${datePresetButtonClass(preset.id)} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]`}
                                aria-pressed={datePreset === preset.id}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 border-b border-[var(--border-soft)] bg-white p-4 lg:grid-cols-12">
                    <label className="lg:col-span-4">
                        <span className="sr-only">Search audit logs</span>
                        <div className="relative">
                            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                value={filters.search ?? ''}
                                onChange={(event) => setFilter('search', event.target.value)}
                                placeholder="Search user, patient, ID, module, description..."
                                className="w-full rounded-lg border border-[var(--border)] py-2 pl-9 pr-3 text-sm font-medium text-[var(--text-2)] outline-none focus:border-[var(--focus-color)] focus:ring-2 focus:ring-[var(--focus-ring)]"
                            />
                        </div>
                    </label>
                    <input aria-label="Filter audit logs by user" value={filters.user ?? ''} onChange={(event) => setFilter('user', event.target.value)} placeholder="Filter by user" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-2)] outline-none focus:border-[var(--focus-color)] focus:ring-2 focus:ring-[var(--focus-ring)] lg:col-span-2" />
                    <select aria-label="Filter audit logs by role" value={filters.role ?? ''} onChange={(event) => setFilter('role', event.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-2)] lg:col-span-2">
                        <option value="">All roles</option>
                        {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <select aria-label="Filter audit logs by module" value={filters.module ?? ''} onChange={(event) => setFilter('module', event.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-2)] lg:col-span-2">
                        <option value="">All modules</option>
                        {MODULES.map(module => <option key={module} value={module}>{module}</option>)}
                    </select>
                    <select aria-label="Filter audit logs by action" value={filters.action ?? ''} onChange={(event) => setFilter('action', event.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-2)] lg:col-span-1">
                        <option value="">All actions</option>
                        {ACTIONS.map(action => <option key={action} value={action}>{actionStyles[action]?.label ?? prettify(action)}</option>)}
                    </select>
                    <select aria-label="Filter audit logs by record type" value={filters.recordType ?? ''} onChange={(event) => setFilter('recordType', event.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-2)] lg:col-span-1">
                        <option value="">All records</option>
                        {RECORD_TYPES.map(type => <option key={type} value={type}>{prettify(type)}</option>)}
                    </select>
                </div>

                {datePreset === 'custom' && (
                    <div className="grid grid-cols-1 gap-3 border-b border-[var(--border-soft)] bg-[var(--surface-subtle)]/70 px-4 py-3 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                            <Icon name="calendar" className="h-4 w-4 text-[var(--text-2)]" />
                            Custom Range
                        </div>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">Start date</span>
                            <input aria-label="Start date" type="date" value={filters.fromDate ?? ''} onChange={(event) => setCustomDate('fromDate', event.target.value)} className="min-w-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)]" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">End date</span>
                            <input aria-label="End date" type="date" value={filters.toDate ?? ''} onChange={(event) => setCustomDate('toDate', event.target.value)} className="min-w-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)]" />
                        </label>
                    </div>
                )}

                {isLoading ? (
                    <div className="clinical-table-scroll">
                        <table className="clinical-table min-w-[1100px]">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>Module</th>
                                    <th>Affected Record</th>
                                    <th>Description</th>
                                    <th className="text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td colSpan={7}><SkeletonTable rows={6} columns={7} /></td></tr>
                            </tbody>
                        </table>
                    </div>
                ) : error ? (
                    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
                ) : logs.length === 0 ? (
                    <EmptyState title="No audit logs found" description="Try adjusting the filters or date range." />
                ) : (
                    <div className="clinical-table-scroll">
                        <table className="clinical-table min-w-[1100px]">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>Module</th>
                                    <th>Affected Record</th>
                                    <th>Description</th>
                                    <th className="text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id}>
                                        <td className="whitespace-nowrap text-xs font-bold text-[var(--text-2)]">{formatTimestamp(log.created_at)}</td>
                                        <td>
                                            <div className="font-bold text-[var(--text)]">{log.user_name || 'Unknown user'}</div>
                                            <div className="text-xs font-semibold text-[var(--text-secondary)]">{prettify(log.user_role)}</div>
                                        </td>
                                        <td><ActionBadge action={log.action} /></td>
                                        <td><ModuleBadge module={log.module} /></td>
                                        <td className="max-w-[260px]">
                                            <div className="truncate text-sm font-bold text-[var(--text)]">{formatRecord(log)}</div>
                                            <div className="text-xs font-semibold text-[var(--text-muted)]">{prettify(log.record_type)}</div>
                                        </td>
                                        <td className="max-w-[320px]">
                                            <div className="line-clamp-2 text-sm font-medium text-[var(--text-2)]">{log.description || '-'}</div>
                                        </td>
                                        <td className="text-right">
                                            <button type="button" onClick={() => setSelectedLog(log)} className="clinical-row-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]">
                                                <Icon name="file-text" className="h-3.5 w-3.5" />
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex flex-col gap-3 border-t border-[var(--border-soft)] bg-[var(--surface-subtle)]/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-bold text-[var(--text-2)]">Showing {visibleCount} of {count} audit entries.</div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setPage(value => Math.max(value - 1, 0))} disabled={page === 0} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-subtle)] disabled:opacity-50">
                            Previous
                        </button>
                        <span className="text-xs font-bold text-[var(--text-2)]">Page {page + 1} of {pageCount}</span>
                        <button type="button" onClick={() => setPage(value => Math.min(value + 1, pageCount - 1))} disabled={page >= pageCount - 1} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-subtle)] disabled:opacity-50">
                            Next
                        </button>
                    </div>
                </div>
            </section>

            <DetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
}
