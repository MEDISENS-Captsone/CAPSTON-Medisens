import type { FhsisValue } from './templates/m1-brgy/types';

export type FhsisReportStatus = 'draft' | 'for_verification' | 'returned' | 'verified';
export type FhsisReviewAction = 'review_note' | 'returned' | 'verified';

export interface FhsisReport {
    id: string;
    reportType: 'm1-brgy';
    templateVersion: string;
    reportingMonth: string;
    barangayName: string;
    bhsName: string;
    municipalityCityName: string;
    provinceName: string;
    projectedPopulation: number;
    status: FhsisReportStatus;
    createdBy: string;
    submittedAt: string | null;
    verifiedBy: string | null;
    verifiedAt: string | null;
    returnedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface FhsisReportValue {
    id: string;
    reportId: string;
    indicatorKey: string;
    dimensionKey: string;
    value: FhsisValue;
    remarks: string | null;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface FhsisReportReview {
    id: string;
    reportId: string;
    reviewerId: string;
    action: FhsisReviewAction;
    reason: string | null;
    notes: string | null;
    createdAt: string;
}

export interface FhsisReportContext {
    reportingMonth: string;
    barangayName: string;
    bhsName: string;
}

export interface CreateFhsisReportInput extends FhsisReportContext {
    municipalityCityName: string;
    provinceName: string;
    projectedPopulation: number;
}

export interface SaveFhsisReportValueInput {
    reportId: string;
    indicatorKey: string;
    dimensionKey: string;
    value: FhsisValue;
    remarks?: string | null;
}

export interface FhsisReportDetail {
    report: FhsisReport;
    values: readonly FhsisReportValue[];
    reviews: readonly FhsisReportReview[];
}

export type FhsisValidationSeverity = 'error' | 'warning';

export interface FhsisValidationFinding {
    sectionKey: string;
    subgroupKey: string;
    indicatorKey: string;
    dimensionKey: string | null;
    severity: FhsisValidationSeverity;
    message: string;
}
