import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useToast } from '../../components/feedback/Toast';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { safeTrim, toNumberOrNull as parseNumberOrNull } from '../../lib/utils/strings';
import { Icon } from '../../components/shared/Icon';
import { clinicalInputClass, clinicalLabelClass } from '../../components/ui/ClinicalForm';
import { ClinicalPatientWorklist } from '../../components/patient/ClinicalPatientWorklist';
import { createActorOfflineStore, type OfflineDraft, type OfflineUuid } from '../../lib/offline';
import { getCurrentNurseActorId, NURSE_INTAKE_ENTITY, replayNurseIntakeOutbox, type NurseIntakeOutboxPayload } from '../../features/consultation/nurseIntakeOffline';
import { useNurseIntakeSync } from '../../hooks/useNurseIntakeSync';
import { getNurseIntakeRecord, getNurseIntakeSnapshot, type NurseIntakeSnapshot } from '../../features/consultation/services';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

// Shared clinical form classes
const inputClasses = clinicalInputClass;
const labelClasses = clinicalLabelClass;
const fieldsetClasses = "overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-surface)]";
// Full section headings stay sentence case; uppercase is reserved for small field labels.
const legendClasses = "flex w-full items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)] sm:px-5 lg:px-6";

// ─── Types ────────────────────────────────────────────────────────────────────
interface InitialConsultationData {
    dateOfConsultation: string; consultationTime: string; referredBy: string;
    modeOfTransaction: string; modeOfTransfer: string; chiefComplaints: string;
    diagnosis: string; diagnosisOther: string; historyOfPresentIllness: string;
    bp: string; hr: string; rr: string; temp: string; weight: string; height: string;
    o2Sat: string; nutritionalStatus: string; bmi: string;
    visualAcuityLeft: string; visualAcuityRight: string; bloodType: string;
    generalSurvey: string;
    visitDisposition: 'referred' | 'completed' | '';
}

interface NurseIntakeDraftPayload {
    formData: InitialConsultationData;
    patientName: string;
    patientInfo: Record<string, unknown> | null;
}

// ─── Helper: get current date (YYYY-MM-DD) and time (HH:MM) ─────────────────
const getCurrentDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const makeEmptyForm = (): InitialConsultationData => ({
    dateOfConsultation: getCurrentDate(),
    consultationTime: getCurrentTime(),
    referredBy: '',
    modeOfTransaction: '', modeOfTransfer: '', chiefComplaints: '',
    diagnosis: '', diagnosisOther: '', historyOfPresentIllness: '',
    bp: '', hr: '', rr: '', temp: '', weight: '', height: '',
    o2Sat: '', nutritionalStatus: '', bmi: '',
    visualAcuityLeft: '', visualAcuityRight: '', bloodType: '', generalSurvey: '',
    visitDisposition: '',
});

const DIAGNOSIS_OPTIONS = [
    'Common Cold', 'Pneumonia', 'High Blood Pressure', 'Diabetes', 'Asthma',
    'Dengue', 'Fever', 'Diarrhea', 'UTI', 'Tuberculosis', 'High Cholesterol',
    'Heart Disease', 'Stroke', 'Acid Reflux', 'Arthritis', 'Others',
];

const VITAL_FIELDS: {
    label: string; name: keyof InitialConsultationData; type: string; placeholder?: string; readOnly?: boolean; step?: string; allowedPattern?: RegExp;
}[] = [
    { label: 'BP (mmHg)',        name: 'bp',               type: 'text',   placeholder: '120/80', allowedPattern: /^[\d/]*$/ },
    { label: 'Heart Rate (bpm)', name: 'hr',               type: 'number' },
    { label: 'Resp. Rate (cpm)', name: 'rr',               type: 'number' },
    { label: 'Temp (°C)',        name: 'temp',             type: 'number', step: '0.1' },
    { label: 'O2 Sat (%)',       name: 'o2Sat',            type: 'number' },
    { label: 'Weight (kg)',      name: 'weight',           type: 'number', step: '0.1' },
    { label: 'Height (cm)',      name: 'height',           type: 'number', step: '0.1' },
    { label: 'BMI',              name: 'bmi',              type: 'text',   readOnly: true },
    { label: 'Nutrition Status', name: 'nutritionalStatus', type: 'text',  readOnly: true },
    { label: 'Vis. Acuity (L)', name: 'visualAcuityLeft',  type: 'text',  placeholder: '20/20', allowedPattern: /^[\d/]*$/ },
    { label: 'Vis. Acuity (R)', name: 'visualAcuityRight', type: 'text',  placeholder: '20/20', allowedPattern: /^[\d/]*$/ },
    { label: 'Blood Type',       name: 'bloodType',        type: 'text',  placeholder: 'O+', readOnly: true },
];

const toNumberOrNull = (val: unknown) => parseNumberOrNull(val);

// The role shell keeps its active module in the URL hash. Rewriting the query
// string for patient selection must carry that hash through, or a refresh (or a
// Back press) drops the user out of Initial Consultation and back onto the
// dashboard mid-intake.
const setPatientQuery = (query: string) => {
    window.history.pushState({}, '', `${window.location.pathname}${query}${window.location.hash}`);
};
const CONSENTED_PATIENT_SEARCH_LIMIT = 300;
const INITIAL_CONSULT_PATIENT_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, birthday, birthPlace, bloodType, nationality, religion, civilStatus, address, contactNumber, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress';

const computeBmi = (weight: string, height: string) => {
    const weightKg = parseFloat(weight);
    const heightCm = parseFloat(height);
    if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return '';
    const heightM = heightCm / 100;
    return (weightKg / (heightM * heightM)).toFixed(1);
};

const getNutritionalStatus = (bmi: string) => {
    const bmiValue = parseFloat(bmi);
    if (!bmi || isNaN(bmiValue)) return '';
    if (bmiValue < 16) return 'Severely Underweight';
    if (bmiValue < 18.5) return 'Underweight';
    if (bmiValue < 25) return 'Normal';
    if (bmiValue < 30) return 'Overweight';
    if (bmiValue < 40) return 'Obese';
    return 'Morbidly Obese';
};

export function ConsultationComponent() {
    const [formData, setFormData] = useState<InitialConsultationData>(makeEmptyForm());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);
    const [patientName, setPatientName] = useState('');
    const [patientInfo, setPatientInfo] = useState<any>(null);
    const [actorId, setActorId] = useState<string | null>(null);
    const [pendingDraft, setPendingDraft] = useState<OfflineDraft<NurseIntakeDraftPayload> | null>(null);
    const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [intakeSnapshot, setIntakeSnapshot] = useState<NurseIntakeSnapshot | null>(null);
    const [review, setReview] = useState<{ title: string; initial: Record<string, unknown>; vitals: Record<string, unknown> | null } | null>(null);
    const [discardOperationId, setDiscardOperationId] = useState<OfflineUuid | null>(null);
    const [isLoadingServerReview, setIsLoadingServerReview] = useState(false);

    // New states for Patient Search
    const [consentedPatients, setConsentedPatients] = useState<any[]>([]);

    const { showToast, ToastComponent } = useToast();
    const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const draftIdRef = useRef<OfflineUuid | null>(null);
    const { isReachable, isSyncing, queuedCount, blockedCount, blockedOperations, refreshQueue, retryNow } = useNurseIntakeSync(actorId);

    useEffect(() => {
        let active = true;
        void getCurrentNurseActorId().then(async id => {
            if (!active) return;
            setActorId(id);
            const patientId = new URLSearchParams(window.location.search).get('id');
            if (!patientId) return;
            const drafts = await createActorOfflineStore(id).listDrafts<NurseIntakeDraftPayload>();
            const draft = drafts
                .filter(item => item.route === 'nurse-initial-intake' && item.patientContextId === patientId)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
            if (active && draft) setPendingDraft(draft);
        }).catch(error => logError('Unable to initialize nurse offline storage', error));
        return () => { active = false; };
    }, []);

    useEffect(() => {
        return () => {
            if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        };
    }, []);

    // Load Consented Patients for the search feature
    useEffect(() => {
        const fetchConsentedPatients = async () => {
            const { data, error } = await supabase
                .from('patients')
                .select(`
                    id, firstName, middleName, lastName, age, sex, bloodType, address,
                    patient_consent ( consent_id )
                `)
                .or('archive_status.eq.active,archive_status.is.null')
                .order('lastName', { ascending: true })
                .limit(CONSENTED_PATIENT_SEARCH_LIMIT);

            if (!error && data) {
                const consentedOnly = data.filter((p: any) =>
                    Array.isArray(p.patient_consent) ? p.patient_consent.length > 0 : p.patient_consent !== null
                );
                setConsentedPatients(consentedOnly);
            }
        };
        fetchConsentedPatients();
    }, []);

    const loadPatientDetails = async (id: string) => {
        setCurrentPatientId(id);
        setIntakeSnapshot(null);
        const { data, error } = await supabase
            .from('patients')
            .select(INITIAL_CONSULT_PATIENT_COLUMNS)
            .eq('id', id)
            .or('archive_status.eq.active,archive_status.is.null')
            .single();

        if (data) {
            setPatientName(safeTrim(`${data.lastName}, ${data.firstName} ${data.middleName || ''}`));
            setPatientInfo(data);
            setFormData(prev => ({ ...prev, bloodType: data.bloodType || '' }));
            try {
                setIntakeSnapshot(await getNurseIntakeSnapshot(id));
            } catch (snapshotError) {
                logError('Failed to capture Nurse intake snapshot', snapshotError);
            }
        } else if (error) {
            logError('Failed to load patient details for initial consultation', error);
            setPatientName('Unable to load patient details');
        }
    };

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('id');
        if (id) {
            loadPatientDetails(id);
        } else {
            setPatientName('No Patient Selected');
        }
    }, []);

    useEffect(() => {
        const bmi = computeBmi(formData.weight, formData.height);
        const nutritionalStatus = getNutritionalStatus(bmi);
        setFormData(prev => {
            if (prev.bmi === bmi && prev.nutritionalStatus === nutritionalStatus) return prev;
            return { ...prev, bmi, nutritionalStatus };
        });
    }, [formData.weight, formData.height]);

    useEffect(() => {
        if (!actorId || !currentPatientId || !isDirty || pendingDraft) return;
        const timer = window.setTimeout(() => {
            const store = createActorOfflineStore(actorId);
            void store.putDraft<NurseIntakeDraftPayload>({
                ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}),
                route: 'nurse-initial-intake',
                patientContextId: currentPatientId,
                payload: { formData, patientName, patientInfo },
            }).then(draft => {
                draftIdRef.current = draft.draftId;
                setDraftSavedAt(draft.updatedAt);
            }).catch(error => logError('Unable to save nurse intake draft', error));
        }, 1_000);
        return () => window.clearTimeout(timer);
    }, [actorId, currentPatientId, formData, isDirty, patientInfo, patientName, pendingDraft]);



    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setIsDirty(true);
    };

    const handleRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setIsDirty(true);
    };

    const handleSelectPatient = (id: string) => {
        draftIdRef.current = null;
        setPendingDraft(null);
        setDraftSavedAt(null);
        setIsDirty(false);
        setPatientQuery(`?id=${id}`);
        loadPatientDetails(id);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        if (!currentPatientId) {
            showToast('Select a patient before recording the initial intake.', true);
            return;
        }
        if (!formData.visitDisposition) {
            showToast('Choose whether to complete this visit or refer the patient to the doctor.', true);
            return;
        }
        if (!intakeSnapshot) {
            showToast('Connect to MediSens and reload this patient before saving an offline intake.', true);
            return;
        }

        setIsSubmitting(true);
        try {
            const resolvedDiagnosis = formData.diagnosis === 'Others' ? (safeTrim(formData.diagnosisOther) || 'Others') : formData.diagnosis;

            const initialPayload = {
                patient_id: currentPatientId,
                consultation_date: formData.dateOfConsultation || null,
                consultation_time: formData.consultationTime || null,
                mode_of_transaction: formData.modeOfTransaction || null,
                referred_by: formData.referredBy || null,
                mode_of_transfer: formData.modeOfTransfer || null,
                chief_complaint: formData.chiefComplaints || null,
                diagnosis: resolvedDiagnosis || null,
                visit_disposition: formData.visitDisposition,
            };
            const vitalsPayload = {
                patient_id: currentPatientId,
                bp: formData.bp || null,
                heart_rate: toNumberOrNull(formData.hr),
                respiratory_rate: toNumberOrNull(formData.rr),
                temperature: toNumberOrNull(formData.temp),
                o2_saturation: toNumberOrNull(formData.o2Sat),
                weight: toNumberOrNull(formData.weight),
                height: toNumberOrNull(formData.height),
                nutritional_status: formData.nutritionalStatus || null,
                bmi: toNumberOrNull(formData.bmi),
                visual_acuity_left: formData.visualAcuityLeft || null,
                visual_acuity_right: formData.visualAcuityRight || null,
                general_survey: formData.generalSurvey || null,
            };

            if (!actorId) throw new Error('Authenticated nurse actor is unavailable.');
            const store = createActorOfflineStore(actorId);
            const operation = await store.putOutboxOperation<NurseIntakeOutboxPayload>({
                entityType: NURSE_INTAKE_ENTITY,
                operationType: 'create',
                payload: { initial: initialPayload, vitals: vitalsPayload, patientName, snapshot: intakeSnapshot },
            });
            if (draftIdRef.current) await store.deleteDraft(draftIdRef.current);

            const replay = await replayNurseIntakeOutbox(actorId, true);
            void retryNow();
            const savedToServer = replay.acknowledged.includes(operation.operationId);
            const wasBlocked = replay.blocked.includes(operation.operationId);

            if (wasBlocked) {
                showToast('MediSens could not accept this intake. Your saved copy remains on this device.', true);
                return;
            }

            showToast(
                savedToServer && formData.visitDisposition === 'referred'
                    ? 'Initial intake recorded. Patient referred to the doctor queue.'
                    : savedToServer
                        ? 'Initial intake recorded. Visit marked complete.'
                        : 'Saved on this device. Waiting to sync.',
                false
            );
            // Reset form but keep blood type and refresh date/time for next entry
            setFormData({ ...makeEmptyForm(), bloodType: formData.bloodType });
            setIsDirty(false);
            setDraftSavedAt(null);
            draftIdRef.current = null;

            // Return to the patient-selection view in place (same pattern as the
            // "Change Patient" action below) instead of navigating away, so the
            // surrounding shell, active tab, and scroll position are preserved.
            redirectTimerRef.current = setTimeout(() => {
                setCurrentPatientId(null);
                setPatientInfo(null);
                setPatientName('No Patient Selected');
                setPatientQuery('?');
            }, 1500);
        } catch (err) {
            logError('Failed to save initial consultation', err);
            showToast(healthcareErrorMessage("save the initial consultation"), true);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative mx-auto w-full max-w-[72rem] px-3 pb-12 sm:px-5 lg:px-6">
            <ToastComponent />

            {pendingDraft && (
                <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--amber-border)] bg-[var(--amber-surface)] p-4 text-[var(--amber-ink)] sm:flex-row sm:items-center sm:justify-between" role="status">
                    <div><p className="text-sm font-semibold">You have an unsaved intake draft from {new Date(pendingDraft.updatedAt).toLocaleString('en-PH')}.</p><p className="mt-1 text-xs">Restore it only for this selected patient.</p></div>
                    <div className="flex gap-2">
                        <button type="button" className="min-h-11 rounded-lg border border-[var(--amber-border)] bg-white px-4 text-sm font-semibold" onClick={() => {
                            setFormData(pendingDraft.payload.formData);
                            setPatientName(pendingDraft.payload.patientName);
                            if (pendingDraft.payload.patientInfo) setPatientInfo(pendingDraft.payload.patientInfo);
                            draftIdRef.current = pendingDraft.draftId;
                            setDraftSavedAt(pendingDraft.updatedAt);
                            setIsDirty(true);
                            setPendingDraft(null);
                        }}>Restore draft</button>
                        <button type="button" className="min-h-11 rounded-lg px-4 text-sm font-semibold" onClick={() => {
                            if (!actorId) return;
                            void createActorOfflineStore(actorId).deleteDraft(pendingDraft.draftId).then(() => setPendingDraft(null));
                        }}>Discard draft</button>
                    </div>
                </div>
            )}

            {(draftSavedAt || !isReachable || isSyncing || queuedCount > 0) && (
                <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${isReachable ? 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]' : 'border-[var(--amber-border)] bg-[var(--amber-surface)] text-[var(--amber-ink)]'}`} role="status" aria-live="polite">
                    <span>{isSyncing ? 'Synchronizing saved Nurse intakes…' : blockedCount > 0 ? `${blockedCount} saved intake${blockedCount === 1 ? '' : 's'} needs attention.` : !isReachable ? 'Offline — Nurse intake changes stay on this device.' : queuedCount > 0 ? `${queuedCount} saved intake${queuedCount === 1 ? '' : 's'} waiting to sync.` : draftSavedAt ? `Draft saved on this device · ${new Date(draftSavedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}` : 'Online'}</span>
                    {(!isReachable || queuedCount > blockedCount) && <button type="button" className="min-h-11 rounded-lg border border-current px-3 font-semibold" onClick={() => { void retryNow(); }}>Retry</button>}
                </div>
            )}

            {blockedOperations.map(operation => (
                <section key={operation.operationId} className="mb-4 rounded-[var(--radius-card)] border border-[var(--amber-border)] bg-[var(--amber-surface)] p-4 text-[var(--amber-ink)]" aria-labelledby={`blocked-${operation.operationId}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 id={`blocked-${operation.operationId}`} className="font-semibold">Saved intake needs review</h2>
                            <p className="mt-1 text-sm">{operation.payload.patientName || 'Selected patient'} · saved {new Date(operation.createdAt).toLocaleString('en-PH')}</p>
                            <p className="mt-1 text-sm">{operation.conflict ? 'A newer intake exists in MediSens. Your saved copy was not submitted or changed.' : 'This older saved item cannot be submitted safely because it has no intake snapshot. It remains only on this device.'}</p>
                        </div>
                        <span className="w-fit rounded-full border border-[var(--amber-border)] px-2.5 py-1 text-xs font-semibold">Sync blocked</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setReview({ title: 'Locally saved intake', initial: operation.payload.initial, vitals: operation.payload.vitals })}>Review saved intake</Button>
                        <Button variant="outline" disabled={!isReachable || !operation.conflict?.currentLatestIntakeId || isLoadingServerReview} isLoading={isLoadingServerReview} onClick={() => {
                            const recordId = operation.conflict?.currentLatestIntakeId;
                            if (!recordId) return;
                            setIsLoadingServerReview(true);
                            void getNurseIntakeRecord(recordId).then(record => setReview({ title: 'Current server intake', initial: record.intake, vitals: record.vitals })).catch(error => {
                                logError('Unable to review current Nurse intake', error);
                                showToast('Unable to load the current server intake. Please try again.', true);
                            }).finally(() => setIsLoadingServerReview(false));
                        }}>Review current server record</Button>
                        <Button variant="danger" onClick={() => setDiscardOperationId(operation.operationId)}>Discard saved copy</Button>
                    </div>
                </section>
            ))}

            {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setReview(null); }}>
                <Modal labelledBy="nurse-intake-review-title" onClose={() => setReview(null)} className="max-h-[85vh] max-w-2xl overflow-y-auto bg-[var(--surface)] p-5 shadow-2xl">
                    <h2 id="nurse-intake-review-title" className="text-lg font-semibold text-[var(--text)]">{review.title}</h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Read-only. No local or server data will be overwritten.</p>
                    {[['Intake', review.initial], ['Vitals', review.vitals]].map(([label, values]) => values && <div key={label as string} className="mt-5">
                        <h3 className="font-semibold text-[var(--text)]">{label as string}</h3>
                        <dl className="mt-2 grid gap-x-4 gap-y-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2">
                            {Object.entries(values as Record<string, unknown>).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium text-[var(--text-secondary)]">{key.replaceAll('_', ' ')}</dt><dd className="break-words text-sm text-[var(--text)]">{value === null || value === '' ? '—' : String(value)}</dd></div>)}
                        </dl>
                    </div>)}
                    <div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => setReview(null)}>Close</Button></div>
                </Modal>
            </div>}

            {discardOperationId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <Modal labelledBy="discard-intake-title" onClose={() => setDiscardOperationId(null)} className="max-w-md bg-[var(--surface)] p-5 shadow-2xl">
                    <h2 id="discard-intake-title" className="text-lg font-semibold text-[var(--text)]">Discard locally saved intake?</h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">This removes only the queued copy from this device. The current server record and clinical history will remain unchanged.</p>
                    <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setDiscardOperationId(null)}>Cancel</Button><Button variant="danger" onClick={() => {
                        if (!actorId) return;
                        void createActorOfflineStore(actorId).deleteOutboxOperation(discardOperationId).then(() => {
                            setDiscardOperationId(null);
                            showToast('Locally saved intake discarded.', false);
                            void refreshQueue();
                        }).catch(error => { logError('Unable to discard saved Nurse intake', error); showToast('Unable to discard the saved intake. Please try again.', true); });
                    }}>Discard saved copy</Button></div>
                </Modal>
            </div>}

            <div className="mb-5 flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-surface)] sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:p-5 lg:p-6">
                <div className="min-w-0">
                    <h1 className="text-[length:var(--type-page-title-size)] font-bold leading-[var(--type-page-title-line)] text-[var(--text)] flex items-center gap-2"><Icon name="clipboard" className="h-6 w-6" /> Initial Consultation</h1>
                    {patientInfo ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-2)]" aria-label="Selected patient context">
                            <span className="max-w-full rounded-[var(--radius-badge)] border border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] px-3 py-1.5 font-semibold text-[var(--brand-active)] break-words">{patientName}</span>
                            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"><Icon name="user" className="h-3.5 w-3.5" /> {patientInfo.sex || 'N/A'}</span>
                            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"><Icon name="calendar" className="h-3.5 w-3.5" /> {patientInfo.age ?? 'N/A'} yrs</span>
                            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"><Icon name="droplet" className="h-3.5 w-3.5" /> {patientInfo.bloodType || 'N/A'}</span>
                        </div>
                    ) : (
                        <p className="text-sm text-[var(--text-secondary)] mt-2">Search and select a consented patient to begin.</p>
                    )}
                </div>

                {currentPatientId && (
                    <button onClick={() => { setCurrentPatientId(null); setPatientInfo(null); setPatientQuery('?'); }} className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-[var(--border)] shadow-sm shrink-0 text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--surface-subtle)] transition-colors">
                        <Icon name="search" className="h-4 w-4" /> Search Another
                    </button>
                )}
            </div>

            {!currentPatientId ? (
                <ClinicalPatientWorklist
                    patients={consentedPatients}
                    onSelect={(patient) => handleSelectPatient(String(patient.id))}
                    title="Initial consultation worklist"
                    instruction="Patients with signed consent are ready for vitals and initial consultation."
                    emptyMessage="No consented patients are currently available."
                    actionLabel="Begin intake"
                    showBarangayFilter
                />
            ) : (
                <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5 sm:gap-6">
                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}><span className="text-[var(--text-2)]">①</span> General Information</div>
                        <div className="p-4 sm:p-5 lg:p-6">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-6">
                                <div><label htmlFor="ic-dateOfConsultation" className={labelClasses}>Date of Consultation</label><input id="ic-dateOfConsultation" type="date" name="dateOfConsultation" value={formData.dateOfConsultation} onChange={handleChange} className={inputClasses} required /></div>
                                <div><label htmlFor="ic-consultationTime" className={labelClasses}>Consultation Time</label><input id="ic-consultationTime" type="time" name="consultationTime" value={formData.consultationTime} onChange={handleChange} className={inputClasses} /></div>
                                <div><label htmlFor="ic-referredBy" className={labelClasses}>Referred From / By</label><input id="ic-referredBy" type="text" name="referredBy" value={formData.referredBy} onChange={handleChange} className={inputClasses} placeholder="Name or Department" /></div>
                            </div>
                            <div className="mt-7 grid grid-cols-1 gap-6 border-t border-[var(--border-soft)] pt-6 lg:grid-cols-2 lg:gap-8">
                                <div>
                                    <span id="ic-modeOfTransaction-label" className={labelClasses}>Mode of Transaction</span>
                                    <div className="flex flex-wrap gap-3 mt-2" role="radiogroup" aria-labelledby="ic-modeOfTransaction-label">
                                        {['Walk in', 'Referral'].map(v => (
                                            <label key={v} className={`clinical-choice-label cursor-pointer px-4 py-2.5 border rounded-lg text-sm font-semibold transition-colors ${formData.modeOfTransaction === v ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)]'}`}>
                                                <input type="radio" name="modeOfTransaction" value={v} onChange={handleRadioChange} checked={formData.modeOfTransaction === v} className="sr-only" />{v}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span id="ic-modeOfTransfer-label" className={labelClasses}>Mode of Transfer</span>
                                    <div className="flex flex-wrap gap-3 mt-2" role="radiogroup" aria-labelledby="ic-modeOfTransfer-label">
                                        {['Ambulatory', 'Via Wheelchair'].map(v => (
                                            <label key={v} className={`clinical-choice-label cursor-pointer px-4 py-2.5 border rounded-lg text-sm font-semibold transition-colors ${formData.modeOfTransfer === v ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)]'}`}>
                                                <input type="radio" name="modeOfTransfer" value={v} onChange={handleRadioChange} checked={formData.modeOfTransfer === v} className="sr-only" />{v}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}><Icon name="file-text" className="h-4 w-4 text-[var(--text-2)]" /> Clinical Notes</div>
                        <div className="flex flex-col gap-6 p-4 sm:p-5 lg:p-6">
                            <div>
                                <label htmlFor="ic-chiefComplaints" className={labelClasses}>Chief Complaints</label>
                                <textarea id="ic-chiefComplaints" name="chiefComplaints" value={formData.chiefComplaints} onChange={handleChange} rows={3} className={`${inputClasses} resize-y min-h-[80px]`} placeholder="Describe the patient's primary symptoms..."></textarea>
                            </div>
                            <div>
                                <label htmlFor="ic-diagnosis" className={labelClasses}>Diagnosis</label>
                                <select id="ic-diagnosis" name="diagnosis" value={formData.diagnosis} onChange={handleChange} className={inputClasses}>
                                    <option value="">Select a diagnosis</option>
                                    {DIAGNOSIS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                                {formData.diagnosis === 'Others' && (
                                    <div className="mt-3"><label htmlFor="ic-diagnosisOther" className="sr-only">Specify diagnosis</label><input id="ic-diagnosisOther" type="text" name="diagnosisOther" value={formData.diagnosisOther} onChange={handleChange} className={inputClasses} placeholder="Please specify diagnosis..." autoFocus /></div>
                                )}
                            </div>
                            <div>
                                <label htmlFor="ic-historyOfPresentIllness" className={labelClasses}>History of Present Illnesses</label>
                                <textarea id="ic-historyOfPresentIllness" name="historyOfPresentIllness" value={formData.historyOfPresentIllness} onChange={handleChange} rows={3} className={`${inputClasses} resize-y min-h-[80px]`} placeholder="Relevant medical history leading up to today..."></textarea>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}><Icon name="heart-pulse" className="h-4 w-4 text-[var(--text-2)]" /> Physical Examination & Vital Signs</div>
                        <div className="bg-[var(--surface-subtle)]/10 p-4 sm:p-5 lg:p-6">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-5">
                                {VITAL_FIELDS.map(f => (
                                    <div key={f.name} className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)]">
                                        <label htmlFor={`ic-${f.name}`} className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">{f.label}</label>
                                        <input
                                            id={`ic-${f.name}`}
                                            type={f.type} name={f.name} value={formData[f.name]} onChange={handleChange} readOnly={f.readOnly || false} step={f.step} placeholder={f.placeholder || ''}
                                            onKeyDown={f.type === 'number' ? (e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); } : undefined}
                                            onBeforeInput={f.allowedPattern ? (e: any) => { if (e.data && !f.allowedPattern!.test(e.data)) e.preventDefault(); } : undefined}
                                            onPaste={f.allowedPattern ? (e) => { const pasted = e.clipboardData.getData('text'); if (!f.allowedPattern!.test(pasted)) e.preventDefault(); } : undefined}
                                            className={`w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-color)] outline-none transition-colors ${f.readOnly ? 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-secondary)] font-semibold cursor-not-allowed shadow-none' : 'bg-white text-[var(--text)]'}`}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-7 border-t border-[var(--border)] pt-6">
                                <span id="ic-generalSurvey-label" className={labelClasses}>General Survey Status</span>
                                <div className="flex flex-wrap gap-3 mt-3" role="radiogroup" aria-labelledby="ic-generalSurvey-label">
                                    {['Awake and Alert', 'Altered Sensorium'].map(v => (
                                        <label key={v} className={`clinical-choice-label cursor-pointer px-4 py-3 border rounded-lg text-sm font-semibold transition-colors ${formData.generalSurvey === v ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)]'}`}>
                                            <input type="radio" name="generalSurvey" value={v} onChange={handleRadioChange} checked={formData.generalSurvey === v} className="sr-only" />{v}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}><Icon name="clipboard" className="h-4 w-4 text-[var(--text-2)]" /> Visit Outcome</div>
                        <div className="p-4 sm:p-5 lg:p-6">
                            <span id="ic-visitDisposition-label" className={labelClasses}>What happens next for this patient?</span>
                            <div className="flex flex-wrap gap-3 mt-2" role="radiogroup" aria-labelledby="ic-visitDisposition-label">
                                <label className={`clinical-choice-label cursor-pointer px-4 py-3 border rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${formData.visitDisposition === 'completed' ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)]'}`}>
                                    <input type="radio" name="visitDisposition" value="completed" onChange={handleRadioChange} checked={formData.visitDisposition === 'completed'} className="sr-only" />
                                    <Icon name="check" className="h-4 w-4" /> Complete Visit
                                </label>
                                <label className={`clinical-choice-label cursor-pointer px-4 py-3 border rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${formData.visitDisposition === 'referred' ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)]'}`}>
                                    <input type="radio" name="visitDisposition" value="referred" onChange={handleRadioChange} checked={formData.visitDisposition === 'referred'} className="sr-only" />
                                    <Icon name="clipboard" className="h-4 w-4" /> Refer to Doctor
                                </label>
                            </div>
                            <p className="mt-3 text-xs text-[var(--text-secondary)]">Completed visits will not appear in the doctor's queue. Referred visits are sent to the doctor for consultation.</p>
                        </div>
                    </fieldset>

                    <div className="flex flex-col items-center justify-end gap-4 border-t border-[var(--border)] pt-5 sm:flex-row sm:pt-6">
                        <button type="submit" disabled={isSubmitting} className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-semibold text-white shadow-sm text-sm transition-colors ${isSubmitting ? 'bg-[var(--text-muted)] cursor-not-allowed shadow-none' : 'bg-[var(--brand-active)] hover:bg-[var(--brand-active-hover)]'}`}>
                            {isSubmitting ? 'Recording Initial Consultation...' : <><Icon name="save" className="inline h-4 w-4 mr-2" />Record Initial Consultation</>}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
