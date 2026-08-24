import { Icon } from '../shared/Icon';
import type { PatientGrantSummary } from '../../lib/auth/patientPortal';

interface RecordContextBarProps {
    activeGrant: PatientGrantSummary | null;
    grantCount: number;
    onOpenSwitcher: () => void;
}

// "Viewing <Name>'s health record" (§6.2). Falls back to the plain
// relationship label only when a name could not be resolved (e.g. a
// transient patient_portal_profile() failure) -- never a fabricated or
// guessed name.
function contextCopy(grant: PatientGrantSummary | null): { title: string; subtitle: string } {
    if (!grant) return { title: 'No health record selected', subtitle: '' };
    if (grant.relationship === 'SELF') {
        return { title: grant.recordName ? `Viewing ${grant.recordName}'s health record` : 'Your own health record', subtitle: '' };
    }
    if (grant.relationship === 'GUARDIAN') {
        return {
            title: grant.recordName ? `Viewing ${grant.recordName}'s health record` : 'A health record you help manage',
            subtitle: 'Guardian access',
        };
    }
    return {
        title: grant.recordName ? `Viewing ${grant.recordName}'s health record` : 'A health record you help manage',
        subtitle: 'Caregiver access — read-only',
    };
}

export function RecordContextBar({ activeGrant, grantCount, onOpenSwitcher }: RecordContextBarProps) {
    const { title, subtitle } = contextCopy(activeGrant);
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
                    <span className="portal-context-title block">{title}</span>
                    {subtitle && <span className="portal-context-subtitle block">{subtitle}</span>}
                </span>
                {canSwitch && <Icon name="chevron-right" className="h-4 w-4 shrink-0 rotate-90" label="Switch record" />}
            </button>
        </div>
    );
}
