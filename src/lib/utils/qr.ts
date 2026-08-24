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
