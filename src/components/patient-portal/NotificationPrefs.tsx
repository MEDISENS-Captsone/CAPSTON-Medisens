import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { SkeletonText } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchPreferences, updatePreferences } from '../../features/patient-portal/api';
import { useT } from '../../lib/i18n/patientPortal';

interface NotificationPrefsProps {
    accountId: string;
    onBack: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; smsReminders: boolean }
    | { status: 'unavailable' };

/** Notifications (§9.5) -- the one supported preference is the SMS
 * follow-up reminder, honoured by the existing send-followup-reminders
 * function. No new channel, no in-app notification inbox (§16.2). A
 * caregiver-only account with no patient_account_preferences row
 * (§5.2.1) sees this as "unavailable", never a broken toggle. */
export function NotificationPrefs({ accountId, onBack }: NotificationPrefsProps) {
    const { t } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const prefs = await fetchPreferences(accountId);
            if (!prefs) {
                setState({ status: 'unavailable' });
                return;
            }
            setState({ status: 'ready', smsReminders: prefs.smsReminders });
        } catch {
            setState({ status: 'error' });
        }
    }, [accountId]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleToggle = async () => {
        if (state.status !== 'ready' || saving) return;
        const next = !state.smsReminders;
        setSaving(true);
        setSaveError(null);
        setState({ status: 'ready', smsReminders: next });
        try {
            await updatePreferences(accountId, { smsReminders: next });
        } catch {
            setState({ status: 'ready', smsReminders: !next });
            setSaveError(t('notifications.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>{t('more.back')}</span>
            </button>

            <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">{t('notifications.title')}</h2>

                {state.status === 'loading' && <SkeletonText lines={2} className="mt-3" />}
                {state.status === 'error' && (
                    <div className="mt-3">
                        <SectionError onRetry={() => void load()} message={t('notifications.loadError')} />
                    </div>
                )}
                {state.status === 'unavailable' && (
                    <p className="mt-3 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                        {t('notifications.unavailable')}
                    </p>
                )}
                {state.status === 'ready' && (
                    <div className="mt-3">
                        <label className="flex min-h-[44px] items-center justify-between gap-3">
                            <span className="text-[var(--text)]">{t('notifications.smsReminders')}</span>
                            <input
                                type="checkbox"
                                checked={state.smsReminders}
                                onChange={() => void handleToggle()}
                                disabled={saving}
                                className="h-6 w-11 shrink-0 cursor-pointer accent-[var(--brand-active)]"
                                aria-label={t('notifications.smsReminders')}
                            />
                        </label>
                        <p className="mt-1 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                            {t('notifications.smsRemindersDescription')}
                        </p>
                        {saveError && <p role="alert" className="mt-2 text-[length:var(--type-caption-size)] text-[var(--coral)]">{saveError}</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
