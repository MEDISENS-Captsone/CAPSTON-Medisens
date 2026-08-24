import { useState } from 'react';
import { RecentAccess } from './RecentAccess';
import { Button } from '../ui/Button';
import { Icon } from '../shared/Icon';
import { changePin } from '../../features/patient-portal/api';

interface PrivacySecurityProps {
    patientId: number;
    isSelf: boolean;
    onBack: () => void;
}

/** Privacy & Security (§9.5) -- Change PIN, plus (SELF sessions only)
 * "Recent access to this record" and a link to the existing privacy
 * policy page. patient_portal_recent_access() itself refuses a
 * non-SELF caller, so the recent-access feed is gated here too rather
 * than letting the RPC error surface as a broken screen. */
export function PrivacySecurity({ patientId, isSelf, onBack }: PrivacySecurityProps) {
    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>Back</span>
            </button>

            <div className="mt-4 space-y-4">
                <ChangePinCard />

                {isSelf && (
                    <div>
                        <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Recent access to this record</h2>
                        <RecentAccess patientId={patientId} />
                    </div>
                )}

                <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                    <p className="text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                        MediSens keeps your health information private and only shows it to accounts the Rural Health Unit has approved.
                    </p>
                    <a href="/pages/privacy-policy.html" className="mt-2 inline-block font-semibold text-[var(--brand-active)] underline">
                        Read the full privacy policy
                    </a>
                </div>
            </div>
        </div>
    );
}

function ChangePinCard() {
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setError(null);
        setSuccess(false);

        if (newPin !== confirmPin) {
            setError('The new PIN entries do not match.');
            return;
        }

        setBusy(true);
        try {
            await changePin(currentPin, newPin);
            setSuccess(true);
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'We could not change your PIN right now.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">Change PIN</h2>

            <form onSubmit={handleSubmit} className="mt-3 space-y-3">
                <label className="block">
                    <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">Current PIN</span>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 text-[var(--text)]"
                    />
                </label>
                <label className="block">
                    <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">New PIN (6+ digits)</span>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 text-[var(--text)]"
                    />
                </label>
                <label className="block">
                    <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">Confirm new PIN</span>
                    <input
                        type="password"
                        inputMode="numeric"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 text-[var(--text)]"
                    />
                </label>

                {error && (
                    <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-tint)] px-3 py-2 text-[length:var(--type-supporting-size)] text-[var(--coral)]">
                        {error}
                    </p>
                )}
                {success && (
                    <p role="status" className="rounded-[var(--radius-control)] border border-[var(--green-border)] bg-[var(--green-light)] px-3 py-2 text-[length:var(--type-supporting-size)] text-[var(--green)]">
                        Your PIN has been changed.
                    </p>
                )}

                <Button type="submit" className="w-full" isLoading={busy}>Change PIN</Button>
            </form>
        </div>
    );
}
