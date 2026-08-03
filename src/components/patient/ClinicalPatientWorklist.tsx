import { useMemo, useState } from 'react';
import { Icon } from '../shared/Icon';
import { Button, EmptyState, Input } from '../ui';
import { MALVAR_BARANGAY_SHORT_NAMES, matchMalvarBarangay } from '../../lib/utils/malvarBarangays';

export interface ClinicalWorklistPatient {
    id: string | number;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    age?: number | string | null;
    sex?: string | null;
    address?: string | null;
    bloodType?: string | null;
    birthday?: string | null;
    recordDate?: string | null;
    recordLabel?: string | null;
}

interface Props {
    patients: ClinicalWorklistPatient[];
    onSelect: (patient: ClinicalWorklistPatient) => void;
    title?: string;
    instruction?: string;
    emptyMessage?: string;
    loading?: boolean;
    error?: string;
    onRetry?: () => void;
    actionLabel?: string;
    searchPlaceholder?: string;
    showBarangayFilter?: boolean;
    /** Centered, height-limited card with no desktop table — used where a compact
     * selector fits the workflow better than a full-width dashboard table. */
    compact?: boolean;
}

const displayName = (patient: ClinicalWorklistPatient) => `${patient.lastName || ''}, ${patient.firstName || ''} ${patient.middleName || ''}`.replace(/\s+/g, ' ').trim();
// Only ever labels a patient with one of the actual stored Malvar barangays.
// Addresses that don't match a known barangay (e.g. "Outside Malvar" entries)
// are labelled honestly rather than showing a raw free-text fragment.
const barangay = (address?: string | null) => matchMalvarBarangay(address) ?? (address?.trim() ? 'Outside Malvar' : 'Not recorded');

export function ClinicalPatientWorklist({
    patients, onSelect, title = 'Patient worklist', instruction = 'Select a patient to continue.',
    emptyMessage = 'No eligible patients are currently available.', loading = false, error = '', onRetry,
    actionLabel = 'Select patient', searchPlaceholder = 'Search by patient name or record number...', showBarangayFilter = false,
    compact = false,
}: Props) {
    const [search, setSearch] = useState('');
    const [selectedBarangay, setSelectedBarangay] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return patients.filter(patient => {
            const matchesSearch = !query || `${displayName(patient)} ${patient.id}`.toLowerCase().includes(query);
            return matchesSearch && (!selectedBarangay || matchMalvarBarangay(patient.address) === selectedBarangay);
        });
    }, [patients, search, selectedBarangay]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const resetFilters = (value: string, isBarangay = false) => { setPage(1); isBarangay ? setSelectedBarangay(value) : setSearch(value); };

    return (
        <section className="clinical-table-panel" aria-labelledby="clinical-worklist-heading">
            <div className="clinical-table-titlebar">
                <div><p className="clinical-eyebrow">Clinical worklist</p><h2 id="clinical-worklist-heading" className="clinical-table-title">{title}</h2><p className="clinical-table-subtitle">{instruction}</p></div>
                <span className="clinical-count-badge">{filtered.length} ready</span>
            </div>
            <div className="clinical-toolbar">
                <Input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onChange={event => resetFilters(event.target.value)} leadingIcon={<Icon name="search" className="h-4 w-4" />} containerClassName="min-w-[min(100%,18rem)] flex-1" />
                {showBarangayFilter && <select aria-label="Filter by barangay" value={selectedBarangay} onChange={event => resetFilters(event.target.value, true)} className="clinical-select min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold"><option value="">All barangays</option>{MALVAR_BARANGAY_SHORT_NAMES.map(value => <option key={value} value={value}>{value}</option>)}</select>}
            </div>
            {loading ? <div className="p-8"><div className="clinical-table-state">Loading patient worklist…</div></div> : error ? <div className="p-6" role="alert"><EmptyState title={error} icon={<Icon name="alert-triangle" className="h-5 w-5" />} /><div className="mt-3 flex justify-center">{onRetry && <Button type="button" variant="outline" onClick={onRetry}>Try again</Button>}</div></div> : filtered.length === 0 ? <div className="p-6"><EmptyState title={emptyMessage} icon={<Icon name="inbox" className="h-5 w-5" />} /></div> : <>
                {!compact && <div className="hidden overflow-x-auto md:block"><table className="clinical-table min-w-[760px]"><thead><tr><th>Patient</th><th>Age / Sex</th><th>Barangay</th><th>Blood type</th><th>Referral / intake date</th><th className="text-right">Action</th></tr></thead><tbody>{visible.map(patient => <tr key={patient.id}><td><div className="clinical-primary">{displayName(patient)}</div><div className="clinical-secondary">Record no. {patient.id}</div></td><td>{patient.age ?? 'Not recorded'} / {patient.sex || 'Not recorded'}</td><td>{barangay(patient.address)}</td><td>{patient.bloodType || 'Not recorded'}</td><td>{patient.recordLabel || patient.recordDate || 'Not recorded'}</td><td className="text-right"><Button type="button" variant="primary" size="sm" onClick={() => onSelect(patient)}>{actionLabel}</Button></td></tr>)}</tbody></table></div>}
                <div className={compact ? 'max-h-[34rem] overflow-y-auto' : undefined}>
                    <div className={`grid gap-3 p-3 ${compact ? '' : 'md:hidden'}`}>{visible.map(patient => <article key={patient.id} className="rounded-lg border border-[var(--border)] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="clinical-primary">{displayName(patient)}</p><p className="clinical-secondary">Record no. {patient.id}</p></div><span className="text-xs font-semibold text-[var(--text-muted)]">{patient.recordLabel || patient.recordDate || 'Not recorded'}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-[var(--text-muted)]">Age / Sex</dt><dd className="font-semibold">{patient.age ?? 'Not recorded'} / {patient.sex || 'Not recorded'}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Barangay</dt><dd className="font-semibold">{barangay(patient.address)}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Blood type</dt><dd className="font-semibold">{patient.bloodType || 'Not recorded'}</dd></div></dl><Button type="button" variant="primary" onClick={() => onSelect(patient)} className="mt-4 min-h-11 w-full">{actionLabel}</Button></article>)}</div>
                </div>
                <footer className="flex flex-col gap-3 border-t border-[var(--border-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-[var(--text-secondary)]">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} patients</span><nav className="flex flex-wrap justify-center gap-1.5" aria-label="Patient worklist pagination"><Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>{Array.from({ length: totalPages }, (_, index) => index + 1).map(number => <Button key={number} type="button" size="sm" variant={number === currentPage ? 'primary' : 'ghost'} aria-current={number === currentPage ? 'page' : undefined} onClick={() => setPage(number)} className="min-h-11 min-w-11">{number}</Button>)}<Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button></nav></footer>
            </>}
        </section>
    );
}
