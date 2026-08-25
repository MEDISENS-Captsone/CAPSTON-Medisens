import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Icon } from '../shared/Icon';
import { supabase } from '../../lib/supabase/client';
import { isValidMedisensId, normalizeMedisensId } from '../../lib/utils/qr';
import { lookupPatientAccountByMedisensId, type PatientAccountLookupResult, type PendingActivation } from '../../features/patient-account/staffReads';
import { printActivationSlip } from '../../features/patient-account/printing';
import { logError } from '../../lib/utils/errors';

const TITLE_ID = 'activate-patient-account-dialog-title';

interface ActivatePatientAccountModalProps {
    patientId: string | number;
    patientName: string;
    /** Whether this patient already has an active SELF account -- when true,
     * the "The patient" option is not offered, because that account already
     * exists (task §2: "Manage access" only supports adding GUARDIAN/
     * AUTHORIZED_CAREGIVER access, never a second SELF activation). */
    hasSelfAccount: boolean;
    /** A still-valid, not-yet-completed SELF activation, if any -- gates
     * the "The patient" issue action so staff cannot silently issue a
     * duplicate code while one is already outstanding (task: duplicate
     * issuance behavior). */
    pendingSelf: PendingActivation | null;
    /** A still-valid, not-yet-completed GUARDIAN activation, if any --
     * same duplicate-issuance guard for the guardian path. Only the most
     * recent one is passed; MVP does not support tracking more than one. */
    pendingGuardian: PendingActivation | null;
    onClose: () => void;
    /** Fired after any successful activation issuance or access grant, so
     * the caller can refresh PatientAccountSection without closing the
     * Patient Detail modal (task §13). Does not close this modal itself. */
    onChanged: () => void;
}

type Relationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';

type Step =
    | { name: 'choose' }
    | { name: 'self-confirm' }
    | { name: 'guardian-choice' }
    | { name: 'guardian-new' }
    | { name: 'guardian-existing' }
    | { name: 'caregiver-choice' }
    | { name: 'caregiver-new' }
    | { name: 'caregiver-existing' }
    | {
          name: 'issued';
          code: string;
          expiresAt: string;
          relationship: Relationship;
          holderName: string;
          /** Only set for GUARDIAN/AUTHORIZED_CAREGIVER -- whose record
           * this grants access to, for the printed slip (task §2). */
          accessPatientName?: string;
      }
    | { name: 'granted'; holderName: string; relationship: 'GUARDIAN' | 'AUTHORIZED_CAREGIVER' };

const GENERIC_ERROR = "Couldn't complete this action. Please try again.";

async function invokeStaffFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No active session.');

    const { data, error } = await supabase.functions.invoke(name, {
        body,
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
        // Supabase surfaces the Edge Function's own JSON error body on
        // FunctionsHttpError#context; fall back to the generic message
        // rather than ever showing a raw Supabase/Postgres error string.
        //
        // Root cause of the Step 4 manual-test bug (every mapped backend
        // message -- Guardian eligibility, duplicate grant, etc. -- fell
        // through to GENERIC_ERROR): the mapped message was previously
        // thrown *inside* this same try block, so its own catch below
        // immediately swallowed it. `mappedMessage` is captured outside
        // the try/catch instead, so a successfully parsed backend message
        // survives to the throw at the end of this function.
        const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        let mappedMessage: string | null = null;
        if (context?.json) {
            try {
                const body = await context.json();
                if (body?.error) mappedMessage = body.error;
            } catch {
                // Response body wasn't valid JSON -- fall back to the generic message below.
            }
        }
        throw new Error(mappedMessage ?? GENERIC_ERROR);
    }
    if (!data) throw new Error(GENERIC_ERROR);
    return data as T;
}

/** Normalizes a name for a non-blocking "did you mean to type the
 * patient's name?" comparison (task §5): trims, collapses internal
 * whitespace, lowercases. Never used to reject input -- only to decide
 * whether to show a warning the staff member can dismiss by proceeding. */
function normalizeNameForComparison(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatExpiry(expiresAt: string): string {
    const hours = Math.round((new Date(expiresAt).getTime() - Date.now()) / (60 * 60 * 1000));
    const when = new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    if (hours <= 0) return `on ${when}`;
    return `in about ${hours} hours (${when})`;
}

/** Patient Account Phase 9B Step 4 -- staff entry point to start or extend
 * Patient Portal access from a patient's record (docs/patientAccount.md
 * §5.2, §5.2.1, §6.1; task spec §3-§10). Does not implement Patient Card
 * printing, QR scanning, or the patient-side activation screens -- those
 * remain out of scope for this step. */
export function ActivatePatientAccountModal({ patientId, patientName, hasSelfAccount, pendingSelf, pendingGuardian, onClose, onChanged }: ActivatePatientAccountModalProps) {
    const [step, setStep] = useState<Step>({ name: 'choose' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slipError, setSlipError] = useState<string | null>(null);

    // Guardian (new) form state
    const [guardianName, setGuardianName] = useState('');

    // Caregiver (new) form state
    const [caregiverName, setCaregiverName] = useState('');
    const [identityNote, setIdentityNote] = useState('');
    const [caregiverContact, setCaregiverContact] = useState('');
    const [caregiverConsent, setCaregiverConsent] = useState(false);

    // Existing-account reuse state (shared by guardian and caregiver paths)
    const [medisensIdInput, setMedisensIdInput] = useState('');
    const [lookup, setLookup] = useState<PatientAccountLookupResult | null>(null);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [existingConsent, setExistingConsent] = useState(false);

    const numericPatientId = typeof patientId === 'string' ? Number(patientId) : patientId;

    function reset() {
        setError(null);
        setLookup(null);
        setLookupError(null);
        setExistingConsent(false);
    }

    function goTo(next: Step) {
        reset();
        setStep(next);
    }

    async function handleSelfIssue() {
        setSubmitting(true);
        setError(null);
        try {
            const result = await invokeStaffFunction<{ code: string; expiresAt: string }>('patient-activation-issue', {
                patientId: numericPatientId,
                relationship: 'SELF',
                purpose: 'ACTIVATION',
            });
            setStep({ name: 'issued', code: result.code, expiresAt: result.expiresAt, relationship: 'SELF', holderName: patientName });
            onChanged();
        } catch (err) {
            logError('Failed to issue SELF activation', err);
            setError(err instanceof Error ? err.message : GENERIC_ERROR);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleGuardianIssue() {
        if (!guardianName.trim()) {
            setError("The guardian's full name is required.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await invokeStaffFunction<{ code: string; expiresAt: string }>('patient-activation-issue', {
                patientId: numericPatientId,
                relationship: 'GUARDIAN',
                purpose: 'ACTIVATION',
                holderName: guardianName.trim(),
            });
            setStep({
                name: 'issued',
                code: result.code,
                expiresAt: result.expiresAt,
                relationship: 'GUARDIAN',
                holderName: guardianName.trim(),
                accessPatientName: patientName,
            });
            onChanged();
        } catch (err) {
            logError('Failed to issue GUARDIAN activation', err);
            setError(err instanceof Error ? err.message : GENERIC_ERROR);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleLookup() {
        const normalized = normalizeMedisensId(medisensIdInput);
        setLookupError(null);
        if (!isValidMedisensId(normalized)) {
            setLookupError("That doesn't look like a MediSens ID. Format: MS-XXXX-XXXX.");
            return;
        }
        setSubmitting(true);
        try {
            const found = await lookupPatientAccountByMedisensId(normalized);
            if (!found) {
                setLookupError('No account found with that MediSens ID.');
                setLookup(null);
                return;
            }
            setLookup(found);
        } catch (err) {
            logError('Failed to look up MediSens account', err);
            setLookupError(GENERIC_ERROR);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleExistingGrant(relationship: 'GUARDIAN' | 'AUTHORIZED_CAREGIVER') {
        if (!lookup) return;
        if (relationship === 'AUTHORIZED_CAREGIVER' && !existingConsent) {
            setError('The patient must be present and agree before adding this caregiver.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await invokeStaffFunction('patient-access-grant', {
                medisensId: lookup.medisensId,
                patientId: numericPatientId,
                relationship,
                patientPresentConsent: relationship === 'AUTHORIZED_CAREGIVER' ? existingConsent : undefined,
            });
            setStep({ name: 'granted', holderName: lookup.displayName, relationship });
            onChanged();
        } catch (err) {
            logError('Failed to grant access to existing account', err);
            setError(err instanceof Error ? err.message : GENERIC_ERROR);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleNewCaregiverIssue() {
        if (!caregiverName.trim()) {
            setError("The caregiver's full name is required.");
            return;
        }
        if (!identityNote.trim()) {
            setError('A short note on how identity was verified is required.');
            return;
        }
        if (!caregiverConsent) {
            setError('The patient must be present and agree before adding this caregiver.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            // Sequenced live: patient-caregiver-activation-issue sets the new
            // account's status to 'active' immediately on creation (verified
            // in the deployed function source), so patient-access-grant's
            // active-account check passes right away -- no wait for the
            // caregiver to complete their own PIN setup is required before
            // the access grant itself can be created.
            const issued = await invokeStaffFunction<{ code: string; medisensId: string; expiresAt: string }>(
                'patient-caregiver-activation-issue',
                {
                    patientId: numericPatientId,
                    fullName: caregiverName.trim(),
                    identityNote: identityNote.trim(),
                    contactNumber: caregiverContact.trim() || undefined,
                },
            );
            await invokeStaffFunction('patient-access-grant', {
                medisensId: issued.medisensId,
                patientId: numericPatientId,
                relationship: 'AUTHORIZED_CAREGIVER',
                patientPresentConsent: true,
            });
            setStep({
                name: 'issued',
                code: issued.code,
                expiresAt: issued.expiresAt,
                relationship: 'AUTHORIZED_CAREGIVER',
                holderName: caregiverName.trim(),
                accessPatientName: patientName,
            });
            onChanged();
        } catch (err) {
            logError('Failed to issue new caregiver activation', err);
            setError(err instanceof Error ? err.message : GENERIC_ERROR);
        } finally {
            setSubmitting(false);
        }
    }

    function renderChoose() {
        return (
            <div className="flex flex-col gap-2">
                <p className="text-sm text-[var(--text-secondary)]">Who needs access to this health record?</p>
                {!hasSelfAccount && (
                    pendingSelf ? (
                        <div className="rounded-[var(--radius-control)] border border-[var(--amber-border)] bg-[var(--amber-surface)] p-3">
                            <p className="text-sm font-semibold text-[var(--amber-text)]">The patient's activation is already pending</p>
                            <p className="mt-1 text-sm text-[var(--amber-text)]">Expires {formatExpiry(pendingSelf.expiresAt)}. Wait for the patient to finish setup, or for it to expire, before issuing another.</p>
                        </div>
                    ) : (
                        <RelationshipOption
                            title="The patient"
                            description="The patient will use their own MediSens Patient Account."
                            onClick={() => goTo({ name: 'self-confirm' })}
                        />
                    )
                )}
                <RelationshipOption
                    title="Parent or legal guardian"
                    description="Create access for a parent or legal guardian."
                    onClick={() => goTo({ name: 'guardian-choice' })}
                />
                <RelationshipOption
                    title="Authorized caregiver"
                    description="Create or connect a caregiver account."
                    onClick={() => goTo({ name: 'caregiver-choice' })}
                />
            </div>
        );
    }

    function renderSelfConfirm() {
        return (
            <div className="flex flex-col gap-4">
                <SummaryBlock
                    rows={[
                        ['Account for', patientName],
                        ['Access to', `${patientName}'s health record`],
                        ['Access', 'Full patient access'],
                    ]}
                />
                {error && <ErrorNote message={error} />}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => goTo({ name: 'choose' })} disabled={submitting}>Back</Button>
                    <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSelfIssue()} isLoading={submitting}>Issue activation</Button>
                </div>
            </div>
        );
    }

    function renderGuardianChoice() {
        return (
            <div className="flex flex-col gap-2">
                <p className="text-sm text-[var(--text-secondary)]">Set up guardian access for {patientName}.</p>
                {pendingGuardian ? (
                    <div className="rounded-[var(--radius-control)] border border-[var(--amber-border)] bg-[var(--amber-surface)] p-3">
                        <p className="text-sm font-semibold text-[var(--amber-text)]">A guardian activation is already pending</p>
                        <p className="mt-1 text-sm text-[var(--amber-text)]">
                            {pendingGuardian.holderName ?? 'A guardian'}'s activation expires {formatExpiry(pendingGuardian.expiresAt)}. Wait for setup to finish, or for it to expire, before issuing another.
                        </p>
                    </div>
                ) : (
                    <RelationshipOption
                        title="New guardian account"
                        description="Issue an activation code for a guardian who does not have a MediSens account yet."
                        onClick={() => goTo({ name: 'guardian-new' })}
                    />
                )}
                <RelationshipOption
                    title="Already has a MediSens Patient Account"
                    description="Add guardian access to an existing account by MediSens ID."
                    onClick={() => goTo({ name: 'guardian-existing' })}
                />
                <Button type="button" variant="ghost" onClick={() => goTo({ name: 'choose' })}>Back</Button>
            </div>
        );
    }

    function renderGuardianNew() {
        const nameMatchesPatient = guardianName.trim().length > 0
            && normalizeNameForComparison(guardianName) === normalizeNameForComparison(patientName);
        return (
            <div className="flex flex-col gap-4">
                <Input
                    label="Guardian's full name"
                    hint="Enter the guardian's verified full name."
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    autoFocus
                />
                {nameMatchesPatient && (
                    <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-3 py-2 text-sm text-[var(--amber-text)]">
                        This matches the patient's name. Confirm that this is the guardian's own legal name.
                    </p>
                )}
                <SummaryBlock
                    rows={[
                        ['Account for', guardianName.trim() || '—'],
                        ['Access to', `${patientName}'s health record`],
                        ['Relationship', 'Parent / legal guardian'],
                        ['Access', 'Standard access'],
                    ]}
                />
                {error && <ErrorNote message={error} />}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => goTo({ name: 'guardian-choice' })} disabled={submitting}>Back</Button>
                    <Button type="button" className="w-full sm:w-auto" onClick={() => void handleGuardianIssue()} isLoading={submitting}>Issue activation</Button>
                </div>
            </div>
        );
    }

    function renderExistingLookup(relationship: 'GUARDIAN' | 'AUTHORIZED_CAREGIVER', backStep: Step) {
        const relationshipLabel = relationship === 'GUARDIAN' ? 'Parent / legal guardian' : 'Authorized caregiver';
        return (
            <div className="flex flex-col gap-4">
                <Input
                    label="MediSens ID"
                    placeholder="MS-AB23-CD45"
                    value={medisensIdInput}
                    onChange={(e) => setMedisensIdInput(e.target.value)}
                    error={lookupError ?? undefined}
                    autoFocus
                />
                <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleLookup()} isLoading={submitting && !lookup}>Look up</Button>
                </div>

                {lookup && (
                    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <div>
                            <p className="text-sm font-semibold text-[var(--text-secondary)]">Account found</p>
                            <p className="font-semibold text-[var(--text)]">{lookup.displayName}</p>
                            <p className="text-sm text-[var(--text-muted)]">{lookup.medisensId}</p>
                            {lookup.status !== 'active' && (
                                <p className="mt-1 text-sm text-[var(--coral)]">
                                    This account is {lookup.status === 'locked' ? 'temporarily locked' : 'disabled'} and cannot receive new access right now.
                                </p>
                            )}
                        </div>
                        <SummaryBlock
                            rows={[
                                ['Account for', lookup.displayName],
                                ['Access to', `${patientName}'s health record`],
                                ['Relationship', relationshipLabel],
                            ]}
                        />
                        {relationship === 'AUTHORIZED_CAREGIVER' && (
                            <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                                <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={existingConsent}
                                    onChange={(e) => setExistingConsent(e.target.checked)}
                                />
                                <span>The patient is present and agrees to give this caregiver access.</span>
                            </label>
                        )}
                    </div>
                )}

                {error && <ErrorNote message={error} />}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => goTo(backStep)} disabled={submitting}>Back</Button>
                    <Button
                        type="button"
                        className="w-full sm:w-auto"
                        onClick={() => void handleExistingGrant(relationship)}
                        isLoading={submitting && !!lookup}
                        disabled={!lookup || lookup.status !== 'active' || (relationship === 'AUTHORIZED_CAREGIVER' && !existingConsent)}
                    >
                        Add access
                    </Button>
                </div>
            </div>
        );
    }

    function renderCaregiverChoice() {
        return (
            <div className="flex flex-col gap-2">
                <p className="text-sm text-[var(--text-secondary)]">Set up caregiver access for {patientName}.</p>
                <RelationshipOption
                    title="New caregiver account"
                    description="Create a MediSens account for someone who does not have one yet."
                    onClick={() => goTo({ name: 'caregiver-new' })}
                />
                <RelationshipOption
                    title="Already has a MediSens Patient Account"
                    description="Add caregiver access to an existing account by MediSens ID."
                    onClick={() => goTo({ name: 'caregiver-existing' })}
                />
                <Button type="button" variant="ghost" onClick={() => goTo({ name: 'choose' })}>Back</Button>
            </div>
        );
    }

    function renderCaregiverNew() {
        return (
            <div className="flex flex-col gap-4">
                <Input label="Caregiver's full name" value={caregiverName} onChange={(e) => setCaregiverName(e.target.value)} autoFocus />
                <Input label="How was identity verified?" placeholder="e.g. Verified via government ID at RHU counter" value={identityNote} onChange={(e) => setIdentityNote(e.target.value)} />
                <Input label="Contact number (optional)" value={caregiverContact} onChange={(e) => setCaregiverContact(e.target.value)} />
                <SummaryBlock
                    rows={[
                        ['Account for', caregiverName.trim() || '—'],
                        ['Access to', `${patientName}'s health record`],
                        ['Relationship', 'Authorized caregiver · Standard read-only access'],
                    ]}
                />
                <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <input type="checkbox" className="mt-0.5" checked={caregiverConsent} onChange={(e) => setCaregiverConsent(e.target.checked)} />
                    <span>The patient is present and agrees to give this caregiver access.</span>
                </label>
                {error && <ErrorNote message={error} />}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => goTo({ name: 'caregiver-choice' })} disabled={submitting}>Back</Button>
                    <Button type="button" className="w-full sm:w-auto" onClick={() => void handleNewCaregiverIssue()} isLoading={submitting}>Issue activation</Button>
                </div>
            </div>
        );
    }

    function renderIssued(s: Extract<Step, { name: 'issued' }>) {
        return (
            <div className="flex flex-col gap-4">
                <p className="text-sm font-semibold text-[var(--text-secondary)]">Activation ready</p>
                <p className="text-sm text-[var(--text-secondary)]">Give this code to the patient/account holder.</p>
                <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-center">
                    <p className="font-mono text-2xl font-bold tracking-widest text-[var(--text)]">{s.code}</p>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">Expires {formatExpiry(s.expiresAt)}.</p>
                <p className="text-sm text-[var(--text-secondary)]">
                    The account holder must complete setup and create their own 6-digit PIN. RHU staff should not ask for or record their PIN.
                </p>
                {slipError && <ErrorNote message={slipError} />}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                        type="button"
                        className="w-full sm:w-auto"
                        variant="outline"
                        onClick={() => {
                            setSlipError(null);
                            const ok = printActivationSlip({
                                holderName: s.holderName,
                                relationship: s.relationship,
                                accessPatientName: s.accessPatientName,
                                code: s.code,
                                expiresAt: s.expiresAt,
                            });
                            if (!ok) setSlipError('Unable to open the print window. Please try again.');
                        }}
                    >
                        Print activation slip
                    </Button>
                    <Button type="button" className="w-full sm:w-auto" onClick={onClose}>Done</Button>
                </div>
            </div>
        );
    }

    function renderGranted(s: Extract<Step, { name: 'granted' }>) {
        const label = s.relationship === 'GUARDIAN' ? 'Parent / legal guardian' : 'Authorized caregiver';
        return (
            <div className="flex flex-col gap-4">
                <Badge tone="green">Access granted</Badge>
                <p className="text-sm text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text)]">{s.holderName}</span> can now access {patientName}'s health record as {label.toLowerCase()}.
                </p>
                <div className="flex justify-end">
                    <Button type="button" onClick={onClose}>Done</Button>
                </div>
            </div>
        );
    }

    let body: JSX.Element;
    switch (step.name) {
        case 'choose': body = renderChoose(); break;
        case 'self-confirm': body = renderSelfConfirm(); break;
        case 'guardian-choice': body = renderGuardianChoice(); break;
        case 'guardian-new': body = renderGuardianNew(); break;
        case 'guardian-existing': body = renderExistingLookup('GUARDIAN', { name: 'guardian-choice' }); break;
        case 'caregiver-choice': body = renderCaregiverChoice(); break;
        case 'caregiver-new': body = renderCaregiverNew(); break;
        case 'caregiver-existing': body = renderExistingLookup('AUTHORIZED_CAREGIVER', { name: 'caregiver-choice' }); break;
        case 'issued': body = renderIssued(step); break;
        case 'granted': body = renderGranted(step); break;
    }

    return (
        <>
            <button type="button" aria-label="Close" className="clinical-drawer-backdrop" onClick={onClose} />
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
                <Modal labelledBy={TITLE_ID} onClose={onClose} className="consent-modal activate-account-modal">
                    <div className="consent-modal-header">
                        <div className="min-w-0">
                            <div id={TITLE_ID} className="text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] text-[var(--text)]">
                                Activate Patient Account
                            </div>
                            <div className="mt-0.5 truncate text-[length:var(--type-caption-size)] leading-[var(--type-caption-line)] text-[var(--text-secondary)]">
                                {patientName}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]"
                        >
                            <Icon name="close" className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="consent-modal-body">{body}</div>
                </Modal>
            </div>
        </>
    );
}

function RelationshipOption({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-h-11 flex-col items-start gap-0.5 rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--brand-primary)] hover:bg-[var(--brand-soft-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]"
        >
            <span className="font-semibold text-[var(--text)]">{title}</span>
            <span className="text-sm text-[var(--text-secondary)]">{description}</span>
        </button>
    );
}

/** The first row is always the "who" (Account for) -- rendered as a
 * small headline, visually separated from the remaining "what" rows
 * (Access to / Relationship / Access) so staff can scan identity apart
 * from grant details at a glance (visual refinement only; the rows
 * themselves and their values are unchanged from Steps 4-5). */
function SummaryBlock({ rows }: { rows: [string, string][] }) {
    const [firstRow, ...restRows] = rows;
    return (
        <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
            {firstRow && (
                <div className="mb-2.5 border-b border-[var(--border-soft)] pb-2.5">
                    <p className="text-[length:var(--type-caption-size)] font-medium uppercase tracking-[var(--tracking-label)] text-[var(--text-muted)]">{firstRow[0]}</p>
                    <p className="mt-0.5 text-base font-semibold text-[var(--text)] [overflow-wrap:anywhere]">{firstRow[1]}</p>
                </div>
            )}
            <div className="flex flex-col gap-1.5">
                {restRows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 text-sm">
                        <span className="text-[var(--text-secondary)]">{label}</span>
                        <span className="text-right font-medium text-[var(--text)] [overflow-wrap:anywhere]">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ErrorNote({ message }: { message: string }) {
    return (
        <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-light)] px-3 py-2 text-sm text-[var(--coral)]">
            {message}
        </p>
    );
}
