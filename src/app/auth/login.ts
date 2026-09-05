import { supabase } from '../../lib/supabase/client';
import { safeTrim } from '../../lib/utils/strings';
import { getDashboardPath, isRole } from '../../lib/auth/roles';
import { logAuditEvent } from '../../features/audit/services';
import medisensLogo from '../../assets/MEDISENS Logo.png';
import loginBackground from '../../assets/Login Page 3.png';

const logoElement = document.getElementById('medisensLogo');
if (logoElement instanceof HTMLImageElement) logoElement.src = medisensLogo;

const backgroundElement = document.getElementById('loginBackground');
if (backgroundElement instanceof HTMLImageElement) backgroundElement.src = loginBackground;
document.documentElement.style.setProperty('--mobile-login-background', `url("${loginBackground}")`);

const copyrightYearElement = document.getElementById('copyrightYear');
if (copyrightYearElement) copyrightYearElement.textContent = String(new Date().getFullYear());

const inactiveReason = new URLSearchParams(window.location.search).get('reason') === 'inactive';

const passwordInput = document.getElementById('passwordInput');
const passwordToggle = document.getElementById('passwordToggle');
const passwordVisibilityIcon = document.getElementById('passwordVisibilityIcon');

const eyeIconMarkup = `
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
    <circle cx="12" cy="12" r="2.75"></circle>
`;
const eyeOffIconMarkup = `
    <path d="m3 3 18 18"></path>
    <path d="M10.6 6.2A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6s-1.3 2.2-3.6 3.9"></path>
    <path d="M6.1 6.1C3.8 7.7 2.5 12 2.5 12s3.5 6 9.5 6a10 10 0 0 0 3.1-.5"></path>
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
`;

if (passwordInput instanceof HTMLInputElement && passwordToggle instanceof HTMLButtonElement) {
    passwordToggle.addEventListener('click', () => {
        const showPassword = passwordInput.type === 'password';
        passwordInput.type = showPassword ? 'text' : 'password';
        passwordToggle.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
        passwordToggle.setAttribute('aria-pressed', String(showPassword));
        if (passwordVisibilityIcon) {
            passwordVisibilityIcon.innerHTML = showPassword ? eyeOffIconMarkup : eyeIconMarkup;
        }
    });
}

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

if (inactiveReason) {
    showError('This account has been deactivated. Contact your administrator if you need access restored.');
}

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
        .select('role, is_active')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        stopLoading();
        showError('Account profile not found. Contact your administrator.');
        await supabase.auth.signOut();
        return;
    }

    if (!profile.is_active) {
        stopLoading();
        showError('This account has been deactivated. Contact your administrator if you need access restored.');
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
