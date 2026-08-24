import { Suspense, lazy, useMemo, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { logout, requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { Icon } from '../../components/shared/Icon';
import { Topbar } from '../../components/layout/Topbar';
import { NetworkBadge } from '../../components/shared/NetworkBadge';
import { PageHeader } from '../../components/layout/PageHeader';
import { SkeletonKpiGrid, SkeletonList } from '../../components/ui/Skeleton';
import { safeTrim } from '../../lib/utils/strings';
import { useToast } from '../../components/feedback/Toast';
import { useHashPage } from '../../hooks/useHashPage';
import medisensLogo from '../../assets/MEDISENS Logo.png';
// The BHW touch registration surface depends on these role styles directly.
// Do not rely on Sidebar's incidental stylesheet import for this route.
import '../../styles/dashboard.css';


// ─── Imported Pure Components ────────────────────────────────────────────────
import type { Patient } from '../../components/patient/PatientDetailModal';

const RecordsComponent = lazy(() => import('../patients/records').then(module => ({ default: module.RecordsComponent })));
const TemplatesComponent = lazy(() => import('../patients/templates').then(module => ({ default: module.TemplatesComponent })));
const BHW_PATIENT_LIMIT = 1000;
const BHW_PATIENT_COLUMNS = 'id, firstName, middleName, lastName, suffix, age, sex, bloodType, address, contactNumber, birthday, civilStatus, nationality, religion, educationalAttain, employmentStatus, philhealthNo, philhealthStatus, category, categoryOthers, relativeName, relativeRelation, relativeAddress, created_at, patient_consent(consent_id, consent_date, created_at)';
const PatientDetailModal = lazy(() => import('../../components/patient/PatientDetailModal').then(module => ({ default: module.PatientDetailModal })));
const PatientConsentModal = lazy(() => import('../../components/patient/PatientConsentModal').then(module => ({ default: module.PatientConsentModal })));

type ConsentRelation = { consent_id: string; consent_date?: string | null; created_at?: string | null } | { consent_id: string; consent_date?: string | null; created_at?: string | null }[] | null;
type BhwPatient = Patient & { patient_consent?: ConsentRelation };
type ConsentFilter = 'all' | 'pending' | 'signed';

const LazyPanelFallback = () => (
    <div className="rounded-xl border border-[var(--border)] bg-white">
        <SkeletonList rows={4} />
    </div>
);
interface BhwTouchHeaderProps {
    userName: string;
    userInitials: string;
    isOnline: boolean;
}

function BhwTouchHeader({ userName, userInitials, isOnline }: BhwTouchHeaderProps) {
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false);
    const accountButtonRef = useRef<HTMLButtonElement>(null);
    const cancelLogoutRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isAccountMenuOpen && !isLogoutConfirmationOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (isLogoutConfirmationOpen) setIsLogoutConfirmationOpen(false);
            else setIsAccountMenuOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAccountMenuOpen, isLogoutConfirmationOpen]);

    useEffect(() => {
        if (!isLogoutConfirmationOpen) return;
        cancelLogoutRef.current?.focus();
    }, [isLogoutConfirmationOpen]);

    const closeAccountMenu = () => {
        setIsAccountMenuOpen(false);
        accountButtonRef.current?.focus({ preventScroll: true });
    };

    return (
        <>
        <header className="bhw-touch-header" aria-label="MediSens BHW header">
            <div className="bhw-touch-header-brand">
                <span className={`bhw-touch-logo ${isOnline ? 'bg-[var(--brand-primary)]' : 'bg-[var(--amber-accent)]'}`} aria-hidden="true">
                    <img src={medisensLogo} alt="" className="h-5 w-5 object-contain brightness-0 invert" />
                </span>
                <span className="min-w-0">
                    <span className="block text-[length:var(--type-card-title-size)] font-semibold leading-[var(--type-card-title-line)] text-[var(--text)]">MEDISENS</span>
                    <span className="block truncate text-[length:var(--type-category-size)] font-semibold uppercase leading-[var(--type-category-line)] tracking-[var(--tracking-nav-category)] text-[var(--text-muted)]">Barangay Health Worker</span>
                </span>
            </div>
            <NetworkBadge isOnline={isOnline} compact />
            <div className="bhw-touch-header-profile">
                <button ref={accountButtonRef} type="button" className="bhw-touch-account-trigger" onClick={() => setIsAccountMenuOpen(true)} aria-haspopup="dialog" aria-expanded={isAccountMenuOpen} aria-label={`Open account menu for ${userName}, Barangay Health Worker`}>
                    <span className="min-w-0"><strong>{userName}</strong><small>Barangay Health Worker</small></span>
                    <span className={`bhw-touch-account-avatar ${isOnline ? 'bg-[var(--brand-primary-hover)]' : 'bg-[var(--amber-accent)]'}`}>{userInitials}</span>
                </button>
            </div>
        </header>
        {isAccountMenuOpen && <div className="bhw-account-popover-dismiss" onClick={closeAccountMenu} role="presentation"><section className="bhw-account-menu" role="dialog" aria-modal="true" aria-labelledby="bhw-account-menu-title" onClick={event => event.stopPropagation()}><div><p id="bhw-account-menu-title">{userName}</p><span>Barangay Health Worker</span></div><button type="button" className="bhw-account-logout-action" onClick={() => { setIsAccountMenuOpen(false); setIsLogoutConfirmationOpen(true); }}><Icon name="logout" className="h-5 w-5" />Log out</button></section></div>}
        {isLogoutConfirmationOpen && <div className="bhw-account-confirmation-backdrop" onClick={() => setIsLogoutConfirmationOpen(false)} role="presentation"><section className="bhw-logout-confirmation" role="dialog" aria-modal="true" aria-labelledby="bhw-logout-confirmation-title" onClick={event => event.stopPropagation()}><span className="bhw-logout-confirmation-icon"><Icon name="logout" className="h-5 w-5" /></span><h2 id="bhw-logout-confirmation-title">Log out of MediSens?</h2><p>You will need to sign in again to continue.</p><div><button ref={cancelLogoutRef} type="button" className="bhw-wizard-back" onClick={() => setIsLogoutConfirmationOpen(false)}>Cancel</button><button type="button" className="bhw-account-confirm-logout" onClick={() => void logout()}>Log out</button></div></section></div>}
        </>
    );
}

interface BhwTouchNavigationProps {
    activePage: string;
    onNavigate: (page: 'dashboard' | 'records') => void;
}

function BhwTouchNavigation({ activePage, onNavigate }: BhwTouchNavigationProps) {
    const destinations = [
        { id: 'dashboard' as const, label: 'Home', icon: 'home' },
        { id: 'records' as const, label: 'Patient Records', icon: 'users' },
    ];

    return (
        <nav className="bhw-touch-navigation" aria-label="BHW touch navigation">
            {destinations.map(destination => {
                const isActive = activePage === destination.id;
                return (
                    <button
                        key={destination.id}
                        type="button"
                        onClick={() => onNavigate(destination.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`bhw-touch-navigation-item ${isActive ? 'is-active' : ''}`}
                    >
                        <Icon name={destination.icon} className="h-5 w-5" />
                        <span>{destination.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}

function getGreeting(name: string) {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = name === 'Loading...' ? 'BHW' : name.split(' ')[0] || 'BHW';
    return `${salutation}, ${firstName}!`;
}

const BhwDashboard = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('?');
    const [patients, setPatients] = useState<Patient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [lastUpdatedPatient, setLastUpdatedPatient] = useState<Patient | null>(null);
    const [isDashboardLoading, setIsDashboardLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const [consentPatient, setConsentPatient] = useState<Patient | null>(null);
    const [signedConsentIds, setSignedConsentIds] = useState<Set<string>>(new Set());
    const [signedConsentDates, setSignedConsentDates] = useState<Map<string, string>>(new Map());
    const [consentFilter, setConsentFilter] = useState<ConsentFilter>('all');
    const { showToast, ToastComponent } = useToast();

    // ─── SPA Navigation State ───
    const [activePage, setActivePage] = useHashPage('dashboard', page =>
        ['dashboard', 'records', 'new-record'].includes(page) ? page : 'dashboard'
    );

    const navItems = [
        { id: 'dashboard', label: 'Home', icon: 'home', group: 'Overview' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'new-record', label: 'New Record', icon: 'user-plus', group: 'Patient Care' }
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

            } catch (error) {
                console.error('Unable to load the BHW dashboard.', error);
                setDashboardError('Unable to load the community health queue. Check your connection and try again.');
            } finally {
                setIsDashboardLoading(false);
            }
        };

        fetchData();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
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

    const consentCounts = useMemo(() => patients.reduce(
        (counts, patient) => {
            counts.all += 1;
            if (isConsentSigned(patient)) counts.signed += 1;
            else counts.pending += 1;
            return counts;
        },
        { all: 0, pending: 0, signed: 0 },
    ), [patients, signedConsentIds, signedConsentDates]);

    const getLatestConsentTime = (p: Patient) => {
        const locallySignedAt = signedConsentDates.get(p.id);
        if (locallySignedAt) return Date.parse(locallySignedAt) || 0;

        const relation = (p as BhwPatient).patient_consent;
        const consents = Array.isArray(relation) ? relation : relation ? [relation] : [];
        return consents.reduce((latest, consent) => {
            const signedAt = Date.parse(consent.consent_date || consent.created_at || '') || 0;
            return Math.max(latest, signedAt);
        }, 0);
    };

    const directoryPatients = useMemo(
        () => patients
            .filter(p => {
                if (consentFilter === 'pending') return !isConsentSigned(p);
                if (consentFilter === 'signed') return isConsentSigned(p);
                return true;
            })
            .sort((first, second) => getLatestConsentTime(second) - getLatestConsentTime(first)),
        [patients, consentFilter, signedConsentIds, signedConsentDates]
    );

    // Consent is signed in a dialog on top of the current list so the BHW never
    // loses their place. The dialog mounts the shared PatientConsent form.
    const openConsentFlow = (p: Patient) => setConsentPatient(p);

    const handleConsentSaved = (p: Patient, consentDate: string) => {
        setSignedConsentIds(prev => {
            const next = new Set(prev);
            next.add(p.id);
            return next;
        });
        setSignedConsentDates(prev => new Map(prev).set(p.id, consentDate));
        setConsentPatient(null);
        showToast('Patient consent recorded successfully.', false);
    };

    const handlePatientUpdated = (updatedPatient: Patient) => {
        setPatients(currentPatients => currentPatients.map(patient =>
            patient.id === updatedPatient.id ? { ...patient, ...updatedPatient } : patient,
        ));
        setSelectedPatient(updatedPatient);
        setLastUpdatedPatient(updatedPatient);
    };

    const retryDashboardLoad = () => {
        setIsDashboardLoading(true);
        setReloadToken(current => current + 1);
    };

    return (
        <div className="bhw-app-shell flex h-screen w-full overflow-hidden bg-[var(--bg)]">
            <ToastComponent />

            <BhwTouchHeader userName={userName} userInitials={userInitials} isOnline={isOnline} />

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
                    title={activePage === 'dashboard' ? 'Dashboard' : activePage === 'records' ? 'Patient Records' : activePage.replace(/-/g, ' ')}
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
                                <div className="bhw-home-desktop">
                                    <PageHeader
                                        title="Barangay Health Work Queue"
                                        subtitle="Register residents, review recent intakes, and manage patient records."
                                    />
                                </div>

                                <div className="bhw-home-touch pwa-page-pad">
                                    {dashboardError && (
                                        <div className="role-dashboard-alert" role="alert">
                                            <div>
                                                <strong>Community health queue unavailable</strong>
                                                <span>{dashboardError}</span>
                                            </div>
                                            <button type="button" onClick={retryDashboardLoad} className="clinical-secondary-action min-h-11">Try again</button>
                                        </div>
                                    )}
                                    <div className="bhw-home-greeting">
                                        <p className="bhw-home-greeting-eyebrow">Community health workspace</p>
                                        <h2>{getGreeting(userName)}</h2>
                                        <p>How can we help you today?</p>
                                    </div>

                                    <section className="bhw-home-quick-actions" aria-label="Common BHW tasks">
                                        <button type="button" onClick={() => setActivePage('new-record')} className="bhw-home-task bhw-home-task-primary">
                                            <span className="bhw-home-task-icon"><Icon name="user-plus" className="h-7 w-7" /></span>
                                            <span>
                                                <strong>Register Patient</strong>
                                                <small>Add a resident to the patient registry.</small>
                                            </span>
                                            <Icon name="chevron-right" className="bhw-home-task-chevron h-5 w-5" />
                                        </button>
                                        <button type="button" onClick={() => setActivePage('records')} className="bhw-home-task">
                                            <span className="bhw-home-task-icon"><Icon name="search" className="h-7 w-7" /></span>
                                            <span>
                                                <strong>Find Patient</strong>
                                                <small>Search and open an existing record.</small>
                                            </span>
                                            <Icon name="chevron-right" className="bhw-home-task-chevron h-5 w-5" />
                                        </button>
                                    </section>

                                    <section className="bhw-home-section bhw-home-section-recent" aria-labelledby="bhw-recent-registrations-heading">
                                        <div className="bhw-home-section-heading">
                                            <div>
                                                <h2 id="bhw-recent-registrations-heading">Recent Registrations</h2>
                                                <p>Recently added residents</p>
                                            </div>
                                            <button type="button" onClick={() => setActivePage('records')} className="bhw-home-text-action">View all</button>
                                        </div>
                                        <div className="bhw-home-recent-list">
                                            {isDashboardLoading ? (
                                                <div className="p-4" aria-label="Loading recent registrations"><SkeletonList rows={3} /></div>
                                            ) : recentPatients.length === 0 ? (
                                                <div className="role-queue-empty"><span className="role-queue-empty-icon"><Icon name="users" className="h-5 w-5" /></span><strong>No recent registrations</strong><span>Newly registered residents will appear here.</span></div>
                                            ) : recentPatients.slice(0, 3).map(patient => (
                                                <button key={patient.id} type="button" onClick={() => setSelectedPatient(patient)} className="bhw-home-recent-row" aria-label={`Open chart for ${patient.lastName}, ${patient.firstName}`}>
                                                    <span className="min-w-0">
                                                        <strong>{patient.lastName}, {patient.firstName}</strong>
                                                        <small>{patient.age ?? '-'} yrs · {patient.sex || '-'} · {patient.address?.split(',')[0] || 'No barangay'}</small>
                                                    </span>
                                                    <span className="bhw-home-date">{patient.created_at ? new Date(patient.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                                                    <Icon name="chevron-right" className="h-5 w-5" />
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="bhw-home-section bhw-home-directory" aria-labelledby="bhw-touch-patient-directory-heading">
                                        <div className="bhw-home-section-heading">
                                            <div>
                                                <h2 id="bhw-touch-patient-directory-heading">Patient Directory</h2>
                                                <p>{directoryPatients.length} {consentFilter === 'all' ? 'registered patients' : `${consentFilter} patients`}</p>
                                            </div>
                                        </div>
                                        <div className="bhw-home-directory-tabs" role="group" aria-label="Filter patients by consent status">
                                            {(['all', 'pending', 'signed'] as const).map(filter => {
                                                const isActive = consentFilter === filter;
                                                const label = filter === 'all' ? 'All' : filter === 'pending' ? 'Pending' : 'Signed';
                                                return <button key={filter} type="button" onClick={() => setConsentFilter(filter)} aria-pressed={isActive} className={isActive ? 'is-active' : ''}>{label} <span className="bhw-home-directory-tab-count">{consentCounts[filter]}</span></button>;
                                            })}
                                        </div>
                                        <div className="bhw-home-directory-list">
                                            {isDashboardLoading ? (
                                                <div className="p-4" aria-label="Loading patient directory"><SkeletonList rows={4} /></div>
                                            ) : directoryPatients.length === 0 ? (
                                                <div className="role-queue-empty"><span className="role-queue-empty-icon"><Icon name="users" className="h-5 w-5" /></span><strong>{patients.length === 0 ? 'No patients registered yet' : consentFilter === 'pending' ? 'No Pending consent patients' : consentFilter === 'signed' ? 'No Signed consent patients' : 'No patients found'}</strong><span>{patients.length === 0 ? 'Residents you register will appear here.' : consentFilter === 'pending' ? 'All listed patients currently have signed consent.' : consentFilter === 'signed' ? 'No signed consent records are available yet.' : 'No patients currently match this directory view.'}</span></div>
                                            ) : directoryPatients.map(patient => {
                                                const signed = isConsentSigned(patient);
                                                return (
                                                    <article key={patient.id} className="bhw-home-directory-row">
                                                        <button type="button" onClick={() => setSelectedPatient(patient)} className="bhw-home-directory-patient" aria-label={`Open patient details for ${patient.lastName}, ${patient.firstName}`}>
                                                            <span className="min-w-0"><strong>{patient.lastName}, {patient.firstName}</strong><small>{patient.age ?? '-'} yrs · {patient.sex || '-'} · {patient.address?.split(',')[0] || 'No barangay'}</small></span>
                                                            <span className={`bhw-home-consent-status ${signed ? 'is-signed' : 'is-pending'}`}><Icon name={signed ? 'check' : 'alert-triangle'} className="h-3.5 w-3.5" />{signed ? 'Signed' : 'Pending'}</span>
                                                            <Icon name="chevron-right" className="h-5 w-5 shrink-0" />
                                                        </button>
                                                        {!signed && <button type="button" onClick={() => openConsentFlow(patient)} className="bhw-home-consent-action"><Icon name="clipboard" className="h-4 w-4" />Record Consent</button>}
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                </div>

                                <div className="bhw-home-desktop pwa-page-pad flex flex-col pwa-panel-gap bhw-dashboard-workspace">
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
                                    <RecordsComponent
                                        onPatientClick={(p) => setSelectedPatient(p as any)}
                                        updatedPatient={lastUpdatedPatient}
                                        touchLayout
                                    />
                                </Suspense>
                            </div>
                        )}
                        
                        {activePage === 'new-record' && (
                            <div className="bhw-registration-touch w-full min-h-[500px] pwa-dense-panel m-3 md:m-4 xl:m-5">
                                <Suspense fallback={<LazyPanelFallback />}>
                                    <TemplatesComponent touchWizard onBackToHome={() => setActivePage('dashboard')} />
                                </Suspense>
                            </div>
                        )}


                    </div>
                </div>
            </main>

            {(activePage === 'dashboard' || activePage === 'records') && (
                <BhwTouchNavigation activePage={activePage} onNavigate={setActivePage} />
            )}

            {selectedPatient && (
                <Suspense fallback={null}>
                    <PatientDetailModal
                        patient={selectedPatient}
                        onClose={() => setSelectedPatient(null)}
                        onPatientUpdate={handlePatientUpdated}
                        consentSigned={isConsentSigned(selectedPatient)}
                        onRecordConsent={activePage === 'records' ? undefined : openConsentFlow}
                        bhwTouchLayout
                        staffRole="BHW"
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
                        onConsentSaved={(consentDate) => handleConsentSaved(consentPatient, consentDate)}
                        bhwTouchLayout
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
