import { supabase } from '../../lib/supabase/client';
import { getWho2007Lms } from './who2007';

export type GrowthSex = 'female' | 'male';
export type GrowthIndicator = 'bmi' | 'height';
export interface LmsParameters { l: number; m: number; s: number; }
export interface GrowthPoint { date: string; ageMonths: number; heightZ: number | null; bmiZ: number | null; height: number | null; bmi: number | null; }

const asNumber = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; };

function calendarDate(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function ageMonths(birthday: string, date: string) {
    const birth = calendarDate(birthday);
    const measured = calendarDate(date);
    if (!birth || !measured || measured < birth) return null;
    return (measured.getFullYear() - birth.getFullYear()) * 12 + measured.getMonth() - birth.getMonth() - (measured.getDate() < birth.getDate() ? 1 : 0);
}

function zScore(value: number | null, sex: GrowthSex, indicator: GrowthIndicator, months: number): number | null {
    if (value == null || months < 61 || months > 228) return null;
    const lms = getWho2007Lms(sex, indicator, months);
    if (!lms) return null;
    return lms.l === 0 ? Math.log(value / lms.m) / lms.s : (Math.pow(value / lms.m, lms.l) - 1) / (lms.l * lms.s);
}

export function growthLabel(indicator: GrowthIndicator, score: number | null) {
    if (score == null) return 'Not assessable';
    if (indicator === 'height') return score < -3 ? 'Severely stunted' : score < -2 ? 'Stunted' : 'Within reference range';
    return score < -3 ? 'Severe thinness' : score < -2 ? 'Thinness' : score > 2 ? 'Obesity' : score > 1 ? 'Overweight' : 'Within reference range';
}

export async function fetchGrowthPoints(patientId: string, birthday: string, sex: GrowthSex): Promise<GrowthPoint[]> {
    const [vitalsResult, intakeResult, followUpsResult] = await Promise.all([
        supabase.from('vital_sign').select('initial_consultation_id, weight, height, bmi').eq('patient_id', patientId),
        supabase.from('initial_consultation').select('initialconsultation_id, consultation_date').eq('patient_id', patientId),
        supabase.from('follow_up').select('visit_date, weight, height, bmi, follow_up_status').eq('patient_id', patientId).eq('follow_up_status', 'done'),
    ]);
    if (vitalsResult.error) throw vitalsResult.error;
    if (intakeResult.error) throw intakeResult.error;
    if (followUpsResult.error) throw followUpsResult.error;
    const intakeDates = new Map((intakeResult.data || []).map(row => [String(row.initialconsultation_id), row.consultation_date]));
    const source = [
        ...(vitalsResult.data || []).map(row => ({ date: intakeDates.get(String(row.initial_consultation_id)), weight: row.weight, height: row.height, bmi: row.bmi })),
        ...(followUpsResult.data || []).map(row => ({ date: row.visit_date, weight: row.weight, height: row.height, bmi: row.bmi })),
    ];
    return source.flatMap(row => {
        if (!row.date) return [];
        const months = ageMonths(birthday, row.date);
        if (months == null || months < 61 || months > 228) return [];
        const height = asNumber(row.height);
        const bmi = asNumber(row.bmi) ?? (height && asNumber(row.weight) ? asNumber(row.weight)! / Math.pow(height / 100, 2) : null);
        if (height == null && bmi == null) return [];
        return [{ date: row.date, ageMonths: months, height, bmi, heightZ: zScore(height, sex, 'height', months), bmiZ: zScore(bmi, sex, 'bmi', months) }];
    }).sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
}
