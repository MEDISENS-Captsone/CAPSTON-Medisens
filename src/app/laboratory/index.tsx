import { useState, useEffect } from 'react';
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
        if (s === 'Completed') return 'bg-green-100 text-green-700 border-green-200';
        return 'bg-amber-100 text-amber-700 border-amber-200';
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
                        <div id="lab-request-dialog-title" className="font-semibold text-slate-900 text-base">Lab Request #{request.labrequest_id}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{patientName} · {formatDisplayDate(request.request_date)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusColor(request.status)}`}>
                            {request.status || 'Pending'}
                        </span>
                        <button type="button" onClick={onClose} aria-label="Close laboratory request" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 font-bold text-lg transition-colors"><Icon name="close" className="h-4 w-4" label="Close laboratory request" /></button>
                    </div>
                </div>

                <div className="lab-drawer-body space-y-6">
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow">
                            {request.patient_firstName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div>
                            <div className="font-bold text-slate-900">{patientName}</div>
                            <div className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
                                {request.patient_age != null && <span>{request.patient_age} yrs old</span>}
                                {request.patient_sex && <span>{request.patient_sex}</span>}
                                {request.requested_by && <span>Req. by: <span className="font-semibold text-slate-700">{request.requested_by}</span></span>}
                            </div>
                        </div>
                    </div>

                    {request.chief_complaint && (
                        <div>
                            <div className="clinical-field-label">Chief Complaint</div>
                            <div className="text-sm text-slate-700 bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">{request.chief_complaint}</div>
                        </div>
                    )}

                    <div>
                        <div className="clinical-field-label">Requested Tests</div>
                        {activeTests.length === 0 && !request.others ? (
                            <p className="text-sm text-slate-400 italic">No tests specified.</p>
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
                                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                    <div className="clinical-field-label">Routine Tests</div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {routine.map(t => (
                                                            <div key={t.label} className="flex items-center gap-2.5">
                                                                <div className="w-4 h-4 rounded bg-slate-700 flex items-center justify-center shrink-0">
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </div>
                                                                <span className="text-sm text-slate-700">{t.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {fasting.length > 0 && (
                                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                    <div className="clinical-field-label">Fasting Tests <span className="font-normal normal-case">(8-10 hrs)</span></div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {fasting.map(t => (
                                                            <div key={t.label} className="flex items-center gap-2.5">
                                                                <div className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center shrink-0">
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </div>
                                                                <span className="text-sm text-slate-700">{t.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {request.others && (
                                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                    <div className="clinical-field-label">Others</div>
                                                    <div className="text-sm text-slate-700">{request.others}</div>
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
                                className="w-full bg-slate-100 border border-slate-300 rounded-lg p-3 text-sm font-semibold text-slate-600 cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="clinical-field-label">Date Performed</label>
                            <input
                                type="datetime-local"
                                value={datePerformed}
                                onChange={e => setDatePerformed(e.target.value)}
                                disabled={request.status === 'Completed'}
                                className="w-full bg-white border border-slate-300 rounded-lg p-3 text-left focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none text-sm text-slate-800 disabled:bg-slate-100 disabled:border-slate-300 disabled:text-slate-600 disabled:font-semibold disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="clinical-field-label">
                            Lab Results / Findings
                            {request.status === 'Completed' && <span className="ml-2 text-green-600 normal-case font-semibold inline-flex items-center gap-1"><Icon name="check" className="h-3.5 w-3.5" /> Result recorded</span>}
                            {loadingLabResult && <span className="ml-2 text-slate-700 normal-case font-semibold">Loading recorded result...</span>}
                        </label>
                        <textarea
                            rows={6}
                            value={results}
                            onChange={e => setResults(e.target.value)}
                            disabled={request.status === 'Completed'}
                            className="w-full bg-white border border-slate-300 rounded-lg p-4 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none text-sm leading-relaxed text-slate-800 resize-y disabled:bg-slate-100 disabled:border-slate-300 disabled:text-slate-600 disabled:font-medium disabled:cursor-not-allowed"
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
                            className="w-full font-semibold py-2.5 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-sm transition-all  disabled:opacity-50 text-sm"
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
    const [activePage, setActivePage] = useState(() => window.location.hash.replace('#', '') || 'lab');

    useEffect(() => {
        window.location.hash = activePage;
    }, [activePage]);

    const isOnline = useOnlineStatus();
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('?');

    const [requests, setRequests] = useState<LabRequest[]>([]);
    const [loading, setLoading] = useState(true);
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
        } catch (err) {
            logError('Failed to load lab requests', err);
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
        <div className="flex h-screen bg-[var(--bg)] overflow-hidden w-full">
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

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">
                <Topbar
                    title="Laboratory Dashboard"
                    sectionLabel="Diagnostic Laboratory"
                    userName={userName}
                    userInitials={userInitials}
                    userRole="Laboratory Staff"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                />

                <div className="flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    <div className="w-full">
                        <PageHeader
                            title="Laboratory Work Queue"
                            subtitle="Encode pending results and review completed requests."
                        />

                        <div className="pwa-page-pad pb-0">
                            <div className="ops-summary-grid">
                                {[
                                    ['Pending Requests', stats.pending, 'Awaiting result encoding'],
                                    ['Completed Results', stats.completed, 'Already encoded'],
                                    ['Total Requests', stats.total, 'Current worklist'],
                                ].map(([label, value, note]) => (
                                    <div key={label} className="ops-summary-card">
                                        <div className="ops-summary-label">{label}</div>
                                        <div className="ops-summary-value tabular-nums">{value}</div>
                                        <div className="ops-summary-note">{note}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="m-3 md:m-4 xl:m-5 ops-panel overflow-hidden mb-6">
                            <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-800">Lab Requests</h2>
                                    <p className="text-xs text-slate-500">Select a request to review details and record laboratory results.</p>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-xs font-medium text-slate-500">{stats.pending} pending · {stats.completed} completed · {stats.total} total</span>
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

                            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                                <div className="relative w-full sm:max-w-lg">
                                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <input
                                        type="text"
                                        aria-label="Search lab requests by patient, lab number, or complaint"
                                        placeholder="Search by patient name, lab no, complaint..."
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 text-sm bg-white"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
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
                                        ) : filtered.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center">
                                                    <EmptyState title="No lab requests found" description="New lab requests from doctors will appear here." />
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
                                                        className="cursor-pointer group"
                                                    >
                                                        <td className="px-6 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                                                    {r.patient_firstName?.[0]?.toUpperCase() ?? '?'}
                                                                </div>
                                                                <div>
                                                                    <div className="font-semibold text-slate-800">{name}</div>
                                                                    {r.patient_sex && (
                                                                        <div className="text-xs text-slate-400">
                                                                            {r.patient_sex}{r.patient_age != null ? ` · ${r.patient_age} y/o` : ''}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-slate-600">{formatDisplayDate(r.request_date)}</td>
                                                        <td className="px-6 py-3">
                                                            <span className="clinical-neutral-badge">
                                                                {testCount} test{testCount !== 1 ? 's' : ''}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-slate-600 max-w-[180px] truncate">{r.chief_complaint || '—'}</td>
                                                        <td className="px-6 py-3 text-slate-600">{r.requested_by || '—'}</td>
                                                        <td className="px-6 py-3">
                                                            <span className={`clinical-status-badge ${statusBadge(r.status)}`}>
                                                                {r.status || 'Pending'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            <span className="clinical-link-action">Review</span>
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
