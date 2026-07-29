import { useState, useEffect } from 'react';
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

    const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);
    const [dispenseChecklist, setDispenseChecklist] = useState<Record<number, boolean>>({});
    const [isDispensing, setIsDispensing] = useState(false);
    const { showToast, ToastComponent } = useToast();

    // Sidebar & Layout State
    const [activePage, setActivePage] = useState(() => window.location.hash.replace('#', '') || 'queue');

    useEffect(() => {
        window.location.hash = activePage;
    }, [activePage]);

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

    // Background Refresh Interval (1.5s)
    useEffect(() => {
        const interval = setInterval(() => {
            if (activePage === 'queue' && isOnline) {
                loadPrescriptions();
            }
        }, 1500);
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
        } else if (error) {
            logError('Failed to load prescriptions', error);
        }
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
        if (!isOnline) {
            showToast('You are offline. Dispensing cannot be saved until the connection is restored.', true);
            return;
        }
        const { medications, malformed } = parsePrescriptionContent(selectedRx.rx_content);
        if (malformed || medications.length === 0) {
            showToast('Cannot dispense because medication content is missing or malformed.', true);
            return;
        }
        setIsDispensing(true);

        const { error } = await supabase
            .from('prescription')
            .update({
                status: 'Dispensed',
                dispensed_at: new Date().toISOString()
            })
            .eq('prescription_id', selectedRx.prescription_id);

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
        <div className="flex h-screen bg-[var(--bg)] overflow-hidden w-full">
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

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">

                <Topbar
                    title="Pharmacy Dashboard"
                    sectionLabel="Pharmacy"
                    userName={profile?.fullName || 'Loading...'}
                    userInitials={initials}
                    userRole="Pharmacist"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                />

                <div className="flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    <div className="w-full max-w-full flex flex-col gap-6">
                        {activePage === 'queue' && (
                            <>
                                <PageHeader
                                    title="Pharmacy Dispensing Queue"
                                    subtitle="Review pending e-prescriptions and document dispensing decisions."
                                />

                                <div className="pwa-page-pad">
                                    <div className="ops-summary-grid">
                                        {[
                                            ['To Dispense', prescriptions.length, 'Pending e-prescriptions'],
                                            ['Matching Search', filteredRx.length, 'Visible worklist'],
                                            ['Review Required', filteredRx.length, 'Open row for medication details'],
                                        ].map(([label, value, note]) => (
                                            <div key={label} className="ops-summary-card">
                                                <div className="ops-summary-label">{label}</div>
                                                <div className="ops-summary-value tabular-nums">{value}</div>
                                                <div className="ops-summary-note">{note}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="m-3 md:m-4 xl:m-5 ops-panel overflow-hidden">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 bg-slate-50/60 px-4 py-3">
                                        <div>
                                            <h3 className="font-semibold text-slate-900">Pending Prescriptions</h3>
                                            <p className="text-xs text-slate-500">{prescriptions.length} awaiting dispensing review. Select a prescription to verify medication details.</p>
                                        </div>
                                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full sm:w-auto">
                                            <Icon name="search" className="h-4 w-4 text-slate-400" />
                                            <input
                                                type="text"
                                                aria-label="Search prescriptions by patient"
                                                placeholder="Search patient..."
                                                className="bg-transparent border-none outline-none text-sm text-slate-700 w-full"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="clinical-table-scroll">
                                        <table className="clinical-table min-w-[720px]">
                                            <thead>
                                                <tr>
                                                    <th>Patient</th>
                                                    <th>Prescription Date</th>
                                                    <th>Status</th>
                                                    <th className="text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredRx.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-6 py-12"><EmptyState title="No pending prescriptions" description="New e-prescriptions from doctors will appear here." /></td></tr>
                                                ) : (
                                                    filteredRx.map(rx => (
                                                        <tr key={rx.prescription_id} onClick={() => handleRxSelect(rx)} className="cursor-pointer">
                                                            <td>
                                                                <div className="clinical-primary">{rx.patients?.lastName}, {rx.patients?.firstName}</div>
                                                                <div className="clinical-secondary">{rx.patients?.sex || '-'}</div>
                                                            </td>
                                                            <td>{new Date(rx.prescription_date).toLocaleDateString('en-PH')}</td>
                                                            <td><span className="clinical-status-badge warning"><Icon name="clock" className="h-3 w-3" /> Pending</span></td>
                                                            <td className="text-right"><span className="clinical-link-action">Review</span></td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
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
                    subtitle={<>Patient: <span className="font-semibold text-slate-700">{selectedRx.patients?.firstName} {selectedRx.patients?.lastName}</span></>}
                    footer={(
                        <>
                            <button type="button" onClick={() => setSelectedRx(null)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors w-full sm:w-auto">
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={handlePrintUnavailable}
                                disabled={allChecked}
                                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all w-full sm:w-auto flex items-center justify-center gap-2 ${allChecked ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-500 border border-slate-300' : 'text-pink-700 bg-pink-100 border border-pink-200 hover:bg-pink-200 shadow-sm hover:shadow'}`}
                            >
                                <Icon name="printer" className="h-4 w-4" /> Print
                            </button>

                            <button
                                type="button"
                                onClick={handleDispense}
                                disabled={isDispensing}
                                className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 transition-colors w-full sm:w-auto flex items-center justify-center gap-2"
                            >
                                {isDispensing ? 'Dispensing...' : <><Icon name="check" className="h-4 w-4" /> Mark as Dispensed</>}
                            </button>
                        </>
                    )}
                >
                            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                <h3 className="clinical-field-label mb-0">Prescribed Medications</h3>
                                <span className="text-xs font-medium text-slate-500">Check each medication that can be dispensed.</span>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="clinical-table-scroll">
                                    <table className="clinical-table min-w-[680px]">
                                        <thead>
                                            <tr>
                                                <th className="p-4 font-semibold text-center">Dispense</th>
                                                <th className="p-4 font-semibold">Medication</th>
                                                <th className="p-4 font-semibold">Dosage</th>
                                                <th className="p-4 font-semibold">Frequency</th>
                                                <th className="p-4 font-semibold">Quantity</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {medsToDispense.map((med: Medication, i: number) => (
                                                <tr key={i} className={`border-b border-slate-200 last:border-0 transition-colors ${dispenseChecklist[i] ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/70 text-slate-600'}`}>
                                                    <td className="p-4 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-5 h-5 accent-teal-700 cursor-pointer"
                                                            checked={!!dispenseChecklist[i]}
                                                            onChange={() => handleToggleChecklist(i)}
                                                        />
                                                    </td>
                                                    <td className={`p-4 font-bold ${dispenseChecklist[i] ? 'text-slate-700' : 'text-red-700 line-through'}`}>{med.name}</td>
                                                    <td className="p-4 text-slate-700">{med.dosage}</td>
                                                    <td className="p-4 text-slate-700">{med.frequency}</td>
                                                    <td className="p-4 font-semibold text-slate-900 tabular-nums">{med.quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
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
