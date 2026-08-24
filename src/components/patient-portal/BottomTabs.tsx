import { Icon, type IconName } from '../shared/Icon';

export interface PortalTab {
    id: string;
    label: string;
    icon: IconName;
}

export const PORTAL_TABS: PortalTab[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'health', label: 'My Health', icon: 'heart-pulse' },
    { id: 'medicines', label: 'Medicines', icon: 'pill' },
    { id: 'labs', label: 'Lab Results', icon: 'flask' },
    { id: 'more', label: 'More', icon: 'menu' },
];

interface BottomTabsProps {
    activePage: string;
    onNavigate: (id: string) => void;
}

/** Bottom tab bar on mobile/tablet; the same component becomes a
 * horizontal top tab row at >=1024px via CSS (patient-portal.css), per
 * §10.1/§17 Phase 4. */
export function BottomTabs({ activePage, onNavigate }: BottomTabsProps) {
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
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
