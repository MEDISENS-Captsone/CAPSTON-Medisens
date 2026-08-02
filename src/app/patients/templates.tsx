import { useState, useEffect } from 'react';
import { useNetworkSync, saveToIndexedDB, initIndexedDB } from '../../hooks/useNetworkSync';
import { useToast } from '../../components/feedback/Toast';
import { Icon } from '../../components/shared/Icon';
import { RELIGION_OPTIONS, type FieldErrors, type PatientRegistrationForm } from '../../types/patient';
import { calcAge, formatPhilhealth, philhealthDigits, toPatientRegistrationPayload, validatePatientRegistration } from '../../features/patients/validation';
import { createPatient } from '../../features/patients/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { clinicalInputClass, clinicalInputErrorClass, clinicalLabelClass } from '../../components/ui/ClinicalForm';

// ─── Reusable Tailwind Classes ───────────────────────────────────────────────
const inputClasses = clinicalInputClass;
const inputErrorClasses = clinicalInputErrorClass;
const readOnlyInputClasses = "w-full border border-[var(--neutral-300)] rounded-lg px-3 py-2.5 text-sm text-left bg-[var(--neutral-100)] text-[var(--text-2)] font-semibold cursor-not-allowed select-none";
const labelClasses = clinicalLabelClass;
const fieldsetClasses = "bg-white rounded-lg shadow-sm border border-[var(--border)] mb-4 overflow-hidden";
const legendClasses = "w-full px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] uppercase tracking-wide bg-[var(--neutral-50-70)] flex items-center gap-2";

// ─── Types ────────────────────────────────────────────────────────────────────
type PatientForm = PatientRegistrationForm;

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

// ─── Malvar Barangays ─────────────────────────────────────────────────────────
const MALVAR_BARANGAYS = [
    'Bagong Pook, Malvar, Batangas', 'Bilucao, Malvar, Batangas',
    'Bulihan, Malvar, Batangas', 'Luta del Norte, Malvar, Batangas',
    'Luta del Sur, Malvar, Batangas', 'Poblacion, Malvar, Batangas',
    'San Andres, Malvar, Batangas', 'San Fernando, Malvar, Batangas',
    'San Gregorio, Malvar, Batangas', 'San Isidro, Malvar, Batangas',
    'San Juan, Malvar, Batangas', 'San Pedro I, Malvar, Batangas',
    'San Pedro II, Malvar, Batangas', 'San Pioquinto, Malvar, Batangas',
    'Santiago, Malvar, Batangas',
] as const;

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
export function TemplatesComponent() {
    const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
    const [otherReligion, setOtherReligion] = useState('');
    const [saving, setSaving] = useState(false);
    const { showToast, ToastComponent } = useToast();
    const [errors, setErrors] = useState<FieldErrors>({});

    const { isOnline } = useNetworkSync();

    useEffect(() => {
        initIndexedDB('MediSensDB', 'offline_patients');
    }, []);



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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) {
            showToast('Please fix the errors before saving.', true);
            return;
        }
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
        } catch (error) {
            logError('Failed to save patient registration', error);
            showToast(healthcareErrorMessage("save the patient record"), true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full relative">
            <ToastComponent />

            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-extrabold text-[var(--text)] flex items-center gap-2">
                        Patient Registration
                    </h2>
                    <p className="text-sm text-[var(--text-3)] mt-1">Register a new patient into the system for initial triage.</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <form onSubmit={handleSubmit} className="flex-1 w-full min-w-0">
                    <fieldset className={fieldsetClasses}>
                        <div className={legendClasses}>
                            <span className="text-[var(--text-2)]">①</span> Patient's Information Record
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
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
                                    <label className={labelClasses}>Sex</label>
                                    <select id="sex" value={form.sex} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClasses}>Civil Status</label>
                                    <select id="civilStatus" value={form.civilStatus} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select</option>
                                        {CIVIL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-1 sm:col-span-2 md:col-span-4">
                                    <label className={labelClasses}>Address (Brgy, Malvar)</label>
                                    <AddressField value={form.address} onChange={(val) => setForm(f => ({ ...f, address: val }))} />
                                </div>
                                <div className="col-span-1 sm:col-span-2">
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
                                <div className="col-span-1 sm:col-span-2">
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
                                <div className="col-span-1 sm:col-span-2">
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
                                <div className="col-span-1 sm:col-span-2">
                                    <label className={labelClasses}>Birth Place</label>
                                    <input
                                        type="text" id="birthPlace" value={form.birthPlace}
                                        onChange={handleTextOnly}
                                        className={errors['birthPlace'] ? inputErrorClasses : inputClasses}
                                        placeholder="Malvar, Batangas"
                                    />
                                    <FieldError message={errors['birthPlace']} />
                                </div>
                                <div className="col-span-1 sm:col-span-2">
                                    <label className={labelClasses}>Educational Attainment</label>
                                    <select id="educationalAttain" value={form.educationalAttain} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select</option>
                                        {EDUCATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-1 sm:col-span-2">
                                    <label className={labelClasses}>Employment Status</label>
                                    <select id="employmentStatus" value={form.employmentStatus} onChange={handleChange} className={inputClasses} required>
                                        <option value="" disabled>Select</option>
                                        {EMPLOYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-1 sm:col-span-2">
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
                            <span className="text-pink-600">②</span> PhilHealth & Categorization
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <span className="text-green-600">③</span> Emergency Contact
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
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

                    <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--neutral-50-70)] px-4 py-3 text-sm font-medium leading-6 text-[var(--text)]">
                        <div className="flex gap-3">
                            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-2)]" />
                            <p>
                                Personal and health data are collected and processed only for authorized RHU healthcare purposes in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-4 mb-12 border-t border-[var(--border)] pt-6">
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
