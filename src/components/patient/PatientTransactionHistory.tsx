import { useCallback, useEffect, useState } from 'react';
import {
    fetchPatientTransactions,
    type PatientHistoryWarning,
    type PatientTransaction,
} from '../../features/patients/history';
import { EmptyState } from '../shared/EmptyState';
import { StatusBadge } from '../shared/StatusBadge';
import { Icon } from '../shared/Icon';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { LabResultDetailModal, type LabResultData } from '../shared/LabResultDetailModal';

interface PatientTransactionHistoryProps {
    patientId?: string;
    transactions?: PatientTransaction[];
    isLoading?: boolean;
    warnings?: PatientHistoryWarning[];
    error?: string | null;
    onRetry?: () => void;
    /** BHW touch view: disclose full encounter fields only when requested. */
    compact?: boolean;
    /** Patient display name to pass into the lab result modal. */
    patientName?: string;
}

type HistoryFilter = 'all' | 'consultations' | 'initial';

const TYPE_LABEL: Record<PatientTransaction['type'], string> = {
    registration: 'Registration',
    consent: 'Consent',
    initial_consultation: 'Nurse',
    doctor_consultation: 'Doctor',
    lab_request: 'Lab Request',
    lab_result: 'Lab Result',
    prescription: 'Prescription',
    pharmacy: 'Pharmacy',
    vaccine: 'Vaccine',
    follow_up: 'Follow-up',
};

const TYPE_MARK: Record<PatientTransaction['type'], string> = {
    registration: 'REG',
    consent: 'CON',
    initial_consultation: 'NUR',
    doctor_consultation: 'DOC',
    lab_request: 'LAB',
    lab_result: 'RES',
    prescription: 'RX',
    pharmacy: 'PHR',
    vaccine: 'VAC',
    follow_up: 'FUP',
};

const TYPE_MARK_CLASS: Record<PatientTransaction['type'], string> = {
    registration: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border)]',
    consent: 'bg-[var(--amber-surface)] text-[var(--amber-text-dark)] ring-[var(--amber-border)]',
    initial_consultation: 'bg-[var(--surface-subtle)] text-[var(--text)] ring-[var(--border)]',
    doctor_consultation: 'bg-[var(--surface-subtle)] text-[var(--text-2)] ring-[var(--border)]',
    lab_request: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]',
    lab_result: 'bg-[var(--green-surface)] text-[var(--green-ink-strong)] ring-[var(--green-border-soft)]',
    prescription: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]',
    pharmacy: 'bg-[var(--green-surface)] text-[var(--green-ink-strong)] ring-[var(--green-border-soft)]',
    vaccine: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]',
    follow_up: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)] ring-[var(--brand-accent-surface)]',
};

function formatDate(value?: string | null) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDoctorDiagnosisSummary(summary?: string) {
    if (!summary) return null;

    const diagnoses = summary
        .split(/\r\n|\r|\n/)
        .map(diagnosis => diagnosis.trim())
        .filter(Boolean);

    if (diagnoses.length === 0) return null;
    return { first: diagnoses[0], additionalCount: diagnoses.length - 1 };
}

function CardHeader({ type, title, date, status, summary, items }: PatientTransaction) {
    const diagnosisSummary = type === 'doctor_consultation' ? getDoctorDiagnosisSummary(summary) : null;
    const consultationStatus = type === 'doctor_consultation'
        ? items.find(group => group.label === 'Consultation status')?.values[0]
        : null;
    const displayStatus = [status, consultationStatus]
        .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
        .join(' · ');

    return (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-2 text-[0.65rem] font-semibold ring-1 ${TYPE_MARK_CLASS[type]}`}>
                        {TYPE_MARK[type]}
                    </span>
                    <StatusBadge tone={type === 'lab_result' || type === 'pharmacy' ? 'green' : type === 'vaccine' ? 'indigo' : 'blue'}>
                        {TYPE_LABEL[type]}
                    </StatusBadge>
                    {displayStatus && <span className="min-w-0 truncate text-xs font-bold text-[var(--text-2)]">{displayStatus}</span>}
                </div>
                <h4 className="mt-2 text-base font-extrabold text-[var(--text)]">{title}</h4>
                {diagnosisSummary ? (
                    <p className="mt-1 flex min-w-0 items-baseline gap-1.5 text-xs font-medium leading-snug text-[var(--text-secondary)]">
                        <span className="min-w-0 truncate">Diagnosis: {diagnosisSummary.first}</span>
                        {diagnosisSummary.additionalCount > 0 && (
                            <span className="shrink-0 whitespace-nowrap font-bold text-[var(--brand-active)]">+{diagnosisSummary.additionalCount} more</span>
                        )}
                    </p>
                ) : summary && type !== 'doctor_consultation' ? (
                    <p className="mt-1 line-clamp-2 break-words text-sm font-medium leading-snug text-[var(--text-2)]">{summary}</p>
                ) : null}
            </div>
            <div className="whitespace-nowrap text-xs font-semibold text-[var(--text-secondary)] sm:text-right">{formatDate(date)}</div>
        </div>
    );
}

const DOCTOR_DETAIL_SECTIONS = [
    {
        title: 'Presenting Problem',
        labels: ['Chief complaint', 'History of present illness'],
    },
    {
        title: 'Clinical Assessment',
        labels: ['Physical examination / assessment', 'Diagnosis'],
    },
    {
        title: 'Management & Health Education',
        labels: ['Management / treatment plan', 'Medication or treatment instructions', 'Patient instructions / health education', 'Follow-up'],
    },
    {
        title: 'Relevant Histories',
        labels: ['Family history', 'Past medical / surgical history', 'Immunization history', 'Smoking history', 'Drinking history'],
    },
] as const;

const DOCTOR_OVERVIEW_LABELS = ['Consultation time', 'Attending provider', 'Consultation status'] as const;

const DOCTOR_FULL_WIDTH_LABELS = new Set([
    'Chief complaint',
    'History of present illness',
    'Physical examination / assessment',
    'Diagnosis',
    'Management / treatment plan',
    'Medication or treatment instructions',
    'Patient instructions / health education',
    'Follow-up',
]);

function DoctorDetailRow({ label, values, compact = false }: PatientTransaction['items'][number] & { compact?: boolean }) {
    return (
        <div className={`min-w-0 border-b border-[var(--border-soft)] py-2.5 last:border-b-0 sm:rounded-lg sm:border-b-0 sm:border-l-2 sm:border-l-[var(--border-strong)] sm:bg-[var(--surface-subtle)] sm:px-3 ${compact ? 'grid grid-cols-[minmax(6.5rem,0.42fr)_minmax(0,1fr)] items-start gap-3' : ''} ${DOCTOR_FULL_WIDTH_LABELS.has(label) ? 'sm:col-span-2' : ''}`}>
            <dt className="text-xs font-semibold leading-relaxed text-[var(--text-secondary)]">{label}</dt>
            <dd className={`${compact ? 'mt-0' : 'mt-0.5'} min-w-0 text-sm font-medium leading-relaxed text-[var(--text)]`}>
                <ul className="space-y-1">
                    {values.map((value, index) => (
                        <li key={`${label}-${index}`} className="flex min-w-0 gap-2">
                            {values.length > 1 && <span className="shrink-0 text-[var(--text-muted)]" aria-hidden="true">•</span>}
                            <span className="min-w-0 break-words">{value}</span>
                        </li>
                    ))}
                </ul>
            </dd>
        </div>
    );
}

function DoctorConsultationDetails({ transaction }: { transaction: PatientTransaction }) {
    const groupsByLabel = new Map(transaction.items.map(group => [group.label, group]));
    const assignedLabels = new Set([
        ...DOCTOR_OVERVIEW_LABELS,
        ...DOCTOR_DETAIL_SECTIONS.flatMap(section => [...section.labels]),
    ]);
    const remainingGroups = transaction.items.filter(group => group.values.length > 0 && !assignedLabels.has(group.label));
    const consultationTime = groupsByLabel.get('Consultation time')?.values[0];
    const consultationTimeDisplay = consultationTime?.match(/^\d{1,2}:\d{2}/)?.[0] ?? consultationTime;
    const attendingProvider = groupsByLabel.get('Attending provider')?.values[0];
    const consultationStatus = groupsByLabel.get('Consultation status')?.values[0];
    const overviewPrimary = [transaction.date ? formatDate(transaction.date) : '', consultationTimeDisplay ?? ''].filter(Boolean).join(' · ');
    const overviewSecondary = [attendingProvider, consultationStatus].filter(Boolean).join(' · ');

    return (
        <div className="mt-3 space-y-4 sm:mt-4 sm:space-y-5">
            {(overviewPrimary || overviewSecondary) && (
                <section aria-labelledby={`${transaction.id}-overview-heading`}>
                    <h5 id={`${transaction.id}-overview-heading`} className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                        Encounter Overview
                    </h5>
                    <div className="mt-1.5 border-y border-[var(--border-soft)] py-2 text-xs font-medium leading-relaxed text-[var(--text-secondary)] sm:rounded-lg sm:border sm:bg-[var(--surface-subtle)] sm:px-3">
                        {overviewPrimary && <p>{overviewPrimary}</p>}
                        {overviewSecondary && <p className={overviewPrimary ? 'mt-0.5' : ''}>{overviewSecondary}</p>}
                    </div>
                </section>
            )}
            {DOCTOR_DETAIL_SECTIONS.map((section, sectionIndex) => {
                const sectionGroups = section.labels
                    .map(label => groupsByLabel.get(label))
                    .filter((group): group is PatientTransaction['items'][number] => Boolean(group?.values.length));

                if (section.title === 'Relevant Histories') sectionGroups.push(...remainingGroups);
                if (sectionGroups.length === 0) return null;
                const isClinicalAssessment = section.title === 'Clinical Assessment';
                const isSupportingHistory = section.title === 'Relevant Histories';

                return (
                    <section
                        key={section.title}
                        aria-labelledby={`${transaction.id}-${sectionIndex}-heading`}
                        className={isClinicalAssessment ? 'rounded-xl border border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)]/40 p-3 sm:p-4' : ''}
                    >
                        <div className="mb-1.5 flex items-center gap-3 sm:mb-2.5">
                            <h5 id={`${transaction.id}-${sectionIndex}-heading`} className={`shrink-0 font-extrabold text-[var(--text)] ${isClinicalAssessment ? 'text-sm' : 'text-[0.8rem]'}`}>
                                {section.title}
                            </h5>
                            <span className="h-px flex-1 bg-[var(--border-soft)]" aria-hidden="true" />
                        </div>
                        <dl className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-2.5">
                            {sectionGroups.map(group => <DoctorDetailRow key={group.label} {...group} compact={isSupportingHistory} />)}
                        </dl>
                    </section>
                );
            })}
        </div>
    );
}

function ItemsGrid({ items }: { items: PatientTransaction['items'] }) {
    if (items.length === 0) return null;

    return (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map(group => (
                <div key={group.label} className={`rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 ${!group.values.length ? 'hidden' : ''}`}>
                    <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--text-2)]">{group.label}</div>
                    <ul className="space-y-1.5">
                        {group.values.map((value, index) => (
                            <li
                                key={`${group.label}-${index}`}
                                className="rounded-md border border-[var(--border-soft)] bg-white px-3 py-2 text-sm font-medium leading-relaxed text-[var(--text)] shadow-sm"
                            >
                                {value}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function RetryButton({ onRetry }: { onRetry?: () => void }) {
    if (!onRetry) return null;
    return (
        <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg bg-[var(--brand-active)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--brand-active-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]"
        >
            Retry
        </button>
    );
}

function HistoryWarning({ warnings, onRetry }: { warnings: PatientHistoryWarning[]; onRetry?: () => void }) {
    if (warnings.length === 0) return null;
    const canRetry = warnings.some(warning => warning.kind !== 'application') && Boolean(onRetry);

    return (
        <div className="mb-4 rounded-xl border border-[var(--amber-border)] bg-[var(--amber-surface)] p-4 text-sm text-[var(--amber-ink-strong)]">
            <div className="font-extrabold">Partial history loaded</div>
            <p className="mt-1 font-medium text-[var(--amber-ink)]">
                Some medical record sections could not be loaded. Review the visible records with caution.
            </p>
            <ul className="mt-3 space-y-1">
                {warnings.map(warning => (
                    <li key={warning.label} className="font-semibold">
                        {warning.label}: <span className="font-medium">{warning.message}</span>
                    </li>
                ))}
            </ul>
            <RetryButton onRetry={canRetry ? onRetry : undefined} />
        </div>
    );
}

export function PatientTransactionHistory({ patientId, transactions, isLoading, warnings = [], error, onRetry, compact = false, patientName }: PatientTransactionHistoryProps) {
    const [loadedTransactions, setLoadedTransactions] = useState<PatientTransaction[]>([]);
    const [loadedWarnings, setLoadedWarnings] = useState<PatientHistoryWarning[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all');
    const [expandedTransactionIds, setExpandedTransactionIds] = useState<Set<string>>(new Set());
    const [selectedLabResult, setSelectedLabResult] = useState<LabResultData | null>(null);

    useEffect(() => {
        setExpandedTransactionIds(new Set());
    }, [patientId]);

    const loadTransactions = useCallback(async () => {
        if (!patientId) return;

        setIsFetching(true);
        setLoadError(null);
        try {
            const history = await fetchPatientTransactions(patientId);
            setLoadedTransactions(history.transactions);
            setLoadedWarnings(history.warnings);
        } catch (loadFailure) {
            setLoadedTransactions([]);
            setLoadedWarnings([]);
            setLoadError(loadFailure instanceof Error ? loadFailure.message : 'Unable to load patient history.');
        } finally {
            setIsFetching(false);
        }
    }, [patientId]);

    useEffect(() => {
        void loadTransactions();
    }, [loadTransactions]);

    const visibleTransactions = patientId ? loadedTransactions : transactions ?? [];
    const visibleWarnings = patientId ? loadedWarnings : warnings;
    const visibleError = patientId ? loadError : error;
    const retry = patientId ? loadTransactions : onRetry;
    const filterOptions: Array<{ id: HistoryFilter; label: string; count: number }> = [
        { id: 'all', label: 'All', count: visibleTransactions.length },
        {
            id: 'consultations',
            label: 'Consultations',
            count: visibleTransactions.filter(transaction => transaction.type === 'doctor_consultation').length,
        },
        {
            id: 'initial',
            label: 'Initial',
            count: visibleTransactions.filter(transaction => transaction.type === 'initial_consultation').length,
        },
    ];
    const filteredTransactions = visibleTransactions.filter(transaction => {
        if (activeFilter === 'consultations') return transaction.type === 'doctor_consultation';
        if (activeFilter === 'initial') return transaction.type === 'initial_consultation';
        return true;
    });
    const emptyFilterCopy = activeFilter === 'consultations'
        ? {
            title: 'No consultation records yet.',
            description: 'Doctor consultation records will appear here after a consultation is completed.',
        }
        : activeFilter === 'initial'
            ? {
                title: 'No consultation records yet.',
                description: 'Initial consultation records will appear here after nurse intake is completed.',
            }
            : {
                title: 'No transactions found',
                description: 'Registration, consent, consultations, lab, pharmacy, vaccine, and follow-up records will appear here.',
            };
    const isInitialHistoryLoading = (isLoading || isFetching) && visibleTransactions.length === 0;
    const isRefreshingHistory = (isLoading || isFetching) && visibleTransactions.length > 0;

    const handleFilterChange = (filter: HistoryFilter) => {
        if (filter === activeFilter) return;
        setExpandedTransactionIds(new Set());
        setActiveFilter(filter);
    };

    const toggleTransaction = (transactionId: string) => {
        setExpandedTransactionIds(current => {
            const next = new Set(current);
            if (next.has(transactionId)) next.delete(transactionId);
            else next.add(transactionId);
            return next;
        });
    };

    if (isInitialHistoryLoading) {
        return (
            <div role="status" aria-live="polite" aria-busy="true">
                <div className="mb-4 flex flex-wrap gap-2">
                    <Skeleton className="h-9 w-20 rounded-lg" />
                    <Skeleton className="h-9 w-32 rounded-lg" />
                    <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
                <SkeletonList rows={4} />
            </div>
        );
    }

    if (visibleError) {
        return (
            <div className="rounded-lg border border-[var(--coral-border)] bg-[var(--coral-tint)] p-3 text-sm text-[var(--coral-ink)]">
                <div className="font-extrabold">Patient history could not be loaded</div>
                <p className="mt-1 font-medium">{visibleError}</p>
                <RetryButton onRetry={retry} />
            </div>
        );
    }

    const filterControls = (
        <div className="mb-2 flex flex-wrap gap-2 sm:mb-3">
            {filterOptions.map(option => (
                <button
                    key={option.id}
                    type="button"
                    onClick={() => handleFilterChange(option.id)}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] ${
                        activeFilter === option.id
                            ? 'border-[var(--brand-active)] bg-[var(--brand-active)] text-white'
                            : 'border-[var(--border)] bg-white text-[var(--text-2)] hover:border-[var(--border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-2)]'
                    }`}
                >
                    {option.label}
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[0.65rem] ${
                        activeFilter === option.id ? 'bg-white/20 text-white' : 'bg-[var(--surface-subtle)] text-[var(--text-2)]'
                    }`}>
                        {option.count}
                    </span>
                </button>
            ))}
        </div>
    );

    if (visibleTransactions.length === 0) {
        if (visibleWarnings.length > 0) {
            return (
                <div>
                    <HistoryWarning warnings={visibleWarnings} onRetry={retry} />
                    <div className="rounded-lg border border-[var(--border)] bg-white p-3 text-sm font-semibold text-[var(--text-2)]">
                        Some patient history sections are unavailable. Retry to refresh the record.
                    </div>
                </div>
            );
        }

        return (
            <div>
                {filterControls}
                <EmptyState title={emptyFilterCopy.title} description={emptyFilterCopy.description} />
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Lab Result Detail Modal */}
            {selectedLabResult && (
                <LabResultDetailModal
                    result={selectedLabResult}
                    onClose={() => setSelectedLabResult(null)}
                />
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                {filterControls}
                <div className={`doctor-analytics-updating ${isRefreshingHistory ? 'is-visible' : 'max-sm:hidden'}`} role="status" aria-live="polite">
                    <span className="doctor-analytics-spinner" aria-hidden="true" />
                    <span>Updating</span>
                </div>
            </div>
            <HistoryWarning warnings={visibleWarnings} onRetry={retry} />

            <div className="absolute bottom-3 left-[18px] top-3 hidden w-0.5 bg-[var(--border)] sm:block" />

            {filteredTransactions.length === 0 ? (
                <EmptyState
                    title={emptyFilterCopy.title}
                    description={emptyFilterCopy.description}
                />
            ) : (
                <div className="space-y-3">
                    {filteredTransactions.map(transaction => {
                    const isLabResult = transaction.type === 'lab_result';
                    const isExpanded = expandedTransactionIds.has(transaction.id);
                    const detailsId = `patient-history-details-${transaction.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                    const openLabResult = () => {
                        const meta = transaction.metadata ?? {};
                        setSelectedLabResult({
                            labresult_id: meta.labresult_id as string | number | undefined,
                            findings: (meta.findings as string) ?? null,
                            performed_by: (meta.performed_by as string) ?? null,
                            date_performed: (meta.date_performed as string) ?? null,
                            status: transaction.status ?? 'Completed',
                            patientName: patientName,
                        });
                    };

                    return (
                    <div key={transaction.id} className="relative flex gap-4">
                        <div className="hidden shrink-0 pt-4 sm:flex">
                            <div className={`h-2.5 w-2.5 rounded-full shadow-sm ring-2 ring-white ${
                                transaction.type === 'lab_result' || transaction.type === 'pharmacy'
                                    ? 'bg-[var(--green-accent)]'
                                    : transaction.type === 'vaccine'
                                        ? 'bg-[var(--brand-primary)]'
                                        : transaction.type === 'registration'
                                            ? 'bg-[var(--brand-active)]'
                                            : transaction.type === 'consent'
                                                ? 'bg-[var(--amber-accent)]'
                                                : transaction.type === 'follow_up'
                                                    ? 'bg-[var(--brand-primary)]'
                                                    : 'bg-[var(--text-muted)]'
                            }`} />
                        </div>

                        <section
                            className={`${compact ? 'bhw-history-compact-card' : ''} min-w-0 flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm transition-all hover:border-[var(--border)] hover:shadow-md`}
                        >
                            <button
                                type="button"
                                onClick={() => toggleTransaction(transaction.id)}
                                aria-expanded={isExpanded}
                                aria-controls={detailsId}
                                className={`group flex min-h-11 w-full items-start gap-1.5 text-left transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-color)] ${compact ? 'p-3' : 'p-3 sm:p-4'}`}
                            >
                                <span className="min-w-0 flex-1"><CardHeader {...transaction} /></span>
                                <span className="-my-1.5 -mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center self-center text-[var(--brand-active)]" aria-hidden="true">
                                    <Icon name="chevron-right" className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                </span>
                            </button>
                            <div
                                id={detailsId}
                                hidden={!isExpanded}
                                className={`border-t border-[var(--border-soft)] ${compact ? 'px-3 pb-3' : 'px-4 pb-4'}`}
                            >
                                {transaction.type === 'doctor_consultation'
                                    ? <DoctorConsultationDetails transaction={transaction} />
                                    : <ItemsGrid items={transaction.items} />}
                                {isLabResult && !compact && (
                                    <button
                                        type="button"
                                        onClick={openLabResult}
                                        className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-[var(--green-border-soft)] bg-[var(--green-surface)] px-3 py-2 text-xs font-bold text-[var(--green-ink-strong)] transition-colors hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]"
                                    >
                                        <Icon name="flask" className="h-4 w-4" />
                                        View Full Result
                                    </button>
                                )}
                            </div>
                        </section>
                    </div>
                    );
                    })}
                </div>
            )}
        </div>
    );
}
