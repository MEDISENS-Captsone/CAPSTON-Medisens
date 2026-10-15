import type { ImportPatient } from './patientImport.ts';

export function keyBytes(value: string): Uint8Array {
  const bytes = /^[a-f\d]{64}$/i.test(value)
    ? new Uint8Array(value.match(/.{2}/g)!.map(part => parseInt(part, 16)))
    : Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('Encryption service is not ready.');
  return bytes;
}
export function base64url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9'\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Matches the deployed medisens-secure-records v1 envelope, AAD and blind indexes.
export async function prepareImportPatient(patient: ImportPatient, age: number, dataKey: string, searchKey: string) {
  const aes = await crypto.subtle.importKey('raw', keyBytes(dataKey) as BufferSource, 'AES-GCM', false, ['encrypt']);
  const hmac = await crypto.subtle.importKey('raw', keyBytes(searchKey) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const index = async (value: string) => base64url(new Uint8Array(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(value))));
  const crypto_ref = crypto.randomUUID();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sensitiveNames = ['firstName', 'middleName', 'lastName', 'suffix', 'birthday', 'nationality', 'bloodType', 'religion', 'birthPlace', 'address', 'contactNumber', 'educationalAttain', 'employmentStatus', 'philhealthNo', 'relativeName', 'relativeRelation', 'relativeAddress', 'relativeContact'] as const;
  const sensitive = Object.fromEntries(sensitiveNames.map(name => [name, patient[name] || null]));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`patients:${crypto_ref}:v1`), tagLength: 128 }, aes, new TextEncoder().encode(JSON.stringify(sensitive)));
  const parts = ['firstName', 'middleName', 'lastName', 'suffix'].map(name => normalizeName(patient[name as keyof ImportPatient])).filter(Boolean);
  const tokens = [...new Set([...parts.flatMap(part => part.split(/\s+/)), normalizeName(parts.join(' '))].filter(Boolean))];
  return {
    ...patient, age, consent_signed: false, crypto_ref, crypto_version: 1, encrypted_at: new Date().toISOString(),
    pii_ciphertext: { v: 1, alg: 'A256GCM', iv: base64url(iv), ciphertext: base64url(new Uint8Array(encrypted)) },
    name_token_bidx: await Promise.all(tokens.map(index)),
    contact_bidx: patient.contactNumber ? await index(patient.contactNumber.replace(/\D/g, '')) : null,
    philhealth_bidx: patient.philhealthNo ? await index(patient.philhealthNo.toUpperCase().replace(/[^A-Z0-9]/g, '')) : null,
  };
}
