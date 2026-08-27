// Shared types, constants, and formatting helpers for the Laboratory module.
// Extracted from the former single-file src/app/laboratory/index.tsx (Phase L2).
// Pure move: no field, query, or formatting behavior changed.

export interface LabRequest {
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
    // Legacy request-format flags predating the seven structured categories above.
    // Still live/valid data (read by the Patient Portal's patient_portal_lab_results
    // RPC) but not supported by the current structured encoding workflow. Selected
    // read-only so the Laboratory UI can detect and label them instead of incorrectly
    // reporting "no tests requested" for a request that only uses this older format.
    is_cbc?: boolean | null;
    is_cbc_platelet?: boolean | null;
    is_hgb_hct?: boolean | null;
    is_xray?: boolean | null;
    is_ultrasound?: boolean | null;
    is_rbs?: boolean | null;
    is_fbs?: boolean | null;
    is_uric_acid?: boolean | null;
    is_cholesterol?: boolean | null;
    is_urinalysis?: boolean | null;
    is_fecalysis?: boolean | null;
    is_sputum?: boolean | null;
    // Date the completed lab_result was performed (from lab_result.date_performed).
    // Populated only when a Completed result exists; used for accurate "Completed
    // Today" reporting instead of approximating with request_date. Added in Phase L3.
    completed_date?: string | null;
    patient_firstName?: string;
    patient_lastName?: string;
    patient_age?: number | null;
    patient_sex?: string;
}

export interface PatientRow {
    id: number;
    firstName: string;
    lastName: string;
    age: number | null;
    sex: string;
}

export const LAB_REQUEST_QUEUE_LIMIT = 200;
export const LAB_REQUEST_COLUMNS = 'labrequest_id, consultation_id, patient_id, request_date, lab_no, chief_complaint, is_clinical_microscopy, is_blood_chemistry, is_pregnancy_test, is_hbsag_screening, is_hiv_screening, is_parasitology, is_dengue_rdt, others, requested_by, status, is_cbc, is_cbc_platelet, is_hgb_hct, is_xray, is_ultrasound, is_rbs, is_fbs, is_uric_acid, is_cholesterol, is_urinalysis, is_fecalysis, is_sputum';

// Read-only display labels for the legacy request-format flags — same identifiers
// already surfaced to patients by patient_portal_lab_results() (see
// supabase/migrations/20260825100000_patient_portal_lab_results_test_labels.sql),
// turned into plain display names. Not a mapping to the seven current categories.
export const LEGACY_TEST_DEFS: { flag: keyof LabRequest; label: string }[] = [
    { flag: 'is_cbc', label: 'CBC' },
    { flag: 'is_cbc_platelet', label: 'CBC w/ Platelet' },
    { flag: 'is_hgb_hct', label: 'Hgb/Hct' },
    { flag: 'is_xray', label: 'X-ray' },
    { flag: 'is_ultrasound', label: 'Ultrasound' },
    { flag: 'is_rbs', label: 'RBS' },
    { flag: 'is_fbs', label: 'FBS' },
    { flag: 'is_uric_acid', label: 'Uric Acid' },
    { flag: 'is_cholesterol', label: 'Cholesterol' },
    { flag: 'is_urinalysis', label: 'Urinalysis' },
    { flag: 'is_fecalysis', label: 'Fecalysis' },
    { flag: 'is_sputum', label: 'Sputum' },
];

export function getLegacyTestNames(r: LabRequest): string[] {
    return LEGACY_TEST_DEFS.filter(t => Boolean(r[t.flag])).map(t => t.label);
}

export type CurrentTestKey = 'clinicalMicroscopy' | 'bloodChemistry' | 'pregnancyTest' | 'hbsagScreening' | 'hivScreening' | 'parasitology' | 'dengueRdt';

// Shared between LabEncodePanel (encoding) and LabRequestDetail (viewing/printing) so
// both derive the same dynamic requested-test set from one definition.
export const CURRENT_TEST_DEFS: { key: CurrentTestKey; flag: keyof LabRequest; label: string }[] = [
    { key: 'clinicalMicroscopy', flag: 'is_clinical_microscopy', label: 'Clinical Microscopy' },
    { key: 'bloodChemistry', flag: 'is_blood_chemistry', label: 'Blood Chemistry' },
    { key: 'pregnancyTest', flag: 'is_pregnancy_test', label: 'Pregnancy Test' },
    { key: 'hbsagScreening', flag: 'is_hbsag_screening', label: 'HBsAg Screening' },
    { key: 'hivScreening', flag: 'is_hiv_screening', label: 'HIV Screening' },
    { key: 'parasitology', flag: 'is_parasitology', label: 'Parasitology' },
    { key: 'dengueRdt', flag: 'is_dengue_rdt', label: 'Dengue RDT' },
];

export function formatDateTimeLocal(value?: string | null) {
    const date = value ? new Date(value) : new Date();
    if (isNaN(date.getTime())) {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDisplayDate(str?: string | null) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d.getTime())
        ? str
        : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Shared test-flag helpers (Phase L3): previously duplicated inline in the Dashboard,
// Lab Requests queue, and Analytics chart data.
export function getTestNames(r: LabRequest): string[] {
    const names: string[] = [];
    if (r.is_clinical_microscopy) names.push('Clinical Microscopy');
    if (r.is_blood_chemistry) names.push('Blood Chemistry');
    if (r.is_pregnancy_test) names.push('Pregnancy Test');
    if (r.is_hbsag_screening) names.push('HBsAg Screening');
    if (r.is_hiv_screening) names.push('HIV Screening');
    if (r.is_parasitology) names.push('Parasitology');
    if (r.is_dengue_rdt) names.push('Dengue RDT');
    if (r.others) names.push('Others');
    return names;
}

// "General" was never a stored value on lab_request — only ever a display fallback
// for "no test flags recorded" — so it's replaced with plain, honest copy (L4 cleanup).
export function getTestSummary(r: LabRequest): string {
    const names = getTestNames(r);
    return names.length ? names.join(' · ') : 'Test details unavailable';
}

export function statusBadge(s: string | null): 'success' | 'warning' {
    if (s === 'Completed') return 'success';
    return 'warning';
}
