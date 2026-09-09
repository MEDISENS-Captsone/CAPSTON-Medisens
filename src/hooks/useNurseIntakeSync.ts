import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import { isActiveNurseActor, isBackendReachable, NURSE_INTAKE_ENTITY, replayNurseIntakeOutbox } from '../features/consultation/nurseIntakeOffline';
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
    const runVersionRef = useRef(0);

    const clearVisibleQueue = useCallback(() => {
        setIsReachable(false);
        setIsSyncing(false);
        setQueuedCount(0);
        setBlockedCount(0);
        setBlockedOperations([]);
    }, []);

    const sync = useCallback(async (force = false) => {
        if (!actorId || runningRef.current) return;
        const runVersion = runVersionRef.current;
        if (!(await isActiveNurseActor(actorId))) {
            if (runVersion === runVersionRef.current) clearVisibleQueue();
            return;
        }
        runningRef.current = true;
        setIsSyncing(true);
        try {
            const reachable = await isBackendReachable();
            if (runVersion !== runVersionRef.current || !(await isActiveNurseActor(actorId))) return;
            setIsReachable(reachable);
            if (reachable) await replayNurseIntakeOutbox(actorId, force);
            if (runVersion !== runVersionRef.current || !(await isActiveNurseActor(actorId))) return;
            const queued = (await createActorOfflineStore(actorId).listOutboxOperations())
                .filter(item => item.entityType === NURSE_INTAKE_ENTITY);
            if (runVersion !== runVersionRef.current || !(await isActiveNurseActor(actorId))) return;
            setQueuedCount(queued.length);
            setBlockedCount(queued.filter(item => item.status === 'blocked').length);
            setBlockedOperations(queued.filter(item => item.status === 'blocked') as OutboxOperation<NurseIntakeOutboxPayload>[]);
        } finally {
            runningRef.current = false;
            setIsSyncing(false);
        }
    }, [actorId, clearVisibleQueue]);

    useEffect(() => {
        runVersionRef.current += 1;
        clearVisibleQueue();
        if (!actorId) return;
        void sync();
        const handleConnectivity = () => { void sync(); };
        window.addEventListener('online', handleConnectivity);
        window.addEventListener('offline', handleConnectivity);
        const interval = window.setInterval(handleConnectivity, 30_000);
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session?.user || session.user.id !== actorId) {
                runVersionRef.current += 1;
                clearVisibleQueue();
            }
        });
        return () => {
            runVersionRef.current += 1;
            window.removeEventListener('online', handleConnectivity);
            window.removeEventListener('offline', handleConnectivity);
            window.clearInterval(interval);
            subscription.unsubscribe();
        };
    }, [actorId, clearVisibleQueue, sync]);

    return { isReachable, isSyncing, queuedCount, blockedCount, blockedOperations, refreshQueue: () => sync(false), retryNow: () => sync(true) };
}
