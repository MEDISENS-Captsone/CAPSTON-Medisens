import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { Button, Card, EmptyState, Modal } from '../../components/ui';
import { Icon } from '../../components/shared/Icon';
import { supabase } from '../../lib/supabase/client';

const TEMPLATE_VERSION = 'MEDISENS-DOWNTIME-V1';
const TEMPLATE_DOWNLOAD = '/downloads/MediSens_Downtime_Reference_Import_Phase2.xlsx';
const ACTIVE_SHEETS = ['Import Manifest', 'Existing Patients', 'Initial Intake', 'Vitals'] as const;
const DEFERRED_SHEETS = ['Doctor Consultation', 'Laboratory Requests', 'Laboratory Results', 'Prescriptions', 'Follow-Ups'] as const;

type ValidationStatus = 'READY' | 'ERROR' | 'DUPLICATE' | 'CONFLICT' | 'SKIPPED';
type ValidationFinding = { status: ValidationStatus; sheet: string; row?: number; field?: string; message: string };
type ImportRecord = Record<string, unknown>;
type ImportSummary = { imported?: number; errors?: number; duplicates?: number; skipped?: number };
type ServerResult = { downtime_reference?: string; status?: ValidationStatus | 'IMPORTED'; message?: string };
type PreviewRecord = { reference: string; patientId: string; patientName: string; status: ValidationStatus; findings: ValidationFinding[]; data: ImportRecord; hasInitialIntake: boolean; hasVitals: boolean; importStatus?: ServerResult['status']; importMessage?: string };

const REQUIRED_COLUMNS: Record<string, string[]> = {
    'Import Manifest': ['downtime_reference', 'patient_id', 'source', 'actual_service_date', 'actual_service_time', 'responsible_staff_reference', 'notes'],
    'Existing Patients': ['patient_id', 'firstName', 'middleName', 'lastName', 'suffix', 'age', 'sex', 'civilStatus', 'birthday', 'nationality', 'bloodType', 'religion', 'birthPlace', 'address', 'contactNumber', 'educationalAttain', 'employmentStatus', 'philhealthNo', 'philhealthStatus', 'category', 'categoryOthers', 'relativeName', 'relativeRelation', 'relativeAddress', 'relativeContact'],
    'Initial Intake': ['downtime_reference', 'patient_id', 'consultation_date', 'consultation_time', 'mode_of_transaction', 'referred_by', 'mode_of_transfer', 'chief_complaint', 'diagnosis', 'visit_disposition'],
    Vitals: ['downtime_reference', 'patient_id', 'bp', 'heart_rate', 'respiratory_rate', 'temperature', 'o2_saturation', 'weight', 'height', 'muac', 'nutritional_status', 'bmi', 'visual_acuity_left', 'visual_acuity_right', 'general_survey'],
};

const REQUIRED_FIELDS: Record<string, string[]> = {
    'Import Manifest': ['downtime_reference', 'patient_id', 'source', 'actual_service_date', 'actual_service_time'],
    'Initial Intake': ['downtime_reference', 'patient_id', 'consultation_date', 'consultation_time', 'mode_of_transaction', 'chief_complaint', 'visit_disposition'],
    Vitals: ['downtime_reference', 'patient_id'],
};

function rowsFor(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function cellText(value: unknown): string { return value === null || value === undefined ? '' : String(value).trim(); }
function normaliseDate(value: unknown, dateOnly: boolean): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        if (dateOnly) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
        return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    return cellText(value);
}

function validateWorkbook(workbook: XLSX.WorkBook): { findings: ValidationFinding[]; records: PreviewRecord[]; skipped: ValidationFinding[]; payload: ImportRecord[] } {
    const findings: ValidationFinding[] = [];
    const skipped: ValidationFinding[] = [];
    const missingSheets = ACTIVE_SHEETS.filter((name) => !workbook.SheetNames.includes(name));
    missingSheets.forEach((sheet) => findings.push({ status: 'ERROR', sheet, field: '*', message: 'Required sheet is missing.' }));
    DEFERRED_SHEETS.filter((name) => workbook.SheetNames.includes(name)).forEach((sheet) => skipped.push({ status: 'SKIPPED', sheet, field: '*', message: 'Not supported in V1; no records will be imported from this sheet.' }));

    const rowsBySheet = new Map<string, Record<string, unknown>[]>();
    ACTIVE_SHEETS.forEach((name) => {
        const sheet = workbook.Sheets[name];
        if (!sheet) return;
        const rows = rowsFor(sheet);
        rowsBySheet.set(name, rows);
        const headers = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1, defval: '' })[0] as unknown as unknown[] | undefined;
        const actual = (headers ?? []).map(cellText);
        const expected = REQUIRED_COLUMNS[name];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) findings.push({ status: 'ERROR', sheet: name, row: 1, field: '*', message: 'Required columns are missing or reordered.' });
        rows.forEach((row, index) => {
            const excelRow = index + 2;
            REQUIRED_FIELDS[name]?.forEach((field) => {
                if (!cellText(row[field])) findings.push({ status: 'ERROR', sheet: name, row: excelRow, field, message: 'Required value is blank.' });
            });
            if (cellText(row.patient_id) && !/^\d+$/.test(cellText(row.patient_id))) findings.push({ status: 'ERROR', sheet: name, row: excelRow, field: 'patient_id', message: 'Patient ID must be a whole number.' });
        });
    });

    const activeRefs = new Map<string, { sheet: string; row: number }[]>();
    ACTIVE_SHEETS.filter((name) => name !== 'Existing Patients').forEach((name) => {
        (rowsBySheet.get(name) ?? []).forEach((row, index) => {
            const reference = cellText(row.downtime_reference);
            if (!reference) return;
            const entries = activeRefs.get(`${name}:${reference}`) ?? [];
            entries.push({ sheet: name, row: index + 2 });
            activeRefs.set(`${name}:${reference}`, entries);
        });
    });
    activeRefs.forEach((entries, key) => {
        if (entries.length > 1) entries.slice(1).forEach((entry) => findings.push({ status: 'DUPLICATE', sheet: entry.sheet, row: entry.row, field: 'downtime_reference', message: `Duplicate downtime reference in ${key.split(':')[0]}.` }));
    });

    const manifestRows = rowsBySheet.get('Import Manifest') ?? [];
    const patientRows = rowsBySheet.get('Existing Patients') ?? [];
    const intakeRows = rowsBySheet.get('Initial Intake') ?? [];
    const vitalsRows = rowsBySheet.get('Vitals') ?? [];
    const refs = new Set([...manifestRows, ...intakeRows, ...vitalsRows].map((row) => cellText(row.downtime_reference)).filter(Boolean));
    const payload: ImportRecord[] = [...refs].map((reference) => {
        const manifest = manifestRows.find((row) => cellText(row.downtime_reference) === reference) ?? {};
        const intake = intakeRows.find((row) => cellText(row.downtime_reference) === reference) ?? {};
        const vitals = vitalsRows.find((row) => cellText(row.downtime_reference) === reference) ?? {};
        return {
            ...manifest,
            ...intake,
            actual_service_date: normaliseDate(manifest.actual_service_date, true),
            actual_service_time: normaliseDate(manifest.actual_service_time, false),
            consultation_date: normaliseDate(intake.consultation_date, true),
            consultation_time: normaliseDate(intake.consultation_time, false),
            vitals: { ...vitals, patient_id: vitals.patient_id ?? intake.patient_id ?? manifest.patient_id },
        };
    });
    const records: PreviewRecord[] = payload.map((payloadRow) => {
        const reference = cellText(payloadRow.downtime_reference);
        const patient = intakeRows.find((row) => cellText(row.downtime_reference) === reference) ?? vitalsRows.find((row) => cellText(row.downtime_reference) === reference) ?? manifestRows.find((row) => cellText(row.downtime_reference) === reference);
        const recordFindings = findings.filter((finding) => {
            if (!finding.row || !['Import Manifest', 'Initial Intake', 'Vitals'].includes(finding.sheet)) return false;
            const sourceRow = rowsBySheet.get(finding.sheet)?.[finding.row - 2];
            return cellText(sourceRow?.downtime_reference) === reference;
        });
        const status: ValidationStatus = recordFindings.some((finding) => finding.status === 'DUPLICATE') ? 'DUPLICATE' : recordFindings.some((finding) => finding.status === 'ERROR') ? 'ERROR' : 'READY';
        const patientId = cellText(patient?.patient_id);
        const patientRow = patientRows.find((row) => cellText(row.patient_id) === patientId);
        const patientName = patientRow ? [patientRow.firstName, patientRow.middleName, patientRow.lastName, patientRow.suffix].map(cellText).filter(Boolean).join(' ') : '';
        return { reference, patientId, patientName, status, findings: recordFindings, data: payloadRow, hasInitialIntake: intakeRows.some((row) => cellText(row.downtime_reference) === reference), hasVitals: vitalsRows.some((row) => cellText(row.downtime_reference) === reference) };
    });
    return { findings: [...findings, ...skipped], records, skipped, payload };
}

type ReviewField = { label: string; value: string };

function ReviewSection({ title, fields }: { title: string; fields: ReviewField[] }) {
    const available = fields.filter((field) => field.value);
    if (!available.length) return null;
    return <section className="downtime-review-section"><h4>{title}</h4><dl>{available.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></section>;
}

function userFacingFinding(finding: ValidationFinding): string {
    if (finding.field === 'template_version') return 'Use the approved Excel template and try again.';
    return `${finding.sheet}${finding.row ? `, row ${finding.row}` : ''}: ${finding.message}`;
}

function userFacingServerMessage(status: ServerResult['status'], message?: string): string {
    if (status === 'DUPLICATE') return 'This downtime encounter was already imported.';
    if (!message) return status === 'ERROR' ? 'This encounter could not be imported safely.' : '';
    if (message.includes('Patient must exist')) return 'The patient could not be verified as active with recorded consent.';
    if (message.includes('Responsible clinical staff')) return 'The responsible staff reference could not be verified.';
    if (message.includes('date/time')) return 'Check the service and consultation date and time.';
    if (message.includes('chief_complaint')) return 'A chief complaint is required.';
    if (message.includes('visit_disposition')) return 'Check the visit disposition in the workbook.';
    if (message.includes('patient_id')) return 'Check the patient identifier in the workbook.';
    if (message.includes('downtime_reference')) return 'Check the downtime encounter reference in the workbook.';
    return 'This encounter could not be imported safely.';
}

function formatDisplayDate(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDisplayTime(value: string): string {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
    if (!match) return value;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return value;
    const date = new Date(2000, 0, 1, hour, minute);
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatDisplayText(value: string): string {
    if (!value) return '';
    return value.toLocaleLowerCase().replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function withUnit(value: string, unit: string): string {
    if (!value || value.toLocaleLowerCase().includes(unit.toLocaleLowerCase())) return value;
    return `${value} ${unit}`;
}

function serviceMoment(data: ImportRecord): string {
    const date = formatDisplayDate(cellText(data.actual_service_date));
    const time = formatDisplayTime(cellText(data.actual_service_time));
    return [date, time].filter(Boolean).join(' · ');
}

export function DowntimeReferenceImportPage() {
    const [fileName, setFileName] = useState('');
    const [version, setVersion] = useState<string | null>(null);
    const [records, setRecords] = useState<PreviewRecord[]>([]);
    const [findings, setFindings] = useState<ValidationFinding[]>([]);
    const [importPayload, setImportPayload] = useState<ImportRecord[]>([]);
    const [importing, setImporting] = useState(false);
    const [step, setStep] = useState<'upload' | 'review' | 'confirmed'>('upload');
    const [error, setError] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [summary, setSummary] = useState<ImportSummary | null>(null);

    const counts = useMemo(() => {
        const next: Record<ValidationStatus, number> = { READY: 0, ERROR: 0, DUPLICATE: 0, CONFLICT: 0, SKIPPED: 0 };
        records.forEach((record) => { next[record.status] += 1; });
        findings.filter((finding) => finding.status === 'SKIPPED').forEach(() => { next.SKIPPED += 1; });
        findings.filter((finding) => finding.status === 'ERROR' && (!finding.row || !['Import Manifest', 'Initial Intake', 'Vitals'].includes(finding.sheet))).forEach(() => { next.ERROR += 1; });
        return next;
    }, [findings, records]);
    const blocked = counts.ERROR > 0 || counts.DUPLICATE > 0 || records.length === 0 || version !== TEMPLATE_VERSION;

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setError(''); setSummary(null); setFileName(file.name); setRecords([]); setFindings([]); setImportPayload([]); setVersion(null); setStep('upload');
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const instructionSheet = workbook.Sheets.Instructions;
            const instructionText = instructionSheet ? XLSX.utils.sheet_to_json<unknown[]>(instructionSheet, { header: 1, defval: '' }).flat().map(cellText).join(' ') : '';
            const detectedVersion = instructionText.includes(TEMPLATE_VERSION) ? TEMPLATE_VERSION : null;
            setVersion(detectedVersion);
            const result = validateWorkbook(workbook);
            if (!detectedVersion) result.findings.unshift({ status: 'ERROR', sheet: 'Instructions', row: 1, field: 'template_version', message: `Unsupported or missing template version. Expected ${TEMPLATE_VERSION}.` });
            setFindings(result.findings); setRecords(result.records); setImportPayload(result.payload); setStep('review');
        } catch (parseError) {
            console.error('Unable to read downtime workbook.', parseError);
            setError('This file could not be read as a MediSens downtime workbook. Choose the approved .xlsx template and try again.');
        } finally {
            event.target.value = '';
        }
    };

    const handleImport = async () => {
        setConfirmOpen(false); setImporting(true); setError('');
        try {
            const { data, error: importError } = await supabase.rpc('import_downtime_batch', { p_template_version: TEMPLATE_VERSION, p_records: importPayload });
            if (importError) { console.error('Downtime import failed.', importError); setError('The import could not be completed safely. Your entries are still here; check your connection and try again.'); return; }
            const response = data as { summary?: ImportSummary; results?: ServerResult[] } | null;
            const nextSummary = response?.summary ?? {};
            setSummary(nextSummary);
            setRecords((current) => current.map((record) => {
                const result = response?.results?.find((item) => item.downtime_reference === record.reference);
                if (!result || !result.status) return record;
                const status = result.status === 'IMPORTED' ? 'READY' : result.status;
                return { ...record, status, importStatus: result.status, importMessage: result.message, findings: result.message ? [{ status, sheet: 'Server import', field: 'downtime_reference', message: result.message }] : record.findings };
            }));
            setFindings((current) => [...current, { status: 'READY', sheet: 'Import Summary', message: `Server result: ${nextSummary.imported ?? 0} imported, ${nextSummary.errors ?? 0} failed, ${nextSummary.duplicates ?? 0} duplicates, ${nextSummary.skipped ?? 0} skipped.` }]);
            setStep('confirmed');
        } finally { setImporting(false); }
    };

    const resetImport = () => { setConfirmOpen(false); setStep('upload'); setRecords([]); setFindings([]); setImportPayload([]); setVersion(null); setFileName(''); setError(''); setSummary(null); };
    const unsupportedSheets = findings.filter((finding) => finding.status === 'SKIPPED');
    const workbookProblems = findings.filter((finding) => finding.status !== 'SKIPPED' && finding.sheet !== 'Import Summary' && !records.some((record) => record.findings.includes(finding)));
    const activeStage = step === 'confirmed' ? 3 : confirmOpen ? 2 : step === 'review' ? 1 : 0;
    const resultKind = (summary?.errors ?? 0) > 0 ? 'failed' : (summary?.duplicates ?? 0) > 0 && (summary?.imported ?? 0) === 0 ? 'duplicate' : 'success';
    const resultTitle = resultKind === 'success' ? 'Encounter import complete' : resultKind === 'duplicate' ? 'Duplicate encounter found' : 'Import completed with issues';
    const resultCopy = resultKind === 'success'
        ? `${summary?.imported ?? 0} downtime encounter${summary?.imported === 1 ? ' was' : 's were'} successfully imported.`
        : resultKind === 'duplicate'
            ? 'No new encounter was added because this downtime encounter was already imported.'
            : 'One or more encounters could not be imported. Review the result below before trying again.';

    return <><div className="pwa-page-pad downtime-import-page" inert={confirmOpen ? true : undefined}>
        <p className="downtime-page-description">Encode completed paper records after an internet outage.</p>
        <nav className="downtime-stage-nav" aria-label="Downtime import progress"><ol>{['Upload', 'Review', 'Confirm', 'Result'].map((label, index) => <li key={label} className={index < activeStage ? 'is-complete' : index === activeStage ? 'is-current' : ''} aria-current={index === activeStage ? 'step' : undefined}><span>{index < activeStage ? <Icon name="check" /> : index + 1}</span><strong>{label}</strong></li>)}</ol></nav>

        {step !== 'confirmed' && <Card className="downtime-workbook-card">
            <div className="downtime-workbook-heading"><div><h2>Workbook</h2><p>Use the approved Excel template for completed downtime records.</p></div><a className="downtime-template-link" href={TEMPLATE_DOWNLOAD} download><Icon name="file-text" />Download Excel Template</a></div>
            <input id="downtime-workbook-file" className="downtime-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleFile(event)} />
            {!fileName ? <label className="downtime-file-picker" htmlFor="downtime-workbook-file"><Icon name="upload" /><span><strong>Choose completed workbook</strong><small>Excel files (.xlsx)</small></span></label> : <div className="downtime-selected-file" aria-live="polite"><span className="downtime-selected-file-icon"><Icon name="file-text" /></span><span className="downtime-selected-file-copy"><strong>{fileName}</strong><small>{step === 'review' && !blocked ? 'Ready for encounter review' : step === 'review' ? 'Workbook needs attention' : 'Checking workbook…'}</small></span><span className="downtime-selected-file-actions"><label htmlFor="downtime-workbook-file">Replace</label><button type="button" onClick={resetImport}>Remove file</button></span></div>}
            {error && <div className="role-dashboard-alert downtime-workbook-alert" role="alert"><p className="role-dashboard-alert-title">Workbook could not be reviewed</p><p className="role-dashboard-alert-copy">{error}</p></div>}
            {unsupportedSheets.length > 0 && <details className="downtime-unsupported-sheets"><summary><Icon name="chevron-right" /><span>{unsupportedSheets.length} unsupported sheet{unsupportedSheets.length === 1 ? '' : 's'} will be ignored</span></summary><ul>{unsupportedSheets.map((finding) => <li key={finding.sheet}>{finding.sheet}</li>)}</ul></details>}
        </Card>}

        {step === 'review' && <section className="downtime-review" aria-labelledby="downtime-review-title">
            <div className="downtime-review-heading"><div><h2 id="downtime-review-title">Review downtime encounters</h2><p>Compare each encounter with the completed paper record before continuing.</p></div><span>{records.length} encounter{records.length === 1 ? '' : 's'} to review</span></div>
            {blocked && <div className="downtime-check-status is-problem" role="alert"><Icon name="alert-triangle" /><div><strong>Workbook needs attention</strong><p>Fix the listed problems in the workbook, then replace this file.</p>{workbookProblems.length > 0 && <ul>{workbookProblems.map((finding, index) => <li key={`${finding.sheet}-${finding.row}-${finding.field}-${index}`}>{userFacingFinding(finding)}</li>)}</ul>}</div></div>}
            {records.length ? <div className="downtime-encounters">{records.map((record, index) => {
                const hasProblem = record.status !== 'READY';
                const data = record.data;
                const vitals = (data.vitals ?? {}) as ImportRecord;
                const value = (key: string) => cellText(data[key]);
                const vital = (key: string) => cellText(vitals[key]);
                const visualAcuity = [vital('visual_acuity_left') && `Left: ${vital('visual_acuity_left')}`, vital('visual_acuity_right') && `Right: ${vital('visual_acuity_right')}`].filter(Boolean).join(' · ');
                return <details key={`${fileName}-${record.reference}-${index}`} className={`downtime-encounter${hasProblem ? ' has-problem' : ''}`} open={hasProblem || records.length === 1 ? true : undefined}><summary><span className="downtime-encounter-summary-copy"><small>Downtime encounter</small><strong>{record.patientName || `Patient ID ${record.patientId || 'missing'}`}</strong><span>{record.reference}</span></span>{hasProblem && <span className="downtime-encounter-check is-problem">Needs attention</span>}</summary><div className="downtime-encounter-body">
                    {record.findings.length > 0 && <div className="downtime-encounter-problems" role="alert"><strong>Review these workbook problems</strong><ul>{record.findings.map((finding, findingIndex) => <li key={`${finding.sheet}-${finding.row}-${finding.field}-${findingIndex}`}>{userFacingFinding(finding)}</li>)}</ul></div>}
                    <div className="downtime-review-grid"><ReviewSection title="Patient" fields={[{ label: 'Patient name', value: record.patientName }, { label: 'Patient ID', value: record.patientId }]} /><ReviewSection title="Service Information" fields={[{ label: 'Service date and time', value: serviceMoment(data) }, { label: 'Responsible staff', value: value('responsible_staff_reference') }, { label: 'Consultation mode', value: formatDisplayText(value('mode_of_transaction')) }]} /><ReviewSection title="Initial Intake" fields={[{ label: 'Chief complaint', value: value('chief_complaint') }, { label: 'Referred by', value: value('referred_by') }, { label: 'Mode of transfer', value: formatDisplayText(value('mode_of_transfer')) }, { label: 'Diagnosis', value: value('diagnosis') }, { label: 'Visit disposition', value: formatDisplayText(value('visit_disposition')) }]} /><ReviewSection title="Vitals" fields={[{ label: 'Blood pressure', value: withUnit(vital('bp'), 'mmHg') }, { label: 'Heart rate', value: withUnit(vital('heart_rate'), 'bpm') }, { label: 'Respiratory rate', value: withUnit(vital('respiratory_rate'), '/min') }, { label: 'Temperature', value: withUnit(vital('temperature'), '°C') }, { label: 'O₂ saturation', value: withUnit(vital('o2_saturation'), '%') }, { label: 'Weight', value: withUnit(vital('weight'), 'kg') }, { label: 'Height', value: withUnit(vital('height'), 'cm') }, { label: 'BMI', value: vital('bmi') }, { label: 'MUAC', value: withUnit(vital('muac'), 'cm') }, { label: 'Nutritional status', value: formatDisplayText(vital('nutritional_status')) }, { label: 'Visual acuity', value: visualAcuity }, { label: 'General survey', value: formatDisplayText(vital('general_survey')) }]} /></div>
                </div></details>;
            })}</div> : <EmptyState title="No downtime encounters found" description="Add rows to the supported sheets in the approved template, then replace this file." />}
            <div className="downtime-import-actions"><Button disabled={blocked || importing} isLoading={importing} onClick={() => setConfirmOpen(true)}>Continue</Button></div>
        </section>}

        {step === 'confirmed' && <Card className={`downtime-result-card is-${resultKind}`} role="status"><div className="downtime-result-heading"><span><Icon name={resultKind === 'success' ? 'check' : 'alert-triangle'} /></span><div><h2>{resultTitle}</h2><p>{resultCopy}</p></div></div><div className="downtime-result-list" role="list">{records.map((record) => { const statusLabel = record.importStatus === 'IMPORTED' ? 'Imported' : record.importStatus === 'DUPLICATE' ? 'Duplicate' : record.importStatus === 'ERROR' ? 'Failed' : 'Processed'; return <div key={record.reference} className={`downtime-result-row is-${statusLabel.toLowerCase()}`} role="listitem"><div><strong>{record.patientName || `Patient ID ${record.patientId || 'missing'}`}</strong><span>{record.reference}</span></div><div><strong>{statusLabel}</strong>{record.importMessage && <span>{userFacingServerMessage(record.importStatus, record.importMessage)}</span>}</div></div>; })}</div><div className="downtime-import-actions"><Button onClick={resetImport}>Import another workbook</Button></div></Card>}

    </div>{confirmOpen && typeof document !== 'undefined' && createPortal(<div className="downtime-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmOpen(false); }}><Modal labelledBy="downtime-confirm-title" className="downtime-confirm-dialog" onClose={() => setConfirmOpen(false)}><div className="downtime-confirm"><div className="downtime-confirm-heading"><span><Icon name="clipboard" /></span><div><h2 id="downtime-confirm-title">Import {records.length} downtime encounter{records.length === 1 ? '' : 's'}?</h2><p>Confirm that these details match the completed paper record{records.length === 1 ? '' : 's'}.</p></div></div><div className="downtime-confirm-encounters">{records.map((record) => { const additions = [record.hasInitialIntake && 'Initial Intake', record.hasVitals && 'Vitals'].filter(Boolean); return <section key={record.reference}><h3>{record.patientName || `Patient ID ${record.patientId || 'missing'}`}</h3>{record.patientName && <p>Patient ID {record.patientId}</p>}<dl>{serviceMoment(record.data) && <div><dt>Service date and time</dt><dd>{serviceMoment(record.data)}</dd></div>}{cellText(record.data.responsible_staff_reference) && <div><dt>Responsible staff</dt><dd>{cellText(record.data.responsible_staff_reference)}</dd></div>}{additions.length > 0 && <div><dt>Will add</dt><dd>{additions.join(' and ')}</dd></div>}</dl></section>; })}</div><div className="downtime-import-actions"><Button variant="outline" onClick={() => setConfirmOpen(false)}>Back</Button><Button disabled={importing} isLoading={importing} onClick={() => void handleImport()}>Import encounter{records.length === 1 ? '' : 's'}</Button></div></div></Modal></div>, document.body)}</>;
}
