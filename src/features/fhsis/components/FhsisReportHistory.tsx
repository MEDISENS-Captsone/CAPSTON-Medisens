import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, EmptyState } from '../../../components/ui';
import { Icon } from '../../../components/shared/Icon';
import { formatFhsisReportStatus } from '../status';
import type { FhsisReport, FhsisReportStatus } from '../types';

const tone: Record<FhsisReportStatus, 'slate' | 'amber' | 'green' | 'red'> = { draft: 'slate', for_verification: 'amber', returned: 'red', verified: 'green' };
const month = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
const ALL_STATUSES: readonly FhsisReportStatus[] = ['draft', 'for_verification', 'returned', 'verified'];
const PAGE_SIZE = 10;

/**
 * Shared, read-only report list used by both Nurse and Midwife workspaces.
 * `statuses` restricts which report statuses are ever selectable/visible — the
 * Nurse view keeps every status (own drafts, corrections, submissions), while
 * the Midwife report history view restricts to completed reviews only.
 */
export function FhsisReportHistory({ reports, role, onOpen, statuses }: { reports: readonly FhsisReport[]; role: 'nurse' | 'midwife'; onOpen: (report: FhsisReport) => void; statuses?: readonly FhsisReportStatus[] }) {
    const allowed = statuses && statuses.length ? statuses : ALL_STATUSES;
    const inScope = useMemo(() => reports.filter(report => allowed.includes(report.status)), [reports, allowed]);
    const [filter, setFilter] = useState<'all' | FhsisReportStatus>('all');
    const [page, setPage] = useState(1);
    const visible = useMemo(() => inScope.filter(report => filter === 'all' || report.status === filter), [filter, inScope]);
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    useEffect(() => setPage(1), [filter, inScope.length]);
    const pageSafe = Math.min(page, pageCount);
    const paged = visible.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
    const emptyDescription = role === 'nurse' ? 'Create a monthly report from Encode Report.' : 'Reports with a completed review will appear here.';
    return <div className="fhsis-history-shared">
        {allowed.length > 1 && <div className="fhsis-history-toolbar"><label>Filter status<select value={filter} onChange={event => setFilter(event.target.value as 'all' | FhsisReportStatus)}><option value="all">All statuses</option>{allowed.map(status => <option key={status} value={status}>{formatFhsisReportStatus(status)}</option>)}</select></label></div>}
        {visible.length === 0 ? <EmptyState icon={<Icon name="file-text" />} title="No FHSIS reports match this filter" description={emptyDescription} /> : <>
            <div className="fhsis-history-list">{paged.map(report => <button type="button" key={report.id} className="fhsis-history-row" onClick={() => onOpen(report)}><div><strong>{month(report.reportingMonth)} · {report.barangayName}</strong><span>{report.bhsName} · {role === 'midwife' && report.submittedAt ? `Submitted ${new Date(report.submittedAt).toLocaleDateString('en-PH')}` : report.status === 'verified' ? 'Verified report — export available' : 'Open report'}</span></div><Badge tone={tone[report.status]}>{formatFhsisReportStatus(report.status)}</Badge><Icon name="chevron-right" /></button>)}</div>
            {pageCount > 1 && <div className="fhsis-pagination"><span>Showing {(pageSafe - 1) * PAGE_SIZE + 1}-{Math.min(pageSafe * PAGE_SIZE, visible.length)} of {visible.length}</span><div className="fhsis-pagination-controls"><Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={pageSafe >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</Button></div></div>}
        </>}
    </div>;
}
