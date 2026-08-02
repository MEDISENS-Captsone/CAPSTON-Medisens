import { NetworkBadge } from '../shared/NetworkBadge';
import { Icon } from '../shared/Icon';
import { Breadcrumbs } from './Breadcrumbs';
import { UserMenu } from './UserMenu';

interface BreadcrumbItem {
    label: string;
    current?: boolean;
}

interface TopbarProps {
    title: string;
    sectionLabel?: string;
    breadcrumbs?: BreadcrumbItem[];
    userName: string;
    userInitials: string;
    userRole: string;
    isOnline: boolean;
    onOpenNavigation: () => void;
    isNavigationOpen?: boolean;
    onUserMenuClick?: () => void;
}

export function Topbar({
    title,
    sectionLabel = 'MEDISENS',
    breadcrumbs,
    userName,
    userInitials,
    userRole,
    isOnline,
    onOpenNavigation,
    isNavigationOpen = false,
    onUserMenuClick,
}: TopbarProps) {
    return (
        <header className="app-topbar sticky top-0 z-30 flex min-h-16 w-full shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-translucent-96)] px-3 shadow-[var(--shadow-sm)] backdrop-blur-md sm:px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-2">
                <button
                    type="button"
                    onClick={onOpenNavigation}
                    aria-label="Open navigation menu"
                    aria-expanded={isNavigationOpen}
                    aria-controls="primary-navigation"
                    data-nav-toggle
                    className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft-surface)] hover:text-[var(--brand-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-color)] md:hidden"
                >
                    <Icon name="menu" className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                    <div className="hidden text-[length:var(--type-category-size)] font-semibold uppercase leading-[var(--type-category-line)] tracking-[var(--tracking-category)] text-[var(--brand-primary)] sm:block">{sectionLabel}</div>
                    <h1 className="truncate text-[length:var(--type-section-title-size)] font-semibold leading-[var(--type-section-title-line)] tracking-[var(--tracking-normal)] text-[var(--text)]">{title}</h1>
                    {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
                </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
                <NetworkBadge isOnline={isOnline} compact className="inline-flex lg:hidden" />
                <NetworkBadge isOnline={isOnline} className="hidden lg:inline-flex" />
                <div className="hidden h-6 w-px bg-[var(--border)] sm:block" />
                <UserMenu userName={userName} userInitials={userInitials} userRole={userRole} isOnline={isOnline} onLogoutClick={onUserMenuClick} />
            </div>
        </header>
    );
}
