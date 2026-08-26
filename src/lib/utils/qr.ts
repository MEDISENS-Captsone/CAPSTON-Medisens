// Patient Account Phase 9B Step 2 -- the QR utility layer shared by the
// (not-yet-built) staff Patient Card printout and the Patient Portal
// scanner. This module owns the entire QR *payload contract* in one
// place: what is allowed to go into a QR code, and what is allowed to
// come back out of one. Nothing else in the codebase should construct or
// parse this payload independently.
//
// Payload contract (never anything else):
//   https://<host>/pages/patient.html#ms=MS-XXXX-XXXX
// A URL fragment carrying only the MediSens ID -- never a PIN, activation
// code, OTP, patients.id, patient_accounts.id, auth_user_id, or any
// opaque access/grant/visit/result token. The fragment never reaches a
// server (browsers do not send it in requests), and the Patient Portal
// strips it from the visible URL immediately after reading it
// (history.replaceState -- done by the caller, not this module).

// Mirrors generateMedisensId()'s own output shape exactly
// (supabase/functions/_shared/patientPortal.ts): MS- plus two 4-character
// groups drawn from the visually-unambiguous SAFE_ALPHABET (excludes
// 0/O, 1/I/L). Kept identical to the server-side pattern
// (patient-access-grant/index.ts) so "valid format" means the same thing
// everywhere in the system.
export const MEDISENS_ID_PATTERN = /^MS-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/;

/** Trim + uppercase -- the same normalization patient-login and
 * patient-access-grant already apply server-side. Presentation-only; does
 * not itself validate the shape. */
export function normalizeMedisensId(raw: string): string {
    return raw.trim().toUpperCase();
}

export function isValidMedisensId(raw: string): boolean {
    return MEDISENS_ID_PATTERN.test(normalizeMedisensId(raw));
}

// Patient Account Phase 9B Step 6 -- input-time formatting for the manual
// MediSens ID field. This is a usability convenience only: it inserts the
// two hyphens the canonical format requires, uppercases as the user
// types, and recognizes/discards a manually-typed "MS" prefix so it is
// never duplicated. It never validates or repairs content -- an
// ambiguous/disallowed character (0, 1, O, I, L) is left exactly where
// the user typed it, so MEDISENS_ID_PATTERN still rejects it downstream
// exactly as it always has. Only separators (hyphens, spaces) and
// letter-casing are ever touched here.
export function formatMedisensIdInput(raw: string): string {
    const upper = raw.toUpperCase();
    // Strip everything that isn't a letter or digit -- typed/pasted
    // hyphens and spaces are separator artifacts this function rebuilds
    // itself; every alphanumeric character (valid or not) is preserved
    // untouched and in order.
    const alnum = upper.replace(/[^A-Z0-9]/g, '');

    // A bare "M" or "MS" in progress: shown as-is rather than jumping
    // straight to "MS-M" -- matches how someone typing the prefix
    // themselves expects to see exactly what they've typed so far.
    if (alnum.length <= 2 && 'MS'.startsWith(alnum)) {
        return alnum;
    }

    // A recognized "MS" prefix is consumed once, never duplicated. Input
    // with no such prefix (e.g. pasting or typing the 8-character body
    // directly) is treated as the body outright -- "MS-" is added for it.
    const body = alnum.startsWith('MS') ? alnum.slice(2) : alnum;
    const truncated = body.slice(0, 8);

    let result = 'MS';
    if (truncated.length > 0) result += `-${truncated.slice(0, 4)}`;
    if (truncated.length > 4) result += `-${truncated.slice(4, 8)}`;
    return result;
}

// Patient Account Phase 9B Step 5 -- there is no existing canonical
// public-URL config anywhere in the repo (grepped vite.config.ts,
// README.md, vercel.json: none exists). Printing a permanent Patient
// Card QR against `window.location.origin` alone would silently bake a
// `localhost`/preview-deploy URL into a physical card the moment staff
// print from a dev machine or a Vercel preview build. This introduces
// the smallest possible fix: one optional build-time env var staff/ops
// can set to the real production origin; everything else (safety
// checks, fallback to window.location.origin for non-printing preview
// use) lives in this one function so there is exactly one place that
// decides "is this origin OK to put on a physical card".
//
// New environment variable: VITE_PATIENT_PORTAL_BASE_URL
//   - Set in Vercel: Project Settings -> Environment Variables, on the
//     Production environment, to the real deployed origin, e.g.
//     https://medisens.example.org (no trailing slash, no path).
//   - Set in local development .env only if intentionally testing
//     against a real deployed origin; otherwise leave unset -- printing
//     stays blocked (isSafe: false) and only a labelled preview renders.
//   - Not required for any other part of the app; Patient Login itself
//     is unaffected (Step 6 scope).
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export interface PatientPortalOrigin {
    origin: string;
    /** true only when this origin is safe to bake into a printed,
     * physical Patient Card QR code. */
    isSafe: boolean;
    reason?: string;
}

/** Resolves the origin to use for a printable Patient Card QR, and
 * whether it is safe to actually print (never localhost/loopback, and
 * only "safe" outright when explicitly configured via
 * VITE_PATIENT_PORTAL_BASE_URL rather than inferred from the current
 * tab, since an inferred origin could just as easily be an ephemeral
 * Vercel preview deployment). Never throws; a preview can always be
 * rendered, but `isSafe` gates the actual print action. */
export function getCanonicalPatientPortalOrigin(): PatientPortalOrigin {
    const configured = import.meta.env.VITE_PATIENT_PORTAL_BASE_URL as string | undefined;
    if (configured && configured.trim()) {
        const trimmed = configured.trim().replace(/\/+$/, '');
        if (LOCAL_ORIGIN_PATTERN.test(trimmed)) {
            return { origin: trimmed, isSafe: false, reason: 'VITE_PATIENT_PORTAL_BASE_URL is set to a localhost address.' };
        }
        return { origin: trimmed, isSafe: true };
    }

    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    if (!currentOrigin) {
        return { origin: '', isSafe: false, reason: 'No application origin is available.' };
    }
    if (LOCAL_ORIGIN_PATTERN.test(currentOrigin)) {
        return { origin: currentOrigin, isSafe: false, reason: 'This is a local development address, not a public MediSens URL.' };
    }
    return {
        origin: currentOrigin,
        isSafe: false,
        reason: 'VITE_PATIENT_PORTAL_BASE_URL is not configured, so this URL cannot be confirmed as the canonical public MediSens address.',
    };
}

/** Builds the canonical Patient Card URL for a MediSens ID. Returns
 * `null` for anything that isn't a valid MediSens ID -- this function
 * will not encode an arbitrary string into a QR code just because it was
 * asked to. `origin` defaults to the current page's origin so the same
 * card works whichever environment it was printed from (staging vs.
 * production), and accepts an override only for tests / server-side
 * generation where `window` is not the caller's own page. */
export function buildPatientCardUrl(rawMedisensId: string, origin?: string): string | null {
    const medisensId = normalizeMedisensId(rawMedisensId);
    if (!MEDISENS_ID_PATTERN.test(medisensId)) return null;
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/pages/patient.html#ms=${medisensId}`;
}

/** Extracts a MediSens ID from a `#ms=MS-XXXX-XXXX` fragment (with or
 * without the leading `#`). Returns `null` for anything malformed or
 * missing -- never throws, never partially accepts a near-miss. */
export function parseMedisensIdFromFragment(hash: string | null | undefined): string | null {
    if (!hash) return null;
    const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(stripped);
    const candidate = params.get('ms');
    if (!candidate) return null;
    const normalized = normalizeMedisensId(candidate);
    return MEDISENS_ID_PATTERN.test(normalized) ? normalized : null;
}

/** Extracts a MediSens ID from whatever a QR scan actually returned:
 * either a bare MediSens ID, or a full patient-portal card URL. This is
 * the only function scanner output is allowed to pass through -- its
 * result is a candidate ID string or `null`, never a URL, and callers
 * must never navigate to or otherwise open the raw scanned text. An
 * unrelated URL (a different site, a different path) or arbitrary QR
 * text is rejected, not partially parsed. `expectedPathname` lets callers
 * pin the accepted route without hardcoding it twice. */
export function extractMedisensIdFromScan(
    scannedText: string,
    expectedPathname = '/pages/patient.html',
): string | null {
    const trimmed = scannedText.trim();
    if (!trimmed) return null;

    // Bare ID, no URL wrapper.
    if (isValidMedisensId(trimmed)) return normalizeMedisensId(trimmed);

    // Otherwise, only a same-shape MediSens Patient Portal URL is
    // accepted. Anything that fails to parse as a URL, or that resolves
    // to a different path, is rejected outright -- the scanner never
    // opens or trusts an arbitrary scanned URL.
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }
    if (url.pathname !== expectedPathname) return null;
    return parseMedisensIdFromFragment(url.hash);
}

/** Generates the QR code image (as a data: URL) for a MediSens Patient
 * Card. Rejects (rejects the promise, does not silently fall back)
 * anything that isn't a valid MediSens ID -- this is the only function in
 * the codebase allowed to turn a MediSens ID into a printable QR image,
 * and it will not encode an arbitrary payload just because it was asked
 * to. `qrcode` is imported dynamically here rather than at module scope:
 * this file is also imported by the patient-facing scanner
 * (QrScan.tsx / the future login screen), and this keeps the generator
 * library out of that bundle's import graph entirely -- it is only ever
 * fetched when a staff screen actually calls this function. */
export async function generatePatientCardQrDataUrl(rawMedisensId: string, origin?: string): Promise<string> {
    const url = buildPatientCardUrl(rawMedisensId, origin);
    if (!url) throw new Error('Cannot generate a Patient Card QR code for an invalid MediSens ID.');
    const QRCode = await import('qrcode');
    return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
}
