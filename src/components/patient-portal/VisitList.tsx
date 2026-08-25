import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { SkeletonList } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchVisits, type PortalVisit } from '../../features/patient-portal/api';
import { formatLongDate } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

const PAGE_SIZE = 10;

interface VisitListProps {
    patientId: number;
    onSelectVisit: (visitToken: string) => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; visits: PortalVisit[]; hasMore: boolean };

/** Visits (§9.2) -- reverse-chronological cards, paginated 10 at a time
 * with an explicit "Show more visits" button (no infinite scroll, per the
 * blueprint's screen-reader/slow-connection rationale). The collapsing of
 * a linked initial + doctor consultation into one visit already happened
 * inside patient_portal_visits(); this component never reconstructs it. */
export function VisitList({ patientId, onSelectVisit }: VisitListProps) {
    const { t, language } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const rows = await fetchVisits(patientId, PAGE_SIZE, 0);
            setState({ status: 'ready', visits: rows, hasMore: rows.length === PAGE_SIZE });
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
            const rows = await fetchVisits(patientId, PAGE_SIZE, state.visits.length);
            setState({ status: 'ready', visits: [...state.visits, ...rows], hasMore: rows.length === PAGE_SIZE });
        } catch {
            // Keep the already-loaded visits on screen; the button stays so
            // the patient can try again rather than losing what loaded.
        } finally {
            setLoadingMore(false);
        }
    };

    if (state.status === 'loading') return <SkeletonList rows={4} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('visits.loadError')} />;

    if (state.visits.length === 0) {
        return (
            <EmptyState
                icon={<Icon name="stethoscope" className="h-5 w-5" />}
                title={t('visits.noneTitle')}
                description={t('visits.noneDescription')}
            />
        );
    }

    return (
        <div>
            <ul className="space-y-3">
                {state.visits.map((visit) => (
                    <li key={visit.visitToken}>
                        <VisitCard visit={visit} onClick={() => onSelectVisit(visit.visitToken)} />
                    </li>
                ))}
            </ul>
            {state.hasMore && (
                <Button variant="outline" className="mt-3 w-full" onClick={() => void handleShowMore()} isLoading={loadingMore}>
                    {t('visits.showMore')}
                </Button>
            )}
        </div>
    );
}

function VisitCard({ visit, onClick }: { visit: PortalVisit; onClick: () => void }) {
    const { t, language } = useT();
    const date = formatLongDate(visit.visitDate, language);
    return (
        <button type="button" onClick={onClick} className="portal-visit-card">
            <span className="block font-semibold text-[var(--text)]">{date ?? t('visits.fallbackLabel')}</span>
            {visit.reason && <span className="mt-0.5 block text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{visit.reason}</span>}
            {visit.diagnosis && <span className="mt-0.5 block text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{visit.diagnosis}</span>}
            <span className="mt-2 flex flex-wrap gap-2">
                {visit.medicineCount > 0 && <span className="portal-chip">{t('visits.medicineCount', { count: visit.medicineCount, plural: visit.medicineCount === 1 ? '' : 's' })}</span>}
                {visit.labCount > 0 && <span className="portal-chip">{t('visits.labCount', { count: visit.labCount, plural: visit.labCount === 1 ? '' : 's' })}</span>}
                {visit.followUpDate && <span className="portal-chip">{t('visits.followUpChip', { date: formatLongDate(visit.followUpDate, language) ?? '' })}</span>}
            </span>
        </button>
    );
}
