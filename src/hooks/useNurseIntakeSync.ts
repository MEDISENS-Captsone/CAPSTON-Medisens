import { useCallback, useEffect, useRef, useState } from 'react';
import { isBackendReachable, NURSE_INTAKE_ENTITY, replayNurseIntakeOutbox } from '../features/consultation/nurseIntakeOffline';
import { createActorOfflineStore } from '../lib/offline';
import type { OutboxOperation } from '../lib/offline';
import type { NurseIntakeOutboxPayload } from '../features/consultation/nurseIntakeOffline';

export function useNurseIntakeSync(actorId: string | null) {
    const [isReachable, setIsReachable] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [queuedCount, setQueuedCount] = useState(0);
    const [blockedCount, setBlockedCount] = useState(0);
    const [blockedOperations, setBlockedOperations] = useState<OutboxOperation<NurseIntakeOutboxPayload>[]>([]);
    const runningRef = useRef(false);

    const sync = useCallback(async (force = false) => {
        if (!actorId || runningRef.current) return;
        runningRef.current = true;
        setIsSyncing(true);
        try {
            const reachable = await isBackendReachable();
            setIsReachable(reachable);
            if (reachable) await replayNurseIntakeOutbox(actorId, force);
            const queued = (await createActorOfflineStore(actorId).listOutboxOperations())
                .filter(item => item.entityType === NURSE_INTAKE_ENTITY);
            setQueuedCount(queued.length);
            setBlockedCount(queued.filter(item => item.status === 'blocked').length);
            setBlockedOperations(queued.filter(item => item.status === 'blocked') as OutboxOperation<NurseIntakeOutboxPayload>[]);
        } finally {
            runningRef.current = false;
            setIsSyncing(false);
        }
    }, [actorId]);

    useEffect(() => {
        if (!actorId) return;
        void sync();
        const handleConnectivity = () => { void sync(); };
        window.addEventListener('online', handleConnectivity);
        window.addEventListener('offline', handleConnectivity);
        const interval = window.setInterval(handleConnectivity, 30_000);
        return () => {
            window.removeEventListener('online', handleConnectivity);
            window.removeEventListener('offline', handleConnectivity);
            window.clearInterval(interval);
        };
    }, [actorId, sync]);

    return { isReachable, isSyncing, queuedCount, blockedCount, blockedOperations, refreshQueue: () => sync(false), retryNow: () => sync(true) };
}
