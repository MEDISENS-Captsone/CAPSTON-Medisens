import { useMemo, useState } from 'react';
import { Icon } from '../../components/shared/Icon';

interface Props {
    patients: any[];
    rhuPersonnel: string;
    censusRecords: any[];
    onNavigateToRecords: () => void;
    onPatientClick?: (patient: any) => void;
    isLoading?: boolean;
    hasLoadError?: boolean;
}

const Dashboard = ({ patients, censusRecords, onNavigateToRecords, onPatientClick, isLoading = false, hasLoadError = false }: Props) => {
    const recentPatients = useMemo(() => {
        return [...patients]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((patient: any) => ({
                ...patient,
                consent_signed: Array.isArray(patient.patient_consent)
                    ? patient.patient_consent.length > 0
                    : patient.patient_consent !== null,
            }));
    }, [patients]);

    const [consentFilter, setConsentFilter] = useState<'all' | 'pending' | 'signed'>('all');
    const filteredPatients = recentPatients.filter(patient => {
        if (consentFilter === 'pending') return !patient.consent_signed;
        if (consentFilter === 'signed') return patient.consent_signed;
        return true;
    });

    const maternalCount = censusRecords.filter(record => record.category === 'maternal').length;
    const childCount = censusRecords.filter(record => record.category === 'child').length;
    const fpCount = censusRecords.filter(record => record.category === 'family_planning').length;
    const totalPatients = patients.length;

    const todayCount = useMemo(() => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        return censusRecords.filter(record => {
            if (!record.created_at) return false;
            return new Date(record.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === today;
        }).length;
    }, [censusRecords]);

    return (
        <div className="w-full max-w-full">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Today&apos;s care overview</p>
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">Maternal & Child Health Work Queue</h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Review current-month care activity, consent status, and patients who may need follow-up.</p>
                </div>
                <button type="button" onClick={onNavigateToRecords} className="clinical-row-action min-h-11 self-start sm:self-auto"><Icon name="users" className="h-4 w-4" /> Open patient records</button>
            </div>

            {hasLoadError && !isLoading && (
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-[var(--coral-border)] bg-[var(--coral-tint)] p-4 text-sm text-[var(--coral-dark)]" role="alert">
                    <Icon name="alert-triangle" className="mt-0.5 h-5 w-5 shrink-0" />
                    <div><p className="font-semibold">Some Midwife data could not be loaded</p><p className="mt-0.5">Refresh the page or try again when the connection is stable.</p></div>
                </div>
            )}

            <div className="ops-summary-grid mb-5 w-full" aria-label="Midwife operational summary">
                {[
                    { icon: 'users', label: 'Master Registry', value: totalPatients, note: 'All registered patients' },
                    { icon: 'heart-pulse', label: 'Maternal Care', value: maternalCount, note: 'Active maternal records' },
                    { icon: 'baby', label: 'Child Care & Vaccination', value: childCount, note: 'Child health entries' },
                    { icon: 'pill', label: 'Family Planning', value: fpCount, note: 'Family planning entries' },
                ].map(({ icon, label, value, note }) => (
                    <div key={label} className="ops-summary-card role-summary-card">
                        <div className="role-summary-card-topline">
                            <div className="ops-summary-label">{label}</div>
                            <span className="role-summary-icon"><Icon name={icon} className="h-4 w-4" /></span>
                        </div>
                        <div className="ops-summary-value tabular-nums">{value}</div>
                        <div className="ops-summary-note">{note}</div>
                    </div>
                ))}
            </div>

            <div className="ops-grid w-full">
                <div className="ops-panel flex w-full flex-col lg:col-span-8">
                    <div className="flex w-full items-start justify-between border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                        <div><h3 className="text-base font-semibold tracking-tight text-[var(--text)]">Recent FHSIS Entries</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">Latest census records submitted for the active reporting month.</p></div>
                        <span className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-2)]">{todayCount} Today</span>
                    </div>
                    <div className="w-full flex-1">
                        {isLoading ? (
                            <div className="space-y-3 p-5" aria-label="Loading recent care activity">{[0, 1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-[var(--surface-subtle)]" />)}</div>
                        ) : censusRecords.length === 0 ? (
                            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center"><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[var(--text-muted)]"><Icon name="clipboard" className="h-5 w-5" /></span><p className="font-semibold text-[var(--text)]">No care entries this month</p><p className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">New maternal, child care, vaccination, and community-program entries will appear here.</p></div>
                        ) : (
                            <div className="w-full divide-y divide-[var(--border-soft)]">{censusRecords.slice(0, 6).map((record, index) => (
                                <div key={record.id || index} className="flex w-full items-center gap-3 p-4 transition-colors hover:bg-[var(--surface-subtle)] sm:gap-4 sm:px-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] text-base font-bold uppercase text-[var(--text-2)]">{record.patientName?.charAt(0) || 'P'}</div><div className="min-w-0 flex-1"><div className="truncate text-base font-bold capitalize text-[var(--text)]">{record.patientName || 'Unknown'}</div><div className="mt-1 truncate text-[0.7rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{record.category} · Brgy. {record.address || 'N/A'}</div></div><div className="shrink-0 text-sm font-semibold text-[var(--text-secondary)]">{new Date(record.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div></div>
                            ))}</div>
                        )}
                    </div>
                </div>

                <section className="ops-panel flex w-full flex-col overflow-hidden lg:col-span-4" aria-labelledby="midwife-patient-directory-heading">
                    <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                        <div className="flex items-start justify-between gap-3"><div><h3 id="midwife-patient-directory-heading" className="text-base font-semibold tracking-tight text-[var(--text)]">Patient Directory</h3><p className="mt-1 text-sm text-[var(--text-secondary)]"><span className="font-semibold tabular-nums text-[var(--text)]">{filteredPatients.length}</span> {consentFilter === 'all' ? 'registered patients' : `${consentFilter} patients`}</p></div><button type="button" onClick={onNavigateToRecords} className="clinical-row-action min-h-10 shrink-0">View all</button></div>
                        <div className="mt-3 inline-flex rounded-lg border border-[var(--border)] bg-white p-1" role="group" aria-label="Filter patients by consent status">
                            {(['all', 'pending', 'signed'] as const).map(filter => {
                                const isActive = consentFilter === filter;
                                return (
                                    <button key={filter} type="button" onClick={() => setConsentFilter(filter)} aria-pressed={isActive} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-color)] ${isActive ? 'bg-[var(--brand-active)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}>
                                        {isActive && filter === 'pending' && <Icon name="alert-triangle" className="h-3.5 w-3.5" />}
                                        {isActive && filter === 'signed' && <Icon name="check" className="h-3.5 w-3.5" />}
                                        {filter}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="max-h-[600px] flex-1 divide-y divide-[var(--border-soft)] overflow-y-auto bg-white scrollbar-thin">
                        {isLoading ? [0, 1, 2, 3, 4].map(item => <div key={item} className="mx-4 my-3 h-12 animate-pulse rounded-lg bg-[var(--surface-subtle)]" />) : filteredPatients.length > 0 ? filteredPatients.map(patient => (
                            <button key={patient.id} type="button" onClick={() => onPatientClick?.(patient)} aria-label={`Open patient details for ${patient.lastName}, ${patient.firstName}`} className="clinical-row-button group flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-subtle)]">
                                <div className="min-w-0 text-left"><p className="truncate text-sm font-semibold capitalize text-[var(--text)] group-hover:text-[var(--text-2)]">{patient.lastName}, {patient.firstName}</p><p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{patient.age ?? '--'} yrs · {patient.sex || 'N/A'}</p></div>
                                <div className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
                                    <time className="text-xs font-medium tabular-nums text-[var(--text-muted)]" dateTime={patient.created_at}>{new Date(patient.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time>
                                    {patient.consent_signed ? (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--green-border-soft)] bg-[var(--green-surface)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--green-ink)]"><Icon name="check" className="h-3 w-3" /> Signed</span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--amber-border)] bg-[var(--amber-surface)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--amber-accent-strong)]"><Icon name="alert-triangle" className="h-3 w-3" /> Pending</span>
                                    )}
                                </div>
                            </button>
                        )) : (
                            <div className="flex min-h-52 flex-col items-center justify-center px-5 py-8 text-center"><Icon name={consentFilter === 'pending' ? 'alert-triangle' : consentFilter === 'signed' ? 'check' : 'users'} className="mb-3 h-7 w-7 text-[var(--text-muted)]" /><p className="text-sm font-semibold text-[var(--text)]">{consentFilter === 'all' ? 'No patients available' : `No ${consentFilter} patients`}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[var(--text-secondary)]">{consentFilter === 'all' ? 'Registered patients will appear here when records become available.' : `No patients currently match the ${consentFilter} consent filter.`}</p></div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Dashboard;
