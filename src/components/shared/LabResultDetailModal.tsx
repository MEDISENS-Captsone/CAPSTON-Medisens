import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Modal } from '../ui/Modal';

export interface LabResultData {
    labresult_id?: number | string | null;
    findings: string | null;
    performed_by?: string | null;
    date_performed?: string | null;
    status?: string | null;
    patientName?: string;
    patientAge?: number | null;
    patientSex?: string | null;
    labNo?: string | null;
    requestDate?: string | null;
}

function formatDisplayDate(str?: string | null) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d.getTime())
        ? str
        : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const formInputCls = 'w-full bg-[var(--surface-subtle)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-2)] cursor-not-allowed select-text';

const renderHeader = (title: string) => (
    <div className="border-b-2 border-[#102E40] pb-2 mb-3 text-center">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Republic of the Philippines · Province of Batangas</div>
        <div className="text-xs font-bold text-[var(--brand-active)] uppercase tracking-wide">Municipality of Malvar · Office of the Municipal Health</div>
        <div className="text-sm font-extrabold text-[var(--brand-primary)] uppercase tracking-wider mt-1">{title}</div>
    </div>
);

function PatientLockup({ data }: { data: LabResultData }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-[var(--surface-subtle)] p-2.5 rounded border border-[var(--border)] mb-4">
            <div><span className="font-semibold text-[var(--text-muted)]">Patient:</span>{' '}<span className="font-bold text-[var(--text)]">{data.patientName || '—'}</span></div>
            <div><span className="font-semibold text-[var(--text-muted)]">Age/Sex:</span>{' '}<span className="font-bold text-[var(--text)]">{data.patientAge ?? '—'} / {data.patientSex ?? '—'}</span></div>
            <div><span className="font-semibold text-[var(--text-muted)]">Date:</span>{' '}<span className="font-bold text-[var(--text)]">{formatDisplayDate(data.requestDate)}</span></div>
            <div><span className="font-semibold text-[var(--text-muted)]">Lab No:</span>{' '}<span className="font-bold text-[var(--text)]">{data.labNo || `#${data.labresult_id ?? '—'}`}</span></div>
        </div>
    );
}

/** Read-only structured lab result viewer. Uses createPortal to render at
 *  document.body level, escaping any parent CSS stacking contexts. */
export function LabResultDetailModal({ result, onClose }: { result: LabResultData; onClose: () => void; }) {
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [selectedTab, setSelectedTab] = useState<string>('');
    const [activeTests, setActiveTests] = useState<{ key: string; label: string }[]>([]);

    useEffect(() => {
        let parsed: Record<string, any> = {};
        try {
            if (result.findings) {
                const p = JSON.parse(result.findings);
                if (typeof p === 'object' && p !== null) parsed = p;
            }
        } catch { parsed = { generalNotes: result.findings }; }
        setFormData(parsed);
        const TEST_KEYS = [
            { key: 'clinicalMicroscopy', label: 'Clinical Microscopy' },
            { key: 'bloodChemistry', label: 'Blood Chemistry' },
            { key: 'pregnancyTest', label: 'Pregnancy Test' },
            { key: 'hbsagScreening', label: 'HBsAg Screening' },
            { key: 'hivScreening', label: 'HIV Screening' },
            { key: 'parasitology', label: 'Parasitology' },
            { key: 'dengueRdt', label: 'Dengue RDT' },
        ];
        const found = TEST_KEYS.filter(t => parsed[t.key] && Object.keys(parsed[t.key]).length > 0);
        if (found.length === 0 && parsed.generalNotes) {
            setActiveTests([{ key: 'others', label: 'Others / Notes' }]);
            setSelectedTab('others');
        } else {
            setActiveTests(found);
            setSelectedTab(found[0]?.key ?? 'others');
        }
    }, [result]);

    return createPortal(
        <>
            <div className="fixed inset-0 bg-[#102E40]/60 backdrop-blur-sm z-[300]" onClick={onClose} aria-hidden="true" />
            <div className="fixed inset-0 z-[301] flex items-center justify-center p-3 sm:p-6 pointer-events-none">
                <Modal labelledBy="lab-result-detail-title" onClose={onClose} className="pointer-events-auto w-full max-w-4xl h-[88vh] max-h-[860px] min-h-[540px] bg-white rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden">

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-[#102E40] to-[#1a4a62] shrink-0">
                        <div className="min-w-0">
                            <div id="lab-result-detail-title" className="font-bold text-white text-base flex items-center gap-2">
                                <Icon name="flask" className="h-4 w-4 text-emerald-300" />
                                <span>Laboratory Result</span>
                                {result.labresult_id && <span className="text-emerald-300 font-normal text-sm">#{result.labresult_id}</span>}
                            </div>
                            <div className="text-xs text-white/70 mt-0.5 font-medium">
                                {result.patientName && <span>{result.patientName} · </span>}
                                Performed: {formatDisplayDate(result.date_performed)}{result.performed_by && ` · By: ${result.performed_by}`}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{result.status || 'Completed'} · Read-only</span>
                            <button type="button" onClick={onClose} aria-label="Close lab result" className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer">
                                <Icon name="close" className="h-4 w-4" label="Close" />
                            </button>
                        </div>
                    </div>

                    {/* Tab Bar */}
                    {activeTests.length > 1 && (
                        <div className="flex items-center gap-2 px-5 pt-4 pb-2 border-b border-[var(--border)] overflow-x-auto shrink-0 bg-[var(--surface-subtle)]">
                            {activeTests.map(t => {
                                const isSel = selectedTab === t.key;
                                return (
                                    <button key={t.key} type="button" onClick={() => setSelectedTab(t.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${isSel ? 'bg-[#102E40] text-white shadow-sm ring-2 ring-[#102E40]/20' : 'bg-white text-[var(--text-2)] hover:bg-white/80 border border-[var(--border)]'}`}>
                                        <span className={`w-2 h-2 rounded-full ${isSel ? 'bg-emerald-400' : 'bg-[var(--brand-primary)]'}`} />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">

                        {selectedTab === 'clinicalMicroscopy' && formData.clinicalMicroscopy && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('Clinical Microscopy Report')}
                                <PatientLockup data={result} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Macroscopic Examination</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Color</label><input type="text" value={formData.clinicalMicroscopy?.color ?? ''} disabled className={formInputCls} /></div>
                                                <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Transparency</label><input type="text" value={formData.clinicalMicroscopy?.transparency ?? ''} disabled className={formInputCls} /></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Chemical Examination</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                {[['Specific gravity','spGravity'],['pH','pH'],['Protein','protein'],['Sugar','sugar'],['Ketones','ketones'],['Bilirubin','bilirubin'],['Blood','blood'],['Leukocytes','leukocytes'],['Nitrite','nitrite'],['Urobilinogen','urobilinogen']].map(([lbl,k])=>(
                                                    <div key={k}><label className="text-[11px] font-semibold text-[var(--text-muted)]">{lbl}</label><input type="text" value={formData.clinicalMicroscopy?.[k]??''} disabled className={formInputCls}/></div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Microscopic Examination</div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            {[['WBC (/hpf)','wbc'],['RBC (/hpf)','rbc'],['Bacteria','bacteria'],['Epithelial cells','epithelialCells'],['Amorphous sediments','amorphousSediments'],['Mucus threads','mucusThreads'],['Yeast cells','yeastCells'],['Crystals','crystals']].map(([lbl,k])=>(
                                                <div key={k}><label className="text-[11px] font-semibold text-[var(--text-muted)]">{lbl}</label><input type="text" value={formData.clinicalMicroscopy?.[k]??''} disabled className={formInputCls}/></div>
                                            ))}
                                            <div className="col-span-2"><label className="text-[11px] font-semibold text-[var(--text-muted)]">OTHERS</label><input type="text" value={formData.clinicalMicroscopy?.others??''} disabled className={formInputCls}/></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTab === 'bloodChemistry' && formData.bloodChemistry && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('Blood Chemistry Report')}
                                <PatientLockup data={result} />
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border border-[var(--border-strong)]">
                                        <thead className="bg-[#102E40] text-white"><tr><th className="p-2 text-left font-bold">TEST</th><th className="p-2 text-center font-bold">RESULT</th><th className="p-2 text-center font-bold">UNIT</th><th className="p-2 text-center font-bold">REFERENCE VALUE</th><th className="p-2 text-center font-bold">FLAG</th></tr></thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            <tr className="hover:bg-[var(--surface-subtle)]"><td className="p-2 font-bold text-[var(--text)]">FASTING BLOOD SUGAR</td><td className="p-2 text-center font-bold text-[var(--text)]">{formData.bloodChemistry?.fbs?.result||'—'}</td><td className="p-2 text-center text-[var(--text-2)] font-semibold">mg/dL</td><td className="p-2 text-center text-[var(--text-2)]">70–104</td><td className="p-2 text-center text-[var(--text-2)]">{formData.bloodChemistry?.fbs?.flag||'—'}</td></tr>
                                            <tr className="hover:bg-[var(--surface-subtle)]"><td className="p-2 font-bold text-[var(--text)]">CHOLESTEROL</td><td className="p-2 text-center font-bold text-[var(--text)]">{formData.bloodChemistry?.cholesterol?.result||'—'}</td><td className="p-2 text-center text-[var(--text-2)] font-semibold">mg/dL</td><td className="p-2 text-center text-[var(--text-2)]">Below 200</td><td className="p-2 text-center text-[var(--text-2)]">{formData.bloodChemistry?.cholesterol?.flag||'—'}</td></tr>
                                            <tr className="hover:bg-[var(--surface-subtle)]"><td className="p-2 font-bold text-[var(--text)]">URIC ACID</td><td className="p-2 text-center font-bold text-[var(--text)]">{formData.bloodChemistry?.uricAcid?.result||'—'}</td><td className="p-2 text-center text-[var(--text-2)] font-semibold">mg/dL</td><td className="p-2 text-center text-[var(--text-2)]">Male: 3–7.2 / Female: 2–6</td><td className="p-2 text-center text-[var(--text-2)]">{formData.bloodChemistry?.uricAcid?.flag||'—'}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                {formData.bloodChemistry?.remarks && (<div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Remarks</label><div className="w-full bg-[var(--surface-subtle)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-2)] min-h-[48px] whitespace-pre-wrap">{formData.bloodChemistry.remarks}</div></div>)}
                            </div>
                        )}

                        {selectedTab === 'pregnancyTest' && formData.pregnancyTest && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('Pregnancy Test Report')}
                                <PatientLockup data={result} />
                                <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[#102E40] text-white"><tr><th className="p-2 text-center font-bold w-1/2">METHOD / KIT</th><th className="p-2 text-center font-bold w-1/2">RESULT</th></tr></thead>
                                        <tbody><tr><td className="p-3 text-center font-semibold text-[var(--text)]">{formData.pregnancyTest?.methodKit||'—'}</td><td className={`p-3 text-center font-bold text-lg ${formData.pregnancyTest?.result==='POSITIVE'?'text-red-600':'text-green-600'}`}>{formData.pregnancyTest?.result||'—'}</td></tr></tbody>
                                    </table>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Performed</label><input type="text" value={formData.pregnancyTest?.datePerformed??''} disabled className={formInputCls}/></div>
                                    <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Released</label><input type="text" value={formData.pregnancyTest?.dateReleased??''} disabled className={formInputCls}/></div>
                                </div>
                            </div>
                        )}

                        {selectedTab === 'hbsagScreening' && formData.hbsagScreening && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('HBsAg Screening Report')}
                                <PatientLockup data={result} />
                                <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[#102E40] text-white"><tr><th className="p-2 text-center font-bold">Method Used</th><th className="p-2 text-center font-bold">Kit / Reagent</th><th className="p-2 text-center font-bold">Lot No.</th><th className="p-2 text-center font-bold">Result</th></tr></thead>
                                        <tbody><tr><td className="p-2 text-center text-[var(--text)]">{formData.hbsagScreening?.methodUsed||'—'}</td><td className="p-2 text-center text-[var(--text)]">{formData.hbsagScreening?.kitReagent||'—'}</td><td className="p-2 text-center text-[var(--text)]">{formData.hbsagScreening?.lotNo||'—'}</td><td className={`p-2 text-center font-bold ${formData.hbsagScreening?.result==='REACTIVE'?'text-red-600':'text-green-600'}`}>{formData.hbsagScreening?.result||'—'}</td></tr></tbody>
                                    </table>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Performed</label><input type="text" value={formData.hbsagScreening?.datePerformed??''} disabled className={formInputCls}/></div>
                                    <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Released</label><input type="text" value={formData.hbsagScreening?.dateReleased??''} disabled className={formInputCls}/></div>
                                </div>
                            </div>
                        )}

                        {selectedTab === 'hivScreening' && formData.hivScreening && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('HIV Screening Report')}
                                <PatientLockup data={result} />
                                <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[#102E40] text-white"><tr><th className="p-2 text-center font-bold">Method Used</th><th className="p-2 text-center font-bold">Kit / Reagent</th><th className="p-2 text-center font-bold">Lot No.</th><th className="p-2 text-center font-bold">Result</th></tr></thead>
                                        <tbody><tr><td className="p-2 text-center text-[var(--text)]">{formData.hivScreening?.methodUsed||'—'}</td><td className="p-2 text-center text-[var(--text)]">{formData.hivScreening?.kitReagent||'—'}</td><td className="p-2 text-center text-[var(--text)]">{formData.hivScreening?.lotNo||'—'}</td><td className={`p-2 text-center font-bold ${formData.hivScreening?.result==='REACTIVE'?'text-red-600':'text-green-600'}`}>{formData.hivScreening?.result||'—'}</td></tr></tbody>
                                    </table>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-xs">
                                    <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Performed</label><input type="text" value={formData.hivScreening?.datePerformed??''} disabled className={formInputCls}/></div>
                                    <div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Date Released</label><input type="text" value={formData.hivScreening?.dateReleased??''} disabled className={formInputCls}/></div>
                                    {formData.hivScreening?.receivedBy&&(<div><label className="text-[11px] font-semibold text-[var(--text-muted)]">Received By</label><input type="text" value={formData.hivScreening.receivedBy} disabled className={formInputCls}/></div>)}
                                </div>
                            </div>
                        )}

                        {selectedTab === 'parasitology' && formData.parasitology && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('Parasitology (Fecalysis) Report')}
                                <PatientLockup data={result} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Macroscopic Examination</div>
                                        {[['Color','color'],['Consistency','consistency'],['Occult Blood','occultBlood'],['Others','macroOthers']].map(([lbl,k])=>(<div key={k}><label className="text-[11px] font-semibold text-[var(--text-muted)]">{lbl}</label><input type="text" value={formData.parasitology?.[k]??''} disabled className={formInputCls}/></div>))}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-active)] bg-[var(--surface-subtle)] px-2 py-1 rounded mb-2 border border-[var(--border-soft)]">Microscopic Examination</div>
                                        {[['Ascaris lumbricoides ova','ascaris'],['Trichuris trichiura ova','trichuris'],['Hookworm ova','hookworm'],['Amoeba','amoeba'],['Others / Ova/Parasite','microOthers'],['WBC (/hpf)','wbc'],['RBC (/hpf)','rbc'],['Bacteria','bacteria'],['Yeast cells','yeastCells'],['Fat globules','fatGlobules']].map(([lbl,k])=>(<div key={k}><label className="text-[11px] font-semibold text-[var(--text-muted)]">{lbl}</label><input type="text" value={formData.parasitology?.[k]??''} disabled className={formInputCls}/></div>))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTab === 'dengueRdt' && formData.dengueRdt && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('Dengue RDT Report')}
                                <PatientLockup data={result} />
                                <div className="border border-[var(--border-strong)] rounded overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[#102E40] text-white"><tr><th className="p-2 text-center font-bold">NS1 Ag</th><th className="p-2 text-center font-bold">Case No.</th><th className="p-2 text-center font-bold">Date Performed</th><th className="p-2 text-center font-bold">Date Released</th></tr></thead>
                                        <tbody><tr><td className={`p-3 text-center font-bold ${formData.dengueRdt?.ns1Ag==='POSITIVE'?'text-red-600':'text-green-600'}`}>{formData.dengueRdt?.ns1Ag||'—'}</td><td className="p-2 text-center text-[var(--text)]">{formData.dengueRdt?.caseNo||'—'}</td><td className="p-2 text-center text-[var(--text)]">{formData.dengueRdt?.datePerformed||'—'}</td><td className="p-2 text-center text-[var(--text)]">{formData.dengueRdt?.dateReleased||'—'}</td></tr></tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {selectedTab === 'others' && (
                            <div className="bg-white border-2 border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                                {renderHeader('Other / General Examination Notes')}
                                <PatientLockup data={result} />
                                <div>
                                    <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1.5">Laboratory Findings &amp; Notes</label>
                                    <div className="w-full bg-[var(--surface-subtle)] border border-[var(--border)] rounded px-3 py-2.5 text-xs text-[var(--text)] min-h-[120px] whitespace-pre-wrap leading-relaxed">{formData.generalNotes || result.findings || '—'}</div>
                                </div>
                            </div>
                        )}

                        <div className="border-t border-[var(--border-soft)] pt-4 text-xs text-[var(--text-muted)] flex justify-between items-center flex-wrap gap-2">
                            <span>Performed by: <strong className="text-[var(--text-2)]">{result.performed_by || '—'}</strong></span>
                            <span>Date: <strong className="text-[var(--text-2)]">{formatDisplayDate(result.date_performed)}</strong></span>
                            <span className="italic text-[var(--text-muted)]">Read-only · Official Laboratory Record</span>
                        </div>
                    </div>
                </Modal>
            </div>
        </>,
        document.body
    );
}
