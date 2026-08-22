import { createClient } from '@supabase/supabase-js';

export type HtmlAuditAction =
  | 'visualizou_html_privado'
  | 'shell_html_carregado'
  | 'tentativa_copia_html'
  | 'tentativa_recorte_html'
  | 'menu_contexto_html'
  | 'tentativa_impressao_html'
  | 'tentativa_salvar_html'
  | 'atalho_copia_html'
  | 'atalho_impressao_html'
  | 'atalho_salvar_html';

type AuditUser = {
  id: string;
  email?: string | null;
};

type AuditInput = {
  request?: Request;
  user: AuditUser;
  action: HtmlAuditAction;
  diagnosticId?: string | null;
  metadata?: Record<string, unknown>;
};

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const AUDIT_TABLE_CANDIDATES = [
  'diagnostic_audit_log',
  'diagnostic_audit_logs',
  'diagnostic_audit',
];

function firstUuid(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(UUID_RE);
  return match?.[0] ?? null;
}

export function extractDiagnosticIdFromSources(
  ...sources: Array<string | null | undefined>
): string | null {
  for (const source of sources) {
    const found = firstUuid(source);
    if (found) return found;
  }
  return null;
}

function getClientIp(request?: Request): string | null {
  if (!request) return null;
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

function sanitizeMetadata(request: Request | undefined, metadata: Record<string, unknown> | undefined) {
  return {
    source: metadata?.source ?? 'energiapro_html_privado',
    method: metadata?.method ?? null,
    href: metadata?.href ?? null,
    referrer: metadata?.referrer ?? request?.headers.get('referer') ?? null,
    user_agent: request?.headers.get('user-agent') ?? null,
    ip: getClientIp(request),
    ...metadata,
  };
}

export async function logHtmlAuditEvent(input: AuditInput) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[html-audit] variáveis do Supabase ausentes; auditoria não persistida.');
    return { ok: false as const, reason: 'missing_env' };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const diagnosticId =
    input.diagnosticId ??
    extractDiagnosticIdFromSources(
      input.request?.url,
      input.request?.headers.get('referer'),
      typeof input.metadata?.referrer === 'string' ? input.metadata.referrer : null,
      typeof input.metadata?.href === 'string' ? input.metadata.href : null
    );

  const metadata = sanitizeMetadata(input.request, input.metadata);

  const payloadVariants = [
    {
      diagnostic_id: diagnosticId,
      action: input.action,
      actor_user_id: input.user.id,
      actor_email: input.user.email ?? null,
      metadata_json: metadata,
    },
    {
      diagnostic_id: diagnosticId,
      action: input.action,
      actor_user_id: input.user.id,
      actor_email: input.user.email ?? null,
      metadata: metadata,
    },
    {
      diagnostic_id: diagnosticId,
      event_type: input.action,
      actor_user_id: input.user.id,
      actor_email: input.user.email ?? null,
      metadata_json: metadata,
    },
    {
      action: input.action,
      actor_user_id: input.user.id,
      actor_email: input.user.email ?? null,
      metadata_json: metadata,
    },
    {
      event_type: input.action,
      actor_user_id: input.user.id,
      actor_email: input.user.email ?? null,
      metadata_json: metadata,
    },
  ];

  let lastError: string | null = null;

  for (const table of AUDIT_TABLE_CANDIDATES) {
    for (const payload of payloadVariants) {
      const cleaned = Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined)
      );

      const { error } = await supabase.from(table).insert(cleaned);

      if (!error) {
        return { ok: true as const, table, diagnosticId };
      }

      lastError = `${table}: ${error.message}`;
    }
  }

  console.warn('[html-audit] falha ao persistir auditoria:', lastError);
  return { ok: false as const, reason: 'insert_failed', error: lastError };
}
