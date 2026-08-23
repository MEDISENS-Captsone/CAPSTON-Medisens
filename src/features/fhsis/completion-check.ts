import { deriveReportTotals } from './calculations';
import { getFhsisTemplate } from './template';
import { formatFhsisReportStatus } from './status';
import { isEditableTemplateValue, validateFhsisReportValues } from './validation';
import type { FhsisReportValue } from './types';

function expect(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

/** Executable Phase 3 gate: domain behavior is independent of UI and legacy FHSIS logs. */
export function verifyFhsisPhaseThreeCompletionGate(): void {
    const template = getFhsisTemplate('m1-brgy', 'v1');
    expect(formatFhsisReportStatus('for_verification') === 'For verification', 'Status formatting must be shared.');
    expect(isEditableTemplateValue(template, 'intrapartum-type-1', 'age_10_14'), 'Manual template values must be editable.');
    expect(!isEditableTemplateValue(template, 'intrapartum-delivery-type', 'total'), 'Declared totals must remain read-only.');

    const values: readonly FhsisReportValue[] = [
        { id: '1', reportId: 'report', indicatorKey: 'intrapartum-type-1', dimensionKey: 'age_10_14', value: 0, remarks: null, updatedBy: 'user', createdAt: '', updatedAt: '' },
        { id: '2', reportId: 'report', indicatorKey: 'intrapartum-type-2', dimensionKey: 'age_10_14', value: 3, remarks: null, updatedBy: 'user', createdAt: '', updatedAt: '' },
        { id: '3', reportId: 'report', indicatorKey: 'intrapartum-type-3', dimensionKey: 'age_10_14', value: 4, remarks: null, updatedBy: 'user', createdAt: '', updatedAt: '' },
    ];
    const totals = deriveReportTotals(template, {
        'intrapartum-type-1': { age_10_14: 0, age_15_19: 0, age_20_49: 0 },
        'intrapartum-type-2': { age_10_14: 3, age_15_19: 0, age_20_49: 0 },
        'intrapartum-type-3': { age_10_14: 4, age_15_19: 0, age_20_49: 0 },
    });
    expect(totals['intrapartum-delivery-type:total']?.value === 7, 'Declared totals must preserve explicit zero.');
    expect(!validateFhsisReportValues(template, values).some(finding => finding.message === 'Derived totals cannot be stored as editable report values.'), 'Manual values must validate without derived-value errors.');
}

verifyFhsisPhaseThreeCompletionGate();
