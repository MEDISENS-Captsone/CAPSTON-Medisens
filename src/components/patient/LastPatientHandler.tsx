import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon';
import { fetchLastPatientHandler, formatLastPatientAction, type LastPatientHandler as LastPatientHandlerData } from '../../features/patients/lastHandler';
import { logError } from '../../lib/utils/errors';

interface LastPatientHandlerProps {
    patientId: string;
}

function formatOccurredAt(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date not recorded';
    return new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Manila',
    }).format(date);
}

export function LastPatientHandler({ patientId }: LastPatientHandlerProps) {
    const [handler, setHandler] = useState<LastPatientHandlerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const loadHandler = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            setHandler(await fetchLastPatientHandler(patientId));
        } catch (error) {
            logError('Failed to load last patient handler', error);
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [patientId]);

    useEffect(() => { void loadHandler(); }, [loadHandler]);

    return (
        <div className="col-span-2 sm:col-span-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-subtle)]/70 px-3 py-3" aria-live="polite">
            <div className="flex items-start gap-2">
                <Icon name="users" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-active)]" />
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-[var(--text-secondary)]">Last handled by</div>
                    {isLoading ? (
                        <div className="mt-1 h-4 w-48 animate-pulse rounded bg-[var(--border-soft)]" aria-label="Loading latest patient activity" />
                    ) : hasError ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                            <span>Latest patient activity is unavailable.</span>
                            <button type="button" onClick={() => void loadHandler()} className="min-h-8 rounded-md px-2 text-xs font-semibold text-[var(--brand-active)] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-active)]">Try again</button>
                        </div>
                    ) : handler ? (
                        <div className="mt-0.5 text-sm text-[var(--text)]">
                            <span className="font-semibold">{handler.staffName || 'Staff not recorded'}</span>
                            <span className="text-[var(--text-secondary)]"> · {handler.staffRole || 'Role not recorded'} · {formatLastPatientAction(handler)} · {formatOccurredAt(handler.occurredAt)}</span>
                        </div>
                    ) : (
                        <div className="mt-0.5 text-sm text-[var(--text-secondary)]">No recorded patient management activity yet.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
