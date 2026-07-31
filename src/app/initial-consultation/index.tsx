import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useToast } from '../../components/feedback/Toast';
import { saveInitialConsultationWithVitals } from '../../features/consultation/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { safeTrim, toNumberOrNull as parseNumberOrNull } from '../../lib/utils/strings';
import { Icon } from '../../components/shared/Icon';
import { clinicalInputClass, clinicalLabelClass } from '../../components/ui/ClinicalForm';

// Shared clinical form classes
const inputClasses = clinicalInputClass;
const labelClasses = clinicalLabelClass;
const fieldsetClasses = "bg-white rounded-lg shadow-sm border border-[var(--border)] mb-4 overflow-hidden";
// Full section headings stay sentence case; uppercase is reserved for small field labels.
const legendClasses = "w-full px-4 py-3 border-b border-[var(--border)] text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)] bg-[var(--surface-subtle)] flex items-center gap-2";

// ─── Types ────────────────────────────────────────────────────────────────────
interface InitialConsultationData {
    dateOfConsultation: string; consultationTime: string; referredBy: string;
    modeOfTransaction: string; modeOfTransfer: string; chiefComplaints: string;
    diagnosis: string; diagnosisOther: string; historyOfPresentIllness: string;
    bp: string; hr: string; rr: string; temp: string; weight: string; height: string;
    o2Sat: string; muac: string; nutritionalStatus: string; bmi: string;
    visualAcuityLeft: string; visualAcuityRight: string; bloodType: string;
    generalSurvey: string;
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
    o2Sat: '', muac: '', nutritionalStatus: '', bmi: '',
    visualAcuityLeft: '', visualAcuityRight: '', bloodType: '', generalSurvey: '',
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
    { label: 'MUAC',             name: 'muac',             type: 'text',   allowedPattern: /^[\d.]*$/ },
    { label: 'Nutrition Status', name: 'nutritionalStatus', type: 'text',  readOnly: true },
    { label: 'Vis. Acuity (L)', name: 'visualAcuityLeft',  type: 'text',  placeholder: '20/20', allowedPattern: /^[\d/]*$/ },
    { label: 'Vis. Acuity (R)', name: 'visualAcuityRight', type: 'text',  placeholder: '20/20', allowedPattern: /^[\d/]*$/ },
    { label: 'Blood Type',       name: 'bloodType',        type: 'text',  placeholder: 'O+', readOnly: true },
];

const toNumberOrNull = (val: unknown) => parseNumberOrNull(val);
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

    // New states for Patient Search
    const [searchQuery, setSearchQuery] = useState('');
    const [consentedPatients, setConsentedPatients] = useState<any[]>([]);

    const { showToast, ToastComponent } = useToast();
    const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                    id, firstName, middleName, lastName, age, sex, bloodType,
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



    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectPatient = (id: string) => {
        window.history.pushState({}, '', `?id=${id}`);
        loadPatientDetails(id);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPatientId) {
            showToast('Select a patient before recording the initial intake.', true);
            return;
        }

        setIsSubmitting(true);
        try {
            const resolvedDiagnosis = formData.diagnosis === 'Others' ? (safeTrim(formData.diagnosisOther) || 'Others') : formData.diagnosis;

            await saveInitialConsultationWithVitals({
                patient_id: currentPatientId,
                consultation_date: formData.dateOfConsultation || null,
                consultation_time: formData.consultationTime || null,
                mode_of_transaction: formData.modeOfTransaction || null,
                referred_by: formData.referredBy || null,
                mode_of_transfer: formData.modeOfTransfer || null,
                chief_complaint: formData.chiefComplaints || null,
                diagnosis: resolvedDiagnosis || null,
            }, {
                patient_id: currentPatientId,
                bp: formData.bp || null,
                heart_rate: toNumberOrNull(formData.hr),
                respiratory_rate: toNumberOrNull(formData.rr),
                temperature: toNumberOrNull(formData.temp),
                o2_saturation: toNumberOrNull(formData.o2Sat),
                weight: toNumberOrNull(formData.weight),
                height: toNumberOrNull(formData.height),
                muac: toNumberOrNull(formData.muac),
                nutritional_status: formData.nutritionalStatus || null,
                bmi: toNumberOrNull(formData.bmi),
                visual_acuity_left: formData.visualAcuityLeft || null,
                visual_acuity_right: formData.visualAcuityRight || null,
                general_survey: formData.generalSurvey || null,
            });

            showToast('Initial intake recorded.', false);
            // Reset form but keep blood type and refresh date/time for next entry
            setFormData({ ...makeEmptyForm(), bloodType: formData.bloodType });

            redirectTimerRef.current = setTimeout(() => {
                window.location.href = '/pages/nurse.html';
            }, 1500);
        } catch (err) {
            logError('Failed to save initial consultation', err);
            showToast(healthcareErrorMessage("save the initial consultation"), true);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredPatients = consentedPatients.filter(p =>
        `${p.firstName} ${p.middleName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-full relative pb-12">
            <ToastComponent />

            <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-[length:var(--type-page-title-size)] font-bold leading-[var(--type-page-title-line)] text-[var(--text)] flex items-center gap-2"><Icon name="clipboard" className="h-6 w-6" /> Initial Consultation</h1>
                    {patientInfo ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-2)]">
                            <span className="font-semibold text-[var(--text)] bg-[var(--surface-subtle)] border border-[var(--border)] px-3 py-1 rounded-md">{patientName}</span>
                            <span className="inline-flex items-center gap-1.5 bg-white border border-[var(--border)] px-3 py-1 rounded-md"><Icon name="user" className="h-3.5 w-3.5" /> {patientInfo.sex || 'N/A'}</span>
                            <span className="inline-flex items-center gap-1.5 bg-white border border-[var(--border)] px-3 py-1 rounded-md"><Icon name="calendar" className="h-3.5 w-3.5" /> {patientInfo.age ?? 'N/A'} yrs</span>
                            <span className="inline-flex items-center gap-1.5 bg-white border border-[var(--border)] px-3 py-1 rounded-md"><Icon name="droplet" className="h-3.5 w-3.5" /> {patientInfo.bloodType || 'N/A'}</span>
                        </div>
                    ) : (
                        <p className="text-sm text-[var(--text-secondary)] mt-2">Search and select a consented patient to begin.</p>
                    )}
                </div>

                {currentPatientId && (
                    <button onClick={() => { setCurrentPatientId(null); setPatientInfo(null); window.history.pushState({}, '', '?'); }} className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-[var(--border)] shadow-sm shrink-0 text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--surface-subtle)] transition-colors">
                        <Icon name="search" className="h-4 w-4" /> Search Another
                    </button>
                )}
            </div>

            {!currentPatientId ? (
                <div className="w-full pwa-dense-panel">
                    <div className="w-full">
                        <div className="relative mb-6">
                            <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-muted)]" />
                            <input 
                                type="text" 
                                placeholder="Search consented patients by name..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-color)] bg-white text-[var(--text)] font-medium"
                                autoFocus
                            />
                        </div>

                        <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1 sm:pr-2 scrollbar-thin">
                            {filteredPatients.length === 0 ? (
                                <div className="text-center py-8 text-[var(--text-secondary)] font-medium bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)]">No consented patients found.</div>
                            ) : (
                                filteredPatients.map(p => (
                                    <div 
                                        key={p.id}
                                        onClick={() => handleSelectPatient(p.id)}
                                        className="grid grid-cols-[3rem_minmax(0,1fr)_2.25rem] items-center gap-4 p-4 bg-white hover:bg-[var(--surface-subtle)] border border-[var(--border)] hover:border-[var(--border)] rounded-lg cursor-pointer transition-colors shadow-sm group"
                                    >
                                        <div className="w-12 h-12 rounded-md bg-[var(--surface-subtle)] text-[var(--text-2)] flex items-center justify-center font-semibold text-lg shrink-0 group-hover:bg-[var(--brand-active)] group-hover:text-white transition-colors">
                                            {(p.firstName?.[0] || '').toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-semibold text-[var(--text)] truncate">{p.lastName}, {p.firstName} {p.middleName || ''}</div>
                                            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] sm:grid-cols-[minmax(4.5rem,0.8fr)_minmax(4.5rem,0.8fr)_minmax(5rem,1fr)]">
                                                <span className="inline-flex min-w-0 items-center gap-1.5"><Icon name="user" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{p.sex || '—'}</span></span>
                                                <span className="inline-flex min-w-0 items-center gap-1.5"><Icon name="calendar" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{p.age ?? '—'} yrs</span></span>
                                                <span className="inline-flex min-w-0 items-center gap-1.5 col-span-2 sm:col-span-1"><Icon name="droplet" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{p.bloodType || '—'}</span></span>
                                            </div>
                                        </div>
                                        <span className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] group-hover:bg-[var(--surface-subtle)] group-hover:text-[var(--text-2)] group- transition-all">
                                            <Icon name="clipboard" className="h-4 w-4" />
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="w-full ">
                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}><span className="text-[var(--text-2)]">①</span> General Information</div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                                <div><label className={labelClasses}>Date of Consultation</label><input type="date" name="dateOfConsultation" value={formData.dateOfConsultation} onChange={handleChange} className={inputClasses} required /></div>
                                <div><label className={labelClasses}>Consultation Time</label><input type="time" name="consultationTime" value={formData.consultationTime} onChange={handleChange} className={inputClasses} /></div>
                                <div><label className={labelClasses}>Referred From / By</label><input type="text" name="referredBy" value={formData.referredBy} onChange={handleChange} className={inputClasses} placeholder="Name or Department" /></div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-6">
                                <div>
                                    <label className={labelClasses}>Mode of Transaction</label>
                                    <div className="flex flex-wrap gap-3 mt-2">
                                        {['Walk in', 'Referral'].map(v => (
                                            <label key={v} className={`clinical-choice-label cursor-pointer px-4 py-2.5 border rounded-lg text-sm font-semibold transition-colors ${formData.modeOfTransaction === v ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)]'}`}>
                                                <input type="radio" name="modeOfTransaction" value={v} onChange={handleRadioChange} checked={formData.modeOfTransaction === v} className="sr-only" />{v}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClasses}>Mode of Transfer</label>
                                    <div className="flex flex-wrap gap-3 mt-2">
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
                        <div className="p-6 flex flex-col gap-5">
                            <div>
                                <label className={labelClasses}>Chief Complaints</label>
                                <textarea name="chiefComplaints" value={formData.chiefComplaints} onChange={handleChange} rows={3} className={`${inputClasses} resize-y min-h-[80px]`} placeholder="Describe the patient's primary symptoms..."></textarea>
                            </div>
                            <div>
                                <label className={labelClasses}>Diagnosis</label>
                                <select name="diagnosis" value={formData.diagnosis} onChange={handleChange} className={inputClasses}>
                                    <option value="">Select a diagnosis</option>
                                    {DIAGNOSIS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                                {formData.diagnosis === 'Others' && (
                                    <div className="mt-3"><input type="text" name="diagnosisOther" value={formData.diagnosisOther} onChange={handleChange} className={inputClasses} placeholder="Please specify diagnosis..." autoFocus /></div>
                                )}
                            </div>
                            <div>
                                <label className={labelClasses}>History of Present Illnesses</label>
                                <textarea name="historyOfPresentIllness" value={formData.historyOfPresentIllness} onChange={handleChange} rows={3} className={`${inputClasses} resize-y min-h-[80px]`} placeholder="Relevant medical history leading up to today..."></textarea>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}><Icon name="heart-pulse" className="h-4 w-4 text-[var(--text-2)]" /> Physical Examination & Vital Signs</div>
                        <div className="p-6 bg-[var(--surface-subtle)]/10">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                {VITAL_FIELDS.map(f => (
                                    <div key={f.name} className="bg-white p-3 rounded-lg border border-[var(--border)] shadow-sm">
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">{f.label}</label>
                                        <input
                                            type={f.type} name={f.name} value={formData[f.name]} onChange={handleChange} readOnly={f.readOnly || false} step={f.step} placeholder={f.placeholder || ''}
                                            onKeyDown={f.type === 'number' ? (e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); } : undefined}
                                            onBeforeInput={f.allowedPattern ? (e: any) => { if (e.data && !f.allowedPattern!.test(e.data)) e.preventDefault(); } : undefined}
                                            onPaste={f.allowedPattern ? (e) => { const pasted = e.clipboardData.getData('text'); if (!f.allowedPattern!.test(pasted)) e.preventDefault(); } : undefined}
                                            className={`w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-color)] outline-none transition-colors ${f.readOnly ? 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-secondary)] font-semibold cursor-not-allowed shadow-none' : 'bg-white text-[var(--text)]'}`}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 pt-6 border-t border-[var(--border)]">
                                <label className={labelClasses}>General Survey Status</label>
                                <div className="flex flex-wrap gap-3 mt-3">
                                    {['Awake and Alert', 'Altered Sensorium'].map(v => (
                                        <label key={v} className={`clinical-choice-label cursor-pointer px-4 py-3 border rounded-lg text-sm font-semibold transition-colors ${formData.generalSurvey === v ? 'border-[var(--brand-primary)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-subtle)]'}`}>
                                            <input type="radio" name="generalSurvey" value={v} onChange={handleRadioChange} checked={formData.generalSurvey === v} className="sr-only" />{v}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <div className="flex flex-col sm:flex-row items-center justify-end gap-4 mt-6 mb-12 border-t border-[var(--border)] pt-6">
                        <button type="submit" disabled={isSubmitting} className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-semibold text-white shadow-sm text-sm transition-colors ${isSubmitting ? 'bg-[var(--text-muted)] cursor-not-allowed shadow-none' : 'bg-[var(--brand-active)] hover:bg-[var(--brand-active-hover)]'}`}>
                            {isSubmitting ? 'Recording Initial Intake...' : <><Icon name="save" className="inline h-4 w-4 mr-2" />Record Initial Intake</>}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
