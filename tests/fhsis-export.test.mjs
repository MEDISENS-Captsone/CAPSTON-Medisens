import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

const bundled = await build({
    entryPoints: ['src/features/fhsis/export.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
});
const exportModule = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);

const syntheticDetail = {
    report: {
        id: 'synthetic-report',
        reportType: 'm1-brgy',
        templateVersion: 'v1',
        reportingMonth: '2026-09-01',
        barangayName: '=1+1',
        bhsName: 'BHS <script>alert(1)</script>',
        municipalityCityName: 'Malvar',
        provinceName: 'Batangas',
        projectedPopulation: 100,
        status: 'verified',
        createdBy: 'synthetic-user',
        submittedAt: null,
        verifiedBy: 'synthetic-user',
        verifiedAt: '2026-09-10T00:00:00Z',
        returnedAt: null,
        createdAt: '',
        updatedAt: '',
    },
    values: [{
        id: 'synthetic-value', reportId: 'synthetic-report', indicatorKey: 'maternal-8anc', dimensionKey: 'age_10_14',
        value: 12, remarks: '=HYPERLINK("https://example.invalid")', updatedBy: 'synthetic-user', createdAt: '', updatedAt: '',
    }],
    reviews: [],
};

test('official FHSIS CSV retains values and neutralizes spreadsheet formulas', () => {
    const csv = exportModule.buildFhsisOfficialCsv(syntheticDetail);
    assert.match(csv, /"'=1\+1"/);
    assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
    assert.match(csv, /\r\n/);
    assert.match(csv, /"12"/);
});

test('official FHSIS print HTML escapes report metadata and includes stored values', () => {
    const html = exportModule.buildFhsisOfficialPrintHtml(syntheticDetail);
    assert.equal(html.includes('<script>'), false);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /<td>12<\/td>/);
    assert.match(html, /Status: Verified/);
});
