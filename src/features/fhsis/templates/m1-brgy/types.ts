/**
 * Renderer-agnostic description of the approved FHSIS M1 BRGY source form.
 * Display labels intentionally preserve the source wording; stable keys are
 * implementation identifiers and must never be used as the printed label.
 */
export type FhsisValue = number | null;

export type FhsisInputMode = 'manual' | 'derived';

export interface FhsisDimension {
    key: string;
    label: string;
    inputMode: FhsisInputMode;
}

export interface FhsisColumnGroup {
    label: string;
    dimensions: readonly FhsisDimension[];
}

export interface FhsisLayout {
    key: string;
    label: string;
    columnGroups: readonly FhsisColumnGroup[];
    supportsRemarks: boolean;
}

export interface FhsisDerivedTotalRule {
    key: string;
    /** Formula printed on the approved source form. */
    formulaLabel: string;
    targetIndicatorKey: string;
    targetDimensionKey: string;
    sourceIndicatorKeys: readonly string[];
    sourceDimensionKey: string;
}

export interface FhsisIndicator {
    key: string;
    label: string;
    order: number;
    layoutKey: string;
    /** Source page number within IMG_9233.JPG through IMG_9239.JPG. */
    sourcePage: number;
    subgroup?: string;
    required: boolean;
    zeroIsExplicitValue: true;
    derivedTotalRuleKeys?: readonly string[];
}

export interface FhsisSubgroup {
    key: string;
    label: string;
    order: number;
    indicators: readonly FhsisIndicator[];
}

export interface FhsisSection {
    key: string;
    label: string;
    order: number;
    subgroups: readonly FhsisSubgroup[];
}

export interface FhsisReportMetadataField {
    key: string;
    label: string;
    order: number;
}

export interface FhsisTemplate {
    key: 'm1-brgy';
    version: 'v1';
    title: 'M1 BRGY';
    source: readonly string[];
    reportMetadata: readonly FhsisReportMetadataField[];
    layouts: readonly FhsisLayout[];
    sections: readonly FhsisSection[];
    derivedTotalRules: readonly FhsisDerivedTotalRule[];
}

export type FhsisValues = Readonly<Record<string, Readonly<Record<string, FhsisValue>>>>;
