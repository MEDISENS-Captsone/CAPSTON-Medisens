import { supabase } from '../../lib/supabase/client';
import { logError } from '../../lib/utils/errors';

export interface AuditLog {
    id: number;
    user_id: string | null;
    user_name: string | null;
    user_role: string | null;
    action: string;
    module: string;
    record_id: string | null;
    record_type: string | null;
    description: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    related_patient_label?: string | null;
}

export interface AuditLogFilters {
    search?: string;
    user?: string;
    role?: string;
    module?: string;
    action?: string;
    recordType?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
}

export interface AuditLogInput {
    action: string;
    module: string;
    recordId?: string | number | null;
    recordType?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<{ logs: AuditLog[]; count: number }> {
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 10), 100);
    const page = Math.max(filters.page ?? 0, 0);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('audit_logs')
        .select('id, user_id, user_name, user_role, action, module, record_id, record_type, description, metadata, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (filters.search) {
        const searchFilter = filters.search.trim();
        const patientIds = await fetchPatientIdsForSearch(searchFilter);
        const searchClauses = [
            `user_name.ilike.%${escapePostgrestSearch(searchFilter)}%`,
            `module.ilike.%${escapePostgrestSearch(searchFilter)}%`,
            `description.ilike.%${escapePostgrestSearch(searchFilter)}%`,
            `record_type.ilike.%${escapePostgrestSearch(searchFilter)}%`,
            `record_id.ilike.%${escapePostgrestSearch(searchFilter)}%`,
        ];
        if (patientIds.length > 0) {
            searchClauses.push(`record_id.in.(${patientIds.map(escapePostgrestListValue).join(',')})`);
        }
        query = query.or(searchClauses.join(','));
    }

    if (filters.user) {
        const userFilter = filters.user.trim();
        const isUuid = isUuidLike(userFilter);
        query = isUuid
            ? query.or(`user_name.ilike.%${userFilter}%,user_id.eq.${userFilter}`)
            : query.ilike('user_name', `%${userFilter}%`);
    }
    if (filters.role) query = query.eq('user_role', filters.role);
    if (filters.module) query = query.eq('module', filters.module);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.recordType) query = query.eq('record_type', filters.recordType);
    if (filters.fromDate) query = query.gte('created_at', localDateBoundaryIso(filters.fromDate, 'start'));
    if (filters.toDate) query = query.lte('created_at', localDateBoundaryIso(filters.toDate, 'end'));

    const { data, error, count } = await query;
    if (error) throw error;

    return { logs: await enrichAuditLogs((data as AuditLog[]) || []), count: count ?? 0 };
}

function localDateBoundaryIso(dateValue: string, boundary: 'start' | 'end'): string {
    const [year, month, day] = dateValue.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (boundary === 'end') {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }
    return date.toISOString();
}

async function fetchPatientIdsForSearch(search: string): Promise<string[]> {
    const trimmed = search.trim();
    if (!trimmed) return [];

    const escaped = escapePostgrestSearch(trimmed);
    if (!escaped) return [];

    // patients.id is a bigint. `ilike` has no bigint operator (Postgres 42883), so the
    // identifier is only ever matched with an equality comparison, and only when the
    // search term is a safe integer. Free text matches the name columns instead.
    const clauses = [
        `firstName.ilike.%${escaped}%`,
        `middleName.ilike.%${escaped}%`,
        `lastName.ilike.%${escaped}%`,
    ];
    if (isSafePatientId(escaped)) {
        clauses.unshift(`id.eq.${escaped}`);
    }

    const { data, error } = await supabase
        .from('patients')
        .select('id')
        .or(clauses.join(','))
        .limit(25);

    if (error) {
        // A failed lookup must not be silently downgraded to "no matches", which would
        // render a real failure as an empty audit result.
        logError('Failed to resolve patient search matches for audit logs', error);
        throw error;
    }

    return (data || []).map(row => String(row.id)).filter(Boolean);
}

function isSafePatientId(value: string): boolean {
    if (!/^\d+$/.test(value)) return false;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0;
}

async function enrichAuditLogs(logs: AuditLog[]): Promise<AuditLog[]> {
    const patientIds = Array.from(new Set(logs.flatMap(extractPatientIdsFromAuditLog)));
    if (patientIds.length === 0) return logs;

    const { data, error } = await supabase
        .from('patients')
        .select('id, firstName, middleName, lastName')
        .in('id', patientIds);

    if (error) {
        logError('Failed to resolve patient labels for audit logs', error);
        return logs;
    }

    const labels = new Map<string, string>();
    (data || []).forEach(patient => {
        const fullName = [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(', ');
        labels.set(String(patient.id), fullName ? `${fullName} | Patient #${patient.id}` : `Patient #${patient.id}`);
    });

    return logs.map(log => {
        const patientId = extractPatientIdsFromAuditLog(log).find(id => labels.has(id));
        return patientId ? { ...log, related_patient_label: labels.get(patientId) ?? null } : log;
    });
}

function extractPatientIdsFromAuditLog(log: AuditLog): string[] {
    const values = [
        log.record_type === 'patient' ? log.record_id : null,
        typeof log.metadata?.patient_id === 'string' || typeof log.metadata?.patient_id === 'number' ? log.metadata.patient_id : null,
    ];
    return values.map(value => String(value || '').trim()).filter(Boolean);
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapePostgrestSearch(value: string): string {
    return value.replace(/[%*,()]/g, ' ').trim();
}

function escapePostgrestListValue(value: string): string {
    return `"${value.replace(/"/g, '')}"`;
}

const recentAuditEvents = new Map<string, number>();
const DEDUPE_WINDOW_MS = 2500;

export async function logAuditEvent(input: AuditLogInput): Promise<void> {
    try {
        const dedupeKey = getAuditDedupeKey(input);
        const now = Date.now();
        const previous = recentAuditEvents.get(dedupeKey);
        if (previous && now - previous < DEDUPE_WINDOW_MS) {
            console.info('[MEDISENS audit] Suppressed rapid duplicate audit event', {
                action: input.action,
                module: input.module,
                recordType: input.recordType ?? null,
                recordId: input.recordId ?? null,
            });
            return;
        }
        recentAuditEvents.set(dedupeKey, now);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('No active session for audit logging.');

        const metadata = sanitizeMetadata(input.metadata);
        const { data, error, response } = await supabase.functions.invoke('create-audit-log', {
            body: {
                action: input.action,
                module: input.module,
                record_id: input.recordId == null ? null : String(input.recordId),
                record_type: input.recordType ?? null,
                description: input.description ?? null,
                metadata,
            },
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (error) {
            const responseBody = await readAuditFunctionResponse(response);
            console.error('[MEDISENS audit] create-audit-log invocation failed', {
                action: input.action,
                module: input.module,
                recordType: input.recordType ?? null,
                hasSession: Boolean(sessionData.session),
                hasAccessToken: Boolean(accessToken),
                functionName: 'create-audit-log',
                status: response?.status ?? null,
                response: responseBody,
                error,
            });
            throw error;
        }
        if (!data?.ok) {
            console.error('[MEDISENS audit] create-audit-log returned an unexpected response', {
                action: input.action,
                module: input.module,
                recordType: input.recordType ?? null,
                functionName: 'create-audit-log',
                response: data,
            });
            throw new Error('Audit log Edge Function did not confirm insertion.');
        }
    } catch (error) {
        logError(`Audit log write failed for ${input.module}:${input.action}`, error);
    }
}

function getAuditDedupeKey(input: AuditLogInput): string {
    return JSON.stringify({
        action: input.action,
        module: input.module,
        recordId: input.recordId ?? null,
        recordType: input.recordType ?? null,
        description: input.description ?? null,
        metadata: sanitizeMetadata(input.metadata),
    });
}

async function readAuditFunctionResponse(response?: Response): Promise<unknown> {
    if (!response) return null;
    try {
        const contentType = response.headers.get('Content-Type') ?? '';
        if (contentType.includes('application/json')) {
            return await response.clone().json();
        }
        return await response.clone().text();
    } catch (error) {
        logError('Failed to read audit Edge Function error response', error);
        return null;
    }
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
    if (!metadata) return {};

    const safe: Record<string, unknown> = {};
    const allowedKeys = new Set([
        'source',
        'status',
        'result',
        'category',
        'mode',
        'action_scope',
        'count',
        'patient_id',
        'consultation_id',
        'initial_consultation_id',
        'labrequest_id',
        'labresult_id',
        'prescription_id',
        'followup_id',
        'profile_id',
        'name_updated',
    ]);

    Object.entries(metadata).forEach(([key, value]) => {
        if (!allowedKeys.has(key)) return;
        if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
            safe[key] = value;
        }
    });

    return safe;
}
