import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { patientSupabase } from '../../lib/supabase/patientClient';
import { getPatientPortalSession, signOutPatientPortal, type PatientPortalSession } from '../../lib/auth/patientPortal';
import { fetchPreferences, updatePreferences } from '../../features/patient-portal/api';
import { PortalShell } from '../../components/patient-portal/PortalShell';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/shared/Icon';
import '../../styles/patient-portal.css';

type ViewState =
    | { status: 'loading' }
    | { status: 'signed-out' }
    | { status: 'empty'; session: PatientPortalSession }
    | { status: 'error'; message: string }
    | { status: 'ready'; session: PatientPortalSession };

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;
const TEXT_SIZE_STORAGE_KEY = 'medisens-patient-text-size';
const CONTRAST_STORAGE_KEY = 'medisens-patient-contrast';
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

function readStoredTextSize(): 'comfortable' | 'large' {
    try {
        return window.sessionStorage.getItem(TEXT_SIZE_STORAGE_KEY) === 'large' ? 'large' : 'comfortable';
    } catch {
        return 'comfortable';
    }
}

function readStoredContrast(): boolean {
    try {
        return window.sessionStorage.getItem(CONTRAST_STORAGE_KEY) === 'high';
    } catch {
        return false;
    }
}

function PatientPortalApp() {
    const [view, setView] = useState<ViewState>({ status: 'loading' });
    const [textSize, setTextSize] = useState<'comfortable' | 'large'>(() => readStoredTextSize());
    const [highContrast, setHighContrast] = useState<boolean>(() => readStoredContrast());
    const [signInBusy, setSignInBusy] = useState(false);
    const [signInError, setSignInError] = useState<string | null>(null);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadSession = useCallback(async () => {
        setView({ status: 'loading' });
        try {
            const session = await getPatientPortalSession();
            if (!session) {
                setView({ status: 'signed-out' });
                return;
            }
            if (session.grants.length === 0) {
                setView({ status: 'empty', session });
                return;
            }
            setView({ status: 'ready', session });
        } catch {
            setView({ status: 'error', message: 'Something went wrong loading your account. Please try again.' });
        }
    }, []);

    useEffect(() => {
        void loadSession();
    }, [loadSession]);

    // Hydrate the real, persisted preference once the account is known --
    // sessionStorage above is only the same-tab default until this
    // resolves, so a returning patient on a new tab/device sees their
    // actual saved preference, not just "Comfortable" (§9.5, §17 Phase 8
    // "preference persists correctly"). A missing preferences row (e.g. an
    // account-only caregiver activation, §5.2.1) is not an error -- the
    // session default stands.
    useEffect(() => {
        if (view.status !== 'ready') return;
        let cancelled = false;
        void (async () => {
            try {
                const prefs = await fetchPreferences(view.session.account.id);
                if (cancelled || !prefs) return;
                setTextSize(prefs.textSize);
                setHighContrast(prefs.highContrast);
                try {
                    window.sessionStorage.setItem(TEXT_SIZE_STORAGE_KEY, prefs.textSize);
                    window.sessionStorage.setItem(CONTRAST_STORAGE_KEY, prefs.highContrast ? 'high' : 'normal');
                } catch {
                    // sessionStorage unavailable -- the in-memory state above still applies.
                }
            } catch {
                // Preference lookup failing must not block the shell from
                // rendering -- the session-default text size/contrast stand.
            }
        })();
        return () => {
            cancelled = true;
        };
        // Runs once per newly-ready session (account id is stable for its
        // lifetime), not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view.status === 'ready' ? view.session.account.id : null]);

    const handleSignOut = useCallback(async () => {
        // Patient Portal sign-out only -- the staff Supabase client is never
        // touched here (§4.5).
        await signOutPatientPortal();
        setView({ status: 'signed-out' });
    }, []);

    // 15-minute inactivity timeout (§5.3, §13 R8).
    useEffect(() => {
        if (view.status !== 'ready' && view.status !== 'empty') return;

        const resetTimer = () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = setTimeout(() => {
                void handleSignOut();
            }, INACTIVITY_LIMIT_MS);
        };

        resetTimer();
        ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));

        return () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
        };
    }, [view.status, handleSignOut]);

    const handleToggleTextSize = useCallback(async () => {
        const next = textSize === 'large' ? 'comfortable' : 'large';
        setTextSize(next);
        try {
            window.sessionStorage.setItem(TEXT_SIZE_STORAGE_KEY, next);
        } catch {
            // sessionStorage unavailable (e.g. private mode) -- the toggle still
            // works for the current render, it just will not survive a reload.
        }
        if (view.status === 'ready') {
            // Best-effort sync to the account's own preferences row. Some
            // Phase 3 activation paths (account-only caregiver, staff-mediated
            // recovery) do not create this row yet, so this call may
            // legitimately affect zero rows -- that is not an error here, the
            // in-session toggle above already applied.
            try {
                await updatePreferences(view.session.account.id, { textSize: next });
            } catch {
                // Save failure must not undo the in-session toggle.
            }
        }
    }, [textSize, view]);

    const handleToggleHighContrast = useCallback(async () => {
        const next = !highContrast;
        setHighContrast(next);
        try {
            window.sessionStorage.setItem(CONTRAST_STORAGE_KEY, next ? 'high' : 'normal');
        } catch {
            // sessionStorage unavailable -- same as text size above.
        }
        if (view.status === 'ready') {
            try {
                await updatePreferences(view.session.account.id, { highContrast: next });
            } catch {
                // Save failure must not undo the in-session toggle.
            }
        }
    }, [highContrast, view]);

    const handleSignIn = useCallback(async (medisensId: string, pin: string) => {
        setSignInBusy(true);
        setSignInError(null);
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
            const response = await fetch(`${supabaseUrl}/functions/v1/patient-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: anonKey },
                body: JSON.stringify({ medisensId, pin }),
            });
            const body = await response.json().catch(() => null);
            const accessToken = body?.session?.access_token;
            const refreshToken = body?.session?.refresh_token;
            if (!response.ok || !accessToken || !refreshToken) {
                setSignInError('That MediSens ID or PIN was not recognized. Please try again.');
                return;
            }
            const { error } = await patientSupabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (error) {
                setSignInError('Something went wrong signing you in. Please try again.');
                return;
            }
            await loadSession();
        } catch {
            setSignInError('Something went wrong signing you in. Please try again.');
        } finally {
            setSignInBusy(false);
        }
    }, [loadSession]);

    return (
        <div data-portal data-text-size={textSize} data-contrast={highContrast ? 'high' : undefined}>
            {view.status === 'loading' && <LoadingShell />}
            {view.status === 'signed-out' && (
                <SignInShell busy={signInBusy} error={signInError} onSignIn={handleSignIn} />
            )}
            {view.status === 'error' && <ErrorShell message={view.message} onRetry={() => void loadSession()} />}
            {view.status === 'empty' && (
                <EmptyAccountShell account={view.session.account} onSignOut={() => void handleSignOut()} />
            )}
            {view.status === 'ready' && (
                <PortalShell
                    session={view.session}
                    textSize={textSize}
                    onToggleTextSize={() => void handleToggleTextSize()}
                    highContrast={highContrast}
                    onToggleHighContrast={() => void handleToggleHighContrast()}
                    onSignOut={() => void handleSignOut()}
                />
            )}
        </div>
    );
}

function LoadingShell() {
    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6" role="status" aria-live="polite">
            <p className="text-[length:var(--type-body-size)] text-[var(--text-secondary)]">Loading your account…</p>
        </div>
    );
}

function ErrorShell({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6">
            <div className="w-full max-w-sm">
                <EmptyState icon={<Icon name="alert-triangle" className="h-5 w-5" />} title="We couldn't load your account" description={message} />
                <Button className="mt-4 w-full" onClick={onRetry}>Try again</Button>
            </div>
        </div>
    );
}

function EmptyAccountShell({ account, onSignOut }: { account: PatientPortalSession['account']; onSignOut: () => void }) {
    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6">
            <div className="w-full max-w-sm text-center">
                <p className="mb-4 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">Signed in as {account.displayName}</p>
                <EmptyState
                    icon={<Icon name="inbox" className="h-5 w-5" />}
                    title="You do not currently have access to any health record"
                    description="If you believe this is a mistake, please visit the Rural Health Unit."
                />
                <Button className="mt-4 w-full" variant="outline" onClick={onSignOut}>Sign out</Button>
            </div>
        </div>
    );
}

interface SignInShellProps {
    busy: boolean;
    error: string | null;
    onSignIn: (medisensId: string, pin: string) => void;
}

// Minimal sign-in so the authenticated shell above is reachable and
// testable (§17 Phase 4 gate: "Shell renders for a Phase-3 test account").
// The full activation / OTP / recovery UX from §5.2-§5.5 is not built in
// this phase -- only patient-login is wired up here.
function SignInShell({ busy, error, onSignIn }: SignInShellProps) {
    const [medisensId, setMedisensId] = useState('');
    const [pin, setPin] = useState('');

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!medisensId.trim() || !pin) return;
        onSignIn(medisensId.trim(), pin);
    };

    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6">
            <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-surface)]">
                <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">MediSens Patient Portal</h1>
                <p className="mb-5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">Sign in with your MediSens ID and PIN.</p>

                <label className="mb-3 block">
                    <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">MediSens ID</span>
                    <Input
                        value={medisensId}
                        onChange={(e) => setMedisensId(e.target.value)}
                        placeholder="MS-XXXX-XXXX"
                        autoComplete="username"
                        autoCapitalize="characters"
                    />
                </label>

                <label className="mb-4 block">
                    <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">PIN</span>
                    <Input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="Enter your PIN"
                        autoComplete="current-password"
                        inputMode="numeric"
                    />
                </label>

                {error && (
                    <p role="alert" className="mb-4 rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-tint)] px-3 py-2 text-[length:var(--type-supporting-size)] text-[var(--coral)]">
                        {error}
                    </p>
                )}

                <Button type="submit" className="w-full" isLoading={busy}>Sign in</Button>
            </form>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<PatientPortalApp />);
