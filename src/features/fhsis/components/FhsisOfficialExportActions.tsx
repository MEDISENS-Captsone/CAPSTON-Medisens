import { Button } from '../../../components/ui';
import { Icon } from '../../../components/shared/Icon';
import { printHtmlDocument } from '../../../lib/utils/print';
import { buildFhsisOfficialPrintHtml, downloadFhsisOfficialCsv } from '../export';
import type { FhsisReportDetail } from '../types';

export function FhsisOfficialExportActions({ detail, compact = false }: { detail: FhsisReportDetail; compact?: boolean }) {
    if (detail.report.status !== 'verified') return null;
    const print = () => { printHtmlDocument(buildFhsisOfficialPrintHtml(detail)); };
    return <div className="fhsis-export-actions" aria-label="Verified report export actions">
        <Button variant="outline" size={compact ? 'sm' : 'md'} leadingIcon={<Icon name="printer" />} onClick={print}>{compact ? 'Print' : 'Print official report'}</Button>
        <Button variant="outline" size={compact ? 'sm' : 'md'} leadingIcon={<Icon name="file-text" />} onClick={() => downloadFhsisOfficialCsv(detail)}>{compact ? 'Download' : 'Download spreadsheet'}</Button>
    </div>;
}
