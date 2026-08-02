import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { requireRole } from '../../lib/auth/roles';
import { Sidebar } from '../../components/layout/Sidebar';
import { Topbar } from '../../components/layout/Topbar';
import { PageHeader } from '../../components/layout/PageHeader';
import { useToast } from '../../components/feedback/Toast';
import { getInitials } from '../../lib/utils/names';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Icon } from '../../components/shared/Icon';
import { Badge, Button, Card, EmptyState, Input } from '../../components/ui';
import { SkeletonList } from '../../components/ui/Skeleton';
import type { Role } from '../../types/user';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { safeTrim } from '../../lib/utils/strings';
import { AuditLogPage } from '../../features/audit/AuditLogPage';
import { logAuditEvent } from '../../features/audit/services';
import { useDialogFocus } from '../../components/ui/useDialogFocus';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserProfile {
    id: string;
    full_name: string;
    role: Role;
    email?: string;
    status?: string; // e.g. 'active'
}

const ROLES = ['doctor', 'nurse', 'BHW', 'midwives', 'pharmacist', 'labaratory', 'admin'] as const;
type AdminRole = typeof ROLES[number];

interface CreateUserPayload {
    email: string;
    password: string;
    fullName: string;
    role: AdminRole;
}

interface CreateUserResponse {
    user?: UserProfile;
    error?: string;
    details?: Record<string, unknown>;
}

interface UpdateUserRoleResponse {
    user?: UserProfile;
    error?: string;
}

interface DeleteUserResponse {
    ok?: boolean;
    error?: string;
}

const isAdminRole = (value: string): value is AdminRole => (ROLES as readonly string[]).includes(value);

async function getFunctionErrorMessage(error: unknown, data?: { error?: string } | null, fallback = 'Function request failed.'): Promise<string> {
    if (data?.error) return data.error;

    const context = error && typeof error === 'object' && 'context' in error
        ? (error as { context?: unknown }).context
        : null;

    if (context instanceof Response) {
        try {
            const body = await context.clone().json() as { error?: string };
            if (body.error) return body.error;
        } catch {
            try {
                const text = await context.clone().text();
                if (text) return text;
            } catch {
                // Fall through to default message.
            }
        }
    }

    return error instanceof Error ? error.message : fallback;
}

// ─── Utility Components ───────────────────────────────────────────────────────
const RoleBadge = ({ role }: { role: string }) => {
    const roleColors: Record<string, string> = {
        doctor: 'bg-[var(--surface-subtle)] text-[var(--text-2)]',
        nurse: 'bg-[var(--surface-subtle)] text-[var(--text-2)]',
        BHW: 'bg-[var(--surface-subtle)] text-[var(--text-2)]',
        midwives: 'bg-[var(--surface-subtle)] text-[var(--text-2)]',
        pharmacist: 'bg-[var(--surface-subtle)] text-[var(--text-2)]',
        laboratory: 'bg-[var(--surface-subtle)] text-[var(--text-2)]',
        admin: 'bg-[var(--brand-soft-surface)] text-[var(--brand-active)]'
    };

    const roleLabels: Record<string, string> = {
        doctor: 'Doctor',
        nurse: 'Nurse',
        BHW: 'BHW',
        midwives: 'Midwives',
        pharmacist: 'Pharmacist',
        laboratory: 'Laboratory',
        admin: 'Admin'
    };

    const normalizedRole = role === 'labaratory' ? 'laboratory' : role;
    const label = roleLabels[normalizedRole] || role;
    const tone = normalizedRole === 'admin' ? 'blue' : 'slate';

    return (
        <Badge tone={tone} className={`rounded-full border-transparent px-2.5 py-1 leading-none ${roleColors[normalizedRole] || roleColors['admin']}`}>
            {label}
        </Badge>
    );
};

const getAvatarColor = (role: string): string => {
    const normalizedRole = role === 'labaratory' ? 'laboratory' : role;
    const map: Record<string, string> = {
        doctor: 'bg-[var(--brand-active)]',
        nurse: 'bg-[var(--brand-active)]',
        BHW: 'bg-[var(--brand-active)]',
        midwives: 'bg-[var(--brand-active)]',
        pharmacist: 'bg-[var(--brand-active)]',
        laboratory: 'bg-[var(--brand-active)]',
        admin: 'bg-[var(--brand-active)]'
    };
    return map[normalizedRole] || 'bg-[var(--brand-active)]';
};

// ─── Main Application Component ───────────────────────────────────────────────
const AdminDashboard = () => {
    const { showToast, ToastComponent } = useToast();

    // Context & Auth
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [activePage, setActivePage] = useState(() => {
        const requestedPage = window.location.hash.replace('#', '');
        return requestedPage === 'audit-log' ? requestedPage : 'admin';
    });

    useEffect(() => {
        window.location.hash = activePage;
    }, [activePage]);

    const isOnline = useOnlineStatus();
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('A');

    // Data State
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
    const [usersError, setUsersError] = useState('');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    // Modal focus targets
    const userDialogRef = useRef<HTMLDivElement>(null);
    const deleteDialogRef = useRef<HTMLDivElement>(null);
    const fullNameInputRef = useRef<HTMLInputElement>(null);
    const cancelDeleteRef = useRef<HTMLButtonElement>(null);

    // Modal States
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [fFullName, setFFullName] = useState('');
    const [fEmail, setFEmail] = useState('');
    const [fPassword, setFPassword] = useState('');
    const [fConfirmPassword, setFConfirmPassword] = useState('');
    const [fRole, setFRole] = useState('');

    // Confirm Delete Modal
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<{ id: string, name: string } | null>(null);

    const navItems = [
        { id: 'admin', label: 'User Management', icon: 'users', group: 'Administration' },
        { id: 'audit-log', label: 'Audit Log', icon: 'clipboard', group: 'Records & Governance' },
    ];

    useEffect(() => {
        const init = async () => {
            try {
                // Ensure auth and role validation
                const profile = await requireRole('admin');
                setUserName(profile.fullName);
                setUserInitials(getInitials(profile.fullName, 'A'));

                if (activePage === 'admin') {
                    await loadUsers();
                }
            } catch (err) {
                console.error("Initialization Failed:", err);
            }
        };

        init();

    }, [activePage]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && activePage === 'admin' && isOnline) {
                void loadUsers(true);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [activePage, isOnline]);

    const loadUsers = async (isSilent = false) => {
        if (isSilent) {
            setIsRefreshingUsers(true);
        } else {
            setIsLoading(true);
            setUsersError('');
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, role, email')
                .order('role', { ascending: true });

            if (error) {
                if (!isSilent) {
                    logError('Failed to load users', error);
                    setUsersError(healthcareErrorMessage('load user accounts'));
                    showToast(healthcareErrorMessage('load user accounts'), true);
                }
            } else {
                setUsersError('');
                setAllUsers((data as UserProfile[]) || []);
            }
        } finally {
            if (isSilent) {
                setIsRefreshingUsers(false);
            } else {
                setIsLoading(false);
            }
        }
    };

    const filteredUsers = useMemo(() => {
        return allUsers.filter(u => {
            const matchSearch = `${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(searchQuery.toLowerCase());
            const matchRole = roleFilter ? u.role === roleFilter : true;
            return matchSearch && matchRole;
        });
    }, [allUsers, searchQuery, roleFilter]);

    // ─── Modal Handlers ───────────────────────────────────────────────────────
    const openAddModal = () => {
        setIsEditMode(false);
        setEditingUserId(null);
        setFFullName('');
        setFEmail('');
        setFPassword('');
        setFConfirmPassword('');
        setFRole('');
        setIsUserModalOpen(true);
        document.body.style.overflow = 'hidden';
    };

    const openEditModal = (userId: string) => {
        const u = allUsers.find(x => x.id === userId);
        if (!u) return;

        setIsEditMode(true);
        setEditingUserId(userId);
        setFFullName(u.full_name || '');
        setFRole(u.role || '');
        setIsUserModalOpen(true);
        document.body.style.overflow = 'hidden';
    };

    const closeUserModal = useCallback(() => {
        setIsUserModalOpen(false);
        setEditingUserId(null);
        document.body.style.overflow = '';
    }, []);

    const handleSaveUser = async () => {
        if (!isOnline) {
            showToast('You are offline. User changes cannot be saved until the connection is restored.', true);
            return;
        }

        const fullName = safeTrim(fFullName);
        const role = fRole;

        if (!fullName) { showToast('Please enter a full name.', true); return; }
        if (!isAdminRole(role)) { showToast('Please select a valid role.', true); return; }

        setIsSaving(true);

        if (isEditMode && editingUserId) {
            // Update existing user
            const { data, error } = await supabase.functions.invoke<UpdateUserRoleResponse>('update-user-role', {
                body: { userId: editingUserId, fullName, role },
            });

            setIsSaving(false);

            if (error || data?.error || !data?.user) {
                const message = await getFunctionErrorMessage(error, data, 'Update-user-role function failed.');
                logError('Failed to update user profile', { error, response: data, message });
                showToast(healthcareErrorMessage('update the user profile'), true);
                return;
            }
            showToast(`${data.user.full_name || fullName}'s profile updated successfully.`);
            
            // Optimistically update local state
            setAllUsers(prev => prev.map(u => u.id === editingUserId ? { ...u, ...data.user } : u));
            
            closeUserModal();
            void loadUsers(true);
        } else {
            // Create new user
            const email = safeTrim(fEmail);
            const password = fPassword;
            const confirmPassword = fConfirmPassword;
            if (!email) { showToast('Please enter an email.', true); setIsSaving(false); return; }
            if (password.length < 6) { showToast('Password must be at least 6 characters.', true); setIsSaving(false); return; }
            if (password !== confirmPassword) { showToast('Passwords do not match.', true); setIsSaving(false); return; }

            const payload: CreateUserPayload = { email, password, fullName, role };
            const { data, error } = await supabase.functions.invoke<CreateUserResponse>('create-user', { body: payload });

            setIsSaving(false);

            if (error || data?.error || !data?.user) {
                const message = await getFunctionErrorMessage(error, data);
                logError('Failed to create user', { error, response: data, message });
                showToast(healthcareErrorMessage('create the user account'), true);
                return;
            }

            showToast(`User ${fullName} created successfully.`);
            void logAuditEvent({
                action: 'create',
                module: 'Administration',
                recordId: data.user.id,
                recordType: 'profile',
                description: 'Created RHU user account.',
                metadata: { profile_id: data.user.id, action_scope: 'user_account' },
            });
            setAllUsers(prev => [data.user as UserProfile, ...prev]);
            closeUserModal();
            void loadUsers(true);
        }
    };

    // ─── Delete Handlers ──────────────────────────────────────────────────────
    const openConfirmDelete = (id: string, name: string) => {
        setUserToDelete({ id, name });
        setIsConfirmModalOpen(true);
        document.body.style.overflow = 'hidden';
    };

    const closeConfirmModal = useCallback(() => {
        setIsConfirmModalOpen(false);
        setUserToDelete(null);
        document.body.style.overflow = '';
    }, []);

    // Modal keyboard behaviour matches the Sidebar logout dialog: focus moves in on open,
    // Tab is contained, Escape closes without acting, and focus returns to the trigger.
    useDialogFocus({
        isOpen: isUserModalOpen,
        dialogRef: userDialogRef,
        initialFocusRef: fullNameInputRef,
        onClose: closeUserModal,
    });

    useDialogFocus({
        isOpen: isConfirmModalOpen,
        dialogRef: deleteDialogRef,
        initialFocusRef: cancelDeleteRef,
        onClose: closeConfirmModal,
    });

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        if (!isOnline) {
            showToast('You are offline. User deletion cannot be completed until the connection is restored.', true);
            return;
        }
        const targetUser = allUsers.find(user => user.id === userToDelete.id);
        if (targetUser?.role === 'admin' && allUsers.filter(user => user.role === 'admin').length <= 1) {
            showToast('Cannot delete the last administrator account.', true);
            closeConfirmModal();
            return;
        }

        setIsSaving(true);
        const { data, error } = await supabase.functions.invoke<DeleteUserResponse>('delete-user', {
            body: { userId: userToDelete.id },
        });

        setIsSaving(false);

        if (error || data?.error || !data?.ok) {
            const message = await getFunctionErrorMessage(error, data, 'Delete-user function failed.');
            logError('Failed to delete user profile', { error, response: data, message });
            showToast(healthcareErrorMessage('delete the user profile'), true);
            closeConfirmModal();
            return;
        }

        showToast(`${userToDelete.name} has been permanently deleted.`);
        
        // Optimistically update local state to ensure immediate UI feedback
        setAllUsers(prev => prev.filter(u => u.id !== userToDelete.id));
        
        closeConfirmModal();
        
        // Then re-fetch to ensure sync with server
        void loadUsers(true);
    };

    return (
        <div className="flex h-screen bg-[var(--surface-subtle)] overflow-hidden w-full font-['Plus_Jakarta_Sans',sans-serif]">
            <ToastComponent />

            <Sidebar
                activePage={activePage}
                userName={userName}
                userInitials={userInitials}
                userRole="Administrator"
                navItems={navItems}
                onNavigate={(id) => setActivePage(id)}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="app-shell-main flex-1 min-w-0 overflow-auto md:ml-[240px] w-full">
                {/* ─── Topbar ─── */}
                <Topbar
                    title={activePage === 'audit-log' ? 'Audit Log' : 'User Management'}
                    sectionLabel="Administration"
                    breadcrumbs={[{ label: 'Administration' }, { label: activePage === 'audit-log' ? 'Audit Log' : 'User Management', current: true }]}
                    userName={userName}
                    userInitials={userInitials}
                    userRole="Administrator"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                    isNavigationOpen={isMobileMenuOpen}
                />

                <div className="app-content-canvas w-full flex flex-col gap-5">
                    {activePage === 'audit-log' ? (
                        <>
                            <PageHeader
                                title="Audit Log"
                                subtitle="Review read-only system activity across MEDISENS workflows."
                            />
                            <AuditLogPage />
                        </>
                    ) : (
                        <>
                    <PageHeader
                        title="User & Role Administration"
                        subtitle="Maintain RHU staff accounts and role assignments."
                    />
                    <div className="pwa-page-pad flex flex-col gap-5 sm:gap-6">

                    {/* Stats Row */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="User management summary">
                        {[
                            ['users', 'Total Users', allUsers.length, 'RHU staff accounts'],
                            ['shield-plus', 'Active Accounts', allUsers.length, 'Available staff profiles'],
                            ['lock', 'Configured Roles', ROLES.length, 'Permission groups'],
                        ].map(([icon, label, value, note]) => (
                            <Card key={label} className="flex min-h-[132px] items-start gap-4 p-4 sm:p-5">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]">
                                    <Icon name={String(icon)} className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{label}</div>
                                    <div className="mt-1 text-2xl font-semibold leading-tight tabular-nums text-[var(--text)]">{value}</div>
                                    <div className="mt-1 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">{note}</div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* Main Content Card */}
                    <Card className="flex flex-col overflow-hidden">
                        {/* Card Header */}
                        <div className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <div>
                                <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">Staff Accounts</h2>
                                <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">Maintain authorized MEDISENS access and role assignments.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {isRefreshingUsers && <span className="text-xs font-semibold text-[var(--text-muted)]" role="status">Updating...</span>}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    leadingIcon={<Icon name="refresh" className="h-4 w-4" />}
                                    onClick={() => void loadUsers(true)}
                                    disabled={isRefreshingUsers || !isOnline}
                                    className="min-h-11 min-w-[96px] flex-row gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-[length:var(--type-button-size)] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        {/* Filter Bar */}
                        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:flex-row sm:items-end sm:px-5">
                            <Input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                label="Search staff"
                                placeholder="Search by name or email..."
                                leadingIcon={<Icon name="search" className="h-4 w-4" />}
                                containerClassName="flex-1"
                                className="pl-10"
                            />
                            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                                <label className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[160px]">
                                    <span className="text-[length:var(--type-label-size)] font-medium text-[var(--text-secondary)]">Role</span>
                                <select
                                    aria-label="Filter staff accounts by role"
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="min-h-[var(--control-height-md)] w-full cursor-pointer rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] outline-none transition-colors focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--focus-ring)]"
                                >
                                    <option value="">All Roles</option>
                                    <option value="doctor">Doctor</option>
                                    <option value="nurse">Nurse</option>
                                    <option value="BHW">BHW</option>
                                    <option value="midwives">Midwives</option>
                                    <option value="pharmacist">Pharmacist</option>
                                    <option value="labaratory">Laboratory</option>
                                    <option value="admin">Admin</option>
                                </select>
                                </label>
                                <Button type="button" variant="primary" leadingIcon={<Icon name="user-plus" className="h-4 w-4" />} onClick={openAddModal} className="shrink-0 whitespace-nowrap sm:self-end">
                                    Add User
                                </Button>
                            </div>
                        </div>

                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_160px_200px] gap-4 border-b border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-3 text-[length:var(--type-caption-size)] font-semibold text-[var(--text-secondary)]">
                            <div>User</div>
                            <div>Role</div>
                            <div className="text-right">Actions</div>
                        </div>

                        {/* Table List */}
                        <div className="flex flex-col flex-1">
                            {isLoading ? (
                                <SkeletonList rows={5} />
                            ) : usersError ? (
                                <div role="alert" className="m-4 rounded-[var(--radius-card)] border border-[var(--coral-border)] bg-[var(--coral-light)] p-4 sm:m-5">
                                    <div className="flex items-start gap-3">
                                        <Icon name="alert-triangle" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--coral)]" />
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-[var(--coral)]">Unable to load staff accounts</h3>
                                            <p className="mt-1 text-sm text-[var(--coral-dark)]">{usersError}</p>
                                            <Button type="button" variant="outline" size="sm" onClick={() => void loadUsers()} className="mt-3">Retry</Button>
                                        </div>
                                    </div>
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <EmptyState
                                    icon={<Icon name="users" className="h-8 w-8" />}
                                    title="No staff accounts found"
                                    description="Adjust the role filter or search by staff name or email."
                                    className="clinical-table-state flex-col rounded-none border-0 p-12"
                                />
                            ) : (
                                <div className="divide-y divide-[var(--border-soft)]">
                                    {filteredUsers.map(u => {
                                        const av = (u.full_name?.[0] || '?').toUpperCase();
                                        const colorClass = getAvatarColor(u.role);
                                        return (
                                            <div key={u.id} className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--surface-subtle)] md:grid md:grid-cols-[minmax(0,2fr)_160px_200px] md:items-center md:gap-4 md:px-5">
                                                {/* User Info */}
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm ${colorClass}`}>
                                                        {av}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-[var(--text)] truncate">{u.full_name || '—'}</div>
                                                        <div className="text-[11px] text-[var(--text-secondary)] font-medium truncate mt-0.5">{u.email || '—'}</div>
                                                    </div>
                                                </div>

                                                {/* Role */}
                                                <div className="flex items-center pl-[54px] md:pl-0">
                                                    <RoleBadge role={u.role} />
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-2 pl-[54px] md:justify-end md:pl-0">
                                                    <Button type="button" variant="outline" size="sm" leadingIcon={<Icon name="edit" className="h-4 w-4" />} onClick={() => openEditModal(u.id)} className="min-h-11 min-w-[75px] flex-row gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-[length:var(--type-button-size)]">
                                                        Edit
                                                    </Button>
                                                    <Button type="button" variant="outline" size="sm" leadingIcon={<Icon name="trash" className="h-4 w-4" />} onClick={() => openConfirmDelete(u.id, u.full_name || 'User')} className="min-h-11 min-w-[75px] flex-row gap-2 whitespace-nowrap rounded-[var(--radius-control)] border-[var(--coral)] px-3 py-2 text-[length:var(--type-button-size)] text-[var(--coral)] shadow-none hover:border-[var(--coral)] hover:bg-[var(--coral-light)] hover:text-[var(--coral-dark)]">
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
                        </>
                    )}
                </div>
            </main>

            {/* ─── Add/Edit User Modal ─── */}
            {isUserModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay-soft)] backdrop-blur-sm p-4 " onClick={(e) => { if (e.target === e.currentTarget) closeUserModal(); }}>
                    <div ref={userDialogRef} role="dialog" aria-modal="true" aria-labelledby="user-dialog-title" className="bg-white w-full max-w-md rounded-2xl shadow-sm flex flex-col  overflow-hidden">
                        <div className="p-6 border-b border-[var(--border-soft)] flex justify-between items-center bg-[var(--surface-subtle)]/50">
                            <div>
                                <h3 id="user-dialog-title" className="text-xl font-bold text-[var(--text)]">{isEditMode ? `Edit: ${fFullName}` : 'Add New User'}</h3>
                                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1">{isEditMode ? 'Update name or role assignment' : 'Create a new system account'}</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={closeUserModal} aria-label="Close user dialog" className="h-10 w-10 -m-1 rounded-xl p-0 text-[var(--text-muted)]"><Icon name="close" className="h-4 w-4" /></Button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="admin-user-full-name" className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Full Name</label>
                                <Input ref={fullNameInputRef} id="admin-user-full-name" type="text" value={fFullName} onChange={e => setFFullName(e.target.value)} placeholder="e.g. Dr. Juan Dela Cruz" className="rounded-xl bg-[var(--surface-subtle)] px-4 py-2.5 font-medium focus-visible:bg-white" />
                            </div>

                            {!isEditMode && (
                                <>
                                    <div className="space-y-1.5">
                                        <label htmlFor="admin-user-email" className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Email Address</label>
                                        <Input id="admin-user-email" type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="e.g. user@medisens.com" className="rounded-xl bg-[var(--surface-subtle)] px-4 py-2.5 font-medium focus-visible:bg-white" />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label htmlFor="admin-user-password" className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Password</label>
                                            <Input id="admin-user-password" type="password" value={fPassword} onChange={e => setFPassword(e.target.value)} placeholder="Min. 6 chars" className="rounded-xl bg-[var(--surface-subtle)] px-4 py-2.5 font-medium focus-visible:bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label htmlFor="admin-user-confirm-password" className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Confirm Password</label>
                                            <Input id="admin-user-confirm-password" type="password" value={fConfirmPassword} onChange={e => setFConfirmPassword(e.target.value)} placeholder="Repeat password" className="rounded-xl bg-[var(--surface-subtle)] px-4 py-2.5 font-medium focus-visible:bg-white" />
                                        </div>
                                    </div>
                                    <div className="p-4 bg-[var(--amber-surface)] border border-[var(--amber-tint)] rounded-2xl space-y-2">
                                        <div className="text-[10px] font-semibold text-[var(--amber-text)] uppercase tracking-wide">Authorized Account Creation</div>
                                        <p className="text-[11px] text-[var(--amber-text-dark)] font-medium leading-snug">
                                            New accounts must be created only for approved RHU personnel. Assign the correct role before saving access.
                                        </p>
                                    </div>
                                </>
                            )}

                            <div className="space-y-1.5">
                                <label htmlFor="admin-user-role" className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Role Assignment</label>
                                <select id="admin-user-role" value={fRole} onChange={e => setFRole(e.target.value)} className="w-full px-4 py-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl text-sm font-semibold text-[var(--text-2)] focus:bg-white focus:outline-none focus:border-[var(--focus-color)] focus:ring-4 focus:ring-[var(--focus-ring)] transition-all cursor-pointer">
                                    <option value="" disabled>Select a role...</option>
                                    <option value="doctor">Doctor</option>
                                    <option value="nurse">Nurse</option>
                                    <option value="BHW">BHW</option>
                                    <option value="midwives">Midwives</option>
                                    <option value="pharmacist">Pharmacist</option>
                                    <option value="labaratory">Laboratory</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-5 border-t border-[var(--border-soft)] flex justify-end gap-3 bg-[var(--surface-subtle)]">
                            <Button type="button" variant="outline" onClick={closeUserModal} disabled={isSaving} className="rounded-xl px-5 py-2.5">Cancel</Button>
                            <Button type="button" variant="secondary" onClick={handleSaveUser} disabled={isSaving} isLoading={isSaving} className="min-w-[140px] rounded-xl px-6 py-2.5">
                                {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create User'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Confirm Delete Modal ─── */}
            {isConfirmModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--overlay-soft)] backdrop-blur-sm p-4 " onClick={(e) => { if (e.target === e.currentTarget && !isSaving) closeConfirmModal(); }}>
                    <div ref={deleteDialogRef} role="dialog" aria-modal="true" aria-labelledby="delete-user-dialog-title" className="bg-white w-full max-w-[360px] rounded-lg border border-[var(--border)] shadow-sm flex flex-col items-center p-8  text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--coral-accent)]"></div>
                        <div className="w-16 h-16 bg-[var(--coral-tint)] text-[var(--coral-accent)] rounded-lg flex items-center justify-center mb-5"><Icon name="trash" className="h-8 w-8" /></div>
                        <h3 id="delete-user-dialog-title" className="text-xl font-bold text-[var(--text)] mb-2">Delete User?</h3>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-8">
                            Are you sure you want to permanently delete <strong className="text-[var(--text)] font-bold">{userToDelete?.name}</strong>? This action cannot be undone.
                        </p>
                        <div className="flex w-full gap-3">
                            <Button ref={cancelDeleteRef} type="button" variant="ghost" onClick={closeConfirmModal} disabled={isSaving} className="flex-1 rounded-xl bg-[var(--surface-subtle)] py-3 text-[var(--text-2)] hover:bg-[var(--border-soft)]">Cancel</Button>
                            <Button type="button" variant="danger" onClick={handleDeleteUser} disabled={isSaving} isLoading={isSaving} className="flex-1 rounded-xl py-3">
                                {isSaving ? 'Deleting...' : 'Delete'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<AdminDashboard />);
