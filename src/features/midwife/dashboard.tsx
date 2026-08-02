import { useMemo } from 'react';
import { Icon } from '../../components/shared/Icon';

interface Props {
    patients: any[];
    rhuPersonnel: string;
    censusRecords: any[];
    onNavigateToRecords: () => void;
    onPatientClick?: (patient: any) => void; // ← NEW
}

const Dashboard = ({ patients, censusRecords, onNavigateToRecords, onPatientClick }: Props) => {

    const recentPatients = useMemo(() => {
        return [...patients]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((p: any) => ({
                ...p,
                consent_signed: Array.isArray(p.patient_consent)
                    ? p.patient_consent.length > 0
                    : p.patient_consent !== null
            }));
    }, [patients]);

    const maternalCount = censusRecords.filter(r => r.category === 'maternal').length;
    const childCount    = censusRecords.filter(r => r.category === 'child').length;
    const fpCount       = censusRecords.filter(r => r.category === 'family_planning').length;
    const totalPatients = patients.length;

    const todayCount = useMemo(() => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        return censusRecords.filter(r => {
            if (!r.created_at) return false;
            const recordDate = new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
            return recordDate === today;
        }).length;
    }, [censusRecords]);

    return (
        <div className="w-full max-w-full px-2 sm:px-4 md:px-0 ">

            {/* Header */}
            <div className="mb-4 flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-semibold text-[var(--text)] tracking-tight">Maternal & Child Health Work Queue</h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">Review census entries, patient records, and reporting tasks for the current month.</p>
                </div>
            </div>

            {/* Operational Summary */}
            <div className="ops-summary-grid mb-5 w-full">
                {[
                    { icon: 'users', label: 'Master Registry',      value: totalPatients, bg: 'bg-[var(--surface-subtle)]',    text: 'text-[var(--text-2)]'   },
                    { icon: 'heart-pulse', label: 'Maternal Care',        value: maternalCount, bg: 'bg-[var(--brand-soft-surface)]',    text: 'text-[var(--brand-active)]'   },
                    { icon: 'baby', label: 'Child Care (Immu)',    value: childCount,    bg: 'bg-[var(--brand-soft-surface)]', text: 'text-[var(--brand-active)]'},
                    { icon: 'pill', label: 'Family Planning',      value: fpCount,       bg: 'bg-[var(--brand-soft-surface)]',  text: 'text-[var(--brand-active)]' },
                ].map(({ icon, label, value, bg, text }) => (
                    <div key={label} className="ops-summary-card flex items-center gap-3 w-full">
                        <div className={`w-8 h-8 rounded-lg ${bg} ${text} flex items-center justify-center text-2xl shadow-inner shrink-0`}><Icon name={icon} className="h-6 w-6" /></div>
                        <div className="min-w-0">
                            <div className="ops-summary-label truncate">{label}</div>
                            <div className="ops-summary-value tabular-nums">{value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Lower Content */}
            <div className="ops-grid w-full">

                {/* Recent Reports */}
                <div className="lg:col-span-8 ops-panel flex flex-col w-full">
                    <div className="border-b border-[var(--border)] px-4 py-3 bg-[var(--surface-subtle)] flex justify-between items-start w-full">
                        <div>
                            <h3 className="text-base font-semibold text-[var(--text)] tracking-tight">Recent FHSIS Entries</h3>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">Latest census records submitted for the active reporting month.</p>
                        </div>
                        <span className="px-2.5 py-1 bg-[var(--surface-subtle)] text-[var(--text-2)] rounded-md border border-[var(--border)] text-xs font-semibold shrink-0">
                            {todayCount} Today
                        </span>
                    </div>
                    <div className="flex-1 w-full">
                        {censusRecords.length === 0 ? (
                            <div className="p-10 text-center text-[var(--text-muted)] font-medium">No entries for this month yet.</div>
                        ) : (
                            <div className="divide-y divide-[var(--border-soft)] w-full">
                                {censusRecords.slice(0, 6).map((record, i) => (
                                    <div key={i} className="flex items-center gap-4 sm:gap-6 p-5 sm:p-6 hover:bg-[var(--surface-subtle)] transition-colors w-full">
                                        <div className="w-12 h-12 rounded-full bg-[var(--surface-subtle)] text-[var(--text-2)] flex items-center justify-center font-bold text-base border border-[var(--border)] uppercase shrink-0">
                                            {record.patientName?.charAt(0) || 'P'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-[var(--text)] text-base capitalize truncate">{record.patientName || 'Unknown'}</div>
                                            <div className="text-[0.7rem] font-bold text-[var(--text-muted)] uppercase tracking-wide mt-1 truncate">
                                                {record.category} • Brgy. {record.address || 'N/A'}
                                            </div>
                                        </div>
                                        <div className="text-sm text-[var(--text-secondary)] font-semibold shrink-0">
                                            {new Date(record.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Patient Directory — clicks now open modal instead of redirecting */}
                <div className="lg:col-span-4 ops-panel flex flex-col w-full max-h-[600px]">
                    <div className="border-b border-[var(--border)] px-4 py-3 bg-[var(--surface-subtle)] flex justify-between items-start w-full">
                        <div>
                            <h3 className="text-base font-semibold text-[var(--text)] tracking-tight">Patient Directory</h3>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">All registered patients</p>
                        </div>
                        <button
                            type="button"
                            onClick={onNavigateToRecords}
                            className="text-xs font-bold text-[var(--text-2)] hover:underline shrink-0"
                        >
                            View All →
                        </button>
                    </div>

                    <div className="flex-1 w-full bg-white overflow-y-auto scrollbar-thin">
                        <div className="divide-y divide-[var(--border-soft)] w-full">
                            {recentPatients.length > 0 ? recentPatients.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => onPatientClick?.(p)}   // ← opens modal, no redirect
                                    aria-label={`Open patient details for ${p.lastName}, ${p.firstName}`}
                                    className="clinical-row-button flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors group"
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="hidden">
                                            {p.firstName?.[0]}{p.lastName?.[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--text-2)] transition-colors leading-tight truncate">
                                                {p.lastName}, {p.firstName}
                                            </div>
                                            <div className="text-[0.7rem] text-[var(--text-secondary)] font-medium mt-1 truncate">
                                                {p.age ?? '--'} yrs • {p.sex || 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0 pl-2">
                                        <div className="text-[0.65rem] text-[var(--text-muted)] font-semibold uppercase tracking-wide">
                                            {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        {!p.consent_signed ? (
                                            <span className="text-[0.68rem] font-semibold bg-[var(--amber-surface)] text-[var(--amber-accent-strong)] border border-[var(--amber-border)] px-2 py-0.5 rounded shadow-sm tracking-wide uppercase inline-flex items-center gap-1"><Icon name="alert-triangle" className="h-3 w-3" /> Pending</span>
                                        ) : (
                                            <span className="text-[0.68rem] font-semibold bg-[var(--green-surface)] text-[var(--green-ink)] border border-[var(--green-border-soft)] px-2 py-0.5 rounded shadow-sm tracking-wide uppercase inline-flex items-center gap-1"><Icon name="check" className="h-3 w-3" /> Signed</span>
                                        )}
                                    </div>
                                </button>
                            )) : (
                                <div className="text-center py-10 text-sm text-[var(--text-muted)] font-medium border-2 border-dashed border-[var(--border-soft)] rounded-xl w-full">
                                    No patients found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
