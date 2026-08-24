import { Icon } from '../shared/Icon';
import type { PatientGrantSummary } from '../../lib/auth/patientPortal';

interface RecordContextBarProps {
    activeGrant: PatientGrantSummary | null;
    grantCount: number;
    onOpenSwitcher: () => void;
}

// Plain-language relationship labels (§6.2, §4.3). Patient-safe display
// names are not available until Phase 5's read RPCs exist (§7.1 -- names
// live on `patients`, which the portal cannot read directly); until then
// this shows the relationship, never a fabricated or guessed name.
function contextCopy(grant: PatientGrantSummary | null): { title: string; subtitle: string } {
    if (!grant) return { title: 'No health record selected', subtitle: '' };
    if (grant.relationship === 'SELF') return { title: 'Your own health record', subtitle: '' };
    if (grant.relationship === 'GUARDIAN') return { title: 'A health record you help manage', subtitle: 'Guardian access' };
    return { title: 'A health record you help manage', subtitle: 'Caregiver access — read-only' };
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
