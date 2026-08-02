import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leadingIcon?: ReactNode;
    containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, leadingIcon, className, containerClassName, id, 'aria-describedby': ariaDescribedBy, readOnly, ...props }, ref) {
    const generatedId = useId();
    const inputId = id ?? props.name ?? generatedId;
    const descriptionId = error || hint ? `${inputId}-description` : undefined;
    const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;

    return (
        <div className={cn('flex min-w-0 flex-col gap-1', containerClassName)}>
            {label && (
                <label htmlFor={inputId} className="text-[length:var(--type-label-size)] font-medium leading-[var(--type-label-line)] tracking-[var(--tracking-label)] text-[var(--text-secondary)]">
                    {label}
                </label>
            )}
            <div className="relative">
                {leadingIcon && <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--border-strong)]">{leadingIcon}</div>}
                <input
                    ref={ref}
                    id={inputId}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    readOnly={readOnly}
                    className={cn(
                        'min-h-[var(--control-height-md)] w-full rounded-[var(--radius-control)] border bg-[var(--surface)] px-3 py-2 text-base font-normal leading-[var(--type-body-line)] text-[var(--text)] outline-none transition-colors duration-[var(--motion-fast)] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--brand-primary)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] read-only:border-[var(--border-strong)] read-only:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] sm:text-[length:var(--type-body-size)]',
                        leadingIcon ? 'pl-10' : '',
                        error ? 'border-[var(--coral)] bg-[var(--coral-light)] focus-visible:border-[var(--coral)] focus-visible:ring-[var(--coral-border)]' : 'border-[var(--control-border)]',
                        className,
                    )}
                    {...props}
                />
            </div>
            {(error || hint) && (
                <p id={descriptionId} role={error ? 'alert' : undefined} className={cn('text-[length:var(--type-caption-size)] font-medium leading-[var(--type-caption-line)]', error ? 'text-[var(--coral)]' : 'text-[var(--text-secondary)]')}>
                    {error || hint}
                </p>
            )}
        </div>
    );
});
