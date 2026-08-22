import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
export type DbStatus =
  | 'rascunho'
  | 'em_revisao'
  | 'revisado'
  | 'aprovado'
  | 'arquivado';

export type DiagnosticApiRecord = {
  id: string;
  code: string | null;
  title: string | null;
  company_name: string | null;
  cnpj: string | null;
  segment: string | null;
  market: string | null;
  version_label: string | null;
  status: DbStatus;
  payload_json: Record<string, unknown> | null;
  result_json: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  reviewed_by: string | null;
  current_revision: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PaginatedDiagnosticsResponse = {
  items: DiagnosticApiRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DiagnosticStatusHistoryRecord = {
  id?: string;
  diagnostic_id?: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  actor_email?: string | null;
  actor_user_id?: string | null;
  changed_by?: string | null;
  changed_at?: string | null;
};

export type DiagnosticRevisionRecord = {
  id?: string;
  diagnostic_id?: string;
  revision_number?: number | null;
  change_note?: string | null;
  payload_json?: Record<string, unknown> | null;
  result_json?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string | null;
};

export type DiagnosticAuditRecord = {
  id?: string;
  diagnostic_id?: string;
  revision_id?: string | null;
  action?: string | null;
  actor_email?: string | null;
  actor_user_id?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type DiagnosticAuditLogRecord = DiagnosticAuditRecord;

export type DiagnosticHistoryResponse = {
  diagnostic: DiagnosticApiRecord | null;
  statusHistory: DiagnosticStatusHistoryRecord[];
  revisions: DiagnosticRevisionRecord[];
  auditLog: DiagnosticAuditRecord[];
};

export class DiagnosticApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'DiagnosticApiError';
    this.status = status;
    this.body = body;
  }
}

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

function waitForRestoredSession(
  client: SupabaseClient,
  timeoutMs = 2000
): Promise<Session | null> {
  return new Promise((resolve) => {
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.unsubscribe();
      resolve(null);
    }, timeoutMs);

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (settled) return;
      if (!session?.access_token) return;

      settled = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
      resolve(session);
    });
  });
}

async function getBrowserAccessToken(): Promise<string | null> {
  try {
    const client = getSupabaseBrowserClient();
    if (!client) return null;

    const first = await client.auth.getSession();
    if (first.data.session?.access_token) {
      return first.data.session.access_token;
    }

    const restored = await waitForRestoredSession(client);
    if (restored?.access_token) {
      return restored.access_token;
    }

    const second = await client.auth.getSession();
    return second.data.session?.access_token ?? null;
  } catch (error) {
    console.warn('[diagnostico-api] Falha ao obter access token:', error);
    return null;
  }
}

function buildApiUrl(path: string, query?: QueryParams): string {
  const url = new URL(path, 'http://localhost');

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return `${url.pathname}${url.search}`;
}

async function apiFetch(path: string, init?: RequestInit, query?: QueryParams): Promise<Response> {
  async function doFetch(forceRetry = false): Promise<Response> {
    const headers = new Headers(init?.headers ?? {});

    if (!headers.has('Content-Type') && init?.body) {
      headers.set('Content-Type', 'application/json');
    }

    if (!headers.has('Authorization')) {
      const accessToken = await getBrowserAccessToken();
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }

    const response = await fetch(buildApiUrl(path, query), {
      ...init,
      headers,
      cache: 'no-store',
    });

    if (
      response.status === 401 &&
      !forceRetry &&
      !init?.headers
    ) {
      return doFetch(true);
    }

    return response;
  }

  return doFetch(false);
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const body = await readResponseBody(response);

  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `Falha na requisição (${response.status}).`;

    throw new DiagnosticApiError(message, response.status, body);
  }

  return body as T;
}

function normalizePaginatedResponse(payload: unknown): PaginatedDiagnosticsResponse {
  if (Array.isArray(payload)) {
    return {
      items: payload as DiagnosticApiRecord[],
      page: 1,
      pageSize: payload.length || 10,
      total: payload.length,
      totalPages: 1,
    };
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'items' in payload &&
    Array.isArray((payload as { items: unknown }).items)
  ) {
    const data = payload as Partial<PaginatedDiagnosticsResponse>;
    return {
      items: Array.isArray(data.items) ? (data.items as DiagnosticApiRecord[]) : [],
      page: typeof data.page === 'number' && data.page > 0 ? data.page : 1,
      pageSize: typeof data.pageSize === 'number' && data.pageSize > 0 ? data.pageSize : 10,
      total: typeof data.total === 'number' && data.total >= 0 ? data.total : 0,
      totalPages: typeof data.totalPages === 'number' && data.totalPages > 0 ? data.totalPages : 1,
    };
  }

  return {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  };
}

export async function listDiagnosticsPaginatedApi(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: DbStatus | 'todos';
}): Promise<PaginatedDiagnosticsResponse> {
  const response = await apiFetch(
    '/api/diagnosticos',
    { method: 'GET' },
    {
      paged: 1,
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 10,
      search: params?.search ?? '',
      status: params?.status ?? 'todos',
    }
  );

  const payload = await handleResponse<unknown>(response);
  return normalizePaginatedResponse(payload);
}

export async function listDiagnosticsApi(): Promise<DiagnosticApiRecord[]> {
  const result = await listDiagnosticsPaginatedApi({
    page: 1,
    pageSize: 200,
  });
  return result.items;
}

export async function getDiagnosticApi(idOrCode: string): Promise<DiagnosticApiRecord> {
  const response = await apiFetch(`/api/diagnosticos/${encodeURIComponent(idOrCode)}`, {
    method: 'GET',
  });

  return handleResponse<DiagnosticApiRecord>(response);
}

export async function createDiagnosticApi(input: {
  payload?: Record<string, unknown>;
  payload_json?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  result_json?: Record<string, unknown> | null;
  status?: DbStatus;
  note?: string;
  origin?: string;
  actor_email?: string;
  actor_user_id?: string;
}): Promise<DiagnosticApiRecord> {
  const response = await apiFetch('/api/diagnosticos', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return handleResponse<DiagnosticApiRecord>(response);
}

export async function updateDiagnosticApi(
  idOrCode: string,
  input: {
    payload?: Record<string, unknown>;
    payload_json?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
    result_json?: Record<string, unknown> | null;
    note?: string;
    origin?: string;
    actor_email?: string;
    actor_user_id?: string;
  }
): Promise<DiagnosticApiRecord> {
  const response = await apiFetch(`/api/diagnosticos/${encodeURIComponent(idOrCode)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

  return handleResponse<DiagnosticApiRecord>(response);
}

export async function updateDiagnosticStatusApi(
  idOrCode: string,
  input: {
    status: DbStatus;
    note?: string;
    origin?: string;
    actor_email?: string;
    actor_user_id?: string;
  }
): Promise<DiagnosticApiRecord> {
  const response = await apiFetch(`/api/diagnosticos/${encodeURIComponent(idOrCode)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return handleResponse<DiagnosticApiRecord>(response);
}

export async function getDiagnosticHistoryApi(idOrCode: string): Promise<DiagnosticHistoryResponse> {
  const response = await apiFetch(`/api/diagnosticos/${encodeURIComponent(idOrCode)}/history`, {
    method: 'GET',
  });

  return handleResponse<DiagnosticHistoryResponse>(response);
}
