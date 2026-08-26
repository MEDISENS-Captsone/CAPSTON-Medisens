import { useEffect, useState } from 'react';
import { VisitList } from './VisitList';
import { VisitDetail } from './VisitDetail';
import { VaccinationList } from './VaccinationList';
import { FollowUpList } from './FollowUpList';
import { useT } from '../../lib/i18n/patientPortal';

interface MyHealthSectionProps {
    patientId: number;
    onNavigateToMedicines: () => void;
    onNavigateToLabs: () => void;
}

type SubTab = 'visits' | 'vaccinations' | 'followups';

const SUB_TABS: { id: SubTab; labelKey: 'health.visits' | 'health.vaccinations' | 'health.followups' }[] = [
    { id: 'visits', labelKey: 'health.visits' },
    { id: 'vaccinations', labelKey: 'health.vaccinations' },
    { id: 'followups', labelKey: 'health.followups' },
];

/** My Health (§9.2) -- a 3-item, full-width, wrapping segmented tab row
 * over Visits / Vaccinations / Follow-ups, plus the Visit detail drill-in. */
export function MyHealthSection({ patientId, onNavigateToMedicines, onNavigateToLabs }: MyHealthSectionProps) {
    const { t } = useT();
    const [subTab, setSubTab] = useState<SubTab>('visits');
    const [selectedVisitToken, setSelectedVisitToken] = useState<string | null>(null);

    // Switching the active health record (person switcher) must never leave
    // a previous record's visit open on screen (§6.2).
    useEffect(() => {
        setSelectedVisitToken(null);
        setSubTab('visits');
    }, [patientId]);

    if (selectedVisitToken) {
        return (
            <VisitDetail
                patientId={patientId}
                visitToken={selectedVisitToken}
                onBack={() => setSelectedVisitToken(null)}
                onNavigateToMedicines={onNavigateToMedicines}
                onNavigateToLabs={onNavigateToLabs}
            />
        );
    }

    return (
        <div>
            <div role="tablist" aria-label={t('health.tabsLabel')} className="portal-segmented-tabs">
                {SUB_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={subTab === tab.id}
                        className="portal-segmented-tab"
                        onClick={() => setSubTab(tab.id)}
                    >
                        {t(tab.labelKey)}
                    </button>
                ))}
            </div>

            <div className="mt-4">
                {subTab === 'visits' && <VisitList patientId={patientId} onSelectVisit={setSelectedVisitToken} />}
                {subTab === 'vaccinations' && <VaccinationList patientId={patientId} />}
                {subTab === 'followups' && <FollowUpList patientId={patientId} />}
            </div>
        </div>
    );
}
