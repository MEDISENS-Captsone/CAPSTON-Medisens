import { useState } from 'react';
import { normalizeVaccineRecords } from '../patients/itemization';
import { getVaccineDisplayName } from '../vaccines/vaccineOptions';
import { Icon } from '../../components/shared/Icon';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { SkeletonList } from '../../components/ui/Skeleton';
import { PatientChartIdentityHeader, PatientHistoryPanel } from '../../components/patient/PatientChart';

interface Props {
    patients: any[];
    records: any[];
    rhuPersonnel: string;
    isLoading?: boolean;
    onPatientClick?: (patient: any) => void;
    onNavigateToRecords?: () => void;
}

// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({ patient, logs, onClose }: { patient: any; logs: any[]; onClose: () => void; }) {
    const getLogIcon = (category: string) => {
        if (category === 'maternal') return 'heart-pulse';
        if (category === 'child') return 'baby';
        if (category === 'family_planning') return 'pill';
        return 'clipboard';
    };

    return (
        <ClinicalDrawer
            title={`${patient.firstName} ${patient.lastName}`}
            labelledBy="midwife-patient-history-title"
            onClose={onClose}
            subtitle={<>{patient.sex || 'N/A'} • {patient.age || 'N/A'} YRS • {patient.address}</>}
        >
                <PatientChartIdentityHeader patient={patient} compact className="mb-4" />
                <PatientHistoryPanel title="Clinical History (FHSIS Logs)">
                    {logs.length === 0 ? (
                        <div className="text-center py-10">
                            <Icon name="clipboard" className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-[var(--text-secondary)] font-medium">No FHSIS history is recorded for this patient yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[var(--border)] before:to-transparent">
                            {logs.map(log => (
                                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-[var(--brand-active)] text-white text-xs shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                        <Icon name={getLogIcon(log.category)} className="h-4 w-4" />
                                    </div>
                                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-[var(--border)] bg-white shadow-sm">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-[var(--text)] text-sm uppercase">{log.category.replace('_', ' ')}</span>
                                            <span className="text-[0.65rem] font-bold text-[var(--text-muted)]">{new Date(log.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <div className="text-xs text-[var(--text-2)] space-y-1">
                                            {log.category === 'child' && log.data_fields?.vaccine_records && Array.isArray(log.data_fields.vaccine_records) && (
                                                <div className="mb-2 p-2 bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)]">
                                                    <span className="font-semibold text-[var(--text-2)] uppercase text-[0.6rem] tracking-wide block mb-1">Vaccine Records</span>
                                                    {normalizeVaccineRecords(log.data_fields).map(vaccine => (
                                                        <div key={vaccine.id} className="mb-2 rounded-md border border-[var(--border)] bg-white p-2 last:mb-0">
                                                            <div className="font-bold text-[var(--text)]">{getVaccineDisplayName(vaccine)}</div>
                                                            <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                                                                {[
                                                                    ['Category', vaccine.vaccine_category],
                                                                    ['Dose', vaccine.dose_label],
                                                                    ['Date given', vaccine.date_given],
                                                                    ['Next due', vaccine.next_due_date],
                                                                    ['Administered by', vaccine.administered_by],
                                                                    ['Facility', vaccine.facility],
                                                                    ['Lot number', vaccine.lot_number],
                                                                    ['Remarks', vaccine.remarks],
                                                                ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => (
                                                                    <div key={label} className="text-[0.65rem] text-[var(--text)]">
                                                                        <dt className="inline font-bold">{label}: </dt>
                                                                        <dd className="inline">{value}</dd>
                                                                    </div>
                                                                ))}
                                                            </dl>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {Object.entries(log.data_fields || {}).filter(([key]) => key !== 'vaccine_records').map(([key, value]) => (
                                                <div key={key} className="mt-1"><span className="font-semibold capitalize">{key.replace(/_/g, ' ')}:</span> {String(value)}</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </PatientHistoryPanel>
        </ClinicalDrawer>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const PatientRecords = ({ patients, records, isLoading, onPatientClick }: Props) => {
    const [searchQuery,    setSearchQuery]    = useState('');
    const [historyPatient, setHistoryPatient] = useState<any>(null);

    const filteredPatients = patients.filter(p => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        return fullName.includes(searchQuery.toLowerCase());
    });

    const patientLogs = historyPatient
        ? records.filter(r => r.patient_id === historyPatient.id)
        : [];

    return (
        <div className="w-full max-w-full px-2 sm:px-4 md:px-0  relative">

            {historyPatient && (
                <HistoryModal
                    patient={historyPatient}
                    logs={patientLogs}
                    onClose={() => setHistoryPatient(null)}
                />
            )}

            <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden w-full">
                <div className="p-6 sm:p-8 border-b border-[var(--border-soft)] bg-[var(--surface-subtle)]/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[var(--text)] tracking-tight">Patient Directory</h2>
                        <p className="text-sm text-[var(--text-secondary)] font-medium mt-0.5">All registered patients</p>
                    </div>
                    <div className="relative w-full md:max-w-sm">
                        <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            aria-label="Search midwife patient records"
                            placeholder="Search patient name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-color)] outline-none transition-all text-sm shadow-sm"
                        />
                    </div>
                </div>

                <div>
                    {isLoading ? (
                        <SkeletonList rows={5} />
                    ) : filteredPatients.length === 0 ? (
                        <div className="clinical-table-state flex-col py-20">
                            <Icon name="inbox" className="h-10 w-10 mx-auto mb-3 opacity-40" />
                            <div className="font-bold text-[var(--text-2)] text-lg">No matching patients found</div>
                            <div className="text-sm text-[var(--text-muted)] mt-1">Search by patient name or review the full patient directory.</div>
                        </div>
                    ) : (
                        filteredPatients.map(patient => (
                            <div
                                key={patient.id}
                                className="clinical-worklist-row group"
                            >
                                {/* Clickable left side → details modal */}
                                <button
                                    type="button"
                                    onClick={() => onPatientClick?.(patient)}
                                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
                                >
                                    <div className="w-11 h-11 rounded-full bg-[var(--surface-subtle)] text-[var(--text-2)] flex items-center justify-center font-bold text-sm uppercase shrink-0 group-hover:bg-[var(--border-soft)] transition-colors">
                                        {patient.firstName?.[0]}{patient.lastName?.[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-[var(--text)] text-sm truncate capitalize">
                                            {patient.lastName}, {patient.firstName}
                                        </div>
                                        <div className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
                                            {patient.age ?? '—'} yrs • {patient.sex || 'N/A'}
                                        </div>
                                    </div>
                                </button>

                                {/* Right side */}
                                <div className="shrink-0 flex items-center gap-3">
                                    <div className="flex flex-col items-end gap-1.5">
                                        <span className="text-[0.65rem] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                                            {patient.created_at
                                                ? new Date(patient.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
                                                : '—'}
                                        </span>
                                        {/* Reads pre-normalized consent_signed from useMidwifeData */}
                                        {patient.consent_signed ? (
                                            <span className="bg-[var(--green-surface)] border border-[var(--green-border-soft)] text-[var(--green-text)] text-[0.6rem] font-extrabold px-2 py-0.5 rounded-md inline-flex items-center gap-1"><Icon name="check" className="h-3 w-3" /> SIGNED</span>
                                        ) : (
                                            <span className="bg-[var(--amber-surface)] border border-[var(--amber-border)] text-[var(--amber-text)] text-[0.6rem] font-extrabold px-2 py-0.5 rounded-md inline-flex items-center gap-1"><Icon name="alert-triangle" className="h-3 w-3" /> PENDING</span>
                                        )}
                                    </div>

                                    {/* History button */}
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); setHistoryPatient(patient); }}
                                        className="clinical-row-action"
                                        title="View FHSIS History"
                                    >
                                        <Icon name="clipboard" className="inline h-3.5 w-3.5 mr-1" /> History
                                    </button>

                                    <div className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors text-sm">›</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default PatientRecords;
