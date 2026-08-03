import { useMemo } from 'react';
import { Icon } from '../../components/shared/Icon';

interface Props {
    patients: any[];
    rhuPersonnel: string;
    censusRecords: any[];
    onNavigateToRecords: () => void;
    isLoading?: boolean;
    hasLoadError?: boolean;
}

const Dashboard = ({ patients, censusRecords, onNavigateToRecords, isLoading = false, hasLoadError = false }: Props) => {
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
                <div className="ops-panel flex w-full flex-col lg:col-span-12">
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

            </div>
        </div>
    );
};

export default Dashboard;
