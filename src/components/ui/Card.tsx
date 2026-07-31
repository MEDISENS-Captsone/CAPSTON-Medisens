import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
    return (
        <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]', className)} {...props}>
            {children}
        </div>
    );
}

export function CardHeader({ children, className, ...props }: CardProps) {
    return (
        <div className={cn('border-b border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 sm:px-4', className)} {...props}>
            {children}
        </div>
    );
}

export function CardBody({ children, className, ...props }: CardProps) {
    return (
        <div className={cn('px-3 py-3 sm:px-4', className)} {...props}>
            {children}
        </div>
    );
}

export function CardTitle({ children, className, ...props }: CardProps) {
    return (
        <h2 className={cn('text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] tracking-[var(--tracking-normal)] text-[var(--text)]', className)} {...props}>
            {children}
        </h2>
    );
}
