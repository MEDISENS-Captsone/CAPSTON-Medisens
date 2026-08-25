import { Icon } from '../shared/Icon';
import { useT } from '../../lib/i18n/patientPortal';
import type { PatientGrantSummary } from '../../lib/auth/patientPortal';

interface RecordContextBarProps {
    activeGrant: PatientGrantSummary | null;
    grantCount: number;
    onOpenSwitcher: () => void;
}

// "Viewing health record / <full name> / <relationship>" (§6.2,
// corrected per manual verification: the full patient identity must
// never be truncated). A compact three-line hierarchy replaces the old
// single ellipsized "Viewing <Name>'s health record" line -- kicker,
// then the full (wrapping) name, then the relationship/access note.
// Falls back to a plain description only when a name could not be
// resolved (e.g. a transient patient_portal_profile() failure) -- never
// a fabricated or guessed name. `name` is the patient's own recorded
// name and is never translated regardless of language; kicker/meta are
// interface copy and always come from the localization dictionary.
function contextCopy(
    grant: PatientGrantSummary | null,
    t: (key: 'context.viewing' | 'record.noneSelected' | 'record.ownRecord' | 'record.helpManage' | 'record.guardianAccess' | 'record.caregiverAccess') => string,
): { kicker: string; name: string; meta: string } {
    if (!grant) return { kicker: '', name: t('record.noneSelected'), meta: '' };
    if (grant.relationship === 'SELF') {
        return grant.recordName
            ? { kicker: t('context.viewing'), name: grant.recordName, meta: '' }
            : { kicker: '', name: t('record.ownRecord'), meta: '' };
    }
    if (grant.relationship === 'GUARDIAN') {
        return {
            kicker: t('context.viewing'),
            name: grant.recordName || t('record.helpManage'),
            meta: t('record.guardianAccess'),
        };
    }
    return {
        kicker: t('context.viewing'),
        name: grant.recordName || t('record.helpManage'),
        meta: t('record.caregiverAccess'),
    };
}

export function RecordContextBar({ activeGrant, grantCount, onOpenSwitcher }: RecordContextBarProps) {
    const { t } = useT();
    const { kicker, name, meta } = contextCopy(activeGrant, t);
    const isCaregiver = activeGrant?.relationship === 'AUTHORIZED_CAREGIVER';
    const canSwitch = grantCount > 1;

    return (
        <div className={`portal-context-bar${isCaregiver ? ' is-caregiver' : ''}`}>
            <button
                type="button"
                className="portal-context-bar-button"
                onClick={canSwitch ? onOpenSwitcher : undefined}
                disabled={!canSwitch}
                aria-haspopup={canSwitch ? 'dialog' : undefined}
            >
                <span className="min-w-0">
                    {kicker && <span className="portal-context-kicker block">{kicker}</span>}
                    <span className="portal-context-title block">{name}</span>
                    {meta && <span className="portal-context-subtitle block">{meta}</span>}
                </span>
                {canSwitch && <Icon name="chevron-right" className="mt-0.5 h-4 w-4 shrink-0 rotate-90" label={t('context.switchRecord')} />}
            </button>
        </div>
    );
}
