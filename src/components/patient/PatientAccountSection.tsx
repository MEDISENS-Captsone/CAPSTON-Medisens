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

// Shared compact-card shell for both the patient's own account block and
// each "People with access" row -- visual grouping only, no state logic.
const ACCOUNT_CARD_CLASS =
    'rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3';

function PendingActivationNote({ pending }: { pending: PendingActivation }) {
    return (
        <div>
            <p className="text-sm font-semibold text-[var(--text)]">Activation issued</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {pending.relationship === 'SELF'
                    ? 'Waiting for the patient to finish setup.'
                    : `Waiting for ${pending.holderName ?? 'the guardian'} to finish setup.`}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">Expires {formatExpiry(pending.expiresAt)}</p>
        </div>
    );
}

/** Patient Account (§17 Phase 9B Steps 3-5, visual refinement pass) --
 * read-only account summary plus the Step 4/5 activation and printing
 * actions. Visible only to the same staff roles the activation Edge
 * Functions already authorize server-side (STAFF_ISSUING_ROLES / the
 * Phase 2 RLS policies) -- canSeePatientAccountSection() gates this
 * before any query runs, but the real boundary is RLS: a role outside
 * that set gets zero rows back regardless. This pass changes layout and
 * copy only -- state derivation, action visibility, and every Edge
 * Function/RPC call below are unchanged from Steps 3-5. */
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

    const hasOtherAccess = state.status === 'ready' && (state.data.otherAccess.length > 0 || state.data.pendingGuardians.length > 0);

    return (
        <div className={sectionClassName}>
            <div className={headerClassName}>
                <span>Patient Account</span>
                {state.status === 'ready' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowActivateModal(true)}>
                        {state.data.selfAccount || state.data.pendingSelf ? 'Manage access' : 'Activate account'}
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
                    <div className="max-w-xl">
                        <p className="mb-3 text-sm text-[var(--text-secondary)]">Manage Patient Portal access for this patient.</p>

                        <div className={ACCOUNT_CARD_CLASS}>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-[var(--text-secondary)]">Patient's own account</p>
                                {!state.data.selfAccount && !state.data.pendingSelf && <Badge tone="slate">Not activated</Badge>}
                                {!state.data.selfAccount && state.data.pendingSelf && <Badge tone="amber">Setup pending</Badge>}
                                {state.data.selfAccount && (
                                    <Badge tone={STATE_BADGE[state.data.selfAccount.state].tone}>{STATE_BADGE[state.data.selfAccount.state].label}</Badge>
                                )}
                            </div>

                            {!state.data.selfAccount && !state.data.pendingSelf && (
                                <p className="text-sm text-[var(--text-secondary)]">This patient has not set up their Patient Portal account.</p>
                            )}

                            {!state.data.selfAccount && state.data.pendingSelf && (
                                <PendingActivationNote pending={state.data.pendingSelf} />
                            )}

                            {state.data.selfAccount && (() => {
                                const self = state.data.selfAccount;
                                return (
                                    <div>
                                        <p className="font-semibold leading-snug text-[var(--text)] [overflow-wrap:anywhere]">{self.holderName}</p>
                                        <p className="mt-0.5 font-mono text-sm text-[var(--text-muted)]">{self.holderMedisensId}</p>
                                        {/* No "Patient ·" prefix here -- the card is already labelled
                                            "Patient's own account" above, so repeating the relationship
                                            would be redundant (task: "Do not repeat the patient's name
                                            unnecessarily" applies the same way to the relationship label). */}
                                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{SCOPE_LABEL[self.scope]}</p>
                                        {accountStatusNote(self.holderStatus) && (
                                            <p className="mt-1 text-sm text-[var(--amber-text)]">{accountStatusNote(self.holderStatus)}</p>
                                        )}
                                        {self.state === 'active' && (
                                            <div className="mt-3 border-t border-[var(--border-soft)] pt-2.5">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full sm:w-auto"
                                                    onClick={() => setPrintCardFor({ holderName: self.holderName, medisensId: self.holderMedisensId })}
                                                >
                                                    Print Patient Card
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {hasOtherAccess && (
                            <div className="mt-4">
                                <p className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">People with access</p>
                                <ul className="space-y-2">
                                    {state.data.otherAccess.map((row) => (
                                        <li key={`${row.holderMedisensId}-${row.relationship}`} className={ACCOUNT_CARD_CLASS}>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-medium leading-snug text-[var(--text)] [overflow-wrap:anywhere]">{row.holderName}</p>
                                                {row.state !== 'active' && (
                                                    <Badge tone={STATE_BADGE[row.state].tone}>{STATE_BADGE[row.state].label}</Badge>
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                                                {RELATIONSHIP_LABEL[row.relationship]} · {SCOPE_LABEL[row.scope]}
                                            </p>
                                            {row.state === 'setup_pending' ? (
                                                <p className="mt-0.5 text-sm text-[var(--text-muted)]">Waiting for account setup.</p>
                                            ) : (
                                                <>
                                                    <p className="mt-0.5 font-mono text-sm text-[var(--text-muted)]">{row.holderMedisensId}</p>
                                                    {accountStatusNote(row.holderStatus) && (
                                                        <p className="mt-1 text-sm text-[var(--amber-text)]">{accountStatusNote(row.holderStatus)}</p>
                                                    )}
                                                </>
                                            )}
                                            {row.state === 'active' && (
                                                <div className="mt-2.5 border-t border-[var(--border-soft)] pt-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="w-full sm:w-auto"
                                                        onClick={() => setPrintCardFor({ holderName: row.holderName, medisensId: row.holderMedisensId })}
                                                    >
                                                        Print card
                                                    </Button>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                    {state.data.pendingGuardians.map((pending) => (
                                        <li key={`pending-guardian-${pending.expiresAt}`} className={ACCOUNT_CARD_CLASS}>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-medium leading-snug text-[var(--text)] [overflow-wrap:anywhere]">{pending.holderName ?? 'Guardian'}</p>
                                                <Badge tone="amber">Setup pending</Badge>
                                            </div>
                                            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{RELATIONSHIP_LABEL.GUARDIAN}</p>
                                            <p className="mt-0.5 text-sm text-[var(--text-muted)]">Expires {formatExpiry(pending.expiresAt)}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
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
