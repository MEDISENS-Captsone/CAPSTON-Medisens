import { useEffect, useState } from 'react';

/**
 * Browser connectivity state only.
 *
 * Phase 0 intentionally leaves the legacy `MediSensDB/offline_patients`
 * database untouched: this hook does not open, read, write, replay, delete,
 * or migrate its existing sensitive records.
 */
export function useNetworkSync() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            document.body.classList.remove('offline-mode');
        };
        const handleOffline = () => {
            setIsOnline(false);
            document.body.classList.add('offline-mode');
        };

        if (!navigator.onLine) document.body.classList.add('offline-mode');

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return { isOnline };
}
