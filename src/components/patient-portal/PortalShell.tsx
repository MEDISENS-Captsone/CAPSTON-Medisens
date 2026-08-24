import { useState } from 'react';
import { useHashPage } from '../../hooks/useHashPage';
import { SkipToContent } from '../layout/SkipToContent';
import { RecordContextBar } from './RecordContextBar';
import { PersonSwitcher } from './PersonSwitcher';
import { BottomTabs, PORTAL_TABS } from './BottomTabs';
import { PlaceholderSection, MoreSection } from './PortalSection';
import { HomeSection } from './HomeSection';
import { MyHealthSection } from './MyHealthSection';
import type { PatientPortalSession } from '../../lib/auth/patientPortal';

const VALID_PAGES = new Set(PORTAL_TABS.map((tab) => tab.id));
function normalizePage(page: string): string {
    return VALID_PAGES.has(page) ? page : 'home';
}

interface PortalShellProps {
    session: PatientPortalSession;
    textSize: 'comfortable' | 'large';
    onToggleTextSize: () => void;
    onSignOut: () => void;
}

/** The authenticated Patient Portal shell (§8, §17 Phase 4). No clinical
 * data is fetched or rendered by this component or anything it mounts --
 * the four content sections are placeholders until their own phases. */
export function PortalShell({ session, textSize, onToggleTextSize, onSignOut }: PortalShellProps) {
    const [activePage, setActivePage] = useHashPage('home', normalizePage);
    const [activeGrantId, setActiveGrantId] = useState<string | null>(session.grants[0]?.id ?? null);
    const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

    const activeGrant = session.grants.find((g) => g.id === activeGrantId) ?? session.grants[0] ?? null;

    const handleSelectGrant = (grantId: string) => {
        setActiveGrantId(grantId);
        setIsSwitcherOpen(false);
        // Explicit switching always returns Home so no previous record's
        // section content lingers on screen (§6.2).
        setActivePage('home');
    };

    return (
        <div className="portal-shell">
            <SkipToContent />

            <RecordContextBar
                activeGrant={activeGrant}
                grantCount={session.grants.length}
                onOpenSwitcher={() => setIsSwitcherOpen(true)}
            />

            <BottomTabs activePage={activePage} onNavigate={setActivePage} />

            <main className="portal-main">
                <h1 className="sr-only">{PORTAL_TABS.find((t) => t.id === activePage)?.label ?? 'Home'}</h1>

                {activePage === 'home' && activeGrant && (
                    <HomeSection
                        key={activeGrant.patientId}
                        patientId={activeGrant.patientId}
                        greetingName={session.account.displayName}
                        onViewVisits={() => setActivePage('health')}
                    />
                )}
                {activePage === 'health' && activeGrant && (
                    <MyHealthSection key={activeGrant.patientId} patientId={activeGrant.patientId} />
                )}
                {activePage === 'medicines' && (
                    <PlaceholderSection
                        icon="pill"
                        title="Medicines are coming soon"
                        description="Prescribed medicines for this health record will appear here."
                    />
                )}
                {activePage === 'labs' && (
                    <PlaceholderSection
                        icon="flask"
                        title="Lab Results are coming soon"
                        description="Released laboratory results for this health record will appear here."
                    />
                )}
                {activePage === 'more' && (
                    <MoreSection
                        account={session.account}
                        textSize={textSize}
                        onToggleTextSize={onToggleTextSize}
                        onSignOut={onSignOut}
                    />
                )}
            </main>

            <PersonSwitcher
                isOpen={isSwitcherOpen}
                grants={session.grants}
                activeGrantId={activeGrantId}
                onSelect={(grant) => handleSelectGrant(grant.id)}
                onClose={() => setIsSwitcherOpen(false)}
            />
        </div>
    );
}
