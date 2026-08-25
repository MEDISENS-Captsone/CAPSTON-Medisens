import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { SkeletonText } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { fetchProfile, type PortalProfile } from '../../features/patient-portal/api';
import { formatLongDate } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface ProfileViewProps {
    patientId: number;
    canRequestCorrection: boolean;
    onRequestCorrection: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; profile: PortalProfile };

function Row({ label, value }: { label: string; value: string | null }) {
    if (!value) return null;
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--border-soft)] py-2.5 last:border-b-0">
            <dt className="text-[var(--text-secondary)]">{label}</dt>
            <dd className="text-right font-medium text-[var(--text)]">{value}</dd>
        </div>
    );
}

/** My Profile (§9.5) -- read-only. Master demographic data is never
 * directly editable here; the only patient-facing write path is a
 * correction *request* (a separate screen), and even that is refused
 * server-side for an AUTHORIZED_CAREGIVER session regardless of what this
 * component shows. */
export function ProfileView({ patientId, canRequestCorrection, onRequestCorrection }: ProfileViewProps) {
    const { t, language } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const profile = await fetchProfile(patientId);
            setState({ status: 'ready', profile });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (state.status === 'loading') return <SkeletonText lines={6} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('profile.loadError')} />;

    const { profile } = state;
    const fullName = [profile.firstName, profile.middleName, profile.lastName, profile.suffix].filter(Boolean).join(' ');

    return (
        <div className="space-y-4">
            <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <h2 className="mb-1 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('profile.askRhuToCorrect')}</h2>
                <p className="mb-3 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                    {t('profile.keptByRhu')}
                </p>
                <dl>
                    <Row label={t('profile.name')} value={fullName || null} />
                    <Row label={t('profile.birthdate')} value={formatLongDate(profile.birthday, language)} />
                    <Row label={t('profile.age')} value={profile.age !== null ? String(profile.age) : null} />
                    <Row label={t('profile.sex')} value={profile.sex} />
                    <Row label={t('profile.civilStatus')} value={profile.civilStatus} />
                    <Row label={t('profile.address')} value={profile.address} />
                    <Row label={t('profile.contactNumber')} value={profile.contactNumber} />
                    <Row label={t('profile.philhealthNo')} value={profile.philhealthNo} />
                    <Row label={t('profile.philhealthStatus')} value={profile.philhealthStatus} />
                </dl>
                {canRequestCorrection ? (
                    <Button variant="outline" className="mt-4 w-full" onClick={onRequestCorrection}>{t('profile.requestCorrection')}</Button>
                ) : (
                    <p className="mt-4 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                        {t('profile.onlyPatientOrGuardian')}
                    </p>
                )}
            </section>

            {profile.bloodType && (
                <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                    <h2 className="mb-1 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('profile.recordedByRhu')}</h2>
                    <dl>
                        <Row label={t('profile.bloodType')} value={profile.bloodType} />
                    </dl>
                    <p className="mt-3 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{t('profile.keptByRhuShort')}</p>
                </section>
            )}
        </div>
    );
}
