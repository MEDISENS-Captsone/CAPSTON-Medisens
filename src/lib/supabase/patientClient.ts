import { createClient } from '@supabase/supabase-js';

// Patient Account §4.5 — a second, isolated Supabase client for the
// Patient Portal only. It must never share a session with the staff
// client (src/lib/supabase/client.ts, untouched by this file).
//
// - Distinct storageKey ('medisens-patient-auth') so the two clients never
//   read or overwrite each other's session entry on the same origin.
// - sessionStorage per D-8: on a shared RHU/family device the portal
//   session should not outlive the browser tab, unlike the staff client's
//   default localStorage persistence which is unaffected by this file.
//
// This isolation is a usability / accidental-cross-contamination
// safeguard, not the security boundary — the real boundary is
// database-side (patient_portal_can_access, patient_portal_scope, RLS).

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const patientSupabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storageKey: 'medisens-patient-auth',
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
    },
});
