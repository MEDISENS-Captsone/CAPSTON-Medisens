import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, EmptyState, LoadingState, Toast } from '../../../components/ui';
import { Icon } from '../../../components/shared/Icon';
import { FhsisOfficialExportActions } from '../components/FhsisOfficialExportActions';
import { FhsisReportHistory } from '../components/FhsisReportHistory';
import { FhsisFindingsGroups, type FhsisFindingGroup } from '../components/FhsisFindingsGroups';
import { getFhsisStaffProfile, listFhsisReportHistory, loadFhsisReport, returnFhsisReport, verifyFhsisReport } from '../api';
import { deriveLayoutTotals } from '../calculations';
import { formatFhsisReportStatus } from '../status';
import { fhsisFieldLabels, fhsisSectionLabel, getFhsisTemplate } from '../template';
import type { FhsisReport, FhsisReportDetail, FhsisReportStatus, FhsisValidationFinding } from '../types';
import { reportValuesToTemplateValues, validateFhsisReportValues } from '../validation';
import './fhsis-midwife.css';

const tone: Record<FhsisReportStatus, 'slate' | 'amber' | 'green' | 'red'> = { draft: 'slate', for_verification: 'amber', returned: 'red', verified: 'green' };
const formatMonth = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
const messageFor = (error: unknown, fallback: string) => typeof error === 'object' && error !== null && 'code' in error && String(error.code) === '42P01' ? 'Monthly FHSIS reporting is not available yet. Please contact the system administrator.' : fallback;
const roleLabels: Record<string, string> = { doctor: 'Doctor', nurse: 'Nurse', BHW: 'BHW', bhw: 'BHW', midwives: 'Midwife', pharmacist: 'Pharmacist', labaratory: 'Laboratory', laboratory: 'Laboratory', admin: 'Admin' };
const formatStaffRole = (role: string | null) => (role && roleLabels[role]) || role || '';
const historicalSectionLabels: Readonly<Record<string, string>> = {
    'family-planning-services-for-women-of-reproductive-age': 'Family Planning Services for Women of Reproductive Age',
    'maternal-care-and-services': 'Maternal Care and Services',
    'child-care-and-services': 'Child Care and Services',
    'oral-health-care-services': 'Oral Health Care Services',
    'non-communicable-diseases': 'Non-Communicable Diseases',
    'environmental-health-and-sanitation': 'Environmental Health and Sanitation',
    'communicable-diseases-and-vital-statistics': 'Communicable Diseases and Vital Statistics',
};

function ReadOnlySection({ detail, sectionKey }: { detail: FhsisReportDetail; sectionKey: string }) {
    const template = getFhsisTemplate(detail.report.reportType, detail.report.templateVersion);
    const section = template.sections.find(item => item.key === sectionKey) ?? template.sections[0];
    if (!section) return null;
    const layouts = new Map(template.layouts.map(layout => [layout.key, layout]));
    const values = deriveLayoutTotals(template, reportValuesToTemplateValues(detail.values));
    return <div className="fhsis-midwife-sections">{section.subgroups.map(group => {
        const dimensions = group.indicators[0] ? (layouts.get(group.indicators[0].layoutKey)?.columnGroups.flatMap(column => column.dimensions) ?? []) : [];
        return <Card key={group.key} className="fhsis-subgroup-card">
            <div className="fhsis-subgroup-heading"><div><p className="fhsis-eyebrow">{fhsisSectionLabel(section)}</p><h3>{group.label}</h3></div><Badge tone="slate">Read only</Badge></div>
            {/* Desktop/tablet: tabular comparison view, unchanged. */}
            <div className="fhsis-table-wrap fhsis-desktop-grid"><table className="fhsis-entry-table"><thead><tr><th>Official indicator</th>{dimensions.map(dimension => <th key={dimension.key}>{dimension.label}</th>)}</tr></thead><tbody>{group.indicators.map(indicator => { const layout = layouts.get(indicator.layoutKey); if (!layout) return null; return <tr key={indicator.key}><th scope="row">{indicator.label}</th>{layout.columnGroups.flatMap(column => column.dimensions).map(dimension => <td key={dimension.key} className={dimension.inputMode === 'derived' ? 'fhsis-derived-cell' : ''}>{values[indicator.key]?.[dimension.key] ?? '—'}</td>)}</tr>; })}</tbody></table></div>
            {/* Mobile: each indicator becomes a labeled group of label:value pairs instead of a squeezed table. */}
            <div className="fhsis-mobile-grid">{group.indicators.map(indicator => { const layout = layouts.get(indicator.layoutKey); if (!layout) return null; const rowDimensions = layout.columnGroups.flatMap(column => column.dimensions); return <div key={indicator.key} className="fhsis-mobile-row"><p className="fhsis-mobile-row-label">{indicator.label}</p><dl className="fhsis-mobile-row-values">{rowDimensions.map(dimension => <div key={dimension.key} className={dimension.inputMode === 'derived' ? 'fhsis-mobile-value fhsis-derived-cell' : 'fhsis-mobile-value'}><dt>{dimension.label}</dt><dd>{values[indicator.key]?.[dimension.key] ?? '—'}</dd></div>)}</dl></div>; })}</div>
        </Card>;
    })}</div>;
}

const QUEUE_PAGE_SIZE = 10;

/** Groups findings by section for the historical-notes menu on a verified report. */
function groupFindingsBySection(findings: readonly FhsisValidationFinding[], template: import('../templates/m1-brgy/types').FhsisTemplate): readonly FhsisFindingGroup[] {
    const map = new Map<string, FhsisFindingGroup & { findings: FhsisValidationFinding[] }>();
    const unknown: FhsisValidationFinding[] = [];
    findings.forEach(finding => {
        const section = template.sections.find(item => item.key === finding.sectionKey);
        if (!section) { unknown.push(finding); return; }
        const existing = map.get(section.key);
        if (existing) existing.findings.push(finding);
        else map.set(section.key, { key: section.key, label: historicalSectionLabels[section.key] ?? fhsisSectionLabel(section), findings: [finding] });
    });
    const result = [...map.values()];
    if (unknown.length) result.push({ key: '', label: 'Report data', findings: unknown });
    return result;
}

function HistoricalNotesPopover({ groups, labels, onSelect }: {
    groups: readonly FhsisFindingGroup[];
    labels: Map<string, string>;
    onSelect: (sectionKey: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedKey, setSelectedKey] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const total = groups.reduce((count, group) => count + group.findings.length, 0);
    const selectedGroup = groups.find(group => group.key === selectedKey);

    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                setIsOpen(false);
                return;
            }
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setIsOpen(false);
            triggerRef.current?.focus();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const frame = requestAnimationFrame(() => {
            const selected = rootRef.current?.querySelector<HTMLButtonElement>('.fhsis-historical-option.is-selected');
            const first = rootRef.current?.querySelector<HTMLButtonElement>('.fhsis-historical-option');
            (selected ?? first)?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    return <div className="fhsis-historical-popover" ref={rootRef}>
        <button
            ref={triggerRef}
            type="button"
            className="fhsis-historical-trigger"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-controls="fhsis-historical-menu"
            onClick={() => setIsOpen(value => !value)}
            onKeyDown={event => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                setIsOpen(true);
            }}
        >
            <span>Historical notes ({total.toLocaleString('en-PH')})</span>
            <Icon name="chevron-right" />
        </button>
        {isOpen && <div id="fhsis-historical-menu" className="fhsis-historical-menu" role="menu" aria-label="Historical notes by FHSIS section">
            <div className="fhsis-historical-options" role="none">
                {groups.map((group, index) => <button
                    type="button"
                    key={group.key || 'report-data'}
                    role="menuitemradio"
                    className={selectedKey === group.key ? 'fhsis-historical-option is-selected' : 'fhsis-historical-option'}
                    aria-checked={selectedKey === group.key}
                    onClick={() => {
                        setSelectedKey(group.key);
                        onSelect(group.key);
                        setIsOpen(false);
                        requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                    onKeyDown={event => {
                        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const options = rootRef.current?.querySelectorAll<HTMLButtonElement>('.fhsis-historical-option');
                        if (!options?.length) return;
                        const target = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? (index + 1) % options.length : (index - 1 + options.length) % options.length;
                        options[target]?.focus();
                    }}
                >
                    <span>{group.label}</span>
                    <strong>— {group.findings.length.toLocaleString('en-PH')} notes</strong>
                </button>)}
            </div>
        </div>}
        {selectedGroup && <div className="fhsis-historical-results">
            <FhsisFindingsGroups key={selectedGroup.key} groups={[selectedGroup]} labels={labels} variant="historical" />
        </div>}
    </div>;
}

export function FhsisMidwifeWorkspace({ mode }: { mode: 'queue' | 'history' }) {
    const [reports, setReports] = useState<readonly FhsisReport[]>([]);
    const [detail, setDetail] = useState<FhsisReportDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [actionPending, setActionPending] = useState<'return' | 'verify' | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
    const [queuePage, setQueuePage] = useState(1);
    const [reviewerName, setReviewerName] = useState<string | null>(null);
    const [reviewerRole, setReviewerRole] = useState<string | null>(null);

    const refresh = async () => { setLoading(true); try { setReports(await listFhsisReportHistory()); } catch (error) { setMessage({ text: messageFor(error, 'Unable to load the FHSIS verification queue.'), type: 'error' }); } finally { setLoading(false); } };
    useEffect(() => { void refresh(); }, []);
    // Verification Queue only ever shows reports awaiting review — no status
    // toggle is offered because no other status belongs in this queue.
    const visibleReports = useMemo(() => reports.filter(report => report.status === 'for_verification'), [reports]);
    useEffect(() => setQueuePage(1), [visibleReports.length]);
    const queuePageCount = Math.max(1, Math.ceil(visibleReports.length / QUEUE_PAGE_SIZE));
    const queuePageSafe = Math.min(queuePage, queuePageCount);
    const pagedQueueReports = visibleReports.slice((queuePageSafe - 1) * QUEUE_PAGE_SIZE, queuePageSafe * QUEUE_PAGE_SIZE);
    const counts = useMemo(() => ({ pending: reports.filter(report => report.status === 'for_verification').length, returned: reports.filter(report => report.status === 'returned').length, verified: reports.filter(report => report.status === 'verified').length }), [reports]);

    const open = async (report: FhsisReport) => { setLoading(true); try { const loaded = await loadFhsisReport(report.id); if (!loaded) throw new Error('Report unavailable'); setDetail(loaded); setActiveSection(getFhsisTemplate(loaded.report.reportType, loaded.report.templateVersion).sections[0]?.key ?? ''); setReason(''); setNotes(''); setReviewerName(null); setReviewerRole(null); } catch (error) { setMessage({ text: messageFor(error, 'Unable to open this FHSIS report.'), type: 'error' }); } finally { setLoading(false); } };
    const close = () => setDetail(null);
    const act = async (kind: 'return' | 'verify') => { if (!detail) return; if (kind === 'return' && !reason.trim()) { setMessage({ text: 'A correction reason is required before returning a report.', type: 'error' }); return; } setActionPending(kind); try { if (kind === 'return') await returnFhsisReport(detail.report.id, reason, notes); else await verifyFhsisReport(detail.report.id, notes); await refresh(); close(); setMessage({ text: kind === 'return' ? 'Report returned to the Nurse for correction.' : 'Report verified and finalized.', type: 'success' }); } catch (error) { setMessage({ text: messageFor(error, kind === 'return' ? 'Unable to return this report. Please try again.' : 'Unable to verify this report. Please try again.'), type: 'error' }); } finally { setActionPending(null); } };

    // Resolve the verifier's display name/role once a verified report is open. Falls
    // back silently (name/role stay null) if the profile can't be read — the UI then
    // falls back to role-only or a neutral label, never a raw user id.
    useEffect(() => {
        if (!detail || detail.report.status !== 'verified' || !detail.report.verifiedBy) return;
        let cancelled = false;
        void getFhsisStaffProfile(detail.report.verifiedBy).then(profile => { if (!cancelled) { setReviewerName(profile?.fullName ?? null); setReviewerRole(profile?.role ?? null); } });
        return () => { cancelled = true; };
    }, [detail]);

    if (loading && !detail) return <div className="pwa-page-pad"><LoadingState label="Loading FHSIS verification queue" /></div>;
    if (detail) {
        const template = getFhsisTemplate(detail.report.reportType, detail.report.templateVersion);
        const findings = validateFhsisReportValues(template, detail.values);
        const canDecide = detail.report.status === 'for_verification';
        const isVerified = detail.report.status === 'verified';
        const errorFindings = findings.filter(item => item.severity === 'error');
        const backLabel = mode === 'queue' ? 'Back to verification queue' : 'Back to report history';
        const verifiedReview = [...detail.reviews].reverse().find(review => review.action === 'verified');
        const returnedReview = [...detail.reviews].reverse().find(review => review.action === 'returned');
        const historicalGroups = groupFindingsBySection(errorFindings, template);
        const historicalLabels = fhsisFieldLabels(template);
        const reviewerLabel = reviewerName || (reviewerRole ? formatStaffRole(reviewerRole) : 'Not available');
        return <div className="fhsis-midwife-workspace pwa-page-pad">
            <header className={isVerified ? 'fhsis-page-top fhsis-detail-page-top is-verified' : 'fhsis-page-top fhsis-detail-page-top'}>
                <div className="fhsis-detail-heading">
                    <p className="fhsis-kicker">Verification review · {formatMonth(detail.report.reportingMonth)}</p>
                    <div className="fhsis-detail-title-row">
                        <h1>M1 BRGY report review</h1>
                        <div className="fhsis-detail-toolbar">
                            <Badge tone={tone[detail.report.status]}>{formatFhsisReportStatus(detail.report.status)}</Badge>
                            <FhsisOfficialExportActions detail={detail} compact />
                            {isVerified && <Button variant="outline" size="sm" className="fhsis-back-link" leadingIcon={<Icon name="chevron-right" className="rotate-180" />} onClick={close}>{backLabel}</Button>}
                        </div>
                    </div>
                    <div className="fhsis-detail-meta-row">
                        <p>{detail.report.barangayName} · {detail.report.bhsName} · Submitted report</p>
                        {!isVerified && <Button variant="outline" size="sm" className="fhsis-back-link" leadingIcon={<Icon name="chevron-right" className="rotate-180" />} onClick={close}>{backLabel}</Button>}
                    </div>
                </div>
            </header>
            <div className={isVerified ? 'fhsis-midwife-shell is-verified' : 'fhsis-midwife-shell'}>
                {!isVerified && <aside className="fhsis-section-nav" aria-label="Report review sections">
                    <div className="fhsis-progress"><span>Validation findings</span><strong>{errorFindings.length}</strong></div>
                    {template.sections.map(section => <button type="button" key={section.key} onClick={() => setActiveSection(section.key)} className={activeSection === section.key ? 'fhsis-section-nav-item is-active' : 'fhsis-section-nav-item'}><span>{fhsisSectionLabel(section)}</span><small>{findings.filter(item => item.sectionKey === section.key && item.severity === 'error').length} issues</small></button>)}
                </aside>}
                <div className="fhsis-main-panel">
                    {isVerified && errorFindings.length > 0 && <HistoricalNotesPopover groups={historicalGroups} labels={historicalLabels} onSelect={setActiveSection} />}
                    <ReadOnlySection detail={detail} sectionKey={activeSection} />
                    {isVerified ? <>
                        <Card className="fhsis-decision-card fhsis-outcome-compact" aria-label="Verification outcome">
                            <div className="fhsis-outcome-head"><Badge tone="green">Verified</Badge><div className="fhsis-outcome-summary"><span>Reviewed by</span><strong>{reviewerLabel}{reviewerName && reviewerRole ? ` · ${formatStaffRole(reviewerRole)}` : ''}</strong></div><div className="fhsis-outcome-summary"><span>Verified on</span><strong>{detail.report.verifiedAt ? new Date(detail.report.verifiedAt).toLocaleString('en-PH') : '—'}</strong></div></div>
                            {verifiedReview?.notes && <p className="fhsis-outcome-notes"><Icon name="clipboard" /> {verifiedReview.notes}</p>}
                        </Card>
                    </> : <Card className="fhsis-decision-card">
                        <div className="fhsis-form-heading"><div><p className="fhsis-kicker">Reviewer decision</p><h2>Return or verify</h2><p>Encoded values are read-only. A return reason helps the Nurse correct the exact issue.</p></div><Badge tone={errorFindings.length ? 'red' : 'green'}>{errorFindings.length} blocking findings</Badge></div>
                        {canDecide ? <><label className="fhsis-review-label" htmlFor="fhsis-return-reason">Correction reason <span>*</span></label><textarea id="fhsis-return-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Required only when returning for correction" className="fhsis-review-textarea" rows={3} /><label className="fhsis-review-label" htmlFor="fhsis-review-notes">Review notes</label><textarea id="fhsis-review-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional context for the Nurse or report history" className="fhsis-review-textarea" rows={3} /><div className="fhsis-review-actions"><Button variant="outline" isLoading={actionPending === 'return'} leadingIcon={<Icon name="alert-triangle" />} onClick={() => void act('return')}>Return for correction</Button><Button disabled={errorFindings.length > 0} isLoading={actionPending === 'verify'} leadingIcon={<Icon name="check" />} onClick={() => void act('verify')}>Verify report</Button></div></> : <div className="fhsis-ready-state"><Icon name="lock" /><div><strong>This report is no longer awaiting verification.</strong><p>{returnedReview ? `Returned: ${returnedReview.reason ?? 'No reason recorded.'}` : 'Its saved review history remains available for reference.'}</p></div></div>}
                    </Card>}
                </div>
            </div>
            {message && <Toast type={message.type} message={message.text} onClose={() => setMessage(null)} />}
        </div>;
    }
    if (mode === 'history') return <div className="fhsis-midwife-workspace pwa-page-pad"><div className="fhsis-page-top"><div><p className="fhsis-kicker">Monthly reporting</p><h1>FHSIS report history</h1><p>Reports with a completed Midwife review — returned or verified M1 BRGY reports, including official exports.</p></div><Button variant="outline" onClick={() => void refresh()} leadingIcon={<Icon name="clock" />}>Refresh</Button></div><Card className="fhsis-queue-card"><FhsisReportHistory reports={reports} role="midwife" statuses={['returned', 'verified']} onOpen={reportToOpen => void open(reportToOpen)} /></Card>{message && <Toast type={message.type} message={message.text} onClose={() => setMessage(null)} />}</div>;
    return <div className="fhsis-midwife-workspace pwa-page-pad"><div className="fhsis-page-top"><div><p className="fhsis-kicker">Monthly reporting</p><h1>FHSIS verification queue</h1><p>Review Nurse-submitted M1 BRGY reports without editing encoded values.</p></div><Button variant="outline" onClick={() => void refresh()} leadingIcon={<Icon name="clock" />}>Refresh</Button></div><div className="fhsis-queue-stats"><Card><span>Awaiting review</span><strong>{counts.pending}</strong></Card><Card><span>Returned</span><strong>{counts.returned}</strong></Card><Card><span>Verified</span><strong>{counts.verified}</strong></Card></div><Card className="fhsis-queue-card"><div className="fhsis-queue-toolbar"><div><h2>Reports awaiting verification</h2><p>Only reports submitted by a Nurse and pending review appear in this queue.</p></div></div>{visibleReports.length === 0 ? <EmptyState icon={<Icon name="inbox" />} title="No reports awaiting verification" description="Submitted Nurse reports will appear here." /> : <><div className="fhsis-history-list">{pagedQueueReports.map(report => <button type="button" key={report.id} className="fhsis-history-row" onClick={() => void open(report)}><div><strong>{formatMonth(report.reportingMonth)} · {report.barangayName}</strong><span>{report.bhsName} · Submitted {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString('en-PH') : '—'}</span></div><Badge tone={tone[report.status]}>{formatFhsisReportStatus(report.status)}</Badge><Icon name="chevron-right" /></button>)}</div>{queuePageCount > 1 && <div className="fhsis-pagination"><span>Showing {(queuePageSafe - 1) * QUEUE_PAGE_SIZE + 1}-{Math.min(queuePageSafe * QUEUE_PAGE_SIZE, visibleReports.length)} of {visibleReports.length}</span><div className="fhsis-pagination-controls"><Button variant="outline" size="sm" disabled={queuePageSafe <= 1} onClick={() => setQueuePage(value => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={queuePageSafe >= queuePageCount} onClick={() => setQueuePage(value => Math.min(queuePageCount, value + 1))}>Next</Button></div></div>}</>}</Card>{message && <Toast type={message.type} message={message.text} onClose={() => setMessage(null)} />}</div>;
}
