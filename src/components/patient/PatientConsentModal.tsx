import PatientConsent from '../../app/patients/patient-consent';
import { Icon } from '../shared/Icon';
import { Modal } from '../ui/Modal';

interface PatientConsentModalProps {
    patientId: string;
    patientName: string;
    rhuPersonnel?: string;
    onClose: () => void;
    /** Fired after the consent record is actually saved by PatientConsent. */
    onConsentSaved: (consentDate: string) => void;
    /** BHW tablet/mobile only: apply the touch-first dialog refinements. */
    bhwTouchLayout?: boolean;
}

const TITLE_ID = 'patient-consent-dialog-title';

/**
 * Mounts the existing PatientConsent form (signatures, printed names,
 * validation, save and audit logging) inside the shared Modal primitive so the
 * signing role never has to leave the list it started from. The form itself is
 * reused unchanged; this wrapper only supplies dialog chrome.
 */
export function PatientConsentModal({
    patientId,
    patientName,
    rhuPersonnel,
    onClose,
    onConsentSaved,
    bhwTouchLayout = false,
}: PatientConsentModalProps) {
    return (
        <>
            <button
                type="button"
                aria-label="Close patient consent"
                className="clinical-drawer-backdrop"
                onClick={onClose}
            />
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
                <Modal labelledBy={TITLE_ID} onClose={onClose} className={`consent-modal ${bhwTouchLayout ? 'bhw-consent-modal' : ''}`}>
                    <div className="consent-modal-header">
                        <div className="min-w-0">
                            <div id={TITLE_ID} className="text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] text-[var(--text)]">
                                Record patient consent
                            </div>
                            <div className="mt-0.5 truncate text-[length:var(--type-caption-size)] leading-[var(--type-caption-line)] text-[var(--text-secondary)]">
                                {patientName}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close patient consent"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]"
                        >
                            <Icon name="close" className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="consent-modal-body">
                        <PatientConsent
                            patientId={patientId}
                            patientName={patientName}
                            rhuPersonnel={rhuPersonnel}
                            onConsentSaved={onConsentSaved}
                        />
                    </div>
                </Modal>
            </div>
        </>
    );
}
