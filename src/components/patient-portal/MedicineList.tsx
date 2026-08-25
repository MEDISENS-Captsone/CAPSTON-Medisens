import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchMedicines, type PortalPrescription } from '../../features/patient-portal/api';
import { formatLongDate, claimStatusLabel, isRecentPrescription, medicineTitleAndTake } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface MedicineListProps {
    patientId: number;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; prescriptions: PortalPrescription[] };

/** Medicines (§9.3) -- Recent/Previous grouping by prescription-date
 * recency and claim status only, never by parsing `duration`. Each
 * medicine is its own card, never a table. */
export function MedicineList({ patientId }: MedicineListProps) {
    const { t } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const rows = await fetchMedicines(patientId);
            setState({ status: 'ready', prescriptions: rows });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (state.status === 'loading') return <SkeletonList rows={3} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('medicines.loadError')} />;

    if (state.prescriptions.length === 0) {
        return (
            <EmptyState
                icon={<Icon name="pill" className="h-5 w-5" />}
                title={t('medicines.noneTitle')}
                description={t('medicines.noneDescription')}
            />
        );
    }

    const recent = state.prescriptions.filter((rx) => isRecentPrescription(rx.prescribedDate, rx.claimed));
    const previous = state.prescriptions.filter((rx) => !isRecentPrescription(rx.prescribedDate, rx.claimed));

    return (
        <div className="space-y-5">
            {recent.length > 0 && (
                <div>
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('medicines.recent')}</h2>
                    <PrescriptionCards prescriptions={recent} />
                </div>
            )}
            {previous.length > 0 && (
                <div>
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{t('medicines.previous')}</h2>
                    <PrescriptionCards prescriptions={previous} />
                </div>
            )}
        </div>
    );
}

function PrescriptionCards({ prescriptions }: { prescriptions: PortalPrescription[] }) {
    const { t } = useT();
    return (
        <ul className="space-y-3">
            {prescriptions.map((rx) =>
                rx.malformed || rx.medications.length === 0 ? (
                    <li key={rx.prescriptionToken}>
                        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                            <p className="text-[var(--text)]">{t('medicines.malformed')}</p>
                        </div>
                    </li>
                ) : (
                    rx.medications.map((med, index) => (
                        <li key={`${rx.prescriptionToken}-${index}`}>
                            <MedicineCard prescription={rx} medication={med} />
                        </li>
                    ))
                ),
            )}
        </ul>
    );
}

function MedicineCard({ prescription, medication }: { prescription: PortalPrescription; medication: PortalPrescription['medications'][number] }) {
    const { t, language } = useT();
    const { title, takeLine } = medicineTitleAndTake(medication.name, medication.dosage, language);
    const prescribedDate = formatLongDate(prescription.prescribedDate, language);

    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <p className="font-semibold text-[var(--text)]">{title}</p>

            <dl className="mt-2 space-y-1 text-[length:var(--type-supporting-size)]">
                {takeLine && (
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-[var(--text-secondary)]">{t('medicines.take')}</dt>
                        <dd className="text-[var(--text)]">{takeLine}</dd>
                    </div>
                )}
                {medication.frequency && (
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-[var(--text-secondary)]">{t('medicines.frequency')}</dt>
                        <dd className="text-[var(--text)]">{medication.frequency}</dd>
                    </div>
                )}
                {medication.duration && (
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-[var(--text-secondary)]">{t('medicines.duration')}</dt>
                        <dd className="text-[var(--text)]">{medication.duration}</dd>
                    </div>
                )}
            </dl>

            <p className="mt-3 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                {prescription.doctorName ? t('medicines.prescribedBy', { name: prescription.doctorName }) : t('medicines.prescribed')}
                {prescribedDate ? ` · ${prescribedDate}` : ''}
            </p>
            <p className="mt-1 text-[length:var(--type-caption-size)] font-medium text-[var(--brand-active)]">
                {claimStatusLabel(prescription.claimed, prescription.claimedDate, language)}
            </p>
        </div>
    );
}
