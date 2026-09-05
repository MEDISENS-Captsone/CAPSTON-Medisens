import {
    OFFLINE_SCHEMA_VERSION,
    type DraftInput,
    type OfflineDraft,
    type OfflineUuid,
    type OutboxOperation,
    type OutboxOperationInput,
    type ReferenceCacheEntry,
    type SyncMetaEntry,
} from './types';

export const OFFLINE_DATABASE_NAME = 'MediSensOffline';
export const OFFLINE_DATABASE_VERSION = 1;

// The legacy `MediSensDB/offline_patients` database is intentionally separate.
// O2B never opens, migrates, reads, deletes, or replays those unscoped records.
export const LEGACY_OFFLINE_DATABASE_NAME = 'MediSensDB';
export const LEGACY_OFFLINE_STORE_NAME = 'offline_patients';

export const OFFLINE_STORES = {
    drafts: 'drafts',
    outbox: 'outbox',
    referenceCache: 'referenceCache',
    syncMeta: 'syncMeta',
} as const;

const ACTOR_INDEX = 'byActor';

function requireActorId(actorId: string): string {
    const normalized = actorId.trim();
    if (!normalized) throw new Error('An authenticated actor ID is required for offline storage.');
    return normalized;
}

function requireUuid(value: string, fieldName: string): OfflineUuid {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error(`${fieldName} must be a UUID.`);
    }
    return value as OfflineUuid;
}

export function createOperationId(): OfflineUuid {
    if (!globalThis.crypto?.randomUUID) {
        throw new Error('Secure UUID generation is unavailable in this browser.');
    }
    return requireUuid(globalThis.crypto.randomUUID(), 'operationId');
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    });
}

export function openOfflineDatabase(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));

    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(OFFLINE_DATABASE_NAME, OFFLINE_DATABASE_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(OFFLINE_STORES.drafts)) {
                const store = db.createObjectStore(OFFLINE_STORES.drafts, { keyPath: ['actorId', 'draftId'] });
                store.createIndex(ACTOR_INDEX, 'actorId', { unique: false });
                store.createIndex('byActorAndRoute', ['actorId', 'route'], { unique: false });
            }

            if (!db.objectStoreNames.contains(OFFLINE_STORES.outbox)) {
                const store = db.createObjectStore(OFFLINE_STORES.outbox, { keyPath: ['actorId', 'operationId'] });
                store.createIndex(ACTOR_INDEX, 'actorId', { unique: false });
                store.createIndex('byActorAndStatus', ['actorId', 'status'], { unique: false });
                store.createIndex('byActorAndCreatedAt', ['actorId', 'createdAt'], { unique: false });
            }

            if (!db.objectStoreNames.contains(OFFLINE_STORES.referenceCache)) {
                const store = db.createObjectStore(OFFLINE_STORES.referenceCache, {
                    keyPath: ['actorId', 'namespace', 'cacheKey'],
                });
                store.createIndex(ACTOR_INDEX, 'actorId', { unique: false });
                store.createIndex('byActorAndNamespace', ['actorId', 'namespace'], { unique: false });
            }

            if (!db.objectStoreNames.contains(OFFLINE_STORES.syncMeta)) {
                const store = db.createObjectStore(OFFLINE_STORES.syncMeta, { keyPath: ['actorId', 'metaKey'] });
                store.createIndex(ACTOR_INDEX, 'actorId', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Unable to open offline storage.'));
        request.onblocked = () => reject(new Error('Offline storage upgrade is blocked by another app tab.'));
    });
}

async function withStore<T>(
    storeName: (typeof OFFLINE_STORES)[keyof typeof OFFLINE_STORES],
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await openOfflineDatabase();
    try {
        const transaction = db.transaction(storeName, mode);
        const completed = transactionDone(transaction);
        const result = await requestResult(action(transaction.objectStore(storeName)));
        await completed;
        return result;
    } finally {
        db.close();
    }
}

async function getAllForActor<T>(
    storeName: (typeof OFFLINE_STORES)[keyof typeof OFFLINE_STORES],
    actorId: string,
): Promise<T[]> {
    const scopedActorId = requireActorId(actorId);
    return withStore(storeName, 'readonly', (store) => store.index(ACTOR_INDEX).getAll(scopedActorId));
}

export class ActorOfflineStore {
    public readonly actorId: string;

    public constructor(actorId: string) {
        this.actorId = requireActorId(actorId);
    }

    async putDraft<TPayload>(input: DraftInput<TPayload>): Promise<OfflineDraft<TPayload>> {
        const now = new Date().toISOString();
        const draft: OfflineDraft<TPayload> = {
            actorId: this.actorId,
            draftId: input.draftId ? requireUuid(input.draftId, 'draftId') : createOperationId(),
            schemaVersion: OFFLINE_SCHEMA_VERSION,
            route: input.route,
            patientContextId: input.patientContextId ?? null,
            payload: input.payload,
            createdAt: input.createdAt ?? now,
            updatedAt: now,
        };
        await withStore(OFFLINE_STORES.drafts, 'readwrite', (store) => store.put(draft));
        return draft;
    }

    listDrafts<TPayload = unknown>(): Promise<OfflineDraft<TPayload>[]> {
        return getAllForActor(OFFLINE_STORES.drafts, this.actorId);
    }

    async deleteDraft(draftId: OfflineUuid): Promise<void> {
        await withStore(OFFLINE_STORES.drafts, 'readwrite', (store) =>
            store.delete([this.actorId, requireUuid(draftId, 'draftId')]),
        );
    }

    async putOutboxOperation<TPayload>(input: OutboxOperationInput<TPayload>): Promise<OutboxOperation<TPayload>> {
        const now = new Date().toISOString();
        const operation: OutboxOperation<TPayload> = {
            actorId: this.actorId,
            operationId: input.operationId ? requireUuid(input.operationId, 'operationId') : createOperationId(),
            schemaVersion: OFFLINE_SCHEMA_VERSION,
            entityType: input.entityType,
            operationType: input.operationType,
            serverRecordId: input.serverRecordId ?? null,
            baseRevision: input.baseRevision ?? null,
            dependencyOperationIds: (input.dependencyOperationIds ?? []).map((id) => requireUuid(id, 'dependencyOperationId')),
            payload: input.payload,
            status: input.status ?? 'pending',
            attemptCount: input.attemptCount ?? 0,
            lastAttemptAt: input.lastAttemptAt ?? null,
            nextAttemptAt: input.nextAttemptAt ?? null,
            lastErrorCode: input.lastErrorCode ?? null,
            conflict: input.conflict ?? null,
            createdAt: input.createdAt ?? now,
            updatedAt: now,
        };
        await withStore(OFFLINE_STORES.outbox, 'readwrite', (store) => store.put(operation));
        return operation;
    }

    listOutboxOperations<TPayload = unknown>(): Promise<OutboxOperation<TPayload>[]> {
        return getAllForActor(OFFLINE_STORES.outbox, this.actorId);
    }

    async getOutboxOperation<TPayload = unknown>(operationId: OfflineUuid): Promise<OutboxOperation<TPayload> | undefined> {
        return withStore(OFFLINE_STORES.outbox, 'readonly', (store) =>
            store.get([this.actorId, requireUuid(operationId, 'operationId')]),
        );
    }

    async deleteOutboxOperation(operationId: OfflineUuid): Promise<void> {
        await withStore(OFFLINE_STORES.outbox, 'readwrite', (store) =>
            store.delete([this.actorId, requireUuid(operationId, 'operationId')]),
        );
    }

    async putReference<TValue>(entry: Omit<ReferenceCacheEntry<TValue>, 'actorId' | 'schemaVersion'>): Promise<void> {
        await withStore(OFFLINE_STORES.referenceCache, 'readwrite', (store) => store.put({
            ...entry,
            actorId: this.actorId,
            schemaVersion: OFFLINE_SCHEMA_VERSION,
        } satisfies ReferenceCacheEntry<TValue>));
    }

    listReferences<TValue = unknown>(): Promise<ReferenceCacheEntry<TValue>[]> {
        return getAllForActor(OFFLINE_STORES.referenceCache, this.actorId);
    }

    async putSyncMeta<TValue>(entry: Omit<SyncMetaEntry<TValue>, 'actorId' | 'schemaVersion'>): Promise<void> {
        await withStore(OFFLINE_STORES.syncMeta, 'readwrite', (store) => store.put({
            ...entry,
            actorId: this.actorId,
            schemaVersion: OFFLINE_SCHEMA_VERSION,
        } satisfies SyncMetaEntry<TValue>));
    }

    listSyncMeta<TValue = unknown>(): Promise<SyncMetaEntry<TValue>[]> {
        return getAllForActor(OFFLINE_STORES.syncMeta, this.actorId);
    }
}

export function createActorOfflineStore(actorId: string): ActorOfflineStore {
    return new ActorOfflineStore(actorId);
}
