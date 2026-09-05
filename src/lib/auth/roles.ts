import { supabase } from '../supabase/client';
import type { Role } from '../../types/user';
import { logAuditEvent } from '../../features/audit/services';

export const ROLE_DASHBOARD: Record<Role, string> = {
    doctor:     '/pages/doctor.html',
    nurse:      '/pages/nurse.html',
    BHW:        '/pages/bhw.html',
    pharmacist: '/pages/pharmacist.html',
    labaratory: '/pages/laboratory.html',
    admin:      '/pages/admin.html',
    midwives:   '/pages/midwife.html',
};

export interface AuthProfile {
    userId: string;
    role: Role;
    fullName: string;
}

const INACTIVE_REDIRECT = '/pages/login.html?reason=inactive';
let activeSessionGuardStarted = false;

export function isRole(value: unknown): value is Role {
    return typeof value === 'string' && value in ROLE_DASHBOARD;
}

export function getDashboardPath(role: Role): string {
    return ROLE_DASHBOARD[role];
}

async function getAuthProfile(): Promise<AuthProfile> {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = '/pages/login.html';
        throw new Error('Not authenticated');
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name, is_active')
        .eq('id', session.user.id)
        .single();

    if (error || !profile || !profile.is_active || !isRole(profile.role)) {
        await supabase.auth.signOut();
        window.location.href = profile && !profile.is_active ? INACTIVE_REDIRECT : '/pages/login.html';
        throw new Error(profile && !profile.is_active ? 'Account inactive' : 'Profile not found');
    }

    startActiveSessionGuard(session.user.id);

    return { userId: session.user.id, role: profile.role, fullName: profile.full_name || '' };
}

function startActiveSessionGuard(userId: string): void {
    if (activeSessionGuardStarted) return;
    activeSessionGuardStarted = true;

    let checking = false;
    const checkAccess = async () => {
        if (checking) return;
        checking = true;
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('is_active')
                .eq('id', userId)
                .maybeSingle();

            if (!error && (!profile || !profile.is_active)) {
                await supabase.auth.signOut();
                window.location.replace(INACTIVE_REDIRECT);
            }
        } finally {
            checking = false;
        }
    };

    const intervalId = window.setInterval(() => void checkAccess(), 15_000);
    window.addEventListener('pagehide', () => window.clearInterval(intervalId), { once: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkAccess();
    });
    window.addEventListener('focus', () => void checkAccess());
}

export async function requireRole(expectedRole: Role): Promise<AuthProfile> {
    const profile = await getAuthProfile();

    if (profile.role !== expectedRole) {
        window.location.href = getDashboardPath(profile.role);
        throw new Error('Wrong role');
    }

    return profile;
}

export async function requireAnyRole(expectedRoles: readonly Role[]): Promise<AuthProfile> {
    const profile = await getAuthProfile();

    if (!expectedRoles.includes(profile.role)) {
        window.location.href = getDashboardPath(profile.role);
        throw new Error('Wrong role');
    }

    return profile;
}

export async function redirectToDashboard(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', session.user.id)
        .single();

    if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        window.location.href = INACTIVE_REDIRECT;
    } else if (isRole(profile?.role)) {
        window.location.href = getDashboardPath(profile.role);
    } else {
        window.location.href = '/pages/login.html';
    }
}

export async function logout(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        await logAuditEvent({
            action: 'logout',
            module: 'Authentication',
            recordId: user.id,
            recordType: 'profile',
            description: 'User signed out.',
            metadata: { profile_id: user.id },
        });
    }
    await supabase.auth.signOut();
    // replace() so the authenticated dashboard is not left in session history for Back.
    window.location.replace('/pages/login.html');
}
