// Extracted from src/app/laboratory/index.tsx (Phase L2). Pure move: no behavior changed.
import { useState, useEffect } from 'react';
import { Icon } from '../../components/shared/Icon';
import { supabase } from '../../lib/supabase/client';
import { logError } from '../../lib/utils/errors';
import { EmptyState } from '../../components/shared/EmptyState';
import { LabResultDetailModal, type LabResultData } from '../../components/shared/LabResultDetailModal';
import { formatDisplayDate } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// PatientLabHistory: shows all past lab results for a patient in a slide-over
// ─────────────────────────────────────────────────────────────────────────────
export function PatientLabHistory({
    patientId,
    patientName,
    onClose,
}: {
    patientId: number;
    patientName: string;
    onClose: () => void;
}) {
    const [historyItems, setHistoryItems] = useState<(LabResultData & { id: number; testSummary: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedResult, setSelectedResult] = useState<LabResultData | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('lab_result')
                    .select(`
                        labresult_id, patient_id, consultation_id,
                        labrequest_id, date_performed, findings,
                        performed_by, status,
                        lab_request(lab_no, is_clinical_microscopy, is_blood_chemistry,
                            is_pregnancy_test, is_hbsag_screening, is_hiv_screening,
                            is_parasitology, is_dengue_rdt, others, request_date)
                    `)
                    .eq('patient_id', patientId)
                    .eq('status', 'Completed')
                    .order('labresult_id', { ascending: false })
                    .limit(100);

                if (error) throw error;

                const items = (data || []).map((row: any) => {
                    const req = row.lab_request ?? {};
                    const tests: string[] = [];
                    if (req.is_clinical_microscopy) tests.push('Clinical Microscopy');
                    if (req.is_blood_chemistry) tests.push('Blood Chemistry');
                    if (req.is_pregnancy_test) tests.push('Pregnancy Test');
                    if (req.is_hbsag_screening) tests.push('HBsAg');
                    if (req.is_hiv_screening) tests.push('HIV Screening');
                    if (req.is_parasitology) tests.push('Parasitology');
                    if (req.is_dengue_rdt) tests.push('Dengue RDT');
                    if (req.others) tests.push('Others');
                    return {
                        id: row.labresult_id,
                        labresult_id: row.labresult_id,
                        findings: row.findings,
                        performed_by: row.performed_by,
                        date_performed: row.date_performed,
                        status: row.status,
                        patientName,
                        labNo: req.lab_no,
                        requestDate: req.request_date,
                        testSummary: tests.length ? tests.join(', ') : 'General / Other',
                    };
                });

                setHistoryItems(items);
            } catch (err) {
                logError('Failed to load patient lab history', err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [patientId]);

    return (
        <>
            {selectedResult && (
                <LabResultDetailModal
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                />
            )}
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-[#102E40]/50 backdrop-blur-sm z-[210]"
                onClick={onClose}
                aria-hidden="true"
            />
            {/* Slide-over panel */}
            <div className="fixed inset-0 z-[211] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
                <div className="pointer-events-auto w-full max-w-lg h-full max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden animate-slide-in-right">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-gradient-to-r from-[#102E40] to-[#1a4a62] shrink-0">
                        <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                                <Icon name="clock" className="h-4 w-4 text-emerald-300" />
                                Lab Result History
                            </div>
                            <div className="text-xs text-white/70 mt-0.5">{patientName} · All completed results</div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close lab history"
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                        >
                            <Icon name="close" className="h-4 w-4" label="Close" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 bg-[var(--surface-subtle)] rounded-xl animate-pulse" />
                                ))}
                            </div>
                        ) : historyItems.length === 0 ? (
                            <EmptyState
                                title="No completed lab results"
                                description="Completed results for this patient will appear here."
                            />
                        ) : (
                            historyItems.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSelectedResult(item)}
                                    className="w-full text-left rounded-xl border border-[var(--border)] bg-white hover:border-emerald-300 hover:bg-[var(--green-surface)] hover:shadow-md transition-all p-4 group cursor-pointer"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-md px-1.5 text-[0.65rem] font-semibold bg-[var(--green-surface)] text-[var(--green-ink-strong)] ring-1 ring-[var(--green-border-soft)]">
                                                    RES
                                                </span>
                                                <span className="text-xs font-bold text-[var(--text)]">Result #{item.id}</span>
                                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                    Completed
                                                </span>
                                            </div>
                                            <div className="text-xs text-[var(--text-2)] font-medium line-clamp-1">
                                                {item.testSummary}
                                            </div>
                                            <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                                {formatDisplayDate(item.date_performed)}
                                                {item.performed_by && ` · By: ${item.performed_by}`}
                                            </div>
                                        </div>
                                        <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-[var(--green-ink-strong)] group-hover:text-[var(--green-dark)] transition-colors">
                                            <Icon name="flask" className="h-3.5 w-3.5" />
                                            View
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer count */}
                    {!loading && historyItems.length > 0 && (
                        <div className="px-5 py-3 border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] text-xs text-[var(--text-muted)] shrink-0">
                            {historyItems.length} completed result{historyItems.length !== 1 ? 's' : ''} on record
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
