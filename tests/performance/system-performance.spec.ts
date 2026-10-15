import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const pages = [
  '/', '/pages/login.html', '/pages/privacy-policy.html', '/pages/terms-of-service.html',
  '/pages/templates.html', '/pages/details.html', '/pages/records.html', '/pages/doctor.html',
  '/pages/consultation.html', '/pages/lab_request.html', '/pages/initial_consultation.html',
  '/pages/follow_up_visitation.html', '/pages/nurse.html', '/pages/bhw.html', '/pages/pharmacist.html',
  '/pages/laboratory.html', '/pages/midwife.html', '/pages/admin.html', '/pages/patient.html',
] as const;

type Metric = { project: string; path: string; url: string; status: number | null; durationMs: number; metrics: Record<string, number | null>; requests: number; transferredBytes: number; failedRequests: string[]; consoleErrors: string[]; };

const reportDir = path.resolve('test-results', 'performance');

test.describe('MEDISENS whole-system browser performance', () => {
  test('exports navigation and Web Vitals for every entry page', async ({ browser, baseURL }, testInfo) => {
    const results: Metric[] = [];
    for (const entry of pages) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const failedRequests: string[] = [];
      const consoleErrors: string[] = [];
      let requests = 0;
      let transferredBytes = 0;
      page.on('request', () => { requests += 1; });
      page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`));
      page.on('response', async response => {
        const length = response.headers()['content-length'];
        if (length) transferredBytes += Number(length) || 0;
      });
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      const started = Date.now();
      let status: number | null = null;
      try {
        const response = await page.goto(entry, { waitUntil: 'load' });
        status = response?.status() ?? null;
        await page.waitForTimeout(250);
        const metrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          const paints = performance.getEntriesByType('paint');
          const paint = (name: string) => paints.find(item => item.name === name)?.startTime ?? null;
          return {
            ttfb: navigation ? navigation.responseStart - navigation.requestStart : null,
            domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
            load: navigation?.loadEventEnd ?? null,
            fcp: paint('first-contentful-paint'),
            lcp: (performance.getEntriesByType('largest-contentful-paint').at(-1) as PerformanceEntry | undefined)?.startTime ?? null,
            cls: performance.getEntriesByType('layout-shift').reduce((sum, entry) => sum + ((entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }).hadRecentInput ? 0 : ((entry as PerformanceEntry & { value?: number }).value ?? 0)), 0),
          };
        });
        results.push({ project: testInfo.project.name, path: entry, url: new URL(entry, baseURL).toString(), status, durationMs: Date.now() - started, metrics, requests, transferredBytes, failedRequests, consoleErrors });
      } finally { await context.close(); }
    }
    await mkdir(reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(reportDir, `performance-${testInfo.project.name}-${stamp}.json`);
    await writeFile(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), baseURL, results }, null, 2), 'utf8');
    const csv = ['project,path,status,durationMs,ttfb,domContentLoaded,load,fcp,requests,transferredBytes,failedRequests,consoleErrors', ...results.map(r => [r.project, r.path, r.status, r.durationMs, r.metrics.ttfb, r.metrics.domContentLoaded, r.metrics.load, r.metrics.fcp, r.requests, r.transferredBytes, r.failedRequests.length, r.consoleErrors.length].map(value => JSON.stringify(value ?? '')).join(','))].join('\n');
    await writeFile(path.join(reportDir, `performance-${testInfo.project.name}-${stamp}.csv`), csv, 'utf8');
    const worksheet = XLSX.utils.json_to_sheet(results.map(r => ({
      project: r.project,
      path: r.path,
      url: r.url,
      status: r.status,
      durationMs: r.durationMs,
      ttfbMs: r.metrics.ttfb,
      domContentLoadedMs: r.metrics.domContentLoaded,
      loadMs: r.metrics.load,
      fcpMs: r.metrics.fcp,
      lcpMs: r.metrics.lcp,
      cls: r.metrics.cls,
      requests: r.requests,
      transferredBytes: r.transferredBytes,
      failedRequests: r.failedRequests.length,
      consoleErrors: r.consoleErrors.length,
      failedRequestDetails: r.failedRequests.join('\n'),
      consoleErrorDetails: r.consoleErrors.join('\n'),
    })));
    worksheet['!cols'] = [
      { wch: 26 }, { wch: 12 }, { wch: 48 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 48 }, { wch: 48 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Performance');
    const xlsxPath = path.join(reportDir, `performance-${testInfo.project.name}-${stamp}.xlsx`);
    XLSX.writeFile(workbook, xlsxPath);
    const rows = results.map(r => `<tr><td>${r.path}</td><td>${r.status ?? ''}</td><td>${r.durationMs}</td><td>${r.metrics.fcp ?? ''}</td><td>${r.metrics.lcp ?? ''}</td><td>${r.metrics.cls ?? ''}</td><td>${r.requests}</td><td>${r.failedRequests.length}</td></tr>`).join('');
    await writeFile(path.join(reportDir, `performance-${testInfo.project.name}-${stamp}.html`), `<!doctype html><meta charset="utf-8"><title>MEDISENS performance</title><style>body{font:14px system-ui;margin:2rem;color:#14212a}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dde3e6;padding:8px;text-align:left}th{background:#eef4f6}</style><h1>MEDISENS performance — ${testInfo.project.name}</h1><p>Generated ${new Date().toISOString()}</p><table><thead><tr><th>Path</th><th>Status</th><th>Duration (ms)</th><th>FCP (ms)</th><th>LCP (ms)</th><th>CLS</th><th>Requests</th><th>Failures</th></tr></thead><tbody>${rows}</tbody></table>`, 'utf8');
    await testInfo.attach('performance-json', { path: jsonPath, contentType: 'application/json' });
    await testInfo.attach('performance-excel', { path: xlsxPath, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(results).toHaveLength(pages.length);
    expect(results.every(result => result.status === null || result.status < 500)).toBeTruthy();
  });
});
