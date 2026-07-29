import { useEffect, useRef, useState } from 'react';
import { logout } from '../../lib/auth/roles';
import { Icon } from '../shared/Icon';
import '../../styles/dashboard.css';
import medisensLogo from '../../assets/MEDISENS Logo.png';

export interface NavItem {
    id: string;
    label: string;
    icon: string;
    disabled?: boolean;
    group?: string;
}

interface SidebarProps {
    activePage: string;
    userName: string;
    userInitials: string;
    userRole: string;
    navItems: NavItem[];
    onNavigate: (id: string) => void;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (isOpen: boolean) => void;
    isOnline: boolean;
}

const DEFAULT_NAV_GROUP = 'Workspace';

function groupNavItems(navItems: NavItem[]) {
    const groups: { label: string; items: NavItem[] }[] = [];
    const groupIndex = new Map<string, number>();

    navItems.forEach((item) => {
        const label = item.group?.trim() || DEFAULT_NAV_GROUP;
        const existingIndex = groupIndex.get(label);

        if (existingIndex === undefined) {
            groupIndex.set(label, groups.length);
            groups.push({ label, items: [item] });
            return;
        }

        groups[existingIndex].items.push(item);
    });

    return groups.filter(group => group.items.length > 0);
}

export function Sidebar({ 
    activePage, userName, userInitials, userRole, navItems, 
    onNavigate, isMobileMenuOpen, setIsMobileMenuOpen, isOnline 
}: SidebarProps) {
    
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const cancelLogoutRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!showLogoutModal) return;
        cancelLogoutRef.current?.focus();
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowLogoutModal(false);
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [showLogoutModal]);

    const logoBg = isOnline ? 'bg-[var(--brand-primary)]' : 'bg-amber-500';
    const avatarBg = isOnline ? 'bg-[var(--brand-primary)]' : 'bg-amber-500';
    const activeBg = isOnline ? 'bg-[var(--brand-primary)]' : 'bg-amber-500/20';
    const activeText = isOnline ? 'text-white' : 'text-amber-100';
    const activeIndicator = isOnline ? 'bg-[var(--brand-accent-surface)]' : 'bg-amber-300';

    return (
        <>
            {/* Mobile Backdrop */}
            {isMobileMenuOpen && (
                <button
                    type="button"
                    aria-label="Close navigation menu"
                    className="fixed inset-0 z-40 border-0 bg-slate-900/50 backdrop-blur-[2px] transition-opacity md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}
            
            <aside aria-label="Primary navigation" className={`fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] md:w-[240px] bg-[var(--brand-active)] border-r border-white/15 flex flex-col transform transition-transform duration-300 ease-in-out print:hidden ${isMobileMenuOpen ? 'translate-x-0 shadow-lg' : '-translate-x-full md:translate-x-0'}`}>
                
                {/* Brand Header */}
                <div className="flex min-h-[56px] items-center justify-between border-b border-white/10 bg-[var(--brand-active-hover)] p-3 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shadow-sm ring-1 ring-white/15 shrink-0 transition-colors duration-200 ${logoBg}`} aria-hidden="true">
                            {isOnline ? <img src={medisensLogo} alt="" className="h-5 w-5 object-contain brightness-0 invert" /> : <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor"><path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" /></svg>}
                        </div>
                        <div>
                            <div className="text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] tracking-[var(--tracking-normal)] text-white">MEDISENS</div>
                            <div className="text-[length:var(--type-category-size)] font-semibold uppercase leading-[var(--type-category-line)] tracking-[var(--tracking-nav-category)] text-[var(--brand-accent-surface)]">RHU Information System</div>
                        </div>
                    </div>
                    <button type="button" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close navigation menu" className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--brand-accent-surface)] hover:bg-white/10 hover:text-white md:hidden">
                        <Icon name="close" className="h-5 w-5" />
                    </button>
                </div>
            
                {/* Navigation Section */}
                <nav aria-label="Main menu" className="sidebar-nav flex-1 overflow-y-auto scrollbar-hide px-2 py-3">
                    {groupNavItems(navItems).map((group) => (
                        <section key={group.label} className="sidebar-nav-group" aria-label={group.label}>
                            <div className="sidebar-nav-heading" aria-hidden="true">{group.label}</div>
                            <div className="sidebar-nav-items">
                                {group.items.map((item) => {
                                    const isActive = activePage === item.id;
                                    return (
                                        <button
                                            type="button"
                                            key={item.id}
                                            onClick={() => {
                                                if (item.disabled) return;
                                                onNavigate(item.id);
                                                setIsMobileMenuOpen(false);
                                            }}
                                            disabled={item.disabled}
                                            aria-current={isActive ? 'page' : undefined}
                                            className={`sidebar-nav-item relative flex min-h-10 items-center w-full text-left gap-3 transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-accent-surface)] ${
                                                item.disabled
                                                ? 'cursor-not-allowed rounded-md px-3 text-slate-500 opacity-70'
                                                : isActive
                                                ? `font-semibold ${activeBg} ${activeText} rounded-md relative px-3`
                                                : 'font-medium text-[var(--brand-accent-surface)] hover:bg-white/10 hover:text-white rounded-md px-3'
                                            }`}
                                        >
                                            {isActive && (
                                                <div className={`absolute left-0 top-1 bottom-1 w-1 rounded-r-md transition-colors duration-500 ${activeIndicator}`}></div>
                                            )}
                                            <Icon name={item.icon} className="sidebar-nav-icon h-5 w-5 shrink-0" />
                                            <span className="sidebar-nav-label">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </nav>

                {/* Integrated Profile & Logout Block */}
                <button
                    type="button"
                    onClick={() => setShowLogoutModal(true)}
                    className="mt-auto w-full shrink-0 border-t border-white/15 bg-[var(--brand-active-hover)] p-3 text-left transition-colors hover:bg-[var(--brand-active)] group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white"
                    title="Log out"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0 transition-colors duration-500 ${avatarBg}`}>
                                {userInitials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="truncate text-[length:var(--type-caption-size)] font-semibold leading-[var(--type-caption-line)] text-white">{userName}</p>
                                <p className="truncate text-[length:var(--type-caption-size)] font-normal leading-[var(--type-caption-line)] text-white/90 capitalize">{userRole}</p>
                            </div>
                        </div>
                        <Icon name="logout" className="h-4 w-4 text-white/85 transition-colors group-hover:text-white" />
                    </div>
                </button>
            </aside>

            {/* Custom Logout Modal */}
            {showLogoutModal && (
                <div onClick={() => setShowLogoutModal(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm transition-opacity" role="presentation">
                    <div onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title" aria-describedby="logout-dialog-description" className="flex w-full max-w-sm flex-col items-center rounded-lg border border-[var(--border)] bg-white p-4 text-center shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600"><Icon name="logout" className="h-5 w-5" /></div>
                        <h3 id="logout-dialog-title" className="text-[length:var(--type-section-title-size)] font-semibold leading-[var(--type-section-title-line)] text-[var(--text)] tracking-[var(--tracking-normal)]">Log out</h3>
                        <p id="logout-dialog-description" className="mb-4 mt-2 text-[length:var(--type-body-size)] leading-[var(--type-body-line)] text-[var(--text-secondary)]">Are you sure you want to end your session?</p>
                        <div className="flex w-full gap-3">
                            <button 
                                type="button"
                                ref={cancelLogoutRef}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowLogoutModal(false);
                                }}
                                className="min-h-10 flex-1 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-[length:var(--type-button-size)] font-semibold leading-[var(--type-button-line)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-color)]"
                            >
                                Cancel
                            </button>
                            <button 
                                type="button"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    await logout();
                                }}
                                className="min-h-10 flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-[length:var(--type-button-size)] font-semibold leading-[var(--type-button-line)] text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
                            >
                                Log Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
