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
        .select('role, full_name')
        .eq('id', session.user.id)
        .single();

    if (error || !profile || !isRole(profile.role)) {
        await supabase.auth.signOut();
        window.location.href = '/pages/login.html';
        throw new Error('Profile not found');
    }

    return { userId: session.user.id, role: profile.role, fullName: profile.full_name || '' };
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
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (isRole(profile?.role)) {
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
