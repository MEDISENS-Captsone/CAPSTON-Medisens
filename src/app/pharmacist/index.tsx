import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { requireRole } from '../../lib/auth/roles';
import { Sidebar } from '../../components/layout/Sidebar';
import { useToast } from '../../components/feedback/Toast';
import { parsePrescriptionContent } from '../../features/pharmacy/prescriptionParser';
import type { Medication } from '../../types/prescription';
import { printHtmlDocument } from '../../lib/utils/print';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Topbar } from '../../components/layout/Topbar';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { Icon } from '../../components/shared/Icon';
import { ClinicalDrawer } from '../../components/ui/ClinicalDrawer';
import { healthcareErrorMessage, logError } from '../../lib/utils/errors';
import { safeTrim } from '../../lib/utils/strings';
import { logAuditEvent } from '../../features/audit/services';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { useHashPage } from '../../hooks/useHashPage';


// --- Interfaces ---
interface Patient {
    id: string;
    firstName: string;
    middleName: string;
    lastName: string;
    age: number | null;
    sex: string;
    address?: string; // Added to match print format
}

interface Prescription {
    prescription_id: number;
    consultation_id: number | null;
    patient_id: number;
    prescription_date: string;
    rx_content: string;
    doctor_name: string | null;
    license_no: number | null;
    ptr_no: string | null;
    status: string;
    dispensed_at: string | null;
    signature_url: string | null;
    patients: Patient;
}

type PharmacistProfile = Awaited<ReturnType<typeof requireRole>>;

function PharmacyDashboard() {
    const [profile, setProfile] = useState<PharmacistProfile | null>(null);
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);
    const [dispenseChecklist, setDispenseChecklist] = useState<Record<number, boolean>>({});
    const [isDispensing, setIsDispensing] = useState(false);
    // `disabled={isDispensing}` only takes effect after React re-renders, and a state
    // read inside the handler sees the stale value from the render the click came from.
    // Two taps landing in the same frame therefore both reached Supabase and dispensed
    // the prescription twice, so the in-flight latch has to be a ref.
    const dispensingRef = useRef(false);
    const { showToast, ToastComponent } = useToast();

    // Sidebar & Layout State
    const [activePage, setActivePage] = useHashPage('queue');

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const isOnline = useOnlineStatus();

    const pharmacistNavItems = [
        { id: 'queue', label: 'Pending Queue', icon: 'pill', group: 'Pharmacy Operations' }
    ];

    useEffect(() => {
        // Authenticate and load profile
        requireRole('pharmacist').then(p => setProfile(p));
        loadPrescriptions();

        // Real-time Subscription
        const channel = supabase
            .channel('pharmacist-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'prescription' }, () => loadPrescriptions())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prescription' }, () => loadPrescriptions())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Gentle background fallback sync (30s) alongside the instant Realtime WebSocket channel
    useEffect(() => {
        const interval = setInterval(() => {
            if (activePage === 'queue' && isOnline) {
                loadPrescriptions();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [activePage, isOnline]);

    const loadPrescriptions = async () => {
        const { data, error } = await supabase
            .from('prescription')
            .select(`
                *,
                patients!inner (
                    id,
                    firstName,
                    middleName,
                    lastName,
                    age,
                    sex,
                    address,
                    archive_status
                )
            `)
            .eq('status', 'Pending')
            .eq('patients.archive_status', 'active')
            .order('prescription_id', { ascending: false });

        if (!error && data) {
            // Transform data to handle cases where patients might be an array
            const transformed = data.map((rx: Omit<Prescription, 'patients'> & { patients: Patient | Patient[] | null }) => {
                const patientData = Array.isArray(rx.patients) ? rx.patients[0] : rx.patients;
                return {
                    ...rx,
                    patients: patientData
                };
            });
            setPrescriptions(transformed as unknown as Prescription[]);
            setLoadError(false);
        } else if (error) {
            logError('Failed to load prescriptions', error);
            setLoadError(true);
        }
        setLoading(false);
    };

    const handleRxSelect = (rx: Prescription) => {
        setSelectedRx(rx);
        const { medications: meds, malformed } = parsePrescriptionContent(rx.rx_content);
        if (malformed) {
            showToast('This prescription has malformed medication content. It cannot be dispensed until corrected.', true);
        }
        const initialChecklist: Record<number, boolean> = {};
        meds.forEach((_, i) => { initialChecklist[i] = true; });
        setDispenseChecklist(initialChecklist);
    };

    const handleToggleChecklist = (index: number) => {
        setDispenseChecklist(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    // --- Updated Print Format (Matches doctor.tsx) ---------------------------
    const handlePrintUnavailable = () => {
        if (!selectedRx) return;

        const { medications: meds, malformed } = parsePrescriptionContent(selectedRx.rx_content);
        if (malformed) {
            showToast('Cannot print unavailable slip because prescription content is malformed.', true);
            return;
        }
        const unavailableMeds = meds.filter((_, i) => !dispenseChecklist[i]);

        if (unavailableMeds.length === 0) {
            showToast("All medications are checked. There are no unavailable medications to print.", true);
            return;
        }

        const patientFullName = safeTrim(`${selectedRx.patients.lastName}, ${selectedRx.patients.firstName} ${selectedRx.patients.middleName || ''}`);
        const pt = selectedRx.patients;

        const html = `
            <!DOCTYPE html><html><head>
            <title>Unavailable Medications - ${patientFullName}</title>
            <style>
                @page { size: A5 portrait; margin: 10mm; }
                * { box-sizing: border-box; }
                body { font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.2; padding: 10px 15px; margin: 0; overflow-wrap: anywhere; }
                .header { text-align: center; margin-bottom: 12px; }
                .header p { margin: 2px 0; font-size: 13px; }
                .header h3 { margin: 5px 0 0 0; font-weight: bold; font-size: 16px; letter-spacing: 0.5px; }
                .divider { border-bottom: 1.5px solid #000; margin: 12px 0; }
                .patient-info { font-size: 14px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 5px; }
                .row { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; }
                .field { display: flex; align-items: flex-end; }
                .field span { margin-right: 5px; white-space: nowrap; }
                .value { border-bottom: 1px solid #000; flex-grow: 1; padding: 0 5px; text-align: center; font-weight: bold; min-width: 0; overflow-wrap: anywhere; }
                .rx-symbol { font-size: 48px; font-weight: bold; margin: 15px 0 5px 10px; line-height: 1; font-style: italic; }
                .med-list { min-height: 240px; padding: 0 12px 0 35px; }
                .med-item { margin-bottom: 12px; font-size: 13px; page-break-inside: avoid; overflow-wrap: anywhere; }
                .med-name { font-weight: bold; font-size: 14px; margin-bottom: 3px; overflow-wrap: anywhere; }
                .med-sig { margin-left: 16px; overflow-wrap: anywhere; }
                .footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; page-break-inside: avoid; }
                .next-visit { display: flex; align-items: flex-end; }
                .doctor-block { text-align: center; width: 220px; }
                .sig-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 40px; }
                .doc-name { font-weight: bold; font-size: 15px; text-transform: uppercase; }
                .doc-creds { font-size: 12px; display: flex; flex-direction: column; align-items: center; margin-top: 3px; }
                .note { margin-top: 20px; font-style: italic; font-size: 11px; color: #555; text-align: center; }
            </style></head><body>
                <div class="header">
                    <p>Republic of the Philippines</p><p>Province of Batangas</p><p>Municipality of Malvar</p>
                    <h3>MUNICIPAL HEALTH OFFICE</h3>
                </div>
                <div class="divider"></div>
                <div class="patient-info">
                    <div class="row">
                        <div class="field" style="width:68%;"><span>Name:</span><div class="value" style="text-align:left;">${patientFullName}</div></div>
                        <div class="field" style="width:30%;"><span>Date:</span><div class="value">${new Date().toLocaleDateString('en-US')}</div></div>
                    </div>
                    <div class="row">
                        <div class="field" style="width:18%;"><span>Age:</span><div class="value">${pt.age || '&nbsp;'}</div></div>
                        <div class="field" style="width:18%;"><span>Sex:</span><div class="value">${pt.sex || '&nbsp;'}</div></div>
                        <div class="field" style="width:60%;"><span>Address:</span><div class="value" style="text-align:left;">${pt.address ? pt.address.split(',')[0] : '&nbsp;'}</div></div>
                    </div>
                </div>
                <div class="divider"></div>
                <div class="rx-symbol">&#8478;</div>
                <div class="med-list">
                    ${unavailableMeds.map((m: Medication) => `<div class="med-item"><div class="med-name">${m.quantity ? `${m.quantity} ` : ''}${m.name || 'Unnamed medication'}</div><div class="med-sig">Sig: ${m.dosage} ${m.frequency || ''} ${m.duration ? `for ${m.duration}` : ''}</div></div>`).join('')}
                </div>
                <div class="footer">
                    <div class="next-visit"><span>Status:</span><div class="value" style="width:100px; font-size:10px;">Not Dispensed at RHU</div></div>
                    <div class="doctor-block"><div class="sig-line"></div><div class="doc-name">${selectedRx.doctor_name || 'MD'}, MD</div>
                    <div class="doc-creds"><span>Lic No: ${selectedRx.license_no || '________________'}</span><span>PTR No: ${selectedRx.ptr_no || '________________'}</span></div></div>
                </div>
                <div class="note">* Note: The medications listed above were unavailable at the RHU pharmacy during dispensing.</div>
            </body></html>`;

        if (!printHtmlDocument(html)) {
            showToast('Unable to open the print window. Please try again.', true);
        }
    };

    const handleDispense = async () => {
        if (!selectedRx) return;
        if (dispensingRef.current) return;
        if (!isOnline) {
            showToast('You are offline. Dispensing cannot be saved until the connection is restored.', true);
            return;
        }
        const { medications, malformed } = parsePrescriptionContent(selectedRx.rx_content);
        if (malformed || medications.length === 0) {
            showToast('Cannot dispense because medication content is missing or malformed.', true);
            return;
        }
        dispensingRef.current = true;
        setIsDispensing(true);

        const { error } = await supabase
            .from('prescription')
            .update({
                status: 'Dispensed',
                dispensed_at: new Date().toISOString()
            })
            .eq('prescription_id', selectedRx.prescription_id);

        dispensingRef.current = false;
        setIsDispensing(false);
        if (!error) {
            void logAuditEvent({
                action: 'dispense',
                module: 'Pharmacy',
                recordId: selectedRx.prescription_id,
                recordType: 'prescription',
                description: 'Marked prescription as dispensed.',
                metadata: {
                    prescription_id: selectedRx.prescription_id,
                    patient_id: selectedRx.patient_id,
                    status: 'Dispensed',
                },
            });
            setSelectedRx(null);
            setPrescriptions(prev => prev.filter(p => p.prescription_id !== selectedRx.prescription_id));
            showToast('Medication dispensed successfully!', false);
        } else {
            logError('Failed to dispense prescription', error);
            showToast(healthcareErrorMessage("mark the prescription as dispensed"), true);
        }
    };

    const filteredRx = prescriptions.filter(rx => {
        const pt = rx.patients;
        if (!pt) return false;
        const fullName = `${pt.firstName} ${pt.middleName} ${pt.lastName}`.toLowerCase();
        return fullName.includes(searchQuery.toLowerCase());
    });

    const initials = profile?.fullName
        ? profile.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : 'P';

    const parsedSelectedRx = selectedRx ? parsePrescriptionContent(selectedRx.rx_content) : { medications: [], malformed: false };
    const medsToDispense = parsedSelectedRx.medications;
    const allChecked = medsToDispense.length > 0 && medsToDispense.every((_, i) => dispenseChecklist[i]);

    return (
        <div className="pharmacy-dashboard-workspace flex h-screen bg-[var(--bg)] overflow-hidden w-full">
            <ToastComponent />
            <Sidebar
                activePage={activePage}
                userName={profile?.fullName || 'Loading...'}
                userInitials={initials}
                userRole="Pharmacist"
                navItems={pharmacistNavItems}
                onNavigate={(id) => setActivePage(id)}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="app-shell-main flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">

                <Topbar
                    title="Pharmacy Dashboard"
                    sectionLabel="Pharmacy"
                    userName={profile?.fullName || 'Loading...'}
                    userInitials={initials}
                    userRole="Pharmacist"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                    isNavigationOpen={isMobileMenuOpen}
                />

                <div className="app-content-canvas flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    <div className="w-full max-w-full flex flex-col gap-6">
                        {activePage === 'queue' && (
                            <div className="role-workspace-canvas">
                                <PageHeader
                                    title="Pharmacy Dispensing Queue"
                                    subtitle="Review pending e-prescriptions and document dispensing decisions."
                                />

                                <div className="pwa-page-pad pb-0">
                                    <div className="ops-summary-grid">
                                        {[
                                            ['pill', 'To Dispense', prescriptions.length, 'Pending e-prescriptions'],
                                            ['search', 'Visible Results', filteredRx.length, searchQuery ? 'Matching your search' : 'Ready for review'],
                                        ].map(([icon, label, value, note]) => (
                                            <div key={label} className="ops-summary-card role-summary-card">
                                                <div className="role-summary-card-topline">
                                                    <div className="ops-summary-label">{label}</div>
                                                    <span className="role-summary-icon"><Icon name={icon as 'pill' | 'search'} className="h-4 w-4" /></span>
                                                </div>
                                                <div className="ops-summary-value tabular-nums">{value}</div>
                                                <div className="ops-summary-note">{note}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="role-queue-panel ops-panel overflow-hidden">
                                    <div className="role-queue-header">
                                        <div>
                                            <h3 className="font-semibold text-[var(--text)]">Pending Prescriptions</h3>
                                            <p className="text-xs text-[var(--text-secondary)]">{prescriptions.length} awaiting dispensing review. Select a prescription to verify medication details.</p>
                                        </div>
                                    </div>
                                    <div className="role-queue-toolbar pharmacy-queue-toolbar">
                                        <label className="role-search-field">
                                            <Icon name="search" className="h-4 w-4 text-[var(--text-muted)]" />
                                            <input
                                                type="text"
                                                aria-label="Search prescriptions by patient name"
                                                placeholder="Search patient name"
                                                className="bg-transparent border-none outline-none text-sm text-[var(--text-2)] w-full"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </label>
                                        <span className="role-result-count" aria-live="polite">{filteredRx.length} result{filteredRx.length === 1 ? '' : 's'}</span>
                                    </div>

                                    <div className="clinical-table-scroll">
                                        <table className="clinical-table pharmacy-prescription-table">
                                            <thead>
                                                <tr>
                                                    <th>Patient</th>
                                                    <th>Prescription Date</th>
                                                    <th>Status</th>
                                                    <th className="pharmacy-action-column">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loading ? (
                                                    <tr><td colSpan={4} className="px-6 py-10"><SkeletonTable rows={6} columns={4} /></td></tr>
                                                ) : loadError && prescriptions.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-6 py-12"><div className="role-queue-state" role="alert"><Icon name="alert-triangle" className="h-6 w-6" /><strong>Unable to load prescriptions</strong><span>Check the connection and try again.</span><button type="button" onClick={() => { setLoading(true); void loadPrescriptions(); }} className="clinical-link-action">Try again</button></div></td></tr>
                                                ) : filteredRx.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-6 py-12"><EmptyState title={searchQuery ? 'No prescriptions match your search' : 'No pending prescriptions'} description={searchQuery ? 'Try a different patient name.' : 'New e-prescriptions from doctors will appear here.'} /></td></tr>
                                                ) : (
                                                    filteredRx.map(rx => (
                                                        <tr key={rx.prescription_id} onClick={() => handleRxSelect(rx)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleRxSelect(rx); } }} tabIndex={0} aria-label={`Review prescription for ${rx.patients?.lastName}, ${rx.patients?.firstName}`} className="cursor-pointer role-action-row">
                                                            <td data-label="Patient">
                                                                <div className="clinical-primary">{rx.patients?.lastName}, {rx.patients?.firstName}</div>
                                                                <div className="clinical-secondary">{rx.patients?.sex || '-'}</div>
                                                            </td>
                                                            <td data-label="Prescription Date">{new Date(rx.prescription_date).toLocaleDateString('en-PH')}</td>
                                                            <td data-label="Status"><span className="clinical-status-badge warning"><Icon name="clock" className="h-3 w-3" /> Pending</span></td>
                                                            <td data-label="Action" className="pharmacy-action-cell">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleRxSelect(rx); }}
                                                                    aria-label={`Review prescription for ${rx.patients?.lastName}, ${rx.patients?.firstName}`}
                                                                    className="clinical-link-action"
                                                                >
                                                                    Review
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Prescription detail drawer */}
            {selectedRx && (
                <ClinicalDrawer
                    title="E-Prescription Details"
                    labelledBy="prescription-dialog-title"
                    onClose={() => setSelectedRx(null)}
                    className="pharmacy-prescription-drawer"
                    subtitle={<>Patient: <span className="font-semibold text-[var(--text-2)]">{selectedRx.patients?.firstName} {selectedRx.patients?.lastName}</span></>}
                    footer={(
                        <>
                            <button type="button" onClick={() => setSelectedRx(null)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-[var(--text-2)] bg-white border border-[var(--border)] hover:bg-[var(--surface-subtle)] transition-colors w-full sm:w-auto">
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={handlePrintUnavailable}
                                disabled={allChecked}
                                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all w-full sm:w-auto flex items-center justify-center gap-2 ${allChecked ? 'opacity-40 cursor-not-allowed bg-[var(--border-soft)] text-[var(--text-secondary)] border border-[var(--border)]' : 'text-[var(--pink)] bg-[var(--pink-tint)] border border-[var(--pink-border)] hover:bg-[var(--pink-border)] shadow-sm hover:shadow'}`}
                            >
                                <Icon name="printer" className="h-4 w-4" /> Print
                            </button>

                            <button
                                type="button"
                                onClick={handleDispense}
                                disabled={isDispensing}
                                className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--brand-active)] hover:bg-[var(--brand-active-hover)] disabled:opacity-50 transition-colors w-full sm:w-auto flex items-center justify-center gap-2"
                            >
                                {isDispensing ? 'Dispensing...' : <><Icon name="check" className="h-4 w-4" /> Mark as Dispensed</>}
                            </button>
                        </>
                    )}
                >
                            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                <h3 className="clinical-field-label mb-0">Prescribed Medications</h3>
                                <span className="text-xs font-medium text-[var(--text-secondary)]">Check each medication that can be dispensed.</span>
                            </div>

                            <div className="pharmacy-medication-list">
                                {medsToDispense.map((med: Medication, i: number) => (
                                    <article key={i} className={`pharmacy-medication-item ${dispenseChecklist[i] ? '' : 'is-unavailable'}`}>
                                        <label className="pharmacy-medication-check">
                                            <input
                                                type="checkbox"
                                                checked={!!dispenseChecklist[i]}
                                                onChange={() => handleToggleChecklist(i)}
                                            />
                                            <span>Dispense</span>
                                        </label>
                                        {[
                                            ['Medication', med.name],
                                            ['Dosage', med.dosage],
                                            ['Frequency', med.frequency],
                                            ['Duration', med.duration],
                                            ['Quantity', med.quantity],
                                        ].map(([label, value]) => (
                                            <div key={label} className={`pharmacy-medication-field ${label === 'Medication' ? 'is-name' : ''}`}>
                                                <span className="pharmacy-medication-label">{label}</span>
                                                <span className="pharmacy-medication-value">{value || '—'}</span>
                                            </div>
                                        ))}
                                    </article>
                                ))}
                            </div>
                </ClinicalDrawer>
            )}
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<PharmacyDashboard />);
}
