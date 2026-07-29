import { Suspense, lazy, useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { Icon } from '../../components/shared/Icon';
import { Topbar } from '../../components/layout/Topbar';
import { PageHeader } from '../../components/layout/PageHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { safeTrim } from '../../lib/utils/strings';


// ─── Imported Pure Components ────────────────────────────────────────────────
import type { Patient } from '../../components/patient/PatientDetailModal';

const RecordsComponent = lazy(() => import('../patients/records').then(module => ({ default: module.RecordsComponent })));
const TemplatesComponent = lazy(() => import('../patients/templates').then(module => ({ default: module.TemplatesComponent })));
const BHW_PATIENT_LIMIT = 1000;
const BHW_FHSIS_LIMIT = 1000;
const BHW_PATIENT_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, bloodType, address, contactNumber, birthday, civilStatus, nationality, religion, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress, created_at';
const PatientDetailModal = lazy(() => import('../../components/patient/PatientDetailModal').then(module => ({ default: module.PatientDetailModal })));
const ReportGenerator = lazy(() => import('../../features/midwife/reportGenerator'));

const LazyPanelFallback = () => (
    <div className="rounded-xl border border-slate-200 bg-white">
        <SkeletonList rows={4} />
    </div>
);

const BhwDashboard = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('?');
    const [patients, setPatients] = useState<Patient[]>([]);
    const [records, setRecords] = useState<any[]>([]); // State for FHSIS Census Logs
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    // ─── SPA Navigation State ───
    const [activePage, setActivePage] = useState(() => window.location.hash.replace('#', '') || 'dashboard');

    useEffect(() => {
        window.location.hash = activePage;
    }, [activePage]);

    const navItems = [
        { id: 'dashboard', label: 'Home', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'new-record', label: 'New Record', icon: 'user-plus', group: 'Patient Care' },
        { id: 'reports', label: 'OCR Generation', icon: 'chart', group: 'Records & Governance' }
    ];

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const fetchData = async () => {
            const profile = await requireRole('BHW');
            const name = profile.fullName || 'BHW User';
            setUserName(name);
            setUserInitials(getInitials(name));

            // 2. Fetch ALL patients
            const { data: allPatients, error: statsError } = await supabase
                .from('patients')
                .select(BHW_PATIENT_COLUMNS)
                .or('archive_status.eq.active,archive_status.is.null')
                .order('created_at', { ascending: false })
                .limit(BHW_PATIENT_LIMIT);

            if (!statsError && allPatients) {
                setPatients(allPatients as Patient[]);
            }

            // 3. Fetch FHSIS logs for the OCR Reports
            const { data: fhsisData, error: fhsisError } = await supabase
                .from('fhsis_logs')
                .select(`
                    id,
                    patient_id,
                    category,
                    data_fields,
                    report_month,
                    created_at,
                    patients (
                        firstName,
                        lastName,
                        address
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(BHW_FHSIS_LIMIT);

            if (!fhsisError && fhsisData) {
                // Flatten the relationship for the ReportGenerator
                const formattedRecords = fhsisData.map(record => {
                    const patientData: any = Array.isArray(record.patients) ? record.patients[0] : record.patients;
                    return {
                        ...record,
                        patientName: patientData ? safeTrim(`${patientData.firstName || ''} ${patientData.lastName || ''}`) : 'Unknown Patient',
                        address: patientData?.address || 'N/A'
                    };
                });
                setRecords(formattedRecords);
            }
        };

        fetchData();

        // Realtime subscription to auto-update reports when Midwife adds new Census Entry
        const channel = supabase
            .channel('bhw-fhsis-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fhsis_logs' }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            supabase.removeChannel(channel);
        };
    }, []);

    const stats = useMemo(() => ({
        total: patients.length,
        male: patients.filter(p => p.sex === 'Male').length,
        female: patients.filter(p => p.sex === 'Female').length,
        withAddress: patients.filter(p => safeTrim(p.address) !== '').length
    }), [patients]);

    const recentPatients = useMemo(() => patients.slice(0, 5), [patients]);

    return (
        <div className="flex h-screen bg-[var(--bg)] overflow-hidden w-full">
            
            <Sidebar
                activePage={activePage}
                userName={userName}
                userInitials={userInitials}
                userRole="Barangay Health Worker"
                navItems={navItems}
                onNavigate={(id) => setActivePage(id)}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">
                
                <Topbar
                    title={activePage === 'dashboard' ? 'Dashboard' : activePage === 'records' ? 'Patient Records' : activePage === 'reports' ? 'OCR Reports' : activePage.replace(/-/g, ' ')}
                    sectionLabel="Barangay Health Worker"
                    userName={userName}
                    userInitials={userInitials}
                    userRole="Barangay Health Worker"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                />

                <div className="flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    <div className="w-full ">
                        
                        {/* ─── DASHBOARD VIEW ─── */}
                        {activePage === 'dashboard' && (
                            <>
                                <PageHeader
                                    title="Barangay Health Work Queue"
                                    subtitle="Register residents, review recent intakes, and continue FHSIS reporting."
                                />

                                <div className="pwa-page-pad flex flex-col pwa-panel-gap">
                                    <div className="ops-summary-grid">
                                        {[
                                            ['Recent Registrations', recentPatients.length, 'Latest residents added'],
                                            ['Total Patients', stats.total, 'Master registry'],
                                            ['FHSIS Records', records.length, 'Existing report entries'],
                                            ['With Address', stats.withAddress, 'Barangay-ready records'],
                                        ].map(([label, value, note]) => (
                                            <div key={label} className="ops-summary-card">
                                                <p className="ops-summary-label">{label}</p>
                                                <p className="ops-summary-value tabular-nums">{value}</p>
                                                <p className="ops-summary-note">{note}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="ops-grid">
                                    <div className="ops-panel flex flex-col lg:col-span-8">
                                        <div className="ops-panel-header">
                                            <div>
                                                <h2 className="ops-panel-title">Recent Registrations</h2>
                                                <p className="ops-panel-subtitle">Latest residents added to the barangay registry</p>
                                            </div>
                                            <span className="ops-badge">{recentPatients.length} recent</span>
                                        </div>
                                        <div className="flex-1 ops-list">
                                            {recentPatients.length === 0 ? (
                                                <div className="ops-empty">No recent registrations.</div>
                                            ) : (
                                                recentPatients.map(p => (
                                                    <div key={p.id} onClick={() => setSelectedPatient(p)} className="ops-row bhw-recent-registration-row cursor-pointer">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="ops-row-title">{p.lastName}, {p.firstName}</div>
                                                            <div className="ops-row-meta">{p.sex || '-'} | {p.bloodType || '-'} | {p.address || 'No address'}</div>
                                                        </div>
                                                        <div className="bhw-recent-registration-meta">
                                                            <div className="ops-row-meta">{p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</div>
                                                            <div className="ops-action">Open Chart</div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/60 text-right">
                                            <button type="button" onClick={() => setActivePage('records')} className="text-slate-700 font-semibold text-sm hover:text-slate-700">View Patient Registry</button>
                                        </div>
                                    </div>

                                    <div className="ops-panel flex flex-col lg:col-span-4">
                                        <div className="ops-panel-header">
                                            <div>
                                                <h2 className="ops-panel-title">Registry Status</h2>
                                                <p className="ops-panel-subtitle">Current master list counts</p>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-slate-100 text-sm">
                                            {[
                                                ['Total Patients', stats.total],
                                                ['Male', stats.male],
                                                ['Female', stats.female],
                                                ['With Address', stats.withAddress],
                                            ].map(([label, value]) => (
                                                <div key={label} className="flex items-center justify-between px-4 py-3">
                                                    <span className="font-medium text-slate-600">{label}</span>
                                                    <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 p-4 border-t border-slate-200 bg-slate-50/60">
                                            <button type="button" onClick={() => setActivePage('new-record')} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                                                <Icon name="user-plus" className="h-4 w-4" /> Register Patient
                                            </button>
                                            <button type="button" onClick={() => setActivePage('reports')} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                                                <Icon name="chart" className="h-4 w-4" /> FHSIS Reports
                                            </button>
                                        </div>
                                    </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ─── MODULAR COMPONENT TABS ─── */}
                        {activePage === 'records' && (
                            <div className="pwa-page-pad patient-list-page-shell">
                                <Suspense fallback={<LazyPanelFallback />}>
                                    <RecordsComponent onPatientClick={(p) => setSelectedPatient(p as any)} />
                                </Suspense>
                            </div>
                        )}
                        
                        {activePage === 'new-record' && (
                            <div className="w-full pwa-dense-panel min-h-[500px] m-3 md:m-4 xl:m-5">
                                <Suspense fallback={<LazyPanelFallback />}>
                                    <TemplatesComponent />
                                </Suspense>
                            </div>
                        )}

                        {activePage === 'reports' && (
                            <div className="w-full bg-[var(--bg)] min-h-[500px] m-3 md:m-4 xl:m-5">
                                {/* Pass the newly fetched FHSIS logs down to the generator */}
                                <Suspense fallback={<LazyPanelFallback />}>
                                    <ReportGenerator records={records} />
                                </Suspense>
                            </div>
                        )}

                    </div>
                </div>
            </main>

            {selectedPatient && (
                <Suspense fallback={null}>
                    <PatientDetailModal
                        patient={selectedPatient}
                        onClose={() => setSelectedPatient(null)}
                        onPatientUpdate={(updated) => setSelectedPatient(updated)}
                    />
                </Suspense>
            )}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<BhwDashboard />);
}
