import { EmptyState } from '../ui/EmptyState';
import { Icon, type IconName } from '../shared/Icon';
import type { PatientAccountSummary } from '../../lib/auth/patientPortal';

interface PlaceholderSectionProps {
    icon: IconName;
    title: string;
    description: string;
}

/** Phase 4 placeholder for Home / My Health / Medicines / Lab Results.
 * No clinical data is fetched or rendered here -- that begins in later
 * phases (Home in Phase 6, Medicines/Lab Results in Phase 7, etc.). */
export function PlaceholderSection({ icon, title, description }: PlaceholderSectionProps) {
    return (
        <EmptyState
            icon={<Icon name={icon} className="h-5 w-5" />}
            title={title}
            description={description}
        />
    );
}

interface MoreRowProps {
    icon: IconName;
    label: string;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
}

function MoreRow({ icon, label, onClick, danger, disabled }: MoreRowProps) {
    return (
        <button
            type="button"
            className={`portal-more-row${danger ? ' is-danger' : ''}`}
            onClick={onClick}
            disabled={disabled}
            aria-disabled={disabled || undefined}
        >
            <Icon name={icon} className="h-5 w-5 shrink-0" />
            <span className="flex-1 font-medium">{label}</span>
            {disabled ? (
                <span className="shrink-0 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">Coming soon</span>
            ) : (
                <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            )}
        </button>
    );
}

interface MoreSectionProps {
    account: PatientAccountSummary;
    textSize: 'comfortable' | 'large';
    onToggleTextSize: () => void;
    onSignOut: () => void;
}

/** The More menu (§9.5). Text size and Sign out are real, working
 * account/UI-level controls; everything else is a labelled placeholder
 * until its own phase lands. */
export function MoreSection({ account, textSize, onToggleTextSize, onSignOut }: MoreSectionProps) {
    return (
        <div>
            <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">Signed in as</p>
                <p className="mt-0.5 text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">{account.displayName}</p>
                <p className="mt-0.5 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">MediSens ID: {account.medisensId}</p>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                <MoreRow icon="user" label="My Profile" disabled />
                <MoreRow icon="users" label="Caregiver / Guardian Access" disabled />
                <MoreRow icon="lock" label="Privacy & Security" disabled />
                <MoreRow icon="inbox" label="Notifications" disabled />
                <MoreRow
                    icon="smile"
                    label={textSize === 'large' ? 'Text size: Larger text' : 'Text size: Comfortable'}
                    onClick={onToggleTextSize}
                />
                <MoreRow icon="clipboard" label="Help & Support" disabled />
            </div>

            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                <MoreRow icon="logout" label="Sign out" onClick={onSignOut} danger />
            </div>
        </div>
    );
}
