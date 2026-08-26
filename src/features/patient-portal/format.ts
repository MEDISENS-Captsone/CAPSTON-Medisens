// Patient Account Phase 6 — presentation-only helpers. No filtering,
// re-interpretation, or clinical inference happens here (§9); this file
// only turns already patient-safe RPC values into the plain-language
// strings the blueprint specifies.
//
// Phase 9C localization completion: every function here that returns
// *interface* copy (headings, status words, fallback labels, relationship
// descriptions) now takes an optional `language` parameter and returns the
// Filipino string when it is `'fil'`. Functions that render
// clinician-authored/free-text or laboratory test/group vocabulary
// (labGroupLabel, labTestLabel, the LAB_*_LABELS maps, medicine/patient
// names) are deliberately left untouched by `language` -- per Phase 9C
// scope, laboratory test names are not translated unless explicitly
// called out as an approved fixed UI label, and clinical terminology is
// safer left in its recorded/reference form regardless of interface
// language.

import type { PatientLanguage } from '../../lib/i18n/patientPortal';

function pickLocale(language: PatientLanguage | undefined): string {
    return language === 'fil' ? 'fil-PH' : 'en-US';
}

/** "August 23, 2026" -- never ISO, never relative-only (§9). Parses the
 * date/timestamp prefix manually so a `date`-typed 'YYYY-MM-DD' value is
 * never shifted a day by local-timezone `Date` parsing. Formatted using a
 * Filipino-compatible locale when `language` is 'fil' (Phase 9C item 6) --
 * this only changes month-name formatting, never the stored value. Falls
 * back to English formatting if the runtime doesn't support the 'fil-PH'
 * locale rather than throwing. */
export function formatLongDate(value: string | null | undefined, language?: PatientLanguage): string | null {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    try {
        return date.toLocaleDateString(pickLocale(language), { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
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

export function greetingForHour(date: Date = new Date(), language?: PatientLanguage): string {
    const hour = date.getHours();
    if (language === 'fil') {
        if (hour < 12) return 'Magandang umaga';
        if (hour < 18) return 'Magandang hapon';
        return 'Magandang gabi';
    }
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

/** Follow-up status as recorded by the doctor (§7.1) rendered as a plain
 * word -- never the raw database default string, never invented terms. */
export function followUpStatusLabel(status: string, visitDate: string | null, language?: PatientLanguage): string {
    if (language === 'fil') {
        if (status.toLowerCase() === 'done') return 'Tapos na';
        if (!isTodayOrFuture(visitDate)) return 'Lumipas na ang petsa';
        return 'Paparating';
    }
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

const VACCINE_CATEGORY_LABELS_FIL: Record<string, string> = {
    'Child Care / Core RHU Immunization': 'Bakuna para sa mga bata',
    'Maternal Care / Women of Reproductive Age': 'Bakuna para sa buntis/nanay',
    'NCD & Seniors / Adult or Special-Risk': 'Bakuna para sa matatanda',
    'Rabies & Leprosy / Public Health': 'Bakuna para sa kalusugang pangmadla',
};

export function vaccinationCategoryLabel(category: string | null | undefined, language?: PatientLanguage): string {
    if (language === 'fil') {
        if (!category) return 'Iba pang bakuna';
        return VACCINE_CATEGORY_LABELS_FIL[category] ?? 'Iba pang bakuna';
    }
    if (!category) return 'Other vaccinations';
    return VACCINE_CATEGORY_LABELS[category] ?? 'Other vaccinations';
}

/** Recent/Previous grouping (§9.3) -- recency of `prescribedDate` and the
 * claimed/not-claimed status only. Never parses `duration` to infer
 * whether a course is "still active" -- `duration` values like `7 days`,
 * `1 week`, `until finished`, `PRN`, and `as directed` are not reliably
 * machine-interpretable, and guessing here is a medication-safety risk. */
export function isRecentPrescription(prescribedDate: string | null, claimed: boolean): boolean {
    if (!claimed) return true;
    return isWithinLastDays(prescribedDate, 90);
}

/** Patient-friendly claim status -- never the raw `Pending`/`Dispensed`
 * strings (§9.3, §7.2). */
export function claimStatusLabel(claimed: boolean, claimedDate: string | null, language?: PatientLanguage): string {
    const date = formatLongDate(claimedDate, language);
    if (language === 'fil') {
        if (!claimed) return 'Hindi pa nakuha sa RHU pharmacy';
        return date ? `Nakuha noong ${date}` : 'Nakuha na sa RHU pharmacy';
    }
    if (!claimed) return 'Not yet claimed at the RHU pharmacy';
    return date ? `Claimed on ${date}` : 'Claimed at the RHU pharmacy';
}

/** Splits a medicine's recorded `dosage` into a title-line strength
 * (e.g. "Amoxicillin 500 mg") when it plainly reads as a strength value,
 * otherwise the full `dosage` text is shown verbatim as the "Take" line
 * (§9.3) -- never reformatted, never reinterpreted. The medicine name and
 * dosage text themselves are clinical data and are never translated; only
 * the "Medicine" placeholder used when a name is missing changes with
 * language. */
export function medicineTitleAndTake(name: string | null, dosage: string | null, language?: PatientLanguage): { title: string; takeLine: string | null } {
    const safeName = name ?? (language === 'fil' ? 'Gamot' : 'Medicine');
    const looksLikeStrength = dosage ? /^\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)\b/i.test(dosage.trim()) : false;
    if (looksLikeStrength && dosage) {
        return { title: `${safeName} ${dosage}`.trim(), takeLine: null };
    }
    return { title: safeName, takeLine: dosage };
}

/** Plain-language lab findings group headings (§9.4). Presentation-only --
 * mirrors the group names already used in the staff-side LabResultDetailModal
 * without reusing any of its clinician-facing constants. Unknown groups
 * never reach this function (the RPC already drops them), but an unmapped
 * key still gets a readable fallback rather than raw camelCase.
 *
 * Deliberately NOT localized (Phase 9C item 4/scope): these are
 * laboratory test/group names, not general interface copy -- they stay in
 * their fixed English clinical form regardless of the selected Patient
 * Portal language. */
const LAB_GROUP_LABELS: Record<string, string> = {
    clinicalMicroscopy: 'Clinical Microscopy',
    bloodChemistry: 'Blood Chemistry',
    pregnancyTest: 'Pregnancy Test',
    hbsagScreening: 'HBsAg Screening',
    hivScreening: 'HIV Screening',
    parasitology: 'Parasitology',
    dengueRdt: 'Dengue RDT',
};

function humanizeKey(key: string): string {
    const withSpaces = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

export function labGroupLabel(groupKey: string): string {
    return LAB_GROUP_LABELS[groupKey] ?? humanizeKey(groupKey);
}

/** Plain-language labels for the snake_case `lab_request.is_*` test-flag
 * identifiers patient_portal_lab_results() returns for pending requests
 * (§17 Phase 7 correction). Identifiers shared with the findings-group
 * vocabulary (clinical_microscopy, blood_chemistry, pregnancy_test,
 * hbsag_screening, hiv_screening, parasitology, dengue_rdt) resolve to
 * the same plain-language name as their camelCase group counterpart.
 * Not localized -- see labGroupLabel. */
const LAB_TEST_FLAG_LABELS: Record<string, string> = {
    cbc: 'Complete Blood Count',
    cbc_platelet: 'Complete Blood Count with Platelet',
    hgb_hct: 'Hemoglobin / Hematocrit',
    xray: 'X-ray',
    ultrasound: 'Ultrasound',
    rbs: 'Random Blood Sugar',
    fbs: 'Fasting Blood Sugar',
    uric_acid: 'Uric Acid',
    cholesterol: 'Cholesterol',
    urinalysis: 'Urinalysis',
    fecalysis: 'Fecalysis',
    sputum: 'Sputum Test',
    clinical_microscopy: 'Clinical Microscopy',
    blood_chemistry: 'Blood Chemistry',
    pregnancy_test: 'Pregnancy Test',
    hbsag_screening: 'HBsAg Screening',
    hiv_screening: 'HIV Screening',
    parasitology: 'Parasitology',
    dengue_rdt: 'Dengue RDT',
};

/** Renders the `test_labels` array patient_portal_lab_results() returns
 * (known findings-group keys for released results, known is_* flag
 * identifiers for pending requests) as a single plain-language line.
 * Falls back to a safe generic label when the RPC returned no known
 * identifiers for that row (e.g. a plain-text/malformed `findings` value)
 * -- never raw JSON, never an empty dash. The fallback label is UI copy
 * and is localized; the test/group names themselves are not (see
 * labGroupLabel). */
export function labResultListLabel(testLabels: string[], language?: PatientLanguage): string {
    if (testLabels.length === 0) return language === 'fil' ? 'Resulta sa laboratoryo' : 'Lab result';
    return testLabels.map((key) => LAB_GROUP_LABELS[key] ?? LAB_TEST_FLAG_LABELS[key] ?? humanizeKey(key)).join(', ');
}

const LAB_TEST_ACRONYMS = new Set(['wbc', 'rbc', 'hgb', 'hct', 'fbs', 'rbs', 'bun', 'alt', 'ast', 'hdl', 'ldl', 'tsh', 'ns1']);

export function labTestLabel(testKey: string): string {
    if (LAB_TEST_ACRONYMS.has(testKey.toLowerCase())) return testKey.toUpperCase();
    return humanizeKey(testKey);
}

/** A test's recorded value, rendered exactly as returned -- never a
 * High/Low/Abnormal/Normal verdict, never an arrow, never a computed
 * interpretation (§9.4). */
export function labTestValueText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

// ============================================================
// Phase 8 -- Profile, correction requests, access management, recent
// access, and preferences copy.
// ============================================================

/** "August 24, 2026, 9:14 AM" -- the §9.5 Recent Access format. Unlike
 * formatLongDate, this is a full timestamp (occurred_at is timestamptz),
 * so ordinary local-timezone Date parsing is correct here. Locale-aware
 * per Phase 9C item 6, same fallback behavior as formatLongDate. */
export function formatDateTime(value: string | null | undefined, language?: PatientLanguage): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    try {
        return date.toLocaleString(pickLocale(language), { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
        return date.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
}

const CORRECTION_FIELD_GROUP_LABELS: Record<string, string> = {
    name: 'Name',
    birthdate: 'Birthdate',
    address: 'Address',
    contact: 'Contact number',
    philhealth: 'PhilHealth number',
    other: 'Other',
};

const CORRECTION_FIELD_GROUP_LABELS_FIL: Record<string, string> = {
    name: 'Pangalan',
    birthdate: 'Kaarawan',
    address: 'Address',
    contact: 'Numero ng contact',
    philhealth: 'Numero ng PhilHealth',
    other: 'Iba pa',
};

export function correctionFieldGroupLabel(fieldGroup: string, language?: PatientLanguage): string {
    if (language === 'fil') return CORRECTION_FIELD_GROUP_LABELS_FIL[fieldGroup] ?? 'Iba pa';
    return CORRECTION_FIELD_GROUP_LABELS[fieldGroup] ?? 'Other';
}

const CORRECTION_STATUS_LABELS: Record<string, string> = {
    submitted: 'Submitted',
    resolved: 'Resolved',
    declined: 'Declined',
};

const CORRECTION_STATUS_LABELS_FIL: Record<string, string> = {
    submitted: 'Naisumite',
    resolved: 'Naresolba na',
    declined: 'Hindi tinanggap',
};

export function correctionStatusLabel(status: string, language?: PatientLanguage): string {
    if (language === 'fil') return CORRECTION_STATUS_LABELS_FIL[status] ?? 'Naisumite';
    return CORRECTION_STATUS_LABELS[status] ?? 'Submitted';
}

/** Plain-language relationship line for an access-list card (§9.5). */
export function accessRelationshipLabel(relationship: 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER', language?: PatientLanguage): string {
    if (language === 'fil') {
        if (relationship === 'SELF') return 'Ikaw (ang pasyente)';
        if (relationship === 'GUARDIAN') return 'Guardian';
        return 'Awtorisadong caregiver';
    }
    if (relationship === 'SELF') return 'You (the patient)';
    if (relationship === 'GUARDIAN') return 'Guardian';
    return 'Authorized caregiver';
}

/** Recent-access action -> a plain sentence fragment, e.g. "viewed your
 * lab results". Falls back to a generic, still-safe phrase for any action
 * this list doesn't specifically know about -- never the raw action
 * string, never a database/module name. */
const RECENT_ACCESS_ACTION_LABELS: Record<string, string> = {
    view: 'viewed this health record',
};

const RECENT_ACCESS_ACTION_LABELS_FIL: Record<string, string> = {
    view: 'tiningnan ang health record na ito',
};

export function recentAccessActionLabel(action: string, language?: PatientLanguage): string {
    if (language === 'fil') return RECENT_ACCESS_ACTION_LABELS_FIL[action] ?? 'na-access ang health record na ito';
    return RECENT_ACCESS_ACTION_LABELS[action] ?? 'accessed this health record';
}
