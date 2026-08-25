import { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Icon } from '../shared/Icon';
import { callPublicPatientFunction, extractErrorMessage } from '../../features/patient-portal/publicAuth';
import { PatientMotionError } from './patientMotion';
import { useT, translate, type PatientLanguage } from '../../lib/i18n/patientPortal';

type Relationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';

interface VerifiedContext {
    relationship: Relationship;
    holderName: string | null;
    accessPatientName: string | null;
}

interface ActivationCompleteResult {
    medisensId: string;
    session: { access_token: string; refresh_token: string } | null;
    unavailable?: boolean;
    message?: string;
}

type Step =
    | { name: 'code' }
    | { name: 'otp'; code: string }
    | { name: 'create-pin'; code: string; context: VerifiedContext }
    | { name: 'done'; medisensId: string; autoSignedIn: boolean; unavailableMessage?: string };

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
const RELATIONSHIP_LABEL_KEY: Record<Relationship, 'activation.relationshipSelf' | 'activation.relationshipGuardian' | 'activation.relationshipCaregiver'> = {
    SELF: 'activation.relationshipSelf',
    GUARDIAN: 'activation.relationshipGuardian',
    AUTHORIZED_CAREGIVER: 'activation.relationshipCaregiver',
};

export function ActivationSetup({ onActivated, onCancel }: ActivationSetupProps) {
    const { t, language } = useT();
    const [step, setStep] = useState<Step>({ name: 'code' });
    const [codeInput, setCodeInput] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasChangedStepRef = useRef(false);

    function moveToStep(nextStep: Step) {
        hasChangedStepRef.current = true;
        setStep(nextStep);
    }

    async function verifyCode(code: string, otp?: string) {
        setSubmitting(true);
        setError(null);
        try {
            const result = await callPublicPatientFunction<{ verified: boolean; otpRequired: boolean } & VerifiedContext>(
                'patient-activation-verify',
                otp ? { code, otp } : { code },
            );
            if (!result.ok || !result.data || !('verified' in result.data)) {
                setError(extractErrorMessage(result.data, language));
                return;
            }
            if (result.data.otpRequired) {
                moveToStep({ name: 'otp', code });
                return;
            }
            if (result.data.verified) {
                moveToStep({
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
            setError(extractErrorMessage(result.data, language));
        } catch {
            setError(translate('common.connectionError', language));
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCodeSubmit(event: React.FormEvent) {
        event.preventDefault();
        const normalized = codeInput.trim().toUpperCase();
        if (!CODE_PATTERN.test(normalized)) {
            setError(translate('activation.invalidCode', language));
            return;
        }
        await verifyCode(normalized);
    }

    async function handleOtpSubmit(event: React.FormEvent, code: string) {
        event.preventDefault();
        if (!OTP_PATTERN.test(otpInput.trim())) {
            setError(translate('activation.invalidOtp', language));
            return;
        }
        await verifyCode(code, otpInput.trim());
    }

    async function handleCreatePin(event: React.FormEvent, code: string) {
        event.preventDefault();
        if (!PIN_PATTERN.test(pin)) {
            setError(translate('activation.invalidPin', language));
            return;
        }
        if (pin !== confirmPin) {
            setError(translate('activation.pinMismatch', language));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await callPublicPatientFunction<ActivationCompleteResult>('patient-activation-complete', { code, pin });
            if (!result.ok || !result.data || !('medisensId' in result.data)) {
                setError(extractErrorMessage(result.data, language));
                return;
            }
            setPin('');
            setConfirmPin('');
            if (result.data.session) {
                onActivated(result.data.session, result.data.medisensId);
            } else if (result.data.unavailable) {
                moveToStep({ name: 'done', medisensId: result.data.medisensId, autoSignedIn: false, unavailableMessage: result.data.message });
            } else {
                moveToStep({ name: 'done', medisensId: result.data.medisensId, autoSignedIn: false });
            }
        } catch {
            setError(translate('common.connectionError', language));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div key={step.name} className={hasChangedStepRef.current ? 'patient-state-enter' : undefined}>
                {step.name === 'code' && (
                    <form onSubmit={(e) => void handleCodeSubmit(e)}>
                        <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('activation.title')}</h1>
                        <p className="mb-5 text-base text-[var(--text-secondary)]">{t('activation.useCode')}</p>

                        <label className="mb-4 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('activation.code')}</span>
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

                        <PatientMotionError message={error} className="mt-3" />

                        <Button type="submit" className="mt-4 w-full" isLoading={submitting}>{t('recover.continue')}</Button>
                        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onCancel} disabled={submitting}>{t('recover.backToSignIn')}</Button>
                    </form>
                )}

                {step.name === 'otp' && (
                    <form onSubmit={(e) => void handleOtpSubmit(e, step.code)}>
                        <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('activation.confirmPhone')}</h1>
                        <p className="mb-5 text-base text-[var(--text-secondary)]">{t('activation.otpSentDescription')}</p>

                        <label className="mb-4 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('activation.smsCode')}</span>
                            <Input
                                value={otpInput}
                                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                autoFocus
                            />
                        </label>

                        <PatientMotionError message={error} className="mt-3" />

                        <Button type="submit" className="mt-4 w-full" isLoading={submitting}>{t('recover.continue')}</Button>
                        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => moveToStep({ name: 'code' })} disabled={submitting}>{t('activation.back')}</Button>
                    </form>
                )}

                {step.name === 'create-pin' && (
                    <form onSubmit={(e) => void handleCreatePin(e, step.code)}>
                        <h1 className="mb-4 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('activation.createPin')}</h1>

                        <div className="mb-5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                            <p className="text-[length:var(--type-caption-size)] font-medium uppercase tracking-[var(--tracking-label)] text-[var(--text-muted)]">{t('activation.accountFor')}</p>
                            <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{step.context.holderName ?? t('activation.you')}</p>
                            {step.context.relationship !== 'SELF' && step.context.accessPatientName && (
                                <>
                                    <p className="mt-2.5 text-[length:var(--type-caption-size)] font-medium uppercase tracking-[var(--tracking-label)] text-[var(--text-muted)]">{t('activation.accessTo')}</p>
                                    <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{t('activation.healthRecordOf', { name: step.context.accessPatientName })}</p>
                                </>
                            )}
                            <p className="mt-2.5 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">{t(RELATIONSHIP_LABEL_KEY[step.context.relationship])}</p>
                        </div>

                        <label className="mb-3 block">
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('activation.pinLabel')}</span>
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
                            <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('activation.confirmPinLabel')}</span>
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
                            {t('activation.pinHint')}
                        </p>

                        <PatientMotionError message={error} className="mb-4" />

                        <Button type="submit" className="w-full" isLoading={submitting}>{t('activation.createAccount')}</Button>
                    </form>
                )}

                {step.name === 'done' && (
                    <div className="text-center">
                        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--green-light)] text-[var(--green)]" aria-hidden="true">
                            <Icon name="check" className="h-6 w-6" />
                        </span>
                        <h1 className="mb-2 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('activation.ready')}</h1>
                        <p className="mb-5 text-base text-[var(--text-secondary)]">
                            {step.unavailableMessage ?? (
                                <>{t('activation.canSignInWithPrefix')}<span className="font-mono font-semibold text-[var(--text)]">{step.medisensId}</span>{t('activation.canSignInWithSuffix')}</>
                            )}
                        </p>
                        <Button className="w-full" onClick={onCancel}>{t('recover.goToSignIn')}</Button>
                    </div>
                )}
        </div>
    );
}
