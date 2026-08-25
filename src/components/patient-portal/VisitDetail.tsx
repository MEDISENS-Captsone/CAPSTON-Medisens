import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { SkeletonText } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchVisitDetail, type PortalVisitDetail } from '../../features/patient-portal/api';
import { formatLongDate } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface VisitDetailProps {
    patientId: number;
    visitToken: string;
    onBack: () => void;
    onNavigateToMedicines: () => void;
    onNavigateToLabs: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; detail: PortalVisitDetail };

/** Visit detail (§9.2) -- the specified layout and nothing beyond it.
 * Sections are omitted, never rendered empty/null/"--", when the RPC did
 * not return a value; recommendation text is shown exactly as recorded,
 * never paraphrased. */
export function VisitDetail({ patientId, visitToken, onBack, onNavigateToMedicines, onNavigateToLabs }: VisitDetailProps) {
    const { t } = useT();
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
                <span>{t('visits.backToVisits')}</span>
            </button>

            {state.status === 'loading' && <SkeletonText lines={6} className="mt-4" />}
            {state.status === 'error' && (
                <div className="mt-4">
                    <SectionError onRetry={() => void load()} message={t('visits.loadDetailError')} />
                </div>
            )}
            {state.status === 'ready' && (
                <VisitDetailContent detail={state.detail} onNavigateToMedicines={onNavigateToMedicines} onNavigateToLabs={onNavigateToLabs} />
            )}
        </div>
    );
}

function VisitDetailContent({
    detail,
    onNavigateToMedicines,
    onNavigateToLabs,
}: {
    detail: PortalVisitDetail;
    onNavigateToMedicines: () => void;
    onNavigateToLabs: () => void;
}) {
    const { t, language } = useT();
    const date = formatLongDate(detail.visitDate, language);
    const followUpDate = formatLongDate(detail.followUpDate, language);
    const facilityName = t('visits.facilityName');
    const facilityLine = detail.attendingProvider ? `${facilityName} · ${detail.attendingProvider}` : facilityName;

    return (
        <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            {date && <p className="text-[length:var(--type-card-title-size)] font-bold text-[var(--text)]">{date}</p>}
            <p className="mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{facilityLine}</p>

            {detail.reason && (
                <section className="mt-4">
                    <h2 className="text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('visits.reasonForVisit')}</h2>
                    <p className="mt-1 text-[var(--text)]">{detail.reason}</p>
                </section>
            )}

            {detail.diagnosis && (
                <section className="mt-4">
                    <h2 className="text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('visits.diagnosis')}</h2>
                    <p className="mt-1 text-[var(--text)]">{detail.diagnosis}</p>
                </section>
            )}

            {detail.recommendation && (
                <section className="mt-4">
                    <h2 className="text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('visits.recommendation')}</h2>
                    <p className="mt-1 whitespace-pre-line text-[var(--text)]">{detail.recommendation}</p>
                </section>
            )}

            {(detail.medicineCount > 0 || detail.labCount > 0 || followUpDate) && (
                <div className="mt-4 divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)]">
                    {detail.medicineCount > 0 && (
                        <button type="button" onClick={onNavigateToMedicines} className="flex w-full min-h-[44px] items-center justify-between py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] rounded-[var(--radius-control)]">
                            <span className="text-[var(--text)]">{t('visits.medicinesPrescribed')}</span>
                            <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                                {detail.medicineCount}
                                <Icon name="chevron-right" className="h-4 w-4 text-[var(--text-muted)]" />
                            </span>
                        </button>
                    )}
                    {detail.labCount > 0 && (
                        <button type="button" onClick={onNavigateToLabs} className="flex w-full min-h-[44px] items-center justify-between py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] rounded-[var(--radius-control)]">
                            <span className="text-[var(--text)]">{t('visits.laboratory')}</span>
                            <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                                {t('visits.resultsAvailable', { count: detail.labCount, plural: detail.labCount === 1 ? '' : 's' })}
                                <Icon name="chevron-right" className="h-4 w-4 text-[var(--text-muted)]" />
                            </span>
                        </button>
                    )}
                    {followUpDate && (
                        <div className="flex items-center justify-between py-3">
                            <span className="text-[var(--text)]">{t('visits.followUp')}</span>
                            <span className="text-[var(--text-secondary)]">{followUpDate}</span>
                        </div>
                    )}
                </div>
            )}

            {!date && !detail.reason && !detail.diagnosis && !detail.recommendation && (
                <p className="text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{t('visits.noFurtherDetails')}</p>
            )}
        </div>
    );
}
