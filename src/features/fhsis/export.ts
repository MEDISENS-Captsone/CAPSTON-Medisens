import { deriveLayoutTotals } from './calculations';
import { getFhsisTemplate } from './template';
import type { FhsisReportDetail } from './types';
import { reportValuesToTemplateValues } from './validation';

const escapeHtml = (value: string | number | null | undefined) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const csvCell = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function reportMetadata(detail: FhsisReportDetail): readonly [string, string | number][] {
    const report = detail.report;
    const date = new Date(`${report.reportingMonth}T00:00:00`);
    return [
        ['FHSIS REPORT for the Month', date.toLocaleDateString('en-PH', { month: 'long' })],
        ['Year', date.getFullYear()],
        ['Name of Barangay', report.barangayName],
        ['Name of BHS', report.bhsName],
        ['Name of Municipality/City', report.municipalityCityName],
        ['Name of Province', report.provinceName],
        ['Projected Population of the Year', report.projectedPopulation],
    ];
}

export function buildFhsisOfficialCsv(detail: FhsisReportDetail): string {
    const template = getFhsisTemplate(detail.report.reportType, detail.report.templateVersion);
    const layouts = new Map(template.layouts.map(layout => [layout.key, layout]));
    const values = deriveLayoutTotals(template, reportValuesToTemplateValues(detail.values));
    const rows: string[] = [
        [template.title, template.version].map(csvCell).join(','),
        ...reportMetadata(detail).map(([label, value]) => [label, value].map(csvCell).join(',')),
        '',
    ];

    for (const section of template.sections) {
        rows.push([section.label].map(csvCell).join(','));
        for (const subgroup of section.subgroups) {
            rows.push([subgroup.label].map(csvCell).join(','));
            for (const indicator of subgroup.indicators) {
                const layout = layouts.get(indicator.layoutKey);
                if (!layout) continue;
                const dimensions = layout.columnGroups.flatMap(group => group.dimensions);
                const cells = dimensions.map(dimension => values[indicator.key]?.[dimension.key] ?? null);
                const remarks = detail.values.find(value => value.indicatorKey === indicator.key && value.remarks)?.remarks ?? '';
                rows.push([indicator.label, ...cells, remarks].map(csvCell).join(','));
            }
        }
    }
    return rows.join('\r\n');
}

export function buildFhsisOfficialPrintHtml(detail: FhsisReportDetail): string {
    const template = getFhsisTemplate(detail.report.reportType, detail.report.templateVersion);
    const layouts = new Map(template.layouts.map(layout => [layout.key, layout]));
    const values = deriveLayoutTotals(template, reportValuesToTemplateValues(detail.values));
    const sections = template.sections.map(section => {
        const groups = section.subgroups.map(subgroup => {
            const tables = new Map<string, typeof subgroup.indicators>();
            for (const indicator of subgroup.indicators) {
                const items = tables.get(indicator.layoutKey) ?? [];
                tables.set(indicator.layoutKey, [...items, indicator]);
            }
            const tableHtml = [...tables.entries()].map(([layoutKey, indicators]) => {
                const layout = layouts.get(layoutKey);
                if (!layout) return '';
                const dimensions = layout.columnGroups.flatMap(group => group.dimensions);
                const headers = dimensions.map(dimension => `<th>${escapeHtml(dimension.label)}</th>`).join('');
                const remarksHeader = layout.supportsRemarks ? '<th>Remarks</th>' : '';
                const rows = indicators.map(indicator => {
                    const cells = dimensions.map(dimension => `<td>${escapeHtml(values[indicator.key]?.[dimension.key] ?? '')}</td>`).join('');
                    const remarks = detail.values.find(value => value.indicatorKey === indicator.key && value.remarks)?.remarks ?? '';
                    return `<tr><th>${escapeHtml(indicator.label)}</th>${cells}${layout.supportsRemarks ? `<td>${escapeHtml(remarks)}</td>` : ''}</tr>`;
                }).join('');
                return `<table><thead><tr><th>Official indicator</th>${headers}${remarksHeader}</tr></thead><tbody>${rows}</tbody></table>`;
            }).join('');
            return `<h3>${escapeHtml(subgroup.label)}</h3>${tableHtml}`;
        }).join('');
        return `<section><h2>${escapeHtml(section.label)}</h2>${groups}</section>`;
    }).join('');
    const metadata = reportMetadata(detail).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(template.title)} ${escapeHtml(detail.report.reportingMonth)}</title><style>
        @page { size: legal landscape; margin: 10mm; } * { box-sizing: border-box; } body { color:#111; font: 9pt Arial, sans-serif; } h1 { font-size:16pt; text-align:center; margin:0 0 3mm; } h2 { font-size:11pt; background:#e8eef2; padding:2mm; margin:6mm 0 2mm; page-break-after:avoid; } h3 { font-size:9pt; margin:4mm 0 1.5mm; page-break-after:avoid; } dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2mm 6mm; margin:0 0 5mm; } dl div { display:flex; gap:2mm; } dt { font-weight:bold; } dd { margin:0; } table { border-collapse:collapse; width:100%; margin:0 0 3mm; page-break-inside:auto; } tr { page-break-inside:avoid; } th,td { border:1px solid #555; padding:1.2mm; vertical-align:top; text-align:right; } th:first-child { text-align:left; min-width:60mm; } thead th { background:#f1f5f7; text-align:center; } .footer { margin-top:6mm; font-size:8pt; color:#444; } </style></head><body><h1>${escapeHtml(template.title)} — Barangay Monthly Report</h1><dl>${metadata}</dl>${sections}<p class="footer">Template version: ${escapeHtml(detail.report.templateVersion)} · Status: Verified · Generated from stored FHSIS report values.</p></body></html>`;
}

export function downloadFhsisOfficialCsv(detail: FhsisReportDetail): void {
    const blob = new Blob([buildFhsisOfficialCsv(detail)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FHSIS_M1_BRGY_${detail.report.reportingMonth}_${detail.report.barangayName.replace(/[^a-z0-9]+/gi, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}
