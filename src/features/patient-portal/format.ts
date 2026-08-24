// Patient Account Phase 6 — presentation-only helpers. No filtering,
// re-interpretation, or clinical inference happens here (§9); this file
// only turns already patient-safe RPC values into the plain-language
// strings the blueprint specifies.

/** "August 23, 2026" -- never ISO, never relative-only (§9). Parses the
 * date/timestamp prefix manually so a `date`-typed 'YYYY-MM-DD' value is
 * never shifted a day by local-timezone `Date` parsing. */
export function formatLongDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function isTodayOrFuture(value: string | null | undefined): boolean {
    if (!value) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return false;
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.getTime() >= today.getTime();
}

export function isWithinLastDays(value: string | null | undefined, days: number): boolean {
    if (!value) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return false;
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);
    return date.getTime() >= cutoff.getTime();
}

export function greetingForHour(date: Date = new Date()): string {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

/** Follow-up status as recorded by the doctor (§7.1) rendered as a plain
 * word -- never the raw database default string, never invented terms. */
export function followUpStatusLabel(status: string, visitDate: string | null): string {
    if (status.toLowerCase() === 'done') return 'Completed';
    if (!isTodayOrFuture(visitDate)) return 'Return date passed';
    return 'Upcoming';
}

export function isFollowUpDone(status: string): boolean {
    return status.toLowerCase() === 'done';
}

/** Plain, patient-facing labels for the internal/FHSIS vaccine category
 * strings recorded on `fhsis_logs` (mirrors the categories in
 * src/features/vaccines/vaccineOptions.ts). Presentation-only -- the
 * stored category and the RPC response are never modified. Unrecognized
 * or missing categories fall back to a safe, readable label rather than
 * the raw reporting terminology. */
const VACCINE_CATEGORY_LABELS: Record<string, string> = {
    'Child Care / Core RHU Immunization': 'Childhood vaccinations',
    'Maternal Care / Women of Reproductive Age': 'Maternal care vaccinations',
    'NCD & Seniors / Adult or Special-Risk': 'Adult and senior vaccinations',
    'Rabies & Leprosy / Public Health': 'Public health vaccinations',
};

export function vaccinationCategoryLabel(category: string | null | undefined): string {
    if (!category) return 'Other vaccinations';
    return VACCINE_CATEGORY_LABELS[category] ?? 'Other vaccinations';
}
