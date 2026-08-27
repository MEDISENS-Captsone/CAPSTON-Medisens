import { useState, useEffect } from 'react';
import { Icon } from '../../components/shared/Icon';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { useToast } from '../../components/feedback/Toast';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useHashPage } from '../../hooks/useHashPage';
import { Topbar } from '../../components/layout/Topbar';
import { PageHeader } from '../../components/layout/PageHeader';
import { LabRequestDetail } from './LabRequestDetail';
import { LabEncodePanel } from './LabEncodePanel';
import { LabRequestsPage } from './LabRequestsPage';
import { LabResultsPage } from './LabResultsPage';
import { LabAnalyticsPage } from './LabAnalyticsPage';
import {
    type LabRequest,
    type PatientRow,
    LAB_REQUEST_QUEUE_LIMIT,
    LAB_REQUEST_COLUMNS,
    formatDisplayDate,
    getTestSummary,
} from './types';

const LAB_PAGES = ['dashboard', 'lab-requests', 'results', 'analytics'] as const;
type LabPage = typeof LAB_PAGES[number];

function normalizeLabPage(page: string): LabPage {
    return (LAB_PAGES as readonly string[]).includes(page) ? (page as LabPage) : 'dashboard';
}

const DASHBOARD_PREVIEW_LIMIT = 5;

const LaboratoryDashboard = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [activePage, setActivePage] = useHashPage('dashboard', normalizeLabPage);

    const isOnline = useOnlineStatus();
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('?');

    const [requests, setRequests] = useState<LabRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
    const { showToast, ToastComponent } = useToast();

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'flask', group: 'Diagnostics' },
        { id: 'lab-requests', label: 'Lab Requests', icon: 'clipboard', group: 'Diagnostics' },
        { id: 'results', label: 'Results', icon: 'check', group: 'Diagnostics' },
        { id: 'analytics', label: 'Analytics', icon: 'chart', group: 'Insights' },
    ];

    useEffect(() => {
        const fetchData = async () => {
            const profile = await requireRole('labaratory');
            const name = profile.fullName || 'Lab User';
            setUserName(name);
            setUserInitials(getInitials(name));

            await loadRequests(true);
        };

        fetchData();

        const channel = supabase
            .channel('lab-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lab_request' }, () => loadRequests(false))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lab_request' }, () => loadRequests(false))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_result' }, () => loadRequests(false))
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Gentle background fallback sync (every 30s) alongside the instant Realtime WebSocket channel
    useEffect(() => {
        const interval = setInterval(() => {
            if (isOnline) {
                loadRequests(false);
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [isOnline]);

    const loadRequests = async (showSpinner = false) => {
        if (showSpinner) setLoading(true);
        try {
            const { data: labData, error } = await supabase
                .from('lab_request')
                .select(LAB_REQUEST_COLUMNS)
                .order('labrequest_id', { ascending: false })
                .limit(LAB_REQUEST_QUEUE_LIMIT);

            if (error) throw error;

            if (labData && labData.length > 0) {
                let typedLabData = labData as LabRequest[];
                const patientIds = [...new Set(
                    typedLabData.map(r => r.patient_id).filter((id): id is number => id !== null && id !== undefined)
                )];

                let patientMap: Record<number, PatientRow> = {};

                if (patientIds.length > 0) {
                    const { data: patientData, error: patientError } = await supabase
                        .from('patients')
                        .select('id, firstName, lastName, age, sex')
                        .eq('archive_status', 'active')
                        .in('id', patientIds);

                    if (patientError) console.error('Failed to fetch patients:', patientError.message);

                    (patientData || []).forEach((p: PatientRow) => {
                        patientMap[p.id] = p;
                    });

                    typedLabData = typedLabData.filter(request => !request.patient_id || Boolean(patientMap[request.patient_id]));
                }

                const labrequestIds = typedLabData.map(r => r.labrequest_id);
                const { data: labResultData } = await supabase
                    .from('lab_result')
                    .select('labresult_id, labrequest_id, status, date_performed')
                    .in('labrequest_id', labrequestIds);

                // A request can only have one current result (services.ts upserts rather
                // than appends), but if more than one row is ever present, keep the latest
                // by labresult_id so "Completed Today" reflects the current result's date.
                const completedDateByRequest = new Map<number, string | null>();
                const latestResultIdByRequest = new Map<number, number>();
                ((labResultData || []) as { labresult_id: number; labrequest_id: number; status: string | null; date_performed: string | null }[])
                    .filter(lr => lr.status === 'Completed')
                    .forEach(lr => {
                        const currentLatest = latestResultIdByRequest.get(lr.labrequest_id) ?? -1;
                        if (lr.labresult_id >= currentLatest) {
                            latestResultIdByRequest.set(lr.labrequest_id, lr.labresult_id);
                            completedDateByRequest.set(lr.labrequest_id, lr.date_performed);
                        }
                    });

                const enriched: LabRequest[] = typedLabData.map(r => {
                    const p = r.patient_id != null ? patientMap[r.patient_id] : null;

                    const resolvedStatus = completedDateByRequest.has(r.labrequest_id)
                        ? 'Completed'
                        : (r.status ?? null);

                    return {
                        ...r,
                        status: resolvedStatus,
                        completed_date: completedDateByRequest.get(r.labrequest_id) ?? null,
                        patient_firstName: p?.firstName ?? undefined,
                        patient_lastName: p?.lastName ?? undefined,
                        patient_age: p?.age ?? null,
                        patient_sex: p?.sex ?? undefined,
                    };
                });

                setRequests(enriched);
            } else {
                setRequests([]);
            }
            setLoadError(false);
        } catch (err) {
            logError('Failed to load lab requests', err);
            setLoadError(true);
            showToast(healthcareErrorMessage("load laboratory requests"), true);
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    const handleStatusUpdate = (id: number, status: string) => {
        setRequests(prev => prev.map(r =>
            r.labrequest_id === id ? { ...r, status } : r
        ));
        if (selectedRequest?.labrequest_id === id) {
            setSelectedRequest(prev => prev ? { ...prev, status } : prev);
        }
    };

    const todayStr = new Date().toISOString().slice(0, 10);

    const stats = {
        total: requests.length,
        pending: requests.filter(r => !r.status || r.status === 'Pending').length,
        completedToday: requests.filter(r => r.status === 'Completed' && r.completed_date?.slice(0, 10) === todayStr).length,
        requestsToday: requests.filter(r => r.request_date?.slice(0, 10) === todayStr).length,
    };

    // Oldest-first: requests waiting longest surface first in the preview.
    const pendingPreview = requests
        .filter(r => !r.status || r.status === 'Pending')
        .slice()
        .sort((a, b) => (a.request_date ?? '').localeCompare(b.request_date ?? ''))
        .slice(0, DASHBOARD_PREVIEW_LIMIT);

    const last7DaysCount = requests.filter(r => {
        if (!r.request_date) return false;
        const d = new Date(r.request_date);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        return d >= cutoff;
    }).length;

    return (
        <div className="laboratory-dashboard-workspace flex h-screen bg-[var(--bg)] overflow-hidden w-full">
            <ToastComponent />
            <Sidebar
                activePage={activePage}
                userName={userName}
                userInitials={userInitials}
                userRole="Laboratory"
                navItems={navItems}
                onNavigate={(id) => setActivePage(id)}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="app-shell-main flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">
                <Topbar
                    title="Diagnostic Laboratory"
                    sectionLabel=""
                    userName={userName}
                    userInitials={userInitials}
                    userRole="Laboratory Staff"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                    isNavigationOpen={isMobileMenuOpen}
                />

                <div className="app-content-canvas flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    {activePage === 'lab-requests' && (
                        <LabRequestsPage
                            requests={requests}
                            loading={loading}
                            loadError={loadError}
                            onRetry={() => void loadRequests(true)}
                            onSelectRequest={setSelectedRequest}
                        />
                    )}
                    {activePage === 'results' && (
                        <LabResultsPage
                            requests={requests}
                            loading={loading}
                            loadError={loadError}
                            onRetry={() => void loadRequests(true)}
                            onSelectRequest={setSelectedRequest}
                        />
                    )}
                    {activePage === 'analytics' && <LabAnalyticsPage requests={requests} />}
                    {activePage === 'dashboard' && (
                    <div className="role-workspace-canvas w-full">
                        <PageHeader
                            title="Dashboard"
                            subtitle="Overview of laboratory workload and recent activity."
                        />

                        {/* ── Summary KPI Cards ── */}
                        <div className="pwa-page-pad pb-0">
                            <div className="ops-summary-grid">
                                <div className="lab-kpi-card">
                                    <div className="lab-kpi-icon pending">
                                        <Icon name="clock" className="h-5 w-5" />
                                    </div>
                                    <div className="lab-kpi-body">
                                        <div className="lab-kpi-value">{stats.pending}</div>
                                        <div className="lab-kpi-label">Pending Requests</div>
                                        <div className="lab-kpi-note pending">
                                            <span className="lab-kpi-note-dot pending" />
                                            Needs attention
                                        </div>
                                    </div>
                                </div>

                                <div className="lab-kpi-card">
                                    <div className="lab-kpi-icon completed">
                                        <Icon name="check" className="h-5 w-5" />
                                    </div>
                                    <div className="lab-kpi-body">
                                        <div className="lab-kpi-value">{stats.completedToday}</div>
                                        <div className="lab-kpi-label">Completed Today</div>
                                        <div className="lab-kpi-note completed">
                                            <span className="lab-kpi-note-dot completed" />
                                            Processed today
                                        </div>
                                    </div>
                                </div>

                                <div className="lab-kpi-card">
                                    <div className="lab-kpi-icon total">
                                        <Icon name="flask" className="h-5 w-5" />
                                    </div>
                                    <div className="lab-kpi-body">
                                        <div className="lab-kpi-value">{stats.requestsToday}</div>
                                        <div className="lab-kpi-label">Requests Today</div>
                                        <div className="lab-kpi-note total">
                                            Received today
                                        </div>
                                    </div>
                                </div>

                                <div className="lab-kpi-card">
                                    <div className="lab-kpi-icon total">
                                        <Icon name="clipboard" className="h-5 w-5" />
                                    </div>
                                    <div className="lab-kpi-body">
                                        <div className="lab-kpi-value">{stats.total}</div>
                                        <div className="lab-kpi-label">Total Recorded Requests</div>
                                        <div className="lab-kpi-note total">
                                            All-time on record
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Pending Attention Preview ── */}
                        <div className="pwa-page-pad pt-3">
                            <div className="lab-queue-section">
                                <div className="lab-queue-header">
                                    <div className="lab-queue-header-left">
                                        <h2>
                                            <Icon name="flask" className="h-4 w-4" />
                                            Needs Attention
                                        </h2>
                                        <p>Requests awaiting laboratory result encoding.</p>
                                    </div>
                                </div>

                                {loading ? (
                                    <div className="p-6 text-sm text-[var(--text-muted)]">Loading pending requests…</div>
                                ) : loadError && requests.length === 0 ? (
                                    <div className="p-8 text-center" role="alert">
                                        <Icon name="alert-triangle" className="h-6 w-6 mx-auto mb-2 text-[var(--text-muted)]" />
                                        <div className="font-semibold text-[var(--text)] text-sm">Unable to load laboratory requests</div>
                                        <div className="text-xs text-[var(--text-muted)] mt-1">Check the connection and try again.</div>
                                        <button
                                            type="button"
                                            onClick={() => void loadRequests(true)}
                                            className="clinical-link-action mt-2"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                ) : pendingPreview.length === 0 ? (
                                    <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                                        No laboratory requests are awaiting results.
                                    </div>
                                ) : (
                                    <ul className="lab-queue-list">
                                        {pendingPreview.map(r => {
                                            const name = r.patient_firstName
                                                ? `${r.patient_firstName} ${r.patient_lastName}`
                                                : `Patient #${r.patient_id ?? '—'}`;
                                            const testSummary = getTestSummary(r);
                                            return (
                                                <li
                                                    key={r.labrequest_id}
                                                    className="lab-queue-item is-pending"
                                                    onClick={() => setSelectedRequest(r)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRequest(r); } }}
                                                    tabIndex={0}
                                                    role="button"
                                                    aria-label={`Review laboratory request for ${name}`}
                                                >
                                                    <div className="lab-queue-avatar">
                                                        {r.patient_firstName?.[0]?.toUpperCase() ?? '?'}
                                                    </div>

                                                    <div className="lab-queue-patient">
                                                        <div className="lab-queue-patient-name">{name}</div>
                                                        <div className="lab-queue-patient-meta">
                                                            {r.patient_sex ?? ''}{r.patient_age != null ? ` · ${r.patient_age} y/o` : ''}
                                                        </div>
                                                    </div>

                                                    <div className="lab-queue-detail">
                                                        <div className="lab-queue-detail-label">
                                                            <Icon name="calendar" className="h-3 w-3" />
                                                            Requested {formatDisplayDate(r.request_date)}
                                                        </div>
                                                        <div className="lab-queue-detail-value">{testSummary}</div>
                                                    </div>

                                                    <div className="lab-queue-action">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); setSelectedRequest(r); }}
                                                            className="lab-queue-action-btn encode"
                                                            aria-label={`Encode result for ${name}`}
                                                        >
                                                            Encode Result
                                                            <span aria-hidden="true">→</span>
                                                        </button>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}

                                {!loading && stats.pending > 0 && (
                                    <div className="lab-queue-footer">
                                        <span className="lab-queue-count">
                                            {stats.pending} pending request{stats.pending !== 1 ? 's' : ''} in total
                                        </span>
                                        <button
                                            type="button"
                                            className="lab-queue-view-all"
                                            onClick={() => setActivePage('lab-requests')}
                                        >
                                            View all pending requests <span aria-hidden="true">→</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Compact Activity Snapshot ── */}
                        <div className="pwa-page-pad pt-3 pb-6">
                            <div className="lab-queue-section">
                                <div className="lab-queue-header">
                                    <div className="lab-queue-header-left">
                                        <h2>
                                            <Icon name="chart" className="h-4 w-4" />
                                            Recent Activity
                                        </h2>
                                        <p>
                                            {last7DaysCount} laboratory request{last7DaysCount !== 1 ? 's' : ''} logged in the last 7 days.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="lab-queue-view-all"
                                        onClick={() => setActivePage('analytics')}
                                    >
                                        View Analytics <span aria-hidden="true">→</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            </main>

            {selectedRequest && (
                selectedRequest.status === 'Completed' ? (
                    <LabRequestDetail
                        request={selectedRequest}
                        onClose={() => setSelectedRequest(null)}
                    />
                ) : (
                    <LabEncodePanel
                        request={selectedRequest}
                        onClose={() => setSelectedRequest(null)}
                        onStatusUpdate={handleStatusUpdate}
                        currentUserName={userName}
                        isOnline={isOnline}
                    />
                )
            )}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<LaboratoryDashboard />);
}
