import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useToast } from '../../components/feedback/Toast';
import { Icon } from '../../components/shared/Icon';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { safeTrim } from '../../lib/utils/strings';
import { logAuditEvent } from '../audit/services';

type ArchiveFilter = 'candidates' | 'active' | 'archived';
type ArchiveAction = 'archive' | 'restore';

interface ArchivePatient {
    id: number;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    age: number | null;
    sex: string | null;
    address: string | null;
    contactNumber: number | null;
    created_at: string | null;
    archive_status: 'active' | 'archived';
    archived_at: string | null;
    archived_by: string | null;
    archive_reason: string | null;
    archive_reviewed_at: string | null;
    archive_reviewed_by: string | null;
    last_activity_at: string | null;
}

const ARCHIVE_PATIENT_COLUMNS = 'id, firstName, middleName, lastName, age, sex, address, contactNumber, created_at, archive_status, archived_at, archived_by, archive_reason, archive_reviewed_at, archive_reviewed_by, last_activity_at';
const ACTIVE_PATIENT_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, bloodType, address, contactNumber, birthday, civilStatus, nationality, religion, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress, created_at, archive_status';
const ARCHIVE_REVIEW_LIMIT = 200;

function formatDate(value?: string | null) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function patientName(patient: ArchivePatient) {
    return safeTrim(`${patient.lastName || ''}, ${patient.firstName || ''} ${patient.middleName || ''}`) || `Patient #${patient.id}`;
}

function archiveCutoffIso() {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 5);
    return cutoff.toISOString();
}

function ArchiveStatusBadge({ patient }: { patient: ArchivePatient }) {
    if (patient.archive_status === 'archived') return <span className="clinical-status-badge">Archived</span>;
    return <span className="clinical-status-badge success">Active</span>;
}

export function ArchiveReviewPage({ isOnline, readOnly = false }: { isOnline: boolean; readOnly?: boolean }) {
    const { showToast, ToastComponent } = useToast();
    const [patients, setPatients] = useState<ArchivePatient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoadError, setHasLoadError] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [filter, setFilter] = useState<ArchiveFilter>('candidates');
    const [search, setSearch] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<ArchivePatient | null>(null);
    const [action, setAction] = useState<ArchiveAction | null>(null);
    const [reason, setReason] = useState('');

    const loadArchivePatients = async () => {
        setIsLoading(true);
        setHasLoadError(false);
        try {
            const selectColumns = filter === 'active' ? ACTIVE_PATIENT_COLUMNS : ARCHIVE_PATIENT_COLUMNS;
            // @ts-ignore
            let query: any = supabase
                .from('patients')
                .select(selectColumns);

            if (filter === 'active') {
                query = query
                    .or('archive_status.eq.active,archive_status.is.null')
                    .order('lastName', { ascending: true });
            } else if (filter === 'candidates') {
                query = query
                    .or('archive_status.eq.active,archive_status.is.null')
                    .lte('last_activity_at', archiveCutoffIso())
                    .order('last_activity_at', { ascending: true, nullsFirst: true });
            } else if (filter === 'archived') {
                query = query
                    .eq('archive_status', 'archived')
                    .order('lastName', { ascending: true });
            }

            const finalQuery = query.limit(ARCHIVE_REVIEW_LIMIT);
            const { data, error } = await finalQuery;

            if (error) throw error;

            let nextPatients = ((data || []) as ArchivePatient[]);

            if (filter === 'candidates' && nextPatients.length > 0) {
                const ids = nextPatients.map(patient => patient.id);
                const [{ data: pendingFollowUps, error: followUpError }, { data: pendingLabRequests, error: labError }] = await Promise.all([
                    supabase.from('follow_up').select('patient_id').in('patient_id', ids).or('follow_up_status.is.null,follow_up_status.neq.done'),
                    supabase.from('lab_request').select('patient_id').in('patient_id', ids).or('status.is.null,status.neq.Completed'),
                ]);
                if (followUpError) throw followUpError;
                if (labError) throw labError;

                const blockedIds = new Set<number>([
                    ...((pendingFollowUps || []).map(row => Number(row.patient_id)).filter(Boolean)),
                    ...((pendingLabRequests || []).map(row => Number(row.patient_id)).filter(Boolean)),
                ]);
                nextPatients = nextPatients.filter(patient => !blockedIds.has(patient.id));
            }

            setPatients(nextPatients);
        } catch (error) {
            setHasLoadError(true);
            logError('Failed to load archive review patients', error);
            showToast(healthcareErrorMessage('load archive review records'), true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadArchivePatients();
    }, [filter]);

    const visiblePatients = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return patients;
        return patients.filter(patient => `${patient.firstName || ''} ${patient.middleName || ''} ${patient.lastName || ''} ${patient.address || ''} ${patient.id}`.toLowerCase().includes(query));
    }, [patients, search]);

    const openAction = (patient: ArchivePatient, nextAction: ArchiveAction) => {
        setSelectedPatient(patient);
        setAction(nextAction);
        setReason('');
    };

    const closeAction = () => {
        setSelectedPatient(null);
        setAction(null);
        setReason('');
    };

    const submitArchiveAction = async () => {
        if (!selectedPatient || !action) return;
        const cleanReason = safeTrim(reason);
        if (!cleanReason) {
            showToast(action === 'archive' ? 'Please enter an archive reason.' : 'Please enter a restore reason.', true);
            return;
        }
        if (!isOnline) {
            showToast('You are offline. Archive changes cannot be saved until the connection is restored.', true);
            return;
        }

        setIsSaving(true);
        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            const accessToken = sessionData.session?.access_token;
            if (!accessToken) throw new Error('No active session for archive request.');

            const { data, error } = await supabase.functions.invoke('archive-patient-record', {
                body: {
                    patient_id: selectedPatient.id,
                    action,
                    reason: cleanReason,
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            if (error || !data?.ok) {
                throw error || new Error('Archive request was not confirmed.');
            }

            const eventType = data.event_type === 'restored' ? 'restored' : 'archived';

            void logAuditEvent({
                action: eventType,
                module: 'Patient Archive',
                recordId: selectedPatient.id,
                recordType: 'patient',
                description: action === 'archive' ? 'Archived inactive patient record.' : 'Restored archived patient record.',
                metadata: { patient_id: selectedPatient.id, action_scope: 'patient_archive', status: eventType },
            });

            showToast(action === 'archive' ? 'Patient record archived.' : 'Patient record restored.');
            closeAction();
            await loadArchivePatients();
        } catch (error) {
            logError(`Failed to ${action} patient record`, error);
            showToast(healthcareErrorMessage(action === 'archive' ? 'archive the patient record' : 'restore the patient record'), true);
        } finally {
            setIsSaving(false);
        }
    };

    const emptyMessage = search.trim()
        ? 'No patient records match your search.'
        : 'No patient records match this archive filter.';

    return (
        <div className="pwa-page-pad flex min-w-0 flex-col pwa-panel-gap">
            <ToastComponent />

            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    ['Visible records', visiblePatients.length, 'Current results'],
                    ['Review threshold', '5 years', 'Without recent activity'],
                    ['Current view', filter === 'candidates' ? 'Candidates' : filter[0].toUpperCase() + filter.slice(1), 'Manual review only'],
                ].map(([label, value, note]) => (
                    <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                        <div className="text-xs font-semibold text-[var(--text-muted)]">{label}</div>
                        <div className="mt-2 text-xl font-semibold tabular-nums text-[var(--text)]">{value}</div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">{note}</div>
                    </div>
                ))}
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[var(--amber-border)] bg-[var(--amber-surface)] px-4 py-3.5 text-sm leading-6 text-[var(--amber-ink)]">
                <Icon name="alert-triangle" className="mt-0.5 h-5 w-5 shrink-0" />
                <div><p className="font-semibold">Archive eligibility is reviewed manually</p><p>Only patients with no activity for at least five years and no pending follow-ups, laboratory requests, or ongoing care may be archived.</p></div>
            </div>

            <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm" aria-labelledby="archive-results-heading">
                <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                        <h3 id="archive-results-heading" className="text-base font-semibold text-[var(--text)]">Archive records</h3>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">Search records or switch between archive review states.</p>
                    </div>
                    <span className="clinical-count-badge w-fit" aria-live="polite">{visiblePatients.length} result{visiblePatients.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="grid gap-3 border-b border-[var(--border)] bg-[var(--surface-subtle)] p-4 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center lg:px-5">
                    <label className="clinical-search min-h-11 bg-[var(--surface)]">
                        <Icon name="search" className="h-4 w-4 text-[var(--text-secondary)]" />
                        <span className="sr-only">Search archive review patients</span>
                        <input type="search" placeholder="Search name, address, or record number" value={search} onChange={event => setSearch(event.target.value)} />
                    </label>
                    <div className="clinical-filter-group" aria-label="Archive record status">
                        {([
                            ['candidates', 'Candidates'],
                            ['active', 'Active'],
                            ['archived', 'Archived'],
                        ] as Array<[ArchiveFilter, string]>).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setFilter(value)} className={`clinical-filter-button min-h-11 flex-1 sm:flex-none ${filter === value ? 'is-active' : ''}`} aria-pressed={filter === value}>{label}</button>
                        ))}
                    </div>
                </div>

                {hasLoadError && !isLoading && (
                    <div className="m-4 flex flex-col items-start gap-3 rounded-xl border border-[var(--coral-border)] bg-[var(--coral-tint)] p-4 text-sm text-[var(--coral-dark)] sm:flex-row sm:items-center sm:justify-between" role="alert">
                        <div className="flex items-start gap-3"><Icon name="alert-triangle" className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Unable to load archive records</p><p className="mt-0.5">Check your connection and try again. No archive data was changed.</p></div></div>
                        <Button variant="outline" size="sm" onClick={() => void loadArchivePatients()} className="w-full sm:w-auto">Try again</Button>
                    </div>
                )}

                <div className="hidden overflow-x-auto md:block">
                    <table className={`clinical-table archive-review-table ${readOnly ? 'is-read-only min-w-[860px]' : 'min-w-[980px]'}`}>
                        <colgroup><col className="archive-col-patient" /><col className="archive-col-demographics" /><col className="archive-col-date" /><col className="archive-col-status" /><col className="archive-col-notes" />{!readOnly && <col className="archive-col-action" />}</colgroup>
                        <thead><tr><th>Patient</th><th>Age / Sex</th><th>Last Activity</th><th className="archive-table-center">Status</th><th>Archive Notes</th>{!readOnly && <th className="archive-table-center">Action</th>}</tr></thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={readOnly ? 5 : 6}><SkeletonTable rows={5} columns={readOnly ? 5 : 6} /></td></tr>
                            ) : hasLoadError ? null : visiblePatients.length === 0 ? (
                                <tr><td colSpan={readOnly ? 5 : 6}><div className="clinical-table-state">{emptyMessage}</div></td></tr>
                            ) : visiblePatients.map(patient => (
                                <tr key={patient.id}>
                                    <td><div className="clinical-primary">{patientName(patient)}</div><div className="clinical-secondary">Patient record no. {patient.id} | {patient.address || 'No address recorded'}</div></td>
                                    <td>{patient.age ?? '-'} / {patient.sex || '-'}</td>
                                    <td>{formatDate(patient.last_activity_at || patient.created_at)}</td>
                                    <td className="archive-table-center"><ArchiveStatusBadge patient={patient} /></td>
                                    <td><div className="max-w-[260px] text-sm text-[var(--text-2)]">{patient.archive_reason || 'No archive note recorded.'}</div></td>
                                    {!readOnly && <td className="archive-table-center"><div className="archive-action-cell">{patient.archive_status === 'archived' ? <button type="button" className="clinical-row-action min-w-[5.5rem]" onClick={() => openAction(patient, 'restore')}>Restore</button> : <button type="button" className="clinical-row-action danger min-w-[5.5rem]" onClick={() => openAction(patient, 'archive')}>Archive</button>}</div></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="divide-y divide-[var(--border)] md:hidden">
                    {isLoading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="space-y-3 p-4" aria-hidden="true"><div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" /><div className="h-3 w-full animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" /><div className="h-10 w-full animate-pulse rounded-lg bg-[var(--surface-muted)] motion-reduce:animate-none" /></div>)
                    : hasLoadError ? null
                    : visiblePatients.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center px-5 py-10 text-center"><Icon name="clipboard" className="mb-3 h-7 w-7 text-[var(--text-muted)]" /><p className="font-semibold text-[var(--text)]">{emptyMessage}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">Try another search or archive status.</p></div>
                    : visiblePatients.map(patient => (
                        <article key={patient.id} className="p-4">
                            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words text-sm font-semibold text-[var(--text)]">{patientName(patient)}</h4><p className="mt-1 text-xs text-[var(--text-secondary)]">Patient record no. {patient.id}</p></div><ArchiveStatusBadge patient={patient} /></div>
                            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><dt className="text-xs font-medium text-[var(--text-muted)]">Age / Sex</dt><dd className="mt-1 text-[var(--text-2)]">{patient.age ?? '-'} / {patient.sex || '-'}</dd></div><div><dt className="text-xs font-medium text-[var(--text-muted)]">Last activity</dt><dd className="mt-1 text-[var(--text-2)]">{formatDate(patient.last_activity_at || patient.created_at)}</dd></div><div className="col-span-2"><dt className="text-xs font-medium text-[var(--text-muted)]">Address</dt><dd className="mt-1 break-words text-[var(--text-2)]">{patient.address || 'No address recorded'}</dd></div><div className="col-span-2"><dt className="text-xs font-medium text-[var(--text-muted)]">Archive notes</dt><dd className="mt-1 break-words text-[var(--text-2)]">{patient.archive_reason || 'No archive note recorded.'}</dd></div></dl>
                            {!readOnly && <button type="button" className={`mt-4 min-h-11 w-full rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] ${patient.archive_status === 'archived' ? 'border-[var(--control-border)] bg-[var(--surface)] text-[var(--brand-active)]' : 'border-[var(--coral-border)] bg-[var(--coral-tint)] text-[var(--coral-dark)]'}`} onClick={() => openAction(patient, patient.archive_status === 'archived' ? 'restore' : 'archive')}>{patient.archive_status === 'archived' ? 'Restore record' : 'Archive record'}</button>}
                        </article>
                    ))}
                </div>
            </section>

            {!readOnly && selectedPatient && action && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[var(--overlay-soft)] p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(event) => { if (event.target === event.currentTarget && !isSaving) closeAction(); }}>
                    <Modal labelledBy="archive-action-title" onClose={isSaving ? undefined : closeAction} className="max-h-[92vh] max-w-lg overflow-y-auto rounded-b-none sm:rounded-b-2xl">
                        <div className="border-b border-[var(--border-soft)] p-5">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Confirm patient record action</p>
                            <h3 id="archive-action-title" className="text-lg font-semibold text-[var(--text)]">{action === 'archive' ? 'Archive Patient Record' : 'Restore Patient Record'}</h3>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">{patientName(selectedPatient)} | Patient record no. {selectedPatient.id}</p>
                        </div>
                        <div className="space-y-4 p-5">
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm leading-6 text-[var(--text-2)]">{action === 'archive' ? 'Archiving will hide this patient from active records. Medical history and health information remain available and the record can be restored later.' : 'Restoring will return this patient to active records according to the existing archive workflow.'}</div>
                            <label htmlFor="archive-action-reason" className="block"><span className="clinical-field-label">{action === 'archive' ? 'Archive Reason' : 'Restore Reason'} *</span><textarea id="archive-action-reason" value={reason} onChange={event => setReason(event.target.value)} className="mt-1 min-h-[120px] w-full rounded-lg border border-[var(--control-border)] bg-white px-3 py-2 text-base font-medium text-[var(--text)] outline-none focus:border-[var(--focus-color)] focus:ring-2 focus:ring-[var(--focus-ring)] sm:text-sm" placeholder={action === 'archive' ? 'Enter the reason for archiving this patient record.' : 'Explain why this patient record should be restored to active records.'} /></label>
                        </div>
                        <div className="grid grid-cols-2 gap-3 border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] p-4"><Button type="button" variant="outline" onClick={closeAction} disabled={isSaving}>Cancel</Button><Button type="button" variant={action === 'archive' ? 'danger' : 'secondary'} onClick={submitArchiveAction} isLoading={isSaving}>{isSaving ? 'Saving…' : action === 'archive' ? 'Archive Record' : 'Restore Record'}</Button></div>
                    </Modal>
                </div>
            )}
        </div>
    );
}
