import { Button } from '../../../components/ui';
import { Icon } from '../../../components/shared/Icon';
import { printHtmlDocument } from '../../../lib/utils/print';
import { buildFhsisOfficialPrintHtml, downloadFhsisOfficialCsv } from '../export';
import type { FhsisReportDetail } from '../types';

export function FhsisOfficialExportActions({ detail, compact = false, disabled = false, printLabel, downloadLabel }: { detail: FhsisReportDetail; compact?: boolean; disabled?: boolean; printLabel?: string; downloadLabel?: string }) {
    if (detail.report.status !== 'verified') return null;
    const print = () => { printHtmlDocument(buildFhsisOfficialPrintHtml(detail)); };
    return <div className="fhsis-export-actions" aria-label="Verified report export actions">
        <Button variant="outline" size={compact ? 'sm' : 'md'} disabled={disabled} leadingIcon={<Icon name="printer" />} onClick={print}>{printLabel ?? (compact ? 'Print' : 'Print official report')}</Button>
        <Button variant="outline" size={compact ? 'sm' : 'md'} disabled={disabled} leadingIcon={<Icon name="file-text" />} onClick={() => downloadFhsisOfficialCsv(detail)}>{downloadLabel ?? (compact ? 'Download' : 'Download spreadsheet')}</Button>
    </div>;
}
