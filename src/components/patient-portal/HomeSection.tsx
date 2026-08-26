import { useCallback, useEffect, useState } from 'react';
import { AttentionCard } from './AttentionCard';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonText } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchHome, type PortalHome } from '../../features/patient-portal/api';
import { formatLongDate, greetingForHour } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface HomeSectionProps {
    patientId: number;
    greetingName: string;
    onViewVisits: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; home: PortalHome };

/** Home — "What needs my attention?" (§9.1). Every card here reflects
 * only what patient_portal_home() returned; nothing is inferred or
 * re-derived client-side (§17 Phase 6 "no client-side filtering"). */
export function HomeSection({ patientId, greetingName, onViewVisits }: HomeSectionProps) {
    const { t, language } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const home = await fetchHome(patientId);
            setState({ status: 'ready', home });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div>
            <p className="mb-4 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">
                {greetingForHour(new Date(), language)}, {greetingName}.
            </p>

            {state.status === 'loading' && (
                <div className="space-y-3">
                    <SkeletonText lines={2} />
                    <SkeletonText lines={2} />
                </div>
            )}

            {state.status === 'error' && <SectionError onRetry={() => void load()} message={t('home.loadError')} />}

            {state.status === 'ready' && <HomeContent home={state.home} onViewVisits={onViewVisits} />}
        </div>
    );
}

function HomeContent({ home, onViewVisits }: { home: PortalHome; onViewVisits: () => void }) {
    const { t, language } = useT();
    const nextFollowUp = formatLongDate(home.nextFollowUpDate, language);
    const recentLab = formatLongDate(home.recentLabResultDate, language);
    const recentMedicine = formatLongDate(home.recentMedicineDate, language);
    const lastVisit = formatLongDate(home.lastVisitDate, language);

    const hasAttention = Boolean(nextFollowUp || recentLab || recentMedicine);

    if (!hasAttention && !lastVisit) {
        return (
            <EmptyState
                icon={<Icon name="check" className="h-5 w-5" />}
                title={t('home.nothingAttention')}
                description={t('home.nothingAttentionDescription')}
            />
        );
    }

    return (
        <div className="space-y-3">
            {nextFollowUp && (
                <AttentionCard
                    icon="calendar"
                    title={t('home.recommendedReturn', { date: nextFollowUp })}
                />
            )}
            {recentLab && (
                <AttentionCard
                    icon="flask"
                    title={t('home.newLabResult')}
                    description={t('home.released', { date: recentLab })}
                />
            )}
            {recentMedicine && (
                <AttentionCard
                    icon="pill"
                    title={t('home.newPrescription')}
                    description={t('home.prescribedOn', { date: recentMedicine })}
                />
            )}
            {lastVisit && (
                <AttentionCard
                    icon="stethoscope"
                    title={t('home.lastVisit', { date: lastVisit })}
                    description={home.lastVisitDiagnosis ?? undefined}
                    onClick={onViewVisits}
                />
            )}
            {!hasAttention && (
                <p className="text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                    {t('home.nothingElseAttention')}
                </p>
            )}
        </div>
    );
}
