import { useState } from 'react';
import { MoreRow } from './PortalSection';
import { ProfileView } from './ProfileView';
import { CorrectionRequestForm } from './CorrectionRequestForm';
import { AccessList } from './AccessList';
import { PrivacySecurity } from './PrivacySecurity';
import { NotificationPrefs } from './NotificationPrefs';
import { DisplayPrefs } from './DisplayPrefs';
import { LanguagePrefs } from './LanguagePrefs';
import { HelpSupport } from './HelpSupport';
import { SignOutConfirm } from './SignOutConfirm';
import { Icon } from '../shared/Icon';
import { useT, type PatientLanguage } from '../../lib/i18n/patientPortal';
import type { PatientAccountSummary, PatientGrantSummary } from '../../lib/auth/patientPortal';

type MoreView = 'menu' | 'profile' | 'correction' | 'access' | 'privacy' | 'notifications' | 'display' | 'language' | 'help';

interface MoreMenuProps {
    account: PatientAccountSummary;
    activeGrant: PatientGrantSummary;
    textSize: 'comfortable' | 'large';
    onToggleTextSize: () => void;
    highContrast: boolean;
    onToggleHighContrast: () => void;
    language: PatientLanguage;
    onSelectLanguage: (language: PatientLanguage) => void;
    onSignOut: () => void;
}

/** More (§9.5) -- a simple patient account area, not an admin settings
 * console. Every row here is either account-level (applies regardless of
 * which health record is currently in view -- PIN, notifications, text
 * size, language) or explicitly scoped to the record in view (Profile,
 * correction requests, access management) and gated by that record's
 * relationship, mirroring what the underlying RPCs themselves permit. */
export function MoreMenu({ account, activeGrant, textSize, onToggleTextSize, highContrast, onToggleHighContrast, language, onSelectLanguage, onSignOut }: MoreMenuProps) {
    const { t } = useT();
    const [view, setView] = useState<MoreView>('menu');
    const [confirmingSignOut, setConfirmingSignOut] = useState(false);

    const isSelf = activeGrant.relationship === 'SELF';
    const canRequestCorrection = activeGrant.relationship !== 'AUTHORIZED_CAREGIVER';

    if (view === 'profile') {
        return (
            <div className="portal-subpage">
                <BackLink onClick={() => setView('menu')} label={t('more.backToMore')} />
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
        return (
            <div className="portal-subpage">
                <CorrectionRequestForm patientId={activeGrant.patientId} accountId={account.id} onBack={() => setView('profile')} />
            </div>
        );
    }

    if (view === 'access') {
        return (
            <div className="portal-subpage">
                <BackLink onClick={() => setView('menu')} label={t('more.backToMore')} />
                <div className="mt-4">
                    <AccessList patientId={activeGrant.patientId} />
                </div>
            </div>
        );
    }

    if (view === 'privacy') {
        return (
            <div className="portal-subpage">
                <PrivacySecurity patientId={activeGrant.patientId} isSelf={isSelf} onBack={() => setView('menu')} />
            </div>
        );
    }

    if (view === 'notifications') {
        return (
            <div className="portal-subpage">
                <NotificationPrefs accountId={account.id} onBack={() => setView('menu')} />
            </div>
        );
    }

    if (view === 'display') {
        return (
            <div className="portal-subpage">
                <DisplayPrefs
                    textSize={textSize}
                    onToggleTextSize={onToggleTextSize}
                    highContrast={highContrast}
                    onToggleHighContrast={onToggleHighContrast}
                    onBack={() => setView('menu')}
                />
            </div>
        );
    }

    if (view === 'language') {
        return (
            <div className="portal-subpage">
                <LanguagePrefs
                    language={language}
                    onSelectLanguage={onSelectLanguage}
                    onBack={() => setView('menu')}
                />
            </div>
        );
    }

    if (view === 'help') {
        return (
            <div className="portal-subpage">
                <HelpSupport onBack={() => setView('menu')} />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">{t('more.signedInAs')}</p>
                <p className="mt-0.5 text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">{account.displayName}</p>
                <p className="mt-0.5 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{t('more.medisensId')}: {account.medisensId}</p>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                <MoreRow icon="user" label={t('more.myProfile')} onClick={() => setView('profile')} />
                {isSelf && <MoreRow icon="users" label={t('more.caregiverAccess')} onClick={() => setView('access')} />}
                <MoreRow icon="lock" label={t('more.privacySecurity')} onClick={() => setView('privacy')} />
                <MoreRow icon="inbox" label={t('more.notifications')} onClick={() => setView('notifications')} />
                <MoreRow
                    icon="smile"
                    label={textSize === 'large' ? t('more.textSizeLarge') : t('more.textSizeComfortable')}
                    onClick={() => setView('display')}
                />
                <MoreRow icon="globe" label={t('more.language')} onClick={() => setView('language')} />
                <MoreRow icon="clipboard" label={t('more.helpSupport')} onClick={() => setView('help')} />
            </div>

            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                <MoreRow icon="logout" label={t('more.signOut')} onClick={() => setConfirmingSignOut(true)} danger />
            </div>

            {confirmingSignOut && (
                <SignOutConfirm
                    onCancel={() => setConfirmingSignOut(false)}
                    onConfirm={() => {
                        setConfirmingSignOut(false);
                        onSignOut();
                    }}
                />
            )}
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
