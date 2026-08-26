import { useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useT } from '../../lib/i18n/patientPortal';

interface SignOutConfirmProps {
    onConfirm: () => void;
    onCancel: () => void;
}

const TITLE_ID = 'patient-signout-title';
const DESC_ID = 'patient-signout-description';

/** Sign-out confirmation (Phase 9C hardening) -- a single accidental tap
 * on "Sign out" must never end the Patient Portal session. Reuses the
 * existing shared Modal (focus trap, Escape-to-close, focus restoration
 * to the control that opened it) rather than inventing a second dialog
 * system -- the same component the staff side's consent/print modals
 * already use. Authentication is cleared only when the caller's
 * onConfirm actually fires, never on open. */
export function SignOutConfirm({ onConfirm, onCancel }: SignOutConfirmProps) {
    const { t } = useT();
    const cancelRef = useRef<HTMLButtonElement>(null);

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
            <button
                type="button"
                aria-label={t('signOut.cancel')}
                className="absolute inset-0 h-full w-full cursor-default"
                onClick={onCancel}
                tabIndex={-1}
            />
            <Modal
                labelledBy={TITLE_ID}
                onClose={onCancel}
                initialFocusRef={cancelRef}
                className="relative flex w-full max-w-sm flex-col items-center rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 text-center shadow-[var(--shadow-lg)]"
            >
                <h2 id={TITLE_ID} className="text-[length:var(--type-section-title-size)] font-semibold text-[var(--text)]">
                    {t('signOut.title')}
                </h2>
                <p id={DESC_ID} className="mb-5 mt-2 text-[length:var(--type-body-size)] text-[var(--text-secondary)]">
                    {t('signOut.body')}
                </p>
                <div className="flex w-full gap-3">
                    <Button ref={cancelRef} type="button" variant="outline" className="flex-1" onClick={onCancel}>
                        {t('signOut.cancel')}
                    </Button>
                    <Button type="button" variant="danger" className="flex-1" onClick={onConfirm}>
                        {t('signOut.confirm')}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
