import { M1_BRGY_V1 } from './templates/m1-brgy/v1';
import type { FhsisSection, FhsisTemplate } from './templates/m1-brgy/types';

export function getFhsisTemplate(reportType: string, templateVersion: string): FhsisTemplate {
    if (reportType === 'm1-brgy' && templateVersion === M1_BRGY_V1.version) return M1_BRGY_V1;
    throw new Error(`Unsupported FHSIS report template: ${reportType}/${templateVersion}`);
}

/** Strips the printed "SECTION X." prefix, keeping the readable section title. */
export function fhsisSectionLabel(section: FhsisSection): string {
    return section.label.replace(/^SECTION\s+[A-Z]+\.\s*/i, '');
}

/** Builds "Indicator — Dimension" labels for every editable/derived field in a template. */
export function fhsisFieldLabels(template: FhsisTemplate): Map<string, string> {
    const layouts = new Map(template.layouts.map(layout => [layout.key, layout]));
    const labels = new Map<string, string>();
    for (const section of template.sections) for (const group of section.subgroups) for (const indicator of group.indicators) {
        for (const dimension of layouts.get(indicator.layoutKey)?.columnGroups.flatMap(column => column.dimensions) ?? []) labels.set(`${indicator.key}:${dimension.key}`, `${indicator.label} — ${dimension.label}`);
    }
    return labels;
}
