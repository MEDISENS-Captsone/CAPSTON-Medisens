import { Icon } from '../shared/Icon';

interface UserMenuProps {
    userName: string;
    userInitials: string;
    userRole: string;
    isOnline?: boolean;
    onLogoutClick?: () => void;
}

export function UserMenu({ userName, userInitials, userRole, isOnline = true, onLogoutClick }: UserMenuProps) {
    const avatarColor = isOnline ? 'bg-[var(--brand-primary)]' : 'bg-amber-500';
    const content = (
        <>
            <div className="hidden min-w-0 text-right sm:block">
                <div className="truncate text-[length:var(--type-label-size)] font-semibold leading-[var(--type-label-line)] text-[var(--text)]">{userName}</div>
                <div className="truncate text-[length:var(--type-caption-size)] font-medium leading-[var(--type-caption-line)] text-[var(--brand-active)]">{userRole}</div>
            </div>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[length:var(--type-label-size)] font-semibold text-white shadow-sm ${avatarColor}`}>
                {userInitials}
            </div>
            {onLogoutClick && <Icon name="logout" className="hidden h-4 w-4 text-slate-400 transition-colors group-hover:text-red-600 sm:block" />}
        </>
    );

    if (!onLogoutClick) {
        return <div className="flex min-w-0 items-center gap-3">{content}</div>;
    }

    return (
        <button
            type="button"
            onClick={onLogoutClick}
            className="group flex min-w-0 items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-[var(--brand-soft-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-color)]"
            title="Open user menu"
        >
            {content}
        </button>
    );
}
