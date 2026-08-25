import { isValidMedisensId, normalizeMedisensId } from './qr';

// Patient Account Phase 9B Step 6 -- "Remember my MediSens ID on this
// device" (task §6). A narrowly named, single-purpose key that stores
// exactly one thing: the normalized MediSens ID. Never the account
// holder's name, PIN, activation code, OTP, Auth password, or access
// token -- none of those are ever read or written by this module, and
// nothing else in the Patient Portal writes to this key.
const STORAGE_KEY = 'medisens-remembered-id';

export function getRememberedMedisensId(): string | null {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;
        // Defensive re-validation: a hand-edited or stale value never
        // silently prefills something that no longer matches the format.
        return isValidMedisensId(stored) ? normalizeMedisensId(stored) : null;
    } catch {
        return null;
    }
}

export function setRememberedMedisensId(rawMedisensId: string): void {
    const normalized = normalizeMedisensId(rawMedisensId);
    if (!isValidMedisensId(normalized)) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
        // localStorage unavailable (e.g. private mode) -- remembering is a
        // convenience only, never required for login to work.
    }
}

export function forgetRememberedMedisensId(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do if storage is unavailable.
    }
}
