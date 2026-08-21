import type { FhsisDerivedTotalRule, FhsisValue, FhsisValues } from './types';

export interface DerivedTotalResult {
    value: FhsisValue;
    isComplete: boolean;
}

/**
 * Calculates only formulas explicitly printed on the approved M1 BRGY form.
 * A missing source value remains missing; it is never silently treated as 0.
 */
export function deriveDeclaredTotal(
    rule: FhsisDerivedTotalRule,
    values: FhsisValues,
): DerivedTotalResult {
    const sourceValues = rule.sourceIndicatorKeys.map(
        indicatorKey => values[indicatorKey]?.[rule.sourceDimensionKey] ?? null,
    );

    if (sourceValues.some((value): value is null => value === null)) {
        return { value: null, isComplete: false };
    }

    return {
        value: (sourceValues as number[]).reduce((sum, value) => sum + value, 0),
        isComplete: true,
    };
}

export function deriveAllDeclaredTotals(
    rules: readonly FhsisDerivedTotalRule[],
    values: FhsisValues,
): Readonly<Record<string, DerivedTotalResult>> {
    return Object.fromEntries(
        rules.map(rule => [`${rule.targetIndicatorKey}:${rule.targetDimensionKey}`, deriveDeclaredTotal(rule, values)]),
    );
}
