import { useState } from 'react';
import { MoreRow } from './PortalSection';
import { ProfileView } from './ProfileView';
import { CorrectionRequestForm } from './CorrectionRequestForm';
import { AccessList } from './AccessList';
import { PrivacySecurity } from './PrivacySecurity';
import { NotificationPrefs } from './NotificationPrefs';
import { DisplayPrefs } from './DisplayPrefs';
import { HelpSupport } from './HelpSupport';
import { Icon } from '../shared/Icon';
import type { PatientAccountSummary, PatientGrantSummary } from '../../lib/auth/patientPortal';

type MoreView = 'menu' | 'profile' | 'correction' | 'access' | 'privacy' | 'notifications' | 'display' | 'help';

interface MoreMenuProps {
    account: PatientAccountSummary;
    activeGrant: PatientGrantSummary;
    textSize: 'comfortable' | 'large';
    onToggleTextSize: () => void;
    highContrast: boolean;
    onToggleHighContrast: () => void;
    onSignOut: () => void;
}

/** More (§9.5) -- a simple patient account area, not an admin settings
 * console. Every row here is either account-level (applies regardless of
 * which health record is currently in view -- PIN, notifications, text
 * size) or explicitly scoped to the record in view (Profile, correction
 * requests, access management) and gated by that record's relationship,
 * mirroring what the underlying RPCs themselves permit. */
export function MoreMenu({ account, activeGrant, textSize, onToggleTextSize, highContrast, onToggleHighContrast, onSignOut }: MoreMenuProps) {
    const [view, setView] = useState<MoreView>('menu');

    const isSelf = activeGrant.relationship === 'SELF';
    const canRequestCorrection = activeGrant.relationship !== 'AUTHORIZED_CAREGIVER';

    if (view === 'profile') {
        return (
            <div>
                <BackLink onClick={() => setView('menu')} label="Back to More" />
                <div className="mt-4">
                    <ProfileView
                        patientId={activeGrant.patientId}
                        canRequestCorrection={canRequestCorrection}
                        onRequestCorrection={() => setView('correction')}
                    />
                </div>
            </div>
        );
    }

    if (view === 'correction') {
        return <CorrectionRequestForm patientId={activeGrant.patientId} accountId={account.id} onBack={() => setView('profile')} />;
    }

    if (view === 'access') {
        return (
            <div>
                <BackLink onClick={() => setView('menu')} label="Back to More" />
                <div className="mt-4">
                    <AccessList patientId={activeGrant.patientId} />
                </div>
            </div>
        );
    }

    if (view === 'privacy') {
        return <PrivacySecurity patientId={activeGrant.patientId} isSelf={isSelf} onBack={() => setView('menu')} />;
    }

    if (view === 'notifications') {
        return <NotificationPrefs accountId={account.id} onBack={() => setView('menu')} />;
    }

    if (view === 'display') {
        return (
            <DisplayPrefs
                textSize={textSize}
                onToggleTextSize={onToggleTextSize}
                highContrast={highContrast}
                onToggleHighContrast={onToggleHighContrast}
                onBack={() => setView('menu')}
            />
        );
    }

    if (view === 'help') {
        return <HelpSupport onBack={() => setView('menu')} />;
    }

    return (
        <div>
            <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">Signed in as</p>
                <p className="mt-0.5 text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">{account.displayName}</p>
                <p className="mt-0.5 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">MediSens ID: {account.medisensId}</p>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                <MoreRow icon="user" label="My Profile" onClick={() => setView('profile')} />
                {isSelf && <MoreRow icon="users" label="Caregiver / Guardian Access" onClick={() => setView('access')} />}
                <MoreRow icon="lock" label="Privacy & Security" onClick={() => setView('privacy')} />
                <MoreRow icon="inbox" label="Notifications" onClick={() => setView('notifications')} />
                <MoreRow
                    icon="smile"
                    label={textSize === 'large' ? 'Text size: Larger Text' : 'Text size: Comfortable'}
                    onClick={() => setView('display')}
                />
                <MoreRow icon="clipboard" label="Help & Support" onClick={() => setView('help')} />
            </div>

            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                <MoreRow icon="logout" label="Sign out" onClick={onSignOut} danger />
            </div>
        </div>
    );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button type="button" onClick={onClick} className="portal-back-link">
            <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
            <span>{label}</span>
        </button>
    );
}
