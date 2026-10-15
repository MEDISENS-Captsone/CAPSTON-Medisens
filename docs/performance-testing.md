# MEDISENS Playwright performance testing

Run `npm run build` and then `npm run test:performance` to measure every Vite entry page in desktop and mobile Chromium. The suite starts a local Vite preview automatically, records navigation timing, FCP/LCP/CLS, request volume, transfer size, failed requests, and console errors, and exports timestamped JSON, CSV, HTML, and Excel (`.xlsx`) files to `test-results/performance/`. The Excel workbook contains a `Performance` sheet with one row per page and readable column widths. The standard Playwright report is written to `playwright-report/`.

To test an already-running deployment, set `PERF_BASE_URL` before running the command. Protected pages may redirect to login when no safe synthetic session is configured; this is reported as the observed result and does not embed credentials or clinical data.
