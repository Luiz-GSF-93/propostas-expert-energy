import { requirePrivateHtmlUser } from '@/lib/auth/require-private-html-user';
import {
  extractDiagnosticIdFromSources,
  logHtmlAuditEvent,
  type HtmlAuditAction,
} from '@/lib/audit/html-private-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS = new Set<HtmlAuditAction>([
  'visualizou_html_privado',
  'shell_html_carregado',
  'tentativa_copia_html',
  'tentativa_recorte_html',
  'menu_contexto_html',
  'tentativa_impressao_html',
  'tentativa_salvar_html',
  'atalho_copia_html',
  'atalho_impressao_html',
  'atalho_salvar_html',
]);

export async function POST(request: Request) {
  const auth = await requirePrivateHtmlUser(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!ALLOWED_ACTIONS.has(action as HtmlAuditAction)) {
    return Response.json({ error: 'Evento de auditoria inválido.' }, { status: 400 });
  }

  const diagnosticId = extractDiagnosticIdFromSources(
    typeof body.diagnosticId === 'string' ? body.diagnosticId : null,
    typeof body.referrer === 'string' ? body.referrer : null,
    typeof body.href === 'string' ? body.href : null,
    request.headers.get('referer'),
    request.url
  );

  await logHtmlAuditEvent({
    request,
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
    action: action as HtmlAuditAction,
    diagnosticId,
    metadata: {
      source: 'api_audit_html_event',
      method: typeof body.method === 'string' ? body.method : null,
      href: typeof body.href === 'string' ? body.href : null,
      referrer: typeof body.referrer === 'string' ? body.referrer : null,
      diagnostic_id_hint:
        typeof body.diagnosticId === 'string' ? body.diagnosticId : null,
    },
  });

  return new Response(null, { status: 204 });
}
