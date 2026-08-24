import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { SkeletonText } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchLabResultDetail, type PortalLabResultDetail } from '../../features/patient-portal/api';
import { formatLongDate, labGroupLabel, labTestLabel, labTestValueText } from '../../features/patient-portal/format';

interface LabResultDetailProps {
    patientId: number;
    resultToken: string;
    onBack: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; detail: PortalLabResultDetail };

/** Lab Result detail (§9.4) -- renders only the groups/tests the RPC
 * returned. No interpretation, no High/Low/Abnormal/Normal labels, no
 * color-coded verdicts, no arrows -- a reference range is shown only when
 * the RPC itself attached one (an RHU-approved row existed). */
export function LabResultDetail({ patientId, resultToken, onBack }: LabResultDetailProps) {
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const detail = await fetchLabResultDetail(patientId, resultToken);
            setState({ status: 'ready', detail });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId, resultToken]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div>
            <button type="button" onClick={onBack} className="portal-back-link">
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                <span>Back to lab results</span>
            </button>

            {state.status === 'loading' && <SkeletonText lines={6} className="mt-4" />}
            {state.status === 'error' && (
                <div className="mt-4">
                    <SectionError onRetry={() => void load()} message="We could not load this result right now." />
                </div>
            )}
            {state.status === 'ready' && <LabResultDetailContent detail={state.detail} />}
        </div>
    );
}

function LabResultDetailContent({ detail }: { detail: PortalLabResultDetail }) {
    const date = formatLongDate(detail.testDate);

    return (
        <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            {date && <p className="text-[length:var(--type-card-title-size)] font-bold text-[var(--text)]">{date}</p>}
            {detail.performedBy && <p className="mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{detail.performedBy}</p>}

            {detail.groups.length === 0 ? (
                <p className="mt-4 text-[var(--text)]">Result available — please ask the RHU for a copy.</p>
            ) : (
                <div className="mt-4 space-y-4">
                    {detail.groups.map((group) => (
                        <section key={group.groupKey}>
                            <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{labGroupLabel(group.groupKey)}</h2>
                            <dl className="space-y-2">
                                {group.tests.map((test) => {
                                    const valueText = labTestValueText(test.value);
                                    const range = test.rangeText ?? (test.rangeLow !== null && test.rangeHigh !== null ? `${test.rangeLow}–${test.rangeHigh}` : null);
                                    return (
                                        <div key={test.testKey} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--border-soft)] pb-2 last:border-b-0 last:pb-0">
                                            <dt className="text-[var(--text)]">{labTestLabel(test.testKey)}</dt>
                                            <dd className="text-right">
                                                <span className="font-semibold text-[var(--text)]">{valueText}{test.unit ? ` ${test.unit}` : ''}</span>
                                                {range && <span className="ml-2 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">Reference range {range}</span>}
                                            </dd>
                                        </div>
                                    );
                                })}
                            </dl>
                        </section>
                    ))}
                </div>
            )}

            <p className="mt-4 text-[length:var(--type-caption-size)] text-[var(--text-secondary)]">
                The healthcare provider can explain what this result means during the next visit.
            </p>
        </div>
    );
}
