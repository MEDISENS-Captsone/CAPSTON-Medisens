import { deriveLayoutTotals, deriveReportTotals } from './calculations';
import type { FhsisReportValue, FhsisValidationFinding } from './types';
import type { FhsisDimension, FhsisIndicator, FhsisTemplate, FhsisValues } from './templates/m1-brgy/types';

interface TemplateField {
    sectionKey: string;
    subgroupKey: string;
    indicator: FhsisIndicator;
    dimension: FhsisDimension;
}

function templateFields(template: FhsisTemplate): readonly TemplateField[] {
    const layouts = new Map(template.layouts.map(layout => [layout.key, layout]));
    const fields: TemplateField[] = [];
    for (const section of template.sections) for (const subgroup of section.subgroups) for (const indicator of subgroup.indicators) {
        const layout = layouts.get(indicator.layoutKey);
        if (!layout) throw new Error(`Template layout not found: ${indicator.layoutKey}`);
        for (const group of layout.columnGroups) for (const dimension of group.dimensions) {
            fields.push({ sectionKey: section.key, subgroupKey: subgroup.key, indicator, dimension });
        }
    }
    return fields;
}

export function reportValuesToTemplateValues(values: readonly FhsisReportValue[]): FhsisValues {
    const byIndicator: Record<string, Record<string, number | null>> = {};
    for (const row of values) {
        const dimensions = byIndicator[row.indicatorKey] ??= {};
        dimensions[row.dimensionKey] = row.value;
    }
    return byIndicator;
}

export function isEditableTemplateValue(template: FhsisTemplate, indicatorKey: string, dimensionKey: string): boolean {
    return templateFields(template).some(field =>
        field.indicator.key === indicatorKey
        && field.dimension.key === dimensionKey
        && field.dimension.inputMode === 'manual',
    );
}

export function validateFhsisReportValues(template: FhsisTemplate, values: readonly FhsisReportValue[]): readonly FhsisValidationFinding[] {
    const fields = templateFields(template);
    const fieldByKey = new Map(fields.map(field => [`${field.indicator.key}:${field.dimension.key}`, field]));
    const findings: FhsisValidationFinding[] = [];

    for (const value of values) {
        const field = fieldByKey.get(`${value.indicatorKey}:${value.dimensionKey}`);
        if (!field) {
            findings.push({
                sectionKey: 'unknown', subgroupKey: 'unknown', indicatorKey: value.indicatorKey, dimensionKey: value.dimensionKey,
                severity: 'error', message: 'This stored value is not defined by the report template.',
            });
            continue;
        }
        if (field.dimension.inputMode === 'derived') {
            findings.push({
                sectionKey: field.sectionKey, subgroupKey: field.subgroupKey, indicatorKey: value.indicatorKey, dimensionKey: value.dimensionKey,
                severity: 'error', message: 'Derived totals cannot be stored as editable report values.',
            });
        }
        if (value.value !== null && (!Number.isInteger(value.value) || value.value < 0)) {
            findings.push({
                sectionKey: field.sectionKey, subgroupKey: field.subgroupKey, indicatorKey: value.indicatorKey, dimensionKey: value.dimensionKey,
                severity: 'error', message: 'Values must be non-negative whole numbers.',
            });
        }
    }

    const templateValues = reportValuesToTemplateValues(values);
    for (const field of fields) {
        if (!field.indicator.required || field.dimension.inputMode !== 'manual') continue;
        if (templateValues[field.indicator.key]?.[field.dimension.key] === undefined || templateValues[field.indicator.key]?.[field.dimension.key] === null) {
            findings.push({
                sectionKey: field.sectionKey, subgroupKey: field.subgroupKey, indicatorKey: field.indicator.key, dimensionKey: field.dimension.key,
                severity: 'error', message: 'A required report value has not been encoded.',
            });
        }
    }

    const computedValues = deriveLayoutTotals(template, templateValues);
    for (const [key, total] of Object.entries(deriveReportTotals(template, computedValues))) {
        if (!total.isComplete) {
            const [indicatorKey, dimensionKey] = key.split(':');
            const field = fieldByKey.get(key);
            if (field && indicatorKey && dimensionKey) {
                findings.push({
                    sectionKey: field.sectionKey, subgroupKey: field.subgroupKey, indicatorKey, dimensionKey,
                    severity: 'warning', message: 'This declared total remains incomplete until all source values are encoded.',
                });
            }
        }
    }

    return findings;
}
