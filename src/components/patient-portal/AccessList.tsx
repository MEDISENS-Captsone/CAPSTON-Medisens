import { useCallback, useEffect, useState } from 'react';
import { SectionError } from './PortalSection';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Icon } from '../shared/Icon';
import { fetchAccessList, revokeAccessGrant, type PortalAccessGrant } from '../../features/patient-portal/api';
import { accessRelationshipLabel, formatLongDate } from '../../features/patient-portal/format';
import { useT } from '../../lib/i18n/patientPortal';

interface AccessListProps {
    patientId: number;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; grants: PortalAccessGrant[] };

/** People who can access this health record (§9.5, §6.3). Only reachable
 * for a SELF session -- patient_portal_access_list() itself refuses any
 * other caller, so this component is never mounted for a
 * GUARDIAN/AUTHORIZED_CAREGIVER session (gated one level up). Revocation
 * is restricted server-side to AUTHORIZED_CAREGIVER grants; a GUARDIAN
 * card never gets a remove control here, and the RPC refuses one anyway
 * even if this UI were bypassed. */
export function AccessList({ patientId }: AccessListProps) {
    const { t, language } = useT();
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const grants = await fetchAccessList(patientId);
            setState({ status: 'ready', grants });
        } catch {
            setState({ status: 'error' });
        }
    }, [patientId]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleRevoke = async (accessToken: string) => {
        if (revokingId) return;
        setRevokingId(accessToken);
        setError(null);
        try {
            await revokeAccessGrant(patientId, accessToken);
            setConfirmingId(null);
            await load();
        } catch {
            setError(t('access.removeError'));
        } finally {
            setRevokingId(null);
        }
    };

    if (state.status === 'loading') return <SkeletonList rows={3} />;
    if (state.status === 'error') return <SectionError onRetry={() => void load()} message={t('access.loadError')} />;

    if (state.grants.length === 0) {
        return <EmptyState icon={<Icon name="users" className="h-5 w-5" />} title={t('access.noneTitle')} />;
    }

    return (
        <div>
            <p className="mb-3 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                {t('access.onlyRhuCanAdd')}
            </p>

            {error && (
                <p role="alert" className="mb-3 rounded-[var(--radius-control)] border border-[var(--coral-border)] bg-[var(--coral-tint)] px-3 py-2 text-[length:var(--type-supporting-size)] text-[var(--coral)]">
                    {error}
                </p>
            )}

            <ul className="space-y-3">
                {state.grants.map((grant) => {
                    const granted = formatLongDate(grant.grantedAt, language);
                    const isConfirming = confirmingId === grant.accessToken;
                    return (
                        <li key={grant.accessToken} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                            {grant.holderName && <p className="font-semibold text-[var(--text)]">{grant.holderName}</p>}
                            <p className={grant.holderName ? 'mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]' : 'font-semibold text-[var(--text)]'}>
                                {accessRelationshipLabel(grant.relationship, language)}
                            </p>
                            <p className="mt-0.5 text-[length:var(--type-supporting-size)] text-[var(--text-secondary)]">{t('access.canView')}</p>
                            {granted && <p className="mt-0.5 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">{t('access.grantedOn', { date: granted })}</p>}

                            {grant.relationship === 'GUARDIAN' && (
                                <p className="mt-2 text-[length:var(--type-caption-size)] text-[var(--text-muted)]">
                                    {t('access.guardianManagedByRhu')}
                                </p>
                            )}

                            {grant.revocable && !isConfirming && (
                                <Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmingId(grant.accessToken)}>
                                    {t('access.removeAccess')}
                                </Button>
                            )}

                            {grant.revocable && isConfirming && (
                                <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                                    <p className="text-[length:var(--type-supporting-size)] text-[var(--text)]">{t('access.confirmRemove')}</p>
                                    <div className="mt-2 flex gap-2">
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            isLoading={revokingId === grant.accessToken}
                                            onClick={() => void handleRevoke(grant.accessToken)}
                                        >
                                            {t('access.removeAccess')}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)} disabled={revokingId === grant.accessToken}>
                                            {t('access.cancel')}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
