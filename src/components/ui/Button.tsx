import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
    isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
    primary: 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white shadow-sm hover:border-[var(--brand-primary-hover)] hover:bg-[var(--brand-primary-hover)]',
    secondary: 'border-[var(--brand-active)] bg-[var(--brand-active)] text-white shadow-sm hover:border-[var(--brand-active-hover)] hover:bg-[var(--brand-active-hover)]',
    outline: 'border-[var(--border-strong)] bg-white text-[var(--text)] shadow-sm hover:border-[var(--brand-primary)] hover:bg-[var(--brand-soft-surface)] hover:text-[var(--brand-active)]',
    ghost: 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--brand-soft-surface)] hover:text-[var(--brand-active)]',
    danger: 'border-red-600 bg-red-600 text-white shadow-sm shadow-red-600/20 hover:border-red-700 hover:bg-red-700',
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-8 rounded-md px-3 py-1 text-[length:var(--type-caption-size)]',
    md: 'min-h-9 rounded-lg px-3 py-2 text-[length:var(--type-button-size)]',
    lg: 'min-h-10 rounded-lg px-4 py-2 text-[length:var(--type-button-size)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
    children,
    className,
    variant = 'primary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    isLoading = false,
    disabled,
    type = 'button',
    ...props
}: ButtonProps, ref) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || isLoading}
            className={cn(
                'inline-flex max-w-full items-center justify-center gap-2 border font-semibold leading-[var(--type-button-line)] tracking-[var(--tracking-normal)] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] disabled:cursor-not-allowed disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] disabled:shadow-none',
                sizeClasses[size],
                variantClasses[variant],
                className,
            )}
            {...props}
        >
            {isLoading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />
            )}
            {!isLoading && leadingIcon}
            <span className="min-w-0 truncate">{children}</span>
            {!isLoading && trailingIcon}
        </button>
    );
});
