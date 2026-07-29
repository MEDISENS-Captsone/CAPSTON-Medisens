import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '../../lib/supabase/client';
import { useNetworkSync, saveToIndexedDB, initIndexedDB } from '../../hooks/useNetworkSync';
import { useToast } from '../../components/feedback/Toast';
import { createLabRequest, createPrescription, upsertConsultation, upsertFollowUpByConsultation, upsertLatestFollowUpByPatient } from '../../features/consultation/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { isBlank, safeTrim, toNumberOrNull as parseNumberOrNull } from '../../lib/utils/strings';
import { printHtmlDocument } from '../../lib/utils/print';
import { itemizeText } from '../../features/patients/itemization';
import { Icon } from '../../components/shared/Icon';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { clinicalInputClass, clinicalLabelClass, clinicalTextareaClass } from '../../components/ui/ClinicalForm';
import { Skeleton, SkeletonList } from '../../components/ui/Skeleton';
import { PatientChartIdentityHeader, PatientHistoryPanel } from '../../components/patient/PatientChart';

// --- Interfaces ---------------------------------------------------------------
export interface ConsultationPageProps {
    doctorName: string;
    doctorInitials?: string;
    patientIdProp?: string | null;
    icidProp?: string | null;
    onBack?: () => void;
}

interface PatientData {
    id: string; firstName: string; lastName: string; middleName?: string;
    age: number | null; sex: string; bloodType: string; address?: string; contactNumber?: string;
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
const CONSULTATION_LOAD_COLUMNS = 'consultation_id, patient_id, initial_consultation_id, family_history, chief_complaints, diagnosis, hpi, attending_provider, medication_treatment, management_treatment, assessment, plan, follow_up_status';

// --- History Panel Sub-Component ----------------------------------------------
function HistoryPanel({ patientId, patientName, onClose }: { patientId: string; patientName: string; onClose: () => void; }) {
    const [consultations, setConsultations] = useState<ConsultationRecord[]>([]);
    const [initialConsults, setInitialConsults] = useState<InitialConsultationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<'all' | 'consultation' | 'initial'>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchHistory() {
            setLoading(true);
            const parsedId = parseInt(patientId);
            const numericId = isNaN(parsedId) ? patientId : parsedId;

            const [cRes, iRes, vRes] = await Promise.all([
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
            ]);

            if (cRes.data) setConsultations(cRes.data as ConsultationRecord[]);

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
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSection === key ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
            {label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${activeSection === key ? 'bg-slate-600' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
        </button>
    );

    const RecordCard = ({ id, badge, badgeColor, date, title, subtitle, children }: {
        id: string; badge: string; badgeColor: string;
        date: string; title: string; subtitle?: string; children: React.ReactNode;
    }) => (
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-2">
            <button
                onClick={() => toggle(id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
            >
                <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${badgeColor}`}>{badge}</span>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{title}</div>
                    {subtitle && <div className="text-xs text-slate-400 truncate">{subtitle}</div>}
                </div>
                <span className="shrink-0 text-xs text-slate-400 font-medium">{date}</span>
                <span className="shrink-0 text-slate-400 ml-1">{expandedId === id ? '?' : '?'}</span>
            </button>
            {expandedId === id && (
                <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-100 space-y-4">{children}</div>
            )}
        </div>
    );

    const Field = ({ label, value }: { label: string; value?: string | number | null }) =>
        value ? (
            <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{label}</div>
                <div className="text-sm text-slate-700">{value}</div>
            </div>
        ) : null;

    const SectionHeader = ({ label }: { label: string }) => (
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2 pb-1 border-t border-slate-200">{label}</div>
    );

    const totalCount = consultations.length + initialConsults.length;
    const nameParts = patientName.split(' ').filter(Boolean);
    const historyPatient = {
        firstName: nameParts[0] || patientName,
        lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
    };

    return (
        <ClinicalDrawer
            title="Patient History"
            labelledBy="consultation-patient-history-title"
            onClose={onClose}
            subtitle={<>{patientName} ? {totalCount} record{totalCount !== 1 ? 's' : ''}</>}
        >
                    <PatientChartIdentityHeader patient={historyPatient} compact className="mb-4" subtitle={`${totalCount} record${totalCount !== 1 ? 's' : ''}`} />
                    <PatientHistoryPanel title="Consultation History">
                    <div className="flex gap-2 border-b border-slate-100 bg-white pb-3 shrink-0 flex-wrap">
                        {sectionBtn('All', 'all', totalCount)}
                        {sectionBtn('Consultations', 'consultation', consultations.length)}
                        {sectionBtn('Initial', 'initial', initialConsults.length)}
                    </div>
                    <div className="py-4 bg-[var(--bg)]">
                        {loading ? (
                            <SkeletonList rows={3} />
                        ) : totalCount === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-2">
                                <Icon name="inbox" className="h-8 w-8 text-slate-400" />
                                <span className="text-sm text-slate-400">No history records found.</span>
                            </div>
                        ) : (
                            <>
                                {(activeSection === 'all' || activeSection === 'initial') && initialConsults.map((rec) => (
                                    <RecordCard key={`initial-${rec.initialconsultation_id}`} id={`initial-${rec.initialconsultation_id}`} badge="Initial" badgeColor="bg-purple-100 text-purple-700" date={formatDate(rec.consultation_date)} title={rec.chief_complaint || 'Initial Consultation'} subtitle={rec.diagnosis}>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
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
                                                        <div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Chief Complaint</div>
                                                            <ul className="space-y-0.5">{cc.map((v, i) => <li key={i} className="text-sm text-slate-700 ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                    )}
                                                    {dx.length > 0 && (
                                                        <div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Diagnosis</div>
                                                            <ul className="space-y-0.5">{dx.map((v, i) => <li key={i} className="text-sm text-slate-700 ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                        {rec.vitals && (
                                            <>
                                                <SectionHeader label="Vital Signs" />
                                                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                                                    <Field label="BP" value={rec.vitals.bp} />
                                                    <Field label="Heart Rate" value={rec.vitals.heart_rate != null ? `${rec.vitals.heart_rate} bpm` : null} />
                                                    <Field label="Resp. Rate" value={rec.vitals.respiratory_rate != null ? `${rec.vitals.respiratory_rate} cpm` : null} />
                                                    <Field label="Temperature" value={rec.vitals.temperature != null ? `${rec.vitals.temperature} ?C` : null} />
                                                    <Field label="O2 Saturation" value={rec.vitals.o2_saturation != null ? `${rec.vitals.o2_saturation}%` : null} />
                                                    <Field label="MUAC" value={rec.vitals.muac != null ? `${rec.vitals.muac} cm` : null} />
                                                </div>
                                                <SectionHeader label="Anthropometrics" />
                                                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
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
                                    <RecordCard key={`consult-${rec.consultation_id}`} id={`consult-${rec.consultation_id}`} badge="Consult" badgeColor="bg-slate-100 text-slate-700" date={`#${rec.consultation_id}`} title={rec.chief_complaints || `Consultation #${rec.consultation_id}`} subtitle={rec.diagnosis}>
                                        <SectionHeader label="Clinical" />
                                        <div className="space-y-2">
                                            {(() => {
                                                const cc = itemizeText(rec.chief_complaints);
                                                const dx = itemizeText(rec.diagnosis);
                                                return (
                                                    <>
                                                        {cc.length > 0 && (
                                                            <div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Chief Complaints</div>
                                                                <ul className="space-y-0.5">{cc.map((v, i) => <li key={i} className="text-sm text-slate-700 ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                        )}
                                                        {dx.length > 0 && (
                                                            <div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Diagnosis</div>
                                                                <ul className="space-y-0.5">{dx.map((v, i) => <li key={i} className="text-sm text-slate-700 ml-2 list-disc list-inside">{v}</li>)}</ul></div>
                                                        )}
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
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
                                                <SectionHeader label="Treatment & History" />
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
                                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{group.label}</div>
                                                                <ul className="space-y-0.5">
                                                                    {group.values.map((v, i) => <li key={i} className="text-sm text-slate-700 ml-2 list-disc list-inside">{v}</li>)}
                                                                </ul>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </>
                                        )}
                                        {(rec.family_history || rec.immunization_history || rec.smoking_status || rec.drinking_status) && (
                                            <>
                                                <SectionHeader label="Social & Family History" />
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                    <Field label="Family History" value={rec.family_history} />
                                                    <Field label="Immunization History" value={rec.immunization_history} />
                                                    <Field label="Smoking" value={rec.smoking_status === 'Yes' ? `Yes - ${rec.smoking_sticks_per_day ?? '?'} sticks/day for ${rec.smoking_years ?? '?'} yrs` : rec.smoking_status} />
                                                    <Field label="Drinking" value={rec.drinking_status === 'Yes' ? `Yes - ${rec.drinking_frequency ?? '?'}, ${rec.drinking_years ?? '?'} yrs` : rec.drinking_status} />
                                                </div>
                                            </>
                                        )}
                                        {(rec.menarche_age != null || rec.gravidity != null || rec.parity != null || rec.lmp || rec.birth_control_method) && (
                                            <>
                                                <SectionHeader label="OBGyne & Pregnancy" />
                                                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
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
                            </>
                        )}
                    </div>
                    </PatientHistoryPanel>
                    <div className="mt-4 border-t border-slate-100 shrink-0 bg-white pt-4">
                        <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Close</button>
                    </div>
        </ClinicalDrawer>
    );
}

// --- Exported Pure Component --------------------------------------------------
export function ConsultationPage({
    doctorName,
    patientIdProp,
    icidProp,
    onBack
}: ConsultationPageProps) {

    const urlParams = new URLSearchParams(window.location.search);
    const patientId = patientIdProp || urlParams.get('id');
    const icidFromUrl = icidProp || urlParams.get('icid');

    const [formData, setFormData] = useState({
        familyHistory: '', immunizationHistory: '', smoking: '', smokingSticksPerDay: '', smokingYears: '',
        drinking: '', drinkingFrequency: '', drinkingYears: '', menarche: '', onsetSexualIntercourse: '',
        menopause: '', menopauseAge: '', lmp: '', intervalCycle: '', periodDuration: '', padsPerDay: '',
        birthControlMethod: '', gravidity: '', parity: '', typeOfDelivery: '', fullTerm: '', premature: '',
        abortion: '', livingChildren: '', preEclampsia: '', medicationAndTreatment: '',

        followUpDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), followUpTime: '', followUpModeOfTx: 'Walk-in',
        followUpModeOfTransfer: 'Ambulatory', followUpChiefComplaint: '', followUpDiagnosis: '', followUpHpi: '',
        followUpBp: '', followUpHr: '', followUpRr: '', followUpTemp: '', followUpO2: '', followUpWeight: '',
        followUpHeight: '', followUpMuac: '', followUpNutritionalStatus: '', followUpBmi: '', followUpVaL: '',
        followUpVaR: '', followUpBloodType: '', followUpGenSurvey: '', managementTreatment: '', followUpLabResults: '',
        attendingProvider: '', chiefComplaints: '', diagnosis: '', hpi: '',

        bp: '', hr: '', rr: '', temp: '', weight: '', height: '', o2Saturation: '', muac: '',
        nutritionalStatus: '', bmi: '', visualAcuityLeft: '', visualAcuityRight: '',

        labTests: {
            cbc: false, cbcPlatelet: false, hgbHct: false, chestXray: false, ultrasound: false, urinalysis: false,
            fecalysis: false, sputum: false, rbs: false, fbs: false, uricAcid: false, cholesterol: false,
            hba1c: false, bloodTyping: false, creatinine: false, sgpt: false, lipidProfile: false, ecg: false, others: false,
        },
        labTestsOther: '', labChiefComplaint: '', labRequestedBy: '', rxLicNo: '', rxPtrNo: '',
    });

    const followUpBmiInfo = useMemo(() => {
        const w = parseFloat(formData.followUpWeight || '0');
        const h = parseFloat(formData.followUpHeight || '0');
        if (w > 0 && h > 0) {
            const bmiValue = parseFloat((w / ((h / 100) * (h / 100))).toFixed(1));
            let status = 'Normal'; let color = 'text-emerald-600';
            if (bmiValue < 18.5) { status = 'Underweight'; color = 'text-amber-500'; }
            else if (bmiValue >= 25 && bmiValue < 29.9) { status = 'Overweight'; color = 'text-orange-500'; }
            else if (bmiValue >= 30) { status = 'Obese'; color = 'text-red-500'; }
            return { value: bmiValue.toString(), status, color };
        }
        return null;
    }, [formData.followUpWeight, formData.followUpHeight]);

    const [medications, setMedications] = useState<Medication[]>([{ name: '', dosage: '', frequency: '', duration: '', quantity: '' }]);
    const [consultationSaved, setConsultationSaved] = useState(false);
    const [followUpDone, setFollowUpDone] = useState(false);
    const sigCanvas = useRef<SignatureCanvas | null>(null);
    const followUpSigCanvas = useRef<SignatureCanvas | null>(null);

    const [activeTab, setActiveTab] = useState(1);
    const [patient, setPatient] = useState<PatientData | null>(null);
    const [patientLoading, setPatientLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [consultationId, setConsultationId] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    // -- real-time live indicator ----------------------------------------------
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

    const { isOnline } = useNetworkSync();
    const primaryBtnBg = isOnline ? 'bg-slate-700 hover:bg-slate-800 shadow-none' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20';

    const { showToast, ToastComponent } = useToast();

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
            managementTreatment: data.medication_treatment ?? prev.managementTreatment,
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

        const loadPatient = async () => {
            if (!patientId) { setPatientLoading(false); return; }
            const { data, error } = await supabase
                .from('patients')
                .select('id, firstName, lastName, middleName, age, sex, bloodType, address, contactNumber')
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
                    bmi: data.bmi?.toString() ?? '', visualAcuityLeft: data.visual_acuity_left ?? '', visualAcuityRight: data.visual_acuity_right ?? '',
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
            if (data.follow_up_status === 'done') setFollowUpDone(true);
            setFormData(prev => ({
                ...prev,
                familyHistory: data.family_history ?? '',
                chiefComplaints: data.chief_complaints ?? '',
                diagnosis: data.diagnosis ?? '',
                hpi: data.hpi ?? '',
                attendingProvider: data.attending_provider ?? prev.attendingProvider,
                medicationAndTreatment: data.medication_treatment ?? '',
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
                    }));
                }
            )

            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setRealtimeStatus('live');
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
                else setRealtimeStatus('connecting');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [patient?.id, fetchLabResults, fetchFollowUp]);

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    const buildConsultationPayload = () => ({
        patient_id: patient?.id, ...(icidFromUrl ? { initial_consultation_id: parseInt(icidFromUrl as string) } : {}),
        family_history: formData.familyHistory || null, immunization_history: formData.immunizationHistory || null,
        smoking_status: formData.smoking || null, smoking_sticks_per_day: formData.smokingSticksPerDay ? parseInt(formData.smokingSticksPerDay) : null,
        smoking_years: formData.smokingYears ? parseInt(formData.smokingYears) : null, drinking_status: formData.drinking || null,
        drinking_frequency: formData.drinkingFrequency || null, drinking_years: formData.drinkingYears ? parseInt(formData.drinkingYears) : null,
        menarche_age: formData.menarche ? parseInt(formData.menarche) : null, sexual_onset_age: formData.onsetSexualIntercourse ? parseInt(formData.onsetSexualIntercourse) : null,
        is_menopause: formData.menopause || null, menopause_age: formData.menopauseAge ? parseInt(formData.menopauseAge) : null, lmp: formData.lmp || null,
        interval_cycle: formData.intervalCycle || null, period_duration: formData.periodDuration || null, pads_per_day: formData.padsPerDay ? parseInt(formData.padsPerDay) : null,
        birth_control_method: formData.birthControlMethod || null, gravidity: formData.gravidity ? parseInt(formData.gravidity) : null, parity: formData.parity ? parseInt(formData.parity) : null,
        delivery_type: formData.typeOfDelivery || null, full_term_count: formData.fullTerm ? parseInt(formData.fullTerm) : null, premature_count: formData.premature ? parseInt(formData.premature) : null,
        abortion_count: formData.abortion ? parseInt(formData.abortion) : null, living_children_count: formData.livingChildren ? parseInt(formData.livingChildren) : null, pre_eclampsia: formData.preEclampsia || null,
        medication_treatment: formData.medicationAndTreatment || null, management_treatment: formData.managementTreatment || null, attending_provider: formData.attendingProvider || null,
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
            general_survey: formData.followUpGenSurvey || null, medication_treatment: formData.managementTreatment || null, lab_results: formData.followUpLabResults || null, signature_url: sigUrl || null,
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

    const handleSaveConsultation = async () => {
        if (!patient?.id) return;
        setLoading(true);
        try {
            const consultationPayload = buildConsultationPayload();
            if (isOnline) {
                let resolvedConsultationId = consultationId;
                resolvedConsultationId = await upsertConsultation(consultationPayload, resolvedConsultationId);
                setConsultationId(resolvedConsultationId);
                const followUpPayload = buildFollowUpPayload(resolvedConsultationId, 'pending');
                await upsertFollowUpByConsultation(resolvedConsultationId, followUpPayload);
                setConsultationSaved(true);
                showToast('Consultation recorded.', false);
                // Automatically go back to dashboard after a short delay
                setTimeout(() => {
                    goBack();
                }, 1500);
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
                general_survey: formData.followUpGenSurvey || null, medication_treatment: formData.managementTreatment || null,
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
                    <div class="section"><span class="section-label">Remarks / Recommendation:</span><div class="section-content">${formData.medicationAndTreatment || ''}</div></div>
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
                    is_cbc: formData.labTests.cbc, is_cbc_platelet: formData.labTests.cbcPlatelet, is_hgb_hct: formData.labTests.hgbHct, is_xray: formData.labTests.chestXray, is_ultrasound: formData.labTests.ultrasound,
                    is_urinalysis: formData.labTests.urinalysis, is_fecalysis: formData.labTests.fecalysis, is_sputum: formData.labTests.sputum, is_rbs: formData.labTests.rbs, is_fbs: formData.labTests.fbs,
                    is_uric_acid: formData.labTests.uricAcid, is_cholesterol: formData.labTests.cholesterol, others: formData.labTestsOther || null, requested_by: formData.labRequestedBy || null, status: 'Pending',
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
                <label key={opt} className={`cursor-pointer px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${value === opt ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name={name} value={opt} checked={value === opt} onChange={handleRadioChange} className="hidden" />{opt}
                </label>
            ))}
        </div>
    );

    const renderCheckbox = (key: keyof typeof formData.labTests, label: string) => (
        <label key={key} className="flex items-center gap-3 cursor-pointer group min-h-[40px]">
            <div className="relative flex items-center justify-center w-5 h-5 border-2 border-slate-300 rounded bg-white shrink-0 transition-colors group-hover:border-slate-400">
                <input type="checkbox" checked={formData.labTests[key]} onChange={() => handleLabTestChange(key)} className="absolute opacity-0 w-0 h-0" />
                {formData.labTests[key] && <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </div>
            <span className="text-sm font-medium text-slate-700">{label}</span>
        </label>
    );

    if (patientLoading) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-5" role="status" aria-live="polite" aria-busy="true">
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
            <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-8 mb-6 text-amber-700 flex flex-col items-center justify-center text-center">
                <Icon name="stethoscope" className="h-10 w-10 mb-4" />
                <h2 className="text-xl font-bold mb-2">No patient selected</h2>
                <p className="text-sm font-semibold mb-6">Select a patient from the clinical work queue to begin consultation.</p>
                <button onClick={goBack} className="px-6 py-2.5 bg-slate-700 text-white rounded-lg font-semibold shadow-sm hover:bg-slate-800 transition-colors">Return to Work Queue</button>
            </div>
        );
    }

    const renderTab1 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">I. Histories</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div><label className={labelCls}>Family History</label><textarea name="familyHistory" value={formData.familyHistory} onChange={handleChange} rows={4} className={textareaCls} /></div>
                    <div><label className={labelCls}>Immunization History</label><textarea name="immunizationHistory" value={formData.immunizationHistory} onChange={handleChange} rows={4} className={textareaCls} /></div>
                </div>
                <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-5 space-y-6 shadow-sm">
                    <div>
                        <label className={labelCls}>Smoking History</label>
                        <RadioGroup name="smoking" options={['Yes', 'No']} value={formData.smoking} />
                        {formData.smoking === 'Yes' && (
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                <div><label className={labelCls}>Sticks / Day</label><input type="number" name="smokingSticksPerDay" value={formData.smokingSticksPerDay} onChange={handleChange} className={inputCls} /></div>
                                <div><label className={labelCls}>Years</label><input type="number" name="smokingYears" value={formData.smokingYears} onChange={handleChange} className={inputCls} /></div>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>Drinking History</label>
                        <RadioGroup name="drinking" options={['Yes', 'No']} value={formData.drinking} />
                        {formData.drinking === 'Yes' && (
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                <div><label className={labelCls}>Frequency</label><input type="text" name="drinkingFrequency" value={formData.drinkingFrequency} onChange={handleChange} className={inputCls} /></div>
                                <div><label className={labelCls}>Years</label><input type="number" name="drinkingYears" value={formData.drinkingYears} onChange={handleChange} className={inputCls} /></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex justify-end pt-4"><button onClick={() => setActiveTab(isMale ? 3 : 2)} className={`w-full md:w-auto text-white font-semibold py-2.5 px-6 rounded-lg shadow-sm transition-colors duration-200 ${primaryBtnBg}`}>{isMale ? 'Next: Assessment' : 'Next: OBGyne & Pregnancy'}</button></div>
        </div>
    );

    const renderTab2 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">II. OBGyne &amp; Pregnancy History</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">OBGyne</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls}>Menarche (y/o)</label><input type="number" name="menarche" value={formData.menarche} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}>Onset Sexual Intercourse</label><input type="number" name="onsetSexualIntercourse" value={formData.onsetSexualIntercourse} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div>
                        <label className={labelCls}>Menopause</label>
                        <RadioGroup name="menopause" options={['Yes', 'No']} value={formData.menopause} />
                        {formData.menopause === 'Yes' && <div className="mt-3"><label className={labelCls}>Age at Menopause</label><input type="number" name="menopauseAge" value={formData.menopauseAge} onChange={handleChange} className={inputCls} /></div>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls}>LMP</label><input type="date" name="lmp" value={formData.lmp} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}>Interval Cycle (Days)</label><input type="text" name="intervalCycle" value={formData.intervalCycle} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}>Period Duration (Days)</label><input type="text" name="periodDuration" value={formData.periodDuration} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}># of Pads / Day</label><input type="number" name="padsPerDay" value={formData.padsPerDay} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div><label className={labelCls}>Birth Control Method</label><input type="text" name="birthControlMethod" value={formData.birthControlMethod} onChange={handleChange} className={inputCls} /></div>
                </div>
                <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pregnancy History</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls}>Gravidity</label><input type="number" name="gravidity" value={formData.gravidity} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}>Parity</label><input type="number" name="parity" value={formData.parity} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div>
                        <label className={labelCls}>Type of Delivery</label>
                        <select name="typeOfDelivery" value={formData.typeOfDelivery} onChange={handleChange} className={inputCls}><option value="">Select type...</option><option value="Normal">Normal</option><option value="CS">CS</option><option value="Both">Both Normal and CS</option></select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls}># Full Term</label><input type="number" name="fullTerm" value={formData.fullTerm} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}># Premature</label><input type="number" name="premature" value={formData.premature} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}># Abortion</label><input type="number" name="abortion" value={formData.abortion} onChange={handleChange} className={inputCls} /></div>
                        <div><label className={labelCls}># Living Children</label><input type="number" name="livingChildren" value={formData.livingChildren} onChange={handleChange} className={inputCls} /></div>
                    </div>
                    <div><label className={labelCls}>Pre-eclampsia</label><RadioGroup name="preEclampsia" options={['Yes', 'No']} value={formData.preEclampsia} /></div>
                </div>
            </div>
            <div className="flex justify-between pt-4"><button onClick={() => setActiveTab(1)} className="bg-slate-100 py-2.5 px-6 rounded-lg font-semibold">Back</button><button onClick={() => setActiveTab(3)} className={`text-white py-2.5 px-6 rounded-lg shadow-sm font-semibold ${primaryBtnBg}`}>Next: Clinical Assessment</button></div>
        </div>
    );

    const renderTab3 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">III. Clinical Assessment</h3>
            <div><label className={labelCls}>Medication and Treatment</label><textarea name="medicationAndTreatment" value={formData.medicationAndTreatment} onChange={handleChange} rows={7} className={textareaCls} /></div>
            <div className="flex justify-between pt-4"><button onClick={() => setActiveTab(isMale ? 1 : 2)} className="bg-slate-100 py-2.5 px-6 rounded-lg font-semibold">Back</button><button onClick={() => setActiveTab(4)} className={`text-white py-2.5 px-6 rounded-lg shadow-sm font-semibold ${primaryBtnBg}`}>Next: Follow-up</button></div>
        </div>
    );

    const renderTab4 = () => (
        <div className="space-y-6  pb-20 md:pb-0">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900">IV. Follow-up Visit</h3>
            </div>
            {!consultationSaved && (
                <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800">
                    <Icon name="file-text" className="h-5 w-5 shrink-0" />
                    <span>Follow-up details will be recorded when the consultation is finalized.</span>
                </div>
            )}
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Visit Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={labelCls}>Visit Date</label><input type="date" name="followUpDate" value={formData.followUpDate} onChange={handleChange} className={inputCls} /></div>
                    <div><label className={labelCls}>Visit Time</label><input type="time" name="followUpTime" value={formData.followUpTime} onChange={handleChange} className={inputCls} /></div>
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
                    <div><label className={labelCls}>Blood Type</label><input type="text" name="followUpBloodType" value={formData.followUpBloodType} onChange={handleChange} className={inputCls} placeholder={patient?.bloodType || '?'} /></div>
                    <div><label className={labelCls}>General Survey</label><input type="text" name="followUpGenSurvey" value={formData.followUpGenSurvey} onChange={handleChange} className={inputCls} placeholder="e.g. Awake, conscious, coherent..." /></div>
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Clinical</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={labelCls}>Chief Complaint</label><textarea name="followUpChiefComplaint" value={formData.followUpChiefComplaint} onChange={handleChange} rows={3} className={textareaCls} placeholder="Primary reason for visit..." /></div>
                    <div><label className={labelCls}>Diagnosis</label><textarea name="followUpDiagnosis" value={formData.followUpDiagnosis} onChange={handleChange} rows={3} className={textareaCls} /></div>
                    <div className="md:col-span-2"><label className={labelCls}>History of Present Illness <span className="text-slate-400 font-normal normal-case ml-1">(Optional)</span></label><textarea name="followUpHpi" value={formData.followUpHpi} onChange={handleChange} rows={3} className={textareaCls} /></div>
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Vitals</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={labelCls}>BP (mmHg)</label><input type="text" name="followUpBp" value={formData.followUpBp} onChange={handleChange} className={inputCls} placeholder="120/80" /></div>
                    <div><label className={labelCls}>Heart Rate (bpm)</label><input type="text" name="followUpHr" value={formData.followUpHr} onChange={handleChange} className={inputCls} placeholder="72" /></div>
                    <div><label className={labelCls}>Respiratory Rate (cpm)</label><input type="text" name="followUpRr" value={formData.followUpRr} onChange={handleChange} className={inputCls} placeholder="16" /></div>
                    <div><label className={labelCls}>Temperature (?C)</label><input type="text" name="followUpTemp" value={formData.followUpTemp} onChange={handleChange} className={inputCls} placeholder="36.5" /></div>
                    <div><label className={labelCls}>O2 Saturation (%)</label><input type="text" name="followUpO2" value={formData.followUpO2} onChange={handleChange} className={inputCls} placeholder="98" /></div>
                    <div><label className={labelCls}>MUAC (cm)</label><input type="text" name="followUpMuac" value={formData.followUpMuac} onChange={handleChange} className={inputCls} placeholder="28.5" /></div>
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Anthropometrics</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={labelCls}>Weight (kg)</label><input type="text" name="followUpWeight" value={formData.followUpWeight} onChange={handleChange} className={inputCls} placeholder="65" /></div>
                    <div><label className={labelCls}>Height (cm)</label><input type="text" name="followUpHeight" value={formData.followUpHeight} onChange={handleChange} className={inputCls} placeholder="165" /></div>
                    <div>
                        <label className={labelCls}>BMI <span className="text-slate-400 font-normal normal-case">(auto)</span></label>
                        <input type="text" readOnly value={followUpBmiInfo ? followUpBmiInfo.value : ''} className={`${inputCls} bg-slate-100 text-slate-500 font-semibold cursor-default`} placeholder="?" />
                        {followUpBmiInfo && <p className={`text-xs mt-1.5 font-semibold ${followUpBmiInfo.color}`}>{followUpBmiInfo.status}</p>}
                    </div>
                    <div><label className={labelCls}>Visual Acuity ? Left</label><input type="text" name="followUpVaL" value={formData.followUpVaL} onChange={handleChange} className={inputCls} placeholder="20/20" /></div>
                    <div><label className={labelCls}>Visual Acuity ? Right</label><input type="text" name="followUpVaR" value={formData.followUpVaR} onChange={handleChange} className={inputCls} placeholder="20/20" /></div>
                </div>
            </div>
            <div className="border-t border-slate-100 pt-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Treatment &amp; Results</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className={labelCls}>Medication / Treatment <span className="text-slate-300 italic font-normal normal-case">(Doctor Only)</span></label>
                        <textarea rows={5} name="managementTreatment" value={formData.managementTreatment} onChange={handleChange} className={textareaCls} placeholder="Medications prescribed, treatment plan..." />
                    </div>
                    <div>
                        <label className={labelCls}>
                            Lab Results <span className="text-slate-300 italic font-normal normal-case">(Doctor Only)</span>
                        </label>
                        <textarea rows={5} name="followUpLabResults" value={formData.followUpLabResults} onChange={handleChange} className={textareaCls} placeholder="Auto-fetched when lab submits results..." />
                        {formData.followUpLabResults && <p className="text-[10px] text-green-600 font-bold uppercase mt-2 inline-flex items-center gap-1"><Icon name="check" className="h-3.5 w-3.5" /> Results Synced from Laboratory</p>}
                    </div>
                </div>
            </div>
            <div className="border-t border-slate-100 pt-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Certification & Verification</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <label className={labelCls}>Provider Signature</label>
                        <div className="border-2 border-dashed border-slate-300 bg-white rounded-xl h-32 mb-2 relative overflow-hidden cursor-crosshair">
                            <div className="absolute inset-0 flex items-center justify-center text-slate-200 font-bold text-[10px] pointer-events-none select-none uppercase tracking-widest">Sign Here</div>
                            <SignatureCanvas ref={followUpSigCanvas} canvasProps={{ className: 'w-full h-full relative z-10' }} />
                        </div>
                        <button type="button" onClick={() => followUpSigCanvas.current?.clear()} className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest">Clear Signature</button>
                    </div>
                    <div className="hidden md:block py-6">
                        <p className="text-[11px] text-slate-400 leading-relaxed font-medium bg-slate-50/50 p-4 rounded-xl border border-slate-100 border-dashed">
                            I hereby certify that the patient mentioned above has been examined and that the clinical findings and treatment plan recorded are accurate and based on professional medical assessment.
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-8 mt-8 border-t border-slate-100">
                <button onClick={() => setActiveTab(3)} className="order-2 sm:order-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 px-6 rounded-lg font-semibold transition-colors w-full sm:w-auto mb-1">Back</button>
                <div className="order-1 sm:order-2 flex flex-col gap-3 w-full sm:w-auto bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-sm">
                    <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest text-center mb-1">Follow-up Actions</p>
                    {!followUpDone ? (
                        <button onClick={handleMarkFollowUpDone} disabled={loading || !patient?.id} className="w-full bg-white hover:bg-green-50 text-green-700 py-3 px-6 rounded-xl font-bold transition-colors border border-green-200 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                            {loading ? 'Processing...' : <><Icon name="check" className="h-4 w-4" /> Mark Follow-up as Done</>}
                        </button>
                    ) : (
                        <div className="w-full bg-green-100 text-green-700 py-3 px-6 rounded-xl font-bold border border-green-300 flex items-center justify-center gap-2 shadow-sm cursor-default"><Icon name="check" className="h-4 w-4" /> Follow-up Completed</div>
                    )}
                    <button onClick={() => setActiveTab(5)} className={`w-full text-white py-2.5 px-6 rounded-lg font-semibold shadow-sm transition-colors ${primaryBtnBg}`}>Next: Clinical Notes</button>
                </div>
            </div>
        </div>
    );

    const renderTab5 = () => (
        <div className={cardCls}>
            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">V. Clinical Notes &amp; Certification</h3>
            </div>
            <div className="space-y-6">
                <div>
                    <label className={labelCls}>Diagnosis: <span className="text-rose-500">*</span></label>
                    <textarea name="diagnosis" value={formData.diagnosis} onChange={handleChange} className={`${textareaCls} min-h-[120px] border-l-4 border-l-blue-500`} placeholder="Enter final diagnosis for the Medical Certificate..." />
                </div>
                <div>
                    <label className={labelCls}>Remarks / Recommendation:</label>
                    <textarea name="medicationAndTreatment" value={formData.medicationAndTreatment} onChange={handleChange} className={`${textareaCls} min-h-[120px]`} placeholder="Enter instructions, rest period, or follow-up recommendations..." />
                </div>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-8 mt-8 border-t border-slate-100">
                <button onClick={() => setActiveTab(4)} className="order-2 sm:order-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 px-6 rounded-lg font-semibold transition-colors w-full sm:w-auto mb-1">Back</button>
                <div className="order-1 sm:order-2 flex flex-col gap-3 w-full sm:w-auto">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto">
                        <button onClick={handlePrintMedCert} className="w-full bg-white hover:bg-slate-100 text-slate-700 py-2.5 px-5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm border border-slate-100"><Icon name="file-text" className="h-4 w-4" /> Print Medical Certificate</button>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={handleSaveConsultation} className="flex-1 bg-white border-2 border-slate-500 text-slate-700 py-3 px-6 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"><Icon name="save" className="h-4 w-4" /> Record Consultation</button>
                        <button onClick={() => setActiveTab(7)} className={`flex-1 text-white py-2.5 px-6 rounded-lg font-semibold shadow-sm transition-colors ${primaryBtnBg}`}>Next: Lab Request</button>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderTab6 = () => (
        <div className={cardCls}>
            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">VI. Laboratory Request</h3>
            </div>
            <div className="space-y-2">
                <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-6 space-y-6">
                    <div>
                        <div className="inline-block px-3 py-1 bg-white border border-slate-200 shadow-sm text-slate-600 text-xs font-black uppercase tracking-widest rounded-md mb-4">Routine Tests</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8">
                            {renderCheckbox('cbc', 'Complete Blood Count (CBC)')}
                            {renderCheckbox('urinalysis', 'Urinalysis')}
                            {renderCheckbox('cbcPlatelet', 'CBC with Platelet Count')}
                            {renderCheckbox('fecalysis', 'Fecalysis')}
                            {renderCheckbox('hgbHct', 'Hemoglobin and Hematocrit')}
                            {renderCheckbox('sputum', 'Sputum')}
                            {renderCheckbox('chestXray', 'Chest X-Ray (PA View)')}
                            {renderCheckbox('ultrasound', 'Ultrasound')}
                            {renderCheckbox('bloodTyping', 'Blood Typing')}
                            {renderCheckbox('ecg', 'ECG')}
                        </div>
                    </div>
                    <div className="pt-6 border-t border-slate-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="inline-block px-3 py-1 bg-white border border-slate-200 shadow-sm text-slate-600 text-xs font-black uppercase tracking-widest rounded-md">Fasting Tests</div>
                            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide bg-slate-100 px-2 py-1 rounded-md">8-10 hrs required</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8">
                            {renderCheckbox('rbs', 'Random Blood Sugar (RBS)')}
                            {renderCheckbox('fbs', 'Fasting Blood Sugar (FBS)')}
                            {renderCheckbox('uricAcid', 'Uric Acid')}
                            {renderCheckbox('cholesterol', 'Cholesterol')}
                            {renderCheckbox('lipidProfile', 'Lipid Profile')}
                            {renderCheckbox('hba1c', 'HbA1c')}
                            {renderCheckbox('creatinine', 'Creatinine')}
                            {renderCheckbox('sgpt', 'SGPT')}
                        </div>
                    </div>
                    <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="shrink-0">{renderCheckbox('others', 'Others:')}</div>
                        <input type="text" name="labTestsOther" value={formData.labTestsOther} onChange={handleChange} disabled={!formData.labTests.others}
                            className={`flex-1 bg-white border-2 ${formData.labTests.others ? 'border-slate-400 focus:border-slate-500 shadow-sm' : 'border-slate-100'} rounded-xl outline-none px-4 py-2.5 text-sm font-medium text-slate-800 disabled:opacity-50 disabled:bg-slate-50 transition-all`}
                            placeholder={formData.labTests.others ? 'Specify other tests here...' : ''} />
                    </div>
                </div>
                <div><label className={labelCls}>Requested By</label><input type="text" name="labRequestedBy" value={formData.labRequestedBy} onChange={handleChange} className={inputCls} /></div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between gap-3 pt-8 mt-6 border-t border-slate-100">
                <button onClick={() => setActiveTab(5)} className="order-2 sm:order-1 w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 px-6 rounded-lg font-semibold transition-colors">Back</button>
                <div className="flex flex-col sm:flex-row gap-4 order-1 sm:order-2">
                    <button onClick={handleSaveLabRequest} disabled={loading || !patient?.id} className={`w-full sm:w-auto py-3.5 px-6 rounded-xl font-extrabold transition-colors shadow-sm border-2 disabled:opacity-50 ${isOnline ? 'bg-white border-slate-500 text-slate-700 hover:bg-slate-50' : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'}`}>
                        {loading ? 'Sending...' : <><Icon name="clipboard" className="inline h-4 w-4 mr-2" />Send to Laboratory</>}
                    </button>
                    <button onClick={() => setActiveTab(8)} className={`w-full sm:w-auto text-white py-2.5 px-6 rounded-lg font-semibold transition-colors ${primaryBtnBg}`}>Next: E-Prescription</button>
                </div>
            </div>
        </div>
    );

    const renderTab7 = () => (
        <div className={cardCls}>
            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">VII. E-Prescription</h3>
            </div>
            <div className="space-y-4 mb-6">
                {medications.map((med, i) => (
                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm relative group transition-all hover:border-slate-200">
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            {medications.length > 1 && <button onClick={() => handleRemoveMed(i)} className="text-xs bg-white border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg font-bold transition-colors">Remove</button>}
                        </div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Medication {i + 1}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="sm:col-span-2 md:col-span-2">
                                <label className={labelCls}>Medication Name</label>
                                <input type="text" value={med.name} onChange={e => handleMedChange(i, 'name', e.target.value)} className={inputCls} placeholder="e.g. Amoxicillin 500mg" />
                            </div>
                            <div><label className={labelCls}>Sig / Dosage</label><input type="text" value={med.dosage} onChange={e => handleMedChange(i, 'dosage', e.target.value)} className={inputCls} placeholder="e.g. 1 tab 3x a day" /></div>
                            <div><label className={labelCls}>Quantity</label><input type="text" value={med.quantity} onChange={e => handleMedChange(i, 'quantity', e.target.value)} className={inputCls} placeholder="e.g. #21" /></div>
                        </div>
                    </div>
                ))}
            </div>
            <button onClick={handleAddMed} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-sm font-bold text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all mb-8">
                + Add Another Medication
            </button>


            <div className="mt-6 bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Doctor's Authorization</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div>
                        <label className={labelCls}>E-Signature</label>
                        <div className="border-2 border-dashed border-slate-300 bg-white rounded-xl h-32 mb-2 relative overflow-hidden cursor-crosshair">
                            <div className="absolute inset-0 flex items-center justify-center text-slate-200 font-bold text-[10px] pointer-events-none select-none uppercase tracking-widest">Sign Here</div>
                            <SignatureCanvas ref={sigCanvas} canvasProps={{ className: 'w-full h-full relative z-10' }} />
                        </div>
                        <button type="button" onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest">Clear Signature</button>
                    </div>
                    <div className="hidden md:block">
                        <p className="text-[11px] text-slate-400 leading-relaxed font-medium bg-white/50 p-4 rounded-xl border border-slate-100 border-dashed">
                            By signing this electronic prescription, you authorize the dispensing of the medications listed above to the patient. This electronic signature carries the same legal weight as a physical signature.
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-8 mt-8 border-t border-slate-100">
                <button onClick={() => setActiveTab(7)} className="order-2 sm:order-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 px-6 rounded-lg font-semibold transition-colors w-full sm:w-auto">Back</button>
                <div className="order-1 sm:order-2 flex flex-col items-end gap-3 w-full sm:w-auto">
                    <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto">
                        <button onClick={handlePrintPrescription} className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-700 py-2.5 px-5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm border border-slate-100"><Icon name="printer" className="h-4 w-4" /> Print Prescription Copy</button>
                    </div>
                    <button onClick={handleSavePrescription} className={`w-full sm:w-auto text-white py-3.5 px-8 rounded-xl font-bold shadow-md transition-all  flex items-center justify-center gap-2 ${primaryBtnBg}`}><Icon name="pill" className="h-4 w-4" /> Authorize &amp; Send to Pharmacy</button>
                </div>
            </div>
        </div>
    );

    const tabs = [
        { id: 1, label: "1. Histories" },
        { id: 2, label: "2. OBGyne", disabled: isMale },
        { id: 3, label: "3. Assessment" },
        { id: 4, label: "4. Follow-up" },
        { id: 5, label: "5. Clinical Notes" },
        { id: 7, label: "6. Lab Request" },
        { id: 8, label: "7. E-Prescription" },
    ];

    return (
        <div className="w-full min-w-0 pb-8">
            <ToastComponent />
            <div className="w-full">

                {/* Patient Info Card */}
                <div className="w-full bg-white border border-slate-200 rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md">{patientInitials}</div>
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-base leading-tight truncate">{patientFullName}</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{patient?.age ?? '—'}</span> yrs old</span>
                            <span className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{patient?.sex || '—'}</span></span>
                            <span className="text-xs text-slate-500">Blood Type: <span className="font-semibold text-slate-700">{patient?.bloodType || '—'}</span></span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {/* -- realtime pill in patient header -- */}
                        <button onClick={() => setShowHistory(true)} className="text-xs font-semibold text-slate-700 hover:text-slate-800 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg transition-all flex items-center gap-1.5"><Icon name="clock" className="h-3.5 w-3.5" /> View Patient History</button>
                        <button onClick={goBack} className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-all">Return to Work Queue</button>
                    </div>
                </div>

                {/* Tabs Row */}
                <div className="flex gap-1 mb-8 border-b border-slate-200 overflow-x-auto whitespace-nowrap w-full scrollbar-hide">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => !tab.disabled && setActiveTab(tab.id)}
                            disabled={tab.disabled}
                            className={`px-4 py-3 text-sm font-bold rounded-t-xl transition-all border-b-2 flex-shrink-0 ${tab.disabled ? 'text-slate-300 border-transparent cursor-not-allowed bg-slate-50 line-through' : activeTab === tab.id ? 'text-slate-700 bg-white border-slate-700 shadow-[0_-4px_15px_rgba(0,0,0,0.03)]' : 'text-slate-400 border-transparent hover:bg-white hover:text-slate-600'}`}
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
                    {activeTab === 4 && renderTab4()}
                    {activeTab === 5 && renderTab5()}
                    {activeTab === 7 && renderTab6()}
                    {activeTab === 8 && renderTab7()}
                </div>
            </div>

            {/* History Modal */}
            {showHistory && patient && (
                <HistoryPanel
                    patientId={patient.id}
                    patientName={patientFullName}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
}

export default ConsultationPage;
