import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchFollowUps, type PortalFollowUp } from '../../features/patient-portal/api';
import { formatLongDate, isFollowUpDone, isTodayOrFuture } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface FollowUpListProps {
    patientId: number;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; followUps: PortalFollowUp[] };

/** Follow-ups (§9.2) -- upcoming first, then past. Every card carries the
 * disambiguating line; MediSens has no appointment/scheduling feature and
 * none is implied here. */
export function FollowUpList({ patientId }: FollowUpListProps) {
    const { t } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const rows = await fetchFollowUps(patientId);
            setState({ status: 'ready', followUps: rows });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (state.status === 'loading') return <SkeletonList rows={3} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('followups.loadError')} />;

    if (state.followUps.length === 0) {
        return (
            <EmptyState
                icon={<Icon name="calendar" className="h-5 w-5" />}
                title={t('followups.noneTitle')}
                description={t('followups.noneDescription')}
            />
        );
    }

    const upcoming = state.followUps
        .filter((f) => !isFollowUpDone(f.status) && isTodayOrFuture(f.visitDate))
        .sort((a, b) => (a.visitDate ?? '').localeCompare(b.visitDate ?? ''));
    const past = state.followUps
        .filter((f) => isFollowUpDone(f.status) || !isTodayOrFuture(f.visitDate))
        .sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''));

    return (
        <div className="space-y-5">
            {upcoming.length > 0 && (
                <div>
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('followups.upcoming')}</h2>
                    <ul className="space-y-3">
                        {upcoming.map((f) => (
                            <li key={f.followUpToken}>
                                <FollowUpCard followUp={f} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {past.length > 0 && (
                <div>
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('followups.past')}</h2>
                    <ul className="space-y-3">
                        {past.map((f) => (
                            <li key={f.followUpToken}>
                                <FollowUpCard followUp={f} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function FollowUpCard({ followUp }: { followUp: PortalFollowUp }) {
    const { t, language } = useT();
    const date = formatLongDate(followUp.visitDate, language);
    const done = isFollowUpDone(followUp.status);
    const pastDue = !done && !isTodayOrFuture(followUp.visitDate);

    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            {date && <p className="font-semibold text-[var(--text)]">{date}</p>}
            {followUp.reason && <p className="mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{followUp.reason}</p>}
            {done && <p className="mt-1 text-[length:var(--type-caption-size)] font-medium text-[var(--green)]">{t('followups.completed')}</p>}
            {pastDue && <p className="mt-1 text-[length:var(--type-caption-size)] font-medium text-[var(--amber-text)]">{t('followups.pastDue')}</p>}
            <p className="mt-2 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{t('followups.disambiguation')}</p>
        </div>
    );
}
