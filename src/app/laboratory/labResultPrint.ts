// Builds the formal, printable Laboratory Result document — used only by the
// "Print Results" action in LabRequestDetail.tsx. Uses the same hidden-iframe
// printHtmlDocument utility already used for prescriptions/medical certificates
// (src/lib/utils/print.ts) rather than an in-page @media print stylesheet, so the
// output never includes the app shell/sidebar/topbar by construction.
//
// Layout closely follows the eight Malvar RHU reference forms in
// docs/laboratory-forms/ (Phase: Print Template Fidelity Refinement):
//   clinical-microscopy-01.jpg / clinical-microscopy-02.jpg  -> Clinical Microscopy
//   blood-chemistry-01.jpg                                    -> Blood Chemistry
//   pregnancy-test.jpg                                        -> Pregnancy Test
//   hbsag-screening.jpg                                       -> HBsAg Screening
//   hiv-screening.jpg                                         -> HIV Screening
//   parasitology.jpg                                          -> Parasitology
//   dengue-rdt.jpg                                             -> Dengue RDT
// (Two Clinical Microscopy images are two photos of the same form, not two
// categories — an older plain print and a newer colored template. No new test
// category was created because of this.)
//
// No official Malvar/Philippine seal image exists in this project, so the
// circular seal artwork is intentionally NOT reproduced (would require fabricating
// it) — only the surrounding text hierarchy and the green header band are
// reproduced. Signature areas show the stored `performed_by` name when available,
// otherwise a blank print-safe signature line; no license number is ever printed
// (MediSens does not store one).
import { type LabRequest, formatDisplayDate } from './types';

function esc(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

function hasStr(v: unknown): boolean {
    return typeof v === 'string' && v.trim() !== '';
}

// A section "has data" only if it contains an actual finding, not merely metadata
// (method/kit/lot/date/unit/reference/performer). Used for Clinical Microscopy and
// Parasitology, whose fields are all findings — there is no separate metadata subset
// to exclude for those two, unlike the single-result tests below.
function sectionHasFinding(v: any): boolean {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'object') return Object.values(v).some(sectionHasFinding);
    return true;
}

export interface PrintableTest {
    key: string;
    label: string;
}

// Print eligibility is evaluated per test against its actual result/finding
// field(s) only — metadata such as method, kit/reagent, lot number, dates, unit,
// reference value, or performer never makes a test printable on its own. A
// Negative/Nonreactive/0 result is still a real result and remains eligible.
export function getPrintableTests(request: LabRequest, formData: Record<string, any>): PrintableTest[] {
    const tests: PrintableTest[] = [];
    if (request.is_clinical_microscopy && sectionHasFinding(formData.clinicalMicroscopy)) {
        tests.push({ key: 'clinicalMicroscopy', label: 'Clinical Microscopy' });
    }
    if (request.is_blood_chemistry && (
        hasStr(formData.bloodChemistry?.fbs?.result) ||
        hasStr(formData.bloodChemistry?.cholesterol?.result) ||
        hasStr(formData.bloodChemistry?.uricAcid?.result) ||
        hasStr(formData.bloodChemistry?.remarks)
    )) {
        tests.push({ key: 'bloodChemistry', label: 'Blood Chemistry' });
    }
    if (request.is_pregnancy_test && hasStr(formData.pregnancyTest?.result)) {
        tests.push({ key: 'pregnancyTest', label: 'Pregnancy Test' });
    }
    if (request.is_hbsag_screening && hasStr(formData.hbsagScreening?.result)) {
        tests.push({ key: 'hbsagScreening', label: 'HBsAg Screening' });
    }
    if (request.is_hiv_screening && hasStr(formData.hivScreening?.result)) {
        tests.push({ key: 'hivScreening', label: 'HIV Screening' });
    }
    if (request.is_parasitology && sectionHasFinding(formData.parasitology)) {
        tests.push({ key: 'parasitology', label: 'Parasitology' });
    }
    if (request.is_dengue_rdt && hasStr(formData.dengueRdt?.ns1Ag)) {
        tests.push({ key: 'dengueRdt', label: 'Dengue RDT' });
    }
    if (request.others && hasStr(formData.generalNotes)) {
        tests.push({ key: 'others', label: 'Other Requested Examination' });
    }
    return tests;
}

function headerBlock(title: string): string {
    return `
        <div class="header-block">
            <p class="rep-line">Republic of the Philippines</p>
            <p class="rep-line">Province of Batangas</p>
            <p class="muni-line">MUNICIPALITY OF MALVAR</p>
            <div class="green-band">OFFICE OF THE MUNICIPAL HEALTH</div>
            <p class="report-title">${esc(title)}</p>
        </div>
    `;
}

function signatureBlock(performedBy: string | null): string {
    return `
        <div class="sig-block">
            ${performedBy
                ? `<div class="sig-typed">${esc(performedBy)}</div>`
                : `<div class="sig-line"></div><div class="sig-caption">(Signature over printed name)</div>`}
            <div class="sig-role">MEDICAL TECHNOLOGIST</div>
        </div>
    `;
}

function cell(label: string, value: unknown): string {
    return `<div class="cm-cell"><span class="cm-cell-label">${esc(label)}</span><span class="cm-cell-value">${hasStr(value) ? esc(value) : ''}</span></div>`;
}

// ── Clinical Microscopy: two boxed columns, matching clinical-microscopy-01/02.jpg ──
function renderClinicalMicroscopyPage(request: LabRequest, formData: Record<string, any>, performedBy: string | null): string {
    const cm = formData.clinicalMicroscopy ?? {};
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : '';
    return `
        <section class="report-page">
            ${headerBlock('CLINICAL MICROSCOPY REPORT')}
            <table class="patient-grid">
                <tr><td class="pg-label">Patient's Name:</td><td class="pg-value">${esc(patientName)}</td><td class="pg-label">Date:</td><td class="pg-value">${esc(formatDisplayDate(request.request_date))}</td></tr>
                <tr><td class="pg-label">Age:</td><td class="pg-value">${esc(request.patient_age ?? '')}</td><td class="pg-label">Sex:</td><td class="pg-value">${esc(request.patient_sex ?? '')}</td></tr>
                <tr><td class="pg-label">Requesting Physician:</td><td class="pg-value" colspan="3">${esc(request.requested_by ?? '')}</td></tr>
            </table>
            <div class="two-col">
                <div class="boxed-col">
                    <div class="box-title">MACROSCOPIC EXAMINATION</div>
                    ${cell('Color', cm.color)}
                    ${cell('Transparency', cm.transparency)}
                    <div class="box-title">CHEMICAL EXAMINATION</div>
                    ${cell('Specific Gravity', cm.spGravity)}
                    ${cell('pH', cm.pH)}
                    ${cell('Protein', cm.protein)}
                    ${cell('Sugar', cm.sugar)}
                    ${cell('Ketones', cm.ketones)}
                    ${cell('Bilirubin', cm.bilirubin)}
                    ${cell('Blood', cm.blood)}
                    ${cell('Leukocytes', cm.leukocytes)}
                    ${cell('Nitrite', cm.nitrite)}
                    ${cell('Urobilinogen', cm.urobilinogen)}
                    ${cell('Others', cm.others)}
                </div>
                <div class="boxed-col">
                    <div class="box-title">MICROSCOPIC EXAMINATION</div>
                    ${cell('WBC', cm.wbc)}
                    ${cell('RBC', cm.rbc)}
                    ${cell('Bacteria', cm.bacteria)}
                    ${cell('Epithelial Cells', cm.epithelialCells)}
                    ${cell('Amorphous Sediments', cm.amorphousSediments)}
                    ${cell('Mucus Threads', cm.mucusThreads)}
                    ${cell('Yeast Cells', cm.yeastCells)}
                    ${cell('Crystals', cm.crystals)}
                </div>
            </div>
            ${signatureBlock(performedBy)}
        </section>
    `;
}

// ── Blood Chemistry: fixed 3-row TEST|RESULT|UNIT|REFERENCE|FLAG table, matching blood-chemistry-01.jpg ──
function renderBloodChemistryPage(request: LabRequest, formData: Record<string, any>, performedBy: string | null): string {
    const bc = formData.bloodChemistry ?? {};
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : '';
    const row = (label: string, cellData: any, unit: string, ref: string) => `
        <tr>
            <td class="name">${esc(label)}</td>
            <td>${hasStr(cellData?.result) ? esc(cellData.result) : ''}</td>
            <td>${esc(unit)}</td>
            <td>${ref}</td>
            <td>${hasStr(cellData?.flag) ? esc(cellData.flag) : ''}</td>
        </tr>
    `;
    return `
        <section class="report-page">
            ${headerBlock('BLOOD CHEMISTRY REPORT')}
            <table class="patient-grid">
                <tr><td class="pg-label">Patient Name:</td><td class="pg-value" colspan="2">${esc(patientName)}</td><td class="pg-label">Date:</td><td class="pg-value">${esc(formatDisplayDate(request.request_date))}</td></tr>
                <tr><td class="pg-label">Age:</td><td class="pg-value" colspan="2">${esc(request.patient_age ?? '')}</td><td class="pg-label">Sex:</td><td class="pg-value">${esc(request.patient_sex ?? '')}</td></tr>
            </table>
            <table class="bc-table">
                <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference Value</th><th>Flag</th></tr></thead>
                <tbody>
                    ${row('FASTING BLOOD SUGAR', bc.fbs, 'mg/dL', '70&ndash;104')}
                    ${row('CHOLESTEROL', bc.cholesterol, 'mg/dL', 'Below 200')}
                    ${row('URIC ACID', bc.uricAcid, 'mg/dL', 'Male: 3&ndash;7.2<br/>Female: 2&ndash;6')}
                </tbody>
            </table>
            <div class="remarks-row"><span class="pg-label">Remarks:</span> ${hasStr(bc.remarks) ? esc(bc.remarks) : ''}</div>
            ${signatureBlock(performedBy)}
        </section>
    `;
}

// ── Pregnancy Test: compact Method/Kit | Result table, matching pregnancy-test.jpg ──
function renderPregnancyPage(request: LabRequest, formData: Record<string, any>, performedBy: string | null): string {
    const pt = formData.pregnancyTest ?? {};
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : '';
    return `
        <section class="report-page compact-page">
            ${headerBlock('PREGNANCY TEST')}
            <table class="patient-grid">
                <tr><td class="pg-label">Name:</td><td class="pg-value" colspan="2">${esc(patientName)}</td><td class="pg-label">Date:</td><td class="pg-value">${esc(formatDisplayDate(request.request_date))}</td></tr>
                <tr><td class="pg-label">Age/Sex:</td><td class="pg-value" colspan="2">${esc(request.patient_age ?? '')} / ${esc(request.patient_sex ?? '')}</td>${request.lab_no ? `<td class="pg-label">Lab No.:</td><td class="pg-value">${esc(request.lab_no)}</td>` : '<td></td><td></td>'}</tr>
            </table>
            <table class="result-2col">
                <thead><tr><th>Method / Kit</th><th>Result</th></tr></thead>
                <tbody><tr><td>${esc(pt.methodKit)}</td><td class="result-value">${esc(pt.result)}</td></tr></tbody>
            </table>
            <div class="two-col-plain">
                ${cell('Date Performed', pt.datePerformed)}
                ${cell('Date Released', pt.dateReleased)}
            </div>
            ${signatureBlock(performedBy)}
        </section>
    `;
}

// ── HBsAg / HIV share the same Method Used|Kit/Reagent|Lot No.|Result structure ──
function renderScreeningPage(
    title: string,
    request: LabRequest,
    section: Record<string, any> | undefined,
    performedBy: string | null,
    includeReceivedBy: boolean,
): string {
    const s = section ?? {};
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : '';
    return `
        <section class="report-page compact-page">
            ${headerBlock(title)}
            <table class="patient-grid">
                <tr><td class="pg-label">Name:</td><td class="pg-value">${esc(patientName)}</td><td class="pg-label">Date Requested:</td><td class="pg-value">${esc(formatDisplayDate(request.request_date))}</td></tr>
                <tr><td class="pg-label">Age:</td><td class="pg-value">${esc(request.patient_age ?? '')}</td><td class="pg-label">Sex:</td><td class="pg-value">${esc(request.patient_sex ?? '')}</td></tr>
                ${request.lab_no ? `<tr><td class="pg-label">Lab Serial No.:</td><td class="pg-value" colspan="3">${esc(request.lab_no)}</td></tr>` : ''}
            </table>
            <table class="screening-table">
                <thead><tr><th>Method Used</th><th>Kit / Reagent Used</th><th>Lot No.</th><th>Result</th></tr></thead>
                <tbody><tr>
                    <td>${esc(s.methodUsed)}</td>
                    <td>${esc(s.kitReagent)}</td>
                    <td>${hasStr(s.lotNo) ? esc(s.lotNo) : ''}</td>
                    <td class="result-value">${esc(s.result)}</td>
                </tr></tbody>
            </table>
            <div class="two-col-plain">
                ${cell('Date Performed', s.datePerformed)}
                ${cell('Date Released', s.dateReleased)}
                ${includeReceivedBy ? cell('Received By', s.receivedBy) : ''}
            </div>
            ${signatureBlock(performedBy)}
        </section>
    `;
}

// ── Parasitology: two boxed columns, matching parasitology.jpg ──
function renderParasitologyPage(request: LabRequest, formData: Record<string, any>, performedBy: string | null): string {
    const p = formData.parasitology ?? {};
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : '';
    return `
        <section class="report-page">
            ${headerBlock('PARASITOLOGY REPORT')}
            <table class="patient-grid">
                <tr><td class="pg-label">Name:</td><td class="pg-value" colspan="2">${esc(patientName)}</td><td class="pg-label">Date:</td><td class="pg-value">${esc(formatDisplayDate(request.request_date))}</td></tr>
                <tr><td class="pg-label">Age:</td><td class="pg-value" colspan="2">${esc(request.patient_age ?? '')}</td><td class="pg-label">Sex:</td><td class="pg-value">${esc(request.patient_sex ?? '')}</td></tr>
            </table>
            <div class="two-col">
                <div class="boxed-col">
                    <div class="box-title">MACROSCOPIC EXAMINATION</div>
                    ${cell('Color', p.color)}
                    ${cell('Consistency', p.consistency)}
                    ${cell('Occult Blood', p.occultBlood)}
                    ${cell('Others', p.macroOthers)}
                </div>
                <div class="boxed-col">
                    <div class="box-title">MICROSCOPIC EXAMINATION</div>
                    ${cell('Ascaris lumbricoides ova', p.ascaris)}
                    ${cell('Trichuris trichiura ova', p.trichuris)}
                    ${cell('Hookworm ova', p.hookworm)}
                    ${cell('Amoeba', p.amoeba)}
                    ${cell('Others', p.microOthers)}
                    ${cell('WBC', p.wbc)}
                    ${cell('RBC', p.rbc)}
                    ${cell('Bacteria', p.bacteria)}
                    ${cell('Yeast Cells', p.yeastCells)}
                    ${cell('Fat Globules', p.fatGlobules)}
                </div>
            </div>
            ${signatureBlock(performedBy)}
        </section>
    `;
}

// ── Dengue RDT: compact "Dengue NS1 Ag = | Result" table, matching dengue-rdt.jpg ──
function renderDenguePage(request: LabRequest, formData: Record<string, any>, performedBy: string | null): string {
    const d = formData.dengueRdt ?? {};
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : '';
    return `
        <section class="report-page compact-page">
            ${headerBlock('DENGUE RDT RESULT')}
            <table class="patient-grid">
                <tr><td class="pg-label">Name:</td><td class="pg-value" colspan="2">${esc(patientName)}</td><td class="pg-label">Date:</td><td class="pg-value">${esc(formatDisplayDate(request.request_date))}</td></tr>
                <tr><td class="pg-label">Age/Sex:</td><td class="pg-value" colspan="2">${esc(request.patient_age ?? '')} / ${esc(request.patient_sex ?? '')}</td>${hasStr(d.caseNo) ? `<td class="pg-label">Case No.:</td><td class="pg-value">${esc(d.caseNo)}</td>` : '<td></td><td></td>'}</tr>
            </table>
            <table class="result-2col">
                <thead><tr><th>Dengue NS1 Ag =</th><th>Result</th></tr></thead>
                <tbody><tr><td></td><td class="result-value">${esc(d.ns1Ag)}</td></tr></tbody>
            </table>
            <div class="two-col-plain">
                ${cell('Date Performed', d.datePerformed)}
                ${cell('Date Released', d.dateReleased)}
            </div>
            ${signatureBlock(performedBy)}
        </section>
    `;
}

function renderOthersPage(request: LabRequest, formData: Record<string, any>, performedBy: string | null): string {
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : '';
    return `
        <section class="report-page compact-page">
            ${headerBlock('OTHER REQUESTED EXAMINATION')}
            <table class="patient-grid">
                <tr><td class="pg-label">Name:</td><td class="pg-value" colspan="2">${esc(patientName)}</td><td class="pg-label">Date:</td><td class="pg-value">${esc(formatDisplayDate(request.request_date))}</td></tr>
            </table>
            <div class="remarks-row"><span class="pg-label">Doctor's Specification:</span> ${esc(request.others)}</div>
            <div class="remarks-row"><span class="pg-label">Findings / Notes:</span> ${esc(formData.generalNotes)}</div>
            ${signatureBlock(performedBy)}
        </section>
    `;
}

function renderPage(key: string, request: LabRequest, formData: Record<string, any>, performedBy: string | null): string {
    switch (key) {
        case 'clinicalMicroscopy': return renderClinicalMicroscopyPage(request, formData, performedBy);
        case 'bloodChemistry': return renderBloodChemistryPage(request, formData, performedBy);
        case 'pregnancyTest': return renderPregnancyPage(request, formData, performedBy);
        case 'hbsagScreening': return renderScreeningPage('HBsAg SCREENING', request, formData.hbsagScreening, performedBy, false);
        case 'hivScreening': return renderScreeningPage('HIV SCREENING RESULT', request, formData.hivScreening, performedBy, true);
        case 'parasitology': return renderParasitologyPage(request, formData, performedBy);
        case 'dengueRdt': return renderDenguePage(request, formData, performedBy);
        case 'others': return renderOthersPage(request, formData, performedBy);
        default: return '';
    }
}

export function buildLabResultPrintHtml(
    request: LabRequest,
    formData: Record<string, any>,
    _datePerformed: string | null,
    performedBy: string | null,
    printableTests: PrintableTest[],
): string {
    const patientName = request.patient_firstName ? `${request.patient_firstName} ${request.patient_lastName}` : 'Laboratory Result';
    const pages = printableTests.map(t => renderPage(t.key, request, formData, performedBy)).join('');

    return `<!DOCTYPE html><html><head>
        <title>Laboratory Result - ${esc(patientName)}</title>
        <style>
            @page { size: A4 portrait; margin: 14mm 16mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 12px; margin: 0; }
            .report-page { page-break-after: always; }
            .report-page:last-child { page-break-after: auto; }
            .compact-page { max-width: 620px; }

            .header-block { text-align: center; margin-bottom: 10px; }
            .header-block .rep-line { margin: 0; font-size: 11px; }
            .header-block .muni-line { margin: 1px 0 6px; font-weight: bold; font-size: 13px; letter-spacing: 0.5px; }
            .header-block .green-band {
                background: #1b6b4e; color: #fff; font-weight: bold; font-size: 13px;
                letter-spacing: 1px; padding: 5px 0; margin-bottom: 8px;
                print-color-adjust: exact; -webkit-print-color-adjust: exact;
            }
            .header-block .report-title { margin: 4px 0 12px; font-weight: bold; font-size: 15px; letter-spacing: 0.5px; }

            table.patient-grid { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px; }
            table.patient-grid td { border: 1px solid #000; padding: 4px 8px; page-break-inside: avoid; }
            .pg-label { font-weight: bold; white-space: nowrap; width: 1%; }
            .pg-value { width: auto; }

            .two-col { display: flex; gap: 14px; align-items: flex-start; }
            .boxed-col { flex: 1; border: 1px solid #000; page-break-inside: avoid; }
            .box-title { background: #eee; font-weight: bold; text-align: center; font-size: 11px; padding: 3px 0; border-bottom: 1px solid #000; }
            .cm-cell { display: flex; justify-content: space-between; gap: 8px; padding: 3px 8px; border-bottom: 1px solid #ccc; font-size: 11.5px; page-break-inside: avoid; }
            .cm-cell:last-child { border-bottom: 0; }
            .cm-cell-label { font-weight: 500; }
            .cm-cell-value { font-weight: bold; text-align: right; }

            table.bc-table, table.screening-table, table.result-2col { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11.5px; page-break-inside: avoid; }
            table.bc-table th, table.bc-table td,
            table.screening-table th, table.screening-table td,
            table.result-2col th, table.result-2col td { border: 1px solid #000; padding: 6px 8px; text-align: center; }
            table.bc-table th, table.screening-table th, table.result-2col th { background: #eee; font-weight: bold; }
            table.bc-table td.name { text-align: left; font-weight: bold; }
            .result-value { font-weight: bold; }

            .two-col-plain { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 14px; font-size: 11.5px; }
            .two-col-plain .cm-cell { border-bottom: 0; padding: 2px 0; flex: 0 0 auto; }

            .remarks-row { font-size: 11.5px; margin-bottom: 10px; padding: 4px 0; border-bottom: 1px solid #ccc; }

            .sig-block { margin-top: 22px; text-align: center; page-break-inside: avoid; }
            .sig-line { border-bottom: 1px solid #000; width: 220px; height: 28px; margin: 0 auto; }
            .sig-caption { font-size: 9.5px; color: #333; margin-top: 2px; }
            .sig-typed { font-weight: bold; font-size: 12px; border-bottom: 1px solid #000; display: inline-block; padding: 0 12px 2px; }
            .sig-role { font-weight: bold; font-size: 11px; margin-top: 3px; letter-spacing: 0.5px; }
        </style>
    </head><body>${pages}</body></html>`;
}
