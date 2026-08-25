import { Icon } from '../shared/Icon';
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
// a fabricated or guessed name.
function contextCopy(grant: PatientGrantSummary | null): { kicker: string; name: string; meta: string } {
    if (!grant) return { kicker: '', name: 'No health record selected', meta: '' };
    if (grant.relationship === 'SELF') {
        return grant.recordName
            ? { kicker: 'Viewing health record', name: grant.recordName, meta: '' }
            : { kicker: '', name: 'Your own health record', meta: '' };
    }
    if (grant.relationship === 'GUARDIAN') {
        return {
            kicker: 'Viewing health record',
            name: grant.recordName || 'A health record you help manage',
            meta: 'Guardian access',
        };
    }
    return {
        kicker: 'Viewing health record',
        name: grant.recordName || 'A health record you help manage',
        meta: 'Caregiver access · Read-only',
    };
}

export function RecordContextBar({ activeGrant, grantCount, onOpenSwitcher }: RecordContextBarProps) {
    const { kicker, name, meta } = contextCopy(activeGrant);
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
                {canSwitch && <Icon name="chevron-right" className="mt-0.5 h-4 w-4 shrink-0 rotate-90" label="Switch record" />}
            </button>
        </div>
    );
}
