import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export type BadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'pink' | 'indigo' | 'teal';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    children: ReactNode;
    tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
    blue: 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]',
    green: 'border-[var(--green-border)] bg-[var(--green-light)] text-[var(--green)]',
    amber: 'border-[var(--amber-border)] bg-[var(--amber-surface)] text-[var(--amber-text)]',
    red: 'border-[var(--coral-border)] bg-[var(--coral-light)] text-[var(--coral)]',
    slate: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]',
    pink: 'border-[var(--pink-border)] bg-[var(--pink-light)] text-[var(--pink)]',
    indigo: 'border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)] text-[var(--brand-active)]',
    teal: 'border-[var(--green-border)] bg-[var(--green-light)] text-[var(--green)]',
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
