import { useState, useEffect, useRef } from 'react';
import { Icon } from '../../components/shared/Icon';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { useToast } from '../../components/feedback/Toast';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { isBlank } from '../../lib/utils/strings';
import { upsertCompletedLabResult } from '../../features/laboratory/services';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Topbar } from '../../components/layout/Topbar';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { SkeletonTable } from '../../components/ui/Skeleton';


interface LabRequest {
    labrequest_id: number;
    consultation_id: number | null;
    patient_id: number | null;
    request_date: string | null;
    lab_no: string | null;
    chief_complaint: string | null;
    is_cbc: boolean;
    is_cbc_platelet: boolean;
    is_hgb_hct: boolean;
    is_xray: boolean;
    is_ultrasound: boolean;
    is_rbs: boolean;
    is_fbs: boolean;
    is_uric_acid: boolean;
    is_cholesterol: boolean;
    is_urinalysis: boolean;
    is_fecalysis: boolean;
    is_sputum: boolean;
    others: string | null;
    requested_by: string | null;
    status: string | null;
    patient_firstName?: string;
    patient_lastName?: string;
    patient_age?: number | null;
    patient_sex?: string;
}

interface PatientRow {
    id: number;
    firstName: string;
    lastName: string;
    age: number | null;
    sex: string;
}

const LAB_REQUEST_QUEUE_LIMIT = 200;
const LAB_REQUEST_COLUMNS = 'labrequest_id, consultation_id, patient_id, request_date, lab_no, chief_complaint, is_cbc, is_cbc_platelet, is_hgb_hct, is_xray, is_ultrasound, is_rbs, is_fbs, is_uric_acid, is_cholesterol, is_urinalysis, is_fecalysis, is_sputum, others, requested_by, status';

function formatDateTimeLocal(value?: string | null) {
    const date = value ? new Date(value) : new Date();
    if (isNaN(date.getTime())) {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplayDate(str?: string | null) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d.getTime())
        ? str
        : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function LabRequestDetail({
    request,
    onClose,
    onStatusUpdate,
    currentUserName,
    isOnline,
}: {
    request: LabRequest;
    onClose: () => void;
    onStatusUpdate: (id: number, status: string) => void;
    currentUserName: string;
    isOnline: boolean;
}) {
    const [results, setResults] = useState('');
    const [datePerformed, setDatePerformed] = useState(formatDateTimeLocal());
    const [saving, setSaving] = useState(false);
    // `disabled={saving}` only applies after React re-renders, and a state read inside
    // the handler sees the value from the render the click came from. Two taps in the
    // same frame therefore both wrote the result, so the latch has to be a ref.
    const savingRef = useRef(false);
    const [loadingLabResult, setLoadingLabResult] = useState(false);
    const { showToast, ToastComponent } = useToast();

    useEffect(() => {
        setResults('');
        setDatePerformed(formatDateTimeLocal());
        loadExistingLabResult();
    }, [request.labrequest_id]);

    const loadExistingLabResult = async () => {
        setLoadingLabResult(true);
        try {
            const { data, error } = await supabase
                .from('lab_result')
                .select('labresult_id, labrequest_id, patient_id, date_performed, findings, performed_by')
                .eq('labrequest_id', request.labrequest_id)
                .order('labresult_id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setResults(data.findings ?? '');
                setDatePerformed(formatDateTimeLocal(data.date_performed));
            }
        } catch (err) {
            logError('Failed to load laboratory result', err);
        } finally {
            setLoadingLabResult(false);
        }
    };

    const patientName = request.patient_firstName
        ? `${request.patient_firstName} ${request.patient_lastName}`
        : '—';

    const statusColor = (s: string | null) => {
        if (s === 'Completed') return 'bg-[var(--green-tint-strong)] text-[var(--green-dark)] border-[var(--green-border)]';
        return 'bg-[var(--amber-tint)] text-[var(--amber-text)] border-[var(--amber-border)]';
    };

    const tests: { label: string; value: boolean }[] = [
        { label: 'Complete Blood Count (CBC)', value: request.is_cbc },
        { label: 'CBC with Platelet Count', value: request.is_cbc_platelet },
        { label: 'Hemoglobin and Hematocrit', value: request.is_hgb_hct },
        { label: 'Chest X-Ray (PA View)', value: request.is_xray },
        { label: 'Ultrasound', value: request.is_ultrasound },
        { label: 'Urinalysis', value: request.is_urinalysis },
        { label: 'Fecalysis', value: request.is_fecalysis },
        { label: 'Sputum', value: request.is_sputum },
        { label: 'Random Blood Sugar (RBS)', value: request.is_rbs },
        { label: 'Fasting Blood Sugar (FBS)', value: request.is_fbs },
        { label: 'Uric Acid', value: request.is_uric_acid },
        { label: 'Cholesterol', value: request.is_cholesterol },
    ];
    const activeTests = tests.filter(t => t.value);

    const handleMarkCompleted = async () => {
        if (savingRef.current) return;
        if (!isOnline) {
            showToast('You are offline. Lab results cannot be submitted until the connection is restored.', true);
            return;
        }

        if (isBlank(results)) {
            showToast('Please enter lab results before marking as completed.', true);
            return;
        }
        if (!datePerformed) {
            showToast('Please select the date performed.', true);
            return;
        }

        savingRef.current = true;
        setSaving(true);
        try {
            const performedBy =
                currentUserName && currentUserName !== 'Loading...'
                    ? currentUserName
                    : 'Unknown User';

            await upsertCompletedLabResult({
                labrequest_id: request.labrequest_id,
                patient_id: request.patient_id,
                consultation_id: request.consultation_id,
                findings: results,
                performed_by: performedBy,
                date_performed: datePerformed,
                status: 'Completed',
            });

            onStatusUpdate(request.labrequest_id, 'Completed');
            showToast('Lab results submitted successfully!', false);
        } catch (err) {
            logError('Failed to submit laboratory results', err);
            showToast(healthcareErrorMessage("submit the lab results"), true);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return (
        <>
            <ToastComponent />
            <button
                type="button"
                aria-label="Close laboratory request details"
                className="lab-drawer-backdrop"
                onClick={onClose}
            />
            <Modal labelledBy="lab-request-dialog-title" onClose={onClose} className="lab-drawer">
                <div className="lab-drawer-header">
                    <div className="min-w-0">
                        <div id="lab-request-dialog-title" className="font-semibold text-[var(--text)] text-base">Lab Request #{request.labrequest_id}</div>
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">{patientName} · {formatDisplayDate(request.request_date)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusColor(request.status)}`}>
                            {request.status || 'Pending'}
                        </span>
                        <button type="button" onClick={onClose} aria-label="Close laboratory request" className="h-11 w-11 -m-0.5 flex items-center justify-center rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-muted)] font-bold text-lg transition-colors"><Icon name="close" className="h-4 w-4" label="Close laboratory request" /></button>
                    </div>
                </div>

                <div className="lab-drawer-body space-y-6">
                    <div className="bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[var(--brand-active)] text-white flex items-center justify-center font-bold text-lg shrink-0 shadow">
                            {request.patient_firstName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div>
                            <div className="font-bold text-[var(--text)]">{patientName}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex gap-3 flex-wrap">
                                {request.patient_age != null && <span>{request.patient_age} yrs old</span>}
                                {request.patient_sex && <span>{request.patient_sex}</span>}
                                {request.requested_by && <span>Req. by: <span className="font-semibold text-[var(--text-2)]">{request.requested_by}</span></span>}
                            </div>
                        </div>
                    </div>

                    {request.chief_complaint && (
                        <div>
                            <div className="clinical-field-label">Chief Complaint</div>
                            <div className="text-sm text-[var(--text-2)] bg-[var(--surface-subtle)] rounded-lg px-4 py-3 border border-[var(--border)]">{request.chief_complaint}</div>
                        </div>
                    )}

                    <div>
                        <div className="clinical-field-label">Requested Tests</div>
                        {activeTests.length === 0 && !request.others ? (
                            <p className="text-sm text-[var(--text-muted)] italic">No tests specified.</p>
                        ) : (
                            <div className="space-y-2">
                                {(() => {
                                    const routine = activeTests.filter(t =>
                                        ['Complete Blood Count (CBC)', 'CBC with Platelet Count', 'Hemoglobin and Hematocrit', 'Chest X-Ray (PA View)', 'Ultrasound', 'Urinalysis', 'Fecalysis', 'Sputum'].includes(t.label)
                                    );
                                    const fasting = activeTests.filter(t =>
                                        ['Random Blood Sugar (RBS)', 'Fasting Blood Sugar (FBS)', 'Uric Acid', 'Cholesterol'].includes(t.label)
                                    );
                                    return (
                                        <>
                                            {routine.length > 0 && (
                                                <div className="bg-white border border-[var(--border)] rounded-xl p-4">
                                                    <div className="clinical-field-label">Routine Tests</div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {routine.map(t => (
                                                            <div key={t.label} className="flex items-center gap-2.5">
                                                                <div className="w-4 h-4 rounded bg-[var(--brand-active)] flex items-center justify-center shrink-0">
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </div>
                                                                <span className="text-sm text-[var(--text-2)]">{t.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {fasting.length > 0 && (
                                                <div className="bg-white border border-[var(--border)] rounded-xl p-4">
                                                    <div className="clinical-field-label">Fasting Tests <span className="font-normal normal-case">(8-10 hrs)</span></div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {fasting.map(t => (
                                                            <div key={t.label} className="flex items-center gap-2.5">
                                                                <div className="w-4 h-4 rounded bg-[var(--status-caution)] flex items-center justify-center shrink-0">
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </div>
                                                                <span className="text-sm text-[var(--text-2)]">{t.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {request.others && (
                                                <div className="bg-white border border-[var(--border)] rounded-xl p-4">
                                                    <div className="clinical-field-label">Others</div>
                                                    <div className="text-sm text-[var(--text-2)]">{request.others}</div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="clinical-field-label">Performed By</label>
                            <input
                                type="text"
                                value={currentUserName}
                                disabled
                                className="w-full bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg p-3 text-sm font-semibold text-[var(--text-2)] cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="clinical-field-label">Date Performed</label>
                            <input
                                type="datetime-local"
                                value={datePerformed}
                                onChange={e => setDatePerformed(e.target.value)}
                                disabled={request.status === 'Completed'}
                                className="w-full bg-white border border-[var(--border)] rounded-lg p-3 text-left focus:border-[var(--focus-color)] focus:ring-1 focus:ring-[var(--focus-ring)] outline-none text-sm text-[var(--text)] disabled:bg-[var(--surface-subtle)] disabled:border-[var(--border)] disabled:text-[var(--text-2)] disabled:font-semibold disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="clinical-field-label">
                            Lab Results / Findings
                            {request.status === 'Completed' && <span className="ml-2 text-[var(--green-accent-strong)] normal-case font-semibold inline-flex items-center gap-1"><Icon name="check" className="h-3.5 w-3.5" /> Result recorded</span>}
                            {loadingLabResult && <span className="ml-2 text-[var(--text-2)] normal-case font-semibold">Loading recorded result...</span>}
                        </label>
                        <textarea
                            rows={6}
                            value={results}
                            onChange={e => setResults(e.target.value)}
                            disabled={request.status === 'Completed'}
                            className="w-full bg-white border border-[var(--border)] rounded-lg p-4 focus:border-[var(--focus-color)] focus:ring-1 focus:ring-[var(--focus-ring)] outline-none text-sm leading-relaxed text-[var(--text)] resize-y disabled:bg-[var(--surface-subtle)] disabled:border-[var(--border)] disabled:text-[var(--text-2)] disabled:font-medium disabled:cursor-not-allowed"
                            placeholder="Enter laboratory findings, interpretation, and relevant notes..."
                        />
                    </div>
                </div>

                {request.status !== 'Completed' && (
                    <div className="lab-drawer-footer">
                        <button
                            type="button"
                            onClick={handleMarkCompleted}
                            disabled={saving}
                            className="w-full font-semibold py-2.5 px-4 rounded-lg bg-[var(--green-accent-strong)] hover:bg-[var(--green-dark)] text-white shadow-sm transition-all  disabled:opacity-50 text-sm"
                        >
                            {saving ? 'Recording Results...' : <span className="inline-flex items-center justify-center gap-1.5"><Icon name="check" className="h-4 w-4" /> Record Lab Results</span>}
                        </button>
                    </div>
                )}
            </Modal>
        </>
    );
}

const LaboratoryDashboard = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    // Single-workspace dashboard: the page is read from the hash on mount and never changes.
    const [activePage] = useState(() => window.location.hash.replace('#', '') || 'lab');

    useEffect(() => {
        window.location.hash = activePage;
    }, [activePage]);

    const isOnline = useOnlineStatus();
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('?');

    const [requests, setRequests] = useState<LabRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Completed'>('All');
    const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
    const { showToast, ToastComponent } = useToast();

    const navItems = [
        { id: 'lab', label: 'Dashboard', icon: 'flask', group: 'Diagnostics' },
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

    // Background Refresh Interval (1.5s)
    useEffect(() => {
        const interval = setInterval(() => {
            if (isOnline) {
                loadRequests(false);
            }
        }, 1500);
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
                    .select('labrequest_id, status')
                    .in('labrequest_id', labrequestIds);

                const completedSet = new Set<number>(
                    ((labResultData || []) as { labrequest_id: number; status: string | null }[])
                        .filter(lr => lr.status === 'Completed')
                        .map(lr => lr.labrequest_id)
                );

                const enriched: LabRequest[] = typedLabData.map(r => {
                    const p = r.patient_id != null ? patientMap[r.patient_id] : null;

                    const resolvedStatus = completedSet.has(r.labrequest_id)
                        ? 'Completed'
                        : (r.status ?? null);

                    return {
                        ...r,
                        status: resolvedStatus,
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

    const statusBadge = (s: string | null) => {
        if (s === 'Completed') return 'success';
        return 'warning';
    };

    const countTests = (r: LabRequest) =>
        [r.is_cbc, r.is_cbc_platelet, r.is_hgb_hct, r.is_xray, r.is_ultrasound, r.is_urinalysis, r.is_fecalysis, r.is_sputum, r.is_rbs, r.is_fbs, r.is_uric_acid, r.is_cholesterol]
            .filter(Boolean).length + (r.others ? 1 : 0);

    const filtered = requests.filter(r => {
        const name = `${r.patient_firstName ?? ''} ${r.patient_lastName ?? ''}`.toLowerCase();
        const matchSearch =
            name.includes(searchQuery.toLowerCase()) ||
            (r.lab_no ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.chief_complaint ?? '').toLowerCase().includes(searchQuery.toLowerCase());
        const effectiveStatus = r.status || 'Pending';
        const matchStatus = statusFilter === 'All' || effectiveStatus === statusFilter;
        return matchSearch && matchStatus;
    });

    const stats = {
        total: requests.length,
        pending: requests.filter(r => !r.status || r.status === 'Pending').length,
        completed: requests.filter(r => r.status === 'Completed').length,
    };

    return (
        <div className="laboratory-dashboard-workspace flex h-screen bg-[var(--bg)] overflow-hidden w-full">
            <ToastComponent />
            <Sidebar
                activePage="lab"
                userName={userName}
                userInitials={userInitials}
                userRole="Laboratory"
                navItems={navItems}
                onNavigate={(id) => {
                    if (id === 'dashboard') window.location.href = '/pages/laboratory.html';
                }}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="app-shell-main flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">
                <Topbar
                    title="Laboratory Dashboard"
                    sectionLabel="Diagnostic Laboratory"
                    userName={userName}
                    userInitials={userInitials}
                    userRole="Laboratory Staff"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                    isNavigationOpen={isMobileMenuOpen}
                />

                <div className="app-content-canvas flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    <div className="role-workspace-canvas w-full">
                        <PageHeader
                            title="Laboratory Work Queue"
                            subtitle="Encode pending results and review completed requests."
                        />

                        <div className="pwa-page-pad pb-0">
                            <div className="ops-summary-grid">
                                {[
                                    ['clock', 'Pending Requests', stats.pending, 'Awaiting result encoding'],
                                    ['check', 'Completed Results', stats.completed, 'Already encoded'],
                                    ['flask', 'Total Requests', stats.total, 'Current worklist'],
                                ].map(([icon, label, value, note]) => (
                                    <div key={label} className="ops-summary-card role-summary-card">
                                        <div className="role-summary-card-topline">
                                            <div className="ops-summary-label">{label}</div>
                                            <span className="role-summary-icon"><Icon name={icon as 'clock' | 'check' | 'flask'} className="h-4 w-4" /></span>
                                        </div>
                                        <div className="ops-summary-value tabular-nums">{value}</div>
                                        <div className="ops-summary-note">{note}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="role-queue-panel ops-panel overflow-hidden mb-6">
                            <div className="role-queue-header">
                                <div>
                                    <h2 className="text-base font-semibold text-[var(--text)]">Lab Requests</h2>
                                    <p className="text-xs text-[var(--text-secondary)]">Select a request to review details and record laboratory results.</p>
                                </div>
                                <div className="clinical-filter-group" aria-label="Filter laboratory requests by status">
                                    {(['All', 'Pending',  'Completed'] as const).map(s => (
                                        <button
                                            type="button"
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`clinical-filter-button ${statusFilter === s ? 'is-active' : ''}`}
                                            aria-pressed={statusFilter === s}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="role-queue-toolbar">
                                <label className="role-search-field">
                                    <Icon name="search" className="h-4 w-4 text-[var(--text-muted)]" />
                                    <input
                                        type="text"
                                        aria-label="Search lab requests by patient, lab number, or complaint"
                                        placeholder="Search patient, lab number, or complaint"
                                        className="bg-transparent border-none outline-none text-sm text-[var(--text-2)] w-full"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </label>
                                <span className="role-result-count" aria-live="polite">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
                            </div>

                            <div className="clinical-table-scroll">
                                <table className="clinical-table min-w-[980px]">
                                    <thead>
                                        <tr>
                                            <th>Patient</th>
                                            <th>Date</th>
                                            <th>Tests</th>
                                            <th>Chief Complaint</th>
                                            <th>Requested By</th>
                                            <th>Status</th>
                                            <th className="text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center">
                                                    <SkeletonTable rows={6} columns={7} />
                                                </td>
                                            </tr>
                                        ) : loadError && requests.length === 0 ? (
                                            <tr><td colSpan={7} className="px-6 py-12"><div className="role-queue-state" role="alert"><Icon name="alert-triangle" className="h-6 w-6" /><strong>Unable to load laboratory requests</strong><span>Check the connection and try again.</span><button type="button" onClick={() => void loadRequests(true)} className="clinical-link-action">Try again</button></div></td></tr>
                                        ) : filtered.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center">
                                                    <EmptyState title={(searchQuery || statusFilter !== 'All') ? 'No requests match these filters' : 'No laboratory requests yet'} description={(searchQuery || statusFilter !== 'All') ? 'Adjust the status filter or search terms.' : 'New lab requests from doctors will appear here.'} />
                                                </td>
                                            </tr>
                                        ) : (
                                            filtered.map(r => {
                                                const name = r.patient_firstName
                                                    ? `${r.patient_firstName} ${r.patient_lastName}`
                                                    : `Patient #${r.patient_id ?? '—'}`;
                                                const testCount = countTests(r);
                                                return (
                                                    <tr
                                                        key={r.labrequest_id}
                                                        onClick={() => setSelectedRequest(r)}
                                                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRequest(r); } }}
                                                        tabIndex={0}
                                                        aria-label={`Review laboratory request for ${name}`}
                                                        className="cursor-pointer group role-action-row"
                                                    >
                                                        <td className="px-6 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-[var(--brand-active)] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                                                    {r.patient_firstName?.[0]?.toUpperCase() ?? '?'}
                                                                </div>
                                                                <div>
                                                                    <div className="font-semibold text-[var(--text)]">{name}</div>
                                                                    {r.patient_sex && (
                                                                        <div className="text-xs text-[var(--text-muted)]">
                                                                            {r.patient_sex}{r.patient_age != null ? ` · ${r.patient_age} y/o` : ''}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-[var(--text-2)]">{formatDisplayDate(r.request_date)}</td>
                                                        <td className="px-6 py-3">
                                                            <span className="clinical-neutral-badge">
                                                                {testCount} test{testCount !== 1 ? 's' : ''}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-[var(--text-2)] max-w-[180px] truncate">{r.chief_complaint || '—'}</td>
                                                        <td className="px-6 py-3 text-[var(--text-2)]">{r.requested_by || '—'}</td>
                                                        <td className="px-6 py-3">
                                                            <span className={`clinical-status-badge ${statusBadge(r.status)}`}>
                                                                {r.status || 'Pending'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedRequest(r); }}
                                                                aria-label={`Review lab request for ${name}`}
                                                                className="clinical-link-action"
                                                            >
                                                                Review
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {selectedRequest && (
                <LabRequestDetail
                    request={selectedRequest}
                    onClose={() => setSelectedRequest(null)}
                    onStatusUpdate={handleStatusUpdate}
                    currentUserName={userName}
                    isOnline={isOnline}
                />
            )}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<LaboratoryDashboard />);
}
