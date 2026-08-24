import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchFollowUps, type PortalFollowUp } from '../../features/patient-portal/api';
import { formatLongDate, isFollowUpDone, isTodayOrFuture } from '../../features/patient-portal/format';

interface FollowUpListProps {
    patientId: number;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; followUps: PortalFollowUp[] };

const DISAMBIGUATION = 'This is a recommended return date from the healthcare provider. It is not a booked appointment — you may visit the RHU on or near this date.';

/** Follow-ups (§9.2) -- upcoming first, then past. Every card carries the
 * disambiguating line; MediSens has no appointment/scheduling feature and
 * none is implied here. */
export function FollowUpList({ patientId }: FollowUpListProps) {
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
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message="We could not load follow-ups right now." />;

    if (state.followUps.length === 0) {
        return (
            <EmptyState
                icon={<Icon name="calendar" className="h-5 w-5" />}
                title="No follow-ups recorded"
                description="Recommended return dates from the healthcare provider will appear here."
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
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Upcoming</h2>
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
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Past</h2>
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
    const date = formatLongDate(followUp.visitDate);
    const done = isFollowUpDone(followUp.status);
    const pastDue = !done && !isTodayOrFuture(followUp.visitDate);

    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            {date && <p className="font-semibold text-[var(--text)]">{date}</p>}
            {followUp.reason && <p className="mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{followUp.reason}</p>}
            {done && <p className="mt-1 text-[length:var(--type-caption-size)] font-medium text-[var(--green)]">Completed</p>}
            {pastDue && <p className="mt-1 text-[length:var(--type-caption-size)] font-medium text-[var(--amber-text)]">This return date has passed. Please visit the RHU.</p>}
            <p className="mt-2 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{DISAMBIGUATION}</p>
        </div>
    );
}
