import type { ReactNode } from 'react';
import { cn } from './utils';

export const clinicalInputClass =
    'w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2.5 text-left text-[length:var(--type-body-size)] font-normal leading-[var(--type-body-line)] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--border-strong)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]';

export const clinicalTextareaClass = cn(clinicalInputClass, 'resize-y leading-relaxed');

export const clinicalLabelClass =
    'mb-1.5 block text-[length:var(--type-label-size)] font-medium leading-[var(--type-label-line)] tracking-[var(--tracking-label)] text-[var(--text-secondary)]';

export const clinicalSectionHeaderClass =
    'mb-4 border-b border-[var(--border-soft)] pb-3 text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] tracking-[var(--tracking-normal)] text-[var(--text)]';

export const clinicalInputErrorClass = cn(
    clinicalInputClass,
    'border-[var(--coral-border-strong)] bg-[var(--coral-tint)] focus:border-[var(--coral-accent)] focus:ring-red-500/10',
);

interface ClinicalFieldProps {
    label: ReactNode;
    htmlFor?: string;
    children: ReactNode;
    required?: boolean;
    hint?: ReactNode;
    error?: ReactNode;
    className?: string;
}

export function ClinicalField({ label, htmlFor, children, required, hint, error, className }: ClinicalFieldProps) {
    return (
        <div className={cn('min-w-0', className)}>
            <label htmlFor={htmlFor} className={clinicalLabelClass}>
                {label}
                {required && <span className="ml-1 text-[var(--coral-accent)]">*</span>}
            </label>
            {children}
            {(error || hint) && (
                <p className={cn('mt-1 text-[length:var(--type-caption-size)] font-medium leading-[var(--type-caption-line)]', error ? 'text-[var(--coral-accent-strong)]' : 'text-[var(--text-secondary)]')}>
                    {error || hint}
                </p>
            )}
        </div>
    );
}

interface ClinicalSectionHeaderProps {
    children: ReactNode;
    className?: string;
}

export function ClinicalSectionHeader({ children, className }: ClinicalSectionHeaderProps) {
    return <h3 className={cn(clinicalSectionHeaderClass, className)}>{children}</h3>;
}
