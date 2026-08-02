import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuditLogs, type AuditLog, type AuditLogFilters } from './services';
import { Icon } from '../../components/shared/Icon';
import { Button, Card, EmptyState, Input } from '../../components/ui';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { SkeletonList, SkeletonTable } from '../../components/ui/Skeleton';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';

const PAGE_SIZE = 25;
const FILTER_PANEL_MIN_CONTENT_WIDTH = 1120;
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
    create: { label: 'Create', icon: 'plus', className: 'border-[var(--green-border-soft)] bg-[var(--green-surface)] text-[var(--green-text)]' },
    update: { label: 'Update', icon: 'edit', className: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-2)]' },
    login: { label: 'Login', icon: 'lock', className: 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]' },
    logout: { label: 'Logout', icon: 'logout', className: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-2)]' },
    generate: { label: 'Generate Report', icon: 'printer', className: 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]' },
    delete: { label: 'Delete', icon: 'trash', className: 'border-[var(--coral-border)] bg-[var(--coral-tint)] text-[var(--coral-dark)]' },
    archive: { label: 'Archive', icon: 'inbox', className: 'border-[var(--coral-border)] bg-[var(--coral-tint)] text-[var(--coral-dark)]' },
    dispense: { label: 'Dispense', icon: 'pill', className: 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]' },
    view: { label: 'View', icon: 'file-text', className: 'border-[var(--border)] bg-white text-[var(--text-2)]' },
};

const moduleStyles: Record<string, { icon: string; className: string }> = {
    Authentication: { icon: 'lock', className: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]' },
    Administration: { icon: 'shield-plus', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border)]' },
    'Patient Records': { icon: 'id-card', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border-soft)]' },
    Consultation: { icon: 'stethoscope', className: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]' },
    'Census Entry': { icon: 'clipboard', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border-soft)]' },
    Laboratory: { icon: 'flask', className: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]' },
    Pharmacy: { icon: 'pill', className: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]' },
    Reports: { icon: 'chart', className: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]' },
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
        <span className={`inline-flex max-w-full items-center gap-1.5 whitespace-normal rounded-[var(--radius-badge)] border px-2 py-1 text-[length:var(--type-caption-size)] font-semibold ${style.className}`}>
            <Icon name={style.icon} className="h-3.5 w-3.5 shrink-0" />
            {style.label}
        </span>
    );
}

function ModuleBadge({ module }: { module: string }) {
    const style = moduleStyles[module] ?? { icon: 'file-text', className: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border-soft)]' };
    return (
        <span className={`inline-flex max-w-full items-center gap-2 whitespace-normal rounded-[var(--radius-badge)] px-2.5 py-1.5 text-[length:var(--type-caption-size)] font-semibold ring-1 ${style.className}`}>
            <Icon name={style.icon} className="h-3.5 w-3.5 shrink-0" />
            {module}
        </span>
    );
}

function AuditDetailContent({ log, compact = false }: { log: AuditLog; compact?: boolean }) {
    const metadata = safeMetadataEntries(log.metadata);

    return (
        <div className={compact ? 'space-y-3' : 'space-y-5'}>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <ActionBadge action={log.action} />
                    <ModuleBadge module={log.module} />
                </div>
                <p className="break-words text-sm font-semibold text-[var(--text-2)]">{log.description || 'No description recorded.'}</p>
            </div>

            <div className={`grid grid-cols-1 gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
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
                            <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 py-3 text-sm">
                                <dt className="break-words font-bold text-[var(--text-secondary)]">{prettify(key)}</dt>
                                <dd className="break-words font-semibold text-[var(--text)]">{String(value)}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </section>
        </div>
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

    return (
        <ClinicalDrawer
            title="Audit Entry Details"
            labelledBy="audit-details-title"
            onClose={onClose}
            subtitle="Read-only review of a recorded system event."
            className="audit-detail-drawer"
        >
                <div className="mb-3 flex justify-end sm:hidden">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close audit details"
                        className="flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft-surface)]"
                    >
                        <Icon name="close" className="h-4 w-4" />
                    </button>
                </div>
                <AuditDetailContent log={log} />
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

const filterControlClass = 'min-h-[var(--control-height-md)] w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--control-border)] bg-white px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--focus-ring)]';

interface AuditFilterControlsProps {
    filters: AuditLogFilters;
    datePreset: DatePreset;
    activeFilterCount: number;
    setFilter: (key: keyof AuditLogFilters, value: string) => void;
    applyDatePreset: (preset: DatePreset) => void;
    setCustomDate: (key: 'fromDate' | 'toDate', value: string) => void;
    clearFilters: () => void;
    showHeaderClear?: boolean;
    onClose?: () => void;
}

function AuditFilterControls({
    filters,
    datePreset,
    activeFilterCount,
    setFilter,
    applyDatePreset,
    setCustomDate,
    clearFilters,
    showHeaderClear = true,
    onClose,
}: AuditFilterControlsProps) {
    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Icon name="filter" className="h-4 w-4 text-[var(--brand-active)]" />
                        <h3 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">Filters</h3>
                        {activeFilterCount > 0 && (
                            <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-[var(--brand-active)] px-1.5 text-[length:var(--type-caption-size)] font-semibold text-white" aria-label={`${activeFilterCount} active filters`}>
                                {activeFilterCount}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-[length:var(--type-caption-size)] leading-5 text-[var(--text-secondary)]">Narrow the system activity shown in the table.</p>
                </div>
                {showHeaderClear && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={activeFilterCount === 0 && !filters.search} className="shrink-0">
                        Clear all
                    </Button>
                )}
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close filters"
                        className="ml-auto flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft-surface)]"
                    >
                        <Icon name="close" className="h-4 w-4" />
                    </button>
                )}
            </div>

            <fieldset className="space-y-3 border-t border-[var(--border-soft)] pt-4">
                <legend className="mb-3 flex items-center gap-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">
                    <Icon name="calendar" className="h-4 w-4 text-[var(--brand-active)]" />
                    Date range
                </legend>
                <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">Preset</span>
                    <select aria-label="Audit log preset date range" value={datePreset === 'custom' ? '' : datePreset} onChange={(event) => applyDatePreset(event.target.value as DatePreset)} className={filterControlClass}>
                        <option value="" disabled>Preset ranges</option>
                        {DATE_PRESETS.filter(preset => preset.id !== 'custom').map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                </label>
                <Button type="button" variant={datePreset === 'custom' ? 'secondary' : 'outline'} size="sm" onClick={() => applyDatePreset('custom')} aria-pressed={datePreset === 'custom'} className="w-full justify-center">
                    Custom range
                </Button>
                {datePreset === 'custom' && (
                    <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-control)] border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-3 sm:grid-cols-2 xl:grid-cols-1">
                        <label className="flex min-w-0 flex-col gap-1">
                            <span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">Start date</span>
                            <input aria-label="Start date" type="date" value={filters.fromDate ?? ''} onChange={(event) => setCustomDate('fromDate', event.target.value)} className={filterControlClass} />
                        </label>
                        <label className="flex min-w-0 flex-col gap-1">
                            <span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">End date</span>
                            <input aria-label="End date" type="date" value={filters.toDate ?? ''} onChange={(event) => setCustomDate('toDate', event.target.value)} className={filterControlClass} />
                        </label>
                    </div>
                )}
            </fieldset>

            <div className="space-y-3 border-t border-[var(--border-soft)] pt-4">
                <Input label="User" value={filters.user ?? ''} onChange={(event) => setFilter('user', event.target.value)} placeholder="Filter by user" />
                <label className="flex min-w-0 flex-col gap-1"><span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">Role</span><select aria-label="Filter audit logs by role" value={filters.role ?? ''} onChange={(event) => setFilter('role', event.target.value)} className={filterControlClass}>
                    <option value="">All roles</option>
                    {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                </select></label>
                <label className="flex min-w-0 flex-col gap-1"><span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">Module</span><select aria-label="Filter audit logs by module" value={filters.module ?? ''} onChange={(event) => setFilter('module', event.target.value)} className={filterControlClass}>
                    <option value="">All modules</option>
                    {MODULES.map(module => <option key={module} value={module}>{module}</option>)}
                </select></label>
                <label className="flex min-w-0 flex-col gap-1"><span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">Action</span><select aria-label="Filter audit logs by action" value={filters.action ?? ''} onChange={(event) => setFilter('action', event.target.value)} className={filterControlClass}>
                    <option value="">All actions</option>
                    {ACTIONS.map(action => <option key={action} value={action}>{actionStyles[action]?.label ?? prettify(action)}</option>)}
                </select></label>
                <label className="flex min-w-0 flex-col gap-1"><span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">Record</span><select aria-label="Filter audit logs by record type" value={filters.recordType ?? ''} onChange={(event) => setFilter('recordType', event.target.value)} className={filterControlClass}>
                    <option value="">All records</option>
                    {RECORD_TYPES.map(type => <option key={type} value={type}>{prettify(type)}</option>)}
                </select></label>
            </div>
        </div>
    );
}

export function AuditLogPage() {
    const layoutRef = useRef<HTMLDivElement>(null);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaging, setIsPaging] = useState(false);
    const [error, setError] = useState('');
    const [page, setPage] = useState(0);
    const [filters, setFilters] = useState<AuditLogFilters>({ pageSize: PAGE_SIZE });
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [desktopWorkspaceHeight, setDesktopWorkspaceHeight] = useState<number | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

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
                if (!cancelled) {
                    setIsLoading(false);
                    setIsPaging(false);
                }
            }
        }
        void loadLogs();
        return () => { cancelled = true; };
    }, [queryFilters, reloadToken]);

    useEffect(() => {
        const layout = layoutRef.current;
        if (!layout) return;

        const updateLayout = (width: number) => {
            const canFitPanel = width >= FILTER_PANEL_MIN_CONTENT_WIDTH;
            setShowFilterPanel(canFitPanel);
            if (canFitPanel) setIsFilterDrawerOpen(false);
        };

        const layoutStyle = window.getComputedStyle(layout);
        const initialContentWidth = layout.clientWidth
            - Number.parseFloat(layoutStyle.paddingLeft)
            - Number.parseFloat(layoutStyle.paddingRight);
        updateLayout(initialContentWidth);
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) updateLayout(entry.contentRect.width);
        });
        observer.observe(layout);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const updateWorkspaceHeight = () => {
            const layout = layoutRef.current;
            if (!layout) return;
            setDesktopWorkspaceHeight(Math.max(0, window.innerHeight - layout.getBoundingClientRect().top));
        };

        updateWorkspaceHeight();
        window.addEventListener('resize', updateWorkspaceHeight);
        return () => window.removeEventListener('resize', updateWorkspaceHeight);
    }, []);

    const setFilter = (key: keyof AuditLogFilters, value: string) => {
        setIsPaging(false);
        setPage(0);
        setFilters(prev => ({ ...prev, [key]: value || undefined }));
    };

    const applyDatePreset = (preset: DatePreset) => {
        setIsPaging(false);
        setPage(0);
        setDatePreset(preset);
        if (preset === 'custom') return;
        setFilters(prev => ({ ...prev, ...getPresetRange(preset) }));
    };

    const setCustomDate = (key: 'fromDate' | 'toDate', value: string) => {
        setDatePreset('custom');
        setFilter(key, value);
    };

    const clearFilters = () => {
        setIsPaging(false);
        setPage(0);
        setDatePreset('all');
        setFilters({ pageSize: PAGE_SIZE });
    };

    const activeFilters: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filters.search) activeFilters.push({ key: 'search', label: `Search: ${filters.search}`, clear: () => setFilter('search', '') });
    if (datePreset !== 'all') activeFilters.push({ key: 'date', label: datePreset === 'custom' ? 'Custom date range' : DATE_PRESETS.find(preset => preset.id === datePreset)?.label ?? 'Date range', clear: () => applyDatePreset('all') });
    if (filters.user) activeFilters.push({ key: 'user', label: `User: ${filters.user}`, clear: () => setFilter('user', '') });
    if (filters.role) activeFilters.push({ key: 'role', label: `Role: ${prettify(filters.role)}`, clear: () => setFilter('role', '') });
    if (filters.module) activeFilters.push({ key: 'module', label: `Module: ${filters.module}`, clear: () => setFilter('module', '') });
    if (filters.action) activeFilters.push({ key: 'action', label: `Action: ${actionStyles[filters.action]?.label ?? prettify(filters.action)}`, clear: () => setFilter('action', '') });
    if (filters.recordType) activeFilters.push({ key: 'recordType', label: `Record: ${prettify(filters.recordType)}`, clear: () => setFilter('recordType', '') });
    const activeFilterCount = activeFilters.length;

    const openLogDetails = (log: AuditLog) => {
        setSelectedLog(log);
    };

    const changePage = (nextPage: number) => {
        const boundedPage = Math.max(0, Math.min(nextPage, pageCount - 1));
        if (boundedPage === page) return;
        setIsPaging(true);
        setPage(boundedPage);
    };

    const filterControls = (
        <AuditFilterControls
            filters={filters}
            datePreset={datePreset}
            activeFilterCount={activeFilterCount}
            setFilter={setFilter}
            applyDatePreset={applyDatePreset}
            setCustomDate={setCustomDate}
            clearFilters={clearFilters}
        />
    );

    return (
        <div
            ref={layoutRef}
            className="pwa-page-pad min-w-0 max-w-full overflow-x-hidden"
            style={showFilterPanel && desktopWorkspaceHeight !== null ? { height: desktopWorkspaceHeight } : undefined}
        >
            <div className={`grid min-w-0 max-w-full gap-5 ${showFilterPanel ? 'h-full min-h-0 grid-cols-[minmax(0,1fr)_18rem] items-stretch' : 'grid-cols-1'}`}>
            <Card className={`min-w-0 overflow-hidden ${showFilterPanel ? 'flex min-h-0 flex-col' : ''}`}>
                <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5">
                    <div>
                        <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">System Activity</h2>
                        <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">Read-only administrative and clinical governance history.</p>
                        <p className="mt-3 flex max-w-3xl gap-2 text-[length:var(--type-caption-size)] leading-5 text-[var(--text-secondary)]">
                            <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-2)]" />
                            User activities are recorded for accountability, security, and compliance with the Philippine Data Privacy Act of 2012.
                        </p>
                    </div>
                </div>

                <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <Input label="Search activity" value={filters.search ?? ''} onChange={(event) => setFilter('search', event.target.value)} placeholder="User, record, module, or description" leadingIcon={<Icon name="search" className="h-4 w-4" />} containerClassName="min-w-0 flex-1" />
                        {!showFilterPanel && (
                            <Button type="button" variant="outline" onClick={() => setIsFilterDrawerOpen(true)} aria-haspopup="dialog" aria-expanded={isFilterDrawerOpen} leadingIcon={<Icon name="filter" className="h-4 w-4" />} className="min-h-[var(--control-height-md)] shrink-0 justify-center">
                                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                            </Button>
                        )}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-wrap gap-2" aria-label="Active audit log filters">
                            {activeFilters.length === 0 ? (
                                <span className="text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">No filters applied</span>
                            ) : activeFilters.map(filter => (
                                <button key={filter.key} type="button" onClick={filter.clear} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] px-3 text-[length:var(--type-caption-size)] font-medium text-[var(--brand-active)] transition-colors hover:bg-[var(--brand-accent-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]" aria-label={`Remove ${filter.label} filter`}>
                                    <span className="truncate">{filter.label}</span>
                                    <Icon name="close" className="h-3.5 w-3.5 shrink-0" />
                                </button>
                            ))}
                        </div>
                        <div className="shrink-0 text-[length:var(--type-caption-size)] font-semibold text-[var(--text-secondary)]" aria-live="polite">
                            {count} matching {count === 1 ? 'entry' : 'entries'}
                        </div>
                    </div>
                </div>

                <div className={showFilterPanel ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : ''}>
                {isLoading && !isPaging ? (
                    <>
                        <div className="hidden min-w-0 overflow-hidden sm:block">
                            <table aria-busy={isPaging} className="clinical-table w-full table-fixed [&_td]:px-2 [&_th]:px-2 sm:[&_td]:px-3 sm:[&_th]:px-3">
                                <colgroup>
                                    <col className="w-[24%]" />
                                    <col className="w-[28%]" />
                                    <col className="w-[22%]" />
                                    <col className="w-[26%]" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Actor</th>
                                        <th>Action</th>
                                        <th>Module</th>
                                    </tr>
                                </thead>
                                <tbody className={isPaging ? 'opacity-60' : undefined}>
                                    <tr><td colSpan={4}><SkeletonTable rows={6} columns={4} /></td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="min-w-0 px-4 py-2 sm:hidden">
                            <SkeletonList rows={6} />
                        </div>
                    </>
                ) : error ? (
                    <div role="alert" className="m-4 rounded-lg border border-[var(--coral-border)] bg-[var(--coral-tint)] p-4 text-sm font-semibold text-[var(--coral-dark)]">
                        <p>{error}</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReloadToken(value => value + 1)}
                            disabled={isLoading}
                            className="mt-3"
                        >
                            Retry
                        </Button>
                    </div>
                ) : logs.length === 0 ? (
                    <EmptyState title="No audit logs found" description="Try adjusting the filters or date range." />
                ) : (
                    <div className="min-w-0">
                    <div className="hidden min-w-0 overflow-hidden sm:block">
                        <table className="clinical-table w-full table-fixed [&_td]:px-2 [&_th]:px-2 sm:[&_td]:px-3 sm:[&_th]:px-3">
                            <colgroup>
                                <col className="w-[24%]" />
                                <col className="w-[28%]" />
                                <col className="w-[22%]" />
                                <col className="w-[26%]" />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>Module</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr
                                        key={log.id}
                                        tabIndex={0}
                                        aria-label={`View audit entry by ${log.user_name || 'Unknown user'} from ${formatTimestamp(log.created_at)}`}
                                        onClick={() => openLogDetails(log)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                openLogDetails(log);
                                            }
                                        }}
                                        className={`cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-color)] ${selectedLog?.id === log.id ? 'bg-[var(--brand-soft-surface)]' : ''}`}
                                    >
                                        <td className="break-words text-xs font-bold leading-5 text-[var(--text-2)]">{formatTimestamp(log.created_at)}</td>
                                        <td className="min-w-0">
                                            <div className="break-words text-sm font-bold text-[var(--text)]">{log.user_name || 'Unknown user'}</div>
                                            <div className="break-words text-xs font-semibold text-[var(--text-secondary)]">{prettify(log.user_role)}</div>
                                        </td>
                                        <td><ActionBadge action={log.action} /></td>
                                        <td><ModuleBadge module={log.module} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="min-w-0 divide-y divide-[var(--border-soft)] sm:hidden">
                        {logs.map(log => (
                            <div
                                key={log.id}
                                role="button"
                                tabIndex={0}
                                aria-label={`View audit entry by ${log.user_name || 'Unknown user'} from ${formatTimestamp(log.created_at)}`}
                                onClick={() => openLogDetails(log)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openLogDetails(log);
                                    }
                                }}
                                className={`flex min-w-0 flex-col gap-2 px-4 py-3 cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-color)] ${selectedLog?.id === log.id ? 'bg-[var(--brand-soft-surface)]' : ''}`}
                            >
                                <div className="text-xs font-bold leading-5 text-[var(--text-2)]">{formatTimestamp(log.created_at)}</div>
                                <div className="min-w-0">
                                    <div className="break-words text-sm font-bold text-[var(--text)]">{log.user_name || 'Unknown user'}</div>
                                    <div className="break-words text-xs font-semibold text-[var(--text-secondary)]">{prettify(log.user_role)}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <ActionBadge action={log.action} />
                                    <ModuleBadge module={log.module} />
                                </div>
                            </div>
                        ))}
                    </div>
                    </div>
                )}
                </div>

                <div className="shrink-0 flex flex-col gap-3 border-t border-[var(--border-soft)] bg-[var(--surface-subtle)]/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-2)]">
                        <span>Showing {visibleCount} of {count} audit entries.</span>
                        {isPaging && <span role="status" className="font-medium text-[var(--brand-active)]">Updating results...</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => changePage(page - 1)} disabled={page === 0 || isPaging}>
                            Previous
                        </Button>
                        <span className="text-[length:var(--type-caption-size)] font-semibold text-[var(--text-secondary)]" aria-live="polite">Page {page + 1} of {pageCount}</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => changePage(page + 1)} disabled={page >= pageCount - 1 || isPaging}>
                            Next
                        </Button>
                    </div>
                </div>
            </Card>

            {showFilterPanel && (
                <aside className="min-w-0 self-start rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]" aria-label="Audit log filters">
                    {filterControls}
                </aside>
            )}
            </div>

            {isFilterDrawerOpen && !showFilterPanel && (
                <ClinicalDrawer
                    title="Filters"
                    labelledBy="audit-filter-drawer-title"
                    subtitle={`${activeFilterCount} active ${activeFilterCount === 1 ? 'filter' : 'filters'}`}
                    onClose={() => setIsFilterDrawerOpen(false)}
                    closeLabel="Close filters"
                    className="audit-filter-drawer max-w-[420px] [&_.clinical-drawer-header_button]:h-11 [&_.clinical-drawer-header_button]:w-11 [&_.clinical-drawer-header_button]:text-[var(--text)]"
                    footer={(
                        <div className="w-full">
                            <Button type="button" variant="outline" onClick={clearFilters} disabled={activeFilterCount === 0} className="w-full justify-center rounded-full">Clear all</Button>
                        </div>
                    )}
                >
                    <AuditFilterControls
                        filters={filters}
                        datePreset={datePreset}
                        activeFilterCount={activeFilterCount}
                        setFilter={setFilter}
                        applyDatePreset={applyDatePreset}
                        setCustomDate={setCustomDate}
                        clearFilters={clearFilters}
                        showHeaderClear={false}
                        onClose={() => setIsFilterDrawerOpen(false)}
                    />
                </ClinicalDrawer>
            )}

            <DetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
}
