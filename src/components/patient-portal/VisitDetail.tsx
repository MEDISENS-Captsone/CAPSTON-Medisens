import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { SkeletonText } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchVisitDetail, type PortalVisitDetail } from '../../features/patient-portal/api';
import { formatLongDate } from '../../features/patient-portal/format';

interface VisitDetailProps {
    patientId: number;
    visitToken: string;
    onBack: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; detail: PortalVisitDetail };

/** Visit detail (§9.2) -- the specified layout and nothing beyond it.
 * Sections are omitted, never rendered empty/null/"--", when the RPC did
 * not return a value; recommendation text is shown exactly as recorded,
 * never paraphrased. */
export function VisitDetail({ patientId, visitToken, onBack }: VisitDetailProps) {
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const detail = await fetchVisitDetail(patientId, visitToken);
            setState({ status: 'ready', detail });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId, visitToken]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>Back to visits</span>
            </button>

            {state.status === 'loading' && <SkeletonText lines={6} className="mt-4" />}
            {state.status === 'error' && (
                <div className="mt-4">
                    <SectionError onRetry={() => void load()} message="We could not load this visit right now." />
                </div>
            )}
            {state.status === 'ready' && <VisitDetailContent detail={state.detail} />}
        </div>
    );
}

function VisitDetailContent({ detail }: { detail: PortalVisitDetail }) {
    const date = formatLongDate(detail.visitDate);
    const followUpDate = formatLongDate(detail.followUpDate);
    const facilityLine = detail.attendingProvider ? `Malvar Rural Health Unit · ${detail.attendingProvider}` : 'Malvar Rural Health Unit';

    return (
        <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            {date && <p className="text-[length:var(--type-card-title-size)] font-bold text-[var(--text)]">{date}</p>}
            <p className="mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{facilityLine}</p>

            {detail.reason && (
                <section className="mt-4">
                    <h2 className="text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Reason for visit</h2>
                    <p className="mt-1 text-[var(--text)]">{detail.reason}</p>
                </section>
            )}

            {detail.diagnosis && (
                <section className="mt-4">
                    <h2 className="text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Diagnosis</h2>
                    <p className="mt-1 text-[var(--text)]">{detail.diagnosis}</p>
                </section>
            )}

            {detail.recommendation && (
                <section className="mt-4">
                    <h2 className="text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">Healthcare provider recommendation</h2>
                    <p className="mt-1 whitespace-pre-line text-[var(--text)]">{detail.recommendation}</p>
                </section>
            )}

            {(detail.medicineCount > 0 || detail.labCount > 0 || followUpDate) && (
                <div className="mt-4 divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)]">
                    {detail.medicineCount > 0 && (
                        <div className="flex items-center justify-between py-3">
                            <span className="text-[var(--text)]">Medicines prescribed</span>
                            <span className="text-[var(--text-secondary)]">{detail.medicineCount}</span>
                        </div>
                    )}
                    {detail.labCount > 0 && (
                        <div className="flex items-center justify-between py-3">
                            <span className="text-[var(--text)]">Laboratory</span>
                            <span className="text-[var(--text-secondary)]">{detail.labCount} result{detail.labCount === 1 ? '' : 's'} available</span>
                        </div>
                    )}
                    {followUpDate && (
                        <div className="flex items-center justify-between py-3">
                            <span className="text-[var(--text)]">Follow-up</span>
                            <span className="text-[var(--text-secondary)]">{followUpDate}</span>
                        </div>
                    )}
                </div>
            )}

            {!date && !detail.reason && !detail.diagnosis && !detail.recommendation && (
                <p className="text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">No further details were recorded for this visit.</p>
            )}
        </div>
    );
}
