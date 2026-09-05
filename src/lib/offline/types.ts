export const OFFLINE_SCHEMA_VERSION = 1 as const;

export type OfflineSchemaVersion = typeof OFFLINE_SCHEMA_VERSION;
export type OfflineUuid = `${string}-${string}-${string}-${string}-${string}`;
export type IsoTimestamp = string;

export interface ActorScope {
    actorId: string;
}

export interface OfflineDraft<TPayload = unknown> extends ActorScope {
    draftId: OfflineUuid;
    schemaVersion: OfflineSchemaVersion;
    route: string;
    patientContextId: string | null;
    payload: TPayload;
    createdAt: IsoTimestamp;
    updatedAt: IsoTimestamp;
}

export type OutboxOperationType = 'create' | 'update';
export type OutboxStatus = 'pending' | 'retry_wait' | 'blocked';

export interface OutboxConflict {
    kind: 'stale_snapshot';
    code: 'nurse_intake_stale_snapshot';
    detectedAt: IsoTimestamp;
    expectedLatestIntakeId: number | null;
    currentLatestIntakeId: number | null;
}

export interface OutboxOperation<TPayload = unknown> extends ActorScope {
    operationId: OfflineUuid;
    schemaVersion: OfflineSchemaVersion;
    entityType: string;
    operationType: OutboxOperationType;
    serverRecordId: string | number | null;
    baseRevision: number | null;
    dependencyOperationIds: OfflineUuid[];
    payload: TPayload;
    status: OutboxStatus;
    attemptCount: number;
    lastAttemptAt: IsoTimestamp | null;
    nextAttemptAt: IsoTimestamp | null;
    lastErrorCode: string | null;
    conflict: OutboxConflict | null;
    createdAt: IsoTimestamp;
    updatedAt: IsoTimestamp;
}

export interface ReferenceCacheEntry<TValue = unknown> extends ActorScope {
    namespace: string;
    cacheKey: string;
    schemaVersion: OfflineSchemaVersion;
    value: TValue;
    cachedAt: IsoTimestamp;
    expiresAt: IsoTimestamp | null;
}

export interface SyncMetaEntry<TValue = unknown> extends ActorScope {
    metaKey: string;
    schemaVersion: OfflineSchemaVersion;
    value: TValue;
    updatedAt: IsoTimestamp;
}

export interface DraftInput<TPayload> {
    draftId?: OfflineUuid;
    route: string;
    patientContextId?: string | null;
    payload: TPayload;
    createdAt?: IsoTimestamp;
}

interface OutboxOperationInputBase<TPayload> {
    operationId?: OfflineUuid;
    entityType: string;
    serverRecordId?: string | number | null;
    dependencyOperationIds?: OfflineUuid[];
    payload: TPayload;
    status?: OutboxStatus;
    attemptCount?: number;
    lastAttemptAt?: IsoTimestamp | null;
    nextAttemptAt?: IsoTimestamp | null;
    lastErrorCode?: string | null;
    conflict?: OutboxConflict | null;
    createdAt?: IsoTimestamp;
}

export type OutboxOperationInput<TPayload> = OutboxOperationInputBase<TPayload> & (
    | { operationType: 'create'; baseRevision?: null }
    | { operationType: 'update'; serverRecordId: string | number; baseRevision: number }
);
