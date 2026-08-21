import { supabase } from '../../lib/supabase/client';
import { logError } from '../../lib/utils/errors';
import { safeTrim } from '../../lib/utils/strings';
import { getVaccineDisplayName } from '../vaccines/vaccineOptions';
import {
    itemizeLabTests,
    itemizePrescriptionDisplay,
    itemizeText,
    normalizeVaccineRecords,
    type VaccineRecord,
} from './itemization';

export type TransactionType =
    | 'registration'
    | 'consent'
    | 'initial_consultation'
    | 'doctor_consultation'
    | 'lab_request'
    | 'lab_result'
    | 'prescription'
    | 'pharmacy'
    | 'vaccine'
    | 'follow_up';

export interface PatientTransactionItemGroup {
    label: string;
    values: string[];
}

export interface PatientTransaction {
    id: string;
    type: TransactionType;
    title: string;
    date?: string | null;
    status?: string | null;
    summary?: string;
    items: PatientTransactionItemGroup[];
    /** Raw data passed through for click-handler use (e.g. lab result viewer). */
    metadata?: Record<string, unknown>;
}

export interface PatientHistoryWarning {
    label: string;
    message: string;
    kind?: 'retrieval' | 'application';
}

export interface PatientHistoryResult {
    transactions: PatientTransaction[];
    warnings: PatientHistoryWarning[];
}

interface PatientRow {
    id: string | number;
    created_at: string | null;
    firstName: string | null;
    lastName: string | null;
    age: string | number | null;
    contactNumber: string | null;
    address: string | null;
}

interface ConsentRow {
    consent_id: string | number;
    patient_id: string | number | null;
    consent_status?: string | null;
    consent_signer?: boolean | null;
    consent_personnel?: string | null;
    personnel_name?: string | null;
    consent_date?: string | null;
    created_at: string | null;
}

interface InitialConsultationRow {
    initialconsultation_id: string | number;
    // Optional because the legacy fallback query can only select the identifier
    // columns; every consumer below already tolerates a missing value.
    consultation_date?: string | null;
    consultation_time?: string | null;
    mode_of_transaction?: string | null;
    referred_by?: string | null;
    mode_of_transfer?: string | null;
    chief_complaint?: string | null;
    diagnosis?: string | null;
}

interface ConsultationRow {
    consultation_id: string | number;
    consultation_date?: string | null;
    created_at?: string | null;
    chief_complaints?: string | null;
    chief_complaint?: string | null;
    assessment?: string | null;
    diagnosis?: string | null;
    remarks?: string | null;
    doctor_name?: string | null;
    medication_treatment?: string | null;
    management_treatment?: string | null;
    plan?: string | null;
    family_history?: string | null;
    immunization_history?: string | null;
    smoking_status?: string | null;
    drinking_status?: string | null;
    past_med_surge_history?: string | null;
    attending_provider?: string | null;
}

interface LabRequestRow {
    labrequest_id: string | number;
    request_date: string | null;
    chief_complaint: string | null;
    status: string | null;
    others: string | null;
    is_cbc: boolean | null;
    is_cbc_platelet: boolean | null;
    is_hgb_hct: boolean | null;
    is_xray: boolean | null;
    is_ultrasound: boolean | null;
    is_rbs: boolean | null;
    is_fbs: boolean | null;
    is_uric_acid: boolean | null;
    is_cholesterol: boolean | null;
    is_urinalysis: boolean | null;
    is_fecalysis: boolean | null;
    is_sputum: boolean | null;
}

interface LabResultRow {
    labresult_id: string | number;
    date_performed: string | null;
    findings: string | null;
    performed_by: string | null;
    status: string | null;
}

interface PrescriptionRow {
    prescription_id: string | number;
    prescription_date: string | null;
    dispensed_at: string | null;
    status: string | null;
    doctor_name: string | null;
    rx_content: string | null;
}

interface FollowUpRow {
    followup_id: string | number;
    visit_date: string | null;
    chief_complaint: string | null;
    medication_treatment: string | null;
    diagnosis: string | null;
    follow_up_status: string | null;
}

interface FhsisLogRow {
    id: string | number;
    category: string | null;
    created_at: string | null;
    data_fields: Record<string, unknown> | null;
}

type HistoryLoadStatus = 'ok' | 'no_records' | 'retrieval_error' | 'application_error';
type QueryResult<T> = { data: T[] | null; error: { message?: string; code?: string; details?: string; hint?: string } | null };
type SectionResult<T> = { label: string; data: T[]; status: HistoryLoadStatus; error?: string };
type HistoryQuery<T> = () => PromiseLike<QueryResult<T>>;

const asText = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value);
const compact = (values: unknown[]) => values.map(value => safeTrim(value)).filter(Boolean);
const itemGroup = (label: string, values: string[]): PatientTransactionItemGroup | null => values.length ? { label, values } : null;
const groups = (items: Array<PatientTransactionItemGroup | null>) => items.filter((item): item is PatientTransactionItemGroup => Boolean(item));

const retrievalMessage = (label: string) => `Unable to load ${label.toLowerCase()} records.`;
const parsingMessage = (label: string) => `Unable to prepare ${label.toLowerCase()} records for display.`;

function classifyHistoryRows<T>(label: string, rows: T[]): SectionResult<T> {
    return {
        label,
        data: rows,
        status: rows.length === 0 ? 'no_records' : 'ok',
    };
}

async function selectHistory<T>(label: string, query: PromiseLike<QueryResult<T>>): Promise<SectionResult<T>> {
    const { data, error } = await query;
    if (error) {
        logError(`Failed to load ${label} history`, error);
        return {
            label,
            data: [],
            status: 'retrieval_error',
            error: retrievalMessage(label),
        };
    }
    return classifyHistoryRows(label, data ?? []);
}

async function selectHistoryWithFallback<T>(
    label: string,
    preferredQuery: HistoryQuery<T>,
    legacyQuery: HistoryQuery<T>,
): Promise<SectionResult<T>> {
    const preferred = await preferredQuery();
    if (!preferred.error) {
        return classifyHistoryRows(label, preferred.data ?? []);
    }

    logError(`Failed to load ${label} history with preferred columns`, preferred.error);

    const legacy = await legacyQuery();
    if (!legacy.error) {
        return classifyHistoryRows(label, legacy.data ?? []);
    }

    logError(`Failed to load ${label} history with legacy columns`, {
        preferredError: preferred.error,
        legacyError: legacy.error,
    });

    return {
        label,
        data: [],
        status: 'retrieval_error',
        error: retrievalMessage(label),
    };
}

function appendHistorySection(
    label: string,
    warnings: PatientHistoryWarning[],
    appendRecords: () => void,
) {
    try {
        appendRecords();
    } catch (error) {
        logError(`Failed to parse ${label} history`, error);
        warnings.push({
            label,
            message: parsingMessage(label),
            kind: 'application',
        });
    }
}

export async function fetchPatientTransactions(patientId: string): Promise<PatientHistoryResult> {
    const numericId = Number(patientId);
    const idValue = Number.isNaN(numericId) ? patientId : numericId;

    const [
        patientsResult,
        consentsResult,
        initialsResult,
        consultationsResult,
        labRequestsResult,
        labResultsResult,
        prescriptionsResult,
        followUpsResult,
        fhsisLogsResult,
    ] = await Promise.all([
        selectHistory<PatientRow>('Registration', supabase.from('patients').select('id, created_at, firstName, lastName, age, contactNumber, address').eq('id', idValue).limit(1)),
        selectHistoryWithFallback<ConsentRow>(
            'Consent',
            () => supabase
                .from('patient_consent')
                .select('consent_id, patient_id, consent_status, consent_signer, consent_personnel, personnel_name, consent_date, created_at')
                .eq('patient_id', idValue),
            () => supabase
                .from('patient_consent')
                .select('consent_id, patient_id, consent_signer, consent_personnel, consent_date, created_at')
                .eq('patient_id', idValue),
        ),
        selectHistoryWithFallback<InitialConsultationRow>(
            'Initial consultation',
            () => supabase
                .from('initial_consultation')
                .select('initialconsultation_id, consultation_date, consultation_time, mode_of_transaction, referred_by, mode_of_transfer, chief_complaint, diagnosis')
                .eq('patient_id', idValue),
            () => supabase
                .from('initial_consultation')
                .select('initialconsultation_id, patient_id')
                .eq('patient_id', idValue),
        ),
        selectHistoryWithFallback<ConsultationRow>(
            'Doctor consultation',
            () => supabase
                .from('consultation')
                .select('consultation_id, consultation_date, created_at, chief_complaints, chief_complaint, assessment, diagnosis, remarks, doctor_name, medication_treatment, management_treatment, plan, family_history, immunization_history, smoking_status, drinking_status, past_med_surge_history, attending_provider')
                .eq('patient_id', idValue),
            () => supabase
                .from('consultation')
                .select('consultation_id, patient_id')
                .eq('patient_id', idValue),
        ),
        selectHistory<LabRequestRow>('Lab requests', supabase.from('lab_request').select('labrequest_id, request_date, chief_complaint, status, others, is_cbc, is_cbc_platelet, is_hgb_hct, is_xray, is_ultrasound, is_rbs, is_fbs, is_uric_acid, is_cholesterol, is_urinalysis, is_fecalysis, is_sputum').eq('patient_id', idValue)),
        selectHistory<LabResultRow>('Lab results', supabase.from('lab_result').select('labresult_id, date_performed, findings, performed_by, status').eq('patient_id', idValue)),
        selectHistory<PrescriptionRow>('Prescriptions', supabase.from('prescription').select('prescription_id, prescription_date, dispensed_at, status, doctor_name, rx_content').eq('patient_id', idValue)),
        selectHistory<FollowUpRow>('Follow-ups', supabase.from('follow_up').select('followup_id, visit_date, chief_complaint, medication_treatment, diagnosis, follow_up_status').eq('patient_id', idValue)),
        selectHistory<FhsisLogRow>('FHSIS/vaccines', supabase.from('fhsis_logs').select('id, category, created_at, data_fields').eq('patient_id', idValue)),
    ]);

    const results = [patientsResult, consentsResult, initialsResult, consultationsResult, labRequestsResult, labResultsResult, prescriptionsResult, followUpsResult, fhsisLogsResult];
    const warnings: PatientHistoryWarning[] = results
        .filter(result => result.status === 'retrieval_error')
        .map(result => ({ label: result.label, message: result.error || retrievalMessage(result.label), kind: 'retrieval' as const }));

    if (warnings.length === results.length) {
        throw new Error('Unable to load patient history. All history queries failed.');
    }

    const transactions: PatientTransaction[] = [];
    const patients = patientsResult.data;
    const consents = consentsResult.data;

    appendHistorySection('Registration', warnings, () => {
        patients.forEach(patient => {
            const consentStatus = consents.length > 0 ? asText(consents[0].consent_status || 'Signed') : 'Pending';
            transactions.push({
                id: `registration-${patient.id}`,
                type: 'registration',
                title: 'Patient registered',
                date: patient.created_at,
                status: consentStatus === 'Signed' ? 'Consented' : consentStatus,
                summary: safeTrim(`${asText(patient.firstName)} ${asText(patient.lastName)}`),
                items: groups([
                    itemGroup('Demographics', compact([`${asText(patient.lastName)}, ${asText(patient.firstName)}`, patient.age == null ? '' : `Age ${asText(patient.age)}`])),
                    itemGroup('Contact', compact([patient.contactNumber, patient.address])),
                ]),
            });
        });
    });

    appendHistorySection('Consent', warnings, () => {
        consents.forEach(consent => {
            const consentStatus = consent.consent_status || (consent.consent_signer ? 'Signed' : 'Recorded');
            const consentPersonnel = consent.personnel_name || consent.consent_personnel;
            transactions.push({
                id: `consent-${consent.consent_id}`,
                type: 'consent',
                title: 'Patient consent',
                date: consent.consent_date || consent.created_at,
                status: asText(consentStatus),
                summary: asText(consentStatus),
                items: groups([
                    itemGroup('Consent status', compact([consentStatus])),
                    itemGroup('Consent date', compact([consent.consent_date || consent.created_at])),
                    itemGroup('Recorded by', compact([consentPersonnel])),
                ]),
            });
        });
    });

    appendHistorySection('Initial consultation', warnings, () => {
        initialsResult.data.forEach(record => {
            transactions.push({
                id: `initial-${record.initialconsultation_id}`,
                type: 'initial_consultation',
                title: 'Nurse initial consultation',
                date: record.consultation_date,
                status: record.mode_of_transaction,
                summary: asText(record.chief_complaint),
                items: groups([
                    itemGroup('Chief complaint', itemizeText(record.chief_complaint)),
                    itemGroup('Diagnosis', itemizeText(record.diagnosis)),
                    itemGroup('Consultation time', compact([record.consultation_time])),
                    itemGroup('Mode of transaction', compact([record.mode_of_transaction])),
                    itemGroup('Referred by', compact([record.referred_by])),
                    itemGroup('Mode of transfer', compact([record.mode_of_transfer])),
                ]),
            });
        });
    });

    appendHistorySection('Doctor consultation', warnings, () => {
        consultationsResult.data.forEach(record => {
            const chiefComplaint = record.chief_complaints || record.chief_complaint;
            const assessment = record.assessment || record.remarks || record.diagnosis;
            const provider = record.attending_provider || record.doctor_name;
            const treatmentItems = [
                ...itemizeText(record.medication_treatment),
                ...itemizeText(record.management_treatment),
                ...itemizeText(record.plan),
                ...itemizeText(record.remarks && record.remarks !== assessment ? record.remarks : null),
            ];
            transactions.push({
                id: `consultation-${record.consultation_id}`,
                type: 'doctor_consultation',
                title: 'Doctor consultation',
                date: record.consultation_date || record.created_at,
                status: provider,
                summary: asText(record.diagnosis),
                items: groups([
                    itemGroup('Chief complaints', itemizeText(chiefComplaint)),
                    itemGroup('Assessment / findings', itemizeText(assessment)),
                    itemGroup('Treatment / management', treatmentItems),
                    itemGroup('Diagnosis', itemizeText(record.diagnosis)),
                    itemGroup('Family history', itemizeText(record.family_history)),
                    itemGroup('Immunization history', itemizeText(record.immunization_history)),
                    itemGroup('Smoking status', compact([record.smoking_status])),
                    itemGroup('Drinking status', compact([record.drinking_status])),
                    itemGroup('Past medical / surgical history', itemizeText(record.past_med_surge_history)),
                ]),
            });
        });
    });

    appendHistorySection('Lab requests', warnings, () => {
        labRequestsResult.data.forEach(record => {
            const requestedTests = itemizeLabTests(record as unknown as Record<string, unknown>);
            transactions.push({
                id: `lab-request-${record.labrequest_id}`,
                type: 'lab_request',
                title: 'Laboratory request',
                date: record.request_date,
                status: record.status || 'Pending',
                summary: `${requestedTests.length} test(s) requested`,
                items: groups([
                    itemGroup('Requested tests', requestedTests),
                    itemGroup('Chief complaint', itemizeText(record.chief_complaint)),
                ]),
            });
        });
    });

    appendHistorySection('Lab results', warnings, () => {
        labResultsResult.data.forEach(record => {
            transactions.push({
                id: `lab-result-${record.labresult_id}`,
                type: 'lab_result',
                title: 'Laboratory result',
                date: record.date_performed,
                status: record.status || 'Completed',
                summary: asText(record.performed_by),
                items: groups([
                    itemGroup('Performed by', compact([record.performed_by])),
                    itemGroup('Date performed', compact([record.date_performed])),
                ]),
                metadata: {
                    labresult_id: record.labresult_id,
                    findings: record.findings,
                    performed_by: record.performed_by,
                    date_performed: record.date_performed,
                },
            });
        });
    });

    appendHistorySection('Prescriptions', warnings, () => {
        prescriptionsResult.data.forEach(record => {
            const medicationValues = itemizePrescriptionDisplay(record.rx_content);
            transactions.push({
                id: `prescription-${record.prescription_id}`,
                type: record.status === 'Dispensed' ? 'pharmacy' : 'prescription',
                title: record.status === 'Dispensed' ? 'Prescription dispensed' : 'Prescription created',
                date: record.dispensed_at || record.prescription_date,
                status: record.status || 'Pending',
                summary: asText(record.doctor_name),
                items: groups([itemGroup('Medications', medicationValues)]),
            });
        });
    });

    appendHistorySection('Follow-ups', warnings, () => {
        followUpsResult.data.forEach(record => {
            transactions.push({
                id: `follow-up-${record.followup_id}`,
                type: 'follow_up',
                title: 'Follow-up visit',
                date: record.visit_date,
                status: record.follow_up_status || 'Scheduled',
                summary: asText(record.diagnosis || record.chief_complaint),
                items: groups([
                    itemGroup('Chief complaint', itemizeText(record.chief_complaint)),
                    itemGroup('Treatment', itemizeText(record.medication_treatment)),
                    itemGroup('Diagnosis', itemizeText(record.diagnosis)),
                    itemGroup('Visit date', compact([record.visit_date])),
                    itemGroup('Status', compact([record.follow_up_status || 'Scheduled'])),
                ]),
            });
        });
    });

    appendHistorySection('FHSIS/vaccines', warnings, () => {
        fhsisLogsResult.data.forEach(log => {
            const vaccines: VaccineRecord[] = normalizeVaccineRecords(log.data_fields);
            vaccines.forEach(vaccine => {
                transactions.push({
                    id: `vaccine-${log.id}-${vaccine.id}`,
                    type: 'vaccine',
                    title: 'Vaccine record',
                    date: vaccine.date_given || log.created_at,
                    status: asText(log.category || 'FHSIS'),
                    summary: getVaccineDisplayName(vaccine),
                    items: groups([
                        itemGroup('Vaccine', compact([getVaccineDisplayName(vaccine)])),
                        itemGroup('Category', compact([vaccine.vaccine_category])),
                        itemGroup('Dose', compact([vaccine.dose_label])),
                        itemGroup('Date given', compact([vaccine.date_given])),
                        itemGroup('Next due date', compact([vaccine.next_due_date])),
                        itemGroup('Administered by', compact([vaccine.administered_by])),
                        itemGroup('Facility', compact([vaccine.facility])),
                        itemGroup('Lot number', compact([vaccine.lot_number])),
                        itemGroup('Remarks', compact([vaccine.remarks])),
                    ]),
                });
            });
        });
    });

    return {
        warnings,
        transactions: transactions.sort((a, b) => {
            const aTime = a.date ? new Date(a.date).getTime() : 0;
            const bTime = b.date ? new Date(b.date).getTime() : 0;
            return bTime - aTime;
        }),
    };
}
