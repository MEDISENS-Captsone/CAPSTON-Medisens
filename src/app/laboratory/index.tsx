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
import { LabResultDetailModal, type LabResultData } from '../../components/shared/LabResultDetailModal';


interface LabRequest {
    labrequest_id: number;
    consultation_id: number | null;
    patient_id: number | null;
    request_date: string | null;
    lab_no: string | null;
    chief_complaint: string | null;
    is_clinical_microscopy: boolean;
    is_blood_chemistry: boolean;
    is_pregnancy_test: boolean;
    is_hbsag_screening: boolean;
    is_hiv_screening: boolean;
    is_parasitology: boolean;
    is_dengue_rdt: boolean;
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
const LAB_REQUEST_COLUMNS = 'labrequest_id, consultation_id, patient_id, request_date, lab_no, chief_complaint, is_clinical_microscopy, is_blood_chemistry, is_pregnancy_test, is_hbsag_screening, is_hiv_screening, is_parasitology, is_dengue_rdt, others, requested_by, status';

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

// ─────────────────────────────────────────────────────────────────────────────
// PatientLabHistory: shows all past lab results for a patient in a slide-over
// ─────────────────────────────────────────────────────────────────────────────
function PatientLabHistory({
    patientId,
    patientName,
    onClose,
}: {
    patientId: number;
    patientName: string;
    onClose: () => void;
}) {
    const [historyItems, setHistoryItems] = useState<(LabResultData & { id: number; testSummary: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedResult, setSelectedResult] = useState<LabResultData | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('lab_result')
                    .select(`
                        labresult_id, patient_id, consultation_id,
                        labrequest_id, date_performed, findings,
                        performed_by, status,
                        lab_request(lab_no, is_clinical_microscopy, is_blood_chemistry,
                            is_pregnancy_test, is_hbsag_screening, is_hiv_screening,
                            is_parasitology, is_dengue_rdt, others, request_date)
                    `)
                    .eq('patient_id', patientId)
                    .eq('status', 'Completed')
                    .order('labresult_id', { ascending: false })
                    .limit(100);

                if (error) throw error;

                const items = (data || []).map((row: any) => {
                    const req = row.lab_request ?? {};
                    const tests: string[] = [];
                    if (req.is_clinical_microscopy) tests.push('Clinical Microscopy');
                    if (req.is_blood_chemistry) tests.push('Blood Chemistry');
                    if (req.is_pregnancy_test) tests.push('Pregnancy Test');
                    if (req.is_hbsag_screening) tests.push('HBsAg');
                    if (req.is_hiv_screening) tests.push('HIV Screening');
                    if (req.is_parasitology) tests.push('Parasitology');
                    if (req.is_dengue_rdt) tests.push('Dengue RDT');
                    if (req.others) tests.push('Others');
                    return {
                        id: row.labresult_id,
                        labresult_id: row.labresult_id,
                        findings: row.findings,
                        performed_by: row.performed_by,
                        date_performed: row.date_performed,
                        status: row.status,
                        patientName,
                        labNo: req.lab_no,
                        requestDate: req.request_date,
                        testSummary: tests.length ? tests.join(', ') : 'General / Other',
                    };
                });

                setHistoryItems(items);
            } catch (err) {
                logError('Failed to load patient lab history', err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [patientId]);

    return (
        <>
            {selectedResult && (
                <LabResultDetailModal
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                />
            )}
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-[#102E40]/50 backdrop-blur-sm z-[210]"
                onClick={onClose}
                aria-hidden="true"
            />
            {/* Slide-over panel */}
            <div className="fixed inset-0 z-[211] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
                <div className="pointer-events-auto w-full max-w-lg h-full max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden animate-slide-in-right">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-gradient-to-r from-[#102E40] to-[#1a4a62] shrink-0">
                        <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                                <Icon name="clock" className="h-4 w-4 text-emerald-300" />
                                Lab Result History
                            </div>
                            <div className="text-xs text-white/70 mt-0.5">{patientName} · All completed results</div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close lab history"
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                        >
                            <Icon name="close" className="h-4 w-4" label="Close" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 bg-[var(--surface-subtle)] rounded-xl animate-pulse" />
                                ))}
                            </div>
                        ) : historyItems.length === 0 ? (
                            <EmptyState
                                title="No completed lab results"
                                description="Completed results for this patient will appear here."
                            />
                        ) : (
                            historyItems.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSelectedResult(item)}
                                    className="w-full text-left rounded-xl border border-[var(--border)] bg-white hover:border-emerald-300 hover:bg-[var(--green-surface)] hover:shadow-md transition-all p-4 group cursor-pointer"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-md px-1.5 text-[0.65rem] font-semibold bg-[var(--green-surface)] text-[var(--green-ink-strong)] ring-1 ring-[var(--green-border-soft)]">
                                                    RES
                                                </span>
                                                <span className="text-xs font-bold text-[var(--text)]">Result #{item.id}</span>
                                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                    Completed
                                                </span>
                                            </div>
                                            <div className="text-xs text-[var(--text-2)] font-medium line-clamp-1">
                                                {item.testSummary}
                                            </div>
                                            <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                                {formatDisplayDate(item.date_performed)}
                                                {item.performed_by && ` · By: ${item.performed_by}`}
                                            </div>
                                        </div>
                                        <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-[var(--green-ink-strong)] group-hover:text-[var(--green-dark)] transition-colors">
                                            <Icon name="flask" className="h-3.5 w-3.5" />
                                            View
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer count */}
                    {!loading && historyItems.length > 0 && (
                        <div className="px-5 py-3 border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] text-xs text-[var(--text-muted)] shrink-0">
                            {historyItems.length} completed result{historyItems.length !== 1 ? 's' : ''} on record
                        </div>
                    )}
                </div>
            </div>
        </>
    );
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
    const [showHistory, setShowHistory] = useState(false);
    const { showToast, ToastComponent } = useToast();
    const [formData, setFormData] = useState<Record<string, any>>({
        // Clinical Microscopy
        clinicalMicroscopy: {
            color: 'Yellow', transparency: 'Clear',
            spGravity: '1.010', pH: '6.0', protein: 'Negative', sugar: 'Negative',
            ketones: 'Negative', bilirubin: 'Negative', blood: 'Negative', leukocytes: 'Negative', nitrite: 'Negative', urobilinogen: 'Normal',
            wbc: '', rbc: '', bacteria: 'Few', epithelialCells: 'Few', amorphousSediments: 'Few', mucusThreads: 'Few', yeastCells: 'None', crystals: 'None', others: ''
        },
        // Blood Chemistry
        bloodChemistry: {
            fbs: { result: '', unit: 'mg/dL', ref: '70–104', flag: '' },
            cholesterol: { result: '', unit: 'mg/dL', ref: 'Below 200', flag: '' },
            uricAcid: { result: '', unit: 'mg/dL', ref: 'Male: 3–7.2 / Female: 2–6', flag: '' },
            remarks: ''
        },
        // Pregnancy Test
        pregnancyTest: {
            methodKit: 'HCG / Sure-Guard',
            result: 'NEGATIVE',
            datePerformed: new Date().toLocaleDateString('en-PH'),
            dateReleased: new Date().toLocaleDateString('en-PH'),
            serialNo: ''
        },
        // HBsAg Screening
        hbsagScreening: {
            methodUsed: 'HBsAg Rapid Test',
            kitReagent: 'Biotest RightSign HBsAg Rapid Test Strip',
            lotNo: '',
            result: 'NONREACTIVE',
            datePerformed: new Date().toLocaleDateString('en-PH'),
            dateReleased: new Date().toLocaleDateString('en-PH'),
            serialNo: ''
        },
        // HIV Screening
        hivScreening: {
            methodUsed: 'Rapid Diagnostic Test / HPLC',
            kitReagent: 'ABBOTT BIOLINE HIV 1/2 3.0',
            lotNo: '',
            result: 'NONREACTIVE',
            datePerformed: new Date().toLocaleDateString('en-PH'),
            dateReleased: new Date().toLocaleDateString('en-PH'),
            receivedBy: '',
            serialNo: ''
        },
        // Parasitology
        parasitology: {
            color: 'Dark brown',
            consistency: 'Semi-formed',
            occultBlood: 'Negative',
            macroOthers: '',
            ascaris: 'Negative',
            trichuris: 'Negative',
            hookworm: 'Negative',
            amoeba: 'Negative',
            microOthers: 'No Ova or Parasite Seen',
            wbc: '0-1',
            rbc: '0-2',
            bacteria: 'Many',
            yeastCells: 'None',
            fatGlobules: 'None'
        },
        // Dengue RDT
        dengueRdt: {
            ns1Ag: 'POSITIVE',
            caseNo: '',
            datePerformed: new Date().toLocaleDateString('en-PH'),
            dateReleased: new Date().toLocaleDateString('en-PH')
        },
        generalNotes: ''
    });

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
                if (data.findings) {
                    try {
                        const parsed = JSON.parse(data.findings);
                        if (typeof parsed === 'object' && parsed !== null) {
                            setFormData(prev => ({ ...prev, ...parsed }));
                        }
                    } catch {
                        // Plain text fallback
                        setFormData(prev => ({ ...prev, generalNotes: data.findings }));
                    }
                }
            }
        } catch (err) {
            logError('Failed to load laboratory result', err);
        } finally {
            setLoadingLabResult(false);
        }
    };

    const patientName = request.patient_firstName
        ? `${request.patient_firstName} ${request.patient_lastName}`
        : (request.patient_id ? `Patient #${request.patient_id}` : '—');

    const statusColor = (s: string | null) => {
        if (s === 'Completed') return 'bg-[var(--green-tint-strong)] text-[var(--green-dark)] border-[var(--green-border)]';
        return 'bg-[var(--amber-tint)] text-[var(--amber-text)] border-[var(--amber-border)]';
    };

    const tests: { key: string; label: string; value: boolean }[] = [
        { key: 'clinicalMicroscopy', label: 'Clinical Microscopy', value: Boolean(request.is_clinical_microscopy) },
        { key: 'bloodChemistry', label: 'Blood Chemistry', value: Boolean(request.is_blood_chemistry) },
        { key: 'pregnancyTest', label: 'Pregnancy Test', value: Boolean(request.is_pregnancy_test) },
        { key: 'hbsagScreening', label: 'HBsAg Screening', value: Boolean(request.is_hbsag_screening) },
        { key: 'hivScreening', label: 'HIV Screening', value: Boolean(request.is_hiv_screening) },
        { key: 'parasitology', label: 'Parasitology', value: Boolean(request.is_parasitology) },
        { key: 'dengueRdt', label: 'Dengue RDT', value: Boolean(request.is_dengue_rdt) },
    ];
    const activeTests = tests.filter(t => t.value);
    const [selectedTab, setSelectedTab] = useState<string>('');

    useEffect(() => {
        if (activeTests.length > 0) {
            setSelectedTab(activeTests[0].key);
        } else if (request.others) {
            setSelectedTab('others');
        } else {
            setSelectedTab('clinicalMicroscopy');
        }
    }, [request.labrequest_id]);

    const handleFieldChange = (section: string, field: string, val: any) => {
        setFormData(prev => ({
            ...prev,
            [section]: typeof prev[section] === 'object'
                ? { ...prev[section], [field]: val }
                : val
        }));
    };

    const handleMarkCompleted = async () => {
        if (savingRef.current) return;
        if (!isOnline) {
            showToast('You are offline. Lab results cannot be submitted until the connection is restored.', true);
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
                    : 'Medical Technologist';

            const payloadFindings = JSON.stringify(formData, null, 2);

            await upsertCompletedLabResult({
                labrequest_id: request.labrequest_id,
                patient_id: request.patient_id,
                consultation_id: request.consultation_id,
                findings: payloadFindings,
                performed_by: performedBy,
                date_performed: datePerformed,
                status: 'Completed',
            });

            onStatusUpdate(request.labrequest_id, 'Completed');
            showToast('Lab results recorded successfully!', false);
        } catch (err) {
            logError('Failed to submit laboratory results', err);
            showToast(healthcareErrorMessage("submit the lab results"), true);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const isCompleted = request.status === 'Completed';
    const formInputCls = "w-full bg-white border border-[var(--border-strong)] rounded px-2.5 py-1.5 text-xs text-[var(--text)] focus:border-[var(--focus-color)] outline-none disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-2)]";

    const renderHeader = (title: string) => (
        <div className="border-b-2 border-[#102E40] pb-2 mb-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Republic of the Philippines · Province of Batangas</div>
            <div className="text-xs font-bold text-[var(--brand-active)] uppercase tracking-wide">Municipality of Malvar · Office of the Municipal Health</div>
            <div className="text-sm font-extrabold text-[var(--brand-primary)] uppercase tracking-wider mt-1">{title}</div>
        </div>
    );

    const renderPatientLockup = () => (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-[var(--surface-subtle)] p-2.5 rounded border border-[var(--border)] mb-4">
            <div><span className="font-semibold text-[var(--text-muted)]">Patient:</span> <span className="font-bold text-[var(--text)]">{patientName}</span></div>
            <div><span className="font-semibold text-[var(--text-muted)]">Age/Sex:</span> <span className="font-bold text-[var(--text)]">{request.patient_age ?? '—'} / {request.patient_sex ?? '—'}</span></div>
            <div><span className="font-semibold text-[var(--text-muted)]">Date:</span> <span className="font-bold text-[var(--text)]">{formatDisplayDate(request.request_date)}</span></div>
            <div><span className="font-semibold text-[var(--text-muted)]">Lab No:</span> <span className="font-bold text-[var(--text)]">{request.lab_no || `#${request.labrequest_id}`}</span></div>
        </div>
    );

    return (
        <>
            <ToastComponent />
            {/* Patient Lab History slide-over */}
            {showHistory && request.patient_id != null && (
                <PatientLabHistory
                    patientId={request.patient_id}
                    patientName={patientName}
                    onClose={() => setShowHistory(false)}
                />
            )}
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-[#102E40]/60 backdrop-blur-sm z-[200] transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Centered Modal Popup */}
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-3 sm:p-6 overflow-y-auto pointer-events-none">
                <Modal
                    labelledBy="lab-request-dialog-title"
                    onClose={onClose}
                    className="pointer-events-auto w-full max-w-4xl h-[85vh] max-h-[820px] min-h-[580px] bg-white rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden"
                >
                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-subtle)] shrink-0">
                        <div className="min-w-0">
                            <div id="lab-request-dialog-title" className="font-bold text-[var(--brand-primary)] text-base flex items-center gap-2">
                                <span>Lab Request #{request.labrequest_id}</span>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">{patientName} · {formatDisplayDate(request.request_date)}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusColor(request.status)}`}>
                                {request.status || 'Pending'}
                            </span>
                            {request.patient_id != null && (
                                <button
                                    type="button"
                                    onClick={() => setShowHistory(true)}
                                    aria-label="View patient lab history"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--green-surface)] text-[var(--green-ink-strong)] hover:bg-emerald-100 border border-[var(--green-border-soft)] transition-all cursor-pointer"
                                >
                                    <Icon name="clock" className="h-3.5 w-3.5" />
                                    History
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close laboratory request"
                                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-200/60 text-[var(--text-muted)] hover:text-[var(--text)] font-bold text-lg transition-colors cursor-pointer"
                            >
                                <Icon name="close" className="h-4 w-4" label="Close laboratory request" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                    {/* Header Info */}
                    <div className="bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[var(--brand-active)] text-white flex items-center justify-center font-bold text-lg shrink-0 shadow">
                            {request.patient_firstName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-[var(--text)] text-base">{patientName}</div>
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
                            <div className="text-sm text-[var(--text-2)] bg-[var(--surface-subtle)] rounded-lg px-4 py-2 border border-[var(--border)]">{request.chief_complaint}</div>
                        </div>
                    )}

                    {/* Performed By & Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--surface-subtle)]/40 p-3 rounded-lg border border-[var(--border-soft)]">
                        <div>
                            <label className="clinical-field-label">Medical Technologist</label>
                            <input
                                type="text"
                                value={currentUserName}
                                disabled
                                className="w-full bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg p-2 text-xs font-semibold text-[var(--text-2)] cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="clinical-field-label">Date Performed</label>
                            <input
                                type="datetime-local"
                                value={datePerformed}
                                onChange={e => setDatePerformed(e.target.value)}
                                disabled={isCompleted}
                                className="w-full bg-white border border-[var(--border)] rounded-lg p-2 text-xs text-[var(--text)] focus:border-[var(--focus-color)] outline-none disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-2)]"
                            />
                        </div>
                    </div>

                    {/* Tab Navigation for Requested Tests */}
                    <div>
                        <div className="clinical-field-label mb-2">Requested Laboratory Tests ({activeTests.length}) · Select a test to encode/review</div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[var(--border)]">
                            {activeTests.map(t => {
                                const isSelected = selectedTab === t.key;
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        onClick={() => setSelectedTab(t.key)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                            isSelected
                                                ? 'bg-[#102E40] text-white shadow-sm ring-2 ring-[#102E40]/20'
                                                : 'bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)] border border-[var(--border)]'
                                        }`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-[var(--brand-primary)]'}`} />
                                        <span>{t.label}</span>
                                    </button>
                                );
                            })}
                            {request.others && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedTab('others')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                        selectedTab === 'others'
                                            ? 'bg-[#102E40] text-white shadow-sm ring-2 ring-[#102E40]/20'
                                            : 'bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)] border border-[var(--border)]'
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${selectedTab === 'others' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                                    <span>Others</span>
                                </button>
                            )}
                            {activeTests.length === 0 && !request.others && (
                                <span className="text-xs text-[var(--text-muted)] italic">No specific tests selected.</span>
                            )}
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════════════════════════════
                        TAB CONTENT: ONE STRUCTURED REPORT DISPLAYED AT A TIME
                       ══════════════════════════════════════════════════════════════════ */}

                    {/* 1. CLINICAL MICROSCOPY REPORT */}
                    {selectedTab === 'clinicalMicroscopy' && (request.is_clinical_microscopy || activeTests.length === 0) && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('Clinical Microscopy Report')}
                            {renderPatientLockup()}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left: Macroscopic & Chemical */}
                                <div className="space-y-4">
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Macroscopic Examination</div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Color</label><input type="text" value={formData.clinicalMicroscopy?.color ?? 'Yellow'} onChange={e => handleFieldChange('clinicalMicroscopy', 'color', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Transparency</label><input type="text" value={formData.clinicalMicroscopy?.transparency ?? 'Clear'} onChange={e => handleFieldChange('clinicalMicroscopy', 'transparency', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Chemical Examination</div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Specific gravity</label><input type="text" value={formData.clinicalMicroscopy?.spGravity ?? '1.010'} onChange={e => handleFieldChange('clinicalMicroscopy', 'spGravity', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">pH</label><input type="text" value={formData.clinicalMicroscopy?.pH ?? '6.0'} onChange={e => handleFieldChange('clinicalMicroscopy', 'pH', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Protein</label><input type="text" value={formData.clinicalMicroscopy?.protein ?? 'Negative'} onChange={e => handleFieldChange('clinicalMicroscopy', 'protein', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Sugar</label><input type="text" value={formData.clinicalMicroscopy?.sugar ?? 'Negative'} onChange={e => handleFieldChange('clinicalMicroscopy', 'sugar', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Ketones</label><input type="text" value={formData.clinicalMicroscopy?.ketones ?? 'Negative'} onChange={e => handleFieldChange('clinicalMicroscopy', 'ketones', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Bilirubin</label><input type="text" value={formData.clinicalMicroscopy?.bilirubin ?? 'Negative'} onChange={e => handleFieldChange('clinicalMicroscopy', 'bilirubin', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Blood</label><input type="text" value={formData.clinicalMicroscopy?.blood ?? 'Negative'} onChange={e => handleFieldChange('clinicalMicroscopy', 'blood', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Leukocytes</label><input type="text" value={formData.clinicalMicroscopy?.leukocytes ?? 'Negative'} onChange={e => handleFieldChange('clinicalMicroscopy', 'leukocytes', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Nitrite</label><input type="text" value={formData.clinicalMicroscopy?.nitrite ?? 'Negative'} onChange={e => handleFieldChange('clinicalMicroscopy', 'nitrite', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                            <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Urobilinogen</label><input type="text" value={formData.clinicalMicroscopy?.urobilinogen ?? 'Normal'} onChange={e => handleFieldChange('clinicalMicroscopy', 'urobilinogen', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Microscopic Examination */}
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Microscopic Examination</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">WBC (/hpf)</label><input type="text" placeholder="e.g. 0-2 or 50-100" value={formData.clinicalMicroscopy?.wbc ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'wbc', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">RBC (/hpf)</label><input type="text" placeholder="e.g. 0-2" value={formData.clinicalMicroscopy?.rbc ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'rbc', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Bacteria</label><input type="text" placeholder="e.g. Few / Moderate / Many" value={formData.clinicalMicroscopy?.bacteria ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'bacteria', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Epithelial cells</label><input type="text" placeholder="e.g. Few / Moderate / Many" value={formData.clinicalMicroscopy?.epithelialCells ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'epithelialCells', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Amorphous sediments</label><input type="text" placeholder="e.g. Few / Moderate" value={formData.clinicalMicroscopy?.amorphousSediments ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'amorphousSediments', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Mucus threads</label><input type="text" placeholder="e.g. Few / Moderate" value={formData.clinicalMicroscopy?.mucusThreads ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'mucusThreads', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Yeast cells</label><input type="text" placeholder="e.g. None / Few" value={formData.clinicalMicroscopy?.yeastCells ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'yeastCells', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Crystals</label><input type="text" placeholder="e.g. Calcium oxalate: Moderate" value={formData.clinicalMicroscopy?.crystals ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'crystals', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div className="col-span-2"><label className="text-[11px] font-semibold text-[var(--text-muted)]">OTHERS</label><input type="text" placeholder="e.g. Pus in clumps: 1-2/HPO" value={formData.clinicalMicroscopy?.others ?? ''} onChange={e => handleFieldChange('clinicalMicroscopy', 'others', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. BLOOD CHEMISTRY REPORT */}
                    {selectedTab === 'bloodChemistry' && request.is_blood_chemistry && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('Blood Chemistry Report')}
                            {renderPatientLockup()}

                            <div className="overflow-x-auto">
                                <table className="w-full text-xs border border-[var(--border-strong)]">
                                    <thead className="bg-[#102E40] text-white">
                                        <tr>
                                            <th className="p-2 text-left font-bold">TEST</th>
                                            <th className="p-2 text-center font-bold">RESULT</th>
                                            <th className="p-2 text-center font-bold">UNIT</th>
                                            <th className="p-2 text-center font-bold">REFERENCE VALUE</th>
                                            <th className="p-2 text-center font-bold">FLAG</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        <tr className="hover:bg-[var(--surface-subtle)]">
                                            <td className="p-2 font-bold text-[var(--text)]">FASTING BLOOD SUGAR</td>
                                            <td className="p-1"><input type="text" placeholder="e.g. 95" value={formData.bloodChemistry?.fbs?.result ?? ''} onChange={e => handleFieldChange('bloodChemistry', 'fbs', { ...formData.bloodChemistry?.fbs, result: e.target.value })} disabled={isCompleted} className={`${formInputCls} text-center font-bold`} /></td>
                                            <td className="p-2 text-center text-[var(--text-2)] font-semibold">mg/dL</td>
                                            <td className="p-2 text-center text-[var(--text-2)]">70–104</td>
                                            <td className="p-1"><input type="text" placeholder="e.g. Normal" value={formData.bloodChemistry?.fbs?.flag ?? ''} onChange={e => handleFieldChange('bloodChemistry', 'fbs', { ...formData.bloodChemistry?.fbs, flag: e.target.value })} disabled={isCompleted} className={`${formInputCls} text-center`} /></td>
                                        </tr>
                                        <tr className="hover:bg-[var(--surface-subtle)]">
                                            <td className="p-2 font-bold text-[var(--text)]">CHOLESTEROL</td>
                                            <td className="p-1"><input type="text" placeholder="e.g. 180" value={formData.bloodChemistry?.cholesterol?.result ?? ''} onChange={e => handleFieldChange('bloodChemistry', 'cholesterol', { ...formData.bloodChemistry?.cholesterol, result: e.target.value })} disabled={isCompleted} className={`${formInputCls} text-center font-bold`} /></td>
                                            <td className="p-2 text-center text-[var(--text-2)] font-semibold">mg/dL</td>
                                            <td className="p-2 text-center text-[var(--text-2)]">Below 200</td>
                                            <td className="p-1"><input type="text" placeholder="e.g. Normal" value={formData.bloodChemistry?.cholesterol?.flag ?? ''} onChange={e => handleFieldChange('bloodChemistry', 'cholesterol', { ...formData.bloodChemistry?.cholesterol, flag: e.target.value })} disabled={isCompleted} className={`${formInputCls} text-center`} /></td>
                                        </tr>
                                        <tr className="hover:bg-[var(--surface-subtle)]">
                                            <td className="p-2 font-bold text-[var(--text)]">URIC ACID</td>
                                            <td className="p-1"><input type="text" placeholder="e.g. 4.5" value={formData.bloodChemistry?.uricAcid?.result ?? ''} onChange={e => handleFieldChange('bloodChemistry', 'uricAcid', { ...formData.bloodChemistry?.uricAcid, result: e.target.value })} disabled={isCompleted} className={`${formInputCls} text-center font-bold`} /></td>
                                            <td className="p-2 text-center text-[var(--text-2)] font-semibold">mg/dL</td>
                                            <td className="p-2 text-center text-[var(--text-2)]">Male: 3 – 7.2 mg/dL<br/>Female: 2 – 6 mg/dL</td>
                                            <td className="p-1"><input type="text" placeholder="e.g. Normal" value={formData.bloodChemistry?.uricAcid?.flag ?? ''} onChange={e => handleFieldChange('bloodChemistry', 'uricAcid', { ...formData.bloodChemistry?.uricAcid, flag: e.target.value })} disabled={isCompleted} className={`${formInputCls} text-center`} /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-[var(--text-muted)]">Remarks</label>
                                <textarea rows={2} placeholder="Interpretation or clinical notes..." value={formData.bloodChemistry?.remarks ?? ''} onChange={e => handleFieldChange('bloodChemistry', 'remarks', e.target.value)} disabled={isCompleted} className={formInputCls} />
                            </div>
                        </div>
                    )}

                    {/* 3. PREGNANCY TEST REPORT */}
                    {selectedTab === 'pregnancyTest' && request.is_pregnancy_test && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('Pregnancy Test Report')}
                            {renderPatientLockup()}

                            <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-[#102E40] text-white">
                                        <tr>
                                            <th className="p-2 text-center font-bold w-1/2">METHOD / KIT</th>
                                            <th className="p-2 text-center font-bold w-1/2">RESULT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-3"><input type="text" value={formData.pregnancyTest?.methodKit ?? 'HCG / Sure-Guard'} onChange={e => handleFieldChange('pregnancyTest', 'methodKit', e.target.value)} disabled={isCompleted} className={`${formInputCls} text-center font-semibold`} /></td>
                                            <td className="p-3">
                                                <select value={formData.pregnancyTest?.result ?? 'NEGATIVE'} onChange={e => handleFieldChange('pregnancyTest', 'result', e.target.value)} disabled={isCompleted} className={`${formInputCls} text-center font-bold text-sm text-[var(--brand-active)]`}>
                                                    <option value="POSITIVE">POSITIVE</option>
                                                    <option value="NEGATIVE">NEGATIVE</option>
                                                </select>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Performed</label><input type="text" value={formData.pregnancyTest?.datePerformed ?? ''} onChange={e => handleFieldChange('pregnancyTest', 'datePerformed', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Released</label><input type="text" value={formData.pregnancyTest?.dateReleased ?? ''} onChange={e => handleFieldChange('pregnancyTest', 'dateReleased', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                            </div>
                        </div>
                    )}

                    {/* 4. HBSAG SCREENING REPORT */}
                    {selectedTab === 'hbsagScreening' && request.is_hbsag_screening && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('HBsAg Screening Report')}
                            {renderPatientLockup()}

                            <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-[#102E40] text-white">
                                        <tr>
                                            <th className="p-2 text-center font-bold">Method Used</th>
                                            <th className="p-2 text-center font-bold">Kit / Reagent Used</th>
                                            <th className="p-2 text-center font-bold">Lot No.</th>
                                            <th className="p-2 text-center font-bold">Result</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-2"><input type="text" value={formData.hbsagScreening?.methodUsed ?? 'HBsAg Rapid Test'} onChange={e => handleFieldChange('hbsagScreening', 'methodUsed', e.target.value)} disabled={isCompleted} className={formInputCls} /></td>
                                            <td className="p-2"><input type="text" value={formData.hbsagScreening?.kitReagent ?? 'Biotest RightSign HBsAg Rapid Test Strip'} onChange={e => handleFieldChange('hbsagScreening', 'kitReagent', e.target.value)} disabled={isCompleted} className={formInputCls} /></td>
                                            <td className="p-2"><input type="text" placeholder="e.g. HBSG25050013" value={formData.hbsagScreening?.lotNo ?? ''} onChange={e => handleFieldChange('hbsagScreening', 'lotNo', e.target.value)} disabled={isCompleted} className={formInputCls} /></td>
                                            <td className="p-2">
                                                <select value={formData.hbsagScreening?.result ?? 'NONREACTIVE'} onChange={e => handleFieldChange('hbsagScreening', 'result', e.target.value)} disabled={isCompleted} className={`${formInputCls} font-bold text-center`}>
                                                    <option value="NONREACTIVE">NONREACTIVE</option>
                                                    <option value="REACTIVE">REACTIVE</option>
                                                </select>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Performed</label><input type="text" value={formData.hbsagScreening?.datePerformed ?? ''} onChange={e => handleFieldChange('hbsagScreening', 'datePerformed', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Released</label><input type="text" value={formData.hbsagScreening?.dateReleased ?? ''} onChange={e => handleFieldChange('hbsagScreening', 'dateReleased', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                            </div>
                        </div>
                    )}

                    {/* 5. HIV SCREENING RESULT */}
                    {selectedTab === 'hivScreening' && request.is_hiv_screening && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('HIV Screening Result')}
                            {renderPatientLockup()}

                            <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-[#102E40] text-white">
                                        <tr>
                                            <th className="p-2 text-center font-bold">Method Used</th>
                                            <th className="p-2 text-center font-bold">Kit / Reagent Used</th>
                                            <th className="p-2 text-center font-bold">Lot No.</th>
                                            <th className="p-2 text-center font-bold">Result</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-2"><input type="text" value={formData.hivScreening?.methodUsed ?? 'HPLC / Rapid Test'} onChange={e => handleFieldChange('hivScreening', 'methodUsed', e.target.value)} disabled={isCompleted} className={formInputCls} /></td>
                                            <td className="p-2"><input type="text" value={formData.hivScreening?.kitReagent ?? 'ABBOTT BIOLINE HIV 1/2 3.0'} onChange={e => handleFieldChange('hivScreening', 'kitReagent', e.target.value)} disabled={isCompleted} className={formInputCls} /></td>
                                            <td className="p-2"><input type="text" placeholder="e.g. 03ADJ018B" value={formData.hivScreening?.lotNo ?? ''} onChange={e => handleFieldChange('hivScreening', 'lotNo', e.target.value)} disabled={isCompleted} className={formInputCls} /></td>
                                            <td className="p-2">
                                                <select value={formData.hivScreening?.result ?? 'NONREACTIVE'} onChange={e => handleFieldChange('hivScreening', 'result', e.target.value)} disabled={isCompleted} className={`${formInputCls} font-bold text-center`}>
                                                    <option value="NONREACTIVE">NONREACTIVE</option>
                                                    <option value="REACTIVE">REACTIVE</option>
                                                </select>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Performed</label><input type="text" value={formData.hivScreening?.datePerformed ?? ''} onChange={e => handleFieldChange('hivScreening', 'datePerformed', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Released</label><input type="text" value={formData.hivScreening?.dateReleased ?? ''} onChange={e => handleFieldChange('hivScreening', 'dateReleased', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Received By</label><input type="text" placeholder="Signature / Name" value={formData.hivScreening?.receivedBy ?? ''} onChange={e => handleFieldChange('hivScreening', 'receivedBy', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                            </div>
                        </div>
                    )}

                    {/* 6. PARASITOLOGY REPORT */}
                    {selectedTab === 'parasitology' && request.is_parasitology && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('Parasitology Report')}
                            {renderPatientLockup()}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left: Macroscopic */}
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-3 border border-[var(--border-soft)]">Macroscopic Examination</div>
                                    <div className="space-y-2 text-xs">
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Color</label><input type="text" value={formData.parasitology?.color ?? 'Dark brown'} onChange={e => handleFieldChange('parasitology', 'color', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Consistency</label><input type="text" value={formData.parasitology?.consistency ?? 'Semi-formed'} onChange={e => handleFieldChange('parasitology', 'consistency', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Occult blood</label><input type="text" value={formData.parasitology?.occultBlood ?? 'Negative'} onChange={e => handleFieldChange('parasitology', 'occultBlood', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">OTHERS</label><input type="text" value={formData.parasitology?.macroOthers ?? ''} onChange={e => handleFieldChange('parasitology', 'macroOthers', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                    </div>
                                </div>

                                {/* Right: Microscopic */}
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-3 border border-[var(--border-soft)]">Microscopic Examination</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Ascaris lumbricoides ova</label><input type="text" value={formData.parasitology?.ascaris ?? 'Negative'} onChange={e => handleFieldChange('parasitology', 'ascaris', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Trichuris trichiura ova</label><input type="text" value={formData.parasitology?.trichuris ?? 'Negative'} onChange={e => handleFieldChange('parasitology', 'trichuris', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Hookworm ova</label><input type="text" value={formData.parasitology?.hookworm ?? 'Negative'} onChange={e => handleFieldChange('parasitology', 'hookworm', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Amoeba</label><input type="text" value={formData.parasitology?.amoeba ?? 'Negative'} onChange={e => handleFieldChange('parasitology', 'amoeba', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div className="col-span-2"><label className="text-[11px] font-semibold text-[var(--text-muted)]">OTHERS</label><input type="text" value={formData.parasitology?.microOthers ?? 'No Ova or Parasite Seen'} onChange={e => handleFieldChange('parasitology', 'microOthers', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">WBC (/hpf)</label><input type="text" value={formData.parasitology?.wbc ?? '0-1'} onChange={e => handleFieldChange('parasitology', 'wbc', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">RBC (/hpf)</label><input type="text" value={formData.parasitology?.rbc ?? '0-2'} onChange={e => handleFieldChange('parasitology', 'rbc', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Bacteria</label><input type="text" value={formData.parasitology?.bacteria ?? 'Many'} onChange={e => handleFieldChange('parasitology', 'bacteria', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Yeast cells</label><input type="text" value={formData.parasitology?.yeastCells ?? 'None'} onChange={e => handleFieldChange('parasitology', 'yeastCells', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                        <div className="col-span-2"><label className="text-[11px] font-semibold text-[var(--text-muted)]">Fat globules</label><input type="text" value={formData.parasitology?.fatGlobules ?? 'None'} onChange={e => handleFieldChange('parasitology', 'fatGlobules', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 7. DENGUE RDT RESULT */}
                    {selectedTab === 'dengueRdt' && request.is_dengue_rdt && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('Dengue RDT Result')}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-[var(--surface-subtle)] p-2.5 rounded border border-[var(--border)] mb-4">
                                <div><span className="font-semibold text-[var(--text-muted)]">Name:</span> <span className="font-bold text-[var(--text)]">{patientName}</span></div>
                                <div><span className="font-semibold text-[var(--text-muted)]">Age/Sex:</span> <span className="font-bold text-[var(--text)]">{request.patient_age ?? '—'}/{request.patient_sex?.[0] ?? '—'}</span></div>
                                <div><span className="font-semibold text-[var(--text-muted)]">Date:</span> <span className="font-bold text-[var(--text)]">{formatDisplayDate(request.request_date)}</span></div>
                                <div className="flex items-center gap-1"><label className="font-semibold text-[var(--text-muted)] whitespace-nowrap">Case No.:</label> <input type="text" placeholder="e.g. 26-021" value={formData.dengueRdt?.caseNo ?? ''} onChange={e => handleFieldChange('dengueRdt', 'caseNo', e.target.value)} disabled={isCompleted} className="bg-transparent border-b border-[var(--border-strong)] outline-none text-xs font-bold text-[var(--text)] w-24 px-1" /></div>
                            </div>

                            <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-[#102E40] text-white">
                                        <tr>
                                            <th className="p-2.5 text-center font-bold w-1/2">DENGUE RDT RESULT</th>
                                            <th className="p-2.5 text-center font-bold w-1/2">RESULT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-3 text-center font-bold text-[var(--text)] bg-[var(--surface-subtle)]">Dengue NS1 Ag =</td>
                                            <td className="p-3">
                                                <select value={formData.dengueRdt?.ns1Ag ?? 'POSITIVE'} onChange={e => handleFieldChange('dengueRdt', 'ns1Ag', e.target.value)} disabled={isCompleted} className={`${formInputCls} text-center font-bold text-sm text-[var(--brand-active)]`}>
                                                    <option value="POSITIVE">POSITIVE</option>
                                                    <option value="NEGATIVE">NEGATIVE</option>
                                                </select>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Performed</label><input type="text" value={formData.dengueRdt?.datePerformed ?? ''} onChange={e => handleFieldChange('dengueRdt', 'datePerformed', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Released</label><input type="text" value={formData.dengueRdt?.dateReleased ?? ''} onChange={e => handleFieldChange('dengueRdt', 'dateReleased', e.target.value)} disabled={isCompleted} className={formInputCls} /></div>
                            </div>
                        </div>
                    )}

                    {/* 8. OTHERS TAB */}
                    {selectedTab === 'others' && request.others && (
                        <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                            {renderHeader('Other Requested Examination')}
                            {renderPatientLockup()}
                            <div className="p-3 bg-[var(--surface-subtle)] rounded border border-[var(--border)] text-xs text-[var(--text)]">
                                <span className="font-semibold text-[var(--text-muted)] block mb-1">Doctor's Specification:</span>
                                <p className="font-bold text-sm">{request.others}</p>
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-[var(--text-muted)]">Laboratory Findings & Notes</label>
                                <textarea rows={5} placeholder="Enter findings for other tests..." value={formData.generalNotes ?? ''} onChange={e => setFormData(prev => ({ ...prev, generalNotes: e.target.value }))} disabled={isCompleted} className={formInputCls} />
                            </div>
                        </div>
                    )}
                </div>

                    {request.status !== 'Completed' && (
                        <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-subtle)] shrink-0 flex justify-end">
                            <button
                                type="button"
                                onClick={handleMarkCompleted}
                                disabled={saving}
                                className="w-full sm:w-auto min-w-[260px] font-semibold py-2.5 px-6 rounded-lg bg-[var(--green-accent-strong)] hover:bg-[var(--green-dark)] text-white shadow-sm transition-all disabled:opacity-50 text-sm cursor-pointer"
                            >
                                {saving ? 'Recording Results...' : <span className="inline-flex items-center justify-center gap-1.5"><Icon name="check" className="h-4 w-4" /> Save and Record Laboratory Results</span>}
                            </button>
                        </div>
                    )}
                </Modal>
            </div>
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
        [r.is_clinical_microscopy, r.is_blood_chemistry, r.is_pregnancy_test, r.is_hbsag_screening, r.is_hiv_screening, r.is_parasitology, r.is_dengue_rdt]
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
