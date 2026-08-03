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
    success: 'bg-[var(--green-dark)]',
    error: 'bg-[var(--coral-dark)]',
    info: 'bg-[var(--brand-active)]',
} as const;

export function Toast({ message, type = 'success', subText, onClose, className, icon }: ToastProps) {
    return (
        <div
            role={type === 'error' ? 'alert' : 'status'}
            aria-live={type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={cn(
                'fixed left-4 right-4 top-[5rem] z-[10000] flex w-auto max-w-none items-start gap-2 rounded-lg px-3 py-2.5 text-white shadow-lg ring-1 ring-white/20 sm:left-auto sm:right-6 sm:top-[5.5rem] sm:w-[min(28rem,calc(100vw-3rem))] sm:max-w-md',
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
                            className="-my-2 -mr-1 ml-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-[length:var(--type-label-size)] font-semibold opacity-80 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
