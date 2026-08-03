// Canonical Malvar, Batangas barangay list. Patient registration
// (src/app/patients/templates.tsx) stores one of these exact strings in
// patients.address when the patient resides in Malvar, or a free-typed
// address when "Outside Malvar" is selected. Any barangay-based filter must
// use this list, not values parsed out of free-text addresses.
export const MALVAR_BARANGAYS = [
    'Bagong Pook, Malvar, Batangas', 'Bilucao, Malvar, Batangas',
    'Bulihan, Malvar, Batangas', 'Luta del Norte, Malvar, Batangas',
    'Luta del Sur, Malvar, Batangas', 'Poblacion, Malvar, Batangas',
    'San Andres, Malvar, Batangas', 'San Fernando, Malvar, Batangas',
    'San Gregorio, Malvar, Batangas', 'San Isidro, Malvar, Batangas',
    'San Juan, Malvar, Batangas', 'San Pedro I, Malvar, Batangas',
    'San Pedro II, Malvar, Batangas', 'San Pioquinto, Malvar, Batangas',
    'Santiago, Malvar, Batangas',
] as const;

export type MalvarBarangay = typeof MALVAR_BARANGAYS[number];

export function malvarBarangayShortName(fullBarangay: string): string {
    return fullBarangay.split(',')[0]?.trim() ?? fullBarangay;
}

export const MALVAR_BARANGAY_SHORT_NAMES = MALVAR_BARANGAYS.map(malvarBarangayShortName);

/** Returns the short barangay name only when the address exactly matches a
 * known Malvar barangay; otherwise null (never derives a name from free text). */
export function matchMalvarBarangay(address?: string | null): string | null {
    if (!address) return null;
    const trimmed = address.trim();
    const match = MALVAR_BARANGAYS.find(barangay => barangay === trimmed);
    return match ? malvarBarangayShortName(match) : null;
}
