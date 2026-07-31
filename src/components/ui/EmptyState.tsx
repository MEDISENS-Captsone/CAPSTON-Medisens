import type { ReactNode } from 'react';
import { Icon } from '../shared/Icon';
import { cn } from './utils';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    className?: string;
}

export function EmptyState({ icon, title, description, className = '' }: EmptyStateProps) {
    return (
        <div role="status" className={cn('flex min-w-0 max-w-full flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-5 text-center sm:px-4 sm:py-6', className)}>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md border border-[var(--brand-accent-surface)] bg-white text-[var(--brand-active)]">
                {icon ?? <Icon name="inbox" className="h-5 w-5" />}
            </div>
            <h3 className="max-w-full break-words text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] text-[var(--text)]">{title}</h3>
            {description && <p className="mt-1 max-w-sm break-words text-[length:var(--type-supporting-size)] leading-[var(--type-supporting-line)] text-[var(--text-secondary)]">{description}</p>}
        </div>
    );
}
