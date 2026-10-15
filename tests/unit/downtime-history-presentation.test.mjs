import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

const bundled = await build({
    entryPoints: ['src/features/downtime-import/historyPresentation.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
});
const historyModule = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);

test('history errors distinguish schema, authorization, connection, and unknown failures', () => {
    assert.equal(historyModule.classifyHistoryError({ code: '42P01' }, true), 'schema');
    assert.equal(historyModule.classifyHistoryError({ code: '42501' }, true), 'authorization');
    assert.equal(historyModule.classifyHistoryError({ code: 'PGRST301' }, true), 'session');
    assert.equal(historyModule.classifyHistoryError(new Error('Failed to fetch'), true), 'connection');
    assert.equal(historyModule.classifyHistoryError({ code: 'PGRST116', message: 'No rows' }, true), 'unknown');
    assert.doesNotMatch(historyModule.getHistoryErrorMessage(historyModule.classifyHistoryError({ code: 'PGRST116' }, true)), /connection/i);
});

test('history statuses reflect successful, partial, and rejected batches', () => {
    assert.equal(historyModule.getHistoryBatchOutcome('COMPLETED', { imported: 3, duplicates: 0, rejected: 0, skipped: 0 }).label, 'Completed');
    assert.equal(historyModule.getHistoryBatchOutcome('COMPLETED', { imported: 2, duplicates: 1, rejected: 0, skipped: 0 }).label, 'Partially imported');
    assert.equal(historyModule.getHistoryBatchOutcome('COMPLETED_WITH_ERRORS', { imported: 2, duplicates: 0, rejected: 1, skipped: 0 }).label, 'Partially imported');
    assert.equal(historyModule.getHistoryBatchOutcome('REJECTED', { imported: 0, duplicates: 0, rejected: 3, skipped: 0 }).label, 'Rejected');
});
