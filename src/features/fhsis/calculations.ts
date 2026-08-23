import { deriveAllDeclaredTotals, deriveDeclaredTotal } from './templates/m1-brgy/calculations';
import type { FhsisTemplate, FhsisValues } from './templates/m1-brgy/types';

export { deriveAllDeclaredTotals, deriveDeclaredTotal };

export function deriveReportTotals(template: FhsisTemplate, values: FhsisValues) {
    return deriveAllDeclaredTotals(template.derivedTotalRules, deriveLayoutTotals(template, values));
}

/**
 * Materializes totals declared by a layout's derived dimensions. The template,
 * rather than a UI convention, is the authority for which dimensions are
 * summed. Missing source values keep the derived value null.
 */
export function deriveLayoutTotals(template: FhsisTemplate, values: FhsisValues): FhsisValues {
    const layouts = new Map(template.layouts.map(layout => [layout.key, layout]));
    const result: Record<string, Record<string, number | null>> = Object.fromEntries(
        Object.entries(values).map(([indicatorKey, dimensions]) => [indicatorKey, { ...dimensions }]),
    );

    for (const section of template.sections) for (const subgroup of section.subgroups) for (const indicator of subgroup.indicators) {
        const layout = layouts.get(indicator.layoutKey);
        if (!layout) throw new Error(`Template layout not found: ${indicator.layoutKey}`);
        const dimensions = result[indicator.key] ??= {};
        for (const group of layout.columnGroups) {
            const manualValues = group.dimensions.filter(dimension => dimension.inputMode === 'manual').map(dimension => dimensions[dimension.key] ?? null);
            for (const target of group.dimensions.filter(dimension => dimension.inputMode === 'derived')) {
                dimensions[target.key] = manualValues.length > 0 && manualValues.every((value): value is number => value !== null)
                    ? manualValues.reduce((sum, value) => sum + value, 0)
                    : null;
            }
        }
    }
    return result;
}
