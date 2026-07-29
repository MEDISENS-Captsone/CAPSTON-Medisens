import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leadingIcon?: ReactNode;
    containerClassName?: string;
}

export function Input({ label, error, hint, leadingIcon, className, containerClassName, id, ...props }: InputProps) {
    const inputId = id ?? props.name;
    const descriptionId = inputId ? `${inputId}-description` : undefined;

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
                    id={inputId}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={(error || hint) && descriptionId ? descriptionId : undefined}
                    className={cn(
                        'min-h-9 w-full rounded-lg border bg-white px-3 py-1.5 text-[length:var(--type-body-size)] font-normal leading-[var(--type-body-line)] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--border-strong)] focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]',
                        leadingIcon ? 'pl-10' : '',
                        error ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/10' : 'border-[var(--brand-accent-surface)]',
                        className,
                    )}
                    {...props}
                />
            </div>
            {(error || hint) && (
                <p id={descriptionId} className={cn('text-[length:var(--type-caption-size)] font-medium leading-[var(--type-caption-line)]', error ? 'text-red-600' : 'text-[var(--text-secondary)]')}>
                    {error || hint}
                </p>
            )}
        </div>
    );
}
