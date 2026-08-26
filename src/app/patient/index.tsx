import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { patientSupabase } from '../../lib/supabase/patientClient';
import { getPatientPortalSession, signOutPatientPortal, type PatientPortalSession } from '../../lib/auth/patientPortal';
import { fetchPreferences, updatePreferences } from '../../features/patient-portal/api';
import { callPublicPatientFunction, extractErrorMessage } from '../../features/patient-portal/publicAuth';
import { PortalShell } from '../../components/patient-portal/PortalShell';
import { SignOutConfirm } from '../../components/patient-portal/SignOutConfirm';
import { QrScan } from '../../components/patient-portal/QrScan';
import { ActivationSetup } from '../../components/patient-portal/ActivationSetup';
import { RecoverAccount } from '../../components/patient-portal/RecoverAccount';
import { PatientFrontDoorShell } from '../../components/patient-portal/PatientFrontDoorShell';
import { PatientMotionError } from '../../components/patient-portal/patientMotion';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/shared/Icon';
import { formatMedisensIdInput, isValidMedisensId, normalizeMedisensId, parseMedisensIdFromFragment } from '../../lib/utils/qr';
import { getRememberedMedisensId, setRememberedMedisensId, forgetRememberedMedisensId } from '../../lib/utils/rememberedMedisensId';
import { PatientLanguageProvider, useT, translate, type PatientLanguage } from '../../lib/i18n/patientPortal';
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
const LANGUAGE_STORAGE_KEY = 'medisens-patient-language';
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

// The shared GENERIC_AUTH_ERROR wording (supabase/functions/_shared/patientPortal.ts)
// is written for activation/recovery contexts too ("MediSens ID, code, or
// PIN"), which reads oddly on a screen that only ever asks for an ID and
// a PIN. This remaps that one exact string to sign-in-specific copy --
// patient-login's own soft-lock/hard-lock messages are distinct strings
// and pass through untouched, so the server's non-disclosure behavior
// (never revealing which part of the input was wrong) is unaffected.
const SHARED_GENERIC_AUTH_ERROR = 'That MediSens ID, code, or PIN was not recognized. Please try again.';

// The remap target is localized (the matched-against source string is
// always this one fixed English constant patient-login actually returns
// -- that comparison itself never changes with language, only the copy
// shown to the patient afterward does).
function toSignInErrorCopy(message: string, language: PatientLanguage): string {
    return message === SHARED_GENERIC_AUTH_ERROR ? translate('frontdoor.genericSignInError', language) : message;
}

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

function readStoredLanguage(): PatientLanguage {
    try {
        return window.sessionStorage.getItem(LANGUAGE_STORAGE_KEY) === 'fil' ? 'fil' : 'en';
    } catch {
        return 'en';
    }
}

function PatientPortalApp() {
    const [view, setView] = useState<ViewState>({ status: 'loading' });
    const [textSize, setTextSize] = useState<'comfortable' | 'large'>(() => readStoredTextSize());
    const [highContrast, setHighContrast] = useState<boolean>(() => readStoredContrast());
    const [language, setLanguage] = useState<PatientLanguage>(() => readStoredLanguage());
    const [signInBusy, setSignInBusy] = useState(false);
    const [signInError, setSignInError] = useState<string | null>(null);
    const [prefillMedisensId, setPrefillMedisensId] = useState<string | null>(null);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Patient Card QR entry (task §7): a scanned card, or a QR opened
    // directly, arrives as `#ms=MS-XXXX-XXXX` on this same page. Parsed
    // and validated with the existing safe parser, used only to prefill
    // the MediSens ID field -- never to authenticate -- and the fragment
    // is stripped from the address bar immediately via replaceState so it
    // never lingers, gets bookmarked, or reappears after a refresh.
    useEffect(() => {
        const fromFragment = parseMedisensIdFromFragment(window.location.hash);
        if (fromFragment) {
            setPrefillMedisensId(fromFragment);
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }, []);

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
            setView({ status: 'error', message: translate('frontdoor.loadAccountError', language) });
        }
        // `language` is intentionally not a dependency -- including it would
        // re-trigger a full session reload every time the patient switches
        // languages in More > Language. The error string is read fresh from
        // `language`'s current value on each call regardless.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                setLanguage(prefs.language);
                try {
                    window.sessionStorage.setItem(TEXT_SIZE_STORAGE_KEY, prefs.textSize);
                    window.sessionStorage.setItem(CONTRAST_STORAGE_KEY, prefs.highContrast ? 'high' : 'normal');
                    window.sessionStorage.setItem(LANGUAGE_STORAGE_KEY, prefs.language);
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

    // Language preference (§17 Phase 9C) -- same in-session-first, then
    // best-effort-persisted pattern as text size/contrast above. Only ever
    // changes which strings the localization dictionary resolves to; it
    // never touches how patient/guardian/caregiver names, MediSens IDs,
    // medications, lab tests, or diagnoses are rendered -- those read
    // straight from the database in every component regardless of this
    // value.
    const handleSelectLanguage = useCallback(async (next: PatientLanguage) => {
        setLanguage(next);
        try {
            window.sessionStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        } catch {
            // sessionStorage unavailable -- the toggle still works for the
            // current render, it just will not survive a reload.
        }
        if (view.status === 'ready') {
            try {
                await updatePreferences(view.session.account.id, { language: next });
            } catch {
                // Save failure must not undo the in-session toggle.
            }
        }
    }, [view]);

    // Establishes the Patient Supabase session from a {access_token,
    // refresh_token} pair already minted server-side by patient-login or
    // patient-activation-complete -- this function never derives or
    // guesses a session itself, and never touches the staff Supabase
    // client (task §2, §10).
    const establishSession = useCallback(async (accessToken: string, refreshToken: string): Promise<boolean> => {
        const { error } = await patientSupabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        return !error;
    }, []);

    const handleSignIn = useCallback(async (medisensId: string, pin: string) => {
        setSignInBusy(true);
        setSignInError(null);
        try {
            // Uses the existing patient-login Edge Function exclusively --
            // never signInWithPassword() directly, since the D-2 guarantee
            // depends on patient-login deriving the real Auth password
            // from the PIN server-side (docs/patientAccount.md §5.4).
            const result = await callPublicPatientFunction<{ session: { access_token: string; refresh_token: string } }>('patient-login', { medisensId, pin });
            const accessToken = result.data && 'session' in result.data ? result.data.session?.access_token : undefined;
            const refreshToken = result.data && 'session' in result.data ? result.data.session?.refresh_token : undefined;
            if (!result.ok || !accessToken || !refreshToken) {
                // Surfaces the server's own crafted message verbatim
                // (generic-invalid, soft-lock, or hard-lock wording) --
                // never overwritten with a single hardcoded string, and
                // never a raw Supabase/HTTP error. The one exception is
                // GENERIC_AUTH_ERROR's exact wording, remapped to
                // sign-in-specific copy below -- patient-login itself is
                // untouched, and every distinct message it can return
                // (soft-lock, hard-lock) still passes through unchanged,
                // preserving the non-disclosure behavior (this remap
                // still reveals nothing that the original text didn't).
                setSignInError(toSignInErrorCopy(extractErrorMessage(result.data, language), language));
                return;
            }
            const ok = await establishSession(accessToken, refreshToken);
            if (!ok) {
                setSignInError(translate('frontdoor.signInFailed', language));
                return;
            }
            setRememberedMedisensId(medisensId);
            await loadSession();
        } catch {
            setSignInError(translate('frontdoor.signInFailed', language));
        } finally {
            setSignInBusy(false);
        }
    }, [establishSession, loadSession, language]);

    // Fired by ActivationSetup once patient-activation-complete succeeds.
    // If the backend's own post-activation sign-in already returned a
    // session, that session is used as-is (task §14: "if automatic login
    // ... is already safely supported, use it" -- never an invented
    // shortcut). Otherwise the patient lands back on the normal sign-in
    // screen with their new MediSens ID prefilled and a success banner.
    const handleActivated = useCallback(async (session: { access_token: string; refresh_token: string } | null, medisensId: string) => {
        setPrefillMedisensId(medisensId);
        if (session) {
            const ok = await establishSession(session.access_token, session.refresh_token);
            if (ok) {
                await loadSession();
                return;
            }
        }
        setView({ status: 'signed-out' });
    }, [establishSession, loadSession]);

    // Fired by RecoverAccount once patient-account-recover succeeds. Same
    // rule as activation: use the backend's own returned session if
    // present, otherwise fall back to the normal sign-in screen with the
    // MediSens ID prefilled -- never an invented auto-login.
    const handleRecovered = useCallback(async (session: { access_token: string; refresh_token: string } | null, medisensId: string) => {
        setPrefillMedisensId(medisensId);
        if (session) {
            const ok = await establishSession(session.access_token, session.refresh_token);
            if (ok) {
                await loadSession();
                return;
            }
        }
        setView({ status: 'signed-out' });
    }, [establishSession, loadSession]);

    return (
        <PatientLanguageProvider language={language}>
            <div data-portal data-text-size={textSize} data-contrast={highContrast ? 'high' : undefined}>
                {view.status === 'loading' && <LoadingShell />}
                {view.status === 'signed-out' && (
                    <PatientFrontDoor
                        busy={signInBusy}
                        error={signInError}
                        prefillMedisensId={prefillMedisensId}
                        onSignIn={handleSignIn}
                        onActivated={(session, medisensId) => void handleActivated(session, medisensId)}
                        onRecovered={(session, medisensId) => void handleRecovered(session, medisensId)}
                    />
                )}
                {view.status === 'error' && <ErrorShell message={view.message} onRetry={() => void loadSession()} />}
                {view.status === 'empty' && (
                    <EmptyAccountShell account={view.session.account} onSignOut={() => void handleSignOut()} />
                )}
                {view.status === 'ready' && (
                    <div className="patient-auth-shell-enter">
                        <PortalShell
                            session={view.session}
                            textSize={textSize}
                            onToggleTextSize={() => void handleToggleTextSize()}
                            highContrast={highContrast}
                            onToggleHighContrast={() => void handleToggleHighContrast()}
                            language={language}
                            onSelectLanguage={(next) => void handleSelectLanguage(next)}
                            onSignOut={() => void handleSignOut()}
                        />
                    </div>
                )}
            </div>
        </PatientLanguageProvider>
    );
}

function LoadingShell() {
    const { t } = useT();
    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6" role="status" aria-live="polite">
            <p className="text-[length:var(--type-body-size)] text-[var(--text-secondary)]">{t('frontdoor.loadingAccount')}</p>
        </div>
    );
}

function ErrorShell({ message, onRetry }: { message: string; onRetry: () => void }) {
    const { t } = useT();
    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6">
            <div className="w-full max-w-sm">
                <EmptyState icon={<Icon name="alert-triangle" className="h-5 w-5" />} title={t('frontdoor.couldNotLoadAccount')} description={message} />
                <Button className="mt-4 w-full" onClick={onRetry}>{t('qr.tryAgain')}</Button>
            </div>
        </div>
    );
}

function EmptyAccountShell({ account, onSignOut }: { account: PatientPortalSession['account']; onSignOut: () => void }) {
    const { t } = useT();
    const [confirmingSignOut, setConfirmingSignOut] = useState(false);
    return (
        <div className="flex min-h-[100dvh] items-center justify-center p-6">
            <div className="w-full max-w-sm text-center">
                <p className="mb-4 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">{t('more.signedInAs')} {account.displayName}</p>
                <EmptyState
                    icon={<Icon name="inbox" className="h-5 w-5" />}
                    title={t('frontdoor.noAccessTitle')}
                    description={t('frontdoor.noAccessDescription')}
                />
                <Button className="mt-4 w-full" variant="outline" onClick={() => setConfirmingSignOut(true)}>{t('more.signOut')}</Button>
                {confirmingSignOut && (
                    <SignOutConfirm
                        onCancel={() => setConfirmingSignOut(false)}
                        onConfirm={() => {
                            setConfirmingSignOut(false);
                            onSignOut();
                        }}
                    />
                )}
            </div>
        </div>
    );
}

interface PatientFrontDoorProps {
    busy: boolean;
    error: string | null;
    /** A MediSens ID to prefill -- from a scanned/opened QR fragment, or
     * from a just-completed activation. Never a remembered PIN or name. */
    prefillMedisensId: string | null;
    onSignIn: (medisensId: string, pin: string) => void;
    onActivated: (session: { access_token: string; refresh_token: string } | null, medisensId: string) => void;
    onRecovered: (session: { access_token: string; refresh_token: string } | null, medisensId: string) => void;
}

type FrontDoorView = 'login' | 'scan' | 'activate' | 'recover';

/** Patient Account Phase 9B Step 6 -- the unauthenticated Patient Portal
 * front door: sign in (manual entry or QR-assisted), or first-time
 * activation. Every fact this screen shows or accepts comes from the
 * existing patient-login contract or the caller's own state -- it
 * performs no account lookup of its own (task §5: format validation
 * only, never a name/DOB/phone search). */
function PatientFrontDoor({ busy, error, prefillMedisensId, onSignIn, onActivated, onRecovered }: PatientFrontDoorProps) {
    const { t } = useT();
    const [view, setView] = useState<FrontDoorView>('login');
    const [medisensId, setMedisensId] = useState('');
    const [pin, setPin] = useState('');
    const [formatError, setFormatError] = useState<string | null>(null);
    const [remember, setRemember] = useState(false);
    const pinInputRef = useRef<HTMLInputElement>(null);
    const medisensIdInputRef = useRef<HTMLInputElement>(null);
    const hasChangedViewRef = useRef(false);

    function moveToView(nextView: FrontDoorView) {
        hasChangedViewRef.current = true;
        setView(nextView);
    }

    // Prefill precedence: a freshly scanned/opened QR or a just-completed
    // activation (both passed down as `prefillMedisensId`) always wins
    // over a remembered ID from a previous visit -- it reflects the
    // patient's most recent, explicit action.
    useEffect(() => {
        if (prefillMedisensId) {
            setMedisensId(prefillMedisensId);
            return;
        }
        const remembered = getRememberedMedisensId();
        if (remembered) {
            setMedisensId(remembered);
            setRemember(true);
        }
    }, [prefillMedisensId]);

    function handleScanned(scannedMedisensId: string) {
        setMedisensId(scannedMedisensId);
        moveToView('login');
        setFormatError(null);
        // The QR only ever supplies the ID -- a PIN is still required
        // (task §7, §8). Focusing the PIN field makes that requirement
        // obvious without another screen of explanatory text.
        requestAnimationFrame(() => pinInputRef.current?.focus());
    }

    function handleRememberChange(checked: boolean) {
        setRemember(checked);
        if (checked && isValidMedisensId(medisensId)) {
            setRememberedMedisensId(medisensId);
        } else if (!checked) {
            forgetRememberedMedisensId();
        }
    }

    function handleMedisensIdChange(event: React.ChangeEvent<HTMLInputElement>) {
        const formatted = formatMedisensIdInput(event.target.value);
        setMedisensId(formatted);
        // Cursor-safe strategy: hyphens are inserted programmatically as
        // the user types, so preserving the exact prior caret position
        // through every possible edit (mid-string insert/delete) is not
        // worth the complexity for an 8-character code typed mostly
        // left-to-right. Moving the caret to the end after each change
        // (the same approach common card/phone-number inputs use) keeps
        // typing predictable instead of leaving it stranded before a
        // hyphen that was just inserted ahead of it.
        requestAnimationFrame(() => {
            const el = medisensIdInputRef.current;
            if (el) el.setSelectionRange(formatted.length, formatted.length);
        });
    }

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        const normalized = normalizeMedisensId(medisensId);
        if (!isValidMedisensId(normalized)) {
            setFormatError(t('frontdoor.invalidId'));
            return;
        }
        if (!/^\d{6}$/.test(pin)) {
            setFormatError(t('frontdoor.invalidPin'));
            return;
        }
        setFormatError(null);
        if (remember) setRememberedMedisensId(normalized);
        onSignIn(normalized, pin);
    }

    return (
        <PatientFrontDoorShell showBackToStaffLogin={view !== 'activate' && view !== 'recover'}>
            <div key={view} className={`patient-frontdoor-sheet-content ${hasChangedViewRef.current ? 'patient-state-enter' : 'patient-initial-enter'}`}>
                {view === 'activate' ? (
                    <ActivationSetup onActivated={onActivated} onCancel={() => moveToView('login')} />
                ) : view === 'recover' ? (
                    <RecoverAccount onRecovered={onRecovered} onCancel={() => moveToView('login')} />
                ) : (
                    <>
                <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('frontdoor.title')}</h1>
                <p className="mb-5 text-base text-[var(--text-secondary)]">{t('frontdoor.subtitle')}</p>

                {view === 'scan' ? (
                    <QrScan onDetected={handleScanned} onManualEntry={() => moveToView('login')} />
                ) : (
                    <Button type="button" variant="outline" className="mb-4 w-full min-h-11" onClick={() => moveToView('scan')}>
                        {t('frontdoor.scanCard')}
                    </Button>
                )}

                {view === 'login' && (
                    <form onSubmit={handleSubmit}>
                        <label className="mb-3 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('signin.medisensId')}</span>
                            <Input
                                ref={medisensIdInputRef}
                                value={medisensId}
                                onChange={handleMedisensIdChange}
                                placeholder="MS-AB23-CD45"
                                autoComplete="username"
                                autoCapitalize="characters"
                                autoCorrect="off"
                                spellCheck={false}
                                maxLength={13}
                            />
                        </label>

                        <label className="mb-1.5 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('frontdoor.pinLabel')}</span>
                            <Input
                                ref={pinInputRef}
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder={t('frontdoor.pinPlaceholder')}
                                autoComplete="current-password"
                                inputMode="numeric"
                                maxLength={6}
                            />
                        </label>

                        {/* Recovery of an existing account -- deliberately
                            separate from "Set up my account" below (task
                            §2): different workflow, different backend
                            contract, never called "sign up". */}
                        <button
                            type="button"
                            onClick={() => moveToView('recover')}
                            className="patient-motion-link mb-4 min-h-11 text-[length:var(--type-supporting-size)] font-semibold text-[var(--brand-active)] underline"
                        >
                            {t('signin.forgotPin')}
                        </button>

                        <label className="mb-4 flex min-h-11 items-center gap-2 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => handleRememberChange(e.target.checked)}
                                className="h-5 w-5"
                            />
                            <span>{t('frontdoor.rememberId')}</span>
                        </label>

                        <PatientMotionError message={formatError ?? error} className="mb-4" />

                        <Button type="submit" className="w-full" isLoading={busy}>{t('frontdoor.signIn')}</Button>
                    </form>
                )}

                <div className="mt-5 border-t border-[var(--border)] pt-4 text-center">
                    <button
                        type="button"
                        onClick={() => moveToView('activate')}
                        className="patient-motion-link min-h-11 font-semibold text-[var(--brand-active)] underline"
                    >
                        {t('signin.setupAccount')}
                    </button>
                    <p className="mt-1 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">{t('frontdoor.setupAccountHint')}</p>
                </div>
                    </>
                )}
            </div>
        </PatientFrontDoorShell>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<PatientPortalApp />);
