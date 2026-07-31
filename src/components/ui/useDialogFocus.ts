import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogFocusOptions {
    /** Whether the dialog is currently rendered. */
    isOpen: boolean;
    /** The element carrying role="dialog". */
    dialogRef: RefObject<HTMLElement | null>;
    /** Control that should receive focus on open. Falls back to the first focusable element. */
    initialFocusRef?: RefObject<HTMLElement | null>;
    /** Called on Escape. Must close the dialog without performing its action. */
    onClose: () => void;
}

/**
 * Shared modal keyboard behaviour, matching the Sidebar logout dialog:
 * move focus into the dialog, contain Tab / Shift+Tab, close on Escape,
 * and restore focus to the control that opened it.
 */
export function useDialogFocus({ isOpen, dialogRef, initialFocusRef, onClose }: DialogFocusOptions) {
    useEffect(() => {
        if (!isOpen) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const getFocusable = () => {
            const dialog = dialogRef.current;
            if (!dialog) return [] as HTMLElement[];
            return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        };

        // Wait a frame so the dialog subtree is mounted before focus moves into it.
        const focusFrame = requestAnimationFrame(() => {
            const target = initialFocusRef?.current ?? getFocusable()[0];
            target?.focus({ preventScroll: true });
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;

            const dialog = dialogRef.current;
            if (!dialog) return;
            const focusable = getFocusable();
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;

            if (!(active instanceof HTMLElement) || !dialog.contains(active)) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            cancelAnimationFrame(focusFrame);
            window.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus({ preventScroll: true });
        };
    }, [isOpen, dialogRef, initialFocusRef, onClose]);
}
