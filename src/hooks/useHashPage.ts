import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

function readHash(): string {
    return window.location.hash.replace('#', '');
}

/**
 * Hash-backed page state shared by the role shells.
 *
 * The shells previously only wrote `window.location.hash` from state and read it
 * once on mount. A browser Back/Forward then rewound the URL without re-rendering,
 * leaving the address bar and the visible module permanently out of sync (and the
 * next Back press leaving the app instead of returning to the previous tab), so the
 * hash is also read back on `hashchange`.
 *
 * `normalize` lets a shell reject hashes that are not real modules for its role.
 */
export function useHashPage(
    defaultPage: string,
    normalize?: (page: string) => string,
): [string, Dispatch<SetStateAction<string>>] {
    // Held in a ref so an inline normalizer does not resubscribe the listener on
    // every render.
    const normalizeRef = useRef(normalize);
    normalizeRef.current = normalize;

    const resolve = (raw: string): string => {
        const next = normalizeRef.current ? normalizeRef.current(raw) : raw;
        return next || defaultPage;
    };

    const [activePage, setActivePage] = useState(() => resolve(readHash()));

    useEffect(() => {
        // Guarded so syncing from a `hashchange` does not write the hash straight back.
        if (readHash() !== activePage) window.location.hash = activePage;
    }, [activePage]);

    useEffect(() => {
        const syncFromHash = () => setActivePage(resolve(readHash()));
        window.addEventListener('hashchange', syncFromHash);
        return () => window.removeEventListener('hashchange', syncFromHash);
        // `resolve` reads through a ref, so the listener never needs re-binding.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultPage]);

    return [activePage, setActivePage];
}
