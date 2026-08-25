import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import { SkeletonText } from '../ui/Skeleton';
import { logError } from '../../lib/utils/errors';
import { canSeePatientAccountSection } from '../../lib/auth/patientAccountRoles';
import {
    fetchPatientAccountAccess,
    type PatientAccountAccessInfo,
    type PatientAccountAccessRow,
    type PatientAccountOnboardingState,
    type PendingActivation,
} from '../../features/patient-account/staffReads';
import { ActivatePatientAccountModal } from './ActivatePatientAccountModal';
import { PrintPatientCardModal } from './PrintPatientCardModal';
import type { Role } from '../../types/user';

interface PatientAccountSectionProps {
    patientId: string | number;
    patientName: string;
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

const STATE_BADGE: Record<PatientAccountOnboardingState, { label: string; tone: BadgeTone }> = {
    active: { label: 'Active', tone: 'green' },
    setup_pending: { label: 'Setup pending', tone: 'amber' },
    unavailable: { label: 'Unavailable', tone: 'amber' },
};

function formatExpiry(expiresAt: string): string {
    return new Date(expiresAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function PendingActivationNote({ pending }: { pending: PendingActivation }) {
    return (
        <div>
            <Badge tone="amber">Setup pending</Badge>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                {pending.relationship === 'SELF'
                    ? 'An activation was issued and is waiting for the patient to finish setup.'
                    : `An activation was issued and is waiting for ${pending.holderName ?? 'the guardian'} to finish setup.`}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">Expires {formatExpiry(pending.expiresAt)}</p>
        </div>
    );
}

/** Patient Account (§17 Phase 9B Step 3) -- read-only. Visible only to
 * the same staff roles the activation Edge Functions already authorize
 * server-side (STAFF_ISSUING_ROLES / the Phase 2 RLS policies) --
 * canSeePatientAccountSection() gates this before any query runs, but
 * the real boundary is RLS: a role outside that set gets zero rows back
 * regardless. No activation/revoke/print action exists yet -- Step 4. */
export function PatientAccountSection({ patientId, patientName, staffRole, sectionClassName, headerClassName }: PatientAccountSectionProps) {
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [showActivateModal, setShowActivateModal] = useState(false);
    const [printCardFor, setPrintCardFor] = useState<{ holderName: string; medisensId: string } | null>(null);

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
            <div className="flex items-center justify-between gap-2">
                <div className={headerClassName} style={{ marginBottom: 0 }}>Patient Account</div>
                {state.status === 'ready' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowActivateModal(true)}>
                        {state.data.selfAccount || state.data.pendingSelf ? 'Manage access' : 'Activate Patient Account'}
                    </Button>
                )}
            </div>
            <div className="patient-chart-section-body">
                {state.status === 'loading' && <SkeletonText lines={2} />}

                {state.status === 'error' && (
                    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5">
                        <p className="text-sm text-[var(--text-secondary)]">Couldn't load Patient Account information.</p>
                        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
                    </div>
                )}

                {state.status === 'ready' && (
                    <div>
                        <p className="mb-1.5 text-sm font-semibold text-[var(--text-secondary)]">Patient's own account</p>

                        {!state.data.selfAccount && !state.data.pendingSelf && (
                            <div>
                                <Badge tone="slate">Not activated</Badge>
                                <p className="mt-1.5 text-sm text-[var(--text-secondary)]">This patient does not have Patient Portal access yet.</p>
                            </div>
                        )}

                        {!state.data.selfAccount && state.data.pendingSelf && (
                            <PendingActivationNote pending={state.data.pendingSelf} />
                        )}

                        {state.data.selfAccount && (() => {
                            const self = state.data.selfAccount;
                            return (
                                <div>
                                    <Badge tone={STATE_BADGE[self.state].tone}>{STATE_BADGE[self.state].label}</Badge>

                                    <div className="mt-2 flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-[var(--text)]">{self.holderName}</p>
                                            <p className="text-sm text-[var(--text-secondary)]">
                                                {RELATIONSHIP_LABEL.SELF} · {SCOPE_LABEL[self.scope]}
                                            </p>
                                            <p className="mt-0.5 text-sm text-[var(--text-muted)]">MediSens ID: {self.holderMedisensId}</p>
                                            {accountStatusNote(self.holderStatus) && (
                                                <p className="mt-1 text-sm text-[var(--amber-text)]">{accountStatusNote(self.holderStatus)}</p>
                                            )}
                                        </div>
                                        {self.state === 'active' && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPrintCardFor({ holderName: self.holderName, medisensId: self.holderMedisensId })}
                                            >
                                                Print Patient Card
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {state.status === 'ready' && (state.data.otherAccess.length > 0 || state.data.pendingGuardians.length > 0) && (
                    <div className={state.data.selfAccount || state.data.pendingSelf ? 'mt-4 border-t border-[var(--border-soft)] pt-3' : ''}>
                        <p className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">People with access</p>
                        <ul className="space-y-2.5">
                            {state.data.otherAccess.map((row) => (
                                <li key={`${row.holderMedisensId}-${row.relationship}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-[var(--text)]">{row.holderName}</p>
                                                {row.state !== 'active' && (
                                                    <Badge tone={STATE_BADGE[row.state].tone}>{STATE_BADGE[row.state].label}</Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-[var(--text-secondary)]">
                                                {RELATIONSHIP_LABEL[row.relationship]} · {SCOPE_LABEL[row.scope]}
                                            </p>
                                            {row.state === 'setup_pending' ? (
                                                <p className="text-sm text-[var(--text-muted)]">Waiting for the account holder to finish setup.</p>
                                            ) : (
                                                accountStatusNote(row.holderStatus) && (
                                                    <p className="text-sm text-[var(--amber-text)]">{accountStatusNote(row.holderStatus)}</p>
                                                )
                                            )}
                                        </div>
                                        {row.state === 'active' && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setPrintCardFor({ holderName: row.holderName, medisensId: row.holderMedisensId })}
                                            >
                                                Print card
                                            </Button>
                                        )}
                                    </div>
                                </li>
                            ))}
                            {state.data.pendingGuardians.map((pending) => (
                                <li key={`pending-guardian-${pending.expiresAt}`}>
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-[var(--text)]">{pending.holderName ?? 'Guardian'}</p>
                                        <Badge tone="amber">Setup pending</Badge>
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)]">{RELATIONSHIP_LABEL.GUARDIAN}</p>
                                    <p className="text-sm text-[var(--text-muted)]">Expires {formatExpiry(pending.expiresAt)}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {showActivateModal && (
                <ActivatePatientAccountModal
                    patientId={patientId}
                    patientName={patientName}
                    hasSelfAccount={state.status === 'ready' && !!state.data.selfAccount}
                    pendingSelf={state.status === 'ready' ? state.data.pendingSelf : null}
                    pendingGuardian={state.status === 'ready' ? (state.data.pendingGuardians[0] ?? null) : null}
                    onClose={() => setShowActivateModal(false)}
                    onChanged={() => void load()}
                />
            )}

            {printCardFor && (
                <PrintPatientCardModal
                    holderName={printCardFor.holderName}
                    medisensId={printCardFor.medisensId}
                    onClose={() => setPrintCardFor(null)}
                />
            )}
        </div>
    );
}
