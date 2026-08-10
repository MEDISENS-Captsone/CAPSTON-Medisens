import { useEffect, useState } from 'react';
import { Icon } from '../shared/Icon';
import { fetchGrowthPoints, growthLabel, type GrowthPoint, type GrowthSex } from '../../features/patients/growth';

interface Props { birthday?: string; age?: number | null; sex?: string; patientId: string; className?: string; }
const sexFor = (sex?: string): GrowthSex | null => sex?.toLowerCase() === 'female' ? 'female' : sex?.toLowerCase() === 'male' ? 'male' : null;
const pointPath = (points: GrowthPoint[], key: 'heightZ' | 'bmiZ') => {
    const valid = points.filter(point => point[key] != null);
    return valid.map((point, index) => {
        const score = point[key]!;
        const x = valid.length === 1 ? 50 : (index / (valid.length - 1)) * 100;
        const y = Math.max(0, Math.min(100, ((3.5 - score) / 7) * 100));
        return `${index ? 'L' : 'M'} ${x} ${y}`;
    }).join(' ');
};

export function PediatricGrowth({ patientId, birthday, age, sex, className }: Props) {
    const eligible = (age ?? -1) >= 5 && (age ?? -1) <= 19;
    const resolvedSex = sexFor(sex);
    const [points, setPoints] = useState<GrowthPoint[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(false);
    useEffect(() => { if (!eligible || !birthday || !resolvedSex) return; setLoading(true); setError(false); fetchGrowthPoints(patientId, birthday, resolvedSex).then(setPoints).catch(() => setError(true)).finally(() => setLoading(false)); }, [birthday, eligible, patientId, resolvedSex]);
    if (!eligible) return null;
    const assessable = points.filter(point => point.heightZ != null || point.bmiZ != null);
    const latest = assessable[assessable.length - 1];
    return <div className={`col-span-2 rounded-lg border border-[var(--brand-accent-surface)] bg-[var(--brand-soft-surface)]/40 p-3 sm:col-span-4 ${className ?? ''}`} aria-live="polite">
        <div className="flex gap-2"><Icon name="chart" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-active)]" /><div><div className="text-xs font-semibold text-[var(--text)]">Pediatric growth (WHO 2007)</div><p className="text-xs text-[var(--text-secondary)]">Sex- and age-specific height-for-age and BMI-for-age z-scores. No adult BMI categories or weight-for-age are used.</p></div></div>
        {!birthday || !resolvedSex ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Birth date and sex are required for a WHO 2007 growth assessment.</p> : loading ? <div className="mt-3 h-20 animate-pulse rounded bg-white/70" /> : error ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Growth measurements could not be loaded.</p> : assessable.length < 2 ? <p className="mt-3 text-sm text-[var(--text-secondary)]">At least two dated eligible measurements are needed to display a growth trend.</p> : <>
            <div className="mt-3 grid gap-3 md:grid-cols-2"><Trend title="Height-for-age z-score" path={pointPath(assessable, 'heightZ')} /><Trend title="BMI-for-age z-score" path={pointPath(assessable, 'bmiZ')} /></div>
            {latest && <p className="mt-3 text-xs text-[var(--text-secondary)]">Latest ({new Date(latest.date).toLocaleDateString('en-PH')}): {latest.heightZ != null && `Height ${latest.heightZ.toFixed(1)} SD — ${growthLabel('height', latest.heightZ)}. `}{latest.bmiZ != null && `BMI ${latest.bmiZ.toFixed(1)} SD — ${growthLabel('bmi', latest.bmiZ)}.`}</p>}
        </>}
    </div>;
}

function Trend({ title, path }: { title: string; path: string }) { return <div className="rounded-md border border-[var(--border-soft)] bg-white p-2"><p className="text-xs font-medium text-[var(--text-secondary)]">{title}</p><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-1 h-24 w-full" aria-label={title}><path d="M0 50H100 M0 21.5H100 M0 78.5H100" stroke="var(--border-soft)" strokeDasharray="2 2" fill="none" /><path d={path} stroke="var(--brand-active)" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" /></svg><p className="text-[10px] text-[var(--text-muted)]">Reference lines: +2, 0, −2 SD</p></div>; }
