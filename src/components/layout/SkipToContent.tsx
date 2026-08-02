const MAIN_CONTENT_ID = 'main-content';

/**
 * First focusable element in the shell, so keyboard users can bypass the sidebar.
 * The target is resolved at activation time rather than requiring every page shell to
 * label its own <main>, which keeps the behaviour identical across all role dashboards.
 */
export function SkipToContent() {
    const focusMainContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
        const main = document.querySelector('main');
        if (!main) return;

        event.preventDefault();
        if (!main.id) main.id = MAIN_CONTENT_ID;
        // Containers are not focusable by default; -1 keeps it out of the Tab sequence.
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
        main.scrollIntoView({ block: 'start' });
    };

    return (
        <a
            href={`#${MAIN_CONTENT_ID}`}
            onClick={focusMainContent}
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-[var(--radius-control)] focus:bg-[var(--brand-active)] focus:px-4 focus:py-2 focus:text-[length:var(--type-button-size)] focus:font-semibold focus:text-white focus:shadow-[var(--shadow-lg)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-color)]"
        >
            Skip to main content
        </a>
    );
}
