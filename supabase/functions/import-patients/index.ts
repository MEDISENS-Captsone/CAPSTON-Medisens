import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';
import { MAX_IMPORT_ROWS, validateImportPatient } from '../_shared/patientImport.ts';
import { prepareImportPatient } from '../_shared/importEncryption.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
function reply(body: unknown, status = 200) { return new Response(JSON.stringify(body), { headers, status }); }
function envKey(map: string, legacy: string): string {
  const raw = Deno.env.get(legacy) || Deno.env.get(map) || '';
  try { const values = JSON.parse(raw); return values.default || Object.values(values)[0] || ''; } catch { return raw; }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const client = createClient(url, envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Authentication required.' }, 401);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return reply({ error: 'Authentication required.' }, 401);
    const { data: profile, error: profileError } = await client.from('profiles').select('role,is_active').eq('id', user.id).single();
    if (profileError || !profile?.is_active || !['BHW', 'nurse', 'midwives', 'doctor'].includes(profile.role)) return reply({ error: 'Access denied.' }, 403);
    if (Number(request.headers.get('Content-Length')) > 2 * 1024 * 1024) return reply({ error: 'Import is too large.' }, 413);
    // Bound the request while reading, even when Content-Length is absent.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Rows are required.' }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 2 * 1024 * 1024) { await reader.cancel(); return reply({ error: 'Import is too large.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > MAX_IMPORT_ROWS || typeof body.commit !== 'boolean') return reply({ error: 'Provide 1–500 rows and a commit flag.' }, 400);
    const dataKey = Deno.env.get('MEDISENS_DATA_KEY_V1');
    const searchKey = Deno.env.get('MEDISENS_SEARCH_KEY_V1');
    if (!dataKey || !searchKey) return reply({ error: 'Encryption service is not ready.' }, 503);
    const prepared = await Promise.all(body.rows.map(async (input: unknown) => {
      const { patient, errors, age } = validateImportPatient(input);
      return errors.length ? { validation_error: errors.join(' ') } : await prepareImportPatient(patient, age, dataKey, searchKey);
    }));
    const { data, error } = await client.rpc('import_patient_csv_rows', { p_actor: user.id, p_rows: prepared, p_commit: body.commit });
    if (error) return reply({ error: 'Patient import failed. Preview again before retrying.' }, 400);
    return reply({ results: data });
  } catch { return reply({ error: 'Unable to process this import.' }, 400); }
});
