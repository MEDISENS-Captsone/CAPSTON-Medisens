import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { Icon } from '../shared/Icon';
import { fetchVaccinations, type PortalVaccination } from '../../features/patient-portal/api';
import { formatLongDate, vaccinationCategoryLabel } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface VaccinationListProps {
    patientId: number;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; vaccinations: PortalVaccination[] };

/** Vaccinations (§9.2) -- read-only, grouped by vaccine_category. The
 * legacy bcg_date synthesis already happened inside
 * patient_portal_vaccinations(); this component only renders whatever
 * rows it returned. */
export function VaccinationList({ patientId }: VaccinationListProps) {
    const { t, language } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const rows = await fetchVaccinations(patientId);
            setState({ status: 'ready', vaccinations: rows });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (state.status === 'loading') return <SkeletonList rows={3} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('vaccinations.loadError')} />;

    if (state.vaccinations.length === 0) {
        return (
            <EmptyState
                icon={<Icon name="shield-plus" className="h-5 w-5" />}
                title={t('vaccinations.noneTitle')}
                description={t('vaccinations.noneDescription')}
            />
        );
    }

    // Grouped by the raw stored category (stable key, never shown) so
    // records sharing a category still group together; the heading itself
    // renders the mapped patient-facing label, never the raw FHSIS text.
    const groups = new Map<string, PortalVaccination[]>();
    for (const vax of state.vaccinations) {
        const key = vax.vaccineCategory ?? '';
        const list = groups.get(key) ?? [];
        list.push(vax);
        groups.set(key, list);
    }

    return (
        <div className="space-y-5">
            {Array.from(groups.entries()).map(([category, rows]) => (
                <div key={category || 'other'}>
                    <h2 className="mb-2 text-[length:var(--type-label-size)] font-semibold text-[var(--text-secondary)]">{vaccinationCategoryLabel(category, language)}</h2>
                    <ul className="space-y-3">
                        {rows.map((vax, index) => (
                            <li key={`${vax.vaccineName}-${vax.dateGiven ?? index}`}>
                                <VaccinationCard vaccination={vax} />
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function VaccinationCard({ vaccination }: { vaccination: PortalVaccination }) {
    const { t, language } = useT();
    const dateGiven = formatLongDate(vaccination.dateGiven, language);
    const nextDue = formatLongDate(vaccination.nextDueDate, language);
    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="font-semibold text-[var(--text)]">{vaccination.vaccineName}</p>
            {vaccination.doseLabel && <p className="mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{vaccination.doseLabel}</p>}
            {dateGiven && <p className="mt-1 text-[length:var(--type-supporting-size)] text-[var(--text)]">{t('vaccinations.given', { date: dateGiven })}</p>}
            {vaccination.facility && <p className="mt-0.5 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{vaccination.facility}</p>}
            {nextDue && <p className="mt-1 text-[length:var(--type-supporting-size)] font-medium text-[var(--brand-active)]">{t('vaccinations.nextDose', { date: nextDue })}</p>}
        </div>
    );
}
