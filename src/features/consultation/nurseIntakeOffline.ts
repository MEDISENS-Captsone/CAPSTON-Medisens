import { supabase } from '../../lib/supabase/client';
import {
    createActorOfflineStore,
    type OfflineUuid,
    type OutboxOperation,
} from '../../lib/offline';
import { replayNurseInitialIntake, type NurseIntakeSnapshot, type WorkflowPayload } from './services';

export const NURSE_INTAKE_ENTITY = 'initial_consultation';

export interface NurseIntakeOutboxPayload {
    initial: WorkflowPayload;
    vitals: WorkflowPayload;
    patientName: string;
    snapshot: NurseIntakeSnapshot;
}

export type NurseIntakeReplayResult = {
    acknowledged: OfflineUuid[];
    retained: OfflineUuid[];
    blocked: OfflineUuid[];
};

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

export async function isBackendReachable(timeoutMs = 5_000): Promise<boolean> {
    if (!navigator.onLine) return false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
            method: 'HEAD',
            headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
            cache: 'no-store',
            signal: controller.signal,
        });
        return response.status > 0;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timeout);
    }
}

function isPermanentReplayError(error: unknown): boolean {
    const details = error && typeof error === 'object'
        ? `${'code' in error ? String(error.code) : ''} ${'message' in error ? String(error.message) : ''}`
        : String(error ?? '');
    return /42501|permission|restricted|unauthorized|validation_failed|invalid patient|must reference the same patient|violates|invalid input/i.test(details);
}

function dependencyOrder(operations: OutboxOperation<NurseIntakeOutboxPayload>[]): OutboxOperation<NurseIntakeOutboxPayload>[] {
    const byId = new Map(operations.map(operation => [operation.operationId, operation]));
    const visited = new Set<OfflineUuid>();
    const visiting = new Set<OfflineUuid>();
    const ordered: OutboxOperation<NurseIntakeOutboxPayload>[] = [];

    const visit = (operation: OutboxOperation<NurseIntakeOutboxPayload>) => {
        if (visited.has(operation.operationId)) return;
        if (visiting.has(operation.operationId)) return;
        visiting.add(operation.operationId);
        for (const dependencyId of operation.dependencyOperationIds) {
            const dependency = byId.get(dependencyId);
            if (dependency) visit(dependency);
        }
        visiting.delete(operation.operationId);
        visited.add(operation.operationId);
        ordered.push(operation);
    };

    [...operations].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(visit);
    return ordered;
}

async function replayNurseIntakeOutboxUnlocked(actorId: string, force: boolean): Promise<NurseIntakeReplayResult> {
    const store = createActorOfflineStore(actorId);
    const result: NurseIntakeReplayResult = { acknowledged: [], retained: [], blocked: [] };
    if (!(await isBackendReachable())) return result;

    const operations = (await store.listOutboxOperations<NurseIntakeOutboxPayload>())
        .filter(operation => operation.entityType === NURSE_INTAKE_ENTITY);
    const pendingIds = new Set(operations.map(operation => operation.operationId));
    const acknowledgedIds = new Set<OfflineUuid>();

    for (const operation of dependencyOrder(operations)) {
        if (operation.status === 'blocked') {
            result.blocked.push(operation.operationId);
            continue;
        }
        if (!force && operation.nextAttemptAt && Date.parse(operation.nextAttemptAt) > Date.now()) {
            result.retained.push(operation.operationId);
            continue;
        }
        const unresolvedDependency = operation.dependencyOperationIds.some(id => pendingIds.has(id) && !acknowledgedIds.has(id));
        if (unresolvedDependency) {
            result.retained.push(operation.operationId);
            continue;
        }

        try {
            if (!operation.payload.snapshot) {
                await store.putOutboxOperation({
                    ...operation,
                    status: 'blocked',
                    nextAttemptAt: null,
                    lastErrorCode: 'missing_intake_snapshot',
                });
                result.blocked.push(operation.operationId);
                continue;
            }
            const response = await replayNurseInitialIntake(
                operation.payload.initial,
                operation.payload.vitals,
                operation.operationId,
                operation.payload.snapshot,
            );
            if (response.outcome === 'conflict') {
                await store.putOutboxOperation({
                    ...operation,
                    status: 'blocked',
                    attemptCount: operation.attemptCount + 1,
                    lastAttemptAt: new Date().toISOString(),
                    nextAttemptAt: null,
                    lastErrorCode: response.code,
                    conflict: {
                        kind: 'stale_snapshot',
                        code: response.code,
                        detectedAt: new Date().toISOString(),
                        expectedLatestIntakeId: response.expectedLatestIntakeId,
                        currentLatestIntakeId: response.currentLatestIntakeId,
                    },
                });
                result.blocked.push(operation.operationId);
                continue;
            }
            if (response.outcome !== 'success' && response.outcome !== 'already_applied') {
                throw new Error(`${response.outcome}: ${response.message ?? 'Nurse intake replay was rejected'}`);
            }
            await store.deleteOutboxOperation(operation.operationId);
            acknowledgedIds.add(operation.operationId);
            result.acknowledged.push(operation.operationId);
        } catch (error) {
            const attemptCount = operation.attemptCount + 1;
            const permanent = isPermanentReplayError(error);
            const delay = Math.min(RETRY_BASE_MS * 2 ** Math.min(attemptCount - 1, 6), RETRY_MAX_MS);
            await store.putOutboxOperation({
                operationId: operation.operationId,
                entityType: operation.entityType,
                operationType: 'create',
                dependencyOperationIds: operation.dependencyOperationIds,
                payload: operation.payload,
                createdAt: operation.createdAt,
                status: permanent ? 'blocked' : 'retry_wait',
                attemptCount,
                lastAttemptAt: new Date().toISOString(),
                nextAttemptAt: permanent ? null : new Date(Date.now() + delay).toISOString(),
                lastErrorCode: permanent ? 'rejected' : 'transient',
                conflict: null,
            });
            (permanent ? result.blocked : result.retained).push(operation.operationId);
            if (!(await isBackendReachable())) break;
        }
    }
    return result;
}

const actorReplays = new Map<string, Promise<NurseIntakeReplayResult>>();

export function replayNurseIntakeOutbox(actorId: string, force = false): Promise<NurseIntakeReplayResult> {
    const existing = actorReplays.get(actorId);
    if (existing) return existing;

    const run = async () => {
        if (navigator.locks) {
            return navigator.locks.request(`medisens-nurse-intake-replay:${actorId}`, () =>
                replayNurseIntakeOutboxUnlocked(actorId, force),
            );
        }
        return replayNurseIntakeOutboxUnlocked(actorId, force);
    };
    const replay = run().finally(() => actorReplays.delete(actorId));
    actorReplays.set(actorId, replay);
    return replay;
}

export async function getCurrentNurseActorId(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user.id) throw new Error('An authenticated nurse session is required.');
    return session.user.id;
}
