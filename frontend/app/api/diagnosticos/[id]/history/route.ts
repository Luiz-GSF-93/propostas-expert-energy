import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireApiUser } from '@/lib/auth/require-api-user';
import { getDiagnosticRole } from '@/lib/auth/diagnostico-permissions';

export const dynamic = 'force-dynamic';

const HTML_AUDIT_ACTIONS = new Set([
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

function getAuditActionName(item: any) {
  return String(item?.action ?? item?.event_type ?? '').trim();
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Variáveis do Supabase não configuradas.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function resolveDiagnostic(idOrCode: string) {
  const supabase = getSupabase();

  if (isUuid(idOrCode)) {
    const byId = await supabase
      .from('diagnostics')
      .select('id, code, title, company_name, status, current_revision')
      .eq('id', idOrCode)
      .maybeSingle();

    if (byId.error) return { data: null, error: byId.error };
    if (byId.data) return { data: byId.data, error: null };
  }

  const byCode = await supabase
    .from('diagnostics')
    .select('id, code, title, company_name, status, current_revision')
    .eq('code', idOrCode)
    .maybeSingle();

  return { data: byCode.data, error: byCode.error };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(_request);
  if (auth.response) {
    return auth.response;
  }

  const diagnosticUserRole = getDiagnosticRole(auth.user ?? null);
  const canViewHtmlAudit =
    diagnosticUserRole === 'admin' || diagnosticUserRole === 'reviewer';

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do diagnóstico é obrigatório.' },
        { status: 400 }
      );
    }

    const { data: diagnostic, error: findError } = await resolveDiagnostic(id);

    if (findError) {
      console.error('[GET /api/diagnosticos/:id/history] erro find:', findError);
      return NextResponse.json(
        { error: 'Falha ao localizar diagnóstico.' },
        { status: 500 }
      );
    }

    if (!diagnostic) {
      return NextResponse.json(
        { error: 'Diagnóstico não encontrado.' },
        { status: 404 }
      );
    }

    const supabase = getSupabase();

    const [statusHistoryRes, revisionsRes, auditLogRes] = await Promise.all([
      supabase
        .from('diagnostic_status_history')
        .select('id, diagnostic_id, from_status, to_status, note, changed_by, changed_at')
        .eq('diagnostic_id', diagnostic.id)
        .order('changed_at', { ascending: false }),
      supabase
        .from('diagnostic_revisions')
        .select('id, diagnostic_id, revision_number, payload_json, result_json, change_note, created_by, created_at')
        .eq('diagnostic_id', diagnostic.id)
        .order('revision_number', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('diagnostic_audit_log')
        .select('id, diagnostic_id, revision_id, action, actor_user_id, actor_email, metadata, created_at')
        .eq('diagnostic_id', diagnostic.id)
        .order('created_at', { ascending: false }),
    ]);

    if (statusHistoryRes.error) {
      console.error('[history] statusHistory error:', statusHistoryRes.error);
      return NextResponse.json(
        { error: 'Falha ao carregar histórico de status.' },
        { status: 500 }
      );
    }

    if (revisionsRes.error) {
      console.error('[history] revisions error:', revisionsRes.error);
      return NextResponse.json(
        { error: 'Falha ao carregar revisões.' },
        { status: 500 }
      );
    }

    if (auditLogRes.error) {
      console.error('[history] auditLog error:', auditLogRes.error);
      return NextResponse.json(
        { error: 'Falha ao carregar auditoria.' },
        { status: 500 }
      );
    }

    const auditLogFiltered = (auditLogRes.data ?? []).filter((item: any) => {
      const action = getAuditActionName(item);
      return canViewHtmlAudit || !HTML_AUDIT_ACTIONS.has(action);
    });

    return NextResponse.json(
      {
        diagnostic,
        statusHistory: statusHistoryRes.data ?? [],
        revisions: revisionsRes.data ?? [],
        auditLog: auditLogFiltered,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[GET /api/diagnosticos/:id/history] erro fatal:', error);
    return NextResponse.json(
      { error: 'Erro interno ao carregar histórico do diagnóstico.' },
      { status: 500 }
    );
  }
}
