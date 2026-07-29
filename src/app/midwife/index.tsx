import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { Icon } from '../../components/shared/Icon';
import { Topbar } from '../../components/layout/Topbar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { safeTrim } from '../../lib/utils/strings';
import { PatientTransactionHistory } from '../../components/patient/PatientTransactionHistory';
import { PatientChartIdentityHeader, PatientHistoryPanel } from '../../components/patient/PatientChart';

import Dashboard from '../../features/midwife/dashboard';
import PatientRecords from '../../features/midwife/patientRecords';
import CensusEntry from '../../features/midwife/censusEntry';
import PatientConsent from '../patients/patient-consent';
import { useMidwifeData } from '../../features/midwife/useMidwifeData';
import { DoctorAnalyticsPage } from '../../features/doctor/DoctorAnalyticsPage';

const ReportGenerator = lazy(() => import('../../features/midwife/reportGenerator'));

const LazyPanelFallback = () => (
    <div className="rounded-xl border border-slate-200 bg-white">
        <SkeletonList rows={4} />
    </div>
);

// ─── Detail Item ──────────────────────────────────────────────────────────────
function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
    const isEmpty = value === null || value === undefined || value === '';
    return (
        <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`text-sm font-semibold ${isEmpty ? 'text-slate-400 italic' : 'text-slate-800'}`}>
                {isEmpty ? 'Not provided' : value}
            </div>
        </div>
    );
}

const sectionCls = "bg-white border border-slate-200 rounded-lg p-4 md:p-5 mb-4 shadow-sm";
const headerCls  = "flex items-center gap-2 text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-3 mb-4";

// ─── Patient Details Panel ────────────────────────────────────────────────────
function PatientDetailsPanel({
    patient,
    consentSigned,
    onProceedToConsent,
    onViewHistory,
}: {
    patient: any;
    consentSigned: boolean;
    onProceedToConsent: () => void;
    onViewHistory: () => void;
}) {
    const displayCategory = () => {
        if (patient.category === 'Other/s') return `Others (${patient.categoryOthers || 'Unspecified'})`;
        return patient.category || 'N/A';
    };

    return (
        <div className="">
            {/* Profile banner */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-md bg-slate-700 text-white flex items-center justify-center font-semibold text-lg shadow-sm shrink-0 uppercase">
                    {patient.firstName?.[0]}{patient.lastName?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-lg leading-tight truncate">
                        {patient.firstName} {patient.middleName} {patient.lastName} {patient.suffix}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        <span className="text-xs text-slate-500 font-medium inline-flex items-center gap-1"><Icon name="droplet" className="h-3.5 w-3.5" /> <span className="font-bold text-slate-700">{patient.bloodType || '—'}</span></span>
                        <span className="text-xs text-slate-500 font-medium inline-flex items-center gap-1"><Icon name="user" className="h-3.5 w-3.5" /> <span className="font-bold text-slate-700">{patient.sex || '—'}</span></span>
                        <span className="text-xs text-slate-500 font-medium inline-flex items-center gap-1"><Icon name="calendar" className="h-3.5 w-3.5" /> <span className="font-bold text-slate-700">{patient.age ?? '—'}</span> yrs</span>
                        <span className="text-xs text-slate-500 font-medium inline-flex items-center gap-1"><Icon name="map-pin" className="h-3.5 w-3.5" /> <span className="font-bold text-slate-700">{patient.address || '—'}</span></span>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onViewHistory}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                    >
                        <Icon name="clock" className="mr-1 inline h-3.5 w-3.5" /> History
                    </button>
                    {consentSigned ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[0.65rem] font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5" /> Consent Signed</span>
                    ) : (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[0.65rem] font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Icon name="alert-triangle" className="h-3.5 w-3.5" /> Pending Consent</span>
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

            {!consentSigned && (
                <button
                    type="button"
                    onClick={onProceedToConsent}
                    className="w-full bg-slate-700 text-white font-extrabold text-sm uppercase tracking-wider py-4 rounded-xl shadow-sm hover:bg-slate-800 transition-all  flex items-center justify-center gap-3 mt-2"
                >
                    <Icon name="clipboard" className="h-5 w-5" /> Proceed to Patient Consent →
                </button>
            )}
        </div>
    );
}

// ─── Patient Modal ────────────────────────────────────────────────────────────
function PatientModal({
    patient,
    rhuPersonnel,
    onClose,
    onConsentSaved,
}: {
    patient: any;
    rhuPersonnel: string;
    onClose: () => void;
    onConsentSaved: () => void;
}) {
    const [step, setStep] = useState<'details' | 'consent' | 'history'>('details');
    const [consentSigned, setConsentSigned] = useState(
        Array.isArray(patient.patient_consent)
            ? patient.patient_consent.length > 0
            : !!patient.consent_signed
    );

    const handleConsentSaved = () => {
        setConsentSigned(true);
        setStep('details');
        onConsentSaved();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ">
            <div className="bg-[var(--bg)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-sm flex flex-col max-h-[92vh] sm:max-h-[88vh]">

                {/* Modal Header */}
                <div className="px-5 py-4 border-b border-slate-200 bg-white rounded-t-2xl flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        {step !== 'details' && (
                            <button
                                type="button"
                                onClick={() => setStep('details')}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors"
                            >
                                ←
                            </button>
                        )}
                        {/* Step pills */}
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                            <button
                                type="button"
                                onClick={() => setStep('details')}
                                className={`px-2.5 py-1 rounded-md transition-colors ${step === 'details' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            >
                                1 · Details
                            </button>
                            <span className="text-slate-300">›</span>
                            <span className={`px-2.5 py-1 rounded-md ${step === 'consent' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                2 · Consent
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold transition-colors"
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
                            onProceedToConsent={() => setStep('consent')}
                            onViewHistory={() => setStep('history')}
                        />
                    ) : step === 'consent' ? (
                        <div className="">
                            <PatientConsent
                                patientId={patient.id}
                                patientName={`${patient.firstName} ${patient.lastName}`}
                                rhuPersonnel={rhuPersonnel}
                                onConsentSaved={handleConsentSaved}
                            />
                        </div>
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
    const [activeTab, setActiveTab] = useState(() => window.location.hash.replace('#', '') || 'dashboard');

    useEffect(() => {
        window.location.hash = activeTab;
    }, [activeTab]);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [userData, setUserData] = useState({ name: 'Loading...', initials: 'U' });

    // ── Shared modal state — lives here so Dashboard + PatientRecords both use it
    const [selectedPatient, setSelectedPatient] = useState<any>(null);

    const { patients, records, isLoading, refreshData } = useMidwifeData();

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

    const midwifeNavItems = [
        { id: 'dashboard', label: 'Home',           icon: 'home', group: 'Overview' },
        { id: 'analytics', label: 'Analytics',      icon: 'chart', group: 'Insights' },
        { id: 'records',   label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'census',    label: 'Census Entry',    icon: 'clipboard', group: 'Maternal & Community Care' },
        { id: 'reports',   label: 'OCR Reports',     icon: 'chart', group: 'Records & Governance' },
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

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-[240px] w-full">
                <Topbar
                    title={activeTab === 'dashboard' ? 'Midwife Dashboard'
                        : activeTab === 'analytics' ? 'Analytics'
                        : activeTab === 'records' ? 'Patient Records'
                        : activeTab === 'census' ? 'Census Entry'
                        : activeTab === 'reports' ? 'OCR Generation'
                        : safeTrim(activeTab.replace(/([A-Z])/g, ' $1'))}
                    sectionLabel="Maternal & Community Care"
                    userName={userData.name}
                    userInitials={userData.initials}
                    userRole="Registered Midwife"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                />

                {/* Content */}
                <div className="flex-1 overflow-x-hidden overflow-y-auto bg-[var(--bg)]">
                    <div className="w-full min-h-full pwa-page-pad">
                        <div className="w-full">
                            {activeTab === 'dashboard' && (
                                <Dashboard
                                    patients={patients}
                                    censusRecords={records}
                                    rhuPersonnel={userData.name}
                                    onNavigateToRecords={() => setActiveTab('records')}
                                    onPatientClick={(p) => setSelectedPatient(p)}  // ← passes modal opener
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
                                    rhuPersonnel={userData.name}
                                    onPatientClick={(p) => setSelectedPatient(p)}  // ← passes modal opener
                                />
                            )}
                            {activeTab === 'census' && (
                                <CensusEntry
                                    patients={patients}
                                    records={records}
                                    onSaveSuccess={async () => { await refreshData(); }}
                                />
                            )}
                            {activeTab === 'reports' && (
                                <Suspense fallback={<LazyPanelFallback />}>
                                    <ReportGenerator records={records} isLoading={isLoading} />
                                </Suspense>
                            )}
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
