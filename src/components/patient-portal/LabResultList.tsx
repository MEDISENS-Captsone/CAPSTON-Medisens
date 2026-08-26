import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchLabResults, type PortalLabResultListItem } from '../../features/patient-portal/api';
import { formatLongDate, labResultListLabel } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface LabResultListProps {
    patientId: number;
    onSelectResult: (resultToken: string) => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; results: PortalLabResultListItem[] };

/** Lab Results (§9.4) -- released results only expose a value (behind
 * "View result"); pending requests show only that a result is not yet
 * available. `test_labels` (added by the Phase 7 correction) carries only
 * known, scope-filtered group/test identifiers -- this component maps
 * them to plain-language names and never infers structure itself. */
export function LabResultList({ patientId, onSelectResult }: LabResultListProps) {
    const { t, language } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const rows = await fetchLabResults(patientId);
            setState({ status: 'ready', results: rows });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (state.status === 'loading') return <SkeletonList rows={3} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('labs.loadError')} />;

    if (state.results.length === 0) {
        return (
            <EmptyState
                icon={<Icon name="flask" className="h-5 w-5" />}
                title={t('labs.noneTitle')}
                description={t('labs.noneDescription')}
            />
        );
    }

    const released = state.results.filter((r) => r.kind === 'released');
    const pending = state.results.filter((r) => r.kind === 'pending');
    const genericLabel = labResultListLabel([], language);

    return (
        <div className="space-y-3">
            {pending.map((item, index) => {
                const date = formatLongDate(item.testDate, language);
                const label = labResultListLabel(item.testLabels, language);
                const testDescriptor = label === genericLabel ? t('labs.testDescriptorFallback') : label;
                return (
                    <div key={`pending-${index}`} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                        <p className="text-[var(--text)]">
                            {date ? t('labs.pendingWithDate', { descriptor: testDescriptor, date }) : t('labs.pendingNoDate', { descriptor: testDescriptor })}
                        </p>
                    </div>
                );
            })}

            {released.length === 0 && pending.length > 0 ? null : (
                <ul className="space-y-3">
                    {released.map((item) => (
                        <li key={item.resultToken}>
                            <ResultRow item={item} onClick={() => item.resultToken && onSelectResult(item.resultToken)} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ResultRow({ item, onClick }: { item: PortalLabResultListItem; onClick: () => void }) {
    const { t, language } = useT();
    const date = formatLongDate(item.testDate, language);
    return (
        <button type="button" onClick={onClick} className="portal-visit-card flex items-center justify-between gap-3">
            <span className="min-w-0">
                <span className="block font-semibold text-[var(--text)]">{labResultListLabel(item.testLabels, language)}</span>
                {date && <span className="mt-0.5 block text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{date}</span>}
                {item.performedBy && <span className="mt-0.5 block text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{item.performedBy}</span>}
            </span>
            <span className="shrink-0 text-[length:var(--type-supporting-size)] font-semibold text-[var(--brand-active)]">{t('labs.viewResult')}</span>
        </button>
    );
}
