import { printHtmlDocument } from '../../lib/utils/print';
import { buildPatientCardUrl, generatePatientCardQrDataUrl, getCanonicalPatientPortalOrigin, normalizeMedisensId } from '../../lib/utils/qr';

// Patient Account Phase 9B Step 5 -- printable handoff artifacts. Reuses
// the project's established printing approach (`printHtmlDocument`,
// already used by the pharmacist and consultation print flows): build a
// self-contained HTML string with its own `@page`/print styles, hand it
// to a hidden iframe, print only that iframe. Nothing here touches
// `window.print()` on the app's own document, so the Patient Detail
// modal, sidebar, and buttons behind it are never part of the printed
// output -- there is nothing else in the iframe's document to print.
//
// Both builders only ever receive already-authorized, already-safe
// values (a name, a MediSens ID, a code, an expiry) from their callers.
// Neither reads any table, calls any Edge Function, or has access to a
// Supabase client -- there is no way for either function to reach
// patient_activation_codes, patient_accounts.id, or any clinical table
// even if asked to.

const escapeHtml = (value: string | number | null | undefined) =>
    String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const PRINT_BASE_STYLE = `
    * { box-sizing: border-box; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #14212A; margin: 0; }
    .brand { font-size: 11pt; font-weight: 700; letter-spacing: 0.02em; }
    .facility { font-size: 8.5pt; color: #52616B; }
`;

export type PatientAccountRelationship = 'SELF' | 'GUARDIAN' | 'AUTHORIZED_CAREGIVER';

const RELATIONSHIP_SLIP_LABEL: Record<PatientAccountRelationship, string> = {
    SELF: 'Patient',
    GUARDIAN: 'Parent / legal guardian',
    AUTHORIZED_CAREGIVER: 'Authorized caregiver',
};

export interface ActivationSlipInput {
    /** The account holder's own name -- never the patient's name for a
     * GUARDIAN/AUTHORIZED_CAREGIVER activation (task §2, §5.2/§5.2.1). */
    holderName: string;
    relationship: PatientAccountRelationship;
    /** Only set (and only ever printed) for GUARDIAN/AUTHORIZED_CAREGIVER,
     * so the slip can say whose record this grants access to -- display
     * name only, never DOB/diagnosis/address/PhilHealth (task §2). */
    accessPatientName?: string;
    /** Plaintext activation code -- exists only in the Step 4 success
     * response held in React state. This function never persists it and
     * never receives anything else that could reconstruct it (no code
     * hash, no activation-code row id). */
    code: string;
    expiresAt: string;
}

function buildActivationSlipHtml(input: ActivationSlipInput): string {
    const expiresLabel = new Date(input.expiresAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
    const accessLine = input.relationship === 'SELF'
        ? null
        : `<div class="row"><span class="label">Access to</span><span class="value">${escapeHtml(input.accessPatientName ?? '')}'s health record</span></div>`;

    // Print-polish pass: the page stays A6 (task requirement), but the
    // content is now a single bordered "slip" box centered on that page,
    // the same composition pattern already used for the Patient Card
    // (.card below) -- rather than loose lines starting at the top-left
    // of an otherwise blank A6 sheet. Internal spacing is tightened
    // (row/title/expiry margins roughly halved) so the box reads as one
    // compact, intentional handoff document instead of sparse text.
    return `<!doctype html><html><head><meta charset="utf-8"><title>MediSens Activation Slip</title><style>
        @page { size: A6 portrait; margin: 8mm; }
        ${PRINT_BASE_STYLE}
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .slip {
            width: 100%;
            border: 1.25px solid #14212A;
            border-radius: 3mm;
            padding: 5mm 5.5mm;
        }
        .row { display: flex; justify-content: space-between; gap: 8px; margin-top: 3px; font-size: 9pt; }
        .label { color: #52616B; }
        .value { font-weight: 600; text-align: right; }
        .title { margin-top: 6px; font-size: 10pt; font-weight: 700; }
        .divider { margin-top: 6px; border-top: 1px solid #DDE3E6; }
        .code-box { margin-top: 6px; border: 1.5px solid #14212A; border-radius: 4px; padding: 7px; text-align: center; }
        .code { font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace; font-size: 22pt; font-weight: 700; letter-spacing: 0.1em; }
        .expiry { margin-top: 5px; font-size: 8.5pt; color: #52616B; text-align: center; }
        .instructions { margin-top: 7px; font-size: 8pt; line-height: 1.4; }
        .instructions p { margin: 0 0 3px; }
        .warn { font-weight: 600; }
    </style></head><body>
        <div class="slip">
            <div class="brand">MediSens &middot; Malvar Rural Health Unit</div>
            <div class="facility">Patient Portal Activation</div>
            <div class="title">Activation for: ${escapeHtml(input.holderName)}</div>
            <div class="row"><span class="label">Relationship</span><span class="value">${escapeHtml(RELATIONSHIP_SLIP_LABEL[input.relationship])}</span></div>
            ${accessLine ?? ''}
            <div class="divider"></div>
            <div class="code-box">
                <div class="code">${escapeHtml(input.code)}</div>
            </div>
            <div class="expiry">Expires: ${escapeHtml(expiresLabel)}</div>
            <div class="instructions">
                <p>Use this activation code to set up your MediSens Patient Account.</p>
                <p>During setup, you will create your own 6-digit PIN.</p>
                <p class="warn">Do not share your PIN with RHU staff or other people.</p>
            </div>
        </div>
    </body></html>`;
}

/** Prints the Activation Instruction Slip. Returns false if the print
 * window could not be opened (caller shows a toast) -- never throws. */
export function printActivationSlip(input: ActivationSlipInput): boolean {
    return printHtmlDocument(buildActivationSlipHtml(input));
}

export interface PatientCardInput {
    holderName: string;
    medisensId: string;
}

export interface PatientCardPreview {
    /** null when the QR could not be generated (invalid MediSens ID). */
    qrDataUrl: string | null;
    /** Whether the resolved application origin is confirmed safe to
     * print (task §7) -- gates the actual print action; a preview can
     * still render either way so staff can see what would print. */
    canPrint: boolean;
    unsafeReason?: string;
}

/** Resolves everything a Patient Card render needs, including the
 * origin-safety check (task §7). Called by the preview UI on mount/open,
 * and again by the actual print action so a stale preview can never
 * print a QR built against a different origin decision. */
export async function buildPatientCardPreview(medisensId: string): Promise<PatientCardPreview> {
    const { origin, isSafe, reason } = getCanonicalPatientPortalOrigin();
    try {
        const qrDataUrl = await generatePatientCardQrDataUrl(medisensId, origin);
        return { qrDataUrl, canPrint: isSafe, unsafeReason: isSafe ? undefined : reason };
    } catch {
        return { qrDataUrl: null, canPrint: false, unsafeReason: reason ?? 'Could not generate a QR code for this MediSens ID.' };
    }
}

function buildPatientCardHtml(input: PatientCardInput, qrDataUrl: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>MediSens Patient Card</title><style>
        @page { size: auto; margin: 15mm; }
        ${PRINT_BASE_STYLE}
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card {
            width: 85.6mm; height: 54mm;
            border: 1px solid #14212A;
            border-radius: 3mm;
            background: #FFFFFF;
            padding: 4mm 5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .card-header { font-size: 9pt; font-weight: 700; }
        .card-sub { font-size: 6.5pt; color: #52616B; margin-top: 0.5mm; }
        .card-body { display: flex; align-items: center; gap: 4mm; margin-top: 2mm; }
        .card-qr { width: 22mm; height: 22mm; flex: none; }
        .card-qr img { width: 100%; height: 100%; display: block; }
        .card-info { min-width: 0; }
        .holder-name { font-size: 10pt; font-weight: 700; line-height: 1.2; word-break: break-word; }
        .medisens-id { margin-top: 1.5mm; font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace; font-size: 9pt; font-weight: 600; letter-spacing: 0.04em; }
        .card-footer { font-size: 6.5pt; color: #14212A; line-height: 1.35; margin-top: 2mm; }
        .card-footer .pin-note { color: #52616B; }
    </style></head><body>
        <div class="card">
            <div>
                <div class="card-header">MediSens Patient Account</div>
                <div class="card-sub">Malvar Rural Health Unit</div>
            </div>
            <div class="card-body">
                <div class="card-qr"><img src="${qrDataUrl}" alt="" /></div>
                <div class="card-info">
                    <div class="holder-name">${escapeHtml(input.holderName)}</div>
                    <div class="medisens-id">${escapeHtml(normalizeMedisensId(input.medisensId))}</div>
                </div>
            </div>
            <div class="card-footer">
                Scan to open MediSens Patient Portal
                <div class="pin-note">You will still need your 6-digit PIN.</div>
            </div>
        </div>
    </body></html>`;
}

/** Prints the permanent Patient Card. Only ever called after the caller
 * has already confirmed `canPrint` from `buildPatientCardPreview` --
 * re-resolves the origin itself as a defensive re-check rather than
 * trusting a stale preview object, and refuses to print (returns false)
 * if the origin is not confirmed safe (task §7) or the MediSens ID is
 * invalid, rather than silently falling back to `window.location.origin`. */
export async function printPatientCard(input: PatientCardInput): Promise<boolean> {
    const { origin, isSafe } = getCanonicalPatientPortalOrigin();
    if (!isSafe) return false;
    const url = buildPatientCardUrl(input.medisensId, origin);
    if (!url) return false;
    const qrDataUrl = await generatePatientCardQrDataUrl(input.medisensId, origin);
    return printHtmlDocument(buildPatientCardHtml(input, qrDataUrl));
}
