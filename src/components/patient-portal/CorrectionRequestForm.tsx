import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonText } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Icon } from '../shared/Icon';
import {
    fetchCorrectionRequests,
    submitCorrectionRequest,
    type CorrectionFieldGroup,
    type PortalCorrectionRequest,
} from '../../features/patient-portal/api';
import { correctionFieldGroupLabel, correctionStatusLabel, formatDateTime } from '../../features/patient-portal/format';

interface CorrectionRequestFormProps {
    patientId: number;
    accountId: string;
    onBack: () => void;
}

const FIELD_GROUPS: CorrectionFieldGroup[] = ['name', 'birthdate', 'address', 'contact', 'philhealth', 'other'];

type ListState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; requests: PortalCorrectionRequest[] };

/** Request a correction (§9.5) -- a request for RHU staff review, never a
 * direct edit. Server-side RLS (patient_portal_can_correct) is the real
 * authorization boundary; a caregiver session reaching this screen would
 * still have its insert refused by the database. */
export function CorrectionRequestForm({ patientId, accountId, onBack }: CorrectionRequestFormProps) {
    const [listState, setListState] = useState<ListState>({ status: 'loading' });
    const [fieldGroup, setFieldGroup] = useState<CorrectionFieldGroup>('name');
    const [requestedValue, setRequestedValue] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setListState({ status: 'loading' });
        try {
            const requests = await fetchCorrectionRequests(patientId);
            setListState({ status: 'ready', requests });
        } catch {
            setListState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting || !requestedValue.trim()) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            await submitCorrectionRequest({ accountId, patientId, fieldGroup, requestedValue: requestedValue.trim(), patientNote: note.trim() || undefined });
            setRequestedValue('');
            setNote('');
            await load();
        } catch {
            setSubmitError('We could not submit this request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>Back to profile</span>
            </button>

            <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <h2 className="text-[length:var(--type-card-title-size)] font-semibold text-[var(--text)]">Request a correction</h2>
                <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">
                    This sends a request to Rural Health Unit staff for review. Nothing on the health record changes until staff review and update it.
                </p>

                <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                    <label className="block">
                        <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">What needs to be corrected?</span>
                        <select
                            value={fieldGroup}
                            onChange={(e) => setFieldGroup(e.target.value as CorrectionFieldGroup)}
                            className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 text-[var(--text)]"
                        >
                            {FIELD_GROUPS.map((group) => (
                                <option key={group} value={group}>{correctionFieldGroupLabel(group)}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">What should it say?</span>
                        <input
                            value={requestedValue}
                            onChange={(e) => setRequestedValue(e.target.value)}
                            required
                            className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 text-[var(--text)]"
                            placeholder="The correct value"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-[length:var(--type-label-size)] font-semibold text-[var(--text)]">Note for RHU staff (optional)</span>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            className="w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]"
                        />
                    </label>

                    {submitError && (
                        <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-tint)] px-3 py-2 text-[length:var(--type-supporting-size)] text-[var(--coral)]">
                            {submitError}
                        </p>
                    )}

                    <Button type="submit" className="w-full" isLoading={submitting} disabled={!requestedValue.trim()}>Submit request</Button>
                </form>
            </div>

            <div className="mt-4">
                <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Your requests</h2>
                {listState.status === 'loading' && <SkeletonText lines={3} />}
                {listState.status === 'error' && <SectionError onRetry={() => void load()} message="We could not load past requests right now." />}
                {listState.status === 'ready' && listState.requests.length === 0 && (
                    <EmptyState icon={<Icon name="edit" className="h-5 w-5" />} title="No correction requests yet" />
                )}
                {listState.status === 'ready' && listState.requests.length > 0 && (
                    <ul className="space-y-3">
                        {listState.requests.map((r) => (
                            <li key={r.id} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-[var(--text)]">{correctionFieldGroupLabel(r.fieldGroup)}</span>
                                    <span className="text-[length:var(--type-caption-size)] font-medium text-[var(--brand-active)]">{correctionStatusLabel(r.status)}</span>
                                </div>
                                <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text)]">{r.requestedValue}</p>
                                <p className="mt-1 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">Submitted {formatDateTime(r.submittedAt)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
