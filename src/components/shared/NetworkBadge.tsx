import { Icon } from './Icon';

interface NetworkBadgeProps {
    isOnline: boolean;
    compact?: boolean;
    className?: string;
}

export function NetworkBadge({ isOnline, compact = false, className = '' }: NetworkBadgeProps) {
    const statusLabel = isOnline ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE';

    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={statusLabel}
            className={`inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-1 shadow-[var(--shadow-sm)] ${isOnline ? 'border-[var(--green-border)]' : 'border-[var(--amber-border)]'} ${className}`}
        >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${isOnline ? 'bg-[var(--green-light)] text-[var(--green)]' : 'bg-[var(--amber-surface)] text-[var(--amber-text)]'}`}>
                <Icon name={isOnline ? 'wifi' : 'wifi-off'} className="h-3.5 w-3.5" />
            </span>
            {/* Compact (mobile) keeps a visible OFFLINE word so the degraded state is not
                communicated by a small icon alone; online stays icon-only to save width. */}
            {(!compact || !isOnline) && (
                <span className={`min-w-0 truncate text-xs font-semibold uppercase tracking-wide ${isOnline ? 'text-[var(--green)]' : 'text-[var(--amber-text)]'}`}>
                    {compact ? 'OFFLINE' : statusLabel}
                </span>
            )}
        </div>
    );
}
