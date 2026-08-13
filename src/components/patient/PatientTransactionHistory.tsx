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

interface PatientTransactionHistoryProps {
    patientId?: string;
    transactions?: PatientTransaction[];
    isLoading?: boolean;
    warnings?: PatientHistoryWarning[];
    error?: string | null;
    onRetry?: () => void;
    /** BHW touch view: disclose full encounter fields only when requested. */
    compact?: boolean;
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

function CardHeader({ type, title, date, status, summary }: PatientTransaction) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-2 text-[0.65rem] font-semibold ring-1 ${TYPE_MARK_CLASS[type]}`}>
                        {TYPE_MARK[type]}
                    </span>
                    <StatusBadge tone={type === 'lab_result' || type === 'pharmacy' ? 'green' : type === 'vaccine' ? 'indigo' : 'blue'}>
                        {TYPE_LABEL[type]}
                    </StatusBadge>
                    {status && <span className="text-xs font-bold text-[var(--text-2)]">{status}</span>}
                </div>
                <h4 className="mt-2 text-base font-extrabold text-[var(--text)]">{title}</h4>
                {summary && <p className="mt-1 text-sm font-medium leading-snug text-[var(--text-2)]">{summary}</p>}
            </div>
            <div className="whitespace-nowrap text-xs font-semibold text-[var(--text-secondary)] sm:text-right">{formatDate(date)}</div>
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

export function PatientTransactionHistory({ patientId, transactions, isLoading, warnings = [], error, onRetry, compact = false }: PatientTransactionHistoryProps) {
    const [loadedTransactions, setLoadedTransactions] = useState<PatientTransaction[]>([]);
    const [loadedWarnings, setLoadedWarnings] = useState<PatientHistoryWarning[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all');
    const [expandedTransactionIds, setExpandedTransactionIds] = useState<Set<string>>(new Set());

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
        <div className="mb-4 flex flex-wrap gap-2">
            {filterOptions.map(option => (
                <button
                    key={option.id}
                    type="button"
                    onClick={() => setActiveFilter(option.id)}
                    className={`rounded-lg border px-3 py-2 text-xs font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] ${
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                {filterControls}
                <div className={`doctor-analytics-updating ${isRefreshingHistory ? 'is-visible' : ''}`} role="status" aria-live="polite">
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
                    {filteredTransactions.map(transaction => (
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

                        {compact ? (() => {
                            const isExpanded = expandedTransactionIds.has(transaction.id);
                            return (
                                <section className="bhw-history-compact-card min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedTransactionIds(current => {
                                            const next = new Set(current);
                                            if (next.has(transaction.id)) next.delete(transaction.id);
                                            else next.add(transaction.id);
                                            return next;
                                        })}
                                        aria-expanded={isExpanded}
                                        className="flex w-full items-start gap-3 p-3 text-left"
                                    >
                                        <span className="min-w-0 flex-1"><CardHeader {...transaction} /></span>
                                        <Icon name="chevron-right" className={`mt-1 h-5 w-5 shrink-0 text-[var(--brand-active)] transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
                                    </button>
                                    {isExpanded && <div className="border-t border-[var(--border-soft)] px-3 pb-3"><ItemsGrid items={transaction.items} /></div>}
                                </section>
                            );
                        })() : (
                            <div className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm transition-all hover:border-[var(--border)] hover:shadow-md">
                                <CardHeader {...transaction} />
                                <ItemsGrid items={transaction.items} />
                            </div>
                        )}
                    </div>
                    ))}
                </div>
            )}
        </div>
    );
}
