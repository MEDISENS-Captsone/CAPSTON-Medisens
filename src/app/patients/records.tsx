import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase/client';
import { Icon } from '../../components/shared/Icon';
import { SkeletonTable } from '../../components/ui/Skeleton';

const MALVAR_BARANGAYS = [
    'Bagong Pook, Malvar, Batangas',
    'Bilucao, Malvar, Batangas',
    'Bulihan, Malvar, Batangas',
    'Luta del Norte, Malvar, Batangas',
    'Luta del Sur, Malvar, Batangas',
    'Poblacion, Malvar, Batangas',
    'San Andres, Malvar, Batangas',
    'San Fernando, Malvar, Batangas',
    'San Gregorio, Malvar, Batangas',
    'San Isidro, Malvar, Batangas',
    'San Juan, Malvar, Batangas',
    'San Pedro I, Malvar, Batangas',
    'San Pedro II, Malvar, Batangas',
    'San Pioquinto, Malvar, Batangas',
    'Santiago, Malvar, Batangas',
] as const;

const OUTSIDE_MALVAR = '__outside__';
const PATIENT_REGISTRY_LIMIT = 1000;
const PATIENT_REGISTRY_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, bloodType, address, contactNumber, birthday, civilStatus, nationality, religion, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress, created_at, archive_status, archive_protected';

interface Patient {
    id: string;
    firstName: string;
    middleName: string;
    lastName: string;
    suffix: string;
    age: number | null;
    sex: string;
    bloodType: string;
    address?: string;
    contactNumber?: string;
    birthday?: string;
    civilStatus?: string;
    nationality?: string;
    religion?: string;
    educationalAttain?: string;
    employmentStatus?: string;
    philhealthNo?: string;
    philhealthStatus?: string;
    category?: string;
    categoryOthers?: string;
    relativeName?: string;
    relativeRelation?: string;
    relativeAddress?: string;
    archive_status?: 'active' | 'archived' | null;
    archive_protected?: boolean | null;
}

export function RecordsComponent({ onPatientClick }: { onPatientClick?: (patient: Patient) => void } = {}) {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [allPatients, setAllPatients] = useState<Patient[]>([]);
    const [search, setSearch] = useState('');
    const [selectedBarangay, setSelectedBarangay] = useState<string>('');
    const [loading, setLoading] = useState(true);

    const fetchPatients = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('patients')
            .select(PATIENT_REGISTRY_COLUMNS)
            .or('archive_status.eq.active,archive_status.is.null')
            .order('lastName', { ascending: true })
            .limit(PATIENT_REGISTRY_LIMIT);

        if (error) {
            console.error('Database Error:', error);
            setLoading(false);
            return;
        }

        setAllPatients(data as Patient[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchPatients();
    }, [fetchPatients]);

    useEffect(() => {
        const lower = search.toLowerCase();
        const filtered = allPatients.filter(p => {
            const nameMatch = `${p.firstName} ${p.middleName} ${p.lastName}`
                .toLowerCase().includes(lower);
            const barangayMatch =
                selectedBarangay === ''
                    ? true
                    : selectedBarangay === OUTSIDE_MALVAR
                        ? !MALVAR_BARANGAYS.some(b => p.address?.toLowerCase().includes(b.toLowerCase()))
                        : p.address?.toLowerCase().includes(selectedBarangay.toLowerCase());
            return nameMatch && barangayMatch;
        });
        setPatients(filtered);
    }, [search, selectedBarangay, allPatients]);

    const handleRowClick = (p: Patient) => {
        if (onPatientClick) {
            onPatientClick(p);
        } else {
            window.location.href = `/pages/details.html?id=${p.id}`;
        }
    };

    return (
        <div className="w-full">
            <section className="clinical-table-panel">
                <div className="clinical-table-titlebar">
                    <div>
                        <h2 className="clinical-table-title">Patient Registry</h2>
                        <p className="clinical-table-subtitle">{patients.length} registered patient{patients.length !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="clinical-count-badge">{patients.length} result{patients.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="clinical-toolbar">
                    <div className="clinical-search">
                        <Icon name="search" className="h-4 w-4 text-[var(--text-secondary)]" />
                        <input
                            type="text"
                            aria-label="Search patient records by name"
                            placeholder="Search by name..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="clinical-filter-group">
                        <div className="clinical-select">
                            <select
                                value={selectedBarangay}
                                onChange={e => setSelectedBarangay(e.target.value)}
                                aria-label="Filter patient records by barangay"
                            >
                                <option value="">All Barangays</option>
                                {MALVAR_BARANGAYS.map(b => (
                                    <option key={b} value={b}>{b.split(',')[0]}</option>
                                ))}
                                <option value={OUTSIDE_MALVAR}>Outside Malvar</option>
                            </select>
                        </div>

                        {selectedBarangay && (
                            <button type="button" onClick={() => setSelectedBarangay('')} className="clinical-secondary-action">
                                <Icon name="close" className="h-3.5 w-3.5" /> Clear
                            </button>
                        )}
                    </div>
                </div>

                {selectedBarangay && (
                    <div className="clinical-filter-note">
                        Showing patients from <span>{selectedBarangay === OUTSIDE_MALVAR ? 'Outside Malvar' : selectedBarangay.split(',')[0]}</span>
                    </div>
                )}

                <div className="clinical-table-scroll">
                    <table className="clinical-table patient-records-table min-w-[760px]">
                        <thead>
                            <tr>
                                <th className="patient-records-col-patient">Patient</th>
                                <th className="patient-records-col-demographics">Age / Sex</th>
                                <th className="patient-records-col-barangay">Barangay</th>
                                <th className="patient-records-col-classification">Classification</th>
                                <th className="patient-records-col-contact">Contact</th>
                                <th className="patient-records-col-action text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="patient-records-state-row">
                                    <td colSpan={6}>
                                        <SkeletonTable rows={6} columns={6} />
                                    </td>
                                </tr>
                            ) : patients.length === 0 ? (
                                <tr className="patient-records-state-row">
                                    <td colSpan={6}>
                                        <div className="clinical-table-state">
                                            <Icon name="inbox" className="h-5 w-5 text-[var(--border-strong)]" />
                                            No matching patients found.
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                patients.map(p => (
                                    <tr key={p.id} onClick={() => handleRowClick(p)} className="cursor-pointer">
                                        <td className="patient-records-col-patient">
                                            <div className="patient-records-primary-cell">
                                                <div className="clinical-primary">{p.lastName}, {p.firstName} {p.middleName || ''} {p.suffix || ''}</div>
                                                <div className="clinical-secondary">Patient record no. {p.id}</div>
                                            </div>
                                        </td>
                                        <td className="patient-records-col-demographics">{p.age ?? '-'} / {p.sex || '-'}</td>
                                        <td className="patient-records-col-barangay">{p.address?.split(',')[0] || '-'}</td>
                                        <td className="patient-records-col-classification"><span className="clinical-neutral-badge patient-records-classification-badge">{p.category === 'Other/s' ? p.categoryOthers || 'Other' : p.category || 'Unclassified'}</span></td>
                                        <td className="patient-records-col-contact">{p.contactNumber || '-'}</td>
                                        <td className="patient-records-col-action text-right">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleRowClick(p);
                                                }}
                                                className="clinical-link-action"
                                            >
                                                View Chart
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
