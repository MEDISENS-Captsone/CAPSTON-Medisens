import React, { useState, useMemo } from 'react';
import { midwifeAPI } from './api';
import { useToast } from '../../components/feedback/Toast';
import { Icon } from '../../components/shared/Icon';
import type { VaccineRecord } from '../patients/itemization';
import { isBlank } from '../../lib/utils/strings';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import {
    OTHER_VACCINE_NAME,
    VACCINE_OPTIONS,
    cleanVaccineRecord,
    createVaccineRecord,
    getVaccineCategory,
    isMeaningfulVaccineRecord,
} from '../vaccines/vaccineOptions';

interface Props {
    patients: any[];
    records: any[];
    onSaveSuccess: () => Promise<void>;
}

const isFemalePatient = (patient: any) => String(patient?.sex || '').trim().toLowerCase() === 'female';
const MATERNAL_ELIGIBILITY_MESSAGE = 'Only female patients are eligible for Maternal Care records.';

const CensusEntry = ({ patients, records, onSaveSuccess }: Props) => {
    const [activeLogbook, setActiveLogbook] = useState('maternal');
    const [isAddingEntry, setIsAddingEntry] = useState(false);
    
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [formData, setFormData] = useState<any>({});
    const [vaccineRows, setVaccineRows] = useState<VaccineRecord[]>([
        createVaccineRecord({
            vaccine_category: 'Child Care / Core RHU Immunization',
            vaccine_name: 'BCG',
            dose_label: 'Birth dose',
        }),
    ]);
    
    // Global UI Requirement states
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast, ToastComponent } = useToast();
    const [errorMsg, setErrorMsg] = useState('');

    const activeRecords = useMemo(() => {
        return records.filter(r => r.category === activeLogbook);
    }, [records, activeLogbook]);

    const filteredPatients = useMemo(() => {
        if (isBlank(searchQuery)) return [];
        return patients.filter(p => {
            const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
            const matchesSearch = fullName.includes(searchQuery.toLowerCase());
            const isEligible = activeLogbook === 'maternal' ? isFemalePatient(p) : true;
            return matchesSearch && isEligible;
        });
    }, [activeLogbook, patients, searchQuery]);

    // Handle generic inputs
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData((prev: any) => ({ ...prev, [name]: val }));
    };

    const updateVaccineRow = (index: number, field: keyof VaccineRecord, value: string) => {
        setVaccineRows(prev => {
            const next = prev.map((row, rowIndex) => {
                if (rowIndex !== index) return row;
                const updated = { ...row, [field]: value };
                if (field === 'vaccine_name') {
                    updated.vaccine_category = getVaccineCategory(value);
                    if (value !== OTHER_VACCINE_NAME) updated.other_vaccine_name = '';
                }
                return updated;
            });
            const bcgRecord = next.find(row => row.vaccine_name.toLowerCase() === 'bcg');
            setFormData((current: any) => ({ ...current, bcg_date: bcgRecord?.date_given || '' }));
            return next;
        });
    };

    const addVaccineRow = () => {
        setVaccineRows(prev => [...prev, createVaccineRecord()]);
    };

    const removeVaccineRow = (index: number) => {
        setVaccineRows(prev => {
            const next = prev.filter((_, rowIndex) => rowIndex !== index);
            const bcgRecord = next.find(row => row.vaccine_name.toLowerCase() === 'bcg');
            setFormData((current: any) => ({ ...current, bcg_date: bcgRecord?.date_given || '' }));
            return next;
        });
    };

    // Auto-calculate BMI
    const calculatedBMI = useMemo(() => {
        if (formData.height && formData.weight) {
            const heightM = Number(formData.height) / 100;
            const bmi = Number(formData.weight) / (heightM * heightM);
            let status = 'Normal';
            if (bmi < 18.5) status = 'Underweight';
            else if (bmi >= 25 && bmi < 29.9) status = 'Overweight';
            else if (bmi >= 30) status = 'Obese';
            return { value: bmi.toFixed(1), status };
        }
        return null;
    }, [formData.height, formData.weight]);

    // Auto-calculate BCG Age
    const calculatedBCGAge = useMemo(() => {
        if (formData.bcg_date && selectedPatient?.birthday) {
            const dob = new Date(selectedPatient.birthday);
            const bcg = new Date(formData.bcg_date);
            const diffTime = Math.abs(bcg.getTime() - dob.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 28 ? "0 to 28 days old" : "29 days to 1 year old";
        }
        return null;
    }, [formData.bcg_date, selectedPatient]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient) {
            setErrorMsg("Please select a patient from the registry first.");
            return;
        }

        if (activeLogbook === 'maternal' && !isFemalePatient(selectedPatient)) {
            setErrorMsg(MATERNAL_ELIGIBILITY_MESSAGE);
            showToast(MATERNAL_ELIGIBILITY_MESSAGE, true);
            return;
        }

        setIsSubmitting(true);
        setErrorMsg('');
        
        // ─── COMPILE DATA WITH AUTO-CALCULATIONS BEFORE SAVING ───
        const payloadData = { ...formData };
        
        // Always save sex/age for easy reporting
        payloadData.patient_sex = selectedPatient.sex;
        payloadData.patient_age = selectedPatient.age;

        if (activeLogbook === 'maternal' && calculatedBMI) {
            payloadData.bmi_value = calculatedBMI.value;
            payloadData.bmi_status = calculatedBMI.status;
        }
        
        if (activeLogbook === 'child' && calculatedBCGAge) {
            payloadData.bcg_age_category = calculatedBCGAge;
        }

        if (activeLogbook === 'child') {
            const cleanedVaccines = vaccineRows
                .map(cleanVaccineRecord)
                .filter(isMeaningfulVaccineRecord);

            if (cleanedVaccines.length === 0) {
                showToast('Add at least one vaccine record or remove the child care vaccine entry.', true);
                setIsSubmitting(false);
                return;
            }

            const incompleteVaccines = cleanedVaccines.some(row => !row.vaccine_name || !row.date_given);
            if (incompleteVaccines) {
                showToast('Each vaccine record needs a selected vaccine and date given.', true);
                setIsSubmitting(false);
                return;
            }

            const incompleteOther = cleanedVaccines.some(row => row.vaccine_name === OTHER_VACCINE_NAME && !row.other_vaccine_name);
            if (incompleteOther) {
                showToast('Specify the vaccine name for every Others / Specify record.', true);
                setIsSubmitting(false);
                return;
            }

            payloadData.vaccine_records = cleanedVaccines;
            const bcgRecord = cleanedVaccines.find(row => row.vaccine_name.toLowerCase() === 'bcg');
            if (bcgRecord?.date_given) payloadData.bcg_date = bcgRecord.date_given;
        }

        if (activeLogbook === 'family_planning') {
            const age = Number(selectedPatient.age);
            payloadData.fp_age_bracket = age >= 10 && age <= 14 ? "10-14" : (age >= 15 && age <= 19 ? "15-19" : "20-49");
        }

        if (activeLogbook === 'dental' && formData.received_bohc) {
            const age = Number(selectedPatient.age);
            payloadData.dental_age_bracket = age >= 10 && age <= 14 ? "10-14" : (age >= 15 && age <= 19 ? "15-19" : (age >= 20 && age <= 59 ? "20-59" : "Other Ages"));
        }

        if (activeLogbook === 'ncd') {
            payloadData.is_senior_citizen = Number(selectedPatient.age) >= 60 ? "Yes" : "No";
        }

        try {
            await midwifeAPI.saveFHSISLog({
                patientId: selectedPatient.id,
                category: activeLogbook,
                data: payloadData
            });
            
            // Show Global UI Success Toast
            showToast('FHSIS entry recorded.', false, 'The patient census record is now available for reporting.');
            
            setTimeout(async () => {
                setFormData({}); 
                setVaccineRows([createVaccineRecord({
                    vaccine_category: 'Child Care / Core RHU Immunization',
                    vaccine_name: 'BCG',
                    dose_label: 'Birth dose',
                })]);
                setSelectedPatient(null);
                setSearchQuery('');
                setIsAddingEntry(false);
                await onSaveSuccess(); 
            }, 2500);
            
        } catch (error: any) {
            console.error("FHSIS Save Error:", error);
            logError('Failed to save midwife census record', error);
            setErrorMsg(healthcareErrorMessage("save the census record"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const logbooks = [
        { id: 'maternal', label: 'Maternal Care', icon: 'heart-pulse' },
        { id: 'child', label: 'Child Care', icon: 'baby' },
        { id: 'family_planning', label: 'Family Planning', icon: 'pill' },
        { id: 'dental', label: 'Dental Health', icon: 'smile' },
        { id: 'ncd', label: 'NCD & Seniors', icon: 'stethoscope' },
        { id: 'rabies_leprosy', label: 'Rabies & Leprosy', icon: 'shield-plus' }
    ];

    return (
        <div className="w-full  relative pb-10">
            
            <ToastComponent />
            <div className="mb-8">
                <h2 className="text-2xl font-extrabold text-[var(--text)] tracking-tight">Program Logbooks (FHSIS)</h2>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mt-5">
                    {logbooks.map(log => (
                        <button 
                            type="button"
                            key={log.id}
                            onClick={() => { 
                                setActiveLogbook(log.id); 
                                setIsAddingEntry(false);
                                setFormData({});
                                setVaccineRows([createVaccineRecord({
                                    vaccine_category: 'Child Care / Core RHU Immunization',
                                    vaccine_name: 'BCG',
                                    dose_label: 'Birth dose',
                                })]);
                                setSelectedPatient(null);
                            }}
                            className={`clinical-filter-button flex-none ${activeLogbook === log.id ? 'is-active' : ''}`}
                            aria-pressed={activeLogbook === log.id}
                        >
                            <span className="inline-flex items-center gap-2"><Icon name={log.icon} className="h-4 w-4" />{log.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={isSubmitting ? 'opacity-60 pointer-events-none' : ''}>
                {!isAddingEntry ? (
                    <div className="card shadow-sm border border-[var(--border)]">
                        <div className="card-hd border-b border-[var(--border-soft)] pb-4 mb-0 bg-[var(--surface-subtle)]/50 p-6 rounded-t-2xl">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text)]">{logbooks.find(l => l.id === activeLogbook)?.label} Registry</h3>
                            </div>
                            <button type="button" onClick={() => setIsAddingEntry(true)} className="px-4 py-2 bg-[var(--brand-active)] text-white rounded-lg text-sm font-bold shadow-md hover:bg-[var(--brand-active-hover)]">
                                <Icon name="plus" className="inline h-4 w-4 mr-1" /> New Entry
                            </button>
                        </div>
                        <div className="clinical-table-scroll">
                            <table className="clinical-table min-w-[720px]">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Patient Name</th>
                                        <th>Address</th>
                                        <th className="text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeRecords.length > 0 ? activeRecords.map(record => (
                                        <tr key={record.id}>
                                            <td className="text-[var(--text-2)] font-medium">{new Date(record.created_at).toLocaleDateString()}</td>
                                            <td className="font-bold text-[var(--text)] capitalize">{record.patientName}</td>
                                            <td className="capitalize text-[var(--text-2)]">{record.address || 'No Address'}</td>
                                            <td className="text-right"><span className="clinical-status-badge success">Saved</span></td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={4}><div className="clinical-table-state">No census entries recorded for this logbook yet. Use New Entry to add a patient record.</div></td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="card shadow-sm border border-[var(--border)] p-8 ">
                        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-[var(--border-soft)]">
                            <button type="button" onClick={() => setIsAddingEntry(false)} className="px-3 py-1.5 text-sm font-semibold text-[var(--text-2)] bg-[var(--surface-subtle)] rounded-lg hover:bg-[var(--border-soft)]">← Back</button>
                            <h3 className="text-xl font-extrabold text-[var(--text)]">New {logbooks.find(l => l.id === activeLogbook)?.label} Entry</h3>
                        </div>

                        {errorMsg && <div className="mb-6 p-4 bg-[var(--coral-tint)] text-[var(--coral-dark)] rounded-xl text-sm font-semibold flex items-start gap-2" role="alert"><Icon name="alert-triangle" className="h-5 w-5 shrink-0" /> {errorMsg}</div>}

                        <div className="max-w-3xl">
                            {/* STEP 1: PATIENT SELECTION */}
                            <div className="mb-10">
                                <label className="block text-sm font-bold text-[var(--text-2)] mb-3 uppercase tracking-wide">1. Select Patient</label>
                                {!selectedPatient ? (
                                    <div className="relative">
                                        <input type="text" aria-label="Search patient name for census entry" placeholder="Search patient name..." value={searchQuery} onFocus={() => setShowDropdown(true)} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-4 pr-4 py-3 border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-color)] outline-none shadow-sm" />
                                        {showDropdown && searchQuery && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-sm border border-[var(--border)] max-h-64 overflow-y-auto z-50">
                                                {filteredPatients.length > 0 ? filteredPatients.map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            if (activeLogbook === 'maternal' && !isFemalePatient(p)) {
                                                                setErrorMsg(MATERNAL_ELIGIBILITY_MESSAGE);
                                                                showToast(MATERNAL_ELIGIBILITY_MESSAGE, true);
                                                                return;
                                                            }
                                                            setErrorMsg('');
                                                            setSelectedPatient(p);
                                                            setShowDropdown(false);
                                                        }}
                                                        className="w-full text-left px-5 py-4 hover:bg-[var(--surface-subtle)] border-b border-[var(--border-soft)] flex justify-between"
                                                    >
                                                        <span className="font-bold text-[var(--text)] capitalize">{p.firstName} {p.lastName}</span>
                                                        <span className="text-[0.65rem] font-bold text-[var(--text-secondary)] bg-[var(--surface-subtle)] px-2 py-1 rounded uppercase">{p.address}</span>
                                                    </button>
                                                )) : (
                                                    <div className="px-5 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                                                        {activeLogbook === 'maternal'
                                                            ? 'No eligible female patients match this search.'
                                                            : 'No patients match this search.'}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-[var(--surface-subtle)] border border-[var(--border)] p-5 rounded-xl flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-[var(--text)] capitalize text-lg">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                                            {/* READ-ONLY DISPLAY FOR ALL TABS */}
                                            <p className="text-xs font-semibold text-[var(--text-2)] mt-1 uppercase">
                                                Brgy. {selectedPatient.address} • Age: {selectedPatient.age || 'N/A'} • Sex: {selectedPatient.sex || 'N/A'} 
                                                {activeLogbook === 'child' && ` • DOB: ${selectedPatient.birthday}`}
                                            </p>
                                        </div>
                                        <button type="button" onClick={() => { setSelectedPatient(null); setSearchQuery(''); }} className="px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] bg-white border border-[var(--border)] rounded-lg shadow-sm hover:bg-[var(--surface-subtle)]">Change</button>
                                    </div>
                                )}
                            </div>

                            {/* STEP 2: DYNAMIC FORMS */}
                            <form onSubmit={handleSubmit} className={!selectedPatient ? 'opacity-40 pointer-events-none' : ''}>
                                <label className="block text-sm font-bold text-[var(--text-2)] mb-3 uppercase tracking-wide">2. Program Data Input</label>
                                
                                <div className="bg-[var(--surface-subtle)]/70 border border-[var(--border)] rounded-xl p-6 mb-8">
                                    
                                    {/* 1. MATERNAL CARE */}
                                    {activeLogbook === 'maternal' && (
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase">Prenatal Checkup Visit</label>
                                                <select name="prenatal_visit" onChange={handleInputChange} required className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm">
                                                    <option value="">Select Visit...</option>
                                                    <option value="1st Trimester">1st Trimester</option>
                                                    <option value="2nd Trimester">2nd Trimester</option>
                                                    <option value="3rd Trimester - Visit 1">3rd Trimester - Visit 1</option>
                                                    <option value="3rd Trimester - Visit 2">3rd Trimester - Visit 2</option>
                                                    <option value="Extra Visit">Extra Visit (More than 4)</option>
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 p-4 bg-white border border-[var(--border)] rounded-lg">
                                                <div className="col-span-2"><h4 className="text-sm font-bold text-[var(--text)]">BMI Assessment</h4></div>
                                                <div>
                                                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Height (cm)</label>
                                                    <input type="number" name="height" onChange={handleInputChange} required className="w-full p-2 border border-[var(--border)] rounded-lg text-left text-[var(--text)] bg-white shadow-sm" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Weight (kg)</label>
                                                    <input type="number" name="weight" onChange={handleInputChange} required className="w-full p-2 border border-[var(--border)] rounded-lg text-left text-[var(--text)] bg-white shadow-sm" />
                                                </div>
                                                {calculatedBMI && (
                                                    <div className="col-span-2 mt-2 p-3 bg-[var(--surface-subtle)] rounded-lg text-sm border border-[var(--border)] flex justify-between">
                                                        <span>Calculated BMI: <strong>{calculatedBMI.value}</strong></span>
                                                        <span>Status: <strong className={calculatedBMI.status === 'Normal' ? 'text-[var(--green-accent-strong)]' : 'text-[var(--amber-accent-strong)]'}>{calculatedBMI.status}</strong></span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* 2. CHILD CARE */}
                                    {activeLogbook === 'child' && (
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase">Child Protected at Birth (CPAB)?</label>
                                                <select name="cpab" onChange={handleInputChange} required className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm">
                                                    <option value="">Select...</option>
                                                    <option value="Yes">Yes</option>
                                                    <option value="No">No</option>
                                                </select>
                                            </div>
                                            <div className="p-4 bg-white border border-[var(--border)] rounded-lg">
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                                                    <div>
                                                        <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Multiple Vaccine Records</label>
                                                        <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">Record each vaccine dose as part of this child health entry.</p>
                                                    </div>
                                                    <button type="button" onClick={addVaccineRow} className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-subtle)]">
                                                        Add Vaccine
                                                    </button>
                                                </div>
                                                <div className="space-y-3">
                                                    {vaccineRows.map((row, index) => (
                                                        <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                                                <div>
                                                                    <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Vaccine</label>
                                                                    <select value={row.vaccine_name} onChange={e => updateVaccineRow(index, 'vaccine_name', e.target.value)} className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm">
                                                                        <option value="">Select vaccine...</option>
                                                                        {VACCINE_OPTIONS.map(option => (
                                                                            <option key={`${option.category}-${option.name}`} value={option.name}>{option.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                {row.vaccine_name === OTHER_VACCINE_NAME && (
                                                                    <div>
                                                                        <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Specify Vaccine</label>
                                                                        <input value={row.other_vaccine_name || ''} onChange={e => updateVaccineRow(index, 'other_vaccine_name', e.target.value)} placeholder="Enter vaccine name" className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Dose</label>
                                                                    <input value={row.dose_label || ''} onChange={e => updateVaccineRow(index, 'dose_label', e.target.value)} placeholder="Birth dose, Dose 1..." className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Date Given</label>
                                                                    <input type="date" value={row.date_given || ''} onChange={e => updateVaccineRow(index, 'date_given', e.target.value)} className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Next Due Date</label>
                                                                    <input type="date" value={row.next_due_date || ''} onChange={e => updateVaccineRow(index, 'next_due_date', e.target.value)} className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Administered By</label>
                                                                    <input value={row.administered_by || ''} onChange={e => updateVaccineRow(index, 'administered_by', e.target.value)} placeholder="Staff name" className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Facility</label>
                                                                    <input value={row.facility || ''} onChange={e => updateVaccineRow(index, 'facility', e.target.value)} placeholder="RHU / barangay" className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Lot Number</label>
                                                                    <input value={row.lot_number || ''} onChange={e => updateVaccineRow(index, 'lot_number', e.target.value)} placeholder="Optional" className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                </div>
                                                                <div className="flex items-end gap-2">
                                                                    <div className="flex-1">
                                                                        <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Remarks</label>
                                                                        <input value={row.remarks || ''} onChange={e => updateVaccineRow(index, 'remarks', e.target.value)} placeholder="Optional" className="w-full p-2.5 border border-[var(--border)] rounded-lg text-left text-sm text-[var(--text)] bg-white shadow-sm" />
                                                                    </div>
                                                                    {vaccineRows.length > 1 && (
                                                                        <button type="button" onClick={() => removeVaccineRow(index)} className="mb-0.5 rounded-lg border border-[var(--coral-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--coral-accent-strong)] hover:bg-[var(--coral-tint)]">
                                                                            Remove
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {calculatedBCGAge && (
                                                    <div className="mt-3 p-3 bg-[var(--surface-subtle)] rounded-lg text-sm border border-[var(--border)] font-semibold text-[var(--text)]">
                                                        Auto-tagged Category: {calculatedBCGAge}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. FAMILY PLANNING */}
                                    {activeLogbook === 'family_planning' && (
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase">Method Used</label>
                                                <select name="fp_method" onChange={handleInputChange} required className="w-full p-2.5 border border-[var(--border)] rounded-lg text-sm">
                                                    <option value="">Select...</option>
                                                    <option value="BTL">BTL</option>
                                                    <option value="NSV">NSV</option>
                                                    <option value="Condom">Condom</option>
                                                    <option value="Pills">Pills</option>
                                                    <option value="IUD">IUD</option>
                                                    <option value="Injectables">Injectables</option>
                                                    <option value="Implant">Implant</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase">Client Status</label>
                                                <select name="fp_status" onChange={handleInputChange} required className="w-full p-2.5 border border-[var(--border)] rounded-lg text-sm">
                                                    <option value="">Select...</option>
                                                    <option value="Current User">Current User</option>
                                                    <option value="New Acceptor">New Acceptor</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {/* 4. DENTAL HEALTH */}
                                    {activeLogbook === 'dental' && (
                                        <div>
                                            <label className="flex items-center gap-3 p-4 bg-white border border-[var(--border)] rounded-xl cursor-pointer">
                                                <input type="checkbox" name="received_bohc" onChange={handleInputChange} className="w-5 h-5 text-[var(--text-2)] rounded focus:ring-[var(--focus-ring)]" />
                                                <span className="text-sm font-bold text-[var(--text)]">Received Basic Oral Health Care (BOHC)</span>
                                            </label>
                                            {formData.received_bohc && selectedPatient && (
                                                <p className="text-xs text-[var(--green-ink)] mt-2 font-bold px-2">Patient auto-tagged to age bracket based on age {selectedPatient.age}.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* 5. NCD & SENIORS */}
                                    {activeLogbook === 'ncd' && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <label className="flex items-center gap-3 p-3 bg-white border border-[var(--border)] rounded-lg">
                                                    <input type="checkbox" name="philpen" onChange={handleInputChange} />
                                                    <span className="text-sm font-medium">Risk-assessed (PhilPEN)</span>
                                                </label>
                                                <label className="flex items-center gap-3 p-3 bg-white border border-[var(--border)] rounded-lg">
                                                    <input type="checkbox" name="visual_acuity" onChange={handleInputChange} />
                                                    <span className="text-sm font-medium">Screened for Visual Acuity</span>
                                                </label>
                                                <label className="flex items-center gap-3 p-3 bg-white border border-[var(--border)] rounded-lg">
                                                    <input type="checkbox" name="ppv" onChange={handleInputChange} />
                                                    <span className="text-sm font-medium">Received PPV Dose</span>
                                                </label>
                                                <label className="flex items-center gap-3 p-3 bg-white border border-[var(--border)] rounded-lg">
                                                    <input type="checkbox" name="influenza" onChange={handleInputChange} />
                                                    <span className="text-sm font-medium">Received Influenza Dose</span>
                                                </label>
                                            </div>
                                            <div className="mt-4">
                                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase">Diagnosed with eye disease/s?</label>
                                                <select name="eye_disease" onChange={handleInputChange} className="w-full md:w-1/2 p-2.5 border border-[var(--border)] rounded-lg text-sm">
                                                    <option value="">Select...</option>
                                                    <option value="Yes">Yes</option>
                                                    <option value="No">No</option>
                                                </select>
                                            </div>
                                            {selectedPatient?.age >= 60 && (
                                                <p className="text-xs text-[var(--green-ink)] font-bold px-2">Auto-tagged as Senior Citizen.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* 6. RABIES & LEPROSY */}
                                    {activeLogbook === 'rabies_leprosy' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="p-4 bg-white border border-[var(--border)] rounded-lg">
                                                <h4 className="font-bold text-sm text-[var(--text)] mb-3 border-b pb-2">Leprosy Status</h4>
                                                <select name="leprosy_status" onChange={handleInputChange} className="w-full p-2.5 border border-[var(--border)] rounded-lg text-sm">
                                                    <option value="None / N/A">None / N/A</option>
                                                    <option value="Newly Detected Case">Newly Detected Case</option>
                                                    <option value="On Treatment">On Treatment</option>
                                                </select>
                                            </div>
                                            <div className="p-4 bg-white border border-[var(--border)] rounded-lg">
                                                <h4 className="font-bold text-sm text-[var(--text)] mb-3 border-b pb-2">Rabies / Animal Bite</h4>
                                                <label className="flex items-center gap-3 mb-3 cursor-pointer">
                                                    <input type="checkbox" name="animal_bite" onChange={handleInputChange} className="w-4 h-4 text-[var(--text-2)] rounded" />
                                                    <span className="text-sm font-medium">Patient had an animal bite</span>
                                                </label>
                                                {formData.animal_bite && (
                                                    <div>
                                                        <label className="block text-[0.65rem] font-bold text-[var(--text-secondary)] mb-1 uppercase">Outcome</label>
                                                        <select name="rabies_outcome" onChange={handleInputChange} required className="w-full p-2 border border-[var(--border)] rounded-lg text-sm">
                                                            <option value="">Select Outcome...</option>
                                                            <option value="Alive/Recovered">Alive/Recovered</option>
                                                            <option value="Death due to Rabies">Death due to Rabies</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex justify-end pt-4">
                                    <button type="submit" disabled={isSubmitting || !selectedPatient} className="px-8 py-3 bg-[var(--brand-active)] text-white text-sm font-bold rounded-xl shadow-sm hover:bg-[var(--brand-active-hover)] transition flex items-center gap-2">
                                        {isSubmitting ? <span className="animate-pulse">Recording Census Entry...</span> : 'Record FHSIS Entry'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CensusEntry;
