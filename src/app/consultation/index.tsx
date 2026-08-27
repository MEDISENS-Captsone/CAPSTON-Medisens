import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '../../lib/supabase/client';
import { useNetworkSync, saveToIndexedDB, initIndexedDB } from '../../hooks/useNetworkSync';
import { useToast } from '../../components/feedback/Toast';
import { completeConsultationAtomic, createLabRequest, createPrescription, upsertConsultation, upsertLatestFollowUpByPatient } from '../../features/consultation/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { isBlank, toNumberOrNull as parseNumberOrNull } from '../../lib/utils/strings';
import { printHtmlDocument } from '../../lib/utils/print';
import { itemizeText } from '../../features/patients/itemization';
import { Icon } from '../../components/shared/Icon';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { clinicalInputClass, clinicalLabelClass, clinicalTextareaClass } from '../../components/ui/ClinicalForm';
import { Skeleton, SkeletonList } from '../../components/ui/Skeleton';
import { PatientChartIdentityHeader, PatientHistoryPanel } from '../../components/patient/PatientChart';
import { ClinicalPatientWorklist } from '../../components/patient/ClinicalPatientWorklist';
import { PediatricGrowth } from '../../components/patient/PediatricGrowth';
import { LabResultDetailModal, type LabResultData } from '../../components/shared/LabResultDetailModal';

// --- Interfaces ---------------------------------------------------------------
export interface ConsultationPageProps {
    doctorName: string;
    doctorInitials?: string;
    patientIdProp?: string | null;
    icidProp?: string | null;
    isFollowUpVisit?: boolean;
    onSelectPatient?: (patientId: string, initialConsultationId: string) => void;
    onBack?: () => void;
    onReturnToQueue?: () => void;
}

interface PatientData {
    id: string; firstName: string; lastName: string; middleName?: string;
    age: number | null; sex: string; birthday?: string; bloodType: string; address?: string; contactNumber?: string;
}

interface Medication { name: string; dosage: string; frequency: string; duration: string; quantity: string; }

interface ConsultationRecord {
    consultation_id: number;
    chief_complaints?: string;
    diagnosis?: string;
    hpi?: string;
    assessment?: string;
    plan?: string;
    family_history?: string;
    immunization_history?: string;
    smoking_status?: string;
    smoking_sticks_per_day?: number | null;
    smoking_years?: number | null;
    drinking_status?: string;
    drinking_frequency?: string;
    drinking_years?: number | null;
    menarche_age?: number | null;
    sexual_onset_age?: number | null;
    is_menopause?: string;
    menopause_age?: number | null;
    lmp?: string;
    interval_cycle?: string;
    period_duration?: string;
    pads_per_day?: number | null;
    birth_control_method?: string;
    gravidity?: number | null;
    parity?: number | null;
    delivery_type?: string;
    full_term_count?: number | null;
    premature_count?: number | null;
    abortion_count?: number | null;
    living_children_count?: number | null;
    pre_eclampsia?: string;
    medication_treatment?: string;
    management_treatment?: string;
    past_med_surge_history?: string;
    attending_provider?: string;
    initial_consultation_id?: number | null;
}

interface VitalSignRecord {
    vitals_id: number;
    bp?: string;
    heart_rate?: number | null;
    respiratory_rate?: number | null;
    temperature?: number | null;
    o2_saturation?: number | null;
    weight?: number | null;
    height?: number | null;
    muac?: number | null;
    nutritional_status?: string;
    bmi?: number | null;
    visual_acuity_left?: string;
    visual_acuity_right?: string;
    general_survey?: string;
    initial_consultation_id?: number | null;
}

interface InitialConsultationRecord {
    initialconsultation_id: number;
    consultation_date?: string;
    consultation_time?: string;
    mode_of_transaction?: string;
    referred_by?: string;
    mode_of_transfer?: string;
    chief_complaint?: string;
    diagnosis?: string;
    vitals?: VitalSignRecord | null;
}

const toNumberOrNull = (val: unknown): number | null => parseNumberOrNull(val);
const FOLLOW_UP_LOAD_COLUMNS = 'followup_id, consultation_id, patient_id, visit_date, visit_time, mode_of_transaction, mode_of_transfer, chief_complaint, diagnosis, history_of_present_illness, bp, heart_rate, respiratory_rate, temperature, o2_saturation, weight, height, muac, nutritional_status, bmi, visual_acuity_left, visual_acuity_right, blood_type, general_survey, medication_treatment, follow_up_status';
const LATEST_VITAL_COLUMNS = 'vitals_id, bp, heart_rate, respiratory_rate, temperature, o2_saturation, weight, height, muac, nutritional_status, bmi, visual_acuity_left, visual_acuity_right, general_survey, initial_consultation_id';
const CONSULTATION_LOAD_COLUMNS = 'consultation_id, patient_id, initial_consultation_id, family_history, past_med_surge_history, chief_complaints, diagnosis, hpi, attending_provider, medication_treatment, management_treatment, assessment, plan, follow_up_status, status, completed_at';

// --- History Panel Sub-Component ----------------------------------------------
function HistoryPanel({ patient, patientName, onClose }: { patient: PatientData; patientName: string; onClose: () => void; }) {
    const { id: patientId, age, birthday, sex } = patient;
    const [consultations, setConsultations] = useState<ConsultationRecord[]>([]);
    const [initialConsults, setInitialConsults] = useState<InitialConsultationRecord[]>([]);
    const [labResults, setLabResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<'all' | 'consultation' | 'initial' | 'lab'>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedLabResult, setSelectedLabResult] = useState<LabResultData | null>(null);

    useEffect(() => {
        async function fetchHistory() {
            setLoading(true);
            const parsedId = parseInt(patientId);
            const numericId = isNaN(parsedId) ? patientId : parsedId;

            const [cRes, iRes, vRes, lrRes] = await Promise.all([
                supabase
                    .from('consultation')
                    .select(`consultation_id, chief_complaints, diagnosis, hpi, assessment, plan, family_history, immunization_history, smoking_status, smoking_sticks_per_day, smoking_years, drinking_status, drinking_frequency, drinking_years, menarche_age, sexual_onset_age, is_menopause, menopause_age, lmp, interval_cycle, period_duration, pads_per_day, birth_control_method, gravidity, parity, delivery_type, full_term_count, premature_count, abortion_count, living_children_count, pre_eclampsia, medication_treatment, management_treatment, past_med_surge_history, attending_provider, initial_consultation_id`)
                    .eq('patient_id', numericId)
                    .order('consultation_id', { ascending: false }),

                supabase
                    .from('initial_consultation')
                    .select(`initialconsultation_id, consultation_date, consultation_time, mode_of_transaction, referred_by, mode_of_transfer, chief_complaint, diagnosis`)
                    .eq('patient_id', numericId)
                    .order('initialconsultation_id', { ascending: false }),

                supabase
                    .from('vital_sign')
                    .select(`vitals_id, bp, heart_rate, respiratory_rate, temperature, o2_saturation, weight, height, muac, nutritional_status, bmi, visual_acuity_left, visual_acuity_right, general_survey, initial_consultation_id`)
                    .eq('patient_id', numericId)
                    .order('vitals_id', { ascending: false }),

                supabase
                    .from('lab_result')
                    .select(`labresult_id, date_performed, performed_by, status, findings, labrequest_id, lab_request(lab_no, is_clinical_microscopy, is_blood_chemistry, is_pregnancy_test, is_hbsag_screening, is_hiv_screening, is_parasitology, is_dengue_rdt, others, request_date)`)
                    .eq('patient_id', numericId)
                    .order('labresult_id', { ascending: false }),
            ]);

            if (cRes.data) setConsultations(cRes.data as ConsultationRecord[]);

            if (lrRes.data) {
                const items = lrRes.data.map((row: any) => {
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
                        ...row,
                        testSummary: tests.length ? tests.join(', ') : 'General / Other',
                        labNo: req.lab_no,
                    };
                });
                setLabResults(items);
            }

            if (iRes.data) {
                const vitalsMap = new Map<number, VitalSignRecord>();
                if (vRes.data) {
                    for (const v of vRes.data as VitalSignRecord[]) {
                        if (v.initial_consultation_id != null) {
                            vitalsMap.set(v.initial_consultation_id, v);
                        }
                    }
                }
                const enriched = (iRes.data as InitialConsultationRecord[]).map((ic) => ({
                    ...ic,
                    vitals: vitalsMap.get(ic.initialconsultation_id) ?? null,
                }));
                setInitialConsults(enriched);
            }

            setLoading(false);
        }
        fetchHistory();
    }, [patientId]);

    const formatDate = (str?: string) => {
        if (!str) return '—';
        const d = new Date(str);
        return isNaN(d.getTime()) ? str : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id);

    const sectionBtn = (label: string, key: typeof activeSection, count: number) => (
        <button
            onClick={() => setActiveSection(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSection === key ? 'bg-[var(--brand-active)] text-white' : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--border-soft)]'}`}
        >
            {label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${activeSection === key ? 'bg-[var(--brand-active)]' : 'bg-[var(--border-soft)] text-[var(--text-2)]'}`}>{count}</span>
        </button>
    );

    const RecordCard = ({ id, badge, badgeColor, date, title, subtitle, children }: {
        id: string; badge: string; badgeColor: string;
        date: string; title: string; subtitle?: string; children: React.ReactNode;
    }) => (
        <article className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <button
                onClick={() => toggle(id)}
                aria-expanded={expandedId === id}
                aria-controls={`${id}-details`}
                className="w-full px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-active)]"
            >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${badgeColor}`}>{badge}</span>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[var(--text)]">{title}</div>
                            {subtitle && <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{subtitle}</div>}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pl-[3.625rem] text-xs font-medium text-[var(--text-muted)] sm:pl-0">
                        <span>{date}</span>
                        <span aria-hidden="true" className="text-[var(--text-secondary)]">{expandedId === id ? '−' : '+'}</span>
                    </div>
                </div>
            </button>
            {expandedId === id && (
                <div id={`${id}-details`} className="space-y-3 border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] px-3.5 py-3.5">{children}</div>
            )}
        </article>
    );

    const Field = ({ label, value }: { label: string; value?: string | number | null }) =>
        value ? (
            <div>
                <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-0.5">{label}</div>
                <div className="text-sm text-[var(--text-2)]">{value}</div>
            </div>
        ) : null;

    const SectionHeader = ({ label }: { label: string }) => (
        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide pt-2 pb-1 border-t border-[var(--border)]">{label}</div>
    );

    const totalCount = consultations.length + initialConsults.length;
    const nameParts = patientName.split(' ').filter(Boolean);
    const historyPatient = {
        firstName: nameParts[0] || patientName,
        lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
    };

    const formatLabDate = (str?: string | null) => {
        if (!str) return '—';
        const d = new Date(str);
        return isNaN(d.getTime()) ? str : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <ClinicalDrawer
            title="Patient History"
            labelledBy="consultation-patient-history-title"
            onClose={onClose}
            subtitle={<>{patientName} · {totalCount} record{totalCount !== 1 ? 's' : ''}</>}
            className="consultation-history-drawer"
        >
                    {/* Lab Result Detail Modal */}
                    {selectedLabResult && (
                        <LabResultDetailModal
                            result={selectedLabResult}
                            onClose={() => setSelectedLabResult(null)}
                        />
                    )}
                    <PatientChartIdentityHeader
                        patient={historyPatient}
                        compact
                        className="mb-3"
                        subtitle={`${totalCount} record${totalCount !== 1 ? 's' : ''}`}
                        actions={(
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close patient history"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-[color,box-shadow] hover:text-[var(--coral-dark)] hover:shadow-[0_0_12px_rgba(185,28,28,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-active)] focus-visible:ring-offset-2"
                            >
                                <Icon name="close" className="h-5 w-5" />
                            </button>
                        )}
                    />
                    <PediatricGrowth patientId={patientId} birthday={birthday} age={age} sex={sex} className="mb-3" />
                    <PatientHistoryPanel title="Consultation History">
                    <div className="flex flex-wrap gap-2 border-b border-[var(--border-soft)] bg-white pb-3">
                        {sectionBtn('All', 'all', totalCount + labResults.length)}
                        {sectionBtn('Consultations', 'consultation', consultations.length)}
                        {sectionBtn('Initial', 'initial', initialConsults.length)}
                        <button
                            onClick={() => setActiveSection('lab')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                activeSection === 'lab'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-[var(--green-surface)] text-[var(--green-ink-strong)] hover:bg-emerald-100 border border-[var(--green-border-soft)]'
                            }`}
                        >
                            <Icon name="flask" className="h-3 w-3" />
                            Lab Results
                            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                activeSection === 'lab' ? 'bg-white/20 text-white' : 'bg-[var(--green-border-soft)] text-[var(--green-ink-strong)]'
                            }`}>{labResults.length}</span>
                        </button>
                    </div>
                    <div className="space-y-2.5 bg-[var(--bg)] pt-3">
                        {loading ? (
                            <SkeletonList rows={3} />
                        ) : (totalCount === 0 && labResults.length === 0) ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-2">
                                <Icon name="inbox" className="h-8 w-8 text-[var(--text-muted)]" />
                                <span className="text-sm text-[var(--text-muted)]">No history records found.</span>
                            </div>
                        ) : (
                            <>
                                {(activeSection === 'all' || activeSection === 'initial') && initialConsults.map((rec) => (
                                    <RecordCard key={`initial-${rec.initialconsultation_id}`} id={`initial-${rec.initialconsultation_id}`} badge="Initial" badgeColor="bg-[var(--brand-soft-surface)] text-[var(--brand-active)]" date={formatDate(rec.consultation_date)} title={rec.chief_complaint || 'Initial Consultation'} subtitle={rec.diagnosis}>
                                        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                            <Field label="Date" value={formatDate(rec.consultation_date)} />
                                            <Field label="Time" value={rec.consultation_time} />
                                            <Field label="Mode of Transaction" value={rec.mode_of_transaction} />
                                            <Field label="Mode of Transfer" value={rec.mode_of_transfer} />
                                            <Field label="Referred By" value={rec.referred_by} />
                                        </div>
                                        {(() => {
                                            const cc = itemizeText(rec.chief_complaint);
                                            const dx = itemizeText(rec.diagnosis);
                                            return (
                                                <>
                                                    {cc.length > 0 && (
                                                        <div><div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Chief Complaint</div>
                                                            <ul className="space-y-0.5">{cc.map((v, i) => <li key={i} className="text-sm text-[var(--text-2)] ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                    )}
                                                    {dx.length > 0 && (
                                                        <div><div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Diagnosis</div>
                                                            <ul className="space-y-0.5">{dx.map((v, i) => <li key={i} className="text-sm text-[var(--text-2)] ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                        {rec.vitals && (
                                            <>
                                                <SectionHeader label="Vital Signs" />
                                                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                                    <Field label="BP" value={rec.vitals.bp} />
                                                    <Field label="Heart Rate" value={rec.vitals.heart_rate != null ? `${rec.vitals.heart_rate} bpm` : null} />
                                                    <Field label="Resp. Rate" value={rec.vitals.respiratory_rate != null ? `${rec.vitals.respiratory_rate} cpm` : null} />
                                                    <Field label="Temperature" value={rec.vitals.temperature != null ? `${rec.vitals.temperature} °C` : null} />
                                                    <Field label="O2 Saturation" value={rec.vitals.o2_saturation != null ? `${rec.vitals.o2_saturation}%` : null} />
                                                </div>
                                                <SectionHeader label="Anthropometrics" />
                                                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                                    <Field label="Weight" value={rec.vitals.weight != null ? `${rec.vitals.weight} kg` : null} />
                                                    <Field label="Height" value={rec.vitals.height != null ? `${rec.vitals.height} cm` : null} />
                                                    <Field label="BMI" value={rec.vitals.bmi != null ? rec.vitals.bmi.toString() : null} />
                                                    <Field label="Nutritional Status" value={rec.vitals.nutritional_status} />
                                                    <Field label="VA Left" value={rec.vitals.visual_acuity_left} />
                                                    <Field label="VA Right" value={rec.vitals.visual_acuity_right} />
                                                </div>
                                                {rec.vitals.general_survey && <Field label="General Survey" value={rec.vitals.general_survey} />}
                                            </>
                                        )}
                                    </RecordCard>
                                ))}
                                {(activeSection === 'all' || activeSection === 'consultation') && consultations.map((rec) => (
                                    <RecordCard key={`consult-${rec.consultation_id}`} id={`consult-${rec.consultation_id}`} badge="Consult" badgeColor="bg-[var(--surface-subtle)] text-[var(--text-2)]" date={`#${rec.consultation_id}`} title={rec.chief_complaints || `Consultation #${rec.consultation_id}`} subtitle={rec.diagnosis}>
                                        <SectionHeader label="Clinical" />
                                        <div className="space-y-2">
                                            {(() => {
                                                const cc = itemizeText(rec.chief_complaints);
                                                const dx = itemizeText(rec.diagnosis);
                                                return (
                                                    <>
                                                        {cc.length > 0 && (
                                                            <div><div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Chief Complaints</div>
                                                                <ul className="space-y-0.5">{cc.map((v, i) => <li key={i} className="text-sm text-[var(--text-2)] ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                        )}
                                                        {dx.length > 0 && (
                                                            <div><div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-0.5">Diagnosis</div>
                                                                <ul className="space-y-0.5">{dx.map((v, i) => <li key={i} className="text-sm text-[var(--text-2)] ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                        )}
                                                        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                                            <Field label="HPI" value={rec.hpi} />
                                                            <Field label="Assessment" value={rec.assessment} />
                                                            <Field label="Plan" value={rec.plan} />
                                                            <Field label="Attending Provider" value={rec.attending_provider} />
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        {(rec.medication_treatment || rec.management_treatment || rec.past_med_surge_history) && (
                                            <>
                                                <SectionHeader label="Treatment &amp; History" />
                                                <div className="space-y-3">
                                                    {(() => {
                                                        const items: { label: string; values: string[] }[] = [];
                                                        const mt = itemizeText(rec.medication_treatment);
                                                        const mgt = itemizeText(rec.management_treatment);
                                                        if (mt.length > 0) items.push({ label: 'Medication / Treatment', values: mt });
                                                        if (mgt.length > 0) items.push({ label: 'Management / Treatment', values: mgt });
                                                        if (rec.past_med_surge_history) items.push({ label: 'Past Medical / Surgical History', values: itemizeText(rec.past_med_surge_history) });
                                                        return items.map(group => (
                                                            <div key={group.label}>
                                                                <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-1">{group.label}</div>
                                                                <ul className="space-y-0.5">
                                                                    {group.values.map((v, i) => <li key={i} className="text-sm text-[var(--text-2)] ml-2 list-disc list-inside">{v}</li>)}
                                                                </ul>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </>
                                        )}
                                        {(rec.family_history || rec.immunization_history || rec.smoking_status || rec.drinking_status) && (
                                            <>
                                                <SectionHeader label="Social &amp; Family History" />
                                                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                                    <Field label="Family History" value={rec.family_history} />
                                                    <Field label="Immunization History" value={rec.immunization_history} />
                                                    <Field label="Smoking" value={rec.smoking_status === 'Yes' ? `Yes - ${rec.smoking_sticks_per_day ?? '?'} sticks/day for ${rec.smoking_years ?? '?'} yrs` : rec.smoking_status} />
                                                    <Field label="Drinking" value={rec.drinking_status === 'Yes' ? `Yes - ${rec.drinking_frequency ?? '?'}, ${rec.drinking_years ?? '?'} yrs` : rec.drinking_status} />
                                                </div>
                                            </>
                                        )}
                                        {(rec.menarche_age != null || rec.gravidity != null || rec.parity != null || rec.lmp || rec.birth_control_method) && (
                                            <>
                                                <SectionHeader label="OBGyne &amp; Pregnancy" />
                                                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                                    <Field label="Menarche (y/o)" value={rec.menarche_age} />
                                                    <Field label="Sexual Onset (y/o)" value={rec.sexual_onset_age} />
                                                    <Field label="Menopause" value={rec.is_menopause === 'Yes' ? `Yes - age ${rec.menopause_age ?? '?'}` : rec.is_menopause} />
                                                    <Field label="LMP" value={rec.lmp ? formatDate(rec.lmp) : null} />
                                                    <Field label="Interval Cycle" value={rec.interval_cycle ? `${rec.interval_cycle} days` : null} />
                                                    <Field label="Period Duration" value={rec.period_duration ? `${rec.period_duration} days` : null} />
                                                    <Field label="Pads / Day" value={rec.pads_per_day} />
                                                    <Field label="Birth Control" value={rec.birth_control_method} />
                                                    <Field label="G / P" value={rec.gravidity != null || rec.parity != null ? `G${rec.gravidity ?? '?'} P${rec.parity ?? '?'}` : null} />
                                                    <Field label="Delivery Type" value={rec.delivery_type} />
                                                    <Field label="Full Term" value={rec.full_term_count} />
                                                    <Field label="Premature" value={rec.premature_count} />
                                                    <Field label="Abortion" value={rec.abortion_count} />
                                                    <Field label="Living Children" value={rec.living_children_count} />
                                                    <Field label="Pre-eclampsia" value={rec.pre_eclampsia} />
                                                </div>
                                            </>
                                        )}
                                    </RecordCard>
                                ))}

                                {/* ── LAB RESULTS SECTION ── */}
                                {(activeSection === 'all' || activeSection === 'lab') && labResults.map((lr) => (
                                    <article
                                        key={`lab-result-${lr.labresult_id}`}
                                        className="overflow-hidden rounded-lg border border-[var(--green-border-soft)] bg-white shadow-[var(--shadow-sm)] cursor-pointer group hover:border-emerald-300 hover:shadow-md transition-all"
                                        onClick={() => setSelectedLabResult({
                                            labresult_id: lr.labresult_id,
                                            findings: lr.findings,
                                            performed_by: lr.performed_by,
                                            date_performed: lr.date_performed,
                                            status: lr.status,
                                            patientName,
                                            labNo: lr.labNo,
                                        })}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLabResult({ labresult_id: lr.labresult_id, findings: lr.findings, performed_by: lr.performed_by, date_performed: lr.date_performed, status: lr.status, patientName, labNo: lr.labNo }); } }}
                                        aria-label={`View lab result #${lr.labresult_id}`}
                                    >
                                        <div className="w-full px-3.5 py-3 hover:bg-[var(--green-surface)] transition-colors">
                                            <div className="flex min-w-0 items-start justify-between gap-3">
                                                <div className="flex min-w-0 items-start gap-2.5">
                                                    <span className="mt-0.5 shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide bg-[var(--green-surface)] text-[var(--green-ink-strong)] ring-1 ring-[var(--green-border-soft)]">
                                                        RES
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-semibold text-[var(--text)]">
                                                            Lab Result #{lr.labresult_id}
                                                            {lr.labNo && <span className="ml-1.5 text-xs font-normal text-[var(--text-2)]">· {lr.labNo}</span>}
                                                        </div>
                                                        <div className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">{lr.testSummary}</div>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-muted)]">
                                                    <span>{formatLabDate(lr.date_performed)}</span>
                                                    <span className="flex items-center gap-1 text-[var(--green-ink-strong)] font-bold group-hover:text-emerald-700">
                                                        <Icon name="flask" className="h-3.5 w-3.5" />
                                                        View
                                                    </span>
                                                </div>
                                            </div>
                                            {lr.performed_by && (
                                                <div className="mt-1 pl-[2.875rem] text-xs text-[var(--text-muted)]">
                                                    By: {lr.performed_by}
                                                    {lr.status && <span className={`ml-2 font-bold ${
                                                        lr.status === 'Completed' ? 'text-emerald-600' : 'text-amber-600'
                                                    }`}>· {lr.status}</span>}
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                ))}

                                {/* Empty lab results state */}
                                {activeSection === 'lab' && labResults.length === 0 && !loading && (
                                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                                        <Icon name="flask" className="h-7 w-7 text-[var(--text-muted)]" />
                                        <span className="text-sm text-[var(--text-muted)]">No lab results on record.</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    </PatientHistoryPanel>
        </ClinicalDrawer>
    );
}

// --- Exported Pure Component --------------------------------------------------
export function ConsultationPage({
    doctorName,
    patientIdProp,
    icidProp,
    isFollowUpVisit = false,
    onSelectPatient,
    onBack,
    onReturnToQueue
}: ConsultationPageProps) {

    const urlParams = new URLSearchParams(window.location.search);
    const patientId = patientIdProp || urlParams.get('id');
    const icidFromUrl = icidProp || urlParams.get('icid');

    const [formData, setFormData] = useState({
        familyHistory: '', pastMedSurgeHistory: '', immunizationHistory: '', smoking: '', smokingSticksPerDay: '', smokingYears: '',
        drinking: '', drinkingFrequency: '', drinkingYears: '', menarche: '', onsetSexualIntercourse: '',
        menopause: '', menopauseAge: '', lmp: '', intervalCycle: '', periodDuration: '', padsPerDay: '',
        birthControlMethod: '', gravidity: '', parity: '', typeOfDelivery: '', fullTerm: '', premature: '',
        abortion: '', livingChildren: '', preEclampsia: '', medicationAndTreatment: '', managementTreatment: '', assessment: '', plan: '',

        // Explicit choice, not a silent default -- '' means the doctor hasn't
        // decided yet and is treated as "no follow-up" if Complete Consultation
        // is clicked without an explicit "Yes."
        needsFollowUp: '' as '' | 'no' | 'yes',
        followUpDate: '', followUpTime: '', followUpModeOfTx: 'Walk-in',
        followUpModeOfTransfer: 'Ambulatory', followUpChiefComplaint: '', followUpDiagnosis: '', followUpHpi: '',
        followUpBp: '', followUpHr: '', followUpRr: '', followUpTemp: '', followUpO2: '', followUpWeight: '',
        followUpHeight: '', followUpMuac: '', followUpNutritionalStatus: '', followUpBmi: '', followUpVaL: '',
        followUpVaR: '', followUpBloodType: '', followUpGenSurvey: '', generalSurvey: '', followUpMedicationTreatment: '', followUpLabResults: '',
        attendingProvider: '', chiefComplaints: '', diagnosis: '', hpi: '',

        bp: '', hr: '', rr: '', temp: '', weight: '', height: '', o2Saturation: '', muac: '',
        nutritionalStatus: '', bmi: '', visualAcuityLeft: '', visualAcuityRight: '',

        labTests: {
            clinicalMicroscopy: false, bloodChemistry: false, pregnancyTest: false,
            hbsagScreening: false, hivScreening: false, parasitology: false, dengueRdt: false, others: false,
        },
        labTestsOther: '', labChiefComplaint: '', labRequestedBy: '', rxLicNo: '', rxPtrNo: '',
    });

    const followUpBmiInfo = useMemo(() => {
        const w = parseFloat(formData.followUpWeight || '0');
        const h = parseFloat(formData.followUpHeight || '0');
        if (w > 0 && h > 0) {
            const bmiValue = parseFloat((w / ((h / 100) * (h / 100))).toFixed(1));
            let status = 'Normal'; let color = 'text-[var(--green-ink)]';
            if (bmiValue < 18.5) { status = 'Underweight'; color = 'text-[var(--amber-accent)]'; }
            else if (bmiValue >= 25 && bmiValue < 29.9) { status = 'Overweight'; color = 'text-[var(--status-caution)]'; }
            else if (bmiValue >= 30) { status = 'Obese'; color = 'text-[var(--coral-accent)]'; }
            return { value: bmiValue.toString(), status, color };
        }
        return null;
    }, [formData.followUpWeight, formData.followUpHeight]);

    const [medications, setMedications] = useState<Medication[]>([{ name: '', dosage: '', frequency: '', duration: '', quantity: '' }]);
    const [consultationSaved, setConsultationSaved] = useState(false);
    const [followUpDone, setFollowUpDone] = useState(false);
    // Presentation-only gate: the follow-up examination fields (and all
    // succeeding follow-up actions) stay hidden and unmounted until the doctor
    // explicitly clicks "Begin Follow-up Visit" — including for a follow-up
    // that is already marked done, so nothing renders before that click.
    const [followUpVisitStarted, setFollowUpVisitStarted] = useState(false);
    const sigCanvas = useRef<SignatureCanvas | null>(null);
    const followUpSigCanvas = useRef<SignatureCanvas | null>(null);


    const [activeTab, setActiveTab] = useState(1);
    const [patient, setPatient] = useState<PatientData | null>(null);
    const [patientLoading, setPatientLoading] = useState(true);
    const [consultationQueue, setConsultationQueue] = useState<any[]>([]);
    const [consultationQueueLoading, setConsultationQueueLoading] = useState(true);
    const [consultationQueueError, setConsultationQueueError] = useState('');
    const [loading, setLoading] = useState(false);
    const [consultationId, setConsultationId] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [consultationCompleted, setConsultationCompleted] = useState(false);
    const [followUpDateError, setFollowUpDateError] = useState(false);
    const [followUpChoiceError, setFollowUpChoiceError] = useState(false);
    // Duplicate-submit latch: `disabled={loading}` only takes effect after a
    // re-render, so two rapid clicks in the same frame can both pass the check.
    const completingRef = useRef(false);
    const followUpDateFieldRef = useRef<HTMLInputElement | null>(null);
    const followUpChoiceFieldRef = useRef<HTMLFieldSetElement | null>(null);

    const { isOnline } = useNetworkSync();
    const primaryBtnBg = isOnline ? 'bg-[var(--brand-active)] hover:bg-[var(--brand-active-hover)] shadow-none' : 'bg-[var(--amber-accent)] hover:bg-[var(--amber-accent-strong)] shadow-amber-500/20';

    const { showToast, ToastComponent } = useToast();

    const loadConsultationQueue = useCallback(async () => {
        setConsultationQueueLoading(true);
        setConsultationQueueError('');
        const { data, error } = await supabase
            .from('initial_consultation')
            .select('initialconsultation_id, consultation_date, consultation_time, visit_disposition, patient_id, patients!inner(id, firstName, middleName, lastName, age, sex, bloodType, address, archive_status), consultation(consultation_id)')
            .eq('visit_disposition', 'referred')
            .or('archive_status.eq.active,archive_status.is.null', { foreignTable: 'patients' })
            .order('consultation_date', { ascending: true });
        if (error) setConsultationQueueError('Unable to load the consultation queue.');
        setConsultationQueue((data || []).filter((entry: any) => !entry.consultation || entry.consultation.length === 0));
        setConsultationQueueLoading(false);
    }, []);

    useEffect(() => {
        if (!patientId) void loadConsultationQueue();
    }, [patientId, loadConsultationQueue]);

    // -- stable ref so subscriptions always see the latest consultationId ------
    const consultationIdRef = useRef<number | null>(null);
    useEffect(() => { consultationIdRef.current = consultationId; }, [consultationId]);

    // -------------------------------------------------------------------------
    // fetchLabResults ? pulled out so the real-time handler can call it too
    // -------------------------------------------------------------------------
    const fetchLabResults = useCallback(async (pid: string, cid: number) => {
        const { data, error } = await supabase
            .from('lab_result')
            .select('findings')
            .eq('patient_id', pid)
            .eq('consultation_id', cid)
            .order('labresult_id', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) { console.error('Failed to fetch lab findings:', error); return; }
        setFormData(prev => ({ ...prev, followUpLabResults: data?.findings || prev.followUpLabResults }));
    }, []);

    // -------------------------------------------------------------------------
    // fetchFollowUp ? pulled out so the real-time handler can call it too
    // -------------------------------------------------------------------------
    const fetchFollowUp = useCallback(async (pid: string, cid: number | null) => {
        const query = supabase.from('follow_up').select(FOLLOW_UP_LOAD_COLUMNS).eq('patient_id', pid);
        if (cid) query.eq('consultation_id', cid);
        else query.order('consultation_id', { ascending: false }).limit(1);
        const { data } = await query.single();
        if (!data) return;
        if (data.follow_up_status === 'done') setFollowUpDone(true);
        setFormData(prev => ({
            ...prev,
            // Only infer "Yes" from a saved follow-up that actually has a date —
            // never silently default the doctor into scheduling one otherwise.
            needsFollowUp: data.visit_date ? 'yes' : prev.needsFollowUp,
            followUpDate: data.visit_date ?? prev.followUpDate,
            followUpTime: data.visit_time ?? '',
            followUpModeOfTx: data.mode_of_transaction ?? prev.followUpModeOfTx,
            followUpModeOfTransfer: data.mode_of_transfer ?? prev.followUpModeOfTransfer,
            followUpChiefComplaint: data.chief_complaint ?? '',
            followUpDiagnosis: data.diagnosis ?? '',
            followUpHpi: data.history_of_present_illness ?? '',
            followUpBp: data.bp ?? '',
            followUpHr: data.heart_rate?.toString() ?? '',
            followUpRr: data.respiratory_rate?.toString() ?? '',
            followUpTemp: data.temperature?.toString() ?? '',
            followUpO2: data.o2_saturation?.toString() ?? '',
            followUpWeight: data.weight?.toString() ?? '',
            followUpHeight: data.height?.toString() ?? '',
            followUpMuac: data.muac?.toString() ?? '',
            followUpNutritionalStatus: data.nutritional_status ?? '',
            followUpBmi: data.bmi?.toString() ?? '',
            followUpVaL: data.visual_acuity_left ?? '',
            followUpVaR: data.visual_acuity_right ?? '',
            followUpBloodType: data.blood_type ?? '',
            followUpGenSurvey: data.general_survey ?? '',
            followUpMedicationTreatment: data.medication_treatment ?? prev.followUpMedicationTreatment,
        }));
    }, []);

    // -------------------------------------------------------------------------
    // Init + load patient
    // -------------------------------------------------------------------------
    useEffect(() => {
        initIndexedDB('MediSensDB', 'offline_patients');
        setFormData(prev => ({
            ...prev,
            attendingProvider: doctorName,
            labRequestedBy: doctorName
        }));
        // A new patientId means a fresh follow-up session — never carry over a
        // previous patient's "begun"/"done" gate state.
        setFollowUpVisitStarted(false);
        setFollowUpDone(false);

        const loadPatient = async () => {
            if (!patientId) { setPatientLoading(false); return; }
            const { data, error } = await supabase
                .from('patients')
                .select('id, firstName, lastName, middleName, age, sex, birthday, bloodType, address, contactNumber')
                .eq('id', patientId)
                .or('archive_status.eq.active,archive_status.is.null')
                .single();
            if (error) console.error('Failed to fetch patient:', error);
            else if (data) setPatient(data as PatientData);
            setPatientLoading(false);
        };
        loadPatient();
    }, [patientId, doctorName]);

    // -------------------------------------------------------------------------
    // Load latest vitals
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!patient?.id) return;
        supabase.from('vital_sign').select(LATEST_VITAL_COLUMNS).eq('patient_id', patient.id).order('vitals_id', { ascending: false }).limit(1).single().then(({ data }) => {
            if (data) {
                setFormData(prev => ({
                    ...prev, bp: data.bp ?? '', hr: data.heart_rate?.toString() ?? '', rr: data.respiratory_rate?.toString() ?? '',
                    temp: data.temperature?.toString() ?? '', weight: data.weight?.toString() ?? '', height: data.height?.toString() ?? '',
                    o2Saturation: data.o2_saturation?.toString() ?? '', muac: data.muac?.toString() ?? '', nutritionalStatus: data.nutritional_status ?? '',
                    bmi: data.bmi?.toString() ?? '', visualAcuityLeft: data.visual_acuity_left ?? '', visualAcuityRight: data.visual_acuity_right ?? '', generalSurvey: data.general_survey ?? '',
                }));
            }
        });
    }, [patient?.id]);

    // -------------------------------------------------------------------------
    // Load lab results
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!patient?.id || !consultationId) return;
        fetchLabResults(patient.id, consultationId);
    }, [patient?.id, consultationId, fetchLabResults]);

    // -------------------------------------------------------------------------
    // Load consultation
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!patient?.id) return;
        const query = supabase.from('consultation').select(CONSULTATION_LOAD_COLUMNS).eq('patient_id', patient.id);
        if (icidFromUrl) {
            query.eq('initial_consultation_id', parseInt(icidFromUrl as string));
        } else {
            query.order('consultation_id', { ascending: false }).limit(1);
        }
        query.single().then(({ data }) => {
            if (!data) return;
            setConsultationId(data.consultation_id);
            setConsultationSaved(true);
            if (data.status === 'Completed') setConsultationCompleted(true);
            if (data.follow_up_status === 'done') setFollowUpDone(true);
            setFormData(prev => ({
                ...prev,
                familyHistory: data.family_history ?? '',
                pastMedSurgeHistory: data.past_med_surge_history ?? '',
                chiefComplaints: data.chief_complaints ?? '',
                diagnosis: data.diagnosis ?? '',
                hpi: data.hpi ?? '',
                attendingProvider: data.attending_provider ?? prev.attendingProvider,
                medicationAndTreatment: data.medication_treatment ?? '',
                managementTreatment: data.management_treatment ?? '',
                assessment: data.assessment ?? '',
                plan: data.plan ?? '',
            }));
        });
    }, [patient?.id, icidFromUrl]);

    // -------------------------------------------------------------------------
    // Load follow-up
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!patient?.id) return;
        const run = async () => {
            let resolvedConsultationId = consultationId;
            if (!resolvedConsultationId && icidFromUrl) {
                const { data } = await supabase.from('consultation').select('consultation_id').eq('initial_consultation_id', parseInt(icidFromUrl as string)).single();
                if (data) resolvedConsultationId = data.consultation_id;
            }
            await fetchFollowUp(patient.id, resolvedConsultationId);
        };
        run();
    }, [patient?.id, consultationId, icidFromUrl, fetchFollowUp]);

    // -------------------------------------------------------------------------
    // Real-time subscriptions
    //   Subscribes once patient is loaded. Cleans up on unmount or patient change.
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!patient?.id) return;

        const pid = patient.id;

        const channel = supabase
            .channel(`consultation-realtime-${pid}`)

            // -- 1. lab_result ? auto-fill Lab Results field ------------------
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'lab_result',
                    filter: `patient_id=eq.${pid}`,
                },
                () => {
                    const cid = consultationIdRef.current;
                    if (cid) fetchLabResults(pid, cid);
                }
            )

            // -- 2. follow_up ? sync follow-up fields & done status -----------
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'follow_up',
                    filter: `patient_id=eq.${pid}`,
                },
                () => {
                    fetchFollowUp(pid, consultationIdRef.current);
                }
            )

            // -- 3. consultation ? sync chief complaints / diagnosis / hpi ----
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'consultation',
                    filter: `patient_id=eq.${pid}`,
                },
                (payload) => {
                    const data = payload.new as any;
                    // Only update fields the user hasn't actively changed
                    setFormData(prev => ({
                        ...prev,
                        chiefComplaints: data.chief_complaints ?? prev.chiefComplaints,
                        diagnosis: data.diagnosis ?? prev.diagnosis,
                        hpi: data.hpi ?? prev.hpi,
                        attendingProvider: data.attending_provider ?? prev.attendingProvider,
                        medicationAndTreatment: data.medication_treatment ?? prev.medicationAndTreatment,
                        managementTreatment: data.management_treatment ?? prev.managementTreatment,
                        assessment: data.assessment ?? prev.assessment,
                        plan: data.plan ?? prev.plan,
                    }));
                    if (data.follow_up_status === 'done') setFollowUpDone(true);
                }
            )

            // -- 4. vital_sign ? keep vitals panel fresh ----------------------
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'vital_sign',
                    filter: `patient_id=eq.${pid}`,
                },
                (payload) => {
                    const data = payload.new as any;
                    if (!data) return;
                    setFormData(prev => ({
                        ...prev,
                        bp: data.bp ?? prev.bp,
                        hr: data.heart_rate?.toString() ?? prev.hr,
                        rr: data.respiratory_rate?.toString() ?? prev.rr,
                        temp: data.temperature?.toString() ?? prev.temp,
                        weight: data.weight?.toString() ?? prev.weight,
                        height: data.height?.toString() ?? prev.height,
                        o2Saturation: data.o2_saturation?.toString() ?? prev.o2Saturation,
                        muac: data.muac?.toString() ?? prev.muac,
                        nutritionalStatus: data.nutritional_status ?? prev.nutritionalStatus,
                        bmi: data.bmi?.toString() ?? prev.bmi,
                        visualAcuityLeft: data.visual_acuity_left ?? prev.visualAcuityLeft,
                        visualAcuityRight: data.visual_acuity_right ?? prev.visualAcuityRight,
                        generalSurvey: data.general_survey ?? prev.generalSurvey,
                    }));
                }
            )

            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [patient?.id, fetchLabResults, fetchFollowUp]);

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    const buildConsultationPayload = () => ({
        patient_id: patient?.id, ...(icidFromUrl ? { initial_consultation_id: parseInt(icidFromUrl as string) } : {}),
        family_history: formData.familyHistory || null, past_med_surge_history: formData.pastMedSurgeHistory || null, immunization_history: formData.immunizationHistory || null,
        smoking_status: formData.smoking || null, smoking_sticks_per_day: formData.smokingSticksPerDay ? parseInt(formData.smokingSticksPerDay) : null,
        smoking_years: formData.smokingYears ? parseInt(formData.smokingYears) : null, drinking_status: formData.drinking || null,
        drinking_frequency: formData.drinkingFrequency || null, drinking_years: formData.drinkingYears ? parseInt(formData.drinkingYears) : null,
        menarche_age: formData.menarche ? parseInt(formData.menarche) : null, sexual_onset_age: formData.onsetSexualIntercourse ? parseInt(formData.onsetSexualIntercourse) : null,
        is_menopause: formData.menopause || null, menopause_age: formData.menopauseAge ? parseInt(formData.menopauseAge) : null, lmp: formData.lmp || null,
        interval_cycle: formData.intervalCycle || null, period_duration: formData.periodDuration || null, pads_per_day: formData.padsPerDay ? parseInt(formData.padsPerDay) : null,
        birth_control_method: formData.birthControlMethod || null, gravidity: formData.gravidity ? parseInt(formData.gravidity) : null, parity: formData.parity ? parseInt(formData.parity) : null,
        delivery_type: formData.typeOfDelivery || null, full_term_count: formData.fullTerm ? parseInt(formData.fullTerm) : null, premature_count: formData.premature ? parseInt(formData.premature) : null,
        abortion_count: formData.abortion ? parseInt(formData.abortion) : null, living_children_count: formData.livingChildren ? parseInt(formData.livingChildren) : null, pre_eclampsia: formData.preEclampsia || null,
        medication_treatment: formData.medicationAndTreatment || null, management_treatment: formData.managementTreatment || null, assessment: formData.assessment || null, plan: formData.plan || null, attending_provider: formData.attendingProvider || null,
        chief_complaints: formData.chiefComplaints || null, diagnosis: formData.diagnosis || null, hpi: formData.hpi || null,
    });

    const buildFollowUpPayload = (resolvedConsultationId: number | null, followUpStatus: string = 'pending') => {
        const sigUrl = followUpSigCanvas.current?.isEmpty() ? null : followUpSigCanvas.current?.getCanvas().toDataURL('image/png');
        return {
            patient_id: patient?.id, consultation_id: resolvedConsultationId!, visit_date: formData.followUpDate || null, visit_time: formData.followUpTime || null,
            mode_of_transaction: formData.followUpModeOfTx || null, mode_of_transfer: formData.followUpModeOfTransfer || null, chief_complaint: formData.followUpChiefComplaint || null,
            diagnosis: formData.followUpDiagnosis || null, history_of_present_illness: formData.followUpHpi || null, bp: formData.followUpBp || null,
            heart_rate: toNumberOrNull(formData.followUpHr), respiratory_rate: toNumberOrNull(formData.followUpRr), temperature: toNumberOrNull(formData.followUpTemp),
            o2_saturation: toNumberOrNull(formData.followUpO2), weight: toNumberOrNull(formData.followUpWeight), height: toNumberOrNull(formData.followUpHeight), muac: toNumberOrNull(formData.followUpMuac),
            nutritional_status: followUpBmiInfo?.status || formData.followUpNutritionalStatus || null, bmi: followUpBmiInfo ? parseFloat(followUpBmiInfo.value) : toNumberOrNull(formData.followUpBmi),
            visual_acuity_left: formData.followUpVaL || null, visual_acuity_right: formData.followUpVaR || null, blood_type: formData.followUpBloodType || patient?.bloodType || null,
            general_survey: formData.followUpGenSurvey || null, medication_treatment: formData.followUpMedicationTreatment || null, lab_results: formData.followUpLabResults || null, signature_url: sigUrl || null,
            follow_up_status: followUpStatus,
        };
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleLabTestChange = (testName: keyof typeof formData.labTests) => setFormData(prev => ({ ...prev, labTests: { ...prev.labTests, [testName]: !prev.labTests[testName] } }));
    const handleMedChange = (index: number, field: keyof Medication, value: string) => { const newMeds = [...medications]; newMeds[index][field] = value; setMedications(newMeds); };
    const handleAddMed = () => setMedications(prev => [...prev, { name: '', dosage: '', frequency: '', duration: '', quantity: '' }]);
    const handleRemoveMed = (index: number) => { if (medications.length === 1) return; setMedications(prev => prev.filter((_, i) => i !== index)); };

    const goBack = () => { if (onBack) onBack(); else window.location.href = '/pages/doctor.html'; };

    // Clears only this component's selected patient so the shared worklist
    // re-renders in place. No navigation, no reload — the Doctor shell,
    // sidebar, and active tab are untouched.
    const handleReturnToQueue = () => {
        setPatient(null);
        window.history.pushState({}, '', window.location.pathname + window.location.hash);
        if (onReturnToQueue) onReturnToQueue();
    };

    const ensureConsultationExists = async (): Promise<number | null> => {
        if (consultationId) return consultationId;
        if (!patient?.id) return null;
        const payload = buildConsultationPayload();
        try {
            const newConsultationId = await upsertConsultation(payload);
            setConsultationId(newConsultationId);
            setConsultationSaved(true);
            return newConsultationId;
        } catch (error) {
            console.error('Failed to auto-create consultation:', error);
            return null;
        }
    };

    // Saves Steps 1-2/4/5 clinical fields only. Does not create/activate a
    // follow-up and does not navigate away -- the consultation is not finished
    // yet at this point (Steps 6-7 still remain). See handleCompleteConsultation
    // for the actual end-of-encounter action.
    const handleSaveConsultation = async () => {
        if (!patient?.id) return;
        setLoading(true);
        try {
            const consultationPayload = buildConsultationPayload();
            if (isOnline) {
                const resolvedConsultationId = await upsertConsultation(consultationPayload, consultationId);
                setConsultationId(resolvedConsultationId);
                setConsultationSaved(true);
                showToast('Diagnosis saved.', false);
            } else {
                await saveToIndexedDB('MediSensDB', 'offline_patients', { id: Date.now(), type: 'consultation', data: consultationPayload });
                setConsultationSaved(true);
                showToast('Offline Mode: Consultation saved locally and will sync when connection returns!', false);
            }
        } catch (err) {
            logError('Failed to save consultation', err);
            showToast(healthcareErrorMessage("save the consultation"), true);
        } finally { setLoading(false); }
    };

    // The single explicit "today's consultation is finished" action (Step 7).
    // Follow-up activation and SMS eligibility both depend on this succeeding
    // first: the follow_up row (whose visit_date the reminder edge function
    // keys on) is only created/updated in the SAME database transaction as
    // the consultation's Completed status via complete_consultation(), so a
    // follow-up write failure rolls the consultation status back too -- see
    // 20260830140000_atomic_complete_consultation.sql.
    const handleCompleteConsultation = async () => {
        if (!patient?.id || completingRef.current) return;

        if (formData.needsFollowUp !== 'no' && formData.needsFollowUp !== 'yes') {
            setFollowUpChoiceError(true);
            setActiveTab(4);
            showToast('Select whether this patient needs a follow-up visit.', true);
            setTimeout(() => {
                followUpChoiceFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 60);
            return;
        }
        setFollowUpChoiceError(false);

        const wantsFollowUp = formData.needsFollowUp === 'yes';
        if (wantsFollowUp && !formData.followUpDate) {
            setFollowUpDateError(true);
            setActiveTab(4);
            showToast('Please enter a valid follow-up return date.', true);
            setTimeout(() => {
                followUpDateFieldRef.current?.focus();
                followUpDateFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 60);
            return;
        }
        setFollowUpDateError(false);

        if (!isOnline) {
            showToast('You are offline. Complete the consultation once your connection is restored.', true);
            return;
        }

        completingRef.current = true;
        setLoading(true);
        try {
            const consultationPayload = buildConsultationPayload();
            const followUpPayload = wantsFollowUp ? buildFollowUpPayload(null, 'pending') : null;
            const resolvedConsultationId = await completeConsultationAtomic(consultationId, consultationPayload, followUpPayload);
            setConsultationId(resolvedConsultationId);

            if (wantsFollowUp) {
                const friendlyDate = new Date(`${formData.followUpDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                showToast(`Consultation completed. Follow-up scheduled for ${friendlyDate}.`, false);
            } else {
                showToast('Consultation completed successfully.', false);
            }
            setConsultationSaved(true);
            setConsultationCompleted(true);
        } catch (err) {
            logError('Failed to complete consultation', err);
            showToast('Unable to complete the consultation. Please try again.', true);
        } finally {
            completingRef.current = false;
            setLoading(false);
        }
    };

    const handleMarkFollowUpDone = async () => {
        if (!patient?.id) return;
        setLoading(true);
        try {
            const resolvedConsultationId = await ensureConsultationExists();
            if (!resolvedConsultationId) throw new Error('Could not resolve consultation record.');
            const sigUrl = followUpSigCanvas.current?.isEmpty() ? null : followUpSigCanvas.current?.getCanvas().toDataURL('image/png');
            const donePayload = {
                patient_id: patient.id, consultation_id: resolvedConsultationId, follow_up_status: 'done',
                visit_date: formData.followUpDate || null, visit_time: formData.followUpTime || null,
                mode_of_transaction: formData.followUpModeOfTx || null, mode_of_transfer: formData.followUpModeOfTransfer || null,
                chief_complaint: formData.followUpChiefComplaint || null, diagnosis: formData.followUpDiagnosis || null,
                history_of_present_illness: formData.followUpHpi || null, bp: formData.followUpBp || null,
                heart_rate: toNumberOrNull(formData.followUpHr), respiratory_rate: toNumberOrNull(formData.followUpRr),
                temperature: toNumberOrNull(formData.followUpTemp), o2_saturation: toNumberOrNull(formData.followUpO2),
                weight: toNumberOrNull(formData.followUpWeight), height: toNumberOrNull(formData.followUpHeight),
                muac: toNumberOrNull(formData.followUpMuac),
                nutritional_status: followUpBmiInfo?.status || formData.followUpNutritionalStatus || null,
                bmi: followUpBmiInfo ? parseFloat(followUpBmiInfo.value) : toNumberOrNull(formData.followUpBmi),
                visual_acuity_left: formData.followUpVaL || null, visual_acuity_right: formData.followUpVaR || null,
                blood_type: formData.followUpBloodType || patient?.bloodType || null,
                general_survey: formData.followUpGenSurvey || null, medication_treatment: formData.followUpMedicationTreatment || null,
                lab_results: formData.followUpLabResults || null, signature_url: sigUrl || null,
            };
            await upsertLatestFollowUpByPatient(patient.id, donePayload);
            setFollowUpDone(true);
            showToast('Follow-up marked as done!', false);
        } catch (err) {
            logError('Failed to mark follow-up as done', err);
            showToast(healthcareErrorMessage("mark the follow-up as done"), true);
        } finally { setLoading(false); }
    };

    const handlePrintPrescription = () => {
        const validMeds = medications.filter(m => !isBlank(m.name));
        if (validMeds.length === 0) { showToast('Please add at least one medication before printing.', true); return; }
        const html = `
            <!DOCTYPE html><html><head>
            <title>Prescription - ${patientFullName}</title>
            <style>
                @page { size: A5 portrait; margin: 10mm; }
                body { font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.2; padding: 10px 15px; margin: 0; }
                .header { text-align: center; margin-bottom: 12px; }
                .header p { margin: 2px 0; font-size: 13px; }
                .header h3 { margin: 5px 0 0 0; font-weight: bold; font-size: 16px; letter-spacing: 0.5px; }
                .divider { border-bottom: 1.5px solid #000; margin: 12px 0; }
                .patient-info { font-size: 14px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 5px; }
                .row { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; }
                .field { display: flex; align-items: flex-end; }
                .field span { margin-right: 5px; white-space: nowrap; }
                .value { border-bottom: 1px solid #000; flex-grow: 1; padding: 0 5px; text-align: center; font-weight: bold; }
                .rx-symbol { font-size: 48px; font-weight: bold; margin: 15px 0 5px 10px; line-height: 1; font-style: italic; }
                .med-list { min-height: 280px; padding: 0 20px 0 45px; }
                .med-item { margin-bottom: 15px; font-size: 14px; }
                .med-name { font-weight: bold; font-size: 15px; margin-bottom: 3px; }
                .med-sig { margin-left: 20px; }
                .footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; page-break-inside: avoid; }
                .next-visit { display: flex; align-items: flex-end; }
                .doctor-block { text-align: center; width: 220px; }
                .sig-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 40px; }
                .doc-name { font-weight: bold; font-size: 15px; text-transform: uppercase; }
                .doc-creds { font-size: 12px; display: flex; flex-direction: column; align-items: center; margin-top: 3px; }
            </style></head><body>
                <div class="header">
                    <p>Republic of the Philippines</p><p>Province of Batangas</p><p>Municipality of Malvar</p>
                    <h3>MUNICIPAL HEALTH OFFICE</h3>
                </div>
                <div class="divider"></div>
                <div class="patient-info">
                    <div class="row">
                        <div class="field" style="width:68%;"><span>Name:</span><div class="value" style="text-align:left;">${patientFullName}</div></div>
                        <div class="field" style="width:30%;"><span>Date:</span><div class="value">${new Date().toLocaleDateString('en-US')}</div></div>
                    </div>
                    <div class="row">
                        <div class="field" style="width:18%;"><span>Age:</span><div class="value">${patient?.age || '&nbsp;'}</div></div>
                        <div class="field" style="width:18%;"><span>Sex:</span><div class="value">${patient?.sex || '&nbsp;'}</div></div>
                        <div class="field" style="width:60%;"><span>Address:</span><div class="value" style="text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${patient?.address ? patient.address.split(',')[0] : '&nbsp;'}</div></div>
                    </div>
                </div>
                <div class="divider"></div>
                <div class="rx-symbol">&#8478;</div>
                <div class="med-list">
                    ${validMeds.map(m => `<div class="med-item"><div class="med-name">${m.quantity ? `${m.quantity} ` : ''}${m.name}</div><div class="med-sig">Sig: ${m.dosage} ${m.frequency || ''} ${m.duration ? `for ${m.duration}` : ''}</div></div>`).join('')}
                </div>
                <div class="footer">
                    <div class="next-visit"><span>Next Visit:</span><div class="value" style="width:100px;">${formData.followUpDate ? new Date(formData.followUpDate).toLocaleDateString('en-US') : '&nbsp;'}</div></div>
                    <div class="doctor-block"><div class="sig-line"></div><div class="doc-name">${doctorName}, MD</div>
                    <div class="doc-creds"><span>Lic No: ${formData.rxLicNo || '________________'}</span><span>PTR No: ${formData.rxPtrNo || '________________'}</span></div></div>
                </div>
            </body></html>`;
        if (!printHtmlDocument(html)) {
            showToast('Unable to open the print window. Please try again.', true);
        }
    };

    const handlePrintMedCert = () => {
        if (isBlank(formData.diagnosis)) { showToast('Please enter a Diagnosis before printing.', true); return; }
        const html = `
            <!DOCTYPE html><html><head>
            <title>Medical Certificate - ${patientFullName}</title>
            <style>
                @page { size: A4 portrait; margin: 15mm 20mm; }
                * { box-sizing: border-box; } html, body { height: 100%; margin: 0; padding: 0; }
                body { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 15px; line-height: 1.5; }
                .page-container { display: flex; flex-direction: column; min-height: 260mm; position: relative; }
                .header { text-align: center; margin-bottom: 20px; }
                .header p { margin: 1px 0; font-size: 14px; }
                .header h3 { margin: 4px 0 0 0; font-weight: bold; font-size: 17px; text-transform: uppercase; }
                .title { text-align: center; font-weight: bold; font-size: 22px; margin: 25px 0; text-decoration: underline; letter-spacing: 2px; }
                .date-block { text-align: right; margin-bottom: 30px; }
                .salutation { font-weight: bold; margin-bottom: 15px; text-transform: uppercase; }
                .body-text { text-align: justify; margin-bottom: 25px; text-indent: 40px; line-height: 1.8; }
                .field-value { border-bottom: 1px solid #000; font-weight: bold; padding: 0 4px; display: inline-block; text-align: center; }
                .section { margin-bottom: 20px; }
                .section-label { font-weight: bold; font-size: 16px; display: block; margin-bottom: 4px; }
                .section-content { min-height: 40px; border-bottom: 1px solid #000; font-weight: bold; padding-left: 10px; font-style: italic; line-height: 1.3; }
                .footer { margin-top: auto; display: flex; justify-content: flex-end; padding-bottom: 10mm; }
                .doctor-block { text-align: center; width: 300px; }
                .sig-line { border-bottom: 1.5px solid #000; margin-bottom: 5px; height: 40px; }
                .doc-name { font-weight: bold; font-size: 16px; text-transform: uppercase; }
                .doc-creds { font-size: 13px; margin-top: 2px; text-align: center; line-height: 1.4; }
            </style></head><body>
                <div class="page-container">
                    <div class="header">
                        <p>Republic of the Philippines</p><p>Province of Batangas</p><p>Municipality of Malvar</p>
                        <h3>MUNICIPAL HEALTH OFFICE</h3>
                    </div>
                    <div class="title">MEDICAL CERTIFICATE</div>
                    <div class="date-block">Malvar, Batangas<br><strong>${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
                    <div class="salutation">TO WHOM IT MAY CONCERN:</div>
                    <div class="body-text">
                        This is to certify that <span class="field-value" style="min-width:180px;">${patientFullName}</span>,
                        <span class="field-value" style="min-width:40px;">${patient?.age || '___'}</span> years old,
                        <span class="field-value" style="min-width:60px;">${patient?.sex || '___'}</span>, a resident of
                        <span class="field-value" style="min-width:220px;">${patient?.address || '___________________________'}</span>,
                        was examined and treated at the Municipal Health Office on
                        <span class="field-value">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        with the following diagnosis:
                    </div>
                    <div class="section"><span class="section-label">Diagnosis:</span><div class="section-content">${formData.diagnosis || ''}</div></div>
                    <div class="section"><span class="section-label">Remarks / Recommendation:</span><div class="section-content">${formData.plan || formData.medicationAndTreatment || ''}</div></div>
                    <div class="footer">
                        <div class="doctor-block">
                            <div class="sig-line"></div>
                            <div class="doc-name">${doctorName}, MD</div>
                            <div class="doc-creds">License No: ${formData.rxLicNo || '________________'}<br>PTR No: ${formData.rxPtrNo || '________________'}</div>
                        </div>
                    </div>
                </div>
            </body></html>`;
        if (!printHtmlDocument(html)) {
            showToast('Unable to open the print window. Please try again.', true);
        }
    };

    const handleSaveLabRequest = async () => {
        if (!patient?.id) return;
        setLoading(true);
        try {
            if (isOnline) {
                const resolvedConsultationId = await ensureConsultationExists();
                if (!resolvedConsultationId) throw new Error('Could not create consultation record.');
                const labPayload = {
                    patient_id: patient.id, consultation_id: resolvedConsultationId, request_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), chief_complaint: formData.labChiefComplaint || null,
                    is_clinical_microscopy: formData.labTests.clinicalMicroscopy, is_blood_chemistry: formData.labTests.bloodChemistry,
                    is_pregnancy_test: formData.labTests.pregnancyTest, is_hbsag_screening: formData.labTests.hbsagScreening,
                    is_hiv_screening: formData.labTests.hivScreening, is_parasitology: formData.labTests.parasitology,
                    is_dengue_rdt: formData.labTests.dengueRdt,
                    others: formData.labTestsOther || null, requested_by: formData.labRequestedBy || null, status: 'Pending',
                };
                await createLabRequest(labPayload);
                showToast('Lab request sent to laboratory successfully!', false);
            } else { showToast('Offline mode requires connecting to the server to generate a consultation ID first.', true); }
        } catch (error) {
            logError('Failed to save lab request', error);
            showToast(healthcareErrorMessage("save the lab request"), true);
        } finally { setLoading(false); }
    };

    const handleSavePrescription = async () => {
        if (!patient?.id) return;
        if (sigCanvas.current?.isEmpty()) { showToast('Doctor signature is required before saving.', true); return; }
        const validMedications = medications.filter(m => !isBlank(m.name));
        if (validMedications.length === 0) { showToast('Please add at least one medication before saving.', true); return; }
        setLoading(true);
        try {
            if (isOnline) {
                const resolvedConsultationId = await ensureConsultationExists();
                if (!resolvedConsultationId) throw new Error('Could not create consultation record.');
                const sigUrl = sigCanvas.current?.getCanvas().toDataURL('image/png') || '';
                const rxPayload = {
                    patient_id: patient.id,
                    consultation_id: resolvedConsultationId,
                    prescription_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
                    rx_content: JSON.stringify(validMedications),
                    license_no: formData.rxLicNo ? Number(formData.rxLicNo) : null,
                    ptr_no: formData.rxPtrNo || null,
                    signature_url: sigUrl,
                    status: 'Pending',
                    doctor_name: doctorName // Ensure doctor's name is saved
                };
                await createPrescription(rxPayload);
                showToast('E-prescription sent to pharmacy.', false);
                sigCanvas.current?.clear();
            } else { showToast('Offline mode requires connecting to the server to generate a consultation ID first.', true); }
        } catch (error) {
            logError('Failed to save prescription', error);
            showToast(healthcareErrorMessage("save the prescription"), true);
        } finally { setLoading(false); }
    };

    const patientFullName = patient ? `${patient.firstName} ${patient.middleName ? patient.middleName + ' ' : ''}${patient.lastName}` : '—';
    const patientInitials = patient ? `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() : '?';
    const isMale = patient?.sex?.toLowerCase() === 'male';
    const inputCls = clinicalInputClass;
    const labelCls = clinicalLabelClass;
    const textareaCls = clinicalTextareaClass;
    const cardCls = "space-y-6  pb-20 md:pb-0";

    const RadioGroup = ({ name, options, value }: { name: string; options: string[]; value: string }) => (
        <div className="flex gap-3 flex-wrap">
            {options.map(opt => (
                <label key={opt} className={`clinical-choice-label cursor-pointer px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${value === opt ? 'bg-[var(--brand-active)] text-white border-[var(--brand-active)]' : 'bg-white text-[var(--text-2)] border-[var(--border)] hover:border-[var(--border)]'}`}>
                    <input type="radio" name={name} value={opt} checked={value === opt} onChange={handleRadioChange} className="sr-only" />{opt}
                </label>
            ))}
        </div>
    );

    const renderCheckbox = (key: keyof typeof formData.labTests, label: string) => (
        <label key={key} className="clinical-choice-label flex items-center gap-3 cursor-pointer group min-h-[40px]">
            <div className="relative flex items-center justify-center w-5 h-5 border-2 border-[var(--border)] rounded bg-white shrink-0 transition-colors group-hover:border-[var(--border-strong)]">
                <input type="checkbox" checked={formData.labTests[key]} onChange={() => handleLabTestChange(key)} className="absolute opacity-0 w-0 h-0" />
                {formData.labTests[key] && <svg className="w-3.5 h-3.5 text-[var(--text-2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </div>
            <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
        </label>
    );

    if (patientLoading) {
        return (
            <div className="rounded-xl border border-[var(--border)] bg-white p-5" role="status" aria-live="polite" aria-busy="true">
                <div className="mb-5 flex items-center gap-4">
                    <Skeleton className="h-14 w-14 rounded-full" />
                    <div className="min-w-0 flex-1">
                        <Skeleton className="h-5 w-52 max-w-full" />
                        <Skeleton className="mt-3 h-3 w-40" />
                    </div>
                </div>
                <SkeletonList rows={4} />
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="relative w-full px-4 pb-8 md:px-5 xl:px-6">
                <ClinicalPatientWorklist
                    patients={consultationQueue.map(entry => ({ ...entry.patients, id: entry.patient_id, rowKey: entry.initialconsultation_id, recordDate: entry.consultation_date, recordLabel: entry.consultation_date ? `Referred ${new Date(entry.consultation_date).toLocaleDateString()}` : undefined }))}
                    loading={consultationQueueLoading}
                    error={consultationQueueError}
                    onRetry={() => void loadConsultationQueue()}
                    onSelect={(selected) => {
                        // Matched on the encounter, not the patient: a patient with more
                        // than one open referral would otherwise always resolve to their
                        // earliest one, opening the wrong consultation.
                        const entry = consultationQueue.find(item => String(item.initialconsultation_id) === String(selected.rowKey))
                            ?? consultationQueue.find(item => String(item.patient_id) === String(selected.id));
                        if (entry && onSelectPatient) onSelectPatient(String(entry.patient_id), String(entry.initialconsultation_id));
                    }}
                    title="Consultation queue"
                    instruction="Patients referred for Doctor consultation and not yet completed."
                    emptyMessage="No patients are currently eligible for Doctor consultation."
                    actionLabel="Start consultation"
                    showBarangayFilter
                    compact
                />
            </div>
        );
    }

    const renderTab1 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <h3 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border-soft)] pb-3">I. Chief Complaint and History of Present Illness</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div><label className={labelCls} htmlFor="consult-chiefComplaints">Chief Complaint</label><textarea id="consult-chiefComplaints" name="chiefComplaints" value={formData.chiefComplaints} onChange={handleChange} rows={6} className={textareaCls} placeholder="Describe the patient’s main concern..." /></div>
                <div><label className={labelCls} htmlFor="consult-hpi">History of Present Illness</label><textarea id="consult-hpi" name="hpi" value={formData.hpi} onChange={handleChange} rows={6} className={textareaCls} placeholder="Document onset, course, and relevant symptoms..." /></div>
            </div>
            <div className="flex justify-end pt-4"><button onClick={() => setActiveTab(2)} className={`w-full md:w-auto text-white font-semibold py-2.5 px-6 rounded-lg shadow-sm transition-colors duration-200 ${primaryBtnBg}`}>Next: Relevant Patient Histories</button></div>
        </div>
    );

    const renderTab2 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <h3 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border-soft)] pb-3">II. Relevant Patient Histories</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                    <div><label className={labelCls} htmlFor="consult-pastMedSurgeHistory">Past Medical / Surgical History</label><textarea id="consult-pastMedSurgeHistory" name="pastMedSurgeHistory" value={formData.pastMedSurgeHistory} onChange={handleChange} rows={4} className={textareaCls} /></div>
                    <div><label className={labelCls} htmlFor="consult-familyHistory">Family History</label><textarea id="consult-familyHistory" name="familyHistory" value={formData.familyHistory} onChange={handleChange} rows={4} className={textareaCls} /></div>
                    <div><label className={labelCls} htmlFor="consult-immunizationHistory">Immunization History</label><textarea id="consult-immunizationHistory" name="immunizationHistory" value={formData.immunizationHistory} onChange={handleChange} rows={4} className={textareaCls} /></div>
                </div>
                <div className="bg-[var(--surface-subtle)]/70 rounded-xl border border-[var(--border)] p-5 space-y-6 shadow-sm">
                    <div><label className={labelCls}>Smoking History</label><RadioGroup name="smoking" options={['Yes', 'No']} value={formData.smoking} />{formData.smoking === 'Yes' && <div className="grid grid-cols-2 gap-3 mt-3"><div><label className={labelCls} htmlFor="consult-smokingSticksPerDay">Sticks / Day</label><input id="consult-smokingSticksPerDay" type="number" name="smokingSticksPerDay" value={formData.smokingSticksPerDay} onChange={handleChange} className={inputCls} /></div><div><label className={labelCls} htmlFor="consult-smokingYears">Years</label><input id="consult-smokingYears" type="number" name="smokingYears" value={formData.smokingYears} onChange={handleChange} className={inputCls} /></div></div>}</div>
                    <div><label className={labelCls}>Drinking History</label><RadioGroup name="drinking" options={['Yes', 'No']} value={formData.drinking} />{formData.drinking === 'Yes' && <div className="grid grid-cols-2 gap-3 mt-3"><div><label className={labelCls} htmlFor="consult-drinkingFrequency">Frequency</label><input id="consult-drinkingFrequency" type="text" name="drinkingFrequency" value={formData.drinkingFrequency} onChange={handleChange} className={inputCls} /></div><div><label className={labelCls} htmlFor="consult-drinkingYears">Years</label><input id="consult-drinkingYears" type="number" name="drinkingYears" value={formData.drinkingYears} onChange={handleChange} className={inputCls} /></div></div>}</div>
                </div>
            </div>
            {!isMale && <div className="mt-8 border-t border-[var(--border-soft)] pt-6">
                <h4 className="mb-5 text-base font-bold text-[var(--text)]">OB-Gyne and Pregnancy History</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                    <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide">OBGyne</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls} htmlFor="consult-menarche">Menarche (y/o)</label><input id="consult-menarche" type="number" name="menarche" value={formData.menarche} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-onsetSexualIntercourse">Onset Sexual Intercourse</label><input id="consult-onsetSexualIntercourse" type="number" name="onsetSexualIntercourse" value={formData.onsetSexualIntercourse} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div>
                        <label className={labelCls}>Menopause</label>
                        <RadioGroup name="menopause" options={['Yes', 'No']} value={formData.menopause} />
                        {formData.menopause === 'Yes' && <div className="mt-3"><label className={labelCls} htmlFor="consult-menopauseAge">Age at Menopause</label><input id="consult-menopauseAge" type="number" name="menopauseAge" value={formData.menopauseAge} onChange={handleChange} className={inputCls} /></div>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls} htmlFor="consult-lmp">LMP</label><input id="consult-lmp" type="date" name="lmp" value={formData.lmp} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-intervalCycle">Interval Cycle (Days)</label><input id="consult-intervalCycle" type="text" name="intervalCycle" value={formData.intervalCycle} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-periodDuration">Period Duration (Days)</label><input id="consult-periodDuration" type="text" name="periodDuration" value={formData.periodDuration} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-padsPerDay"># of Pads / Day</label><input id="consult-padsPerDay" type="number" name="padsPerDay" value={formData.padsPerDay} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div><label className={labelCls} htmlFor="consult-birthControlMethod">Birth Control Method</label><input id="consult-birthControlMethod" type="text" name="birthControlMethod" value={formData.birthControlMethod} onChange={handleChange} className={inputCls} /></div>
                </div>
                <div className="space-y-4">
                    <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide">Pregnancy History</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls} htmlFor="consult-gravidity">Gravidity</label><input id="consult-gravidity" type="number" name="gravidity" value={formData.gravidity} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-parity">Parity</label><input id="consult-parity" type="number" name="parity" value={formData.parity} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div>
                        <label className={labelCls}>Type of Delivery</label>
                        <select name="typeOfDelivery" value={formData.typeOfDelivery} onChange={handleChange} className={inputCls}><option value="">Select type...</option><option value="Normal">Normal</option><option value="CS">CS</option><option value="Both">Both Normal and CS</option></select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls} htmlFor="consult-fullTerm"># Full Term</label><input id="consult-fullTerm" type="number" name="fullTerm" value={formData.fullTerm} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-premature"># Premature</label><input id="consult-premature" type="number" name="premature" value={formData.premature} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-abortion"># Abortion</label><input id="consult-abortion" type="number" name="abortion" value={formData.abortion} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="consult-livingChildren"># Living Children</label><input id="consult-livingChildren" type="number" name="livingChildren" value={formData.livingChildren} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div><label className={labelCls}>Pre-eclampsia</label><RadioGroup name="preEclampsia" options={['Yes', 'No']} value={formData.preEclampsia} /></div>
                </div>
                </div>
            </div>}
            <div className="flex justify-between pt-4"><button onClick={() => setActiveTab(1)} className="bg-[var(--surface-subtle)] py-2.5 px-6 rounded-lg font-semibold">Back</button><button onClick={() => setActiveTab(3)} className={`text-white py-2.5 px-6 rounded-lg shadow-sm font-semibold ${primaryBtnBg}`}>Next: Pertinent Physical Examination Findings</button></div>
        </div>
    );

    const renderTab3 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <h3 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border-soft)] pb-3">III. Pertinent Physical Examination Findings</h3>
            <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Latest vital signs</p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                    {[["BP", formData.bp], ["Heart rate", formData.hr && `${formData.hr} bpm`], ["Respiratory rate", formData.rr && `${formData.rr} cpm`], ["Temperature", formData.temp && `${formData.temp} °C`], ["O₂ saturation", formData.o2Saturation && `${formData.o2Saturation}%`]].map(([label, value]) => <div key={label} className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-3"><p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p><p className="mt-1 text-sm font-semibold text-[var(--text)]">{value || 'Not recorded'}</p></div>)}
                </div>
            </div>
            <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Anthropometric measurements</p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[["Weight", formData.weight && `${formData.weight} kg`], ["Height", formData.height && `${formData.height} cm`], ["BMI", formData.bmi], ["Nutritional status", formData.nutritionalStatus]].map(([label, value]) => <div key={label} className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-3"><p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p><p className="mt-1 text-sm font-semibold text-[var(--text)]">{value || 'Not recorded'}</p></div>)}
                </div>
            </div>
            <div><label className={labelCls} htmlFor="consult-generalSurvey">General Survey</label><textarea id="consult-generalSurvey" value={formData.generalSurvey} readOnly rows={3} className={`${textareaCls} cursor-default bg-[var(--surface-subtle)]`} placeholder="Not recorded" /></div>
            <div><label className={labelCls} htmlFor="consult-assessment">Relevant Physical Examination Findings</label><textarea id="consult-assessment" name="assessment" value={formData.assessment} onChange={handleChange} rows={6} className={textareaCls} placeholder="Document pertinent examination findings..." /></div>
            <div className="flex justify-between pt-4"><button onClick={() => setActiveTab(2)} className="bg-[var(--surface-subtle)] py-2.5 px-6 rounded-lg font-semibold">Back</button><button onClick={() => setActiveTab(5)} className={`text-white py-2.5 px-6 rounded-lg shadow-sm font-semibold ${primaryBtnBg}`}>Next: Diagnosis</button></div>
        </div>
    );

    const renderTab4 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
                <h3 className="text-lg font-bold text-[var(--text)]">V. Management and Health Education</h3>
            </div>
            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)]/70 p-5">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Initial consultation management</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Document the plan, instructions, and health education for this consultation.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div><label className={labelCls} htmlFor="consult-managementTreatment">Treatment / Management Plan</label><textarea id="consult-managementTreatment" name="managementTreatment" value={formData.managementTreatment} onChange={handleChange} rows={5} className={textareaCls} placeholder="Treatment plan and management..." /></div>
                    <div><label className={labelCls} htmlFor="consult-medicationAndTreatment">Medication or Treatment Instructions</label><textarea id="consult-medicationAndTreatment" name="medicationAndTreatment" value={formData.medicationAndTreatment} onChange={handleChange} rows={5} className={textareaCls} placeholder="Medication and treatment instructions..." /></div>
                    <div className="md:col-span-2"><label className={labelCls} htmlFor="consult-plan">Patient Instructions, Health Education, and Recommendations</label><textarea id="consult-plan" name="plan" value={formData.plan} onChange={handleChange} rows={5} className={textareaCls} placeholder="Patient instructions, health education, recommendations, and follow-up advice..." /></div>
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">Follow-up Schedule</p>
                <fieldset
                    ref={followUpChoiceFieldRef}
                    className="space-y-3"
                    aria-invalid={followUpChoiceError}
                    aria-describedby={followUpChoiceError ? 'consult-followUpChoice-error' : undefined}
                >
                    <legend className={labelCls}>Does this patient need a follow-up visit?</legend>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <label className={`flex-1 flex items-center gap-2 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${formData.needsFollowUp === 'no' ? 'border-[var(--brand-active)] bg-[var(--surface-subtle)] font-semibold' : followUpChoiceError ? 'border-[var(--coral-accent)]' : 'border-[var(--border-soft)]'}`}>
                            <input type="radio" name="needsFollowUp" value="no" checked={formData.needsFollowUp === 'no'} onChange={e => { handleRadioChange(e); setFollowUpChoiceError(false); }} className="h-4 w-4" />
                            No follow-up needed
                        </label>
                        <label className={`flex-1 flex items-center gap-2 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${formData.needsFollowUp === 'yes' ? 'border-[var(--brand-active)] bg-[var(--surface-subtle)] font-semibold' : followUpChoiceError ? 'border-[var(--coral-accent)]' : 'border-[var(--border-soft)]'}`}>
                            <input type="radio" name="needsFollowUp" value="yes" checked={formData.needsFollowUp === 'yes'} onChange={e => { handleRadioChange(e); setFollowUpChoiceError(false); }} className="h-4 w-4" />
                            Yes, schedule follow-up
                        </label>
                    </div>
                    {followUpChoiceError && (
                        <p id="consult-followUpChoice-error" role="alert" className="text-xs font-semibold text-[var(--coral-accent)]">
                            Select whether this patient needs a follow-up visit.
                        </p>
                    )}
                </fieldset>

                {formData.needsFollowUp === 'yes' && (
                    <div className="mt-4 space-y-3">
                        <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)] bg-[var(--surface-subtle)] border border-[var(--border-soft)] rounded-lg px-3 py-2.5">
                            <Icon name="file-text" className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>The follow-up will be scheduled when this consultation is completed.</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <label className={labelCls} htmlFor="consult-followUpDate">Visit / Return Date <span className="text-[var(--marker-required)]">*</span></label>
                                <input
                                    ref={followUpDateFieldRef}
                                    id="consult-followUpDate"
                                    type="date"
                                    name="followUpDate"
                                    value={formData.followUpDate}
                                    onChange={e => { handleChange(e); setFollowUpDateError(false); }}
                                    aria-invalid={followUpDateError}
                                    aria-describedby={followUpDateError ? 'consult-followUpDate-error' : undefined}
                                    className={`${inputCls} ${followUpDateError ? 'border-[var(--coral-accent)] focus:border-[var(--coral-accent)]' : ''}`}
                                />
                                {followUpDateError && (
                                    <p id="consult-followUpDate-error" role="alert" className="mt-1.5 text-xs font-semibold text-[var(--coral-accent)]">
                                        A valid follow-up return date is required to complete this consultation.
                                    </p>
                                )}
                            </div>
                            <div><label className={labelCls} htmlFor="consult-followUpTime">Visit Time</label><input id="consult-followUpTime" type="time" name="followUpTime" value={formData.followUpTime} onChange={handleChange} className={inputCls} /></div>
                            <div>
                                <label className={labelCls}>Mode of Transaction</label>
                                <select name="followUpModeOfTx" value={formData.followUpModeOfTx} onChange={handleChange} className={inputCls}>
                                    <option value="Walk-in">Walk-in</option><option value="Teleconsult">Teleconsult</option><option value="Referral">Referral</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Mode of Transfer</label>
                                <select name="followUpModeOfTransfer" value={formData.followUpModeOfTransfer} onChange={handleChange} className={inputCls}>
                                    <option value="Ambulatory">Ambulatory</option><option value="Wheelchair">Wheelchair</option><option value="Stretcher">Stretcher</option>
                                </select>
                            </div>
                            <div>
                                <span className={labelCls}>Blood Type</span>
                                <p className={`${inputCls} bg-[var(--surface-subtle)] text-[var(--text-2)] font-semibold cursor-default`} aria-readonly="true">
                                    {formData.followUpBloodType || patient?.bloodType || 'Not recorded'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isFollowUpVisit && !followUpVisitStarted && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-[var(--border)] bg-[var(--surface-subtle)] rounded-xl px-4 py-4">
                    <p className="text-sm text-[var(--text-2)]">
                        Examination fields open once this follow-up visit begins for <span className="font-semibold">{patientFullName}</span>.
                    </p>
                    <button type="button" onClick={() => setFollowUpVisitStarted(true)} className={`shrink-0 text-white py-2.5 px-6 rounded-lg font-semibold shadow-sm transition-colors ${primaryBtnBg}`}>
                        Begin Follow-up Visit
                    </button>
                </div>
            )}

            {isFollowUpVisit && followUpVisitStarted && (<>
            <div>
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">General Survey</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2"><label className={labelCls} htmlFor="consult-followUpGenSurvey">General Survey</label><input id="consult-followUpGenSurvey" type="text" name="followUpGenSurvey" value={formData.followUpGenSurvey} onChange={handleChange} className={inputCls} placeholder="e.g. Awake, conscious, coherent..." /></div>
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">Clinical</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={labelCls} htmlFor="consult-followUpChiefComplaint">Chief Complaint</label><textarea id="consult-followUpChiefComplaint" name="followUpChiefComplaint" value={formData.followUpChiefComplaint} onChange={handleChange} rows={3} className={textareaCls} placeholder="Primary reason for visit..." /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpDiagnosis">Diagnosis</label><textarea id="consult-followUpDiagnosis" name="followUpDiagnosis" value={formData.followUpDiagnosis} onChange={handleChange} rows={3} className={textareaCls} /></div>
                    <div className="md:col-span-2"><label className={labelCls} htmlFor="consult-followUpHpi">History of Present Illness <span className="text-[var(--text-muted)] font-normal normal-case ml-1">(Optional)</span></label><textarea id="consult-followUpHpi" name="followUpHpi" value={formData.followUpHpi} onChange={handleChange} rows={3} className={textareaCls} /></div>
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">Vitals</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={labelCls} htmlFor="consult-followUpBp">BP (mmHg)</label><input id="consult-followUpBp" type="text" name="followUpBp" value={formData.followUpBp} onChange={handleChange} className={inputCls} placeholder="120/80" /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpHr">Heart Rate (bpm)</label><input id="consult-followUpHr" type="text" name="followUpHr" value={formData.followUpHr} onChange={handleChange} className={inputCls} placeholder="72" /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpRr">Respiratory Rate (cpm)</label><input id="consult-followUpRr" type="text" name="followUpRr" value={formData.followUpRr} onChange={handleChange} className={inputCls} placeholder="16" /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpTemp">Temperature (?C)</label><input id="consult-followUpTemp" type="text" name="followUpTemp" value={formData.followUpTemp} onChange={handleChange} className={inputCls} placeholder="36.5" /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpO2">O2 Saturation (%)</label><input id="consult-followUpO2" type="text" name="followUpO2" value={formData.followUpO2} onChange={handleChange} className={inputCls} placeholder="98" /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpMuac">MUAC (cm)</label><input id="consult-followUpMuac" type="text" name="followUpMuac" value={formData.followUpMuac} onChange={handleChange} className={inputCls} placeholder="28.5" /></div>
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">Anthropometrics</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={labelCls} htmlFor="consult-followUpWeight">Weight (kg)</label><input id="consult-followUpWeight" type="text" name="followUpWeight" value={formData.followUpWeight} onChange={handleChange} className={inputCls} placeholder="65" /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpHeight">Height (cm)</label><input id="consult-followUpHeight" type="text" name="followUpHeight" value={formData.followUpHeight} onChange={handleChange} className={inputCls} placeholder="165" /></div>
                    <div>
                        <label className={labelCls} htmlFor="consult-followUpBmiAuto">BMI <span className="text-[var(--text-muted)] font-normal normal-case">(auto)</span></label>
                        <input id="consult-followUpBmiAuto" type="text" readOnly value={followUpBmiInfo ? followUpBmiInfo.value : ''} className={`${inputCls} bg-[var(--surface-subtle)] text-[var(--text-secondary)] font-semibold cursor-default`} placeholder="?" />
                        {followUpBmiInfo && <p className={`text-xs mt-1.5 font-semibold ${followUpBmiInfo.color}`}>{followUpBmiInfo.status}</p>}
                    </div>
                    <div><label className={labelCls} htmlFor="consult-followUpVaL">Visual Acuity ? Left</label><input id="consult-followUpVaL" type="text" name="followUpVaL" value={formData.followUpVaL} onChange={handleChange} className={inputCls} placeholder="20/20" /></div>
                    <div><label className={labelCls} htmlFor="consult-followUpVaR">Visual Acuity ? Right</label><input id="consult-followUpVaR" type="text" name="followUpVaR" value={formData.followUpVaR} onChange={handleChange} className={inputCls} placeholder="20/20" /></div>
                </div>
            </div>
            <div className="border-t border-[var(--border-soft)] pt-6">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">Treatment &amp; Results</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className={labelCls} htmlFor="consult-followUpMedicationTreatment">Medication / Treatment <span className="text-[var(--text-muted)] italic font-normal normal-case">(Doctor Only)</span></label>
                        <textarea rows={5} id="consult-followUpMedicationTreatment" name="followUpMedicationTreatment" value={formData.followUpMedicationTreatment} onChange={handleChange} className={textareaCls} placeholder="Medications prescribed, treatment plan..." />
                    </div>
                    <div>
                        <label className={labelCls} htmlFor="consult-followUpLabResults">
                            Lab Results <span className="text-[var(--text-muted)] italic font-normal normal-case">(Doctor Only)</span>
                        </label>
                        <textarea rows={5} id="consult-followUpLabResults" name="followUpLabResults" value={formData.followUpLabResults} onChange={handleChange} className={textareaCls} placeholder="Auto-fetched when lab submits results..." />
                        {formData.followUpLabResults && <p className="text-[10px] text-[var(--green-accent-strong)] font-bold uppercase mt-2 inline-flex items-center gap-1"><Icon name="check" className="h-3.5 w-3.5" /> Results Synced from Laboratory</p>}
                    </div>
                </div>
            </div>
            <div className="border-t border-[var(--border-soft)] pt-6">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-4">Certification & Verification</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div className="bg-[var(--surface-subtle)]/70 p-5 rounded-2xl border border-[var(--border)] shadow-sm">
                        <label className={labelCls}>Provider Signature</label>
                        <div className="border-2 border-dashed border-[var(--border)] bg-white rounded-xl h-32 mb-2 relative overflow-hidden cursor-crosshair">
                            <div className="absolute inset-0 flex items-center justify-center text-[var(--border)] font-bold text-[10px] pointer-events-none select-none uppercase tracking-wide">Sign Here</div>
                            <SignatureCanvas ref={followUpSigCanvas} canvasProps={{ className: 'w-full h-full relative z-10' }} />
                        </div>
                        <button type="button" onClick={() => followUpSigCanvas.current?.clear()} className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--coral-accent)] transition-colors uppercase tracking-wide">Clear Signature</button>
                    </div>
                    <div className="hidden md:block py-6">
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed font-medium bg-[var(--surface-subtle)]/50 p-4 rounded-xl border border-[var(--border-soft)] border-dashed">
                            I hereby certify that the patient mentioned above has been examined and that the clinical findings and treatment plan recorded are accurate and based on professional medical assessment.
                        </p>
                    </div>
                </div>
            </div>
            </>)}
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-8 mt-8 border-t border-[var(--border-soft)]">
                <button onClick={() => setActiveTab(5)} className="order-2 sm:order-1 bg-[var(--surface-subtle)] hover:bg-[var(--border-soft)] text-[var(--text-2)] py-2.5 px-6 rounded-lg font-semibold transition-colors w-full sm:w-auto mb-1">Back</button>
                <div className="order-1 sm:order-2 flex flex-col gap-3 w-full sm:w-auto bg-[var(--surface-subtle)] border border-[var(--border)] p-4 rounded-2xl shadow-sm">
                    {isFollowUpVisit && <p className="text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wide text-center mb-1">Follow-up Actions</p>}
                    {isFollowUpVisit && followUpVisitStarted && (!followUpDone ? (
                        <button onClick={handleMarkFollowUpDone} disabled={loading || !patient?.id} className="w-full bg-white hover:bg-[var(--green-tint)] text-[var(--green-dark)] py-3 px-6 rounded-xl font-bold transition-colors border border-[var(--green-border)] flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                            {loading ? 'Processing...' : <><Icon name="check" className="h-4 w-4" /> Mark Follow-up as Done</>}
                        </button>
                    ) : (
                        <div className="w-full bg-[var(--green-tint-strong)] text-[var(--green-dark)] py-3 px-6 rounded-xl font-bold border border-[var(--green-border-strong)] flex items-center justify-center gap-2 shadow-sm cursor-default"><Icon name="check" className="h-4 w-4" /> Follow-up Completed</div>
                    ))}
                    <button onClick={() => setActiveTab(7)} className={`w-full text-white py-2.5 px-6 rounded-lg font-semibold shadow-sm transition-colors ${primaryBtnBg}`}>Next: Lab Request</button>
                </div>
            </div>
        </div>
    );

    const renderTab5 = () => (
        <div className={cardCls}>
            <div className="flex items-center gap-3 mb-6 border-b border-[var(--border-soft)] pb-4">
                <h3 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border-soft)] pb-3">IV. Diagnosis</h3>
            </div>
            <div className="space-y-6">
                <div>
                    <label className={labelCls} htmlFor="consult-diagnosis">Diagnosis: <span className="text-[var(--marker-required)]">*</span></label>
                    <textarea id="consult-diagnosis" name="diagnosis" value={formData.diagnosis} onChange={handleChange} className={`${textareaCls} min-h-[120px] border-l-4 border-l-blue-500`} placeholder="Enter final diagnosis for the Medical Certificate..." />
                </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-8 mt-8 border-t border-[var(--border-soft)]">
                <button onClick={() => setActiveTab(3)} className="order-2 sm:order-1 bg-[var(--surface-subtle)] hover:bg-[var(--border-soft)] text-[var(--text-2)] py-2.5 px-6 rounded-lg font-semibold transition-colors w-full sm:w-auto mb-1">Back</button>
                <div className="order-1 sm:order-2 flex flex-col gap-3 w-full sm:w-auto">
                    <div className="bg-[var(--surface-subtle)] p-2 rounded-xl border border-[var(--border)] shadow-sm w-full sm:w-auto">
                        <button onClick={handlePrintMedCert} className="w-full bg-white hover:bg-[var(--surface-subtle)] text-[var(--text-2)] py-2.5 px-5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm border border-[var(--border-soft)]"><Icon name="file-text" className="h-4 w-4" /> Print Medical Certificate</button>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={handleSaveConsultation}
                            disabled={loading || !patient?.id}
                            aria-busy={loading}
                            className="flex-1 min-h-11 bg-white border-2 border-[var(--border-strong)] text-[var(--text-2)] py-3 px-6 rounded-xl font-bold shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-[var(--surface-subtle)] hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-active)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:transform-none disabled:opacity-60 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {loading ? <><span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" /> Saving...</> : <><Icon name="save" className="h-4 w-4" /> Save Diagnosis</>}
                        </button>
                        <button onClick={() => setActiveTab(4)} className={`flex-1 text-white py-2.5 px-6 rounded-lg font-semibold shadow-sm transition-colors ${primaryBtnBg}`}>Next: Management and Health Education</button>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderTab6 = () => (
        <div className={cardCls}>
            <div className="flex items-center gap-3 mb-6 border-b border-[var(--border-soft)] pb-4">
                <h3 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border-soft)] pb-3">VI. Laboratory Request</h3>
            </div>
            <div className="space-y-2">
                <div className="bg-[var(--surface-subtle)]/50 rounded-2xl border border-[var(--border-soft)] p-6 space-y-6">
                    <div>
                        <div className="inline-block px-3 py-1 bg-white border border-[var(--border)] shadow-sm text-[var(--text-2)] text-xs font-semibold uppercase tracking-wide rounded-md mb-4">Laboratory Tests</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8">
                            {renderCheckbox('clinicalMicroscopy', 'Clinical Microscopy')}
                            {renderCheckbox('bloodChemistry', 'Blood Chemistry')}
                            {renderCheckbox('pregnancyTest', 'Pregnancy Test')}
                            {renderCheckbox('hbsagScreening', 'HBsAg Screening')}
                            {renderCheckbox('hivScreening', 'HIV Screening')}
                            {renderCheckbox('parasitology', 'Parasitology')}
                            {renderCheckbox('dengueRdt', 'Dengue RDT')}
                        </div>
                    </div>
                    <div className="pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="shrink-0">{renderCheckbox('others', 'Others:')}</div>
                        <input type="text" name="labTestsOther" value={formData.labTestsOther} onChange={handleChange} disabled={!formData.labTests.others}
                            className={`flex-1 bg-white border-2 ${formData.labTests.others ? 'border-[var(--border-strong)] focus:border-[var(--focus-color)] shadow-sm' : 'border-[var(--border-soft)]'} rounded-xl outline-none px-4 py-2.5 text-sm font-medium text-[var(--text)] disabled:opacity-50 disabled:bg-[var(--surface-subtle)] transition-all`}
                            placeholder={formData.labTests.others ? 'Specify other tests here...' : ''} />
                    </div>
                </div>
                <div><label className={labelCls} htmlFor="consult-labRequestedBy">Requested By</label><input id="consult-labRequestedBy" type="text" name="labRequestedBy" value={formData.labRequestedBy} onChange={handleChange} className={inputCls} /></div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between gap-3 pt-8 mt-6 border-t border-[var(--border-soft)]">
                <button onClick={() => setActiveTab(4)} className="order-2 sm:order-1 w-full sm:w-auto bg-[var(--surface-subtle)] hover:bg-[var(--border-soft)] text-[var(--text-2)] py-2.5 px-6 rounded-lg font-semibold transition-colors">Back</button>
                <div className="flex flex-col sm:flex-row gap-4 order-1 sm:order-2">
                    <button onClick={handleSaveLabRequest} disabled={loading || !patient?.id} className={`w-full sm:w-auto py-3.5 px-6 rounded-xl font-extrabold transition-colors shadow-sm border-2 disabled:opacity-50 ${isOnline ? 'bg-white border-[var(--border-strong)] text-[var(--text-2)] hover:bg-[var(--surface-subtle)]' : 'bg-[var(--amber-surface)] border-[var(--amber-tint-strong)] text-[var(--amber-text)] hover:bg-[var(--amber-tint)]'}`}>
                        {loading ? 'Sending...' : <><Icon name="clipboard" className="inline h-4 w-4 mr-2" />Send to Laboratory</>}
                    </button>
                    <button onClick={() => setActiveTab(8)} className={`w-full sm:w-auto text-white py-2.5 px-6 rounded-lg font-semibold transition-colors ${primaryBtnBg}`}>Next: E-Prescription</button>
                </div>
            </div>
        </div>
    );

    const renderTab7 = () => (
        <div className={cardCls}>
            <div className="flex items-center gap-3 mb-6 border-b border-[var(--border-soft)] pb-4">
                <h3 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border-soft)] pb-3">VII. E-Prescription</h3>
            </div>
            <div className="space-y-4 mb-6">
                {medications.map((med, i) => (
                    <div key={i} className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl p-5 shadow-sm relative group transition-all hover:border-[var(--border)]">
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            {medications.length > 1 && <button onClick={() => handleRemoveMed(i)} className="text-xs bg-white border border-[var(--coral-border)] text-[var(--coral-accent)] hover:bg-[var(--coral-tint)] px-3 py-1.5 rounded-lg font-bold transition-colors">Remove</button>}
                        </div>
                        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Medication {i + 1}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="sm:col-span-2 md:col-span-2">
                                <label className={labelCls} htmlFor={`consult-med-name-${i}`}>Medication Name</label>
                                <input type="text" id={`consult-med-name-${i}`} value={med.name} onChange={e => handleMedChange(i, 'name', e.target.value)} className={inputCls} placeholder="e.g. Amoxicillin 500mg" />
                            </div>
                            <div><label className={labelCls} htmlFor={`consult-med-dosage-${i}`}>Sig / Dosage</label><input type="text" id={`consult-med-dosage-${i}`} value={med.dosage} onChange={e => handleMedChange(i, 'dosage', e.target.value)} className={inputCls} placeholder="e.g. 1 tab 3x a day" /></div>
                            <div><label className={labelCls} htmlFor={`consult-med-quantity-${i}`}>Quantity</label><input type="text" id={`consult-med-quantity-${i}`} value={med.quantity} onChange={e => handleMedChange(i, 'quantity', e.target.value)} className={inputCls} placeholder="e.g. #21" /></div>
                        </div>
                    </div>
                ))}
            </div>
            <button onClick={handleAddMed} className="w-full py-4 border-2 border-dashed border-[var(--border)] rounded-2xl text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-2)] hover:bg-[var(--surface-subtle)] transition-all mb-8">
                + Add Another Medication
            </button>


            <div className="mt-6 bg-[var(--surface-subtle)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-4">Doctor's Authorization</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div>
                        <label className={labelCls}>E-Signature</label>
                        <div className="border-2 border-dashed border-[var(--border)] bg-white rounded-xl h-32 mb-2 relative overflow-hidden cursor-crosshair">
                            <div className="absolute inset-0 flex items-center justify-center text-[var(--border)] font-bold text-[10px] pointer-events-none select-none uppercase tracking-wide">Sign Here</div>
                            <SignatureCanvas ref={sigCanvas} canvasProps={{ className: 'w-full h-full relative z-10' }} />
                        </div>
                        <button type="button" onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--coral-accent)] transition-colors uppercase tracking-wide">Clear Signature</button>
                    </div>
                    <div className="hidden md:block">
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed font-medium bg-white/50 p-4 rounded-xl border border-[var(--border-soft)] border-dashed">
                            By signing this electronic prescription, you authorize the dispensing of the medications listed above to the patient. This electronic signature carries the same legal weight as a physical signature.
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-8 mt-8 border-t border-[var(--border-soft)]">
                <button onClick={() => setActiveTab(7)} className="order-2 sm:order-1 bg-[var(--surface-subtle)] hover:bg-[var(--border-soft)] text-[var(--text-2)] py-2.5 px-6 rounded-lg font-semibold transition-colors w-full sm:w-auto">Back</button>
                <div className="order-1 sm:order-2 flex flex-col items-end gap-3 w-full sm:w-auto">
                    <div className="bg-[var(--surface-subtle)] p-1.5 rounded-xl border border-[var(--border)] shadow-sm w-full sm:w-auto">
                        <button onClick={handlePrintPrescription} className="w-full sm:w-auto bg-white hover:bg-[var(--surface-subtle)] text-[var(--text-2)] py-2.5 px-5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm border border-[var(--border-soft)]"><Icon name="printer" className="h-4 w-4" /> Print Prescription Copy</button>
                    </div>
                    <button onClick={handleSavePrescription} disabled={loading || !patient?.id} className={`w-full sm:w-auto text-white py-3.5 px-8 rounded-xl font-bold shadow-md transition-all  flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${primaryBtnBg}`}>{loading ? 'Sending...' : <><Icon name="pill" className="h-4 w-4" /> Authorize &amp; Send to Pharmacy</>}</button>
                </div>
            </div>

            {/* Single explicit end-of-encounter action -- visually and
                semantically separate from prescription authorization/navigation.
                Sending a lab request or a prescription never implies this. */}
            <div className="mt-8 pt-6 border-t-2 border-dashed border-[var(--border)]">
                <div className="rounded-2xl border-2 border-[var(--green-border-strong)] bg-[var(--green-tint)] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-sm font-bold text-[var(--green-dark)]">Finish this consultation</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {consultationCompleted ? "Today's consultation has been completed." : "Once all applicable steps above are done, complete today's consultation."}
                        </p>
                    </div>
                    {consultationCompleted ? (
                        <div className="shrink-0 w-full sm:w-auto bg-[var(--green-tint-strong)] text-[var(--green-dark)] py-3 px-6 rounded-xl font-bold border border-[var(--green-border-strong)] flex items-center justify-center gap-2 shadow-sm cursor-default">
                            <Icon name="check" className="h-4 w-4" /> Consultation Completed
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCompleteConsultation}
                            disabled={loading || !patient?.id}
                            aria-busy={loading}
                            className="shrink-0 w-full sm:w-auto bg-[var(--green-accent-strong)] hover:bg-[var(--green-dark)] text-white py-3.5 px-8 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? 'Completing...' : <><Icon name="check" className="h-4 w-4" /> Complete Consultation</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    const tabs = [
        { id: 1, label: "1. Chief Complaint & HPI" },
        { id: 2, label: "2. Relevant Histories" },
        { id: 3, label: "3. Physical Examination" },
        { id: 5, label: "4. Diagnosis" },
        { id: 4, label: "5. Management & Health Education" },
        { id: 7, label: "6. Lab Request" },
        { id: 8, label: "7. E-Prescription" },
    ];

    return (
        <div className="w-full min-w-0 px-4 pb-8 md:px-5 xl:px-6">
            <ToastComponent />
            <div className="w-full">

                {/* Patient Info Card */}
                <div className="w-full bg-white border border-[var(--border)] rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--brand-active)] text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md">{patientInitials}</div>
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-[var(--text)] text-base leading-tight truncate">{patientFullName}</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span className="text-xs text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-2)]">{patient?.age ?? '—'}</span> yrs old</span>
                            <span className="text-xs text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-2)]">{patient?.sex || '—'}</span></span>
                            <span className="text-xs text-[var(--text-secondary)]">Blood Type: <span className="font-semibold text-[var(--text-2)]">{patient?.bloodType || '—'}</span></span>
                        </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:flex-nowrap lg:justify-end">
                        {/* -- realtime pill in patient header -- */}
                        <button onClick={() => setShowHistory(true)} className="min-h-11 w-full justify-center text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] bg-[var(--surface-subtle)] border border-[var(--border)] px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 sm:w-auto"><Icon name="clock" className="h-3.5 w-3.5" /> View Patient History</button>
                        <button onClick={handleReturnToQueue} className="min-h-11 w-full justify-center text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] bg-[var(--surface-subtle)] border border-[var(--border)] hover:bg-[var(--border-soft)] px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 sm:w-auto"><Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" /> Back to Patient Queue</button>
                    </div>
                </div>

                {/* Tabs Row */}
                <div
                    role="tablist"
                    aria-label="Consultation Room steps"
                    className="mb-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7 lg:gap-1 lg:border-b lg:border-[var(--border)]"
                >
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex min-h-11 min-w-0 items-center justify-center rounded-lg border px-3 py-2.5 text-center text-sm font-bold leading-snug transition-all lg:min-h-0 lg:rounded-t-xl lg:rounded-b-none lg:border-x-0 lg:border-t-0 lg:border-b-2 lg:px-2 lg:py-3 ${
                                activeTab === tab.id
                                    ? 'border-[var(--brand-active)] bg-[var(--brand-active)] text-white shadow-[var(--shadow-sm)] lg:border-[var(--brand-primary)] lg:bg-[var(--surface)] lg:text-[var(--text-2)]'
                                    : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-2)] hover:bg-[var(--surface)] lg:border-transparent lg:bg-transparent lg:text-[var(--text-muted)] lg:hover:bg-[var(--surface)] lg:hover:text-[var(--text-2)]'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Form Content Area */}
                <div className="w-full pwa-dense-panel">
                    {activeTab === 1 && renderTab1()}
                    {activeTab === 2 && renderTab2()}
                    {activeTab === 3 && renderTab3()}
                    {activeTab === 5 && renderTab5()}
                    {activeTab === 4 && renderTab4()}
                    {activeTab === 7 && renderTab6()}
                    {activeTab === 8 && renderTab7()}
                </div>
            </div>

            {/* History Modal */}
            {showHistory && patient && (
                <HistoryPanel
                    patient={patient}
                    patientName={patientFullName}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
}

export default ConsultationPage;
