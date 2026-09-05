import { useState, useEffect, useRef } from 'react';
import { useNetworkSync, saveToIndexedDB, initIndexedDB } from '../../hooks/useNetworkSync';
import { useToast } from '../../components/feedback/Toast';
import { Icon } from '../../components/shared/Icon';
import { RELIGION_OPTIONS, type FieldErrors, type PatientRegistrationForm } from '../../types/patient';
import { calcAge, formatPhilhealth, philhealthDigits, toPatientRegistrationPayload, validatePatientRegistration } from '../../features/patients/validation';
import { createPatient } from '../../features/patients/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { clinicalInputClass, clinicalInputErrorClass, clinicalLabelClass } from '../../components/ui/ClinicalForm';
import { MALVAR_BARANGAYS } from '../../lib/utils/malvarBarangays';

// ─── Reusable Tailwind Classes ───────────────────────────────────────────────
const inputClasses = clinicalInputClass;
const inputErrorClasses = clinicalInputErrorClass;
const readOnlyInputClasses = "w-full border border-[var(--neutral-300)] rounded-lg px-3 py-2.5 text-sm text-left bg-[var(--neutral-100)] text-[var(--text-2)] font-semibold cursor-not-allowed select-none";
const labelClasses = clinicalLabelClass;
const fieldsetClasses = "overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-surface)]";
const legendClasses = "flex w-full items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)] sm:px-5 lg:px-6";

// ─── Types ────────────────────────────────────────────────────────────────────
type PatientForm = PatientRegistrationForm;

interface TemplatesComponentProps {
    /** BHW tablet/mobile uses the shared registration contract in a guided layout. */
    touchWizard?: boolean;
    /** BHW-only SPA return action; omitted for shared clinician registration routes. */
    onBackToHome?: () => void;
}

const EMPTY_FORM: PatientForm = {
    firstName: '', middleName: '', lastName: '', suffix: '',
    age: '', sex: '', civilStatus: '', birthday: '',
    nationality: '', bloodType: '', religion: '',
    birthPlace: '', address: '', contactNumber: '',
    educationalAttain: '', employmentStatus: '',
    philhealthNo: '', philhealthStatus: '',
    category: '', categoryOthers: '',
    relativeName: '', relativeRelation: '', relativeAddress: '',
    relativeContact: '', // Added field
};

// Added 'Unknown' option
const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'] as const;
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'] as const;
const EDUCATION_LEVELS = [
    'No Formal Education', 'Elementary Level', 'Elementary Graduate',
    'High School Level', 'High School Graduate', 'Vocational',
    'College Level', 'College Graduate', 'Post-Graduate'
] as const;
const EMPLOYMENT_STATUSES = ['Employed', 'Unemployed', 'Self-Employed', 'Student', 'Retired'] as const;

const OUTSIDE_MALVAR = '__outside__';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Address Field Component ──────────────────────────────────────────────────
function AddressField({ value, onChange }: { value: string; onChange: (val: string) => void; }) {
    const isKnownBarangay = MALVAR_BARANGAYS.includes(value as typeof MALVAR_BARANGAYS[number]);
    const isCustom = value !== '' && !isKnownBarangay;

    const [selectVal, setSelectVal] = useState<string>(
        isCustom ? OUTSIDE_MALVAR : (value || '')
    );

    const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setSelectVal(val);
        if (val === OUTSIDE_MALVAR) {
            onChange('');
        } else {
            onChange(val);
        }
    };

    return (
        <div className="flex flex-col gap-3 w-full">
            <select value={selectVal} onChange={handleSelect} required={selectVal !== OUTSIDE_MALVAR} className={inputClasses}>
                <option value="" disabled>Select barangay...</option>
                {MALVAR_BARANGAYS.map(b => (
                    <option key={b} value={b}>{b}</option>
                ))}
                <option value={OUTSIDE_MALVAR}>Outside Malvar / Type manually</option>
            </select>

            {selectVal === OUTSIDE_MALVAR && (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Enter full address..."
                    required
                    className={inputClasses}
                />
            )}
        </div>
    );
}

// ─── Radio Option Component (Modern Chips) ────────────────────────────────────
function RadioOption({ name, value, label, checked, onChange }: {
    name: string; value: string; label: string;
    checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
    return (
        <label className={`clinical-choice-label cursor-pointer px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all ${checked ? 'border-[var(--neutral-700)] bg-[var(--bg)] text-[var(--text-2)] ring-1 ring-[var(--neutral-700)]' : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:border-[var(--neutral-300)] hover:bg-[var(--bg)]'}`}>
            <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
            {label}
        </label>
    );
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="mt-1.5 text-xs text-[var(--coral-accent)] font-semibold flex items-center gap-1"><Icon name="alert-triangle" className="h-3.5 w-3.5 shrink-0" />{message}</p>;
}

// ─── Exported Pure Component ──────────────────────────────────────────────────
export function TemplatesComponent({ touchWizard = false, onBackToHome }: TemplatesComponentProps) {
    const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
    const [otherReligion, setOtherReligion] = useState('');
    const [saving, setSaving] = useState(false);
    // `disabled={saving}` only applies once React re-renders, and a state read inside the
    // handler sees the value from the render the click came from. Taps landing in the same
    // frame each inserted a patient, so the in-flight latch has to be a ref.
    const savingRef = useRef(false);
    const { showToast, ToastComponent } = useToast();
    const [errors, setErrors] = useState<FieldErrors>({});
    const [wizardStep, setWizardStep] = useState(1);
    const [isEmergencyContactExpanded, setIsEmergencyContactExpanded] = useState(false);
    const [isLeaveConfirmationVisible, setIsLeaveConfirmationVisible] = useState(false);
    const finalRegistrationIntentRef = useRef(false);
    const [isTouchViewport, setIsTouchViewport] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1439px)').matches
    );

    const { isOnline } = useNetworkSync();

    useEffect(() => {
        initIndexedDB('MediSensDB', 'offline_patients');
    }, []);

    useEffect(() => {
        if (!touchWizard) return;
        const media = window.matchMedia('(max-width: 1439px)');
        const updateViewport = () => setIsTouchViewport(media.matches);
        updateViewport();
        media.addEventListener('change', updateViewport);
        return () => media.removeEventListener('change', updateViewport);
    }, [touchWizard]);



    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setForm(f => ({ ...f, [id]: value }));
        if (id === 'religion' && value !== 'Other') setOtherReligion('');
        if (errors[id]) setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const handleOtherReligion = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^a-zA-Z\s\-',.]/g, '');
        setOtherReligion(value);
        setForm(f => ({ ...f, religion: value ? `Other: ${value}` : 'Other' }));
        if (errors.religion) setErrors(prev => { const n = { ...prev }; delete n.religion; return n; });
    };

    // Updated to allow commas
    const handleTextOnly = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        const filtered = value.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿñÑ\s\-',.]/g, '');
        setForm(f => ({ ...f, [id]: filtered }));
        if (errors[id]) setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const handleBirthday = (e: React.ChangeEvent<HTMLInputElement>) => {
        const birthday = e.target.value;
        const age = calcAge(birthday);
        setForm(f => ({ ...f, birthday, age }));
        if (errors['birthday']) setErrors(prev => { const n = { ...prev }; delete n['birthday']; return n; });
    };

    // Generic phone handler for digits
    const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id } = e.target;
        const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
        setForm(f => ({ ...f, [id]: digits }));
        if (errors[id]) setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    // Auto-fill logic for Nationality
    const handleNationalityFocus = () => {
        if (!form.nationality) {
            setForm(f => ({ ...f, nationality: 'Filipino' }));
        }
    };

    const handlePhilhealth = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatPhilhealth(e.target.value);
        setForm(f => ({ ...f, philhealthNo: formatted }));
        if (errors['philhealthNo']) setErrors(prev => { const n = { ...prev }; delete n['philhealthNo']; return n; });
    };

    const handleRadio = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value, ...(name === 'category' && value === '4Ps' ? { categoryOthers: '' } : {}) }));
    };

    const validate = (): boolean => {
        const newErrors = validatePatientRegistration(form);
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const validateWizardStep = (step: number): boolean => {
        const fieldsByStep: Record<number, Array<keyof PatientForm>> = {
            1: ['lastName', 'firstName', 'birthday', 'age', 'sex', 'bloodType'],
            2: ['address', 'contactNumber', 'civilStatus', 'nationality', 'birthPlace', 'educationalAttain', 'employmentStatus', 'relativeName', 'relativeRelation', 'relativeAddress', 'relativeContact'],
            3: ['philhealthNo', 'philhealthStatus', 'category', 'categoryOthers'],
            4: [],
        };
        const requiredByStep: Record<number, Array<keyof PatientForm>> = {
            1: ['lastName', 'firstName', 'birthday', 'sex', 'bloodType'],
            2: ['address', 'civilStatus', 'nationality', 'educationalAttain', 'employmentStatus'],
            3: [],
            4: [],
        };
        const fields = fieldsByStep[step] ?? [];
        const validationErrors = validatePatientRegistration(form);
        const stepErrors: FieldErrors = {};

        fields.forEach(field => {
            if (validationErrors[field]) stepErrors[field] = validationErrors[field];
        });
        requiredByStep[step]?.forEach(field => {
            if (!form[field]?.trim()) stepErrors[field] = 'This field is required.';
        });

        setErrors(previous => {
            const next = { ...previous };
            fields.forEach(field => delete next[field]);
            return { ...next, ...stepErrors };
        });
        if (Object.keys(stepErrors).length > 0) {
            showToast('Please complete the highlighted fields before continuing.', true);
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (savingRef.current) return;
        if (!validate()) {
            showToast('Please fix the errors before saving.', true);
            return;
        }
        savingRef.current = true;
        setSaving(true);
        const payload = toPatientRegistrationPayload(form);
        try {
            if (isOnline) {
                await createPatient(payload);
                showToast('Patient registration recorded.', false);
            } else {
                await saveToIndexedDB('MediSensDB', 'offline_patients', { id: Date.now(), type: 'patient_registration', data: payload });
                showToast('Offline Mode: Record saved locally. Will sync when online.', false);
            }
            setForm(EMPTY_FORM);
            setErrors({});
            setWizardStep(1);
            setIsEmergencyContactExpanded(false);
            setIsLeaveConfirmationVisible(false);
        } catch (error) {
            logError('Failed to save patient registration', error);
            showToast(healthcareErrorMessage("save the patient record"), true);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const isTouchWizard = touchWizard && isTouchViewport;
    const requiredMark = <span aria-hidden="true" className="text-[var(--coral-accent)]"> *</span>;
    const reviewValue = (value: string) => value || 'Not provided';

    if (isTouchWizard) {
        const progressSteps = ['Basic Information', 'Personal Information', 'PhilHealth & Classification', 'Review & Confirm'];
        const goToNextStep = () => {
            finalRegistrationIntentRef.current = false;
            if (validateWizardStep(wizardStep)) setWizardStep(current => Math.min(4, current + 1));
        };
        const updateAddress = (value: string) => {
            setForm(current => ({ ...current, address: value }));
            if (errors.address) setErrors(previous => { const next = { ...previous }; delete next.address; return next; });
        };
        const reviewSection = (title: string, step: number, rows: Array<[string, string]>) => {
            if (title === 'Emergency Contact' && !hasEmergencyContact) return null;
            const sectionId = `review-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const withBloodType = title === 'Basic Information' ? [...rows, ['Blood type', form.bloodType] as [string, string]] : rows;
            const personalRows = title === 'Personal Information' ? withBloodType.filter(([label]) => label !== 'Blood type') : withBloodType;
            const addressRows = title === 'Personal Information' ? personalRows.slice(0, 2) : null;
            const backgroundRows = title === 'Personal Information' ? personalRows.slice(2) : null;
            const renderCard = (cardTitle: string, cardRows: Array<[string, string]>, suffix = '') => (
                <section className="bhw-wizard-review-section" aria-labelledby={`${sectionId}${suffix}`}>
                    <div className="bhw-wizard-review-heading">
                        <h3 id={`${sectionId}${suffix}`}>{cardTitle}</h3>
                    <button type="button" className="bhw-wizard-edit" onClick={() => { finalRegistrationIntentRef.current = false; setWizardStep(step); }} aria-label={`Edit ${title}`}>Edit</button>
                    </div>
                    <dl>{cardRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{reviewValue(value)}</dd></div>)}</dl>
                </section>
            );
            return addressRows && backgroundRows ? <>{renderCard('Address & Contact', addressRows, '-address')}{renderCard('Personal Background', backgroundRows, '-background')}</> : renderCard(title, withBloodType);
        };
        const hasEmergencyContact = Boolean(form.relativeName || form.relativeRelation || form.relativeContact || form.relativeAddress);
        const hasRegistrationData = Object.values(form).some(value => value.trim() !== '') || Boolean(otherReligion);
        const requestBackToHome = () => {
            if (!onBackToHome) return;
            if (hasRegistrationData) {
                setIsLeaveConfirmationVisible(true);
                return;
            }
            onBackToHome();
        };
        const handleWizardSubmit = (event: React.FormEvent) => {
            event.preventDefault();
            if (wizardStep !== 4 || !finalRegistrationIntentRef.current) {
                finalRegistrationIntentRef.current = false;
                return;
            }
            finalRegistrationIntentRef.current = false;
            void handleSubmit(event);
        };

        return (
            <div className="bhw-registration-wizard relative mx-auto w-full max-w-[58rem] px-0 pb-6">
                <ToastComponent />
                <div className="bhw-registration-subheader">
                    {onBackToHome && <button type="button" className="bhw-wizard-home-action" onClick={requestBackToHome}><Icon name="home" className="h-4 w-4" />Back to Home</button>}
                    <div className="bhw-registration-subheader-context"><strong>Register Patient</strong><span>Step {wizardStep} of 4</span></div>
                    {isLeaveConfirmationVisible && <div className="bhw-wizard-leave-confirmation" role="alert" aria-live="assertive"><p><strong>Leave registration?</strong> Your entered information has not been saved.</p><div><button type="button" className="bhw-wizard-back" onClick={() => setIsLeaveConfirmationVisible(false)}>Keep registering</button><button type="button" className="bhw-wizard-next" onClick={onBackToHome}>Leave and discard</button></div></div>}
                </div>

                <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-surface)] sm:mb-5 sm:p-5">
                    <p className="text-[length:var(--type-supporting-size)] leading-[var(--type-supporting-line)] text-[var(--text-secondary)]">Complete one section at a time. Your entries stay in place as you move between steps.</p>
                </div>

                <ol className="bhw-wizard-progress" aria-label={`Registration progress: step ${wizardStep} of 4`}>
                    {progressSteps.map((label, index) => {
                        const step = index + 1;
                        const state = step === wizardStep ? 'is-current' : step < wizardStep ? 'is-complete' : '';
                        return <li key={label} className={`bhw-wizard-progress-step ${state}`} aria-current={step === wizardStep ? 'step' : undefined}><span className="bhw-wizard-progress-marker">{step < wizardStep ? <Icon name="check" className="h-4 w-4" /> : step}</span><span className="bhw-wizard-progress-label">{label}</span></li>;
                    })}
                </ol>

                <form onSubmit={handleWizardSubmit} className="bhw-wizard-form">
                    {wizardStep === 1 && (
                        <fieldset className={fieldsetClasses}>
                            <div className={legendClasses}><span>1</span> Basic Information</div>
                            <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 sm:p-5">
                                <div><label className={labelClasses}>Last Name{requiredMark}</label><input id="lastName" value={form.lastName} onChange={handleTextOnly} className={errors.lastName ? inputErrorClasses : inputClasses} placeholder="Dela Cruz" required /><FieldError message={errors.lastName} /></div>
                                <div><label className={labelClasses}>First Name{requiredMark}</label><input id="firstName" value={form.firstName} onChange={handleTextOnly} className={errors.firstName ? inputErrorClasses : inputClasses} placeholder="Juan" required /><FieldError message={errors.firstName} /></div>
                                <div><label className={labelClasses}>Middle Name</label><input id="middleName" value={form.middleName} onChange={handleTextOnly} className={inputClasses} placeholder="Santos" /></div>
                                <div><label className={labelClasses}>Suffix</label><input id="suffix" value={form.suffix} onChange={handleTextOnly} className={inputClasses} placeholder="Jr." /></div>
                                <div><label className={labelClasses}>Birthday{requiredMark}</label><input type="date" id="birthday" value={form.birthday} onChange={handleBirthday} className={errors.birthday ? inputErrorClasses : inputClasses} max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} required /><FieldError message={errors.birthday} /></div>
                                <div><label className={labelClasses}>Age <span className="font-normal text-[var(--text-3)]">(auto)</span></label><input id="age" value={form.age} readOnly className={readOnlyInputClasses} placeholder="Birthday" tabIndex={-1} /><FieldError message={errors.age} /></div>
                                <div><label className={labelClasses}>Blood Type{requiredMark}</label><select id="bloodType" value={form.bloodType} onChange={handleChange} className={inputClasses} required><option value="" disabled>Select blood type</option>{BLOOD_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select><FieldError message={errors.bloodType} /></div>
                                <div className="sm:col-span-2"><label className={labelClasses}>Sex{requiredMark}</label><div className="bhw-wizard-choice-grid" role="radiogroup" aria-label="Sex">{['Male', 'Female'].map(value => <RadioOption key={value} name="sex" value={value} label={value} checked={form.sex === value} onChange={handleRadio} />)}</div><FieldError message={errors.sex} /></div>
                            </div>
                        </fieldset>
                    )}

                    {wizardStep === 2 && (
                        <fieldset className={fieldsetClasses}>
                            <div className={legendClasses}><span>2</span> Personal Information</div>
                            <div className="bhw-wizard-step-groups">
                                <section className="bhw-wizard-field-group" aria-labelledby="bhw-address-contact-heading"><div className="bhw-wizard-field-group-heading"><h3 id="bhw-address-contact-heading">Address &amp; Contact</h3></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><label className={labelClasses}>Address / Barangay{requiredMark}</label><AddressField value={form.address} onChange={updateAddress} /><FieldError message={errors.address} /></div><div><label className={labelClasses}>Contact Number <span className="font-normal text-[var(--text-3)]">(11 digits)</span></label><input id="contactNumber" value={form.contactNumber} onChange={handlePhone} inputMode="numeric" className={errors.contactNumber ? inputErrorClasses : inputClasses} placeholder="09XXXXXXXXX" maxLength={11} /><FieldError message={errors.contactNumber} /></div></div></section>
                                <section className="bhw-wizard-field-group" aria-labelledby="bhw-personal-background-heading"><div className="bhw-wizard-field-group-heading"><h3 id="bhw-personal-background-heading">Personal Background</h3></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><div><label className={labelClasses}>Civil Status{requiredMark}</label><select id="civilStatus" value={form.civilStatus} onChange={handleChange} className={inputClasses} required><option value="" disabled>Select</option>{CIVIL_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div><label className={labelClasses}>Nationality{requiredMark}</label><input id="nationality" value={form.nationality} onChange={handleTextOnly} onFocus={handleNationalityFocus} className={inputClasses} placeholder="Filipino" required /><FieldError message={errors.nationality} /></div><div><label className={labelClasses}>Religion</label><select id="religion" value={form.religion.startsWith('Other:') ? 'Other' : form.religion} onChange={handleChange} className={inputClasses}><option value="">Select religion</option>{RELIGION_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}</select>{(form.religion === 'Other' || form.religion.startsWith('Other:')) && <input value={otherReligion || form.religion.replace(/^Other:\s*/, '')} onChange={handleOtherReligion} className={`${inputClasses} mt-2`} placeholder="Enter religion" />}</div><div><label className={labelClasses}>Birth Place</label><input id="birthPlace" value={form.birthPlace} onChange={handleTextOnly} className={inputClasses} placeholder="Malvar, Batangas" /></div><div><label className={labelClasses}>Educational Attainment{requiredMark}</label><select id="educationalAttain" value={form.educationalAttain} onChange={handleChange} className={inputClasses} required><option value="" disabled>Select</option>{EDUCATION_LEVELS.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div><label className={labelClasses}>Employment Status{requiredMark}</label><select id="employmentStatus" value={form.employmentStatus} onChange={handleChange} className={inputClasses} required><option value="" disabled>Select</option>{EMPLOYMENT_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></div></div></section>
                                <section className="bhw-wizard-field-group bhw-wizard-emergency-group" aria-labelledby="bhw-emergency-contact-heading"><button type="button" className="bhw-wizard-disclosure" onClick={() => setIsEmergencyContactExpanded(current => !current)} aria-expanded={isEmergencyContactExpanded}><span><strong id="bhw-emergency-contact-heading">Emergency Contact</strong><small>Optional — add a contact person if one is available.</small></span><Icon name="chevron-right" className={`h-5 w-5 ${isEmergencyContactExpanded ? 'rotate-90' : ''}`} /></button>{isEmergencyContactExpanded && <div className="grid grid-cols-1 gap-5 border-t border-[var(--border)] p-4 sm:grid-cols-2 sm:p-5"><div><label className={labelClasses}>Relative's Name</label><input id="relativeName" value={form.relativeName} onChange={handleTextOnly} className={inputClasses} placeholder="Full name" /></div><div><label className={labelClasses}>Relationship</label><input id="relativeRelation" value={form.relativeRelation} onChange={handleTextOnly} className={inputClasses} placeholder="e.g. Spouse" /></div><div><label className={labelClasses}>Contact Number</label><input id="relativeContact" value={form.relativeContact} onChange={handlePhone} inputMode="numeric" className={errors.relativeContact ? inputErrorClasses : inputClasses} placeholder="09XXXXXXXXX" maxLength={11} /><FieldError message={errors.relativeContact} /></div><div><label className={labelClasses}>Relative's Address</label><input id="relativeAddress" value={form.relativeAddress} onChange={handleChange} className={inputClasses} placeholder="Address" /></div></div>}</section>
                            </div>
                        </fieldset>
                    )}

                    {wizardStep === 3 && (
                        <fieldset className={fieldsetClasses}>
                            <div className={legendClasses}><span>3</span> PhilHealth &amp; Classification</div>
                            <div className="grid grid-cols-1 gap-6 p-4 sm:p-5">
                                <div><label className={labelClasses}>PhilHealth Number <span className="font-normal text-[var(--text-3)]">(XX-XXXXXXXXX-X)</span></label><input id="philhealthNo" value={form.philhealthNo} onChange={handlePhilhealth} inputMode="numeric" className={errors.philhealthNo ? inputErrorClasses : inputClasses} placeholder="XX-XXXXXXXXX-X" maxLength={14} /><FieldError message={errors.philhealthNo} /><p className="mt-1 text-xs font-semibold text-[var(--text-3)]">{philhealthDigits(form.philhealthNo).length}/12 digits</p></div>
                                <div><label className={labelClasses}>Category</label><div className="bhw-wizard-choice-grid" role="radiogroup" aria-label="PhilHealth category">{['Member', 'Dependent', '4Ps', 'None'].map(value => <RadioOption key={value} name="philhealthStatus" value={value} label={value} checked={form.philhealthStatus === value} onChange={handleRadio} />)}</div></div>
                                <div><label className={labelClasses}>Classification</label><div className="bhw-wizard-choice-grid" role="radiogroup" aria-label="Patient classification">{['4Ps', 'Other/s'].map(value => <RadioOption key={value} name="category" value={value} label={value} checked={form.category === value} onChange={handleRadio} />)}</div>{form.category === 'Other/s' && <div className="mt-3"><label className={labelClasses}>Please specify{requiredMark}</label><input id="categoryOthers" value={form.categoryOthers} onChange={handleChange} className={errors.categoryOthers ? inputErrorClasses : inputClasses} placeholder="Please specify" required /><FieldError message={errors.categoryOthers} /></div>}</div>
                            </div>
                        </fieldset>
                    )}

                    {wizardStep === 4 && <div className="flex flex-col gap-4">{reviewSection('Basic Information', 1, [['Name', [form.firstName, form.middleName, form.lastName, form.suffix].filter(Boolean).join(' ')], ['Birthday / Age', `${reviewValue(form.birthday)}${form.age ? ` · ${form.age} years old` : ''}`], ['Sex', form.sex]])}{reviewSection('Personal Information', 2, [['Address', form.address], ['Contact number', form.contactNumber], ['Civil status', form.civilStatus], ['Nationality', form.nationality], ['Religion', form.religion], ['Birth place', form.birthPlace], ['Educational attainment', form.educationalAttain], ['Employment status', form.employmentStatus], ['Blood type', form.bloodType]])}{reviewSection('Emergency Contact', 2, [["Relative's name", form.relativeName], ['Relationship', form.relativeRelation], ['Contact number', form.relativeContact], ["Relative's address", form.relativeAddress]])}{reviewSection('PhilHealth & Classification', 3, [['PhilHealth number', form.philhealthNo], ['Category', form.philhealthStatus], ['Classification', form.category === 'Other/s' ? `Other/s — ${form.categoryOthers}` : form.category]])}<div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-medium leading-6 text-[var(--text)]"><div className="flex gap-3"><Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-2)]" /><p>Personal and health data are collected and processed only for authorized RHU healthcare purposes in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).</p></div></div></div>}

                    <div className="bhw-wizard-actions">
                        {wizardStep > 1 && <button type="button" className="bhw-wizard-back" onClick={() => { finalRegistrationIntentRef.current = false; setWizardStep(current => Math.max(1, current - 1)); }}><Icon name="chevron-right" className="h-4 w-4 rotate-180" />Back</button>}
                        {wizardStep < 4 ? <button type="button" className="bhw-wizard-next" onClick={goToNextStep}>Continue<Icon name="chevron-right" className="h-4 w-4" /></button> : <button type="submit" disabled={saving} className="bhw-wizard-next bhw-wizard-submit" onClick={() => { finalRegistrationIntentRef.current = true; }}>{saving ? 'Registering Patient...' : <><Icon name="save" className="h-4 w-4" />Register Patient</>}</button>}
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="relative mx-auto w-full max-w-[72rem] px-3 pb-12 sm:px-5 lg:px-6">
            <ToastComponent />

            <div className="mb-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-surface)] sm:mb-6 sm:p-5 lg:p-6">
                <div>
                    <h2 className="flex items-center gap-2 text-[length:var(--type-page-title-size)] font-bold leading-[var(--type-page-title-line)] text-[var(--text)]">
                        Patient Registration
                    </h2>
                    <p className="mt-1.5 text-[length:var(--type-supporting-size)] leading-[var(--type-supporting-line)] text-[var(--text-secondary)]">Register a new patient into the system for initial triage.</p>
                </div>
            </div>

            <div className="w-full">
                <form onSubmit={handleSubmit} className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}>
                            <span className="text-[var(--text-2)]">①</span> Patient's Information Record
                        </div>
                        <div className="p-4 sm:p-5 lg:p-6">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-6">
                                <div>
                                    <label className={labelClasses}>Last Name</label>
                                    <input
                                        type="text" id="lastName" value={form.lastName}
                                        onChange={handleTextOnly}
                                        className={errors['lastName'] ? inputErrorClasses : inputClasses}
                                        placeholder="Dela Cruz" required
                                    />
                                    <FieldError message={errors['lastName']} />
                                </div>
                                <div>
                                    <label className={labelClasses}>First Name</label>
                                    <input
                                        type="text" id="firstName" value={form.firstName}
                                        onChange={handleTextOnly}
                                        className={errors['firstName'] ? inputErrorClasses : inputClasses}
                                        placeholder="Juan" required
                                    />
                                    <FieldError message={errors['firstName']} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Middle Name</label>
                                    <input
                                        type="text" id="middleName" value={form.middleName}
                                        onChange={handleTextOnly}
                                        className={inputClasses}
                                        placeholder="Santos"
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Suffix</label>
                                    <input
                                        type="text" id="suffix" value={form.suffix}
                                        onChange={handleTextOnly}
                                        className={inputClasses}
                                        placeholder="Jr."
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Birthday</label>
                                    <input
                                        type="date" id="birthday" value={form.birthday}
                                        onChange={handleBirthday}
                                        className={errors['birthday'] ? inputErrorClasses : inputClasses}
                                        max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}
                                        required
                                    />
                                    <FieldError message={errors['birthday']} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Age <span className="text-[var(--text-3)] font-normal normal-case tracking-normal">(auto)</span></label>
                                    <input
                                        type="text" id="age" value={form.age}
                                        readOnly
                                        className={readOnlyInputClasses}
                                        placeholder="Birthday"
                                        tabIndex={-1}
                                    />
                                    <FieldError message={errors['age']} />
                                </div>
                                <div>
                                    <fieldset>
                                        <legend className={labelClasses}>Sex</legend>
                                        <div className="grid min-h-11 w-full max-w-sm grid-cols-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-1" role="radiogroup">
                                            {['Male', 'Female'].map(value => {
                                                const checked = form.sex === value;
                                                return (
                                                    <label key={value} className="relative min-w-0 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="sex"
                                                            value={value}
                                                            checked={checked}
                                                            onChange={handleRadio}
                                                            className="peer sr-only"
                                                            required
                                                        />
                                                        <span className={`flex min-h-11 items-center justify-center rounded-[calc(var(--radius-control)-0.25rem)] px-3 text-sm font-semibold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-color)] ${checked ? 'bg-[var(--surface)] text-[var(--brand-active)] shadow-sm ring-1 ring-[var(--border)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text)]'}`}>
                                                            {value}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </fieldset>
                                </div>
                                <div>
                                    <label className={labelClasses}>Civil Status</label>
                                    <select id="civilStatus" value={form.civilStatus} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select</option>
                                        {CIVIL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Address (Brgy, Malvar)</label>
                                    <AddressField value={form.address} onChange={(val) => setForm(f => ({ ...f, address: val }))} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Contact # <span className="text-[var(--text-3)] font-normal normal-case tracking-normal">(11 digits)</span></label>
                                    <input
                                        type="text" id="contactNumber" value={form.contactNumber}
                                        onChange={handlePhone}
                                        inputMode="numeric"
                                        className={errors['contactNumber'] ? inputErrorClasses : inputClasses}
                                        placeholder="09XXXXXXXXX"
                                        maxLength={11}
                                    />
                                    <div className="flex items-center justify-between mt-1">
                                        <FieldError message={errors['contactNumber']} />
                                        <span className={`text-xs ml-auto font-semibold ${form.contactNumber.length === 11 ? 'text-[var(--green-accent)]' : 'text-[var(--text-3)]'}`}>
                                            {form.contactNumber.length}/11
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClasses}>Nationality</label>
                                    <input
                                        type="text" id="nationality" value={form.nationality}
                                        onChange={handleTextOnly}
                                        onFocus={handleNationalityFocus}
                                        className={errors['nationality'] ? inputErrorClasses : inputClasses}
                                        placeholder="Filipino" required
                                    />
                                    <FieldError message={errors['nationality']} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Religion</label>
                                    <select
                                        id="religion"
                                        value={form.religion.startsWith('Other:') ? 'Other' : form.religion}
                                        onChange={handleChange}
                                        className={inputClasses}
                                    >
                                        <option value="">Select religion</option>
                                        {RELIGION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                    {(form.religion === 'Other' || form.religion.startsWith('Other:')) && (
                                        <input
                                            type="text"
                                            value={otherReligion || (form.religion.startsWith('Other:') ? form.religion.replace(/^Other:\s*/, '') : '')}
                                            onChange={handleOtherReligion}
                                            className={`${inputClasses} mt-2`}
                                            placeholder="Enter religion"
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className={labelClasses}>Birth Place</label>
                                    <input
                                        type="text" id="birthPlace" value={form.birthPlace}
                                        onChange={handleTextOnly}
                                        className={errors['birthPlace'] ? inputErrorClasses : inputClasses}
                                        placeholder="Malvar, Batangas"
                                    />
                                    <FieldError message={errors['birthPlace']} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Educational Attainment</label>
                                    <select id="educationalAttain" value={form.educationalAttain} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select</option>
                                        {EDUCATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClasses}>Employment Status</label>
                                    <select id="employmentStatus" value={form.employmentStatus} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select</option>
                                        {EMPLOYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClasses}>Blood Type</label>
                                    <select id="bloodType" value={form.bloodType} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select Blood Type</option>
                                        {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}>
                            <span className="text-[var(--text-2)]">②</span> PhilHealth & Categorization
                        </div>
                        <div className="p-4 sm:p-5 lg:p-6">
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div>
                                    <label className={labelClasses}>PhilHealth No. <span className="text-[var(--text-3)] font-normal normal-case tracking-normal">(XX-XXXXXXXXX-X)</span></label>
                                    <input
                                        type="text" id="philhealthNo" value={form.philhealthNo}
                                        onChange={handlePhilhealth}
                                        inputMode="numeric"
                                        className={errors['philhealthNo'] ? inputErrorClasses : inputClasses}
                                        placeholder="XX-XXXXXXXXX-X"
                                        maxLength={14}
                                    />
                                    <div className="flex items-center justify-between mt-1">
                                        <FieldError message={errors['philhealthNo']} />
                                        <span className={`text-xs ml-auto font-semibold ${philhealthDigits(form.philhealthNo).length === 12 ? 'text-[var(--green-accent)]' : 'text-[var(--text-3)]'}`}>
                                            {philhealthDigits(form.philhealthNo).length}/12 digits
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClasses}>Category</label>
                                    <div className="flex flex-wrap gap-3">
                                        {['Member', 'Dependent', '4Ps', 'None'].map(v => (
                                            <RadioOption key={v} name="philhealthStatus" value={v} label={v} checked={form.philhealthStatus === v} onChange={handleRadio} />
                                        ))}
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <label className={labelClasses}>Classification</label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <RadioOption name="category" value="4Ps" label="4Ps" checked={form.category === '4Ps'} onChange={handleRadio} />
                                        <RadioOption name="category" value="Other/s" label="Other/s" checked={form.category === 'Other/s'} onChange={handleRadio} />
                                        {form.category === 'Other/s' && (
                                            <input
                                                type="text" id="categoryOthers" value={form.categoryOthers}
                                                onChange={handleChange}
                                                className={`${inputClasses} w-auto min-w-[200px]`}
                                                placeholder="Please specify" required
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}>
                            <span className="text-[var(--text-2)]">③</span> Emergency Contact
                        </div>
                        <div className="p-4 sm:p-5 lg:p-6">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-6">
                                <div>
                                    <label className={labelClasses}>Relative's Name</label>
                                    <input
                                        type="text" id="relativeName" value={form.relativeName}
                                        onChange={handleTextOnly}
                                        className={inputClasses}
                                        placeholder="Full Name"
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Relationship</label>
                                    <input
                                        type="text" id="relativeRelation" value={form.relativeRelation}
                                        onChange={handleTextOnly}
                                        className={inputClasses}
                                        placeholder="e.g. Spouse"
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Contact Number</label>
                                    <input
                                        type="text" id="relativeContact" value={form.relativeContact}
                                        onChange={handlePhone}
                                        className={inputClasses}
                                        placeholder="09XXXXXXXXX"
                                        maxLength={11}
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Relative's Address</label>
                                    <input
                                        type="text" id="relativeAddress" value={form.relativeAddress}
                                        onChange={handleChange}
                                        className={inputClasses}
                                        placeholder="Address"
                                    />
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-medium leading-6 text-[var(--text)] sm:px-5">
                        <div className="flex gap-3">
                            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-2)]" />
                            <p>
                                Personal and health data are collected and processed only for authorized RHU healthcare purposes in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 border-t border-[var(--border)] pt-5 sm:pt-6">
                        <button
                            type="submit"
                            disabled={saving}
                            className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-semibold text-white shadow-sm text-sm transition-colors ${saving ? 'bg-[var(--neutral-400)] cursor-not-allowed shadow-none' : 'bg-[var(--neutral-700)] hover:bg-[var(--neutral-800)]'}`}
                        >
                            {saving ? 'Registering Patient...' : <><Icon name="save" className="inline h-4 w-4 mr-2" />Register Patient</>}
                        </button>
                    </div>
                </form>


            </div>
        </div>
    );
}
