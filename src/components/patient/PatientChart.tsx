import type { ReactNode } from 'react';
import { Icon } from '../shared/Icon';
import { cn } from '../ui/utils';

interface PatientChartIdentity {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    sex?: string | null;
    age?: number | string | null;
    bloodType?: string | null;
    address?: string | null;
}

interface PatientChartIdentityHeaderProps {
    patient: PatientChartIdentity;
    titleId?: string;
    title?: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    compact?: boolean;
    className?: string;
}

function initials(patient: PatientChartIdentity) {
    const first = patient.firstName?.[0] ?? '';
    const last = patient.lastName?.[0] ?? '';
    return `${first}${last}`.toUpperCase() || '?';
}

export function formatPatientChartName(patient: PatientChartIdentity) {
    const last = patient.lastName || '';
    const first = patient.firstName || '';
    const middle = patient.middleName ? ` ${patient.middleName}` : '';
    const full = `${last}${last && first ? ', ' : ''}${first}${middle}`.trim();
    return full || 'Patient';
}

export function formatPatientChartSubtitle(patient: PatientChartIdentity) {
    return [
        patient.sex || null,
        patient.age != null && patient.age !== '' ? `${patient.age} yrs` : null,
        patient.bloodType || null,
        patient.address || null,
    ].filter(Boolean).join(' · ') || 'Patient profile';
}

export function PatientChartIdentityHeader({
    patient,
    titleId,
    title,
    subtitle,
    actions,
    compact,
    className,
}: PatientChartIdentityHeaderProps) {
    return (
        <div className={cn('patient-chart-identity-header', compact && 'is-compact', className)}>
            <div className="patient-chart-identity">
                <div className="patient-chart-avatar bg-[var(--brand-primary)]">{initials(patient)}</div>
                <div className="min-w-0">
                    <div id={titleId} className="font-semibold text-[var(--text)] leading-tight truncate">
                        {title ?? formatPatientChartName(patient)}
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                        {subtitle ?? formatPatientChartSubtitle(patient)}
                    </div>
                </div>
            </div>
            {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        </div>
    );
}

interface PatientHistoryPanelProps {
    title?: ReactNode;
    children: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function PatientHistoryPanel({ title = 'Encounters & Transaction Timeline', children, actions, className }: PatientHistoryPanelProps) {
    return (
        <section className={cn('patient-chart-section', className)}>
            <div className="patient-chart-section-header flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                    <Icon name="clock" className="h-4 w-4" />
                    {title}
                </span>
                {actions}
            </div>
            <div className="patient-chart-section-body">
                {children}
            </div>
        </section>
    );
}
