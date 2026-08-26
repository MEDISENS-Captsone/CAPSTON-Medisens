import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Icon } from '../shared/Icon';
import { callPublicPatientFunction, extractErrorMessage } from '../../features/patient-portal/publicAuth';
import { PatientMotionError } from './patientMotion';
import { formatMedisensIdInput, isValidMedisensId, normalizeMedisensId } from '../../lib/utils/qr';
import { getRememberedMedisensId } from '../../lib/utils/rememberedMedisensId';
import { useT, translate } from '../../lib/i18n/patientPortal';

interface RecoverResult {
    recovered: boolean;
    session: { access_token: string; refresh_token: string } | null;
    unavailable?: boolean;
    message?: string;
}

type Step =
    | { name: 'request' }
    | { name: 'verify'; medisensId: string }
    | { name: 'done'; unavailableMessage?: string };

const OTP_PATTERN = /^\d{6}$/;
const PIN_PATTERN = /^\d{6}$/;

interface RecoverAccountProps {
    /** Fired once recovery succeeds. `session` is set only when the
     * backend's own post-recovery sign-in succeeded -- never an invented
     * client-side auto-login. */
    onRecovered: (session: { access_token: string; refresh_token: string } | null, medisensId: string) => void;
    onCancel: () => void;
}

/** Patient Account Phase 9B Step 7 -- self-service PIN recovery via the
 * existing patient-account-recover Edge Function (SMS OTP to the phone
 * number on file for the account's own SELF-held patient record).
 * Distinct from ActivationSetup: this is for an account that already
 * exists and just needs a new PIN, not first-time setup -- it never
 * creates an account, never asks for an activation code, and never
 * reveals whether a MediSens ID exists (the request step's response is
 * the same constant acknowledgement regardless). A caregiver-only account
 * (no patient record of its own, so no phone number) cannot complete this
 * self-service path -- verify will fail the same generic way it does for
 * a wrong OTP, since the backend never distinguishes the two. Those
 * accounts still have the existing staff-mediated recovery path (RHU
 * counter, patient-activation-issue purpose="RECOVERY"), which is
 * unrelated to this screen. */
export function RecoverAccount({ onRecovered, onCancel }: RecoverAccountProps) {
    const { t, language } = useT();
    const [step, setStep] = useState<Step>({ name: 'request' });
    const [medisensIdInput, setMedisensIdInput] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ackMessage, setAckMessage] = useState<string | null>(null);
    const hasChangedStepRef = useRef(false);
    const medisensIdInputRef = useRef<HTMLInputElement>(null);

    // May safely prefill from the remembered MediSens ID (task §5) -- this
    // screen never writes a new remembered value itself, and never
    // remembers the OTP or the new PIN.
    useEffect(() => {
        const remembered = getRememberedMedisensId();
        if (remembered) setMedisensIdInput(remembered);
    }, []);

    function moveToStep(nextStep: Step) {
        hasChangedStepRef.current = true;
        setError(null);
        setStep(nextStep);
    }

    function handleMedisensIdChange(event: React.ChangeEvent<HTMLInputElement>) {
        const formatted = formatMedisensIdInput(event.target.value);
        setMedisensIdInput(formatted);
        setError(null);
        requestAnimationFrame(() => {
            const el = medisensIdInputRef.current;
            if (el) el.setSelectionRange(formatted.length, formatted.length);
        });
    }

    async function handleRequestSubmit(event: React.FormEvent) {
        event.preventDefault();
        const normalized = normalizeMedisensId(medisensIdInput);
        if (!isValidMedisensId(normalized)) {
            setError(translate('recover.invalidId', language));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await callPublicPatientFunction<{ message: string }>('patient-account-recover', {
                step: 'request',
                medisensId: normalized,
            });
            if (!result.ok || !result.data) {
                setError(extractErrorMessage(result.data, language));
                return;
            }
            // patient-account-recover always returns the same fixed English
            // ack regardless of language (docs/patientAccount.md §5.5 point
            // 1) -- its own response text is never rendered directly here.
            // This dictionary entry is UI-owned copy that mirrors the same
            // constant, non-disclosing meaning in the selected language.
            setAckMessage(t('recover.ackMessage'));
            moveToStep({ name: 'verify', medisensId: normalized });
        } catch {
            setError(translate('common.connectionError', language));
        } finally {
            setSubmitting(false);
        }
    }

    async function handleVerifySubmit(event: React.FormEvent, medisensId: string) {
        event.preventDefault();
        if (!OTP_PATTERN.test(otpInput.trim())) {
            setError(translate('recover.invalidOtp', language));
            return;
        }
        if (!PIN_PATTERN.test(newPin)) {
            setError(translate('recover.invalidNewPin', language));
            return;
        }
        if (newPin !== confirmPin) {
            setError(translate('recover.pinMismatch', language));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await callPublicPatientFunction<RecoverResult>('patient-account-recover', {
                step: 'verify',
                medisensId,
                otp: otpInput.trim(),
                newPin,
            });
            if (!result.ok || !result.data || !('recovered' in result.data) || !result.data.recovered) {
                setError(extractErrorMessage(result.data, language));
                return;
            }
            setOtpInput('');
            setNewPin('');
            setConfirmPin('');
            if (result.data.session) {
                onRecovered(result.data.session, medisensId);
            } else if (result.data.unavailable) {
                moveToStep({ name: 'done', unavailableMessage: result.data.message });
            } else {
                moveToStep({ name: 'done' });
            }
        } catch {
            setError(translate('common.connectionError', language));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div key={step.name} className={hasChangedStepRef.current ? 'patient-state-enter' : undefined}>
            {step.name === 'request' && (
                <form onSubmit={(e) => void handleRequestSubmit(e)}>
                    <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('recover.title')}</h1>
                    <p className="mb-5 text-base text-[var(--text-secondary)]">
                        {t('recover.enterId')}
                    </p>

                    <label className="mb-4 block">
                        <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('signin.medisensId')}</span>
                        <Input
                            ref={medisensIdInputRef}
                            value={medisensIdInput}
                            onChange={handleMedisensIdChange}
                            placeholder="MS-AB23-CD45"
                            autoComplete="username"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            maxLength={13}
                            autoFocus
                        />
                    </label>

                    <PatientMotionError message={error} className="mt-3" />

                    <Button type="submit" className="mt-4 w-full" isLoading={submitting}>{t('recover.continue')}</Button>
                    <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onCancel} disabled={submitting}>{t('recover.backToSignIn')}</Button>
                </form>
            )}

            {step.name === 'verify' && (
                <form onSubmit={(e) => void handleVerifySubmit(e, step.medisensId)}>
                    <h1 className="mb-1 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('recover.enterCode')}</h1>
                    {ackMessage && <p className="mb-5 text-base text-[var(--text-secondary)]">{ackMessage}</p>}

                    <label className="mb-3 block">
                        <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('recover.smsCode')}</span>
                        <Input
                            value={otpInput}
                            onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            autoFocus
                        />
                    </label>

                    <label className="mb-3 block">
                        <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('recover.newPin')}</span>
                        <Input
                            type="password"
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="new-password"
                            maxLength={6}
                        />
                    </label>

                    <label className="mb-3 block">
                        <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">{t('recover.confirmPin')}</span>
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
                        {t('recover.pinHint')}
                    </p>

                    <PatientMotionError message={error} className="mb-4" />

                    <Button type="submit" className="w-full" isLoading={submitting}>{t('recover.updatePin')}</Button>
                    <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => moveToStep({ name: 'request' })} disabled={submitting}>{t('recover.back')}</Button>
                </form>
            )}

            {step.name === 'done' && (
                <div className="text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--green-light)] text-[var(--green)]" aria-hidden="true">
                        <Icon name="check" className="h-6 w-6" />
                    </span>
                    <h1 className="mb-2 text-[length:var(--type-page-title-size)] font-bold text-[var(--brand-active)]">{t('recover.done')}</h1>
                    <p className="mb-5 text-base text-[var(--text-secondary)]">
                        {step.unavailableMessage ?? t('recover.canSignIn')}
                    </p>
                    <Button className="w-full" onClick={onCancel}>{t('recover.goToSignIn')}</Button>
                </div>
            )}
        </div>
    );
}
