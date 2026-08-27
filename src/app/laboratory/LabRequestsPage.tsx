// Phase L4: dedicated Lab Requests module, built from the Work Queue functionality
// relocated from the Dashboard in Phase L3. Reuses the shared clinical-table/toolbar/
// filter chrome already used by Patient Records and other role modules (see
// src/app/patients/records.tsx) instead of inventing new list chrome.
import { useMemo, useState } from 'react';
import { Icon } from '../../components/shared/Icon';
import { Badge, Button, EmptyState, Input } from '../../components/ui';
import { PageHeader } from '../../components/layout/PageHeader';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { type LabRequest, formatDisplayDate, getTestNames } from './types';

const PAGE_SIZE = 10;

const TEST_CATEGORY_OPTIONS = [
    'Clinical Microscopy',
    'Blood Chemistry',
    'Pregnancy Test',
    'HBsAg Screening',
    'HIV Screening',
    'Parasitology',
    'Dengue RDT',
    'Others',
];

// "General" is never a stored value on lab_request (see L1 audit) — it's only ever a
// fallback for "no test flags recorded." Surfacing that plainly here per the plan's
// instruction not to present an ambiguous fallback as if it were a real category.
function getTestSummaryDisplay(r: LabRequest): string {
    const names = getTestNames(r);
    if (names.length === 0) return 'Test details unavailable';
    if (names.length <= 2) return names.join(' · ');
    return `${names.slice(0, 2).join(' · ')} +${names.length - 2} more`;
}

function isPendingRequest(r: LabRequest): boolean {
    return !r.status || r.status === 'Pending';
}

function requestAgeLabel(requestDate: string | null): string | null {
    if (!requestDate) return null;
    const d = new Date(requestDate);
    if (isNaN(d.getTime())) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis', totalPages];
    if (currentPage >= totalPages - 2) return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export function LabRequestsPage({
    requests,
    loading,
    loadError,
    onRetry,
    onSelectRequest,
}: {
    requests: LabRequest[];
    loading: boolean;
    loadError: boolean;
    onRetry: () => void;
    onSelectRequest: (r: LabRequest) => void;
}) {
    const [tab, setTab] = useState<'Pending' | 'All'>('Pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filterDate, setFilterDate] = useState('');
    const [filterTestCategory, setFilterTestCategory] = useState('');
    const [filterRequestedBy, setFilterRequestedBy] = useState('');
    const [page, setPage] = useState(1);

    const requestedByOptions = useMemo(
        () => Array.from(new Set(requests.map(r => r.requested_by).filter((v): v is string => Boolean(v)))).sort(),
        [requests],
    );

    const pendingCount = requests.filter(isPendingRequest).length;
    const allCount = requests.length;

    const tabScoped = tab === 'Pending' ? requests.filter(isPendingRequest) : requests;

    const filtered = tabScoped.filter(r => {
        const name = `${r.patient_firstName ?? ''} ${r.patient_lastName ?? ''}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        const matchSearch = !q ||
            name.includes(q) ||
            (r.lab_no ?? '').toLowerCase().includes(q) ||
            (r.chief_complaint ?? '').toLowerCase().includes(q);

        const matchDate = !filterDate || (r.request_date ?? '').slice(0, 10) === filterDate;

        const matchCategory = !filterTestCategory ||
            (filterTestCategory === 'Others' ? Boolean(r.others) : getTestNames(r).includes(filterTestCategory));

        const matchRequestedBy = !filterRequestedBy || r.requested_by === filterRequestedBy;

        return matchSearch && matchDate && matchCategory && matchRequestedBy;
    });

    const filtersActive = Boolean(filterDate || filterTestCategory || filterRequestedBy);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
    const visiblePageNumbers = getVisiblePageNumbers(currentPage, totalPages);

    const changePage = (next: number) => setPage(Math.min(Math.max(next, 1), totalPages));

    const changeTab = (next: 'Pending' | 'All') => { setTab(next); setPage(1); };
    const changeSearch = (value: string) => { setSearchQuery(value); setPage(1); };
    const changeFilterDate = (value: string) => { setFilterDate(value); setPage(1); };
    const changeFilterCategory = (value: string) => { setFilterTestCategory(value); setPage(1); };
    const changeFilterRequestedBy = (value: string) => { setFilterRequestedBy(value); setPage(1); };
    const clearFilters = () => { setFilterDate(''); setFilterTestCategory(''); setFilterRequestedBy(''); setPage(1); };

    const renderStatusBadge = (r: LabRequest) => (
        <Badge tone={r.status === 'Completed' ? 'green' : 'amber'}>{r.status || 'Pending'}</Badge>
    );

    const renderActionButton = (r: LabRequest, fullWidth = false) => {
        const name = r.patient_firstName ? `${r.patient_firstName} ${r.patient_lastName}` : `Patient #${r.patient_id ?? '—'}`;
        const pending = isPendingRequest(r);
        return (
            <Button
                type="button"
                variant={pending ? 'primary' : 'outline'}
                size="sm"
                onClick={() => onSelectRequest(r)}
                aria-label={pending ? `Encode result for ${name}` : `View result for ${name}`}
                className={`min-h-11 ${fullWidth ? 'w-full justify-center' : ''}`}
            >
                {pending ? 'Encode Result' : 'View Result'}
            </Button>
        );
    };

    return (
        <div className="role-workspace-canvas w-full">
            <PageHeader
                title="Lab Requests"
                subtitle="Review laboratory requests and encode pending results."
            />
            <div className="pwa-page-pad pt-3 pb-6">
                <section className="clinical-table-panel">
                    <div className="clinical-table-titlebar">
                        <div className="clinical-filter-group" role="tablist" aria-label="Lab request status">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === 'Pending'}
                                className={`clinical-filter-button min-h-11 ${tab === 'Pending' ? 'is-active' : ''}`}
                                onClick={() => changeTab('Pending')}
                            >
                                Pending ({pendingCount})
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === 'All'}
                                className={`clinical-filter-button min-h-11 ${tab === 'All' ? 'is-active' : ''}`}
                                onClick={() => changeTab('All')}
                            >
                                All ({allCount})
                            </button>
                        </div>
                    </div>

                    <div className="clinical-toolbar">
                        <Input
                            type="text"
                            aria-label="Search patient name, lab number, or complaint"
                            placeholder="Search name, lab #, or complaint..."
                            value={searchQuery}
                            onChange={e => changeSearch(e.target.value)}
                            leadingIcon={<Icon name="search" className="h-4 w-4" />}
                            containerClassName="min-w-[min(100%,20rem)] flex-1"
                        />

                        <div className="clinical-filter-group">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-expanded={showFilters}
                                onClick={() => setShowFilters(v => !v)}
                                className="min-h-11"
                            >
                                Filters{filtersActive ? ` (${[filterDate, filterTestCategory, filterRequestedBy].filter(Boolean).length})` : ''}
                            </Button>
                            {filtersActive && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearFilters}
                                    className="min-h-11"
                                >
                                    Clear filters
                                </Button>
                            )}
                        </div>
                    </div>

                    {showFilters && (
                        <div className="clinical-toolbar" role="group" aria-label="Lab request filters">
                            <div className="clinical-select">
                                <label className="sr-only" htmlFor="lab-requests-filter-date">Date requested</label>
                                <input
                                    id="lab-requests-filter-date"
                                    type="date"
                                    value={filterDate}
                                    onChange={e => changeFilterDate(e.target.value)}
                                    aria-label="Filter by date requested"
                                    className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--type-body-size)] text-[var(--text-2)]"
                                />
                            </div>

                            <div className="clinical-select">
                                <select
                                    value={filterTestCategory}
                                    onChange={e => changeFilterCategory(e.target.value)}
                                    aria-label="Filter by test category"
                                >
                                    <option value="">All test categories</option>
                                    {TEST_CATEGORY_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div className="clinical-select">
                                <select
                                    value={filterRequestedBy}
                                    onChange={e => changeFilterRequestedBy(e.target.value)}
                                    aria-label="Filter by requested by"
                                >
                                    <option value="">All requesters</option>
                                    {requestedByOptions.map(rb => <option key={rb} value={rb}>{rb}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {filtersActive && (
                        <div className="clinical-filter-note">
                            Filtering by
                            {filterDate && <> date requested <span>{formatDisplayDate(filterDate)}</span></>}
                            {filterTestCategory && <>{filterDate ? ',' : ''} test category <span>{filterTestCategory}</span></>}
                            {filterRequestedBy && <>{(filterDate || filterTestCategory) ? ',' : ''} requested by <span>{filterRequestedBy}</span></>}
                        </div>
                    )}

                    {loading ? (
                        <div className="p-6">
                            <SkeletonTable rows={6} columns={6} />
                        </div>
                    ) : loadError && requests.length === 0 ? (
                        <div className="p-8 text-center" role="alert">
                            <Icon name="alert-triangle" className="h-6 w-6 mx-auto mb-2 text-[var(--text-muted)]" />
                            <div className="font-semibold text-[var(--text)] text-sm">Unable to load laboratory requests</div>
                            <div className="text-xs text-[var(--text-muted)] mt-1">Check the connection and try again.</div>
                            <button type="button" onClick={onRetry} className="clinical-link-action mt-2">Try again</button>
                        </div>
                    ) : paged.length === 0 ? (
                        <div className="p-8">
                            <EmptyState
                                title={tab === 'Pending' && !searchQuery && !filtersActive ? 'No pending requests' : 'No requests match your search or filters'}
                                description={tab === 'Pending' && !searchQuery && !filtersActive
                                    ? 'There are no laboratory requests awaiting results.'
                                    : 'Adjust the search terms or filters, or clear them to see more requests.'}
                            />
                        </div>
                    ) : (
                        <>
                            {/* Desktop / tablet: aligned table */}
                            <div className="hidden md:block clinical-table-scroll">
                                <table className="clinical-table lab-requests-table min-w-[820px]">
                                    <thead>
                                        <tr>
                                            <th>Patient</th>
                                            <th>Test(s)</th>
                                            <th>Requested</th>
                                            <th>Requested By</th>
                                            <th>Status</th>
                                            <th className="text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paged.map(r => {
                                            const name = r.patient_firstName
                                                ? `${r.patient_firstName} ${r.patient_lastName}`
                                                : `Patient #${r.patient_id ?? '—'}`;
                                            const age = requestAgeLabel(r.request_date);
                                            return (
                                                <tr key={r.labrequest_id}>
                                                    <td>
                                                        <div className="font-semibold text-[var(--text)]">{name}</div>
                                                        <div className="text-xs text-[var(--text-muted)]">
                                                            {r.patient_sex ?? ''}{r.patient_age != null ? ` · ${r.patient_age} y/o` : ''}
                                                        </div>
                                                    </td>
                                                    <td>{getTestSummaryDisplay(r)}</td>
                                                    <td>
                                                        <div>{formatDisplayDate(r.request_date)}</div>
                                                        {age && <div className="text-xs text-[var(--text-muted)]">{age}</div>}
                                                    </td>
                                                    <td>{r.requested_by || '—'}</td>
                                                    <td>{renderStatusBadge(r)}</td>
                                                    <td className="text-right">{renderActionButton(r)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile: stacked cards, no horizontal scrolling */}
                            <div className="md:hidden divide-y divide-[var(--border-soft)]">
                                {paged.map(r => {
                                    const name = r.patient_firstName
                                        ? `${r.patient_firstName} ${r.patient_lastName}`
                                        : `Patient #${r.patient_id ?? '—'}`;
                                    const age = requestAgeLabel(r.request_date);
                                    return (
                                        <article key={r.labrequest_id} className="p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-[var(--text)] break-words">{name}</div>
                                                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                                        {r.patient_sex ?? ''}{r.patient_age != null ? ` · ${r.patient_age} y/o` : ''}
                                                    </div>
                                                </div>
                                                {renderStatusBadge(r)}
                                            </div>
                                            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
                                                <div>
                                                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Test(s)</dt>
                                                    <dd className="mt-0.5 text-[var(--text)]">{getTestSummaryDisplay(r)}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Requested</dt>
                                                    <dd className="mt-0.5 text-[var(--text)]">
                                                        {formatDisplayDate(r.request_date)}{age ? ` · ${age}` : ''}
                                                    </dd>
                                                </div>
                                            </dl>
                                            <div className="mt-4 pt-3 border-t border-[var(--border-soft)]">{renderActionButton(r, true)}</div>
                                        </article>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {!loading && !loadError && filtered.length > 0 && (
                        <footer className="flex flex-col gap-3 border-t border-[var(--border-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-center text-[length:var(--type-supporting-size)] text-[var(--text-secondary)] sm:text-left" aria-live="polite">
                                Showing {pageStart + 1}&ndash;{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length} requests
                            </p>
                            <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Lab requests pagination">
                                <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>
                                    Previous
                                </Button>
                                {visiblePageNumbers.map((p, index) => p === 'ellipsis' ? (
                                    <span key={`ellipsis-${index}`} className="inline-flex min-h-11 min-w-7 items-center justify-center text-[var(--text-muted)]" aria-hidden="true">&hellip;</span>
                                ) : (
                                    <Button
                                        key={p}
                                        type="button"
                                        variant={p === currentPage ? 'primary' : 'ghost'}
                                        size="sm"
                                        aria-label={`Go to page ${p}`}
                                        aria-current={p === currentPage ? 'page' : undefined}
                                        onClick={() => changePage(p)}
                                        className="min-h-11 min-w-11 px-2"
                                    >
                                        {p}
                                    </Button>
                                ))}
                                <Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)}>
                                    Next
                                </Button>
                            </nav>
                        </footer>
                    )}
                </section>
            </div>
        </div>
    );
}
