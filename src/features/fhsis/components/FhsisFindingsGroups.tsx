import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui';
import { Icon } from '../../../components/shared/Icon';
import type { FhsisValidationFinding } from '../types';

export interface FhsisFindingGroup {
    key: string;
    label: string;
    findings: readonly FhsisValidationFinding[];
}

const PAGE_SIZE = 25;

/**
 * Renders findings grouped by FHSIS section as a single-open accordion.
 * Only the expanded section's findings are paginated and rendered — this keeps
 * the list usable even when hundreds/thousands of findings exist on a report.
 *
 * Shared by the Nurse workspace (blocking issues before submission) and the
 * Midwife workspace (historical notes on a verified report) so both surfaces
 * present the same grouped/paginated interaction.
 */
export function FhsisFindingsGroups({ groups, labels, variant = 'issues', onGoToField }: {
    groups: readonly FhsisFindingGroup[];
    labels: Map<string, string>;
    variant?: 'issues' | 'historical';
    onGoToField?: (sectionKey: string) => void;
}) {
    const [openKey, setOpenKey] = useState(groups[0]?.key ?? '');
    const [page, setPage] = useState(1);
    useEffect(() => { if (!groups.some(group => group.key === openKey)) setOpenKey(groups[0]?.key ?? ''); }, [groups, openKey]);
    useEffect(() => setPage(1), [openKey]);
    const countLabel = variant === 'historical' ? 'historical note' : 'missing or invalid value';
    return <div className="fhsis-issue-groups" aria-label={variant === 'historical' ? 'Historical notes by section' : 'Blocking issues by section'}>
        {groups.map(group => {
            const isOpen = group.key === openKey;
            const pageCount = Math.max(1, Math.ceil(group.findings.length / PAGE_SIZE));
            const pageSafe = isOpen ? Math.min(page, pageCount) : 1;
            const pageFindings = isOpen ? group.findings.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE) : [];
            return <details key={group.key || 'report-data'} className="fhsis-issue-group" open={isOpen} onToggle={event => { if ((event.target as HTMLDetailsElement).open) setOpenKey(group.key); }}>
                <summary><span><strong>{group.label}</strong><small>{group.findings.length} {countLabel}{group.findings.length === 1 ? '' : 's'}</small></span><Icon name="chevron-right" /></summary>
                {isOpen && <>
                    <ul>{pageFindings.map((finding, index) => <li key={`${finding.indicatorKey}-${finding.dimensionKey}-${index}`}><Icon name={variant === 'historical' ? 'clipboard' : 'alert-triangle'} /><div><strong>{labels.get(`${finding.indicatorKey}:${finding.dimensionKey ?? ''}`) ?? 'Report field'}</strong><span>{finding.message}</span></div>{onGoToField && group.key && <Button variant="ghost" size="sm" onClick={() => onGoToField(group.key)}>Go to field</Button>}</li>)}</ul>
                    {pageCount > 1 && <div className="fhsis-pagination"><span>Showing {(pageSafe - 1) * PAGE_SIZE + 1}-{Math.min(pageSafe * PAGE_SIZE, group.findings.length)} of {group.findings.length}</span><div className="fhsis-pagination-controls"><Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={pageSafe >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</Button></div></div>}
                </>}
            </details>;
        })}
    </div>;
}
