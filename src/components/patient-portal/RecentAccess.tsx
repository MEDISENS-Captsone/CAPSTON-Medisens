import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Icon } from '../shared/Icon';
import { fetchRecentAccess, type PortalRecentAccessEntry } from '../../features/patient-portal/api';
import { formatDateTime, recentAccessActionLabel } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface RecentAccessProps {
    patientId: number;
}

const PAGE_SIZE = 20;

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; entries: PortalRecentAccessEntry[]; hasMore: boolean };

/** Recent access to this record (§9.5, D-7) -- portal-origin reads only,
 * from patient_portal_recent_access(); staff activity is never listed
 * here, by RPC design, not a frontend filter. */
export function RecentAccess({ patientId }: RecentAccessProps) {
    const { t, language } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const rows = await fetchRecentAccess(patientId, PAGE_SIZE, 0);
            setState({ status: 'ready', entries: rows, hasMore: rows.length === PAGE_SIZE });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleShowMore = async () => {
        if (state.status !== 'ready') return;
        setLoadingMore(true);
        try {
            const rows = await fetchRecentAccess(patientId, PAGE_SIZE, state.entries.length);
            setState({ status: 'ready', entries: [...state.entries, ...rows], hasMore: rows.length === PAGE_SIZE });
        } catch {
            // Keep what already loaded; the button stays for a retry.
        } finally {
            setLoadingMore(false);
        }
    };

    if (state.status === 'loading') return <SkeletonList rows={3} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('recentAccess.loadError')} />;

    if (state.entries.length === 0) {
        return <EmptyState icon={<Icon name="clock" className="h-5 w-5" />} title={t('recentAccess.noneTitle')} description={t('recentAccess.noneDescription')} />;
    }

    return (
        <div>
            <ul className="space-y-2">
                {state.entries.map((entry, index) => {
                    const when = formatDateTime(entry.occurredAt, language);
                    return (
                        <li key={index} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3">
                            <p className="text-[var(--text)]">
                                <span className="font-semibold">{entry.actorLabel}</span> {recentAccessActionLabel(entry.action, language)}
                            </p>
                            {when && <p className="mt-0.5 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{when}</p>}
                        </li>
                    );
                })}
            </ul>
            {state.hasMore && (
                <Button variant="outline" className="mt-3 w-full" onClick={() => void handleShowMore()} isLoading={loadingMore}>
                    {t('recentAccess.showMore')}
                </Button>
            )}
        </div>
    );
}
