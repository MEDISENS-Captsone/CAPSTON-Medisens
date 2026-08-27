// View Result — clean digital review of a completed Laboratory Result, separate from
// the formal printable report (labResultPrint.ts / "Print Results" below). Reuses the
// same right-side slide-over pattern as LabEncodePanel (ClinicalDrawer + Modal) for a
// consistent Encode/View experience, and the same dynamic requested-test detection
// (CURRENT_TEST_DEFS) so only tests actually requested for this patient appear.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../../components/shared/Icon';
import { supabase } from '../../lib/supabase/client';
import { logError } from '../../lib/utils/errors';
import { useToast } from '../../components/feedback/Toast';
import { printHtmlDocument } from '../../lib/utils/print';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { PatientLabHistory } from './PatientLabHistory';
import { type LabRequest, CURRENT_TEST_DEFS, formatDisplayDate } from './types';
import { buildLabResultPrintHtml, getPrintableTests } from './labResultPrint';

function hasValue(v: any): boolean {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
}

function ValueRow({ label, value }: { label: string; value: any }) {
    if (!hasValue(value)) return null;
    return (
        <div className="lab-view-row">
            <span className="lab-view-row-label">{label}</span>
            <span className="lab-view-row-value">{String(value)}</span>
        </div>
    );
}

// Date Performed/Released are provenance metadata, not findings — kept visually
// separate from the result rows above, in a compact footer beneath each test's
// section. Only stored, non-empty dates are shown; nothing is invented for tests
// that don't store one of these fields.
function DateFooter({ performed, released }: { performed?: any; released?: any }) {
    const parts: string[] = [];
    if (hasValue(performed)) parts.push(`Performed: ${performed}`);
    if (hasValue(released)) parts.push(`Released: ${released}`);
    if (parts.length === 0) return null;
    return <div className="lab-view-date-footer">{parts.join(' · ')}</div>;
}

// One subtle grouped container per test section (Macroscopic/Chemical/Microscopic,
// etc.) with a quiet heading — not the boxed/uppercase encode-panel treatment, and
// not a separate bordered card per field.
function ResultSection({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <div className="lab-view-section">
            {title && <div className="lab-view-section-title">{title}</div>}
            <div className="lab-view-section-body">{children}</div>
        </div>
    );
}

export function LabRequestDetail({
    request,
    onClose,
}: {
    request: LabRequest;
    onClose: () => void;
}) {
    const { showToast, ToastComponent } = useToast();
    const [showHistory, setShowHistory] = useState(false);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [datePerformed, setDatePerformed] = useState<string | null>(null);
    const [performedBy, setPerformedBy] = useState<string | null>(null);

    useEffect(() => {
        const loadResult = async () => {
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
                    setDatePerformed(data.date_performed);
                    setPerformedBy(data.performed_by ?? null);
                    if (data.findings) {
                        try {
                            const parsed = JSON.parse(data.findings);
                            if (typeof parsed === 'object' && parsed !== null) {
                                setFormData(parsed);
                            }
                        } catch {
                            setFormData({ generalNotes: data.findings });
                        }
                    }
                }
            } catch (err) {
                logError('Failed to load laboratory result', err);
            }
        };
        loadResult();
    }, [request.labrequest_id]);

    const patientName = request.patient_firstName
        ? `${request.patient_firstName} ${request.patient_lastName}`
        : (request.patient_id ? `Patient #${request.patient_id}` : '—');

    const requestedTests = useMemo(() => {
        const active = CURRENT_TEST_DEFS.filter(t => Boolean(request[t.flag]));
        return request.others
            ? [...active, { key: 'others' as const, flag: 'others' as keyof LabRequest, label: 'Others' }]
            : active;
    }, [request]);

    // Visible result tabs = requested tests ∩ tests with legitimate recorded result
    // data — reusing the exact same eligibility helper Print Results uses, so digital
    // and printable result availability never disagree. Metadata alone (method, kit,
    // lot, dates, unit, reference, performer) never makes a tab appear on its own.
    const availableTests = useMemo(() => getPrintableTests(request, formData), [request, formData]);

    const [selectedTest, setSelectedTest] = useState<string>('');

    useEffect(() => {
        setSelectedTest(availableTests[0]?.key ?? '');
    }, [request.labrequest_id, availableTests]);

    const handlePrint = () => {
        if (availableTests.length === 0) {
            showToast('No printable laboratory results are available for this request.', true);
            return;
        }
        const html = buildLabResultPrintHtml(request, formData, datePerformed, performedBy, availableTests);
        if (!printHtmlDocument(html)) {
            showToast('Unable to open the print window. Please try again.', true);
        }
    };

    const renderClinicalMicroscopy = () => (
        <div className="space-y-3">
            <div className="lab-view-groups">
                <ResultSection title="Macroscopic Examination">
                    <ValueRow label="Color" value={formData.clinicalMicroscopy?.color} />
                    <ValueRow label="Transparency" value={formData.clinicalMicroscopy?.transparency} />
                </ResultSection>
                <ResultSection title="Microscopic Examination">
                    <ValueRow label="WBC (/hpf)" value={formData.clinicalMicroscopy?.wbc} />
                    <ValueRow label="RBC (/hpf)" value={formData.clinicalMicroscopy?.rbc} />
                    <ValueRow label="Bacteria" value={formData.clinicalMicroscopy?.bacteria} />
                    <ValueRow label="Epithelial Cells" value={formData.clinicalMicroscopy?.epithelialCells} />
                    <ValueRow label="Amorphous Sediments" value={formData.clinicalMicroscopy?.amorphousSediments} />
                    <ValueRow label="Mucus Threads" value={formData.clinicalMicroscopy?.mucusThreads} />
                    <ValueRow label="Yeast Cells" value={formData.clinicalMicroscopy?.yeastCells} />
                    <ValueRow label="Crystals" value={formData.clinicalMicroscopy?.crystals} />
                    <ValueRow label="Others" value={formData.clinicalMicroscopy?.others} />
                </ResultSection>
            </div>
            <ResultSection title="Chemical Examination">
                <div className="lab-view-fields-grid">
                    <ValueRow label="Specific Gravity" value={formData.clinicalMicroscopy?.spGravity} />
                    <ValueRow label="pH" value={formData.clinicalMicroscopy?.pH} />
                    <ValueRow label="Protein" value={formData.clinicalMicroscopy?.protein} />
                    <ValueRow label="Sugar" value={formData.clinicalMicroscopy?.sugar} />
                    <ValueRow label="Ketones" value={formData.clinicalMicroscopy?.ketones} />
                    <ValueRow label="Bilirubin" value={formData.clinicalMicroscopy?.bilirubin} />
                    <ValueRow label="Blood" value={formData.clinicalMicroscopy?.blood} />
                    <ValueRow label="Leukocytes" value={formData.clinicalMicroscopy?.leukocytes} />
                    <ValueRow label="Nitrite" value={formData.clinicalMicroscopy?.nitrite} />
                    <ValueRow label="Urobilinogen" value={formData.clinicalMicroscopy?.urobilinogen} />
                </div>
            </ResultSection>
        </div>
    );

    const renderBloodChemistry = () => (
        <ResultSection>
            <ValueRow label="Fasting Blood Sugar" value={formData.bloodChemistry?.fbs?.result && `${formData.bloodChemistry.fbs.result} mg/dL${formData.bloodChemistry.fbs.flag ? ` (${formData.bloodChemistry.fbs.flag})` : ''}`} />
            <ValueRow label="Cholesterol" value={formData.bloodChemistry?.cholesterol?.result && `${formData.bloodChemistry.cholesterol.result} mg/dL${formData.bloodChemistry.cholesterol.flag ? ` (${formData.bloodChemistry.cholesterol.flag})` : ''}`} />
            <ValueRow label="Uric Acid" value={formData.bloodChemistry?.uricAcid?.result && `${formData.bloodChemistry.uricAcid.result} mg/dL${formData.bloodChemistry.uricAcid.flag ? ` (${formData.bloodChemistry.uricAcid.flag})` : ''}`} />
            <ValueRow label="Remarks" value={formData.bloodChemistry?.remarks} />
        </ResultSection>
    );

    const renderPregnancyTest = () => (
        <>
            <ResultSection>
                <ValueRow label="Method / Kit" value={formData.pregnancyTest?.methodKit} />
                <ValueRow label="Result" value={formData.pregnancyTest?.result} />
            </ResultSection>
            <DateFooter performed={formData.pregnancyTest?.datePerformed} released={formData.pregnancyTest?.dateReleased} />
        </>
    );

    const renderHbsag = () => (
        <>
            <ResultSection>
                <ValueRow label="Method Used" value={formData.hbsagScreening?.methodUsed} />
                <ValueRow label="Kit / Reagent" value={formData.hbsagScreening?.kitReagent} />
                <ValueRow label="Lot No." value={formData.hbsagScreening?.lotNo} />
                <ValueRow label="Result" value={formData.hbsagScreening?.result} />
            </ResultSection>
            <DateFooter performed={formData.hbsagScreening?.datePerformed} released={formData.hbsagScreening?.dateReleased} />
        </>
    );

    const renderHiv = () => (
        <>
            <ResultSection>
                <ValueRow label="Method Used" value={formData.hivScreening?.methodUsed} />
                <ValueRow label="Kit / Reagent" value={formData.hivScreening?.kitReagent} />
                <ValueRow label="Lot No." value={formData.hivScreening?.lotNo} />
                <ValueRow label="Result" value={formData.hivScreening?.result} />
                <ValueRow label="Received By" value={formData.hivScreening?.receivedBy} />
            </ResultSection>
            <DateFooter performed={formData.hivScreening?.datePerformed} released={formData.hivScreening?.dateReleased} />
        </>
    );

    const renderParasitology = () => (
        <div className="lab-view-groups">
            <ResultSection title="Macroscopic Examination">
                <ValueRow label="Color" value={formData.parasitology?.color} />
                <ValueRow label="Consistency" value={formData.parasitology?.consistency} />
                <ValueRow label="Occult Blood" value={formData.parasitology?.occultBlood} />
                <ValueRow label="Others" value={formData.parasitology?.macroOthers} />
            </ResultSection>
            <ResultSection title="Microscopic Examination">
                <ValueRow label="Ascaris lumbricoides ova" value={formData.parasitology?.ascaris} />
                <ValueRow label="Trichuris trichiura ova" value={formData.parasitology?.trichuris} />
                <ValueRow label="Hookworm ova" value={formData.parasitology?.hookworm} />
                <ValueRow label="Amoeba" value={formData.parasitology?.amoeba} />
                <ValueRow label="Others" value={formData.parasitology?.microOthers} />
                <ValueRow label="WBC (/hpf)" value={formData.parasitology?.wbc} />
                <ValueRow label="RBC (/hpf)" value={formData.parasitology?.rbc} />
                <ValueRow label="Bacteria" value={formData.parasitology?.bacteria} />
                <ValueRow label="Yeast Cells" value={formData.parasitology?.yeastCells} />
                <ValueRow label="Fat Globules" value={formData.parasitology?.fatGlobules} />
            </ResultSection>
        </div>
    );

    const renderDengue = () => (
        <>
            <ResultSection>
                <ValueRow label="Case No." value={formData.dengueRdt?.caseNo} />
                <ValueRow label="Dengue NS1 Ag" value={formData.dengueRdt?.ns1Ag} />
            </ResultSection>
            <DateFooter performed={formData.dengueRdt?.datePerformed} released={formData.dengueRdt?.dateReleased} />
        </>
    );

    const renderOthers = () => (
        <div className="space-y-3">
            {request.others && (
                <div className="p-3 bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)] text-xs text-[var(--text)]">
                    <span className="font-semibold text-[var(--text-muted)] block mb-1">Doctor's Specification:</span>
                    <p className="font-bold text-sm">{request.others}</p>
                </div>
            )}
            <ResultSection>
                <ValueRow label="Findings / Notes" value={formData.generalNotes} />
            </ResultSection>
        </div>
    );

    const renderSelectedTest = () => {
        switch (selectedTest) {
            case 'clinicalMicroscopy': return renderClinicalMicroscopy();
            case 'bloodChemistry': return renderBloodChemistry();
            case 'pregnancyTest': return renderPregnancyTest();
            case 'hbsagScreening': return renderHbsag();
            case 'hivScreening': return renderHiv();
            case 'parasitology': return renderParasitology();
            case 'dengueRdt': return renderDengue();
            case 'others': return renderOthers();
            default: return null;
        }
    };

    const drawerFooter = (
        <button
            type="button"
            onClick={handlePrint}
            className="lab-encode-btn-secondary min-h-11 w-full sm:w-auto"
        >
            <span className="inline-flex items-center justify-center gap-1.5"><Icon name="printer" className="h-4 w-4" /> Print Results</span>
        </button>
    );

    return (
        <>
            <ToastComponent />
            {showHistory && request.patient_id != null && (
                <PatientLabHistory
                    patientId={request.patient_id}
                    patientName={patientName}
                    onClose={() => setShowHistory(false)}
                />
            )}
            <ClinicalDrawer
                title="Laboratory Result"
                subtitle={`Lab Request #${request.lab_no || request.labrequest_id}`}
                labelledBy="lab-result-dialog-title"
                onClose={onClose}
                className="lab-drawer lab-view-drawer"
                status={<span className="lab-view-completed-badge">Completed</span>}
                closeLabel="Close Laboratory Result"
                footer={drawerFooter}
            >
                <div className="lab-encode-context">
                    <div className="lab-encode-context-row">
                        <div className="lab-encode-avatar">{request.patient_firstName?.[0]?.toUpperCase() ?? '?'}</div>
                        <div className="min-w-0 flex-1">
                            <div className="font-bold text-[var(--text)] text-base truncate">{patientName}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                {request.patient_age != null && <span>{request.patient_age} yrs</span>}
                                {request.patient_sex && <span>{request.patient_sex}</span>}
                                {request.requested_by && <span>Req. by {request.requested_by}</span>}
                            </div>
                        </div>
                        {request.patient_id != null && (
                            <button type="button" onClick={() => setShowHistory(true)} aria-label="View patient lab history" className="lab-encode-history-btn">
                                <Icon name="clock" className="h-3.5 w-3.5" />
                                History
                            </button>
                        )}
                    </div>
                    <div className="lab-encode-context-meta">
                        <span>Requested {formatDisplayDate(request.request_date)}</span>
                        <span>Completed {formatDisplayDate(request.completed_date ?? datePerformed)}</span>
                        {performedBy && <span>Medical Technologist: {performedBy}</span>}
                        {request.chief_complaint && <span>Complaint: {request.chief_complaint}</span>}
                    </div>
                </div>

                {requestedTests.length === 0 ? (
                    <div className="lab-encode-empty">
                        <Icon name="inbox" className="h-6 w-6 text-[var(--text-muted)]" />
                        <p className="font-semibold text-[var(--text)]">No specific tests were requested</p>
                        <p className="text-sm text-[var(--text-secondary)]">This request has no recorded laboratory tests to review.</p>
                    </div>
                ) : availableTests.length === 0 ? (
                    <div className="lab-encode-empty">
                        <Icon name="alert-triangle" className="h-6 w-6 text-[var(--text-muted)]" />
                        <p className="font-semibold text-[var(--text)]">No recorded laboratory results are available for this request.</p>
                    </div>
                ) : (
                    <>
                        <div className="lab-encode-tabs-label">
                            Available Results ({availableTests.length})
                            {availableTests.length < requestedTests.length && (
                                <span className="lab-view-tabs-subtext"> · {availableTests.length} of {requestedTests.length} requested tests have recorded results</span>
                            )}
                        </div>
                        <div className="lab-encode-tabs" role="tablist" aria-label="Available laboratory results">
                            {availableTests.map(t => (
                                <button
                                    key={t.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={selectedTest === t.key}
                                    onClick={() => setSelectedTest(t.key)}
                                    className={`lab-encode-tab ${selectedTest === t.key ? 'is-active' : ''}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="lab-encode-test-panel">
                            {renderSelectedTest()}
                        </div>
                    </>
                )}
            </ClinicalDrawer>
        </>
    );
}
