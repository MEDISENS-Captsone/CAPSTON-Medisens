import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { PatientFrontDoorShell } from './PatientFrontDoorShell';
import { callPublicPatientFunction, extractErrorMessage } from '../../features/patient-portal/publicAuth';

type Relationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';

interface VerifiedContext {
    relationship: Relationship;
    holderName: string | null;
    accessPatientName: string | null;
}

interface ActivationCompleteResult {
    medisensId: string;
    session: { access_token: string; refresh_token: string } | null;
}

type Step =
    | { name: 'code' }
    | { name: 'otp'; code: string }
    | { name: 'create-pin'; code: string; context: VerifiedContext }
    | { name: 'done'; medisensId: string; autoSignedIn: boolean };

const RELATIONSHIP_LABEL: Record<Relationship, string> = {
    SELF: 'Patient',
    GUARDIAN: 'Parent / legal guardian',
    AUTHORIZED_CAREGIVER: 'Authorized caregiver',
};

interface ActivationSetupProps {
    /** Fired once activation completes. `session` is set only when the
     * backend's own post-activation sign-in succeeded (task §14: never an
     * invented client-side auto-login -- only ever the session the
     * existing patient-activation-complete contract already returns). */
    onActivated: (session: { access_token: string; refresh_token: string } | null, medisensId: string) => void;
    onCancel: () => void;
}

const CODE_PATTERN = /^[23456789A-HJ-NP-Z]{8}$/;
const OTP_PATTERN = /^\d{6}$/;
const PIN_PATTERN = /^\d{6}$/;

/** Patient Account Phase 9B Step 6 -- first-time activation, entirely
 * separate from normal PIN login (task §11: "There is no self-
 * registration"). Calls only the two existing pre-auth Edge Functions,
 * patient-activation-verify and patient-activation-complete, exactly as
 * already deployed -- this component invents no new backend behavior and
 * carries no client-side relationship/eligibility logic of its own; every
 * fact shown here (relationship, holder name, whose record is accessed)
 * comes straight from the server's response. The activation code and any
 * PIN typed here live only in this component's React state and are never
 * written to localStorage/sessionStorage or logged. */
export function ActivationSetup({ onActivated, onCancel }: ActivationSetupProps) {
    const [step, setStep] = useState<Step>({ name: 'code' });
    const [codeInput, setCodeInput] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function verifyCode(code: string, otp?: string) {
        setSubmitting(true);
        setError(null);
        try {
            const result = await callPublicPatientFunction<{ verified: boolean; otpRequired: boolean } & VerifiedContext>(
                'patient-activation-verify',
                otp ? { code, otp } : { code },
            );
            if (!result.ok || !result.data || !('verified' in result.data)) {
                setError(extractErrorMessage(result.data));
                return;
            }
            if (result.data.otpRequired) {
                setStep({ name: 'otp', code });
                return;
            }
            if (result.data.verified) {
                setStep({
                    name: 'create-pin',
                    code,
                    context: {
                        relationship: result.data.relationship,
                        holderName: result.data.holderName,
                        accessPatientName: result.data.accessPatientName,
                    },
                });
                return;
            }
            setError(extractErrorMessage(result.data));
        } catch {
            setError('Something went wrong. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCodeSubmit(event: React.FormEvent) {
        event.preventDefault();
        const normalized = codeInput.trim().toUpperCase();
        if (!CODE_PATTERN.test(normalized)) {
            setError('Please enter the 8-character activation code exactly as given to you.');
            return;
        }
        await verifyCode(normalized);
    }

    async function handleOtpSubmit(event: React.FormEvent, code: string) {
        event.preventDefault();
        if (!OTP_PATTERN.test(otpInput.trim())) {
            setError('Please enter the 6-digit code sent to your phone.');
            return;
        }
        await verifyCode(code, otpInput.trim());
    }

    async function handleCreatePin(event: React.FormEvent, code: string) {
        event.preventDefault();
        if (!PIN_PATTERN.test(pin)) {
            setError('Your PIN must be exactly 6 digits.');
            return;
        }
        if (pin !== confirmPin) {
            setError('The two PINs do not match.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await callPublicPatientFunction<ActivationCompleteResult>('patient-activation-complete', { code, pin });
            if (!result.ok || !result.data || !('medisensId' in result.data)) {
                setError(extractErrorMessage(result.data));
                return;
            }
            setPin('');
            setConfirmPin('');
            if (result.data.session) {
                onActivated(result.data.session, result.data.medisensId);
            } else {
                setStep({ name: 'done', medisensId: result.data.medisensId, autoSignedIn: false });
            }
        } catch {
            setError('Something went wrong. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <PatientFrontDoorShell>
            <div className="patient-frontdoor-sheet-content">
                {step.name === 'code' && (
                    <form onSubmit={(e) => void handleCodeSubmit(e)}>
                        <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">Set up my account</h1>
                        <p className="mb-5 text-base text-[var(--text-secondary)]">Use the activation code given to you by Malvar RHU.</p>

                        <label className="mb-4 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">Activation code</span>
                            <Input
                                value={codeInput}
                                onChange={(e) => {
                                    // Uppercase-as-typed: patient-activation-verify already
                                    // normalizes the code to uppercase server-side
                                    // (`code.trim().toUpperCase()`), so mirroring that here
                                    // changes nothing about verification semantics -- it only
                                    // saves the patient from noticing a case mismatch that
                                    // never actually mattered. Constrained to the exact
                                    // generated length (generateActivationCode() always
                                    // produces 8 characters).
                                    setCodeInput(e.target.value.toUpperCase().slice(0, 8));
                                    // Clears the failed-submission error state as soon as the
                                    // field is edited, so a corrected/cleared value never sits
                                    // under a stale red validation message.
                                    setError(null);
                                }}
                                placeholder="e.g. BS2WFQ87"
                                autoCapitalize="characters"
                                autoComplete="one-time-code"
                                maxLength={8}
                                autoFocus
                            />
                        </label>

                        {error && <ErrorNote message={error} />}

                        <Button type="submit" className="mt-4 w-full" isLoading={submitting}>Continue</Button>
                        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onCancel} disabled={submitting}>Back to sign in</Button>
                    </form>
                )}

                {step.name === 'otp' && (
                    <form onSubmit={(e) => void handleOtpSubmit(e, step.code)}>
                        <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">Confirm your phone</h1>
                        <p className="mb-5 text-base text-[var(--text-secondary)]">We sent a 6-digit code by SMS. Enter it below to continue.</p>

                        <label className="mb-4 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">SMS code</span>
                            <Input
                                value={otpInput}
                                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                autoFocus
                            />
                        </label>

                        {error && <ErrorNote message={error} />}

                        <Button type="submit" className="mt-4 w-full" isLoading={submitting}>Continue</Button>
                        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => setStep({ name: 'code' })} disabled={submitting}>Back</Button>
                    </form>
                )}

                {step.name === 'create-pin' && (
                    <form onSubmit={(e) => void handleCreatePin(e, step.code)}>
                        <h1 className="mb-4 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">Create your PIN</h1>

                        <div className="mb-5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                            <p className="text-[length:var(--type-caption-size)] font-medium uppercase tracking-[var(--tracking-label)] text-[var(--text-muted)]">Account for</p>
                            <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{step.context.holderName ?? 'You'}</p>
                            {step.context.relationship !== 'SELF' && step.context.accessPatientName && (
                                <>
                                    <p className="mt-2.5 text-[length:var(--type-caption-size)] font-medium uppercase tracking-[var(--tracking-label)] text-[var(--text-muted)]">Access to</p>
                                    <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{step.context.accessPatientName}'s health record</p>
                                </>
                            )}
                            <p className="mt-2.5 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">{RELATIONSHIP_LABEL[step.context.relationship]}</p>
                        </div>

                        <label className="mb-3 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">6-digit PIN</span>
                            <Input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="new-password"
                                maxLength={6}
                                autoFocus
                            />
                        </label>

                        <label className="mb-3 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">Confirm PIN</span>
                            <Input
                                type="password"
                                value={confirmPin}
                                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="new-password"
                                maxLength={6}
                            />
                        </label>

                        <p className="mb-4 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">
                            Choose a PIN you can remember but other people cannot easily guess. RHU staff will never ask you for your PIN.
                        </p>

                        {error && <ErrorNote message={error} />}

                        <Button type="submit" className="w-full" isLoading={submitting}>Create account</Button>
                    </form>
                )}

                {step.name === 'done' && (
                    <div className="text-center">
                        <h1 className="mb-2 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">Your MediSens Patient Account is ready.</h1>
                        <p className="mb-5 text-base text-[var(--text-secondary)]">
                            You can now sign in with your MediSens ID <span className="font-mono font-semibold text-[var(--text)]">{step.medisensId}</span> and the PIN you just created.
                        </p>
                        <Button className="w-full" onClick={onCancel}>Go to sign in</Button>
                    </div>
                )}
            </div>
        </PatientFrontDoorShell>
    );
}

function ErrorNote({ message }: { message: string }) {
    return (
        <p role="alert" className="mt-3 rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-tint)] px-3 py-2 text-[length:var(--type-supporting-size)] text-[var(--coral)]">
            {message}
        </p>
    );
}
