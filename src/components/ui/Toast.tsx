import type { ReactNode } from 'react';
import { Icon } from '../shared/Icon';
import { cn } from './utils';

export interface ToastProps {
    message: string;
    type?: 'success' | 'error' | 'info';
    subText?: string;
    onClose?: () => void;
    className?: string;
    icon?: ReactNode;
}

const typeClasses = {
    success: 'bg-green-700',
    error: 'bg-red-700',
    info: 'bg-[var(--brand-active)]',
} as const;

export function Toast({ message, type = 'success', subText, onClose, className, icon }: ToastProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
                'fixed right-4 top-4 z-[10000] flex w-[calc(100vw-2rem)] max-w-sm items-start gap-2 rounded-lg px-3 py-2.5 text-white shadow-lg ring-1 ring-white/20 sm:right-4 sm:top-4',
                typeClasses[type],
                className,
            )}
        >
            <div aria-hidden="true" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 text-[length:var(--type-label-size)] font-semibold">
                {icon ?? (type === 'error' ? <Icon name="alert-triangle" className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />)}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                    <p className="text-[length:var(--type-body-size)] font-semibold leading-[var(--type-body-line)] tracking-[var(--tracking-normal)]">{message}</p>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-[length:var(--type-label-size)] font-semibold opacity-80 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            aria-label="Close message"
                            type="button"
                        >
                            <Icon name="close" className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {subText && <p className="mt-1 text-[length:var(--type-caption-size)] font-normal leading-[var(--type-caption-line)] text-white/90">{subText}</p>}
            </div>
        </div>
    );
}
