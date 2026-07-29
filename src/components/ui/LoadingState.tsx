import { cn } from './utils';

interface LoadingStateProps {
    label?: string;
    className?: string;
}

export function LoadingState({ label = 'Loading...', className = '' }: LoadingStateProps) {
    return (
        <div role="status" aria-live="polite" aria-busy="true" className={cn('flex min-w-0 max-w-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-5 sm:px-5', className)}>
            <span className="sr-only">{label}</span>
            <span className="clinical-skeleton h-3 w-32" aria-hidden="true" />
            <span className="clinical-skeleton h-3 w-full" aria-hidden="true" />
            <span className="clinical-skeleton h-3 w-2/3" aria-hidden="true" />
        </div>
    );
}
