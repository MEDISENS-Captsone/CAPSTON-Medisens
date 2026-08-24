import { useEffect, useState } from 'react';
import { LabResultList } from './LabResultList';
import { LabResultDetail } from './LabResultDetail';

interface LabResultsSectionProps {
    patientId: number;
}

/** Lab Results (§9.4) -- list plus the result-detail drill-in, mirroring
 * My Health's visit-detail pattern. */
export function LabResultsSection({ patientId }: LabResultsSectionProps) {
    const [selectedResultToken, setSelectedResultToken] = useState<string | null>(null);

    // Switching the active health record (person switcher) must never leave
    // a previous record's result open on screen (§6.2).
    useEffect(() => {
        setSelectedResultToken(null);
    }, [patientId]);

    if (selectedResultToken) {
        return <LabResultDetail patientId={patientId} resultToken={selectedResultToken} onBack={() => setSelectedResultToken(null)} />;
    }

    return <LabResultList patientId={patientId} onSelectResult={setSelectedResultToken} />;
}
