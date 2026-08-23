import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { Icon } from '../../components/shared/Icon';
import { Topbar } from '../../components/layout/Topbar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { LoadingState } from '../../components/ui';
import { safeTrim } from '../../lib/utils/strings';
import { PatientTransactionHistory } from '../../components/patient/PatientTransactionHistory';
import { PatientChartIdentityHeader, PatientHistoryPanel } from '../../components/patient/PatientChart';

import Dashboard from '../../features/midwife/dashboard';
import PatientRecords from '../../features/midwife/patientRecords';
import { useMidwifeData } from '../../features/midwife/useMidwifeData';
import { DoctorAnalyticsPage } from '../../features/doctor/DoctorAnalyticsPage';
import { useHashPage } from '../../hooks/useHashPage';

import { FhsisMidwifeWorkspace } from '../../features/fhsis/midwife/FhsisMidwifeWorkspace';
const ConsultationComponent = lazy(() => import('../initial-consultation').then(module => ({ default: module.ConsultationComponent })));

const LazyPanelFallback = () => (
    <div className="rounded-xl border border-[var(--border)] bg-white">
        <SkeletonList rows={4} />
    </div>
);

// ─── Detail Item ──────────────────────────────────────────────────────────────
function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
    const isEmpty = value === null || value === undefined || value === '';
    return (
        <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{label}</div>
            <div className={`text-sm font-semibold ${isEmpty ? 'text-[var(--text-muted)] italic' : 'text-[var(--text)]'}`}>
                {isEmpty ? 'Not provided' : value}
            </div>
        </div>
    );
}

const sectionCls = "bg-white border border-[var(--border)] rounded-lg p-4 md:p-5 mb-4 shadow-sm";
const headerCls  = "flex items-center gap-2 text-sm font-semibold text-[var(--text-2)] uppercase tracking-wide border-b border-[var(--border)] pb-3 mb-4";

// ─── Patient Details Panel ────────────────────────────────────────────────────
function PatientDetailsPanel({
    patient,
    consentSigned,
    onViewHistory,
}: {
    patient: any;
    consentSigned: boolean;
    onViewHistory: () => void;
}) {
    const displayCategory = () => {
        if (patient.category === 'Other/s') return `Others (${patient.categoryOthers || 'Unspecified'})`;
        return patient.category || 'N/A';
    };

    return (
        <div className="">
            {/* Profile banner */}
            <div className="bg-white border border-[var(--border)] rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-md bg-[var(--brand-active)] text-white flex items-center justify-center font-semibold text-lg shadow-sm shrink-0 uppercase">
                    {patient.firstName?.[0]}{patient.lastName?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[var(--text)] text-lg leading-tight truncate">
                        {patient.firstName} {patient.middleName} {patient.lastName} {patient.suffix}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        <span className="text-xs text-[var(--text-secondary)] font-medium inline-flex items-center gap-1"><Icon name="droplet" className="h-3.5 w-3.5" /> <span className="font-bold text-[var(--text-2)]">{patient.bloodType || '—'}</span></span>
                        <span className="text-xs text-[var(--text-secondary)] font-medium inline-flex items-center gap-1"><Icon name="user" className="h-3.5 w-3.5" /> <span className="font-bold text-[var(--text-2)]">{patient.sex || '—'}</span></span>
                        <span className="text-xs text-[var(--text-secondary)] font-medium inline-flex items-center gap-1"><Icon name="calendar" className="h-3.5 w-3.5" /> <span className="font-bold text-[var(--text-2)]">{patient.age ?? '—'}</span> yrs</span>
                        <span className="text-xs text-[var(--text-secondary)] font-medium inline-flex items-center gap-1"><Icon name="map-pin" className="h-3.5 w-3.5" /> <span className="font-bold text-[var(--text-2)]">{patient.address || '—'}</span></span>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onViewHistory}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-[0.65rem] font-extrabold text-[var(--text-2)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-color)]"
                    >
                        <Icon name="clock" className="mr-1 inline h-3.5 w-3.5" /> History
                    </button>
                    {consentSigned ? (
                        <span className="bg-[var(--green-surface)] text-[var(--green-text)] border border-[var(--green-border-soft)] text-[0.65rem] font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5" /> Consent Signed</span>
                    ) : (
                        <span className="bg-[var(--amber-surface)] text-[var(--amber-text)] border border-[var(--amber-border)] text-[0.65rem] font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Icon name="alert-triangle" className="h-3.5 w-3.5" /> Pending Consent</span>
                    )}
                </div>
            </div>

            {/* Section I */}
            <div className={sectionCls}>
                <div className={headerCls}><Icon name="users" className="h-4 w-4" /> I. Patient's Information</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <DetailItem label="First Name"            value={patient.firstName} />
                    <DetailItem label="Middle Name"           value={patient.middleName} />
                    <DetailItem label="Last Name"             value={patient.lastName} />
                    <DetailItem label="Suffix"                value={patient.suffix} />
                    <DetailItem label="Age"                   value={patient.age} />
                    <DetailItem label="Sex"                   value={patient.sex} />
                    <DetailItem label="Birthday"              value={patient.birthday} />
                    <DetailItem label="Birth Place"           value={patient.birthPlace} />
                    <DetailItem label="Blood Type"            value={patient.bloodType} />
                    <DetailItem label="Nationality"           value={patient.nationality} />
                    <DetailItem label="Religion"              value={patient.religion} />
                    <DetailItem label="Civil Status"          value={patient.civilStatus} />
                    <DetailItem label="Contact Number"        value={patient.contactNumber} />
                    <DetailItem label="Address"               value={patient.address} />
                    <DetailItem label="Educational Attainment" value={patient.educationalAttain} />
                    <DetailItem label="Employment Status"     value={patient.employmentStatus} />
                </div>
            </div>

            {/* Section II */}
            <div className={sectionCls}>
                <div className={headerCls}><Icon name="file-text" className="h-4 w-4" /> II. PhilHealth &amp; Categorization</div>
                <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="PhilHealth No."    value={patient.philhealthNo} />
                    <DetailItem label="PhilHealth Status" value={patient.philhealthStatus} />
                    <DetailItem label="Category"          value={displayCategory()} />
                </div>
            </div>

            {/* Section III */}
            <div className={sectionCls}>
                <div className={headerCls}><Icon name="alert-triangle" className="h-4 w-4" /> III. Emergency Contact</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <DetailItem label="Relative's Name"    value={patient.relativeName} />
                    <DetailItem label="Relationship"       value={patient.relativeRelation} />
                    <DetailItem label="Relative's Address" value={patient.relativeAddress} />
                </div>
            </div>
        </div>
    );
}

// ─── Patient Modal ────────────────────────────────────────────────────────────
function PatientModal({
    patient,
    onClose,
}: {
    patient: any;
    rhuPersonnel: string;
    onClose: () => void;
    onConsentSaved: () => void;
}) {
    const [step, setStep] = useState<'details' | 'history'>('details');
    const consentSigned = Array.isArray(patient.patient_consent)
        ? patient.patient_consent.length > 0
        : !!patient.consent_signed;

    return (
        <div className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ">
            <div className="bg-[var(--bg)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-sm flex flex-col max-h-[92vh] sm:max-h-[88vh]">

                {/* Modal Header */}
                <div className="px-5 py-4 border-b border-[var(--border)] bg-white rounded-t-2xl flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        {step !== 'details' && (
                            <button
                                type="button"
                                onClick={() => setStep('details')}
                                aria-label="Back to patient details"
                                className="h-10 w-10 -m-1 flex items-center justify-center rounded-full bg-[var(--surface-subtle)] hover:bg-[var(--border-soft)] text-[var(--text-2)] font-bold text-sm transition-colors"
                            >
                                <span aria-hidden="true">←</span>
                            </button>
                        )}
                        <div className="text-xs font-bold px-2.5 py-1 rounded-md bg-[var(--brand-active)] text-white">
                            {step === 'details' ? 'Details' : 'History'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 w-10 -m-1 flex items-center justify-center rounded-full bg-[var(--surface-subtle)] hover:bg-[var(--border-soft)] text-[var(--text-secondary)] font-bold transition-colors"
                    >
                        <Icon name="close" className="h-4 w-4" label="Close patient details" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="overflow-y-auto flex-1 p-4 sm:p-6">
                    {step === 'details' ? (
                        <PatientDetailsPanel
                            patient={patient}
                            consentSigned={consentSigned}
                            onViewHistory={() => setStep('history')}
                        />
                    ) : (
                        <div className="">
                            <PatientChartIdentityHeader patient={patient} compact className="mb-4" />
                            <PatientHistoryPanel title="Patient History">
                                <PatientTransactionHistory patientId={patient.id} />
                            </PatientHistoryPanel>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const MidwifeApp = () => {
    const [activeTab, setActiveTab] = useHashPage('dashboard');

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [userData, setUserData] = useState({ name: 'Loading...', initials: 'U' });
    // FHSIS routes carry role-restricted report data. Gate them behind role
    // resolution so a mistaken/direct navigation never flashes report content
    // before requireRole('midwives') below has confirmed access (RLS remains
    // the real security boundary — this only prevents a UI flash).
    const [roleReady, setRoleReady] = useState(false);

    // ── Shared modal state — lives here so Dashboard + PatientRecords both use it
    const [selectedPatient, setSelectedPatient] = useState<any>(null);

    const { patients, records, isLoading, hasLoadError, refreshData } = useMidwifeData();

    const handleRealtimeChange = useCallback(async () => {
        await refreshData();
    }, [refreshData]);

    useEffect(() => {
        const handleOnline  = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online',  handleOnline);
        window.addEventListener('offline', handleOffline);

        const fetchProfile = async () => {
            const profile = await requireRole('midwives');
            const name = profile.fullName || 'Midwife';
            setUserData({ name, initials: getInitials(name, 'M') });
            setRoleReady(true);
        };
        fetchProfile();

        const channel = supabase
            .channel('midwife-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' },       handleRealtimeChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_consent' }, handleRealtimeChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fhsis_logs' },     handleRealtimeChange)
            .subscribe();

        return () => {
            window.removeEventListener('online',  handleOnline);
            window.removeEventListener('offline', handleOffline);
            supabase.removeChannel(channel);
        };
    }, [handleRealtimeChange]);

    // Mirrors the nurse shell's handleConsultNavigate: the shared initial
    // consultation form reads the patient id from the query string.
    const handleStartIntake = (patientId: string) => {
        window.history.pushState({}, '', `?id=${patientId}`);
        setActiveTab('consultation');
    };

    const midwifeNavItems = [
        { id: 'dashboard', label: 'Home',           icon: 'home', group: 'Overview' },
        { id: 'analytics', label: 'Analytics',      icon: 'chart', group: 'Insights' },
        { id: 'records',   label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'consultation', label: 'Initial Consultation', icon: 'clipboard', group: 'Clinical Workflow' },
        { id: 'fhsis-queue', label: 'Verification Queue', icon: 'inbox', group: 'FHSIS Reports' },
        { id: 'fhsis-history', label: 'Report History', icon: 'clock', group: 'FHSIS Reports' },
    ];

    return (
        <div className="flex h-screen w-full bg-[var(--bg)] overflow-hidden">
            <Sidebar
                activePage={activeTab}
                userName={userData.name}
                userInitials={userData.initials}
                userRole="Registered Midwife"
                navItems={midwifeNavItems}
                onNavigate={(id) => setActiveTab(id)}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="app-shell-main flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">
                <Topbar
                    title={activeTab === 'dashboard' ? 'Midwife Dashboard'
                        : activeTab === 'analytics' ? 'Analytics'
                        : activeTab === 'records' ? 'Patient Records'
                        : activeTab === 'consultation' ? 'Initial Consultation'
                        : activeTab === 'fhsis-queue' ? 'FHSIS Verification Queue'
                        : activeTab === 'fhsis-history' ? 'FHSIS Report History'
                        : safeTrim(activeTab.replace(/([A-Z])/g, ' $1'))}
                    sectionLabel="Maternal & Community Care"
                    userName={userData.name}
                    userInitials={userData.initials}
                    userRole="Registered Midwife"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                    isNavigationOpen={isMobileMenuOpen}
                />

                {/* Content */}
                <div className="app-content-canvas flex-1 overflow-x-hidden overflow-y-auto bg-[var(--bg)]">
                    <div className="w-full min-h-full pwa-page-pad">
                        <div className="w-full">
                            {activeTab === 'dashboard' && (
                                <Dashboard
                                    patients={patients}
                                    censusRecords={records}
                                    rhuPersonnel={userData.name}
                                    onNavigateToRecords={() => setActiveTab('records')}
                                    isLoading={isLoading}
                                    hasLoadError={hasLoadError}
                                />
                            )}
                            {activeTab === 'analytics' && (
                                <DoctorAnalyticsPage isOnline={isOnline} role="midwives" />
                            )}
                            {activeTab === 'records' && (
                                <PatientRecords
                                    patients={patients}
                                    records={records}
                                    isLoading={isLoading}
                                    hasLoadError={hasLoadError}
                                    rhuPersonnel={userData.name}
                                    onPatientClick={(p) => setSelectedPatient(p)}  // ← passes modal opener
                                    onStartIntake={handleStartIntake}
                                />
                            )}
                            {activeTab === 'consultation' && (
                                <Suspense fallback={<LazyPanelFallback />}>
                                    <ConsultationComponent />
                                </Suspense>
                            )}
                            {(activeTab === 'fhsis-queue' || activeTab === 'fhsis-history') && !roleReady && (
                                <div className="pwa-page-pad"><LoadingState label="Verifying access" /></div>
                            )}
                            {activeTab === 'fhsis-queue' && roleReady && <FhsisMidwifeWorkspace mode="queue" />}
                            {activeTab === 'fhsis-history' && roleReady && <FhsisMidwifeWorkspace mode="history" />}
                        </div>
                    </div>
                </div>
            </main>

            {/* ── Shared Patient Modal — rendered at app level ── */}
            {selectedPatient && (
                <PatientModal
                    patient={selectedPatient}
                    rhuPersonnel={userData.name}
                    onClose={() => setSelectedPatient(null)}
                    onConsentSaved={async () => {
                        setSelectedPatient(null);
                        await refreshData();
                    }}
                />
            )}
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        <React.StrictMode>
            <MidwifeApp />
        </React.StrictMode>
    );
}
