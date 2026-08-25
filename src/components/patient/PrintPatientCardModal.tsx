import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Icon } from '../shared/Icon';
import { normalizeMedisensId } from '../../lib/utils/qr';
import { buildPatientCardPreview, printPatientCard, type PatientCardPreview } from '../../features/patient-account/printing';
import { logError } from '../../lib/utils/errors';

const TITLE_ID = 'print-patient-card-dialog-title';

interface PrintPatientCardModalProps {
    holderName: string;
    medisensId: string;
    onClose: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; preview: PatientCardPreview };

/** Patient Account Phase 9B Step 5 -- print preview + action for the
 * permanent MediSens Patient Card. Reprinting is always this explicit,
 * staff-triggered action (task §8) -- nothing auto-prints a card when an
 * account receives another grant. The desktop/tablet preview here always
 * renders (even against an unsafe origin) so staff can see the card
 * before printing, but the actual "Print Patient Card" action is
 * disabled whenever `buildPatientCardPreview` reports the resolved
 * origin isn't confirmed safe (task §7) -- this is the one place a
 * localhost/unconfigured QR is prevented from reaching a physical card. */
export function PrintPatientCardModal({ holderName, medisensId, onClose }: PrintPatientCardModalProps) {
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [printing, setPrinting] = useState(false);
    const [printError, setPrintError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setState({ status: 'loading' });
        buildPatientCardPreview(medisensId)
            .then((preview) => {
                if (!cancelled) setState({ status: 'ready', preview });
            })
            .catch((err) => {
                logError('Failed to build Patient Card preview', err);
                if (!cancelled) setState({ status: 'error' });
            });
        return () => {
            cancelled = true;
        };
    }, [medisensId]);

    async function handlePrint() {
        setPrinting(true);
        setPrintError(null);
        try {
            const ok = await printPatientCard({ holderName, medisensId });
            if (!ok) setPrintError('Unable to print this card from this environment. Please try again from the deployed MediSens site.');
        } catch (err) {
            logError('Failed to print Patient Card', err);
            setPrintError('Unable to print this card. Please try again.');
        } finally {
            setPrinting(false);
        }
    }

    return (
        <>
            <button type="button" aria-label="Close" className="clinical-drawer-backdrop" onClick={onClose} />
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
                <Modal labelledBy={TITLE_ID} onClose={onClose} className="consent-modal activate-account-modal">
                    <div className="consent-modal-header">
                        <div className="min-w-0">
                            <div id={TITLE_ID} className="text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] text-[var(--text)]">
                                Print Patient Card
                            </div>
                            <div className="mt-0.5 truncate text-[length:var(--type-caption-size)] leading-[var(--type-caption-line)] text-[var(--text-secondary)]">
                                {holderName}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]"
                        >
                            <Icon name="close" className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="consent-modal-body">
                        <div className="flex flex-col gap-4">
                            {state.status === 'loading' && <p className="text-sm text-[var(--text-secondary)]">Preparing card preview…</p>}

                            {state.status === 'error' && (
                                <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-light)] px-3 py-2 text-sm text-[var(--coral)]">
                                    Couldn't prepare the card preview. Please try again.
                                </p>
                            )}

                            {state.status === 'ready' && (
                                <>
                                    <div className="mx-auto flex w-full max-w-[340px] flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                                        <div>
                                            <p className="text-xs font-bold text-[var(--text)]">MediSens Patient Account</p>
                                            <p className="text-[10px] text-[var(--text-secondary)]">Malvar Rural Health Unit</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {state.preview.qrDataUrl ? (
                                                <img src={state.preview.qrDataUrl} alt="" className="h-20 w-20 shrink-0" />
                                            ) : (
                                                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] text-[10px] text-[var(--text-muted)]">
                                                    No QR
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-[var(--text)]">{holderName}</p>
                                                <p className="mt-1 font-mono text-sm font-semibold text-[var(--text)]">{normalizeMedisensId(medisensId)}</p>
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-[var(--text-secondary)]">
                                            Scan to open MediSens Patient Portal
                                            <div className="text-[var(--text-muted)]">You will still need your 6-digit PIN.</div>
                                        </div>
                                    </div>

                                    {!state.preview.canPrint && (
                                        <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-3 py-2 text-sm text-[var(--amber-text)]">
                                            {state.preview.unsafeReason ?? 'This environment cannot be confirmed as the public MediSens address, so printing is disabled here.'}
                                        </p>
                                    )}

                                    {printError && (
                                        <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-light)] px-3 py-2 text-sm text-[var(--coral)]">
                                            {printError}
                                        </p>
                                    )}
                                </>
                            )}

                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" onClick={onClose}>Close</Button>
                                <Button
                                    type="button"
                                    onClick={() => void handlePrint()}
                                    isLoading={printing}
                                    disabled={state.status !== 'ready' || !state.preview.canPrint}
                                >
                                    Print Patient Card
                                </Button>
                            </div>
                        </div>
                    </div>
                </Modal>
            </div>
        </>
    );
}
