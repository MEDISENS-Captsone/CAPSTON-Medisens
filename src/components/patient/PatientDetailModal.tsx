import React, { useState, useEffect } from 'react';
import { useToast } from '../feedback/Toast';
import { updatePatientRecord } from '../../features/patients/services';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { PatientTransactionHistory } from './PatientTransactionHistory';
import { saveVaccineRecord, fetchVaccineRecords, removeVaccineRecord } from '../../features/patients/vaccineService';
import type { VaccineRecord } from '../../features/patients/itemization';
import {
    OTHER_VACCINE_NAME,
    VACCINE_OPTIONS,
    cleanVaccineRecord,
    createVaccineRecord,
    getVaccineCategory,
    getVaccineDisplayName,
} from '../../features/vaccines/vaccineOptions';
import { Modal } from '../ui/Modal';
import { SkeletonList } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { RELIGION_OPTIONS } from '../../types/patient';
import { PatientChartIdentityHeader, PatientHistoryPanel } from './PatientChart';

export interface Patient {
    id: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    age: number | null;
    sex: string;
    bloodType: string;
    address: string;
    philhealthStatus?: string;
    category?: string;
    categoryOthers?: string;
    createdAt?: string;
    contactNumber?: string;
    birthday?: string;
    civilStatus?: string;
    nationality?: string;
    religion?: string;
    educationalAttain?: string;
    employmentStatus?: string;
    philhealthNo?: string;
    relativeName?: string;
    relativeRelation?: string;
    relativeAddress?: string;
    created_at?: string;
}

export interface InitialConsultation {
    initialconsultation_id: number;
    patient_id: number;
    consultation_date: string | null;
    consultation_time: string | null;
    mode_of_transaction: string | null;
    referred_by: string | null;
    mode_of_transfer: string | null;
    chief_complaint: string | null;
    diagnosis: string | null;
}

export interface Consultation {
    consultation_id: number;
    patient_id: number;
    chief_complaints: string | null;
    diagnosis: string | null;
    family_history: string | null;
    smoking_status: string | null;
    drinking_status: string | null;
    immunization_history: string | null;
    medication_treatment: string | null;
    past_med_surge_history: string | null;
}

interface PatientDetailModalProps {
    patient: Patient;
    onClose: () => void;
    onPatientUpdate?: (updatedPatient: Patient) => void;
    onConsult?: (patient: Patient) => void;
}

interface DetailItemProps {
    label: string;
    value?: string | number | null;
    name: keyof Patient;
    type?: "text" | "select" | "date" | "number";
    options?: readonly string[];
    isEditing: boolean;
    editForm: Patient;
    otherReligion: string;
    inputCls: string;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onOtherReligionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'] as const;
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'] as const;
const EDUCATION_LEVELS = [
    'No Formal Education', 'Elementary Level', 'Elementary Graduate',
    'High School Level', 'High School Graduate', 'Vocational',
    'College Level', 'College Graduate', 'Post-Graduate'
] as const;
const EMPLOYMENT_STATUSES = ['Employed', 'Unemployed', 'Self-Employed', 'Student', 'Retired'] as const;
const DIGITS_ONLY_PATTERN = '[0-9]*';
const NAME_TEXT_PATTERN = "[A-Za-z .'-]*";
const NUMERIC_ONLY_PATIENT_FIELDS = new Set<keyof Patient>(['age', 'contactNumber']);
const NAME_TEXT_PATIENT_FIELDS = new Set<keyof Patient>([
    'firstName',
    'middleName',
    'lastName',
    'nationality',
    'relativeName',
    'relativeRelation',
]);

function sanitizePatientEditValue(name: keyof Patient, value: string) {
    if (NUMERIC_ONLY_PATIENT_FIELDS.has(name)) return value.replace(/\D/g, '');
    if (NAME_TEXT_PATIENT_FIELDS.has(name)) return value.replace(/[^a-zA-Z\s'.-]/g, '');
    return value;
}

function getPatientInputProps(
    name: keyof Patient,
    type: DetailItemProps['type']
): Pick<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'pattern'> {
    if (NUMERIC_ONLY_PATIENT_FIELDS.has(name)) {
        return { type: 'text', inputMode: 'numeric' as const, pattern: DIGITS_ONLY_PATTERN };
    }
    if (NAME_TEXT_PATIENT_FIELDS.has(name)) {
        return { type: type || 'text', pattern: NAME_TEXT_PATTERN };
    }
    return { type: type || 'text' };
}

function DetailItem({
    label,
    value,
    name,
    type = "text",
    options,
    isEditing,
    editForm,
    otherReligion,
    inputCls,
    onInputChange,
    onOtherReligionChange,
}: DetailItemProps) {
    const isEmpty = value === null || value === undefined || value === '';
    const inputProps = getPatientInputProps(name, type);

    if (isEditing) {
        return (
            <div className="flex flex-col gap-1">
                <label className="clinical-field-label">{label}</label>
                {name === 'religion' ? (
                    <>
                        <select
                            name={name}
                            value={(editForm.religion || '').startsWith('Other:') ? 'Other' : editForm.religion || ''}
                            onChange={onInputChange}
                            className={inputCls}
                        >
                            <option value="">Select...</option>
                            {RELIGION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        {(editForm.religion === 'Other' || (editForm.religion || '').startsWith('Other:')) && (
                            <input
                                type="text"
                                value={otherReligion || ((editForm.religion || '').startsWith('Other:') ? (editForm.religion || '').replace(/^Other:\s*/, '') : '')}
                                onChange={onOtherReligionChange}
                                className={`${inputCls} mt-2`}
                                placeholder="Enter religion"
                                pattern={NAME_TEXT_PATTERN}
                            />
                        )}
                    </>
                ) : type === "select" ? (
                    <select
                        name={name}
                        value={editForm[name] as string || ''}
                        onChange={onInputChange}
                        className={inputCls}
                    >
                        <option value="">Select...</option>
                        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                ) : (
                    <input
                        type={inputProps.type}
                        name={name}
                        value={editForm[name] as string | number || ''}
                        onChange={onInputChange}
                        inputMode={inputProps.inputMode}
                        pattern={inputProps.pattern}
                        className={inputCls}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            <div className="clinical-field-label">{label}</div>
            <div className={`patient-chart-field ${isEmpty ? 'is-empty' : ''}`}>
                {isEmpty ? 'Not provided' : value}
            </div>
        </div>
    );
}

export function PatientDetailModal({
    patient: initialPatient,
    onClose,
    onPatientUpdate,
    onConsult,
}: PatientDetailModalProps) {
    const [patient, setPatient] = useState<Patient>(initialPatient);
    const [showHistory, setShowHistory] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState<Patient>({ ...initialPatient });
    const [otherReligion, setOtherReligion] = useState((initialPatient.religion || '').replace(/^Other:\s*/, ''));
    const { showToast, ToastComponent } = useToast();

    const [vaccineRecords, setVaccineRecords] = useState<VaccineRecord[]>([]);
    const [vaccineLoading, setVaccineLoading] = useState(false);
    const [vaccineSaving, setVaccineSaving] = useState(false);
    const [removingVaccineId, setRemovingVaccineId] = useState<string | null>(null);
    const [pendingRemoveVaccine, setPendingRemoveVaccine] = useState<VaccineRecord | null>(null);
    const [vaccineLoadError, setVaccineLoadError] = useState<string | null>(null);
    const [showAddVaccine, setShowAddVaccine] = useState(false);
    const [newVaccine, setNewVaccine] = useState<VaccineRecord>(createVaccineRecord());

    // Sync local state if prop changes (though usually initialPatient won't change while modal is open)
    useEffect(() => {
        setPatient(initialPatient);
        setEditForm({ ...initialPatient });
        setOtherReligion((initialPatient.religion || '').replace(/^Other:\s*/, ''));
    }, [initialPatient]);

    const loadHistory = () => setShowHistory(true);

    const loadVaccineRecords = async () => {
        setVaccineLoading(true);
        setVaccineLoadError(null);
        try {
            const records = await fetchVaccineRecords(patient.id);
            setVaccineRecords(records);
        } catch (err) {
            logError('Failed to load vaccine records', err);
            const message = healthcareErrorMessage("load the patient's vaccine records");
            setVaccineLoadError(message);
            showToast(message, true);
        } finally {
            setVaccineLoading(false);
        }
    };

    useEffect(() => {
        loadVaccineRecords();
    }, [patient.id]);

    const updateNewVaccine = (field: keyof VaccineRecord, value: string) => {
        setNewVaccine(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'vaccine_name') {
                next.vaccine_category = getVaccineCategory(value);
                if (value !== OTHER_VACCINE_NAME) next.other_vaccine_name = '';
            }
            return next;
        });
    };

    const handleAddVaccine = async () => {
        if (!navigator.onLine) {
            showToast('You are offline. Vaccine records cannot be saved until the connection is restored.', true);
            return;
        }

        const cleanRecord = cleanVaccineRecord(newVaccine);
        if (!cleanRecord.vaccine_name || !cleanRecord.date_given) {
            showToast('Vaccine name and date are required.', true);
            return;
        }
        if (cleanRecord.vaccine_name === OTHER_VACCINE_NAME && !cleanRecord.other_vaccine_name) {
            showToast('Specify the vaccine name for Others / Specify.', true);
            return;
        }
        try {
            setVaccineSaving(true);
            await saveVaccineRecord(patient.id, cleanRecord);
            showToast('Vaccination record updated.', false);
            setShowAddVaccine(false);
            setNewVaccine(createVaccineRecord());
            await loadVaccineRecords();
        } catch (err) {
            logError('Failed to save vaccine record', err);
            showToast(healthcareErrorMessage("save the vaccine record"), true);
        } finally {
            setVaccineSaving(false);
        }
    };

    const handleRemoveVaccine = async (record: VaccineRecord) => {
        if (!navigator.onLine) {
            showToast('You are offline. Vaccine records cannot be removed until the connection is restored.', true);
            return;
        }
        try {
            setRemovingVaccineId(record.id);
            await removeVaccineRecord(patient.id, record.id);
            showToast('Vaccine record removed.', false);
            setPendingRemoveVaccine(null);
            await loadVaccineRecords();
        } catch (err) {
            logError('Failed to remove vaccine record', err);
            showToast(healthcareErrorMessage("remove the vaccine record"), true);
        } finally {
            setRemovingVaccineId(null);
        }
    };

    const handleEditToggle = () => {
        if (isEditing) {
            setEditForm({ ...patient }); // Reset form on cancel
            setOtherReligion((patient.religion || '').replace(/^Other:\s*/, ''));
        }
        setIsEditing(!isEditing);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const fieldName = name as keyof Patient;
        const sanitizedValue = sanitizePatientEditValue(fieldName, value);
        setEditForm(prev => ({ ...prev, [fieldName]: sanitizedValue }));
        if (fieldName === 'religion' && sanitizedValue !== 'Other') setOtherReligion('');
    };

    const handleOtherReligion = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^a-zA-Z\s\-',.]/g, '');
        setOtherReligion(value);
        setEditForm(prev => ({ ...prev, religion: value ? `Other: ${value}` : 'Other' }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Convert age to number if it's a string from input
            const payload = {
                ...editForm,
                age: editForm.age ? parseInt(editForm.age.toString()) : null
            };

            // Remove fields that shouldn't be updated or cause issues
            const { id, createdAt, created_at, ...updateData } = payload as any;

            await updatePatientRecord(patient.id, updateData);

            setPatient(payload);
            setIsEditing(false);
            if (onPatientUpdate) {
                onPatientUpdate(payload);
            }
            showToast('Patient details updated.', false);
        } catch (err) {
            logError('Failed to update patient details', err);
            showToast(healthcareErrorMessage("save the patient's details"), true);
        } finally {
            setIsSaving(false);
        }
    };

    const displayCategory = () => {
        if (patient.category === 'Other/s') return `Others (${patient.categoryOthers || 'Unspecified'})`;
        return patient.category || 'N/A';
    };

    const sectionCls = "patient-chart-section";
    const headerCls = "patient-chart-section-header";
    const focusCls = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]";
    const inputCls = `w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-left text-sm font-semibold text-[var(--text)] shadow-sm transition-colors focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--focus-ring)] ${focusCls}`;
    const vaccineInputCls = `w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--focus-ring)] ${focusCls}`;
    const detailItemProps = {
        isEditing,
        editForm,
        otherReligion,
        inputCls,
        onInputChange: handleInputChange,
        onOtherReligionChange: handleOtherReligion,
    };

    return (
        <>
            <ToastComponent />
            {/* Backdrop */}
            <div className="fixed inset-0 bg-[var(--brand-active)]/60 backdrop-blur-sm z-[200]" onClick={onClose} />

            {/* Modal Panel */}
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
                <Modal labelledBy="patient-detail-dialog-title" onClose={onClose} className="patient-chart-modal">

                    {/* Modal Header */}
                    <div className="patient-chart-header">
                        <PatientChartIdentityHeader patient={patient} titleId="patient-detail-dialog-title" className="flex-1 border-0 bg-transparent p-0" />
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {!showHistory && (
                                <>
                                    {onConsult && !isEditing && (
                                        <button
                                            type="button"
                                            onClick={() => onConsult(patient)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)] ${focusCls}`}
                                        >
                                            <Icon name="clipboard" className="h-3.5 w-3.5" />
                                            Consult
                                        </button>
                                    )}
                                    {!isEditing && (
                                        <button
                                            type="button"
                                            onClick={loadHistory}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 bg-white text-[var(--brand-active)] border border-[var(--border-strong)] hover:bg-[var(--surface-muted)] ${focusCls}`}
                                        >
                                            <Icon name="clock" className="h-3.5 w-3.5" />
                                            History
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleEditToggle}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${focusCls} ${isEditing ? 'bg-[var(--disabled-bg)] text-[var(--text-secondary)] hover:bg-[var(--brand-accent-surface)]' : 'bg-[var(--surface-muted)] text-[var(--brand-active)] hover:bg-[var(--brand-accent-surface)]'}`}
                                    >
                                        {isEditing ? 'Cancel' : 'Edit Profile'}
                                    </button>
                                </>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close patient details"
                                className={`w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--disabled-bg)] text-[var(--text-secondary)] hover:bg-[var(--brand-accent-surface)] transition-colors font-bold text-sm ${focusCls}`}
                            >
                                X
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Body */}
                    <div className="patient-chart-body">

                        {!showHistory ? (
                            <>
                                <div className={sectionCls}>
                                    <div className={headerCls}>Patient Summary</div>
                                    <div className="patient-chart-section-body patient-chart-summary">
                                        <div>
                                            <div className="text-xs font-medium text-[var(--text-secondary)]">Patient</div>
                                            <div className="font-semibold text-[var(--text)]">{patient.lastName}, {patient.firstName}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-[var(--text-secondary)]">Profile</div>
                                            <div className="font-semibold text-[var(--text)]">{patient.sex || '—'} · {patient.age ?? '—'} yrs</div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-[var(--text-secondary)]">Blood Type</div>
                                            <div className="font-semibold text-[var(--text)]">{patient.bloodType || '—'}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-[var(--text-secondary)]">PhilHealth</div>
                                            <div className="font-semibold text-[var(--text)]">{patient.philhealthStatus || '—'}</div>
                                        </div>
                                        <div className="col-span-2 sm:col-span-4">
                                            <div className="text-xs font-medium text-[var(--text-secondary)]">Address</div>
                                            <div className="font-semibold text-[var(--text)]">{patient.address || '—'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Patient Info */}
                                <div className={sectionCls}>
                                    <div className={headerCls}>Demographics</div>
                                    <div className="patient-chart-section-body grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        <DetailItem {...detailItemProps} label="First Name" value={patient.firstName} name="firstName" />
                                        <DetailItem {...detailItemProps} label="Middle Name" value={patient.middleName} name="middleName" />
                                        <DetailItem {...detailItemProps} label="Last Name" value={patient.lastName} name="lastName" />
                                        <DetailItem {...detailItemProps} label="Age" value={patient.age} name="age" type="number" />
                                        <DetailItem {...detailItemProps} label="Sex" value={patient.sex} name="sex" type="select" options={['Male', 'Female']} />
                                        <DetailItem {...detailItemProps} label="Birthday" value={patient.birthday} name="birthday" type="date" />
                                        <DetailItem {...detailItemProps} label="Blood Type" value={patient.bloodType} name="bloodType" type="select" options={BLOOD_TYPES} />
                                        <DetailItem {...detailItemProps} label="Civil Status" value={patient.civilStatus} name="civilStatus" type="select" options={CIVIL_STATUSES} />
                                        <DetailItem {...detailItemProps} label="Nationality" value={patient.nationality} name="nationality" />
                                        <DetailItem {...detailItemProps} label="Religion" value={patient.religion} name="religion" type="select" options={RELIGION_OPTIONS} />
                                        <DetailItem {...detailItemProps} label="Contact Number" value={patient.contactNumber} name="contactNumber" />
                                        <DetailItem {...detailItemProps} label="Educational Attainment" value={patient.educationalAttain} name="educationalAttain" type="select" options={EDUCATION_LEVELS} />
                                        <DetailItem {...detailItemProps} label="Employment Status" value={patient.employmentStatus} name="employmentStatus" type="select" options={EMPLOYMENT_STATUSES} />
                                        <div className="col-span-2 sm:col-span-3">
                                            <DetailItem {...detailItemProps} label="Address" value={patient.address} name="address" />
                                        </div>
                                    </div>
                                </div>

                                <div className={sectionCls}>
                                    <div className={headerCls}>Coverage & Patient Category</div>
                                    <div className="patient-chart-section-body grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        <DetailItem {...detailItemProps} label="PhilHealth No." value={patient.philhealthNo} name="philhealthNo" />
                                        <DetailItem {...detailItemProps} label="PhilHealth Status" value={patient.philhealthStatus} name="philhealthStatus" type="select" options={['Member', 'Dependent', '4Ps', 'None']} />
                                        {isEditing ? (
                                            <>
                                                <DetailItem {...detailItemProps} label="Category" value={editForm.category} name="category" type="select" options={['4Ps', 'Other/s']} />
                                                {editForm.category === 'Other/s' && (
                                                    <DetailItem {...detailItemProps} label="Specify Category" value={editForm.categoryOthers} name="categoryOthers" />
                                                )}
                                            </>
                                        ) : (
                                            <DetailItem {...detailItemProps} label="Category" value={displayCategory()} name="category" />
                                        )}
                                    </div>
                                </div>
                                {!isEditing && (
                                    <div className={sectionCls}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className={headerCls} style={{ marginBottom: 0 }}>Vaccinations ({vaccineRecords.length})</div>
                                            <button
                                                type="button"
                                                onClick={() => setShowAddVaccine(!showAddVaccine)}
                                                className={`text-xs font-bold text-[var(--brand-active)] hover:text-[var(--text)] bg-[var(--surface-muted)] hover:bg-[var(--brand-accent-surface)] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${focusCls}`}
                                            >
                                                {showAddVaccine ? 'Cancel' : 'Add Vaccine'}
                                            </button>
                                        </div>

                                        {showAddVaccine && (
                                            <div className="bg-[var(--bg)] border border-[var(--brand-accent-surface)] rounded-lg p-3 mb-3">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                                    <div>
                                                        <label className="clinical-field-label">Vaccine Name *</label>
                                                        <select
                                                            value={newVaccine.vaccine_name}
                                                            onChange={(e) => updateNewVaccine('vaccine_name', e.target.value)}
                                                            className={vaccineInputCls}
                                                        >
                                                            <option value="">Select vaccine...</option>
                                                            {VACCINE_OPTIONS.map(option => (
                                                                <option key={`${option.category}-${option.name}`} value={option.name}>{option.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {newVaccine.vaccine_name === OTHER_VACCINE_NAME && (
                                                        <div>
                                                            <label className="clinical-field-label">Specify Vaccine *</label>
                                                            <input
                                                                type="text"
                                                                value={newVaccine.other_vaccine_name || ''}
                                                                onChange={(e) => updateNewVaccine('other_vaccine_name', e.target.value)}
                                                                placeholder="Enter vaccine name"
                                                                className={vaccineInputCls}
                                                            />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <label className="clinical-field-label">Category</label>
                                                        <input
                                                            type="text"
                                                            value={newVaccine.vaccine_category || 'Select a vaccine'}
                                                            readOnly
                                                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--disabled-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="clinical-field-label">Dose / Label</label>
                                                        <input
                                                            type="text"
                                                            value={newVaccine.dose_label}
                                                            onChange={(e) => updateNewVaccine('dose_label', e.target.value)}
                                                            placeholder="e.g. Dose 1, Booster"
                                                            className={vaccineInputCls}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="clinical-field-label">Date Given *</label>
                                                        <input
                                                            type="date"
                                                            value={newVaccine.date_given}
                                                            onChange={(e) => updateNewVaccine('date_given', e.target.value)}
                                                            className={vaccineInputCls}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="clinical-field-label">Next Due Date</label>
                                                        <input
                                                            type="date"
                                                            value={newVaccine.next_due_date || ''}
                                                            onChange={(e) => updateNewVaccine('next_due_date', e.target.value)}
                                                            className={vaccineInputCls}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="clinical-field-label">Administered By</label>
                                                        <input
                                                            type="text"
                                                            value={newVaccine.administered_by || ''}
                                                            onChange={(e) => updateNewVaccine('administered_by', e.target.value)}
                                                            placeholder="Staff name"
                                                            className={vaccineInputCls}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="clinical-field-label">Facility</label>
                                                        <input
                                                            type="text"
                                                            value={newVaccine.facility || ''}
                                                            onChange={(e) => updateNewVaccine('facility', e.target.value)}
                                                            placeholder="RHU / barangay"
                                                            className={vaccineInputCls}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="clinical-field-label">Lot Number</label>
                                                        <input
                                                            type="text"
                                                            value={newVaccine.lot_number || ''}
                                                            onChange={(e) => updateNewVaccine('lot_number', e.target.value)}
                                                            placeholder="Optional"
                                                            className={vaccineInputCls}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="clinical-field-label">Remarks</label>
                                                        <input
                                                            type="text"
                                                            value={newVaccine.remarks || ''}
                                                            onChange={(e) => updateNewVaccine('remarks', e.target.value)}
                                                            placeholder="Optional notes"
                                                            className={vaccineInputCls}
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleAddVaccine}
                                                    disabled={vaccineSaving || !navigator.onLine}
                                                    className={`bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white font-bold text-xs uppercase tracking-wider px-5 py-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focusCls}`}
                                                >
                                                    {vaccineSaving ? 'Saving...' : 'Save Vaccine Record'}
                                                </button>
                                            </div>
                                        )}

                                        {vaccineLoadError ? (
                                            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                                <div className="font-bold">Vaccine records could not be loaded.</div>
                                                <div className="mt-1">{vaccineLoadError}</div>
                                                <button type="button" onClick={loadVaccineRecords} className={`mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 ${focusCls}`}>
                                                    Retry
                                                </button>
                                            </div>
                                        ) : vaccineLoading ? (
                                            <SkeletonList rows={3} />
                                        ) : vaccineRecords.length === 0 ? (
                                            <p className="text-sm text-[var(--border-strong)] italic text-center py-4 bg-white rounded-lg border border-[var(--border)]">
                                                No vaccination records found.
                                            </p>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                {vaccineRecords.map((vr) => (
                                                    <div key={vr.id} className="bg-white border border-[var(--border)] rounded-lg p-3 shadow-sm hover:border-[#83C9F2] transition-colors relative">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingRemoveVaccine(vr)}
                                                            disabled={removingVaccineId === vr.id}
                                                            aria-label={`Remove ${getVaccineDisplayName(vr)} vaccine record`}
                                                            className={`absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60 ${focusCls}`}
                                                            title="Remove vaccine record"
                                                        >
                                                            X
                                                        </button>
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pr-6">
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Vaccine</div>
                                                                <div className="text-sm font-bold text-slate-800">{getVaccineDisplayName(vr)}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Category</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.vaccine_category || '-'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Dose</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.dose_label || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Date Given</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.date_given || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Remarks</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.remarks || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Next Due</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.next_due_date || '-'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Administered By</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.administered_by || '-'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Facility</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.facility || '-'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="clinical-field-label mb-0.5">Lot No.</div>
                                                                <div className="text-sm font-semibold text-slate-700">{vr.lot_number || '-'}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className={sectionCls}>
                                    <div className={headerCls}>Emergency Contact</div>
                                    <div className="patient-chart-section-body grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        <DetailItem {...detailItemProps} label="Relative's Name" value={patient.relativeName} name="relativeName" />
                                        <DetailItem {...detailItemProps} label="Relationship" value={patient.relativeRelation} name="relativeRelation" />
                                        <div className="col-span-2 sm:col-span-3">
                                            <DetailItem {...detailItemProps} label="Relative's Address" value={patient.relativeAddress} name="relativeAddress" />
                                        </div>
                                    </div>
                                </div>

                                {isEditing ? (
                                    <div className="patient-chart-footer flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className={`flex-1 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white font-semibold text-sm py-3 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 ${focusCls}`}
                                        >
                                            {isSaving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={loadHistory}
                                        className={`w-full bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white font-semibold text-sm py-3 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 mt-2 ${focusCls}`}
                                    >
                                        View Encounters & Transaction Timeline
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Back to Details */}
                                <button
                                    type="button"
                                    onClick={() => setShowHistory(false)}
                                    className={`mb-4 flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors ${focusCls}`}
                                >
                                    Back to Details
                                </button>

                                <PatientChartIdentityHeader patient={patient} compact className="mb-4" />
                                <PatientHistoryPanel>
                                    <PatientTransactionHistory patientId={patient.id} />
                                </PatientHistoryPanel>
                            </>
                        )}
                    </div>
                </Modal>
            </div>
            {pendingRemoveVaccine && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-white p-4 shadow-lg">
                        <h3 className="text-lg font-semibold text-[var(--text)]">Remove Vaccine Record?</h3>
                        <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
                            This will remove {getVaccineDisplayName(pendingRemoveVaccine)} from this patient record.
                        </p>
                        <div className="mt-6 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setPendingRemoveVaccine(null)}
                                disabled={Boolean(removingVaccineId)}
                                className={`flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${focusCls}`}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleRemoveVaccine(pendingRemoveVaccine)}
                                disabled={Boolean(removingVaccineId)}
                                className={`flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 ${focusCls}`}
                            >
                                {removingVaccineId ? 'Removing...' : 'Remove'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
