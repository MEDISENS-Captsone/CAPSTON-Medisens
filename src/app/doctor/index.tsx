import { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../lib/supabase/client';
import { Sidebar } from '../../components/layout/Sidebar';
import { requireRole } from '../../lib/auth/roles';
import { getInitials } from '../../lib/utils/names';
import { useToast } from '../../components/feedback/Toast';
import { Icon } from '../../components/shared/Icon';
import { Topbar } from '../../components/layout/Topbar';
import { Modal } from '../../components/ui/Modal';
import { SkeletonList } from '../../components/ui/Skeleton';
import type { Patient } from '../../components/patient/PatientDetailModal';
import { PageHeader } from '../../components/layout/PageHeader';
import { AuditLogPage } from '../../features/audit/AuditLogPage';
import { ArchiveReviewPage } from '../../features/admin/ArchiveReviewPage';
import { DoctorAnalyticsPage } from '../../features/doctor/DoctorAnalyticsPage';

const ConsultationPage = lazy(() => import('../consultation'));
const RecordsComponent = lazy(() => import('../patients/records').then(module => ({ default: module.RecordsComponent })));
const TemplatesComponent = lazy(() => import('../patients/templates').then(module => ({ default: module.TemplatesComponent })));
const PatientDetailModal = lazy(() => import('../../components/patient/PatientDetailModal').then(module => ({ default: module.PatientDetailModal })));

const LazyPanelFallback = () => (
    <div className="rounded-xl border border-[var(--border)] bg-white">
        <SkeletonList rows={4} />
    </div>
);

type FilterPeriod = 'today' | 'week' | 'month' | 'year';

const FILTER_OPTIONS: { label: string; value: FilterPeriod }[] = [
    { label: 'Today', value: 'today' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'Year', value: 'year' },
];
const COUNT_ONLY_COLUMN = 'id';

const getDateRange = (period: FilterPeriod): { from: string; to: string } => {
    const now = new Date();
    const toDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if (period === 'today') return { from: toDate, to: toDate };
    if (period === 'week') {
        const from = new Date(now); from.setDate(from.getDate() - 6);
        return { from: from.toLocaleDateString('en-CA'), to: toDate };
    }
    if (period === 'month') {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: from.toLocaleDateString('en-CA'), to: toDate };
    }
    if (period === 'year') {
        const from = new Date(now.getFullYear(), 0, 1);
        return { from: from.toLocaleDateString('en-CA'), to: toDate };
    }
    return { from: toDate, to: toDate };
};

const FilterTabs = ({ value, onChange }: { value: FilterPeriod; onChange: (v: FilterPeriod) => void }) => (
    <div className="clinical-filter-group" role="group" aria-label="Dashboard period filter">
        {FILTER_OPTIONS.map(opt => (
            <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={`clinical-filter-button ${value === opt.value ? 'is-active' : ''}`}
                aria-pressed={value === opt.value}
            >
                {opt.label}
            </button>
        ))}
    </div>
);

const DoctorDashboard = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [userName, setUserName] = useState('Loading...');
    const [userInitials, setUserInitials] = useState('D');

    const [activePage, setActivePage] = useState(() => window.location.hash.replace('#', '') || 'dashboard');

    useEffect(() => {
        window.location.hash = activePage;
    }, [activePage]);

    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [selectedIcid, setSelectedIcid] = useState<string | null>(null);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    const [totalPatients, setTotalPatients] = useState(0);
    const [visitsToday, setVisitsToday] = useState(0);
    const [queue, setQueue] = useState<any[]>([]);
    const [followUps, setFollowUps] = useState<any[]>([]);
    const [morbidityData, setMorbidityData] = useState<any[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);

    const [trendFilter, setTrendFilter] = useState<FilterPeriod>('week');
    const [morbFilter, setMorbFilter] = useState<FilterPeriod>('week');

    // ── Refs so realtime callbacks always see the latest filter values ──────
    const trendFilterRef = useRef<FilterPeriod>('week');
    const morbFilterRef = useRef<FilterPeriod>('week');

    // ── Realtime status for the two panels ──────────────────────────────────
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
    const { showToast, ToastComponent } = useToast();

    // ── Follow-ups modal ────────────────────────────────────────────────────
    const [showFollowUpsModal, setShowFollowUpsModal] = useState(false);
    const [allFollowUps, setAllFollowUps] = useState<any[]>([]);
    const showFollowUpsModalRef = useRef(false); // lets realtime refresh the open modal
    useEffect(() => { showFollowUpsModalRef.current = showFollowUpsModal; }, [showFollowUpsModal]);

    const trendChartRef = useRef<HTMLCanvasElement>(null);
    const morbChartRef = useRef<HTMLCanvasElement>(null);
    const trendChartInst = useRef<any>(null);
    const morbChartInst = useRef<any>(null);

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'home', group: 'Overview' },
        { id: 'analytics', label: 'Analytics', icon: 'chart', group: 'Insights' },
        { id: 'records', label: 'Patient Records', icon: 'users', group: 'Patient Care' },
        { id: 'consultation', label: 'Consultation Room', icon: 'clipboard', group: 'Clinical Workflow' },
        { id: 'archive-review', label: 'Archive Review', icon: 'clipboard', group: 'Records & Governance' },
        { id: 'audit-log', label: 'Audit Log', icon: 'clipboard', group: 'Records & Governance' },
    ];

    const formatTime = (t: string | null) => {
        if (!t) return '';
        const [h, m] = t.split(':');
        let hour = parseInt(h, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;
        return `${hour}:${m} ${ampm}`;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // fetchAllFollowUps — used both by the "View all" button AND realtime
    // ─────────────────────────────────────────────────────────────────────────
    const fetchAllFollowUps = useCallback(async () => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        const { data } = await supabase
            .from('follow_up')
            .select(`followup_id, patient_id, visit_date, patients!inner(firstName, lastName, sex, archive_status)`)
            .neq('follow_up_status', 'done')
            .or('archive_status.eq.active,archive_status.is.null', { foreignTable: 'patients' })
            .gte('visit_date', today)
            .order('visit_date', { ascending: true });
        setAllFollowUps(data || []);
    }, []);

    const loadAllFollowUps = useCallback(async () => {
        await fetchAllFollowUps();
        setShowFollowUpsModal(true);
    }, [fetchAllFollowUps]);

    // ─────────────────────────────────────────────────────────────────────────
    // loadTrendData
    // ─────────────────────────────────────────────────────────────────────────
    const loadTrendData = useCallback(async (period: FilterPeriod) => {
        const { from, to } = getDateRange(period);
        const { data: tData } = await supabase
            .from('consultation')
            .select('initial_consultation!inner(consultation_date)')
            .gte('initial_consultation.consultation_date', from)
            .lte('initial_consultation.consultation_date', to);

        const dates = tData?.map((c: any) => c.initial_consultation?.consultation_date).filter(Boolean) || [];

        if (period === 'today') { setTrendData([{ date: to, count: dates.length }]); return; }

        if (period === 'week') {
            const dayMap: Record<string, number> = {};
            for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                dayMap[d.toLocaleDateString('en-CA')] = 0;
            }
            dates.forEach(date => { if (dayMap[date] !== undefined) dayMap[date]++; });
            setTrendData(Object.keys(dayMap).map(k => ({ date: k, count: dayMap[k] })));
            return;
        }

        if (period === 'month') {
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const dayMap: Record<string, number> = {};
            for (let i = 1; i <= daysInMonth; i++) {
                const d = new Date(now.getFullYear(), now.getMonth(), i);
                dayMap[d.toLocaleDateString('en-CA')] = 0;
            }
            dates.forEach(date => { if (dayMap[date] !== undefined) dayMap[date]++; });
            const weeks: { date: string; count: number }[] = [];
            const entries = Object.entries(dayMap);
            for (let i = 0; i < entries.length; i += 7) {
                const chunk = entries.slice(i, i + 7);
                weeks.push({ date: `Week ${Math.floor(i / 7) + 1}`, count: chunk.reduce((s, [, c]) => s + c, 0) });
            }
            setTrendData(weeks);
            return;
        }

        if (period === 'year') {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const mm: Record<string, number> = {};
            months.forEach(m => { mm[m] = 0; });
            dates.forEach(date => { const m = months[new Date(date).getMonth()]; if (m) mm[m]++; });
            setTrendData(months.map(m => ({ date: m, count: mm[m] })));
        }
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // loadMorbidityData
    // ─────────────────────────────────────────────────────────────────────────
    const loadMorbidityData = useCallback(async (period: FilterPeriod) => {
        const { from, to } = getDateRange(period);
        const { data } = await supabase
            .from('initial_consultation')
            .select('diagnosis')
            .not('diagnosis', 'is', null)
            .gte('consultation_date', from)
            .lte('consultation_date', to);

        const map: Record<string, number> = {};
        data?.forEach(({ diagnosis }) => { if (diagnosis) map[diagnosis] = (map[diagnosis] || 0) + 1; });
        const total = Object.values(map).reduce((s, n) => s + n, 0);
        setMorbidityData(
            Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 7)
                .map(([label, count]) => ({ label, count, percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0 }))
        );
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // loadQueueAndFollowUps — lightweight refresh of just the two live panels
    // Split from loadDashboardData so realtime can call only what changed.
    // ─────────────────────────────────────────────────────────────────────────
    const loadQueueAndFollowUps = useCallback(async () => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

        // Queue: initial_consultations today that don't yet have a linked consultation row
        const { data: completedConsults } = await supabase
            .from('consultation')
            .select('initial_consultation_id')
            .not('initial_consultation_id', 'is', null);
        const completedIds = completedConsults?.map((c: any) => c.initial_consultation_id).filter(Boolean) || [];

        let qQuery = supabase
            .from('initial_consultation')
            .select(`initialconsultation_id, patient_id, consultation_time, patients!inner(firstName, lastName, sex, bloodType, archive_status)`)
            .eq('consultation_date', today)
            .or('archive_status.eq.active,archive_status.is.null', { foreignTable: 'patients' })
            .order('initialconsultation_id', { ascending: true });
        if (completedIds.length > 0) {
            qQuery = qQuery.not('initialconsultation_id', 'in', `(${completedIds.join(',')})`);
        }
        const { data: qData } = await qQuery;
        setQueue(qData || []);

        // Follow-ups preview (5 rows)
        const { data: fData } = await supabase
            .from('follow_up')
            .select(`followup_id, patient_id, visit_date, patients!inner(firstName, lastName, sex, archive_status)`)
            .neq('follow_up_status', 'done')
            .or('archive_status.eq.active,archive_status.is.null', { foreignTable: 'patients' })
            .gte('visit_date', today)
            .order('visit_date', { ascending: true })
            .limit(5);
        setFollowUps(fData || []);

        // If the "all follow-ups" modal is open, refresh it too
        if (showFollowUpsModalRef.current) await fetchAllFollowUps();
    }, [fetchAllFollowUps]);

    // ─────────────────────────────────────────────────────────────────────────
    // loadDashboardData — full reload (stats + queue + follow-ups)
    // ─────────────────────────────────────────────────────────────────────────
    const loadDashboardData = useCallback(async () => {
        try {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

            const { count: pCount } = await supabase
                .from('patients').select(COUNT_ONLY_COLUMN, { count: 'exact', head: true });
            setTotalPatients(pCount || 0);

            const { data: completedToday } = await supabase
                .from('consultation')
                .select('initial_consultation!inner(consultation_date)')
                .eq('initial_consultation.consultation_date', today);
            setVisitsToday(completedToday?.length || 0);

            await loadQueueAndFollowUps();
        } catch (err) {
            console.error('Dashboard Load Error:', err);
        }
    }, [loadQueueAndFollowUps]);

    // ─────────────────────────────────────────────────────────────────────────
    // Initial load + auth check
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const init = async () => {
            const profile = await requireRole('doctor');
            const name = profile.fullName || 'Dr. User';
            setUserName(name);
            setUserInitials(getInitials(name, 'D'));

            await loadDashboardData();
            await loadTrendData(trendFilterRef.current);
            await loadMorbidityData(morbFilterRef.current);
        };

        init();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []); // runs once on mount

    // ─────────────────────────────────────────────────────────────────────────
    // Realtime subscriptions
    //   Separate from the auth/init effect so it can list stable callbacks
    //   as dependencies without re-subscribing on every state change.
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const channel = supabase
            .channel('doctor-dashboard-realtime')

            // ── initial_consultation: new patient checks in → refresh queue + charts
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'initial_consultation' },
                () => {
                    loadQueueAndFollowUps();
                    loadTrendData(trendFilterRef.current);
                    loadMorbidityData(morbFilterRef.current);
                    // bump visits today stat
                    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                    supabase.from('consultation')
                        .select('initial_consultation!inner(consultation_date)')
                        .eq('initial_consultation.consultation_date', today)
                        .then(({ data }) => setVisitsToday(data?.length || 0));
                }
            )

            // ── consultation INSERT/UPDATE: patient was seen → remove from queue, bump visits
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'consultation' },
                () => {
                    loadQueueAndFollowUps();
                    loadTrendData(trendFilterRef.current);
                    // bump visits today
                    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                    supabase.from('consultation')
                        .select('initial_consultation!inner(consultation_date)')
                        .eq('initial_consultation.consultation_date', today)
                        .then(({ data }) => setVisitsToday(data?.length || 0));
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'consultation' },
                () => {
                    loadTrendData(trendFilterRef.current);
                }
            )

            // ── patients INSERT: new patient registered → bump total count
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'patients' },
                () => {
                    supabase.from('patients')
                        .select(COUNT_ONLY_COLUMN, { count: 'exact', head: true })
                        .then(({ count }) => setTotalPatients(count || 0));
                }
            )
            // ── patients UPDATE: name/info changed → refresh queue display names
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'patients' },
                () => {
                    loadQueueAndFollowUps();
                }
            )

            // ── follow_up: any change → refresh follow-ups list only (not charts)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'follow_up' },
                () => {
                    loadQueueAndFollowUps();
                }
            )

            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'lab_result' },
                () => {
                    showToast('A laboratory result was completed. Dashboard data refreshed.', false);
                    loadQueueAndFollowUps();
                }
            )

            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setRealtimeStatus('live');
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
                else setRealtimeStatus('connecting');
            });

        return () => { supabase.removeChannel(channel); };
    }, [loadQueueAndFollowUps, loadTrendData, loadMorbidityData]);
    // ^ stable useCallback refs — won't re-subscribe unless these actually change

    // ── Keep filter refs in sync + reload charts on filter change ───────────
    useEffect(() => {
        trendFilterRef.current = trendFilter;
        loadTrendData(trendFilter);
    }, [trendFilter, loadTrendData]);

    useEffect(() => {
        morbFilterRef.current = morbFilter;
        loadMorbidityData(morbFilter);
    }, [morbFilter, loadMorbidityData]);

    // ── Chart rendering ──────────────────────────────────────────────────────
    useEffect(() => {
        if (activePage !== 'dashboard') return;
        let cancelled = false;

        const renderCharts = async () => {
            const { default: Chart } = await import('chart.js/auto');
            if (cancelled) return;

            if (trendChartRef.current && trendData.length > 0) {
                if (trendChartInst.current) trendChartInst.current.destroy();
                trendChartInst.current = new Chart(trendChartRef.current, {
                    type: 'line',
                    data: {
                        labels: trendData.map(d => d.date),
                        datasets: [{
                            label: 'Visits', data: trendData.map(d => d.count),
                            borderColor: '#5A81FA', backgroundColor: 'rgba(90,129,250,0.12)',
                            borderWidth: 2, fill: true, tension: 0.4,
                            pointBackgroundColor: '#5A81FA', pointRadius: 4, pointHoverRadius: 6,
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { grid: { display: false }, ticks: { color: '#A8B1CE', font: { size: 10 } } },
                            y: { grid: { color: '#EEF1FB' }, ticks: { stepSize: 1, precision: 0, color: '#A8B1CE', font: { size: 10 } }, beginAtZero: true }
                        }
                    }
                });
            }

            if (morbChartRef.current && morbidityData.length > 0) {
                if (morbChartInst.current) morbChartInst.current.destroy();
                morbChartInst.current = new Chart(morbChartRef.current, {
                    type: 'bar',
                    data: {
                        labels: morbidityData.map(m => m.label),
                        datasets: [{ label: 'Cases', data: morbidityData.map(m => m.percentage), backgroundColor: '#D1DDFF', borderRadius: 2, barThickness: 16 }]
                    },
                    options: {
                        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (ctx) => { const item = morbidityData[ctx.dataIndex]; return ` ${item.percentage}%  (${item.count} cases)`; } } }
                        },
                        scales: {
                            x: { grid: { color: '#EEF1FB' }, ticks: { color: '#A8B1CE', font: { size: 10 }, callback: (v) => `${v}%` }, beginAtZero: true, max: 100 },
                            y: { grid: { display: false }, ticks: { color: '#6A6E83', font: { size: 11 } } }
                        }
                    }
                });
            }
        };

        renderCharts();

        return () => {
            cancelled = true;
        };
    }, [trendData, morbidityData, activePage]);

    const handleConsultNavigate = (patientId: string, icid?: string) => {
        setSelectedPatient(null);
        setSelectedPatientId(patientId);
        setSelectedIcid(icid || null);
        setActivePage('consultation');
    };

    return (
        <div className="flex h-screen bg-[var(--bg)] overflow-hidden w-full">
            <ToastComponent />
            <Sidebar
                activePage={activePage}
                userName={userName}
                userInitials={userInitials}
                userRole="General Practitioner"
                navItems={navItems}
                onNavigate={(id) => {
                    if (id !== 'consultation') { setSelectedPatientId(null); setSelectedIcid(null); }
                    setSelectedPatient(null);
                    setActivePage(id);
                }}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isOnline={isOnline}
            />

            <main className="flex-1 overflow-auto md:ml-[240px]">
                <Topbar
                    title={activePage === 'dashboard' ? 'Doctor Dashboard' : activePage === 'analytics' ? 'Doctor Analytics' : activePage === 'records' ? 'Patient Records' : activePage === 'audit-log' ? 'Audit Log' : activePage === 'archive-review' ? 'Archive Review' : 'Consultation Room'}
                    sectionLabel="Clinical Consultation"
                    userName={userName}
                    userInitials={userInitials}
                    userRole="General Practitioner"
                    isOnline={isOnline}
                    onOpenNavigation={() => setIsMobileMenuOpen(true)}
                />

                <div className="w-full flex flex-col gap-5">

                    {activePage === 'dashboard' && (
                        <>
                            <PageHeader
                                title="Clinical Work Queue"
                                subtitle="Review waiting patients, follow-ups, morbidity trends, and visit volume."
                            />
                            <div className="pwa-page-pad flex flex-col pwa-panel-gap">

                                <div className="ops-summary-grid">
                                    {[
                                        ['Waiting Patients', queue.length, 'Ready for consultation'],
                                        ['Follow-ups Due', followUps.length, 'Scheduled returns'],
                                        ['Visits Today', visitsToday, 'Completed encounters'],
                                        ['Total Patients', totalPatients, 'Registry baseline'],
                                    ].map(([label, value, note]) => (
                                        <div key={label} className="ops-summary-card">
                                            <p className="ops-summary-label">{label}</p>
                                            <h2 className="ops-summary-value tabular-nums">{value}</h2>
                                            <p className="ops-summary-note">{note}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Queue + Trends */}
                                <div className="ops-grid">

                                    {/* ── Patient Queue ── */}
                                    <div className="lg:col-span-5 ops-panel flex flex-col h-[380px]">
                                        <div className="ops-panel-header shrink-0">
                                            <h3 className="ops-panel-title">Waiting Patients</h3>
                                            {queue.length > 0 && (
                                                <span className="clinical-count-badge">{queue.length}</span>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {queue.length === 0 ? (
                                                <div className="clinical-table-state">No patients in queue</div>
                                            ) : (
                                                <div>
                                                    {queue.map((q, index) => (
                                                        <div key={q.initialconsultation_id}
                                                            onClick={() => handleConsultNavigate(q.patient_id, q.initialconsultation_id.toString())}
                                                            className="clinical-worklist-row cursor-pointer">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-xs font-semibold text-[var(--text-muted)] w-5 text-center tabular-nums">{index + 1}</span>
                                                                <div className="flex flex-col gap-0.5">
                                                                    <p className="clinical-primary">{q.patients?.lastName}, {q.patients?.firstName}</p>
                                                                    <p className="clinical-secondary">{q.patients?.sex} • {q.patients?.bloodType || '—'}</p>
                                                                </div>
                                                            </div>
                                                            <p className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">{formatTime(q.consultation_time)}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {queue.length > 0 && (
                                            <button type="button" onClick={() => setActivePage('records')} className="clinical-link-action w-full rounded-none border-t border-[var(--border-soft)] py-3 shrink-0 transition-colors">
                                                View all patients
                                            </button>
                                        )}
                                    </div>

                                    {/* Visit Trends */}
                                    <div className="lg:col-span-7 ops-panel p-4 flex flex-col h-[380px]">
                                        <div className="flex justify-between items-center gap-3 flex-wrap mb-4 shrink-0">
                                            <h3 className="ops-panel-title">Visit Trends</h3>
                                            <FilterTabs value={trendFilter} onChange={setTrendFilter} />
                                        </div>
                                        <div className="flex-1 relative w-full h-full">
                                            <canvas ref={trendChartRef} />
                                        </div>
                                    </div>
                                </div>

                                {/* Morbidity + Follow-ups */}
                                <div className="ops-grid">

                                    {/* Morbidity */}
                                    <div className="lg:col-span-7 ops-panel p-4 flex flex-col h-[380px]">
                                        <div className="flex justify-between items-center gap-3 flex-wrap mb-2 shrink-0">
                                            <h3 className="ops-panel-title">Top Morbidities</h3>
                                            <FilterTabs value={morbFilter} onChange={setMorbFilter} />
                                        </div>
                                        <div className="flex-1 relative w-full h-full">
                                            <canvas ref={morbChartRef} />
                                        </div>
                                    </div>

                                    {/* ── Upcoming Follow-ups ── */}
                                    <div className="lg:col-span-5 ops-panel flex flex-col h-[380px]">
                                        <div className="ops-panel-header shrink-0">
                                            <h3 className="ops-panel-title">Follow-ups Due</h3>
                                            {followUps.length > 0 && (
                                                <span className="clinical-count-badge">{followUps.length}</span>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {followUps.length === 0 ? (
                                                <div className="clinical-table-state">No follow-ups scheduled</div>
                                            ) : (
                                                <div>
                                                    {followUps.map(f => {
                                                        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                                                        const isToday = f.visit_date === today;
                                                        return (
                                                            <div key={f.followup_id}
                                                                onClick={() => handleConsultNavigate(f.patient_id)}
                                                                className="clinical-worklist-row cursor-pointer">
                                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                                    <p className="clinical-primary truncate">{f.patients?.lastName}, {f.patients?.firstName}</p>
                                                                    <p className="clinical-secondary">Return Visit</p>
                                                                </div>
                                                                <span className={`clinical-status-badge shrink-0 ${isToday ? 'warning' : ''}`}>
                                                                    {isToday ? 'Due today' : new Date(f.visit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        {followUps.length > 0 && (
                                            <button type="button" onClick={loadAllFollowUps} className="clinical-link-action w-full rounded-none border-t border-[var(--border-soft)] py-3 shrink-0 transition-colors">
                                                View all follow-ups
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activePage === 'records' && (
                        <div className="px-4 md:px-5 xl:px-6">
                            <Suspense fallback={<LazyPanelFallback />}>
                                <RecordsComponent onPatientClick={(p) => setSelectedPatient(p as Patient)} />
                            </Suspense>
                        </div>
                    )}
                    {activePage === 'analytics' && (
                        <DoctorAnalyticsPage isOnline={isOnline} role="doctor" />
                    )}
                    {activePage === 'new-record' && (
                        <Suspense fallback={<LazyPanelFallback />}>
                            <TemplatesComponent />
                        </Suspense>
                    )}
                    {activePage === 'consultation' && (
                        <Suspense fallback={<LazyPanelFallback />}>
                            <ConsultationPage
                                doctorName={userName}
                                doctorInitials={userInitials}
                                patientIdProp={selectedPatientId}
                                icidProp={selectedIcid}
                                onBack={() => setActivePage('dashboard')}
                            />
                        </Suspense>
                    )}
                    {activePage === 'audit-log' && (
                        <>
                            <PageHeader
                                title="Audit Log"
                                subtitle="Review read-only system activity for clinical governance."
                            />
                            <AuditLogPage />
                        </>
                    )}
                    {activePage === 'archive-review' && (
                        <>
                            <PageHeader
                                title="Patient Archive Review"
                                subtitle="Read-only review of inactive patient records. Archive and restore actions are not available in this workspace."
                            />
                            <ArchiveReviewPage isOnline={isOnline} readOnly={true} />
                        </>
                    )}
                </div>
            </main>

            {/* ─── All Follow-ups Modal ─── */}
            {showFollowUpsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowFollowUpsModal(false); }}>
                    <Modal labelledBy="followups-dialog-title" onClose={() => setShowFollowUpsModal(false)} className="max-h-[80vh] max-w-lg flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-[var(--border)] shrink-0">
                            <div>
                                <h2 id="followups-dialog-title" className="text-lg font-semibold text-[var(--text)]">All Upcoming Follow-ups</h2>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">{allFollowUps.length} pending • sorted by date</p>
                            </div>
                            <button type="button" onClick={() => setShowFollowUpsModal(false)}
                                aria-label="Close follow-up dialog" className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)] transition-colors"><Icon name="close" className="h-4 w-4" label="Close follow-up dialog" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {allFollowUps.length === 0 ? (
                                <div className="clinical-table-state">No upcoming follow-ups</div>
                            ) : (
                                <div>
                                    {allFollowUps.map((f, idx) => {
                                        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                                        const isToday = f.visit_date === today;
                                        return (
                                            <div key={f.followup_id}
                                                onClick={() => { setShowFollowUpsModal(false); handleConsultNavigate(f.patient_id); }}
                                                className="clinical-worklist-row cursor-pointer">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="text-xs font-semibold text-[var(--text-muted)] w-5 text-center tabular-nums">{idx + 1}</span>
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <p className="clinical-primary truncate">{f.patients?.lastName}, {f.patients?.firstName}</p>
                                                        <p className="clinical-secondary">{f.patients?.sex} • Return Visit</p>
                                                    </div>
                                                </div>
                                                <span className={`clinical-status-badge shrink-0 ${isToday ? 'warning' : ''}`}>
                                                    {isToday ? 'Due today' : new Date(f.visit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-[var(--border)] shrink-0">
                            <button type="button" onClick={() => setShowFollowUpsModal(false)}
                                className="clinical-secondary-action w-full">Close</button>
                        </div>
                    </Modal>
                </div>
            )}
            {selectedPatient && (
                <Suspense fallback={null}>
                    <PatientDetailModal
                        patient={selectedPatient}
                        onClose={() => setSelectedPatient(null)}
                        onPatientUpdate={(updated) => setSelectedPatient(updated)}
                        onConsult={(patient) => handleConsultNavigate(patient.id)}
                    />
                </Suspense>
            )}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<DoctorDashboard />);
