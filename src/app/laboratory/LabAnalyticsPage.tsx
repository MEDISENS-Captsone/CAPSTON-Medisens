// Phase L6: dedicated Laboratory Analytics module. Builds on the Chart.js logic
// relocated from the Dashboard in Phase L3, with the following frontend-only
// corrections (no backend/query/schema changes):
//   - Test Distribution is now scoped to the same selected date range as Request
//     Volume. Previously it silently counted every loaded request regardless of the
//     period control, which visually implied both charts shared one timeframe when
//     only Request Volume actually did.
//   - Request Volume counts laboratory REQUESTS; Test Distribution counts INDIVIDUAL
//     TESTS ordered (a request with 3 flagged tests contributes 3, not 1) — this was
//     already true of the underlying data (see L1 audit) but was not stated anywhere
//     in the UI, and the donut's center label previously misread "Requests" while
//     actually showing a test count. Both are now labeled explicitly everywhere.
//   - Trend wording/color no longer implies fewer requests are "bad" (red) or more
//     are "good" (green) — a lab request volume dropping is not an adverse signal.
//   - Bar chart Y-axis no longer forces a fixed step size, so low-volume periods
//     don't render a near-empty, oddly-spaced axis.
//   - Zero-data periods now show an explicit empty state per chart instead of a
//     flat/broken-looking canvas.
//
// Known limitation carried over from L1 (not addressed here — would require a new
// backend aggregate, out of L6 scope): both charts operate only on the client-side
// LAB_REQUEST_QUEUE_LIMIT = 200 most recent requests loaded by the root component,
// not a true all-time aggregate. Accuracy degrades once the system holds more than
// 200 total lab requests.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/ui';
import { type LabRequest, getTestNames } from './types';

const DONUT_COLORS = ['#1D4E68', '#286781', '#3B8BA3', '#5BACC5', '#A8B5BC'];

export function LabAnalyticsPage({ requests }: { requests: LabRequest[] }) {
    const [activityPeriod, setActivityPeriod] = useState<7 | 14 | 30>(7);
    const barChartRef = useRef<HTMLCanvasElement>(null);
    const donutChartRef = useRef<HTMLCanvasElement>(null);
    const barChartInstance = useRef<any>(null);
    const donutChartInstance = useRef<any>(null);

    const periodLabel = `Last ${activityPeriod} Days`;

    // Requests whose request_date falls within the selected period. Shared by both
    // charts so "Last N Days" means the same thing for the request count and the
    // test count.
    const periodRequests = useMemo(() => {
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - (activityPeriod - 1));
        from.setHours(0, 0, 0, 0);
        return requests.filter(r => {
            if (!r.request_date) return false;
            const d = new Date(r.request_date);
            return d >= from && d <= now;
        });
    }, [requests, activityPeriod]);

    // Bar chart: requests per day for the selected period (counts REQUESTS)
    const barData = useMemo(() => {
        const now = new Date();
        const days: { label: string; count: number }[] = [];
        for (let i = activityPeriod - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
            const count = requests.filter(r => r.request_date?.slice(0, 10) === key).length;
            days.push({ label, count });
        }
        return days;
    }, [requests, activityPeriod]);

    const prevPeriodCount = useMemo(() => {
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - activityPeriod * 2);
        const to = new Date(now);
        to.setDate(to.getDate() - activityPeriod);
        return requests.filter(r => {
            if (!r.request_date) return false;
            const d = new Date(r.request_date);
            return d >= from && d < to;
        }).length;
    }, [requests, activityPeriod]);

    const currentPeriodCount = barData.reduce((sum, d) => sum + d.count, 0);
    const trendPct = prevPeriodCount > 0
        ? Math.round(((currentPeriodCount - prevPeriodCount) / prevPeriodCount) * 100)
        : 0;
    const trendDirection: 'more' | 'fewer' | 'same' = trendPct > 0 ? 'more' : trendPct < 0 ? 'fewer' : 'same';

    // Donut chart: distribution of INDIVIDUAL TESTS ordered within the same period
    // (not request rows — one request with 3 flagged tests contributes 3 here).
    const testDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        periodRequests.forEach(r => {
            getTestNames(r).forEach(name => {
                counts[name] = (counts[name] || 0) + 1;
            });
        });
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((s, e) => s + e[1], 0);
        // Top 4 individually, everything else folded into one "Remaining Categories"
        // slice. This bucket is a chart-only grouping and is distinct from the
        // `others` database field — it can include legitimately flagged tests
        // (e.g. Dengue RDT) that simply rank 5th or lower, not only "Others" entries.
        const top = entries.slice(0, 4);
        const rest = entries.slice(4);
        const restCount = rest.reduce((s, e) => s + e[1], 0);
        const result = top.map(([name, count]) => ({
            name,
            count,
            pct: total > 0 ? Math.round((count / total) * 100) : 0,
        }));
        if (restCount > 0) {
            result.push({
                name: 'Remaining Categories',
                count: restCount,
                pct: total > 0 ? Math.round((restCount / total) * 100) : 0,
            });
        }
        return { items: result, total };
    }, [periodRequests]);

    const hasVolumeData = currentPeriodCount > 0;
    const hasDistributionData = testDistribution.total > 0;

    // Render Chart.js charts
    useEffect(() => {
        let barDestroyed = false;
        let donutDestroyed = false;

        const renderCharts = async () => {
            const ChartModule = await import('chart.js/auto');
            const Chart = ChartModule.default;

            if (barChartRef.current && !barDestroyed && hasVolumeData) {
                if (barChartInstance.current) barChartInstance.current.destroy();
                const ctx = barChartRef.current.getContext('2d');
                if (ctx) {
                    barChartInstance.current = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: barData.map(d => d.label),
                            datasets: [{
                                data: barData.map(d => d.count),
                                backgroundColor: '#1D4E68',
                                borderRadius: 4,
                                maxBarThickness: 32,
                            }],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: '#102E40',
                                    titleFont: { family: 'Inter, sans-serif', size: 12 },
                                    bodyFont: { family: 'Inter, sans-serif', size: 12 },
                                    cornerRadius: 6,
                                    padding: 8,
                                    callbacks: {
                                        label: (item: any) => `${item.formattedValue} request${item.raw === 1 ? '' : 's'}`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { display: false },
                                    ticks: {
                                        // Cap ticks so 30-day periods don't render one label
                                        // per day (illegible); shorter periods are already
                                        // under this cap, so autoSkip has nothing to skip.
                                        autoSkip: true,
                                        maxTicksLimit: 10,
                                        maxRotation: 0,
                                        font: { family: 'Inter, sans-serif', size: 11 },
                                        color: '#687781',
                                    },
                                },
                                y: {
                                    beginAtZero: true,
                                    // No fixed stepSize: low-volume periods (max count 1-2)
                                    // would otherwise show a near-blank axis with one tick
                                    // at 5. Integer-only ticks stay readable at any scale.
                                    ticks: {
                                        precision: 0,
                                        font: { family: 'Inter, sans-serif', size: 11 },
                                        color: '#687781',
                                    },
                                    grid: { color: '#E8ECEE' },
                                },
                            },
                        },
                    });
                }
            }

            if (donutChartRef.current && !donutDestroyed && hasDistributionData) {
                if (donutChartInstance.current) donutChartInstance.current.destroy();
                const ctx = donutChartRef.current.getContext('2d');
                if (ctx) {
                    donutChartInstance.current = new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: testDistribution.items.map(i => i.name),
                            datasets: [{
                                data: testDistribution.items.map(i => i.count),
                                backgroundColor: DONUT_COLORS.slice(0, testDistribution.items.length),
                                borderWidth: 0,
                            }],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '62%',
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: '#102E40',
                                    titleFont: { family: 'Inter, sans-serif', size: 12 },
                                    bodyFont: { family: 'Inter, sans-serif', size: 12 },
                                    cornerRadius: 6,
                                    padding: 8,
                                    callbacks: {
                                        label: (item: any) => `${item.label}: ${item.formattedValue} test${item.raw === 1 ? '' : 's'}`,
                                    },
                                },
                            },
                        },
                    });
                }
            }
        };

        renderCharts();

        return () => {
            barDestroyed = true;
            donutDestroyed = true;
            if (barChartInstance.current) barChartInstance.current.destroy();
            if (donutChartInstance.current) donutChartInstance.current.destroy();
        };
    }, [barData, testDistribution, hasVolumeData, hasDistributionData]);

    return (
        <div className="role-workspace-canvas w-full">
            <PageHeader
                title="Analytics"
                subtitle="Review laboratory request and testing activity over time."
            />
            <div className="pwa-page-pad pt-3 pb-6">
                <div className="lab-activity-section">
                    <div className="lab-activity-header">
                        <div>
                            <h2>Activity Overview</h2>
                            <p>Overview of laboratory requests and individual tests ordered.</p>
                        </div>
                        <div className="lab-activity-period">
                            <label htmlFor="lab-analytics-period" className="sr-only">Select date range</label>
                            <select
                                id="lab-analytics-period"
                                value={activityPeriod}
                                onChange={e => setActivityPeriod(Number(e.target.value) as 7 | 14 | 30)}
                                aria-label="Select date range"
                            >
                                <option value={7}>Last 7 Days</option>
                                <option value={14}>Last 14 Days</option>
                                <option value={30}>Last 30 Days</option>
                            </select>
                        </div>
                    </div>

                    <div className="lab-activity-grid">
                        {/* Bar chart: Request Volume — counts REQUESTS */}
                        <div className="lab-activity-card">
                            <div>
                                <h3>Request Volume</h3>
                                <p className="lab-chart-subtitle">
                                    Number of laboratory requests per day &middot; {periodLabel} &middot; counts requests, not individual tests
                                </p>
                                {hasVolumeData ? (
                                    <div className="lab-chart-container">
                                        <canvas ref={barChartRef} role="img" aria-label={`Bar chart of laboratory requests per day, ${periodLabel}`} />
                                    </div>
                                ) : (
                                    <EmptyState
                                        className="lab-analytics-empty"
                                        title="No requests in this period"
                                        description={`No laboratory requests were recorded during the ${periodLabel.toLowerCase()}.`}
                                    />
                                )}
                            </div>
                            {hasVolumeData && prevPeriodCount > 0 && (
                                <div className="lab-chart-trend">
                                    {trendDirection === 'same'
                                        ? <>No change from the previous {activityPeriod} days</>
                                        : <>{Math.abs(trendPct)}% {trendDirection} requests than the previous {activityPeriod} days</>}
                                </div>
                            )}
                        </div>

                        {/* Donut chart: Test Distribution — counts INDIVIDUAL TESTS */}
                        <div className="lab-activity-card">
                            <div>
                                <h3>Test Distribution</h3>
                                <p className="lab-chart-subtitle">
                                    Share of individual tests ordered &middot; {periodLabel} &middot; a request with multiple tests counts once per test
                                </p>
                                {hasDistributionData ? (
                                    <div className="lab-donut-layout">
                                        <div className="lab-donut-canvas-wrap">
                                            <canvas ref={donutChartRef} role="img" aria-label={`Donut chart of individual tests ordered by category, ${periodLabel}`} />
                                            <div className="lab-donut-center">
                                                <span className="lab-donut-center-label">Total</span>
                                                <span className="lab-donut-center-value">{testDistribution.total}</span>
                                                <span className="lab-donut-center-sub">Tests Ordered</span>
                                            </div>
                                        </div>
                                        <ul className="lab-donut-legend">
                                            {testDistribution.items.map((item, i) => (
                                                <li key={item.name}>
                                                    <span
                                                        className="lab-donut-legend-dot"
                                                        style={{ background: DONUT_COLORS[i] || DONUT_COLORS[DONUT_COLORS.length - 1] }}
                                                    />
                                                    <span className="lab-donut-legend-name">{item.name}</span>
                                                    <span className="lab-donut-legend-count">{item.count} test{item.count !== 1 ? 's' : ''}</span>
                                                    <span className="lab-donut-legend-pct">{item.pct}%</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <EmptyState
                                        className="lab-analytics-empty"
                                        title="No tests recorded in this period"
                                        description={`No laboratory tests were ordered during the ${periodLabel.toLowerCase()}.`}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
