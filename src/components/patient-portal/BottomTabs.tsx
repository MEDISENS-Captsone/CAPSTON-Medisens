import { Icon, type IconName } from '../shared/Icon';
import { useT } from '../../lib/i18n/patientPortal';

export interface PortalTab {
    id: string;
    /** English fallback label (also used for the untranslated sr-only
     * page heading lookup) -- the on-screen label is always resolved
     * through the localization dictionary via `labelKey`, never read
     * directly off this field inside a rendered component. */
    label: string;
    labelKey: 'nav.home' | 'nav.health' | 'nav.medicines' | 'nav.labs' | 'nav.more';
    icon: IconName;
}

export const PORTAL_TABS: PortalTab[] = [
    { id: 'home', label: 'Home', labelKey: 'nav.home', icon: 'home' },
    { id: 'health', label: 'My Health', labelKey: 'nav.health', icon: 'heart-pulse' },
    { id: 'medicines', label: 'Medicines', labelKey: 'nav.medicines', icon: 'pill' },
    { id: 'labs', label: 'Lab Results', labelKey: 'nav.labs', icon: 'flask' },
    { id: 'more', label: 'More', labelKey: 'nav.more', icon: 'menu' },
];

interface BottomTabsProps {
    activePage: string;
    onNavigate: (id: string) => void;
}

/** Bottom tab bar on mobile/tablet; the same component becomes a
 * horizontal top tab row at >=1024px via CSS (patient-portal.css), per
 * §10.1/§17 Phase 4. */
export function BottomTabs({ activePage, onNavigate }: BottomTabsProps) {
    const { t } = useT();
    return (
        <nav className="portal-bottom-tabs" aria-label="Patient Portal">
            {PORTAL_TABS.map((tab) => {
                const isActive = activePage === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        className="portal-tab"
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => onNavigate(tab.id)}
                    >
                        <Icon name={tab.icon} className="h-5 w-5" />
                        <span>{t(tab.labelKey)}</span>
                    </button>
                );
            })}
        </nav>
    );
}
