// Encode Result workflow — task-focused data-entry slide-over, separate from the
// formal read-only Laboratory Result report (LabRequestDetail.tsx, used for View
// Result on completed requests). Reuses the existing MediSens right-side slide-over
// pattern (ClinicalDrawer + Modal) rather than inventing a new interaction system —
// Modal already provides focus trapping, Escape-to-close, and focus restoration to
// the trigger button.
//
// Findings are stored under the same JSON keys the original single-file encoding
// form used (clinicalMicroscopy.protein, pregnancyTest.result, etc.) so results
// encoded here remain fully readable by the unchanged LabRequestDetail viewer and by
// any already-completed results in the database. Business logic (upsertCompletedLabResult,
// duplicate-submit protection, Completed-only gating) is unchanged.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/shared/Icon';
import { supabase } from '../../lib/supabase/client';
import { useToast } from '../../components/feedback/Toast';
import { logError } from '../../lib/utils/errors';
import { upsertCompletedLabResult } from '../../features/laboratory/services';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { PatientLabHistory } from './PatientLabHistory';
import { type LabRequest, CURRENT_TEST_DEFS, formatDateTimeLocal, formatDisplayDate, getLegacyTestNames } from './types';

// Fields with a genuine Negative/Positive dipstick-style result in the existing
// implementation, given an "Other" escape hatch so an atypical finding can still be
// recorded as free text without losing information.
const NEG_POS_OTHER_FIELDS = new Set([
    'clinicalMicroscopy.protein', 'clinicalMicroscopy.sugar', 'clinicalMicroscopy.ketones',
    'clinicalMicroscopy.bilirubin', 'clinicalMicroscopy.blood', 'clinicalMicroscopy.leukocytes',
    'clinicalMicroscopy.nitrite', 'parasitology.occultBlood', 'parasitology.ascaris',
    'parasitology.trichuris', 'parasitology.hookworm', 'parasitology.amoeba',
]);

function defaultFormData(): Record<string, any> {
    const today = new Date().toLocaleDateString('en-PH');
    return {
        clinicalMicroscopy: {
            color: 'Yellow', transparency: 'Clear', spGravity: '1.010', pH: '6.0',
            // Quick-select fields start blank — staff must intentionally tap a result,
            // nothing is pre-selected or inferred.
            protein: '', sugar: '', ketones: '', bilirubin: '', blood: '', leukocytes: '', nitrite: '',
            urobilinogen: 'Normal',
            wbc: '', rbc: '', bacteria: '', epithelialCells: '', amorphousSediments: '', mucusThreads: '',
            yeastCells: '', crystals: '', others: ''
        },
        bloodChemistry: {
            fbs: { result: '', unit: 'mg/dL', ref: '70–104', flag: '' },
            cholesterol: { result: '', unit: 'mg/dL', ref: 'Below 200', flag: '' },
            uricAcid: { result: '', unit: 'mg/dL', ref: 'Male: 3–7.2 / Female: 2–6', flag: '' },
            remarks: ''
        },
        pregnancyTest: { methodKit: 'HCG / Sure-Guard', result: '', datePerformed: today, dateReleased: today, serialNo: '' },
        hbsagScreening: { methodUsed: 'HBsAg Rapid Test', kitReagent: 'Biotest RightSign HBsAg Rapid Test Strip', lotNo: '', result: '', datePerformed: today, dateReleased: today, serialNo: '' },
        hivScreening: { methodUsed: 'Rapid Diagnostic Test / HPLC', kitReagent: 'ABBOTT BIOLINE HIV 1/2 3.0', lotNo: '', result: '', datePerformed: today, dateReleased: today, receivedBy: '', serialNo: '' },
        parasitology: {
            color: 'Dark brown', consistency: 'Semi-formed', occultBlood: '', macroOthers: '',
            ascaris: '', trichuris: '', hookworm: '', amoeba: '', microOthers: 'No Ova or Parasite Seen',
            wbc: '0-1', rbc: '0-2', bacteria: '', yeastCells: '', fatGlobules: ''
        },
        dengueRdt: { ns1Ag: '', caseNo: '', datePerformed: today, dateReleased: today },
        generalNotes: '',
    };
}

function requestAgeLabel(requestDate: string | null): string | null {
    if (!requestDate) return null;
    const d = new Date(requestDate);
    if (isNaN(d.getTime())) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day waiting';
    return `${days} days waiting`;
}

function QuickSelect({
    value, options, onChange, allowOther, otherActive, onToggleOther, ariaLabel, disabled,
}: {
    value: string;
    options: string[];
    onChange: (v: string) => void;
    allowOther?: boolean;
    otherActive?: boolean;
    onToggleOther?: (on: boolean) => void;
    ariaLabel: string;
    disabled?: boolean;
}) {
    return (
        <div>
            <div role="radiogroup" aria-label={ariaLabel} className="lab-quickselect">
                {options.map(opt => {
                    const selected = !otherActive && value === opt;
                    return (
                        <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            onClick={() => onChange(opt)}
                            className={`lab-quickselect-btn ${selected ? 'is-selected' : ''}`}
                        >
                            {selected && <Icon name="check" className="h-3 w-3" />}
                            {opt}
                        </button>
                    );
                })}
                {allowOther && (
                    <button
                        type="button"
                        role="radio"
                        aria-checked={Boolean(otherActive)}
                        disabled={disabled}
                        onClick={() => onToggleOther?.(true)}
                        className={`lab-quickselect-btn ${otherActive ? 'is-selected' : ''}`}
                    >
                        {otherActive && <Icon name="check" className="h-3 w-3" />}
                        Other
                    </button>
                )}
            </div>
            {allowOther && otherActive && (
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="Specify finding..."
                    disabled={disabled}
                    className="lab-quickselect-other-input"
                    aria-label={`${ariaLabel} — specify`}
                />
            )}
        </div>
    );
}

export function LabEncodePanel({
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
    const { showToast, ToastComponent } = useToast();
    const [formData, setFormData] = useState<Record<string, any>>(defaultFormData());
    const [datePerformed, setDatePerformed] = useState(formatDateTimeLocal());
    const [otherModeKeys, setOtherModeKeys] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const initialSnapshotRef = useRef<string>('');

    const requestedTests = useMemo(() => {
        const active = CURRENT_TEST_DEFS.filter(t => Boolean(request[t.flag]));
        return request.others
            ? [...active, { key: 'others' as const, flag: 'others' as keyof LabRequest, label: 'Others' }]
            : active;
    }, [request]);

    // At least one known test flag, or a legitimate non-empty `others` request — the
    // only two things the current STRUCTURED encoding workflow recognizes as an
    // actual requested test.
    const hasValidTests = requestedTests.length > 0;

    // Legacy request-format flags (is_cbc, is_xray, is_sputum, ...) are still live,
    // valid data — never mapped onto the 7 current categories — but the structured
    // encoding workflow doesn't support them. Only relevant when there's nothing in
    // the current model to encode, so this only needs to be computed in that case.
    const legacyTestNames = useMemo(
        () => (hasValidTests ? [] : getLegacyTestNames(request)),
        [request, hasValidTests],
    );
    const hasLegacyOnly = !hasValidTests && legacyTestNames.length > 0;

    const [selectedTest, setSelectedTest] = useState<string>('');

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            const fresh = defaultFormData();
            let nextDatePerformed = formatDateTimeLocal();
            let nextOtherModes = new Set<string>();

            try {
                const { data, error } = await supabase
                    .from('lab_result')
                    .select('date_performed, findings')
                    .eq('labrequest_id', request.labrequest_id)
                    .order('labresult_id', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;

                if (data) {
                    nextDatePerformed = formatDateTimeLocal(data.date_performed);
                    if (data.findings) {
                        try {
                            const parsed = JSON.parse(data.findings);
                            if (typeof parsed === 'object' && parsed !== null) {
                                Object.assign(fresh, parsed);
                            }
                        } catch {
                            fresh.generalNotes = data.findings;
                        }
                    }
                }
            } catch (err) {
                logError('Failed to load laboratory result', err);
            }

            NEG_POS_OTHER_FIELDS.forEach(path => {
                const [section, field] = path.split('.');
                const val = fresh[section]?.[field] ?? '';
                if (val && val !== 'Negative' && val !== 'Positive') nextOtherModes.add(path);
            });

            if (cancelled) return;
            setFormData(fresh);
            setDatePerformed(nextDatePerformed);
            setOtherModeKeys(nextOtherModes);
            initialSnapshotRef.current = JSON.stringify({ fresh, nextDatePerformed });
        };

        init();
        return () => { cancelled = true; };
    }, [request.labrequest_id]);

    useEffect(() => {
        setSelectedTest(requestedTests[0]?.key ?? '');
    }, [request.labrequest_id, requestedTests]);

    const isDirty = initialSnapshotRef.current !== '' &&
        initialSnapshotRef.current !== JSON.stringify({ fresh: formData, nextDatePerformed: datePerformed });

    const patientName = request.patient_firstName
        ? `${request.patient_firstName} ${request.patient_lastName}`
        : (request.patient_id ? `Patient #${request.patient_id}` : '—');

    const handleFieldChange = (section: string, field: string, val: any) => {
        setFormData(prev => ({
            ...prev,
            [section]: typeof prev[section] === 'object' ? { ...prev[section], [field]: val } : val,
        }));
    };

    const setOtherMode = (path: string, on: boolean) => {
        setOtherModeKeys(prev => {
            const next = new Set(prev);
            if (on) next.add(path); else next.delete(path);
            return next;
        });
    };

    const isOtherMode = (path: string) => otherModeKeys.has(path);

    const attemptClose = () => {
        if (isDirty) {
            setShowDiscardConfirm(true);
        } else {
            onClose();
        }
    };

    const handleSave = async () => {
        if (savingRef.current) return;
        // Defensive guard: a request with no legitimate requested test must never be
        // completed, even if this function is somehow invoked without the Save button
        // (e.g. a future caller, a stale ref). The UI already hides Save in this case —
        // this is the second, independent check the bug fix requires.
        if (!hasValidTests) {
            showToast('No requested laboratory tests are available to save.', true);
            return;
        }
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
            const performedBy = currentUserName && currentUserName !== 'Loading...' ? currentUserName : 'Medical Technologist';
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
            showToast('Laboratory results saved successfully.', false);
            onClose();
        } catch (err) {
            logError('Failed to submit laboratory results', err);
            showToast('Unable to save laboratory results. Please try again.', true);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    // ── Field helpers ──
    const textField = (section: string, field: string, label: string, placeholder?: string) => (
        <div>
            <label className="lab-field-label">{label}</label>
            <input
                type="text"
                placeholder={placeholder}
                value={formData[section]?.[field] ?? ''}
                onChange={e => handleFieldChange(section, field, e.target.value)}
                className="lab-field-input"
            />
        </div>
    );

    const negPosOtherField = (section: string, field: string, label: string) => {
        const path = `${section}.${field}`;
        return (
            <div>
                <label className="lab-field-label">{label}</label>
                <QuickSelect
                    value={formData[section]?.[field] ?? ''}
                    options={['Negative', 'Positive']}
                    allowOther
                    otherActive={isOtherMode(path)}
                    onToggleOther={(on) => { setOtherMode(path, on); if (on) handleFieldChange(section, field, ''); }}
                    onChange={v => { setOtherMode(path, false); handleFieldChange(section, field, v); }}
                    ariaLabel={label}
                />
            </div>
        );
    };

    const scaleField = (section: string, field: string, label: string) => (
        <div>
            <label className="lab-field-label">{label}</label>
            <QuickSelect
                value={formData[section]?.[field] ?? ''}
                options={['None', 'Few', 'Moderate', 'Many']}
                onChange={v => handleFieldChange(section, field, v)}
                ariaLabel={label}
            />
        </div>
    );

    const twoOptionField = (section: string, field: string, label: string, options: [string, string]) => (
        <div>
            <label className="lab-field-label">{label}</label>
            <QuickSelect
                value={formData[section]?.[field] ?? ''}
                options={options}
                onChange={v => handleFieldChange(section, field, v)}
                ariaLabel={label}
            />
        </div>
    );

    const textAreaField = (section: string, field: string, label: string, rows = 2, placeholder?: string) => (
        <div>
            <label className="lab-field-label">{label}</label>
            <textarea
                rows={rows}
                placeholder={placeholder}
                value={formData[section]?.[field] ?? ''}
                onChange={e => handleFieldChange(section, field, e.target.value)}
                className="lab-field-input"
            />
        </div>
    );

    const renderClinicalMicroscopy = () => (
        <div className="space-y-5">
            <div>
                <div className="lab-encode-section-title">Macroscopic Examination</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {textField('clinicalMicroscopy', 'color', 'Color')}
                    {textField('clinicalMicroscopy', 'transparency', 'Transparency')}
                </div>
            </div>
            <div>
                <div className="lab-encode-section-title">Chemical Examination</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {textField('clinicalMicroscopy', 'spGravity', 'Specific Gravity')}
                    {textField('clinicalMicroscopy', 'pH', 'pH')}
                    {negPosOtherField('clinicalMicroscopy', 'protein', 'Protein')}
                    {negPosOtherField('clinicalMicroscopy', 'sugar', 'Sugar')}
                    {negPosOtherField('clinicalMicroscopy', 'ketones', 'Ketones')}
                    {negPosOtherField('clinicalMicroscopy', 'bilirubin', 'Bilirubin')}
                    {negPosOtherField('clinicalMicroscopy', 'blood', 'Blood')}
                    {negPosOtherField('clinicalMicroscopy', 'leukocytes', 'Leukocytes')}
                    {negPosOtherField('clinicalMicroscopy', 'nitrite', 'Nitrite')}
                    {textField('clinicalMicroscopy', 'urobilinogen', 'Urobilinogen')}
                </div>
            </div>
            <div>
                <div className="lab-encode-section-title">Microscopic Examination</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {textField('clinicalMicroscopy', 'wbc', 'WBC (/hpf)', 'e.g. 0-2 or 50-100')}
                    {textField('clinicalMicroscopy', 'rbc', 'RBC (/hpf)', 'e.g. 0-2')}
                    {scaleField('clinicalMicroscopy', 'bacteria', 'Bacteria')}
                    {scaleField('clinicalMicroscopy', 'epithelialCells', 'Epithelial Cells')}
                    {scaleField('clinicalMicroscopy', 'amorphousSediments', 'Amorphous Sediments')}
                    {scaleField('clinicalMicroscopy', 'mucusThreads', 'Mucus Threads')}
                    {scaleField('clinicalMicroscopy', 'yeastCells', 'Yeast Cells')}
                    {textField('clinicalMicroscopy', 'crystals', 'Crystals', 'e.g. Calcium oxalate: Moderate')}
                </div>
                <div className="mt-4">{textField('clinicalMicroscopy', 'others', 'Others')}</div>
            </div>
        </div>
    );

    const bcRow = (label: string, section: 'fbs' | 'cholesterol' | 'uricAcid', unit: string, ref: string) => (
        <tr>
            <td className="lab-encode-table-label">{label}</td>
            <td><input type="text" value={formData.bloodChemistry?.[section]?.result ?? ''} onChange={e => handleFieldChange('bloodChemistry', section, { ...formData.bloodChemistry?.[section], result: e.target.value })} className="lab-field-input text-center" /></td>
            <td className="text-center text-xs text-[var(--text-secondary)]">{unit}</td>
            <td className="text-center text-xs text-[var(--text-secondary)]">{ref}</td>
            <td><input type="text" value={formData.bloodChemistry?.[section]?.flag ?? ''} onChange={e => handleFieldChange('bloodChemistry', section, { ...formData.bloodChemistry?.[section], flag: e.target.value })} className="lab-field-input text-center" /></td>
        </tr>
    );

    const renderBloodChemistry = () => (
        <div className="space-y-4">
            <div className="overflow-x-auto">
                <table className="lab-encode-table">
                    <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
                    <tbody>
                        {bcRow('Fasting Blood Sugar', 'fbs', 'mg/dL', '70–104')}
                        {bcRow('Cholesterol', 'cholesterol', 'mg/dL', 'Below 200')}
                        {bcRow('Uric Acid', 'uricAcid', 'mg/dL', 'M: 3–7.2 / F: 2–6')}
                    </tbody>
                </table>
            </div>
            {textAreaField('bloodChemistry', 'remarks', 'Remarks', 2, 'Interpretation or clinical notes...')}
        </div>
    );

    const renderPregnancyTest = () => (
        <div className="space-y-4">
            {textField('pregnancyTest', 'methodKit', 'Method / Kit')}
            {twoOptionField('pregnancyTest', 'result', 'Result', ['Negative', 'Positive'])}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {textField('pregnancyTest', 'datePerformed', 'Date Performed')}
                {textField('pregnancyTest', 'dateReleased', 'Date Released')}
            </div>
        </div>
    );

    const renderHbsag = () => (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {textField('hbsagScreening', 'methodUsed', 'Method Used')}
                {textField('hbsagScreening', 'kitReagent', 'Kit / Reagent')}
                {textField('hbsagScreening', 'lotNo', 'Lot No.', 'e.g. HBSG25050013')}
            </div>
            {twoOptionField('hbsagScreening', 'result', 'Result', ['Nonreactive', 'Reactive'])}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {textField('hbsagScreening', 'datePerformed', 'Date Performed')}
                {textField('hbsagScreening', 'dateReleased', 'Date Released')}
            </div>
        </div>
    );

    const renderHiv = () => (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {textField('hivScreening', 'methodUsed', 'Method Used')}
                {textField('hivScreening', 'kitReagent', 'Kit / Reagent')}
                {textField('hivScreening', 'lotNo', 'Lot No.', 'e.g. 03ADJ018B')}
            </div>
            {twoOptionField('hivScreening', 'result', 'Result', ['Nonreactive', 'Reactive'])}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {textField('hivScreening', 'datePerformed', 'Date Performed')}
                {textField('hivScreening', 'dateReleased', 'Date Released')}
                {textField('hivScreening', 'receivedBy', 'Received By', 'Signature / Name')}
            </div>
        </div>
    );

    const renderParasitology = () => (
        <div className="space-y-5">
            <div>
                <div className="lab-encode-section-title">Macroscopic Examination</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {textField('parasitology', 'color', 'Color')}
                    {textField('parasitology', 'consistency', 'Consistency')}
                    {negPosOtherField('parasitology', 'occultBlood', 'Occult Blood')}
                    {textField('parasitology', 'macroOthers', 'Others')}
                </div>
            </div>
            <div>
                <div className="lab-encode-section-title">Microscopic Examination</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {negPosOtherField('parasitology', 'ascaris', 'Ascaris lumbricoides ova')}
                    {negPosOtherField('parasitology', 'trichuris', 'Trichuris trichiura ova')}
                    {negPosOtherField('parasitology', 'hookworm', 'Hookworm ova')}
                    {negPosOtherField('parasitology', 'amoeba', 'Amoeba')}
                    {textField('parasitology', 'wbc', 'WBC (/hpf)')}
                    {textField('parasitology', 'rbc', 'RBC (/hpf)')}
                    {scaleField('parasitology', 'bacteria', 'Bacteria')}
                    {scaleField('parasitology', 'yeastCells', 'Yeast Cells')}
                    {scaleField('parasitology', 'fatGlobules', 'Fat Globules')}
                </div>
                <div className="mt-4">{textField('parasitology', 'microOthers', 'Others')}</div>
            </div>
        </div>
    );

    const renderDengue = () => (
        <div className="space-y-4">
            {textField('dengueRdt', 'caseNo', 'Case No.', 'e.g. 26-021')}
            {twoOptionField('dengueRdt', 'ns1Ag', 'Dengue NS1 Ag', ['Positive', 'Negative'])}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {textField('dengueRdt', 'datePerformed', 'Date Performed')}
                {textField('dengueRdt', 'dateReleased', 'Date Released')}
            </div>
        </div>
    );

    // generalNotes is a top-level formData field (not nested under a section), so it
    // needs its own binding rather than the section.field-shaped textAreaField helper.
    const renderOthersFixed = () => (
        <div className="space-y-4">
            <div className="p-3 bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)] text-xs text-[var(--text)]">
                <span className="font-semibold text-[var(--text-muted)] block mb-1">Doctor's Specification:</span>
                <p className="font-bold text-sm">{request.others}</p>
            </div>
            <div>
                <label className="lab-field-label">Laboratory Findings &amp; Notes</label>
                <textarea
                    rows={5}
                    placeholder="Enter findings for other tests..."
                    value={formData.generalNotes ?? ''}
                    onChange={e => setFormData(prev => ({ ...prev, generalNotes: e.target.value }))}
                    className="lab-field-input"
                />
            </div>
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
            case 'others': return renderOthersFixed();
            default: return null;
        }
    };

    const ageLabel = requestAgeLabel(request.request_date);

    // A request with no legitimate requested test (no test flags, no `others` text)
    // has nothing to encode — Save must not be offered at all, not merely left enabled
    // with nothing to do. This is the UI half of the zero-test guard; handleSave has
    // its own independent check as the defensive second half.
    const drawerFooter = showDiscardConfirm ? (
        <>
            <button type="button" onClick={() => setShowDiscardConfirm(false)} className="lab-encode-btn-secondary min-h-11">
                Keep Editing
            </button>
            <button type="button" onClick={onClose} className="lab-encode-btn-destructive min-h-11">
                Discard Changes
            </button>
        </>
    ) : hasValidTests ? (
        <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="lab-encode-btn-primary min-h-11 w-full sm:w-auto sm:min-w-[240px]"
        >
            {saving ? 'Saving...' : <span className="inline-flex items-center justify-center gap-1.5"><Icon name="check" className="h-4 w-4" /> Save Laboratory Results</span>}
        </button>
    ) : null;

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
                title="Encode Laboratory Result"
                subtitle={`Lab Request #${request.lab_no || request.labrequest_id}`}
                labelledBy="lab-encode-dialog-title"
                onClose={attemptClose}
                className="lab-drawer lab-encode-drawer"
                status={<span className="lab-encode-pending-badge">Pending</span>}
                closeLabel="Close Encode Result panel"
                footer={drawerFooter}
            >
                {showDiscardConfirm ? (
                    <div className="lab-encode-discard" role="alertdialog" aria-label="Discard unsaved changes?">
                        <Icon name="alert-triangle" className="h-8 w-8 text-[var(--amber-accent)]" />
                        <p className="font-semibold text-[var(--text)]">You have unsaved changes</p>
                        <p className="text-sm text-[var(--text-secondary)]">Closing now will discard the results you've entered. This request will remain Pending.</p>
                    </div>
                ) : (
                    <>
                        {/* Compact request context — shown once, not repeated per test */}
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
                                <span>Requested {formatDisplayDate(request.request_date)}{ageLabel ? ` · ${ageLabel}` : ''}</span>
                                {request.chief_complaint && <span>Complaint: {request.chief_complaint}</span>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                <div>
                                    <label className="lab-field-label">Medical Technologist</label>
                                    <input type="text" value={currentUserName} disabled className="lab-field-input" />
                                </div>
                                <div>
                                    <label className="lab-field-label">Date Performed</label>
                                    <input
                                        type="datetime-local"
                                        value={datePerformed}
                                        onChange={e => setDatePerformed(e.target.value)}
                                        className="lab-field-input"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Dynamic requested-test subtabs — only tests actually requested for
                            this patient appear here; nothing is shown by default. */}
                        {hasValidTests ? (
                            <>
                                <div className="lab-encode-tabs-label">Requested Tests ({requestedTests.length})</div>
                                <div className="lab-encode-tabs" role="tablist" aria-label="Requested laboratory tests">
                                    {requestedTests.map(t => (
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
                        ) : hasLegacyOnly ? (
                            <div className="lab-encode-empty lab-encode-legacy-notice">
                                <Icon name="alert-triangle" className="h-6 w-6 text-[var(--amber-accent)]" />
                                <p className="font-semibold text-[var(--text)]">Requested: {legacyTestNames.join(', ')}</p>
                                <p className="text-sm text-[var(--text-secondary)]">
                                    This request uses an earlier laboratory request format. Structured result encoding is not available for these test categories in the current workflow.
                                </p>
                            </div>
                        ) : (
                            <div className="lab-encode-empty">
                                <Icon name="inbox" className="h-6 w-6 text-[var(--text-muted)]" />
                                <p className="font-semibold text-[var(--text)]">No specific tests were requested</p>
                                <p className="text-sm text-[var(--text-secondary)]">This request has no recorded laboratory tests to encode.</p>
                            </div>
                        )}
                    </>
                )}
            </ClinicalDrawer>
        </>
    );
}
