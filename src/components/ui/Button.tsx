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
    primary: 'border-[var(--brand-primary-hover)] bg-[var(--brand-primary-hover)] text-white shadow-sm hover:border-[var(--brand-active)] hover:bg-[var(--brand-active)]',
    secondary: 'border-[var(--brand-active)] bg-[var(--brand-active)] text-white shadow-sm hover:border-[var(--brand-active-hover)] hover:bg-[var(--brand-active-hover)]',
    outline: 'border-[var(--control-border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)] hover:border-[var(--brand-primary)] hover:bg-[var(--brand-soft-surface)] hover:text-[var(--brand-active)]',
    ghost: 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--brand-soft-surface)] hover:text-[var(--brand-active)]',
    danger: 'border-[var(--coral)] bg-[var(--coral)] text-white shadow-sm hover:border-[var(--coral-hover)] hover:bg-[var(--coral-hover)]',
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-[var(--control-height-sm)] rounded-[var(--radius-control)] px-3 py-2 text-[length:var(--type-caption-size)]',
    md: 'min-h-[var(--control-height-md)] rounded-[var(--radius-control)] px-4 py-2 text-[length:var(--type-button-size)]',
    lg: 'min-h-[var(--control-height-lg)] rounded-[var(--radius-control)] px-5 py-2.5 text-[length:var(--type-button-size)]',
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
            aria-busy={isLoading || undefined}
            className={cn(
                'inline-flex max-w-full items-center justify-center gap-2 border font-semibold leading-[var(--type-button-line)] tracking-[var(--tracking-normal)] transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] disabled:cursor-not-allowed disabled:border-[var(--disabled-border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] disabled:shadow-none',
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
