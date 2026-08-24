import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { SkeletonText } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { fetchProfile, type PortalProfile } from '../../features/patient-portal/api';
import { formatLongDate } from '../../features/patient-portal/format';

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
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message="We could not load this profile right now." />;

    const { profile } = state;
    const fullName = [profile.firstName, profile.middleName, profile.lastName, profile.suffix].filter(Boolean).join(' ');

    return (
        <div className="space-y-4">
            <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <h2 className="mb-1 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Ask the RHU to correct these</h2>
                <p className="mb-3 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                    These details are kept by the Rural Health Unit. If something is wrong, request a correction below.
                </p>
                <dl>
                    <Row label="Name" value={fullName || null} />
                    <Row label="Birthdate" value={formatLongDate(profile.birthday)} />
                    <Row label="Age" value={profile.age !== null ? String(profile.age) : null} />
                    <Row label="Sex" value={profile.sex} />
                    <Row label="Civil status" value={profile.civilStatus} />
                    <Row label="Address" value={profile.address} />
                    <Row label="Contact number" value={profile.contactNumber} />
                    <Row label="PhilHealth number" value={profile.philhealthNo} />
                    <Row label="PhilHealth status" value={profile.philhealthStatus} />
                </dl>
                {canRequestCorrection ? (
                    <Button variant="outline" className="mt-4 w-full" onClick={onRequestCorrection}>Request a correction</Button>
                ) : (
                    <p className="mt-4 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                        Only the patient or their guardian can request a correction to this record.
                    </p>
                )}
            </section>

            {profile.bloodType && (
                <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                    <h2 className="mb-1 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Recorded by the RHU</h2>
                    <dl>
                        <Row label="Blood type" value={profile.bloodType} />
                    </dl>
                    <p className="mt-3 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">This information is kept by the Rural Health Unit.</p>
                </section>
            )}
        </div>
    );
}
