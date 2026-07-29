import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export type BadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'pink' | 'indigo' | 'teal';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    children: ReactNode;
    tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
    blue: 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]',
    green: 'border-green-200 bg-green-50 text-green-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]',
    pink: 'border-pink-200 bg-pink-50 text-pink-700',
    indigo: 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]',
    teal: 'border-green-200 bg-green-50 text-green-700',
};

export function Badge({ children, tone = 'slate', className, ...props }: BadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex min-h-6 max-w-full items-center justify-center rounded-md border px-2 py-0.5 text-center text-[length:var(--type-caption-size)] font-semibold leading-[var(--type-caption-line)]',
                toneClasses[tone],
                className,
            )}
            {...props}
        >
            {children}
        </span>
    );
}
