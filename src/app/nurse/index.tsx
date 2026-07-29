import { Suspense, lazy, useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { Icon } from '../../components/shared/Icon';
import { Topbar } from '../../components/layout/Topbar';
import { PageHeader } from '../../components/layout/PageHeader';
import { ArchiveReviewPage } from '../../features/admin/ArchiveReviewPage';
import { SkeletonList } from '../../components/ui/Skeleton';


// ─── Imported Pure Components ────────────────────────────────────────────────
import type { Patient } from '../../components/patient/PatientDetailModal';

const RecordsComponent = lazy(() => import('../patients/records').then(module => ({ default: module.RecordsComponent })));
const TemplatesComponent = lazy(() => import('../patients/templates').then(module => ({ default: module.TemplatesComponent })));
const ConsultationComponent = lazy(() => import('../initial-consultation').then(module => ({ default: module.ConsultationComponent })));
const PatientDetailModal = lazy(() => import('../../components/patient/PatientDetailModal').then(module => ({ default: module.PatientDetailModal })));

const pageTitles: Record<string, string> = {
    dashboard: 'Nurse Dashboard',
    records: 'Patient Records',
    'new-record': 'New Record',
    consultation: 'Initial Consultation',
    'archive-review': 'Archive Review',
};

const LazyPanelFallback = () => (
    <div className="rounded-xl border border-slate-200 bg-white">
        <SkeletonList rows={4} />
    </div>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const NurseDashboard = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('N');
    const [consentedPatients, setConsentedPatients] = useState<Patient[]>([]);
    const [totalPatientsCount, setTotalPatientsCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [activePage, setActivePage] = useState(() => window.location.hash.replace('#', '') || 'dashboard');

    useEffect(() => {
        window.location.hash = activePage;
    }, [activePage]);

    // Modal state — still used by Records component
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    const navItems = [
        { id: 'dashboard', label: 'Home', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'new-record', label: 'New Record', icon: 'user-plus', group: 'Patient Care' },
        { id: 'consultation', label: 'Initial Consultation', icon: 'clipboard', group: 'Clinical Workflow' },
        { id: 'archive-review', label: 'Archive Review', icon: 'clipboard', group: 'Records & Governance' },
    ];

    // ─── Restored from old code: navigates to consultation with patient ID in URL ───
    const handleConsultNavigate = (patientId: string) => {
        window.history.pushState({}, '', `?id=${patientId}`);
        setActivePage('consultation');
    };

    // ─── Hoisted outside useEffect so the realtime channel always has a live reference ───
    const loadPatients = async () => {
        const { count: totalCount } = await supabase
            .from('patients')
            .select('id', { count: 'exact', head: true })
            .or('archive_status.eq.active,archive_status.is.null');
        setTotalPatientsCount(totalCount || 0);

        const { data, error } = await supabase
            .from('patients')
            .select(`
                id, firstName, middleName, lastName, age, sex, bloodType,
                address, philhealthStatus, philhealthNo, category, categoryOthers,
                createdAt:created_at, contactNumber, birthday, civilStatus,
                nationality, religion, educationalAttain, employmentStatus,
                relativeName, relativeRelation, relativeAddress,
                patient_consent ( consent_id )
            `)
            .or('archive_status.eq.active,archive_status.is.null')
            .order('created_at', { ascending: false });

        if (!error && data) {
            const consentedOnly = data.filter((p: any) =>
                Array.isArray(p.patient_consent) ? p.patient_consent.length > 0 : p.patient_consent !== null
            );
            setConsentedPatients(consentedOnly as Patient[]);
        }
    };

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const fetchData = async () => {
            const profile = await requireRole('nurse');
            const name = profile.fullName || 'Nurse User';
            setUserName(name);
            setUserInitials(getInitials(name, 'N'));

            await loadPatients();
        };

        fetchData();

        // Subscribe to all relevant table changes — patients and patient_consent
        // Using a ref-stable function (hoisted above) so the channel always fires correctly
        const channel = supabase
            .channel('nurse-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patients' }, () => loadPatients())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'patients' }, () => loadPatients())
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'patients' }, () => loadPatients())
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patient_consent' }, () => loadPatients())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'patient_consent' }, () => loadPatients())
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'patient_consent' }, () => loadPatients())
            .subscribe();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            supabase.removeChannel(channel);
        };
    }, []);

    const stats = useMemo(() => ({
        total: totalPatientsCount,
        consented: consentedPatients.length,
        male: consentedPatients.filter(p => p.sex === 'Male').length,
        female: consentedPatients.filter(p => p.sex === 'Female').length,
    }), [consentedPatients, totalPatientsCount]);

    const filteredPatients = useMemo(() => {
        const normalizedSearch = searchQuery.toLowerCase();
        return consentedPatients.filter(p =>
            `${p.firstName} ${p.middleName} ${p.lastName}`.toLowerCase().includes(normalizedSearch)
        );
    }, [consentedPatients, searchQuery]);

    return (
        <div className="flex h-screen bg-[var(--bg)] overflow-hidden w-full">

            <Sidebar
                activePage={activePage}
                userName={userName}
                userInitials={userInitials}
                userRole="Registered Nurse"
                navItems={navItems}
                onNavigate={(id) => setActivePage(id)}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">

                <Topbar
                    title={pageTitles[activePage] || 'Nurse Dashboard'}
                    sectionLabel="Nursing"
                    userName={userName}
                    userInitials={userInitials}
                    userRole="Registered Nurse"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                />

                <div className="flex-1 overflow-x-hidden overflow-y-auto w-full bg-[var(--bg)]">
                    <div className="w-full flex flex-col gap-5">

                        {activePage === 'dashboard' && (
                            <>
                                <PageHeader
                                    title="Nursing Intake Queue"
                                    subtitle="Patients with signed consent are ready for vitals and initial consultation."
                                    meta={<span className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                                        {stats.consented} ready for vitals
                                    </span>}
                                />

                                <div className="pwa-page-pad flex flex-col pwa-panel-gap patient-list-page-shell">
                                    <div className="ops-summary-grid">
                                        {[
                                            ['Ready for Vitals', stats.consented, 'Consented patients'],
                                            ['Total Patients', stats.total, 'Master registry'],
                                            ['Female', stats.female, 'Registered patients'],
                                            ['Male', stats.male, 'Registered patients'],
                                        ].map(([label, value, note]) => (
                                            <div key={label} className="ops-summary-card">
                                                <div className="ops-summary-label">{label}</div>
                                                <div className="ops-summary-value tabular-nums">{value}</div>
                                                <div className="ops-summary-note">{note}</div>
                                            </div>
                                        ))}
                                    </div>

                                    <section className="clinical-table-panel">
                                    <div className="clinical-table-titlebar nurse-consented-titlebar">
                                        <div>
                                            <h2 className="clinical-table-title">Consented Patients</h2>
                                            <p className="clinical-table-subtitle">Open a patient to continue the RHU consultation workflow.</p>
                                        </div>
                                        <span className="clinical-count-badge">{filteredPatients.length} result{filteredPatients.length !== 1 ? 's' : ''}</span>
                                    </div>

                                    <div className="clinical-toolbar">
                                        <div className="clinical-search">
                                            <Icon name="search" className="h-4 w-4 text-[var(--text-secondary)]" />
                                            <input
                                                type="text"
                                                aria-label="Search consented patients by name"
                                                placeholder="Search by name..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="clinical-table-scroll">
                                        {filteredPatients.length === 0 ? (
                                            <div className="text-center py-12">
                                                <Icon name="clock" className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                                                <p className="text-slate-500 font-medium">No consented patients found.</p>
                                            </div>
                                        ) : (
                                            <table className="clinical-table nurse-consented-table min-w-[820px]">
                                                <thead>
                                                    <tr>
                                                        <th className="nurse-col-patient">Patient</th>
                                                        <th className="nurse-col-profile">Profile</th>
                                                        <th className="nurse-col-address">Address</th>
                                                        <th className="nurse-col-date">Registered</th>
                                                        <th className="nurse-col-action text-right">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredPatients.map(p => {
                                                        const date = p.createdAt
                                                            ? new Date(p.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                                                            : '-';

                                                        return (
                                                            <tr key={p.id} onClick={() => handleConsultNavigate(p.id)} className="cursor-pointer transition-colors hover:bg-slate-50">
                                                                <td className="nurse-col-patient">
                                                                    <div className="patient-records-primary-cell">
                                                                        <div className="clinical-primary">{p.lastName}, {p.firstName} {p.middleName || ''}</div>
                                                                        <div className="clinical-secondary">Consent signed</div>
                                                                    </div>
                                                                </td>
                                                                <td className="nurse-col-profile">{p.sex || '-'} | {p.age ?? '-'} yrs | {p.bloodType || '-'}</td>
                                                                <td className="nurse-col-address">{p.address || 'No address'}</td>
                                                                <td className="nurse-col-date">{date}</td>
                                                                <td className="nurse-col-action text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); handleConsultNavigate(p.id); }}
                                                                        className="clinical-row-action"
                                                                    >
                                                                        Initial Intake
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                    </section>
                                </div>

                            </>
                        )}

                        {/* ─── Patient Records — untouched, modal still works here ─── */}
                        {activePage === 'records' && (
                            <div className="pwa-page-pad">
                                <Suspense fallback={<LazyPanelFallback />}>
                                    <RecordsComponent onPatientClick={(p) => setSelectedPatient(p as any)} />
                                </Suspense>
                            </div>
                        )}
                        {activePage === 'new-record' && (
                            <Suspense fallback={<LazyPanelFallback />}>
                                <TemplatesComponent />
                            </Suspense>
                        )}
                        {activePage === 'consultation' && (
                            <Suspense fallback={<LazyPanelFallback />}>
                                <ConsultationComponent />
                            </Suspense>
                        )}
                        {activePage === 'archive-review' && (
                            <>
                                <PageHeader
                                    title="Patient Archive Review"
                                    subtitle="Review inactive patient records and complete soft archive or restore actions with a required reason."
                                />
                                <ArchiveReviewPage isOnline={isOnline} />
                            </>
                        )}
                    </div>
                </div>
            </main>

            {/* Patient Detail Modal — only triggered from Records now, not the dashboard */}
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
    createRoot(rootElement).render(<NurseDashboard />);
}
