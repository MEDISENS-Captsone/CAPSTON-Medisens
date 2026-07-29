import { useState, useEffect, useMemo } from 'react';
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
import { SkeletonList } from '../../components/ui/Skeleton';
import type { Role } from '../../types/user';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { safeTrim } from '../../lib/utils/strings';
import { AuditLogPage } from '../../features/audit/AuditLogPage';
import { logAuditEvent } from '../../features/audit/services';

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
        doctor: 'bg-slate-50 text-slate-700',
        nurse: 'bg-green-50 text-green-600',
        BHW: 'bg-orange-50 text-orange-600',
        midwives: 'bg-pink-50 text-pink-700',
        pharmacist: 'bg-emerald-50 text-emerald-700',
        laboratory: 'bg-indigo-50 text-indigo-700',
        admin: 'bg-slate-100 text-slate-700'
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
    const colorClass = roleColors[normalizedRole] || roleColors['admin'];
    const label = roleLabels[normalizedRole] || role;

    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold leading-none ${colorClass}`}>
            {label}
        </span>
    );
};

const getAvatarColor = (role: string): string => {
    const normalizedRole = role === 'labaratory' ? 'laboratory' : role;
    const map: Record<string, string> = {
        doctor: 'bg-slate-700',
        nurse: 'bg-green-600',
        BHW: 'bg-orange-600',
        midwives: 'bg-pink-700',
        pharmacist: 'bg-emerald-700',
        laboratory: 'bg-indigo-600',
        admin: 'bg-slate-700'
    };
    return map[normalizedRole] || 'bg-slate-700';
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

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

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
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, role, email')
                .order('role', { ascending: true });

            if (error) {
                if (!isSilent) {
                    logError('Failed to load users', error);
                    showToast(healthcareErrorMessage('load user accounts'), true);
                }
            } else {
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

    const closeUserModal = () => {
        setIsUserModalOpen(false);
        setEditingUserId(null);
        document.body.style.overflow = '';
    };

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

    const closeConfirmModal = () => {
        setIsConfirmModalOpen(false);
        setUserToDelete(null);
        document.body.style.overflow = '';
    };

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
        <div className="flex h-screen bg-slate-50 overflow-hidden w-full font-['Plus_Jakarta_Sans',sans-serif]">
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

            <main className="flex-1 min-w-0 overflow-auto md:ml-[240px] w-full">
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
                />

                <div className="w-full flex flex-col gap-5 ">
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
                    <div className="pwa-page-pad flex flex-col pwa-panel-gap">

                    {/* Stats Row */}
                    <div className="ops-summary-grid">
                        {[
                            ['Total Users', allUsers.length, 'RHU staff accounts'],
                            ['Active Accounts', allUsers.length, 'Currently available records'],
                            ['Configured Roles', ROLES.length, 'Role assignment options'],
                        ].map(([label, value, note]) => (
                            <div key={label} className="ops-summary-card">
                                <div className="ops-summary-label">{label}</div>
                                <div className="ops-summary-value tabular-nums">{value}</div>
                                <div className="ops-summary-note">{note}</div>
                            </div>
                        ))}
                    </div>

                    {/* Main Content Card */}
                    <div className="ops-panel flex flex-col">
                        {/* Card Header */}
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-base font-semibold text-slate-800 tracking-tight">Staff Accounts</h2>
                                <p className="text-sm text-slate-500">Maintain authorized MEDISENS access and role assignments.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {isRefreshingUsers && <span className="text-xs font-semibold text-slate-400" role="status">Updating...</span>}
                                <button
                                    type="button"
                                    onClick={() => void loadUsers(true)}
                                    disabled={isRefreshingUsers || !isOnline}
                                    className="clinical-row-action min-w-[96px] justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Icon name="refresh" className="h-3.5 w-3.5" /> Refresh
                                </button>
                            </div>
                        </div>

                        {/* Filter Bar */}
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    aria-label="Search users by name or email"
                                    placeholder="Search by name or email..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 transition-all"
                                />
                            </div>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <select
                                    aria-label="Filter staff accounts by role"
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 hover:border-slate-300 transition-all min-w-[140px] cursor-pointer"
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
                                <button type="button" onClick={openAddModal} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-none transition-all  shrink-0 justify-center">
                                    <Icon name="user-plus" className="h-4 w-4" /> Add User
                                </button>
                            </div>
                        </div>

                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_160px_200px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <div>User</div>
                            <div>Role</div>
                            <div className="text-right">Actions</div>
                        </div>

                        {/* Table List */}
                        <div className="flex flex-col flex-1">
                            {isLoading ? (
                                <SkeletonList rows={5} />
                            ) : filteredUsers.length === 0 ? (
                                <div className="clinical-table-state flex-col p-12">
                                    <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-2xl flex items-center justify-center mb-4"><Icon name="users" className="h-8 w-8" /></div>
                                    <h3 className="text-lg font-bold text-slate-700">No staff accounts found</h3>
                                    <p className="text-sm text-slate-500 mt-1">Adjust the role filter or search by staff name or email.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {filteredUsers.map(u => {
                                        const av = (u.full_name?.[0] || '?').toUpperCase();
                                        const colorClass = getAvatarColor(u.role);
                                        return (
                                            <div key={u.id} className="flex flex-col md:grid md:grid-cols-[minmax(0,2fr)_160px_200px] md:items-center gap-4 px-5 py-3.5 hover:bg-slate-50/80 group">
                                                {/* User Info */}
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm ${colorClass}`}>
                                                        {av}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-slate-800 truncate">{u.full_name || '—'}</div>
                                                        <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{u.email || '—'}</div>
                                                    </div>
                                                </div>

                                                {/* Role */}
                                                <div className="flex items-center md:pl-0 pl-[54px] -mt-2 md:mt-0">
                                                    <RoleBadge role={u.role} />
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center md:justify-end gap-2 md:pl-0 pl-[54px] mt-2 md:mt-0">
                                                    <button type="button" onClick={() => openEditModal(u.id)} className="clinical-row-action min-w-[75px]">
                                                        <Icon name="edit" className="h-3.5 w-3.5" /> Edit
                                                    </button>
                                                    <button type="button" onClick={() => openConfirmDelete(u.id, u.full_name || 'User')} className="clinical-row-action danger min-w-[75px]">
                                                        <Icon name="trash" className="h-3.5 w-3.5" /> Delete
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                        </>
                    )}
                </div>
            </main>

            {/* ─── Add/Edit User Modal ─── */}
            {isUserModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 " onClick={(e) => { if (e.target === e.currentTarget) closeUserModal(); }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="user-dialog-title" className="bg-white w-full max-w-md rounded-2xl shadow-sm flex flex-col  overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 id="user-dialog-title" className="text-xl font-black text-slate-800 tracking-tight">{isEditMode ? `Edit: ${fFullName}` : 'Add New User'}</h3>
                                <p className="text-xs font-medium text-slate-500 mt-1">{isEditMode ? 'Update name or role assignment' : 'Create a new system account'}</p>
                            </div>
                            <button type="button" onClick={closeUserModal} aria-label="Close user dialog" className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:bg-slate-100 text-lg transition-colors"><Icon name="close" className="h-4 w-4" label="Close user dialog" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
                                <input type="text" value={fFullName} onChange={e => setFFullName(e.target.value)} placeholder="e.g. Dr. Juan Dela Cruz" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 transition-all" />
                            </div>

                            {!isEditMode && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                                        <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="e.g. user@medisens.com" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 transition-all" />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
                                            <input type="password" value={fPassword} onChange={e => setFPassword(e.target.value)} placeholder="Min. 6 chars" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 transition-all" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirm Password</label>
                                            <input type="password" value={fConfirmPassword} onChange={e => setFConfirmPassword(e.target.value)} placeholder="Repeat password" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 transition-all" />
                                        </div>
                                    </div>
                                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-2">
                                        <div className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Authorized Account Creation</div>
                                        <p className="text-[11px] text-amber-800 font-medium leading-snug">
                                            New accounts must be created only for approved RHU personnel. Assign the correct role before saving access.
                                        </p>
                                    </div>
                                </>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role Assignment</label>
                                <select value={fRole} onChange={e => setFRole(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:bg-white focus:outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 transition-all cursor-pointer">
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
                        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                            <button type="button" onClick={closeUserModal} disabled={isSaving} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
                            <button type="button" onClick={handleSaveUser} disabled={isSaving} className="flex items-center gap-2 px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md shadow-none transition-all disabled:opacity-50 min-w-[140px] justify-center text-center">
                                {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Confirm Delete Modal ─── */}
            {isConfirmModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 " onClick={(e) => { if (e.target === e.currentTarget && !isSaving) closeConfirmModal(); }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="delete-user-dialog-title" className="bg-white w-full max-w-[360px] rounded-[24px] shadow-sm flex flex-col items-center p-8  text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-5 shadow-inner"><Icon name="trash" className="h-8 w-8" /></div>
                        <h3 id="delete-user-dialog-title" className="text-xl font-black text-slate-800 tracking-tight mb-2">Delete User?</h3>
                        <p className="text-sm text-slate-500 leading-relaxed mb-8">
                            Are you sure you want to permanently delete <strong className="text-slate-800 font-bold">{userToDelete?.name}</strong>? This action cannot be undone.
                        </p>
                        <div className="flex w-full gap-3">
                            <button type="button" onClick={closeConfirmModal} disabled={isSaving} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50">Cancel</button>
                            <button type="button" onClick={handleDeleteUser} disabled={isSaving} className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 shadow-md shadow-red-500/20 transition-all disabled:opacity-50">
                                {isSaving ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<AdminDashboard />);
