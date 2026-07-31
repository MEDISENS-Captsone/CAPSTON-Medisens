import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { cn } from './utils';

interface ModalProps {
    children: ReactNode;
    labelledBy: string;
    className?: string;
    onClose?: () => void;
    initialFocusRef?: RefObject<HTMLElement>;
}

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Stack of open dialogs so nested modals/drawers only trap and close the topmost one.
const openDialogStack: HTMLElement[] = [];

const isDialogOnTop = (dialog: HTMLElement) => openDialogStack[openDialogStack.length - 1] === dialog;

const getFocusableElements = (dialog: HTMLElement) =>
    Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.getClientRects().length > 0 || el === document.activeElement);

export function Modal({ children, labelledBy, className, onClose, initialFocusRef }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const focusTarget = initialFocusRef?.current ?? dialogRef.current;
        focusTarget?.focus({ preventScroll: true });
    }, [initialFocusRef]);

    // Focus containment + restoration (WCAG 2.4.3): Tab cycles inside the dialog,
    // and focus returns to the element that opened it when it closes.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        openDialogStack.push(dialog);

        const handleTabKey = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || !isDialogOnTop(dialog)) return;

            const focusable = getFocusableElements(dialog);
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus({ preventScroll: true });
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;

            if (!(active instanceof HTMLElement) || !dialog.contains(active)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && (active === first || active === dialog)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleTabKey, true);
        return () => {
            document.removeEventListener('keydown', handleTabKey, true);
            const index = openDialogStack.indexOf(dialog);
            if (index !== -1) openDialogStack.splice(index, 1);
            previouslyFocused?.focus({ preventScroll: true });
        };
    }, []);

    useEffect(() => {
        if (!onClose) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            const dialog = dialogRef.current;
            if (event.key === 'Escape' && dialog && isDialogOnTop(dialog)) onClose();
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className={cn('clinical-dialog w-full overflow-hidden', className)}
        >
            {children}
        </div>
    );
}
