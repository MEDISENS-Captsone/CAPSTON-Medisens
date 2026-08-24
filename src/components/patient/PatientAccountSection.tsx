import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SkeletonText } from '../ui/Skeleton';
import { logError } from '../../lib/utils/errors';
import { canSeePatientAccountSection } from '../../lib/auth/patientAccountRoles';
import { fetchPatientAccountAccess, type PatientAccountAccessInfo, type PatientAccountAccessRow } from '../../features/patient-account/staffReads';
import type { Role } from '../../types/user';

interface PatientAccountSectionProps {
    patientId: string | number;
    staffRole: Role;
    sectionClassName: string;
    headerClassName: string;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; data: PatientAccountAccessInfo };

const RELATIONSHIP_LABEL: Record<PatientAccountAccessRow['relationship'], string> = {
    SELF: 'Patient',
    GUARDIAN: 'Guardian',
    AUTHORIZED_CAREGIVER: 'Authorized caregiver',
};

const SCOPE_LABEL: Record<PatientAccountAccessRow['scope'], string> = {
    FULL: 'Full access',
    STANDARD: 'Standard access',
};

function accountStatusNote(status: PatientAccountAccessRow['holderStatus']): string | null {
    if (status === 'disabled') return 'This account has been disabled.';
    if (status === 'locked') return 'This account is temporarily locked.';
    return null;
}

/** Patient Account (§17 Phase 9B Step 3) -- read-only. Visible only to
 * the same staff roles the activation Edge Functions already authorize
 * server-side (STAFF_ISSUING_ROLES / the Phase 2 RLS policies) --
 * canSeePatientAccountSection() gates this before any query runs, but
 * the real boundary is RLS: a role outside that set gets zero rows back
 * regardless. No activation/revoke/print action exists yet -- Step 4. */
export function PatientAccountSection({ patientId, staffRole, sectionClassName, headerClassName }: PatientAccountSectionProps) {
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const data = await fetchPatientAccountAccess(patientId);
            setState({ status: 'ready', data });
        } catch (err) {
            logError('Failed to load Patient Account information', err);
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!canSeePatientAccountSection(staffRole)) return null;

    return (
        <div className={sectionClassName}>
            <div className={headerClassName}>Patient Account</div>
            <div className="patient-chart-section-body">
                {state.status === 'loading' && <SkeletonText lines={2} />}

                {state.status === 'error' && (
                    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5">
                        <p className="text-sm text-[var(--text-secondary)]">Couldn't load Patient Account information.</p>
                        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
                    </div>
                )}

                {state.status === 'ready' && !state.data.selfAccount && (
                    <div>
                        <Badge tone="slate">Not activated</Badge>
                        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">This patient does not have Patient Portal access yet.</p>
                    </div>
                )}

                {state.status === 'ready' && state.data.selfAccount && (
                    <div>
                        <Badge tone={state.data.selfAccount.holderStatus === 'active' ? 'green' : 'amber'}>
                            {state.data.selfAccount.holderStatus === 'active' ? 'Active' : 'Unavailable'}
                        </Badge>

                        <div className="mt-2">
                            <p className="font-semibold text-[var(--text)]">{state.data.selfAccount.holderName}</p>
                            <p className="text-sm text-[var(--text-secondary)]">
                                {RELATIONSHIP_LABEL.SELF} · {SCOPE_LABEL[state.data.selfAccount.scope]}
                            </p>
                            <p className="mt-0.5 text-sm text-[var(--text-muted)]">MediSens ID: {state.data.selfAccount.holderMedisensId}</p>
                            {accountStatusNote(state.data.selfAccount.holderStatus) && (
                                <p className="mt-1 text-sm text-[var(--amber-text)]">{accountStatusNote(state.data.selfAccount.holderStatus)}</p>
                            )}
                        </div>

                        {state.data.otherAccess.length > 0 && (
                            <div className="mt-4 border-t border-[var(--border-soft)] pt-3">
                                <p className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">People with access</p>
                                <ul className="space-y-2.5">
                                    {state.data.otherAccess.map((row) => (
                                        <li key={`${row.holderMedisensId}-${row.relationship}`}>
                                            <p className="font-medium text-[var(--text)]">{row.holderName}</p>
                                            <p className="text-sm text-[var(--text-secondary)]">
                                                {RELATIONSHIP_LABEL[row.relationship]} · {SCOPE_LABEL[row.scope]}
                                            </p>
                                            {accountStatusNote(row.holderStatus) && (
                                                <p className="text-sm text-[var(--amber-text)]">{accountStatusNote(row.holderStatus)}</p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
