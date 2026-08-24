import { useCallback, useEffect, useState } from 'react';
import { AttentionCard } from './AttentionCard';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonText } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchHome, type PortalHome } from '../../features/patient-portal/api';
import { formatLongDate, greetingForHour } from '../../features/patient-portal/format';

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
                {greetingForHour()}, {greetingName}.
            </p>

            {state.status === 'loading' && (
                <div className="space-y-3">
                    <SkeletonText lines={2} />
                    <SkeletonText lines={2} />
                </div>
            )}

            {state.status === 'error' && <SectionError onRetry={() => void load()} message="We could not load this Home summary right now." />}

            {state.status === 'ready' && <HomeContent home={state.home} onViewVisits={onViewVisits} />}
        </div>
    );
}

function HomeContent({ home, onViewVisits }: { home: PortalHome; onViewVisits: () => void }) {
    const nextFollowUp = formatLongDate(home.nextFollowUpDate);
    const recentLab = formatLongDate(home.recentLabResultDate);
    const recentMedicine = formatLongDate(home.recentMedicineDate);
    const lastVisit = formatLongDate(home.lastVisitDate);

    const hasAttention = Boolean(nextFollowUp || recentLab || recentMedicine);

    if (!hasAttention && !lastVisit) {
        return (
            <EmptyState
                icon={<Icon name="check" className="h-5 w-5" />}
                title="Nothing needs your attention right now"
                description="Visits, medicines, and lab results for this health record will appear here."
            />
        );
    }

    return (
        <div className="space-y-3">
            {nextFollowUp && (
                <AttentionCard
                    icon="calendar"
                    title={`Recommended return date: ${nextFollowUp}`}
                />
            )}
            {recentLab && (
                <AttentionCard
                    icon="flask"
                    title="A new lab result is available"
                    description={`Released ${recentLab}`}
                />
            )}
            {recentMedicine && (
                <AttentionCard
                    icon="pill"
                    title="A new prescription is available"
                    description={`Prescribed ${recentMedicine}`}
                />
            )}
            {lastVisit && (
                <AttentionCard
                    icon="stethoscope"
                    title={`Last visit: ${lastVisit}`}
                    description={home.lastVisitDiagnosis ?? undefined}
                    onClick={onViewVisits}
                />
            )}
            {!hasAttention && (
                <p className="text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                    Nothing else needs your attention right now.
                </p>
            )}
        </div>
    );
}
