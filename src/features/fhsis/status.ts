import type { FhsisReportStatus } from './types';

const statusLabels: Readonly<Record<FhsisReportStatus, string>> = {
    draft: 'Draft', for_verification: 'For verification', returned: 'Returned for correction', verified: 'Verified',
};

export function formatFhsisReportStatus(status: FhsisReportStatus): string {
    return statusLabels[status];
}
