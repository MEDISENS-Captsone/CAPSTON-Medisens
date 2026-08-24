import { useEffect, useState } from 'react';
import { VisitList } from './VisitList';
import { VisitDetail } from './VisitDetail';
import { VaccinationList } from './VaccinationList';
import { FollowUpList } from './FollowUpList';

interface MyHealthSectionProps {
    patientId: number;
}

type SubTab = 'visits' | 'vaccinations' | 'followups';

const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'visits', label: 'Visits' },
    { id: 'vaccinations', label: 'Vaccinations' },
    { id: 'followups', label: 'Follow-ups' },
];

/** My Health (§9.2) -- a 3-item, full-width, wrapping segmented tab row
 * over Visits / Vaccinations / Follow-ups, plus the Visit detail drill-in. */
export function MyHealthSection({ patientId }: MyHealthSectionProps) {
    const [subTab, setSubTab] = useState<SubTab>('visits');
    const [selectedVisitToken, setSelectedVisitToken] = useState<string | null>(null);

    // Switching the active health record (person switcher) must never leave
    // a previous record's visit open on screen (§6.2).
    useEffect(() => {
        setSelectedVisitToken(null);
        setSubTab('visits');
    }, [patientId]);

    if (selectedVisitToken) {
        return <VisitDetail patientId={patientId} visitToken={selectedVisitToken} onBack={() => setSelectedVisitToken(null)} />;
    }

    return (
        <div>
            <div role="tablist" aria-label="My Health sections" className="portal-segmented-tabs">
                {SUB_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={subTab === tab.id}
                        className="portal-segmented-tab"
                        onClick={() => setSubTab(tab.id)}
                    >
                        {tab.label}
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
