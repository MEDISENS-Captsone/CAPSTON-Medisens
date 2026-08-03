import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase/client';
import { Icon } from '../../components/shared/Icon';
import { Badge, Button, EmptyState, Input } from '../../components/ui';
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
const PATIENTS_PER_PAGE = 10;
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

type RecordsComponentProps = {
    onPatientClick?: (patient: Patient) => void;
};

function getVisiblePageNumbers(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis', totalPages];
    if (currentPage >= totalPages - 2) return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export function RecordsComponent({ onPatientClick }: RecordsComponentProps = {}) {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [allPatients, setAllPatients] = useState<Patient[]>([]);
    const [search, setSearch] = useState('');
    const [selectedBarangay, setSelectedBarangay] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const registrySectionRef = useRef<HTMLElement>(null);

    const fetchPatients = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        const { data, error } = await supabase
            .from('patients')
            .select(PATIENT_REGISTRY_COLUMNS)
            .or('archive_status.eq.active,archive_status.is.null')
            .order('lastName', { ascending: true })
            .limit(PATIENT_REGISTRY_LIMIT);

        if (error) {
            console.error('Database Error:', error);
            // A failed load must not be presented as an empty registry.
            setLoadError(true);
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

    useEffect(() => {
        setCurrentPage(1);
    }, [search, selectedBarangay]);

    const totalPages = Math.max(1, Math.ceil(patients.length / PATIENTS_PER_PAGE));
    const pageStart = (currentPage - 1) * PATIENTS_PER_PAGE;
    const visiblePatients = patients.slice(pageStart, pageStart + PATIENTS_PER_PAGE);
    const visiblePageNumbers = useMemo(
        () => getVisiblePageNumbers(currentPage, totalPages),
        [currentPage, totalPages],
    );

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const changePage = (page: number) => {
        const nextPage = Math.min(Math.max(page, 1), totalPages);
        if (nextPage === currentPage) return;
        setCurrentPage(nextPage);
        requestAnimationFrame(() => {
            registrySectionRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
        });
    };

    const handleRowClick = (p: Patient) => {
        if (onPatientClick) {
            onPatientClick(p);
        } else {
            window.location.href = `/pages/details.html?id=${p.id}`;
        }
    };

    return (
        <div className="w-full">
            <section ref={registrySectionRef} className="clinical-table-panel">
                <div className="clinical-table-titlebar">
                    <div>
                        <h2 className="clinical-table-title">Patient Registry</h2>
                        <p className="clinical-table-subtitle">{allPatients.length} registered patient{allPatients.length !== 1 ? 's' : ''}</p>
                    </div>
                    <Badge tone="slate" className="clinical-count-badge">{patients.length} result{patients.length !== 1 ? 's' : ''}</Badge>
                </div>

                <div className="clinical-toolbar">
                    <Input
                        type="text"
                        aria-label="Search patient records by name"
                        placeholder="Search by name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        leadingIcon={<Icon name="search" className="h-4 w-4" />}
                        containerClassName="min-w-[min(100%,18rem)] flex-1"
                    />

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
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                leadingIcon={<Icon name="close" className="h-4 w-4" />}
                                onClick={() => setSelectedBarangay('')}
                                className="clinical-secondary-action text-[length:var(--type-button-size)]"
                            >
                                Clear
                            </Button>
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
                            ) : loadError ? (
                                <tr className="patient-records-state-row">
                                    <td colSpan={6}>
                                        <div role="alert">
                                            <EmptyState
                                                icon={<Icon name="alert-triangle" className="h-5 w-5" />}
                                                title="Patient records could not be loaded."
                                                className="clinical-table-state rounded-none border-0"
                                            />
                                            <div className="flex justify-center pb-4">
                                                <Button type="button" variant="outline" size="sm" onClick={() => void fetchPatients()}>Retry</Button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : patients.length === 0 ? (
                                <tr className="patient-records-state-row">
                                    <td colSpan={6}>
                                        <EmptyState
                                            icon={<Icon name="inbox" className="h-5 w-5" />}
                                            title={allPatients.length === 0 ? 'No patients are registered yet.' : 'No patients match the current search or filter.'}
                                            className="clinical-table-state rounded-none border-0"
                                        />
                                    </td>
                                </tr>
                            ) : (
                                visiblePatients.map(p => (
                                    <tr key={p.id} onClick={() => handleRowClick(p)} className="cursor-pointer">
                                        <td className="patient-records-col-patient">
                                            <div className="patient-records-primary-cell">
                                                <div className="clinical-primary">{p.lastName}, {p.firstName} {p.middleName || ''} {p.suffix || ''}</div>
                                                <div className="clinical-secondary">Patient record no. {p.id}</div>
                                            </div>
                                        </td>
                                        <td className="patient-records-col-demographics">{p.age ?? '-'} / {p.sex || '-'}</td>
                                        <td className="patient-records-col-barangay">{p.address?.split(',')[0] || '-'}</td>
                                        <td className="patient-records-col-classification"><Badge tone="slate" className="clinical-neutral-badge patient-records-classification-badge">{p.category === 'Other/s' ? p.categoryOthers || 'Other' : p.category || 'Unclassified'}</Badge></td>
                                        <td className="patient-records-col-contact">{p.contactNumber || '-'}</td>
                                        <td className="patient-records-col-action text-right">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleRowClick(p);
                                                }}
                                                className="clinical-link-action"
                                            >
                                                View Chart
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && !loadError && patients.length > 0 && (
                    <footer className="flex flex-col gap-3 border-t border-[var(--border-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-center text-[length:var(--type-supporting-size)] text-[var(--text-secondary)] sm:text-left" aria-live="polite">
                            Showing {pageStart + 1}&ndash;{Math.min(pageStart + PATIENTS_PER_PAGE, patients.length)} of {patients.length} patients
                        </p>
                        <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Patient registry pagination">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => changePage(currentPage - 1)}
                            >
                                Previous
                            </Button>
                            {visiblePageNumbers.map((page, index) => page === 'ellipsis' ? (
                                <span key={`ellipsis-${index}`} className="inline-flex min-h-11 min-w-7 items-center justify-center text-[var(--text-muted)]" aria-hidden="true">&hellip;</span>
                            ) : (
                                <Button
                                    key={page}
                                    type="button"
                                    variant={page === currentPage ? 'primary' : 'ghost'}
                                    size="sm"
                                    aria-label={`Go to page ${page}`}
                                    aria-current={page === currentPage ? 'page' : undefined}
                                    onClick={() => changePage(page)}
                                    className="min-h-11 min-w-11 px-2"
                                >
                                    {page}
                                </Button>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={currentPage === totalPages}
                                onClick={() => changePage(currentPage + 1)}
                            >
                                Next
                            </Button>
                        </nav>
                    </footer>
                )}
            </section>
        </div>
    );
}
