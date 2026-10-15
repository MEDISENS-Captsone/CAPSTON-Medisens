export type HistoryErrorKind = 'session' | 'schema' | 'authorization' | 'connection' | 'unknown';
export type HistoryBatchStatus = 'REJECTED' | 'COMPLETED_WITH_ERRORS' | 'COMPLETED' | string;

export function classifyHistoryError(error: unknown, isOnline: boolean): HistoryErrorKind {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
    if (code === '42P01' || code === 'PGRST205') return 'schema';
    if (code === 'PGRST301') return 'session';
    if (code === '42501') return 'authorization';
    if (!isOnline || /failed to fetch|network|connection|timeout|load failed/i.test(message)) return 'connection';
    return 'unknown';
}

export function getHistoryErrorMessage(kind: HistoryErrorKind): string {
    switch (kind) {
        case 'session': return 'Your session is unavailable. Sign in again to view your import history.';
        case 'schema': return 'Import history is not configured in this database environment. Contact the system administrator.';
        case 'authorization': return 'Access to import history was denied. Contact the system administrator.';
        case 'connection': return 'A connection is unavailable. Check your connection and retry.';
        default: return 'Import history could not be loaded. Please retry; if the problem persists, contact the system administrator.';
    }
}

export function getHistoryBatchOutcome(
    status: HistoryBatchStatus,
    counts: { imported: number; duplicates: number; rejected: number; skipped: number },
): { label: string; tone: 'red' | 'amber' | 'green' } {
    if (status === 'REJECTED' || (counts.imported === 0 && counts.rejected > 0)) return { label: 'Rejected', tone: 'red' };
    if (status === 'COMPLETED_WITH_ERRORS' || counts.rejected > 0 || counts.skipped > 0 || (counts.imported > 0 && counts.duplicates > 0)) return { label: 'Partially imported', tone: 'amber' };
    return { label: 'Completed', tone: 'green' };
}
