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
            className={`inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border bg-white px-3 py-1 shadow-[var(--shadow-sm)] ${isOnline ? 'border-green-200' : 'border-amber-200'} ${className}`}
        >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${isOnline ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-600'}`}>
                <Icon name={isOnline ? 'wifi' : 'wifi-off'} className="h-3.5 w-3.5" />
            </span>
            {!compact && (
                <span className={`min-w-0 truncate text-xs font-semibold uppercase tracking-wide ${isOnline ? 'text-green-700' : 'text-amber-700'}`}>
                    {statusLabel}
                </span>
            )}
        </div>
    );
}
