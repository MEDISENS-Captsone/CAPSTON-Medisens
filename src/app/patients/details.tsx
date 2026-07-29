import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { useNetworkSync } from '../../hooks/useNetworkSync';
import { OfflineBanner } from '../../components/feedback/OfflineBanner';
import PatientConsent from '../patients/patient-consent';
import { useToast } from '../../components/feedback/Toast';
import { PatientTransactionHistory } from '../../components/patient/PatientTransactionHistory';
import { getDashboardPath, requireAnyRole } from '../../lib/auth/roles';
import type { Role } from '../../types/user';
import { RELIGION_OPTIONS } from '../../types/patient';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { updatePatientRecord } from '../../features/patients/services';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { Skeleton, SkeletonList } from '../../components/ui/Skeleton';
import { PatientChartIdentityHeader, PatientHistoryPanel } from '../../components/patient/PatientChart';


// ─── Types ────────────────────────────────────────────────────────────────────
interface Patient {
    id: string; firstName: string; middleName: string; lastName: string;
    age: number | null; sex: string; birthday: string; birthPlace: string;
    bloodType: string; nationality: string; religion: string; civilStatus: string;
    suffix: string; address: string; contactNumber: string; educationalAttain: string;
    employmentStatus: string; philhealthNo: string; philhealthStatus: string;
    category: string; categoryOthers: string; relativeName: string;
    relativeRelation: string; relativeAddress: string;
    consent_signed: boolean;
    archive_status?: 'active' | 'archived';
}

interface EditForm extends Omit<Patient, 'id' | 'age' | 'consent_signed'> { age: string; }
interface NavItem { id: string; label: string; icon: string; group?: string; }

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
const EDUCATION_LEVELS = [
    'No Formal Education', 'Elementary Level', 'Elementary Graduate', 'High School Level', 'High School Graduate', 'Vocational', 'College Level', 'College Graduate', 'Post-Graduate'
] as const;
const EMPLOYMENT_STATUSES = ['Employed', 'Unemployed', 'Self-Employed', 'Student', 'Retired'] as const;

const patientId = new URLSearchParams(window.location.search).get('id');
const PATIENT_DETAILS_ROLES = ['BHW', 'nurse', 'doctor', 'midwives'] as const satisfies readonly Role[];
const PATIENT_DETAILS_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, birthday, birthPlace, bloodType, nationality, religion, civilStatus, address, contactNumber, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress, archive_status';

const PATIENT_DETAILS_NAV_ITEMS: Record<(typeof PATIENT_DETAILS_ROLES)[number], NavItem[]> = {
    doctor: [
        { id: 'dashboard', label: 'Dashboard', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'consultation', label: 'Consultation', icon: 'clipboard', group: 'Clinical Workflow' },
    ],
    nurse: [
        { id: 'dashboard', label: 'Dashboard', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'new-record', label: 'New Record', icon: 'user-plus', group: 'Patient Care' },
        { id: 'consultation', label: 'Initial Consultation', icon: 'clipboard', group: 'Clinical Workflow' },
    ],
    midwives: [
        { id: 'dashboard', label: 'Dashboard', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'reports', label: 'OCR Reports', icon: 'chart', group: 'Records & Governance' },
    ],
    BHW: [
        { id: 'dashboard', label: 'Dashboard', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'new-record', label: 'New Record', icon: 'user-plus', group: 'Patient Care' },
    ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const DIGITS_ONLY_PATTERN = '[0-9]*';
const NAME_TEXT_PATTERN = "[A-Za-z .'-]*";
const NUMERIC_ONLY_EDIT_FIELDS = new Set<keyof EditForm>(['age', 'contactNumber']);
const NAME_TEXT_EDIT_FIELDS = new Set<keyof EditForm>([
    'firstName',
    'middleName',
    'lastName',
    'suffix',
    'nationality',
    'civilStatus',
    'relativeName',
    'relativeRelation',
]);

function sanitizeEditValue(field: keyof EditForm, value: string) {
    if (NUMERIC_ONLY_EDIT_FIELDS.has(field)) return value.replace(/\D/g, '');
    if (NAME_TEXT_EDIT_FIELDS.has(field)) return value.replace(/[^a-zA-Z\s'.-]/g, '');
    return value;
}

function restrictedInputProps(field: keyof EditForm): Pick<React.InputHTMLAttributes<HTMLInputElement>, 'inputMode' | 'pattern'> {
    if (NUMERIC_ONLY_EDIT_FIELDS.has(field)) return { inputMode: 'numeric', pattern: DIGITS_ONLY_PATTERN };
    if (NAME_TEXT_EDIT_FIELDS.has(field)) return { pattern: NAME_TEXT_PATTERN };
    return {};
}

function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
    const isEmpty = value === null || value === undefined || value === '';
    return (
        <div className="flex flex-col gap-1">
            <div className="text-[0.68rem] font-bold uppercase tracking-widest text-slate-400">{label}</div>
            <div className={`text-sm font-semibold ${isEmpty ? 'text-slate-400 italic' : 'text-slate-800'}`}>
                {isEmpty ? 'Not provided' : value}
            </div>
        </div>
    );
}

function RadioOption({ name, value, label, checked, onChange }: { name: string; value: string; label: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }) {
    return (
        <label className={`cursor-pointer px-4 py-2 border rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${checked ? 'border-slate-700 bg-slate-50 text-slate-700 ring-1 ring-slate-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
            <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="hidden" />
            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${checked ? 'border-slate-700' : 'border-slate-300'}`}>
                {checked && <div className="w-1.5 h-1.5 bg-slate-700 rounded-full" />}
            </div>
            {label}
        </label>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function DetailsPage() {
    const [patient, setPatient] = useState<Patient | null>(null);
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [showConsent, setShowConsent] = useState(false);
    const { showToast, ToastComponent } = useToast();

    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [otherReligion, setOtherReligion] = useState('');
    const isArchivedPatient = patient?.archive_status === 'archived';

    const [role, setRole] = useState<Role | null>(null);
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { isOnline } = useNetworkSync();

    const [editForm, setEditForm] = useState<EditForm>({
        firstName: '', middleName: '', lastName: '', age: '', sex: '', nationality: '', bloodType: 'O+', religion: '', birthday: '', birthPlace: '', address: '', contactNumber: '', civilStatus: '', suffix: '', educationalAttain: '', employmentStatus: '', philhealthNo: '', philhealthStatus: '', category: '', categoryOthers: '', relativeName: '', relativeRelation: '', relativeAddress: ''
    });

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            try {
                const profile = await requireAnyRole(PATIENT_DETAILS_ROLES);
                if (!isMounted) return;

                setRole(profile.role);
                setUserName(profile.fullName || 'MEDISENS User');
                setUserInitials(profile.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2));

                if (!patientId) {
                    setError('Select a patient record before opening the chart.');
                    return;
                }

                await loadPatient();
            } catch (err) {
                if (isMounted) setError('Access denied. Redirecting to your dashboard.');
            }
        }

        bootstrap();
        return () => { isMounted = false; };
    }, []);

    async function loadPatient() {
        const { data: patientData, error: pError } = await supabase.from('patients').select(PATIENT_DETAILS_COLUMNS).eq('id', patientId).single();
        if (pError || !patientData) { setError('Patient not found.'); return; }

        const { data: consentData } = await supabase.from('patient_consent').select('consent_id').eq('patient_id', patientId).maybeSingle();

        const fullPatient = {
            ...patientData,
            consent_signed: !!consentData
        };

        setPatient(fullPatient as Patient);
        setEditForm({
            firstName: patientData.firstName || '', middleName: patientData.middleName || '', lastName: patientData.lastName || '', age: patientData.age?.toString() ?? '', sex: patientData.sex || '', nationality: patientData.nationality || '', bloodType: patientData.bloodType || 'O+', religion: patientData.religion || '', birthday: patientData.birthday || '', birthPlace: patientData.birthPlace || '', suffix: patientData.suffix || '', civilStatus: patientData.civilStatus || '', address: patientData.address || '', contactNumber: patientData.contactNumber || '', educationalAttain: patientData.educationalAttain || '', employmentStatus: patientData.employmentStatus || '', philhealthNo: patientData.philhealthNo || '', philhealthStatus: patientData.philhealthStatus || '', category: patientData.category || '', categoryOthers: patientData.categoryOthers || '', relativeName: patientData.relativeName || '', relativeRelation: patientData.relativeRelation || '', relativeAddress: patientData.relativeAddress || ''
        });
        setOtherReligion((patientData.religion || '').replace(/^Other:\s*/, ''));
    }

    const handleOpenHistory = () => setHistoryModalOpen(true);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { id, value } = e.target;
        const field = id as keyof EditForm;
        const sanitizedValue = sanitizeEditValue(field, value);
        setEditForm(f => ({ ...f, [field]: sanitizedValue }));
        if (field === 'religion' && sanitizedValue !== 'Other') setOtherReligion('');
    };

    const handleOtherReligion = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^a-zA-Z\s\-',.]/g, '');
        setOtherReligion(value);
        setEditForm(f => ({ ...f, religion: value ? `Other: ${value}` : 'Other' }));
    };

    const handleRadio = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditForm(f => ({ ...f, [name]: value, ...(name === 'category' && value === '4Ps' ? { categoryOthers: '' } : {}) }));
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isArchivedPatient) {
            showToast('Archived patient records are read-only. Restore the record before making changes.', true);
            setEditing(false);
            return;
        }
        setSaving(true);
        const parsed = parseInt(editForm.age);
        const updates = { ...editForm, age: isNaN(parsed) ? null : parsed };

        try {
            if (!patientId) throw new Error('Missing patient ID.');
            await updatePatientRecord(patientId, updates);
        } catch (error) {
            setSaving(false);
            logError('Failed to update patient record', error);
            showToast(healthcareErrorMessage("update the patient record"), true);
            return;
        }
        setSaving(false);
        showToast('Record Updated Successfully', false);
        setPatient(p => p ? { ...p, ...updates } as Patient : null);
        setEditing(false);
    };

    const displayCategory = (p: Patient) => {
        if (p.category === 'Other/s') return `Others (${p.categoryOthers || 'Unspecified'})`;
        return p.category || 'N/A';
    };

    if (!role) return null;

    const navItems = PATIENT_DETAILS_NAV_ITEMS[role as (typeof PATIENT_DETAILS_ROLES)[number]] ?? [];

    const handleNavigate = (id: string) => {
        if (id === 'dashboard') window.location.href = getDashboardPath(role);
        else if (id === 'records') window.location.href = '/pages/records.html';
        else if (id === 'new-record') window.location.href = '/pages/templates.html';
        else if (id === 'consultation') window.location.href = role === 'doctor' ? '/pages/consultation.html' : '/pages/initial_consultation.html';
        else if (id === 'reports') window.location.href = '/pages/midwife.html';
    };

    const sectionCls = "bg-white border border-slate-200 rounded-lg p-4 md:p-5 shadow-sm mb-4";
    const headerCls = "flex items-center gap-3 text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-3 mb-4";
    const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 outline-none transition-colors";
    const labelCls = "block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2";

    return (
        <div className="flex w-full min-h-screen bg-[var(--bg)] text-slate-800 overflow-x-hidden relative">
            <ToastComponent />

            <Sidebar activePage="records" userName={userName} userInitials={userInitials} userRole={role.toUpperCase()} navItems={navItems} onNavigate={handleNavigate} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isOnline={isOnline} />

            <div className="flex-1 flex flex-col min-h-screen w-full md:pl-[240px]">
                <header className="h-[72px] w-full bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-lg"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                        <div className="font-bold text-lg text-slate-800">{editing ? 'Edit Profile' : 'Patient Profile'}</div>
                    </div>
                    <div className="flex items-center gap-3">

                        <button onClick={() => window.history.back()} className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600">Back</button>
                    </div>
                </header>

                <OfflineBanner isOnline={isOnline} />

                <main className="w-full flex-1 pwa-page-pad">
                    <div className="w-full">
                        {error ? (
                            <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 font-semibold text-center">{error}</div>
                        ) : !patient ? (
                            <div className="rounded-xl border border-slate-200 bg-white p-5" role="status" aria-live="polite" aria-busy="true">
                                <div className="mb-5 flex items-center gap-4">
                                    <Skeleton className="h-16 w-16 rounded-full" />
                                    <div className="min-w-0 flex-1">
                                        <Skeleton className="h-5 w-52 max-w-full" />
                                        <Skeleton className="mt-3 h-3 w-36" />
                                    </div>
                                </div>
                                <SkeletonList rows={4} />
                            </div>
                        ) : showConsent ? (
                            <div className="">
                                <button onClick={() => setShowConsent(false)} className="mb-4 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg shadow-sm hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600">Back to Details</button>
                                <PatientConsent patientId={patient.id} patientName={`${patient.firstName} ${patient.lastName}`} rhuPersonnel={userName} onConsentSaved={() => { setPatient(current => current ? { ...current, consent_signed: true } : current); setShowConsent(false); loadPatient(); }} />
                            </div>
                        ) : editing && !isArchivedPatient ? (
                            // Edit Mode Form...
                            <form onSubmit={handleEditSubmit} className="">
                                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6 flex flex-wrap items-center gap-5 shadow-sm relative ring-1 ring-slate-500/10">
                                    <div className="w-16 h-16 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-2xl shadow-md shrink-0">{patient.firstName?.[0]}{patient.lastName?.[0]}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black text-slate-900 text-xl leading-tight truncate">Editing: {patient.firstName} {patient.lastName}</div>
                                        <div className="text-sm text-slate-700 mt-1 font-medium">Update the necessary fields below and save your changes.</div>
                                    </div>
                                    <div className="shrink-0 flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                                        <button type="button" onClick={() => setEditing(false)} className="px-5 py-2.5 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 text-sm font-bold rounded-lg transition-colors flex-1 md:flex-none text-center">Cancel</button>
                                        <button type="submit" disabled={saving} className={`px-5 py-2.5 text-white text-sm font-bold rounded-lg transition-all flex-1 md:flex-none text-center shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 ${saving ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-800 hover:shadow-none'}`}>{saving ? 'Updating Chart...' : 'Update Patient Chart'}</button>
                                    </div>
                                </div>

                                <div className={sectionCls}>
                                    <div className={headerCls}>I. Patient's Information Record</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        <div><label className={labelCls}>First Name</label><input type="text" id="firstName" value={editForm.firstName} onChange={handleChange} className={inputCls} required {...restrictedInputProps('firstName')} /></div>
                                        <div><label className={labelCls}>Middle Name</label><input type="text" id="middleName" value={editForm.middleName} onChange={handleChange} className={inputCls} {...restrictedInputProps('middleName')} /></div>
                                        <div><label className={labelCls}>Last Name</label><input type="text" id="lastName" value={editForm.lastName} onChange={handleChange} className={inputCls} required {...restrictedInputProps('lastName')} /></div>
                                        <div><label className={labelCls}>Suffix</label><input type="text" id="suffix" value={editForm.suffix} onChange={handleChange} className={inputCls} placeholder="Jr., Sr., III" {...restrictedInputProps('suffix')} /></div>
                                        <div><label className={labelCls}>Age</label><input type="text" id="age" value={editForm.age} onChange={handleChange} className={inputCls} required {...restrictedInputProps('age')} /></div>
                                        <div>
                                            <label className={labelCls}>Sex</label>
                                            <div className="flex gap-3">
                                                <RadioOption name="sex" value="Male" label="Male" checked={editForm.sex === 'Male'} onChange={handleRadio} />
                                                <RadioOption name="sex" value="Female" label="Female" checked={editForm.sex === 'Female'} onChange={handleRadio} />
                                            </div>
                                        </div>
                                        <div><label className={labelCls}>Birthday</label><input type="date" id="birthday" value={editForm.birthday} onChange={handleChange} className={inputCls} /></div>
                                        <div><label className={labelCls}>Birth Place</label><input type="text" id="birthPlace" value={editForm.birthPlace} onChange={handleChange} className={inputCls} /></div>
                                        <div><label className={labelCls}>Contact Number</label><input type="tel" id="contactNumber" value={editForm.contactNumber} onChange={handleChange} className={inputCls} placeholder="09XXXXXXXXX" {...restrictedInputProps('contactNumber')} /></div>
                                        <div className="md:col-span-2"><label className={labelCls}>Address</label><input type="text" id="address" value={editForm.address} onChange={handleChange} className={inputCls} required /></div>
                                        <div><label className={labelCls}>Nationality</label><input type="text" id="nationality" value={editForm.nationality} onChange={handleChange} className={inputCls} {...restrictedInputProps('nationality')} /></div>
                                        <div>
                                            <label className={labelCls}>Religion</label>
                                            <select id="religion" value={editForm.religion.startsWith('Other:') ? 'Other' : editForm.religion} onChange={handleChange} className={inputCls}>
                                                <option value="">Select religion</option>
                                                {RELIGION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                            </select>
                                            {(editForm.religion === 'Other' || editForm.religion.startsWith('Other:')) && (
                                                <input type="text" value={otherReligion || (editForm.religion.startsWith('Other:') ? editForm.religion.replace(/^Other:\s*/, '') : '')} onChange={handleOtherReligion} className={`${inputCls} mt-2`} placeholder="Enter religion" pattern={NAME_TEXT_PATTERN} />
                                            )}
                                        </div>
                                        <div><label className={labelCls}>Civil Status</label><input type="text" id="civilStatus" value={editForm.civilStatus} onChange={handleChange} className={inputCls} {...restrictedInputProps('civilStatus')} /></div>
                                        <div>
                                            <label className={labelCls}>Blood Type</label>
                                            <select id="bloodType" value={editForm.bloodType} onChange={handleChange} className={inputCls}>
                                                {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelCls}>Educational Attainment</label>
                                            <select id="educationalAttain" value={editForm.educationalAttain} onChange={handleChange} className={inputCls} required>
                                                <option value="" disabled>Select</option>
                                                {EDUCATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelCls}>Employment Status</label>
                                            <select id="employmentStatus" value={editForm.employmentStatus} onChange={handleChange} className={inputCls} required>
                                                <option value="" disabled>Select</option>
                                                {EMPLOYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className={sectionCls}>
                                    <div className={headerCls}>II. PhilHealth &amp; Categorization</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div><label className={labelCls}>PhilHealth No.</label><input type="text" id="philhealthNo" value={editForm.philhealthNo} onChange={handleChange} className={inputCls} placeholder="XX-XXXXXXXXX-X" /></div>
                                        <div>
                                            <label className={labelCls}>PhilHealth Status</label>
                                            <div className="flex flex-wrap gap-3">
                                                {['Member', 'Dependent', 'None'].map(v => (
                                                    <RadioOption key={v} name="philhealthStatus" value={v} label={v} checked={editForm.philhealthStatus === v} onChange={handleRadio} />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className={labelCls}>Category</label>
                                            <div className="flex flex-wrap gap-3">
                                                <RadioOption name="category" value="4Ps" label="4Ps" checked={editForm.category === '4Ps'} onChange={handleRadio} />
                                                <RadioOption name="category" value="Other/s" label="Other/s" checked={editForm.category === 'Other/s'} onChange={handleRadio} />
                                                {editForm.category === 'Other/s' && (
                                                    <input type="text" id="categoryOthers" value={editForm.categoryOthers} onChange={handleChange} placeholder="Please specify" className={`${inputCls} max-w-xs`} required />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={sectionCls}>
                                    <div className={headerCls}>III. Emergency Contact</div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        <div><label className={labelCls}>Relative's Name</label><input type="text" id="relativeName" value={editForm.relativeName} onChange={handleChange} className={inputCls} {...restrictedInputProps('relativeName')} /></div>
                                        <div><label className={labelCls}>Relationship</label><input type="text" id="relativeRelation" value={editForm.relativeRelation} onChange={handleChange} className={inputCls} {...restrictedInputProps('relativeRelation')} /></div>
                                        <div><label className={labelCls}>Relative's Address</label><input type="text" id="relativeAddress" value={editForm.relativeAddress} onChange={handleChange} className={inputCls} /></div>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            // Read-Only Mode
                            <div className="">
                                <div className="w-full bg-white border border-slate-200 rounded-xl p-6 mb-6 flex flex-wrap items-center gap-5 shadow-sm relative">
                                    <div className="w-16 h-16 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-2xl shadow-md shrink-0">
                                        {patient.firstName?.[0]}{patient.lastName?.[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black text-slate-900 text-xl leading-tight truncate">{patient.firstName} {patient.middleName} {patient.lastName} {patient.suffix}</div>
                                        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2">
                                            <span className="text-sm text-slate-500 font-medium">Blood: <span className="font-bold text-slate-700">{patient.bloodType || 'Unknown'}</span></span>
                                            <span className="text-sm text-slate-500 font-medium">Sex: <span className="font-bold text-slate-700">{patient.sex || '-'}</span></span>
                                            <span className="text-sm text-slate-500 font-medium">Age: <span className="font-bold text-slate-700">{patient.age ?? '-'}</span> yrs</span>
                                            <span className="text-sm text-slate-500 font-medium truncate max-w-xs">Address: <span className="font-bold text-slate-700">{patient.address || '-'}</span></span>
                                        </div>
                                    </div>

                                    <div className="shrink-0 flex flex-col md:items-end gap-2 w-full md:w-auto mt-4 md:mt-0">
                                        {isArchivedPatient ? (
                                            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center justify-center md:justify-end gap-2 w-full md:w-auto">Archived Read-Only</span>
                                        ) : (
                                            <div className="flex gap-2 w-full md:w-auto">
                                                <button onClick={() => setEditing(true)} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 flex-1 md:flex-none">
                                                    Edit Profile
                                                </button>
                                            </div>
                                        )}

                                        {patient.consent_signed ? (
                                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center justify-center md:justify-end gap-2 w-full md:w-auto">Consent Signed</span>
                                        ) : (
                                            <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center justify-center md:justify-end gap-2 w-full md:w-auto">Pending Consent</span>
                                        )}
                                    </div>
                                </div>

                                <div className={sectionCls}>
                                    <div className={headerCls}>I. Patient's Information Record</div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                        <DetailItem label="First Name" value={patient.firstName} />
                                        <DetailItem label="Middle Name" value={patient.middleName} />
                                        <DetailItem label="Last Name" value={patient.lastName} />
                                        <DetailItem label="Suffix" value={patient.suffix} />
                                        <DetailItem label="Age" value={patient.age} />
                                        <DetailItem label="Sex" value={patient.sex} />
                                        <DetailItem label="Birthday" value={patient.birthday} />
                                        <DetailItem label="Birth Place" value={patient.birthPlace} />
                                        <DetailItem label="Blood Type" value={patient.bloodType} />
                                        <DetailItem label="Nationality" value={patient.nationality} />
                                        <DetailItem label="Religion" value={patient.religion} />
                                        <DetailItem label="Civil Status" value={patient.civilStatus} />
                                        <DetailItem label="Contact Number" value={patient.contactNumber} />
                                        <DetailItem label="Address" value={patient.address} />
                                        <DetailItem label="Educational Attainment" value={patient.educationalAttain} />
                                        <DetailItem label="Employment Status" value={patient.employmentStatus} />
                                    </div>
                                </div>

                                <div className={sectionCls}>
                                    <div className={headerCls}>II. PhilHealth & Categorization</div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <DetailItem label="PhilHealth No." value={patient.philhealthNo} />
                                        <DetailItem label="PhilHealth Status" value={patient.philhealthStatus} />
                                        <DetailItem label="Category" value={displayCategory(patient)} />
                                    </div>
                                </div>

                                <div className={sectionCls}>
                                    <div className={headerCls}>III. Emergency Contact</div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <DetailItem label="Relative's Name" value={patient.relativeName} />
                                        <DetailItem label="Relationship" value={patient.relativeRelation} />
                                        <DetailItem label="Relative's Address" value={patient.relativeAddress} />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {/* Midwife action */}
                                    {role === 'midwives' && !patient.consent_signed && !isArchivedPatient && (
                                        <button onClick={() => setShowConsent(true)} className="w-full bg-slate-700 text-white font-extrabold text-sm uppercase tracking-wider py-4 rounded-xl shadow-sm hover:bg-slate-800 hover:shadow-none transition-all  flex items-center justify-center gap-3">
                                            Proceed to Patient Consent
                                        </button>
                                    )}

                                    {/* Nurse / Doctor / any role action */}
                                    {(role === 'nurse' || role === 'doctor' || role === 'midwives' || role === 'BHW') && (
                                        <button onClick={handleOpenHistory} className="w-full bg-teal-600 text-white font-extrabold text-sm uppercase tracking-wider py-4 rounded-xl shadow-sm hover:bg-teal-700 hover:shadow-teal-600/30 transition-all  flex items-center justify-center gap-3">
                                            View Complete Transaction History
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* ─── UNIFIED TRANSACTION HISTORY MODAL ─── */}
            {historyModalOpen && (
                <ClinicalDrawer
                    title="Transaction History"
                    labelledBy="patient-transaction-history-title"
                    onClose={() => setHistoryModalOpen(false)}
                    subtitle={<>{patient?.lastName}, {patient?.firstName} - Registration, consultations, lab, pharmacy, vaccines, follow-ups</>}
                >
                    {patient && <PatientChartIdentityHeader patient={patient} compact className="mb-4" />}
                    <PatientHistoryPanel>
                        {patientId && <PatientTransactionHistory patientId={patientId} />}
                    </PatientHistoryPanel>
                </ClinicalDrawer>
            )}

        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <DetailsPage />
        </React.StrictMode>
    );
}
