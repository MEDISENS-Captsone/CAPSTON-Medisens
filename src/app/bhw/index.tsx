import { Suspense, lazy, useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { Icon } from '../../components/shared/Icon';
import { Topbar } from '../../components/layout/Topbar';
import { PageHeader } from '../../components/layout/PageHeader';
import { SkeletonKpiGrid, SkeletonList } from '../../components/ui/Skeleton';
import { safeTrim } from '../../lib/utils/strings';
import { useToast } from '../../components/feedback/Toast';
import { useHashPage } from '../../hooks/useHashPage';


// ─── Imported Pure Components ────────────────────────────────────────────────
import type { Patient } from '../../components/patient/PatientDetailModal';

const RecordsComponent = lazy(() => import('../patients/records').then(module => ({ default: module.RecordsComponent })));
const TemplatesComponent = lazy(() => import('../patients/templates').then(module => ({ default: module.TemplatesComponent })));
const BHW_PATIENT_LIMIT = 1000;
const BHW_FHSIS_LIMIT = 1000;
const BHW_PATIENT_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, bloodType, address, contactNumber, birthday, civilStatus, nationality, religion, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress, created_at, patient_consent(consent_id)';
const PatientDetailModal = lazy(() => import('../../components/patient/PatientDetailModal').then(module => ({ default: module.PatientDetailModal })));
const PatientConsentModal = lazy(() => import('../../components/patient/PatientConsentModal').then(module => ({ default: module.PatientConsentModal })));

type ConsentRelation = { consent_id: string } | { consent_id: string }[] | null;
type BhwPatient = Patient & { patient_consent?: ConsentRelation };
type ConsentFilter = 'all' | 'pending' | 'signed';
const ReportGenerator = lazy(() => import('../../features/midwife/reportGenerator'));

const LazyPanelFallback = () => (
    <div className="rounded-xl border border-[var(--border)] bg-white">
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
    const [isDashboardLoading, setIsDashboardLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const [consentPatient, setConsentPatient] = useState<Patient | null>(null);
    const [signedConsentIds, setSignedConsentIds] = useState<Set<string>>(new Set());
    const [consentFilter, setConsentFilter] = useState<ConsentFilter>('all');
    const { showToast, ToastComponent } = useToast();

    // ─── SPA Navigation State ───
    const [activePage, setActivePage] = useHashPage('dashboard');

    const navItems = [
        { id: 'dashboard', label: 'Home', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'new-record', label: 'New Record', icon: 'user-plus', group: 'Patient Care' },
        { id: 'reports', label: 'FHSIS Reports', icon: 'chart', group: 'Records & Governance' }
    ];

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const fetchData = async () => {
            setDashboardError('');
            try {
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

                if (statsError) throw statsError;
                if (allPatients) setPatients(allPatients as Patient[]);

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

                if (fhsisError) throw fhsisError;
                if (fhsisData) {
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
            } catch (error) {
                console.error('Unable to load the BHW dashboard.', error);
                setDashboardError('Unable to load the community health queue. Check your connection and try again.');
            } finally {
                setIsDashboardLoading(false);
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
    }, [reloadToken]);

    const stats = useMemo(() => ({
        total: patients.length,
        male: patients.filter(p => p.sex === 'Male').length,
        female: patients.filter(p => p.sex === 'Female').length,
        withAddress: patients.filter(p => safeTrim(p.address) !== '').length
    }), [patients]);

    const recentPatients = useMemo(() => patients.slice(0, 5), [patients]);

    // Consent recorded during this session is tracked locally so the directory
    // badge flips immediately after a successful save, without refetching.
    const isConsentSigned = (p: Patient) => {
        if (signedConsentIds.has(p.id)) return true;
        const relation = (p as BhwPatient).patient_consent;
        return Array.isArray(relation) ? relation.length > 0 : !!relation;
    };

    const directoryPatients = useMemo(
        () => patients.filter(p => {
            if (consentFilter === 'pending') return !isConsentSigned(p);
            if (consentFilter === 'signed') return isConsentSigned(p);
            return true;
        }),
        [patients, consentFilter, signedConsentIds]
    );

    // Consent is signed in a dialog on top of the current list so the BHW never
    // loses their place. The dialog mounts the shared PatientConsent form.
    const openConsentFlow = (p: Patient) => setConsentPatient(p);

    const handleConsentSaved = (p: Patient) => {
        setSignedConsentIds(prev => {
            const next = new Set(prev);
            next.add(p.id);
            return next;
        });
        setConsentPatient(null);
        showToast('Patient consent recorded successfully.', false);
    };

    return (
        <div className="flex h-screen bg-[var(--bg)] overflow-hidden w-full">
            <ToastComponent />

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

            <main className="app-shell-main flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">
                
                <Topbar
                    title={activePage === 'dashboard' ? 'Dashboard' : activePage === 'records' ? 'Patient Records' : activePage === 'reports' ? 'FHSIS Reports' : activePage.replace(/-/g, ' ')}
                    sectionLabel="Barangay Health Worker"
                    userName={userName}
                    userInitials={userInitials}
                    userRole="Barangay Health Worker"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                    isNavigationOpen={isMobileMenuOpen}
                />

                <div className="app-content-canvas flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    <div className="w-full ">
                        
                        {/* ─── DASHBOARD VIEW ─── */}
                        {activePage === 'dashboard' && (
                            <>
                                <PageHeader
                                    title="Barangay Health Work Queue"
                                    subtitle="Register residents, review recent intakes, and continue FHSIS reporting."
                                />

                                <div className="pwa-page-pad flex flex-col pwa-panel-gap bhw-dashboard-workspace">
                                    {dashboardError && (
                                        <div className="role-dashboard-alert" role="alert">
                                            <div>
                                                <p className="role-dashboard-alert-title">Community queue unavailable</p>
                                                <p className="role-dashboard-alert-copy">{dashboardError}</p>
                                            </div>
                                            <button type="button" onClick={() => { setIsDashboardLoading(true); setReloadToken(value => value + 1); }} className="role-dashboard-retry">Try again</button>
                                        </div>
                                    )}

                                    {isDashboardLoading ? (
                                        <>
                                            <SkeletonKpiGrid count={4} className="role-dashboard-skeleton-grid" />
                                            <div className="ops-panel"><SkeletonList rows={5} /></div>
                                        </>
                                    ) : (
                                    <>
                                    <div className="ops-summary-grid bhw-summary-grid">
                                        {[
                                            ['Recent Registrations', recentPatients.length, 'Latest residents added', 'clock'],
                                            ['Total Patients', stats.total, 'Master registry', 'users'],
                                            ['FHSIS Records', records.length, 'Existing report entries', 'file-text'],
                                            ['With Address', stats.withAddress, 'Barangay-ready records', 'map-pin'],
                                        ].map(([label, value, note, icon]) => (
                                            <div key={label} className="ops-summary-card role-summary-card">
                                                <div className="role-summary-card-topline"><p className="ops-summary-label">{label}</p><span className="role-summary-icon"><Icon name={icon as string} className="h-4 w-4" /></span></div>
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
                                                <div className="role-queue-empty"><span className="role-queue-empty-icon"><Icon name="users" className="h-5 w-5" /></span><strong>No recent registrations</strong><span>Newly registered residents will appear here.</span></div>
                                            ) : (
                                                recentPatients.map(p => (
                                                    <button key={p.id} type="button" onClick={() => setSelectedPatient(p)}
                                                        aria-label={`Open chart for ${p.lastName}, ${p.firstName}`}
                                                        className="ops-row bhw-recent-registration-row clinical-row-button">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="ops-row-title">{p.lastName}, {p.firstName}</div>
                                                            <div className="ops-row-meta">{p.sex || '-'} | {p.bloodType || '-'} | {p.address || 'No address'}</div>
                                                        </div>
                                                        <div className="bhw-recent-registration-meta">
                                                            <div className="ops-row-meta">{p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</div>
                                                            <div className="ops-action">Open Chart</div>
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                        <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-subtle)] text-right">
                                            <button type="button" onClick={() => setActivePage('records')} className="text-[var(--brand-active)] font-semibold text-sm hover:text-[var(--brand-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]">View Patient Registry</button>
                                        </div>
                                    </div>

                                    <div className="ops-panel flex flex-col self-start lg:col-span-4">
                                        <div className="ops-panel-header">
                                            <div>
                                                <h2 className="ops-panel-title">Registry Status</h2>
                                                <p className="ops-panel-subtitle">Current master list counts</p>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-[var(--border-soft)] text-sm">
                                            {[
                                                ['Total Patients', stats.total],
                                                ['Male', stats.male],
                                                ['Female', stats.female],
                                                ['With Address', stats.withAddress],
                                            ].map(([label, value]) => (
                                                <div key={label} className="flex items-center justify-between px-4 py-3">
                                                    <span className="font-medium text-[var(--text-2)]">{label}</span>
                                                    <span className="font-semibold text-[var(--text)] tabular-nums">{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 p-4 border-t border-[var(--border)] bg-[var(--surface-subtle)]">
                                            <button type="button" onClick={() => setActivePage('new-record')} className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--surface-subtle)]">
                                                <Icon name="user-plus" className="h-4 w-4" /> Register Patient
                                            </button>
                                            <button type="button" onClick={() => setActivePage('reports')} className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--surface-subtle)]">
                                                <Icon name="chart" className="h-4 w-4" /> FHSIS Reports
                                            </button>
                                        </div>
                                    </div>
                                    </div>

                                    <section className="ops-panel flex w-full flex-col overflow-hidden" aria-labelledby="bhw-patient-directory-heading">
                                        <div className="ops-panel-header flex-wrap gap-3">
                                            <div>
                                                <h2 id="bhw-patient-directory-heading" className="ops-panel-title">Patient Directory</h2>
                                                <p className="ops-panel-subtitle">
                                                    <span className="font-semibold tabular-nums text-[var(--text)]">{directoryPatients.length}</span>{' '}
                                                    {consentFilter === 'all' ? 'registered patients' : `${consentFilter} patients`} · record consent for residents you registered
                                                </p>
                                            </div>
                                            <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-1" role="group" aria-label="Filter patients by consent status">
                                                {(['all', 'pending', 'signed'] as const).map(filter => {
                                                    const isActive = consentFilter === filter;
                                                    return (
                                                        <button
                                                            key={filter}
                                                            type="button"
                                                            onClick={() => setConsentFilter(filter)}
                                                            aria-pressed={isActive}
                                                            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)] ${isActive ? 'bg-[var(--brand-active)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}
                                                        >
                                                            {filter}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="max-h-[520px] flex-1 divide-y divide-[var(--border-soft)] overflow-y-auto bg-white">
                                            {directoryPatients.length === 0 ? (
                                                <div className="role-queue-empty">
                                                    <span className="role-queue-empty-icon"><Icon name="users" className="h-5 w-5" /></span>
                                                    <strong>{patients.length === 0 ? 'No patients registered yet' : `No ${consentFilter} patients`}</strong>
                                                    <span>{patients.length === 0 ? 'Residents you register will appear here.' : 'No patients currently match this consent filter.'}</span>
                                                </div>
                                            ) : (
                                                directoryPatients.map(p => {
                                                    const signed = isConsentSigned(p);
                                                    return (
                                                        <article key={p.id} className="clinical-worklist-row group flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedPatient(p)}
                                                                aria-label={`Open patient details for ${p.lastName}, ${p.firstName}`}
                                                                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="ops-row-title truncate">{p.lastName}, {p.firstName}</div>
                                                                    <div className="ops-row-meta truncate">{p.sex || '-'} · {p.age ?? '-'} yrs · {p.address || 'No address'}</div>
                                                                </div>
                                                                <span className="shrink-0">
                                                                    {signed ? (
                                                                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--green-border-soft)] bg-[var(--green-surface)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--green-text)]"><Icon name="check" className="h-3 w-3" /> Signed</span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--amber-border)] bg-[var(--amber-surface)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--amber-text)]"><Icon name="alert-triangle" className="h-3 w-3" /> Pending</span>
                                                                    )}
                                                                </span>
                                                            </button>
                                                            {!signed && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openConsentFlow(p)}
                                                                    className="clinical-row-action min-h-11 w-full sm:w-auto sm:shrink-0"
                                                                    aria-label={`Record consent for ${p.lastName}, ${p.firstName}`}
                                                                >
                                                                    <Icon name="clipboard" className="mr-1 inline h-3.5 w-3.5" /> Record Consent
                                                                </button>
                                                            )}
                                                        </article>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </section>
                                    </>
                                    )}
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
                        consentSigned={isConsentSigned(selectedPatient)}
                        onRecordConsent={activePage === 'records' ? undefined : openConsentFlow}
                    />
                </Suspense>
            )}

            {consentPatient && (
                <Suspense fallback={null}>
                    <PatientConsentModal
                        patientId={consentPatient.id}
                        patientName={`${consentPatient.firstName} ${consentPatient.lastName}`}
                        rhuPersonnel={userName}
                        onClose={() => setConsentPatient(null)}
                        onConsentSaved={() => handleConsentSaved(consentPatient)}
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
