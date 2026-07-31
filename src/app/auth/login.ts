import { supabase } from '../../lib/supabase/client';
import { safeTrim } from '../../lib/utils/strings';
import { getDashboardPath, isRole } from '../../lib/auth/roles';
import { logAuditEvent } from '../../features/audit/services';
import loginBg1 from '../../assets/Login Page 1.png';
import loginBg2 from '../../assets/Login Page 2.png';
import loginBg3 from '../../assets/Login Page 3.png';
import medisensLogo from '../../assets/MEDISENS Logo.png';

document.documentElement.style.setProperty('--login-bg-1', `url("${loginBg1}")`);
document.documentElement.style.setProperty('--login-bg-2', `url("${loginBg2}")`);
document.documentElement.style.setProperty('--login-bg-3', `url("${loginBg3}")`);
document.documentElement.style.setProperty('--medisens-logo', `url("${medisensLogo}")`);

// Chromium restores previously submitted values into same-URL forms (and replays them
// out of the bfcache), so after a logout the prior clinician's credentials reappear here
// and a single Sign In click would re-authenticate them on a shared RHU workstation.
// The autocomplete tokens are kept so password managers can still offer and save
// credentials; only the silent browser-side restore is defeated.
function clearCredentialFields(): void {
    for (const id of ['emailInput', 'passwordInput']) {
        const input = document.getElementById(id);
        if (input instanceof HTMLInputElement) input.value = '';
    }
}

// The browser writes restored values back after this module executes, so clear both now
// and again on each later checkpoint (`pageshow` additionally covers bfcache restores
// via Back/Forward). Cheap, and it does not stop a manager filling on user request.
function clearCredentialFieldsRepeatedly(): void {
    clearCredentialFields();
    requestAnimationFrame(clearCredentialFields);
    setTimeout(clearCredentialFields, 0);
    setTimeout(clearCredentialFields, 120);
}

clearCredentialFieldsRepeatedly();
window.addEventListener('DOMContentLoaded', clearCredentialFieldsRepeatedly);
window.addEventListener('load', clearCredentialFieldsRepeatedly);
window.addEventListener('pageshow', clearCredentialFieldsRepeatedly);

// If already logged in, redirect immediately
const { data: { session } } = await supabase.auth.getSession();
if (session) redirectByRole(session.user.id);

// ─── Handle Login ─────────────────────────────────────────────────────────────
window.handleLogin = async function (): Promise<void> {
    const email    = safeTrim((document.getElementById('emailInput') as HTMLInputElement).value);
    const password = (document.getElementById('passwordInput') as HTMLInputElement).value;
    const btn      = document.getElementById('loginBtn')!;
    const spinner  = document.getElementById('spinner')!;
    const btnText  = document.getElementById('btnText')!;
    const errorMsg = document.getElementById('errorMsg')!;

    errorMsg.style.display = 'none';
    setFieldsInvalid(false);

    if (!email || !password) {
        showError('Please enter your email and password.');
        return;
    }

    // Loading state
    btn.classList.add('loading');
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
        stopLoading();
        showError('Invalid email or password. Please try again.');
        return;
    }

    await redirectByRole(data.user.id);
};

async function redirectByRole(userId: string): Promise<void> {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        stopLoading();
        showError('Account profile not found. Contact your administrator.');
        await supabase.auth.signOut();
        return;
    }

    if (isRole(profile.role)) {
        await logAuditEvent({
            action: 'login',
            module: 'Authentication',
            recordId: userId,
            recordType: 'profile',
            description: 'User signed in.',
            metadata: { profile_id: userId },
        });
        window.location.href = getDashboardPath(profile.role);
    } else {
        stopLoading();
        showError(`Unknown role "${profile.role}". Contact your administrator.`);
    }
}

function showError(msg: string): void {
    const el = document.getElementById('errorMsg')!;
    el.textContent = msg;
    el.style.display = 'block';
    setFieldsInvalid(true);
}

function setFieldsInvalid(invalid: boolean): void {
    for (const id of ['emailInput', 'passwordInput']) {
        const input = document.getElementById(id);
        if (!input) continue;
        if (invalid) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    }
}

function stopLoading(): void {
    document.getElementById('loginBtn')!.classList.remove('loading');
    document.getElementById('btnText')!.style.display = 'block';
    document.getElementById('spinner')!.style.display = 'none';
}

// Native form submission (submit button click or Enter in a field) drives login.
document.getElementById('loginForm')?.addEventListener('submit', (e: Event) => {
    e.preventDefault();
    void window.handleLogin();
});

declare global {
    interface Window {
        handleLogin: () => Promise<void>;
    }
}
