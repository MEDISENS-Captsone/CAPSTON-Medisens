import { useRef } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
import { useT } from '../../lib/i18n/patientPortal';
import type { PatientGrantSummary } from '../../lib/auth/patientPortal';

interface PersonSwitcherProps {
    isOpen: boolean;
    grants: PatientGrantSummary[];
    activeGrantId: string | null;
    onSelect: (grant: PatientGrantSummary) => void;
    onClose: () => void;
}

function relationshipLabel(
    grant: PatientGrantSummary,
    t: (key: 'record.helpManage' | 'switcher.youArePatient' | 'switcher.youAreGuardian' | 'switcher.youAreCaregiver') => string,
): { title: string; hint: string } {
    if (grant.relationship === 'SELF') return { title: grant.recordName || t('record.helpManage'), hint: t('switcher.youArePatient') };
    if (grant.relationship === 'GUARDIAN') return { title: grant.recordName || t('record.helpManage'), hint: t('switcher.youAreGuardian') };
    return { title: grant.recordName || t('record.helpManage'), hint: t('switcher.youAreCaregiver') };
}

/** Person switcher (§6.2). Explicit, never automatic: switching re-renders
 * the whole shell (handled by the caller) so no previous record's context
 * lingers on screen. */
export function PersonSwitcher({ isOpen, grants, activeGrantId, onSelect, onClose }: PersonSwitcherProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const firstOptionRef = useRef<HTMLButtonElement>(null);
    const { t } = useT();

    useDialogFocus({ isOpen, dialogRef, initialFocusRef: firstOptionRef, onClose });

    if (!isOpen) return null;

    return (
        <>
            <div className="portal-sheet-overlay" onClick={onClose} aria-hidden="true" />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="portal-person-switcher-title"
                tabIndex={-1}
                className="portal-sheet"
            >
                <h2 id="portal-person-switcher-title" className="mb-3 text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">
                    {t('context.chooseRecord')}
                </h2>
                <div>
                    {grants.map((grant, index) => {
                        const { title, hint } = relationshipLabel(grant, t);
                        const isActive = grant.id === activeGrantId;
                        return (
                            <button
                                key={grant.id}
                                ref={index === 0 ? firstOptionRef : undefined}
                                type="button"
                                className="portal-sheet-option"
                                aria-current={isActive ? 'true' : undefined}
                                onClick={() => onSelect(grant)}
                            >
                                <span className="min-w-0">
                                    <span className="block font-semibold text-[var(--text)]">{title}</span>
                                    <span className="block text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">{hint}</span>
                                </span>
                                {isActive && <span className="shrink-0 text-[length:var(--type-caption-size)] font-semibold text-[var(--brand-active)]">{t('context.viewing')}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
