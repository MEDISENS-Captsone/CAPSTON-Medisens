import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Badge, Button, Card, EmptyState } from '../../components/ui';
import { Icon } from '../../components/shared/Icon';
import { supabase } from '../../lib/supabase/client';

const TEMPLATE_VERSION = 'MEDISENS-DOWNTIME-V1';
const ACTIVE_SHEETS = ['Import Manifest', 'Existing Patients', 'Initial Intake', 'Vitals'] as const;
const DEFERRED_SHEETS = ['Doctor Consultation', 'Laboratory Requests', 'Laboratory Results', 'Prescriptions', 'Follow-Ups'] as const;

type ValidationStatus = 'READY' | 'ERROR' | 'DUPLICATE' | 'CONFLICT' | 'SKIPPED';
type ValidationFinding = { status: ValidationStatus; sheet: string; row?: number; field?: string; message: string };
type PreviewRecord = { reference: string; patientId: string; status: ValidationStatus; findings: ValidationFinding[] };
type ImportRecord = Record<string, unknown>;

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
        const headers = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1, defval: '' })[0] as unknown[] | undefined;
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
        return { reference, patientId: cellText(patient?.patient_id), status, findings: recordFindings };
    });
    return { findings: [...findings, ...skipped], records, skipped, payload };
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
        setError(''); setFileName(file.name); setRecords([]); setFindings([]); setImportPayload([]); setVersion(null); setStep('upload');
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
        }
    };

    const handleImport = async () => {
        setImporting(true); setError('');
        const { data, error: importError } = await supabase.rpc('import_downtime_batch', { p_template_version: TEMPLATE_VERSION, p_records: importPayload });
        setImporting(false);
        if (importError) { console.error('Downtime import failed.', importError); setError('The import could not be completed safely. Your workbook was not confirmed.'); return; }
        const summary = (data as { summary?: Record<string, number> } | null)?.summary;
        if (summary) setFindings((current) => [...current, { status: 'READY', sheet: 'Import Summary', message: `Server import complete: ${summary.imported ?? 0} imported, ${summary.errors ?? 0} errors, ${summary.duplicates ?? 0} duplicates.` }]);
        setStep('confirmed');
    };

    return <div className="pwa-page-pad downtime-import-page">
        <div className="fhsis-page-top">
            <div><p className="fhsis-kicker">Paper recovery workflow</p><h1>Downtime Reference Import</h1><p>Review a completed paper-record workbook before a controlled server import.</p></div>
            <Badge tone="blue">Encoder only · {TEMPLATE_VERSION}</Badge>
        </div>
        <Card className="downtime-import-card">
            <div className="downtime-import-intro"><div className="downtime-import-icon"><Icon name="upload" /></div><div><h2>Upload workbook</h2><p>Use the approved template. Deferred clinical sheets are retained for reference and marked Not supported in V1.</p></div></div>
            <label className="downtime-file-picker"><span>Choose .xlsx file</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleFile(event)} /></label>
            {fileName && <p className="downtime-file-name" role="status">Selected: {fileName}</p>}
            {error && <div className="role-dashboard-alert" role="alert"><p className="role-dashboard-alert-title">Workbook not ready</p><p className="role-dashboard-alert-copy">{error}</p></div>}
        </Card>
        {step === 'review' && <Card className="downtime-import-card"><div className="downtime-import-review-heading"><div><p className="fhsis-kicker">Validation preview</p><h2>{version ? 'Review before confirmation' : 'Template version required'}</h2><p>{version ? 'No database write occurs in this phase. Phase 5 will add the server-authorized import step.' : `This workbook must contain ${TEMPLATE_VERSION}.`}</p></div><div className="downtime-import-counts">{(['READY', 'ERROR', 'DUPLICATE', 'SKIPPED'] as ValidationStatus[]).map((status) => <Badge key={status} tone={status === 'READY' ? 'green' : status === 'SKIPPED' ? 'amber' : 'red'}>{status}: {counts[status]}</Badge>)}</div></div>
            {records.length ? <div className="downtime-import-records" role="list">{records.map((record) => <div key={record.reference} className="downtime-import-record" role="listitem"><div><strong>{record.reference}</strong><span>Patient ID · {record.patientId || 'missing'}</span></div><Badge tone={record.status === 'READY' ? 'green' : 'red'}>{record.status}</Badge></div>)}</div> : <EmptyState title="No active encounters found" description="Add active-sheet rows from the approved template before continuing." />}
            {findings.length > 0 && <div className="downtime-import-findings"><h3>Validation details</h3>{findings.map((finding, index) => <p key={`${finding.sheet}-${finding.row}-${finding.field}-${index}`} className={finding.status === 'SKIPPED' ? 'downtime-finding-skipped' : 'downtime-finding-error'}><strong>{finding.status}</strong> · {finding.sheet}{finding.row ? ` row ${finding.row}` : ''}{finding.field ? ` · ${finding.field}` : ''} — {finding.message}</p>)}</div>}
            <div className="downtime-import-actions"><Button variant="outline" onClick={() => { setStep('upload'); setRecords([]); setFindings([]); setImportPayload([]); setVersion(null); setFileName(''); }}>Cancel</Button><Button disabled={blocked || importing} isLoading={importing} onClick={() => void handleImport()}>Confirm and import</Button></div>
        </Card>}
        {step === 'confirmed' && <Card className="downtime-import-card" role="status"><div className="downtime-import-success"><Icon name="check" /><div><h2>Validation preview confirmed</h2><p>No clinical records were written. This handoff is ready for the future Phase 5 server-authorized import.</p></div></div><Button variant="outline" onClick={() => setStep('review')}>Back to review</Button></Card>}
    </div>;
}
