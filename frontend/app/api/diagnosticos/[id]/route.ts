import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  asRecord,
  normalizeStatus,
  extractCompanyName,
  extractCnpj,
  extractSegment,
  extractMarket,
  extractVersionLabel,
  buildTitle,
  buildAuditMetadata,
} from '@/lib/diagnostico/audit';
import { requireApiUser } from '@/lib/auth/require-api-user';
import { isDbStatus, invalidStatusMessage } from '@/lib/diagnostico/status';

export const dynamic = 'force-dynamic';

const DIAGNOSTIC_SELECT = `
  id,
  code,
  title,
  company_name,
  cnpj,
  segment,
  market,
  version_label,
  status,
  payload_json,
  result_json,
  created_by,
  updated_by,
  reviewed_by,
  current_revision,
  is_active,
  created_at,
  updated_at
`;

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

async function findDiagnosticByIdOrCode(idOrCode: string) {
  const supabase = getSupabase();

  if (isUuid(idOrCode)) {
    const byId = await supabase
      .from('diagnostics')
      .select(DIAGNOSTIC_SELECT)
      .eq('id', idOrCode)
      .maybeSingle();

    if (byId.error) {
      return { data: null, error: byId.error };
    }

    if (byId.data) {
      return { data: byId.data, error: null };
    }
  }

  const byCode = await supabase
    .from('diagnostics')
    .select(DIAGNOSTIC_SELECT)
    .eq('code', idOrCode)
    .maybeSingle();

  return { data: byCode.data, error: byCode.error };
}

async function tryInsertRevision(params: {
  diagnosticId: string;
  revisionNumber: number;
  payloadJson: unknown;
  resultJson: unknown;
  changeNote?: string | null;
  createdBy?: string | null;
}) {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('diagnostic_revisions')
      .insert({
        diagnostic_id: params.diagnosticId,
        revision_number: params.revisionNumber,
        payload_json: params.payloadJson,
        result_json: params.resultJson,
        change_note: params.changeNote ?? null,
        created_by: params.createdBy ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[diagnostic_revisions] insert ignorado:', error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('[diagnostic_revisions] erro ignorado:', error);
    return null;
  }
}

async function tryInsertStatusHistory(params: {
  diagnosticId: string;
  fromStatus?: string | null;
  toStatus: string;
  note?: string | null;
  changedBy?: string | null;
}) {
  try {
    const supabase = getSupabase();

    const { error } = await supabase.from('diagnostic_status_history').insert({
      diagnostic_id: params.diagnosticId,
      from_status: params.fromStatus ?? null,
      to_status: params.toStatus,
      note: params.note ?? null,
      changed_by: params.changedBy ?? null,
    });

    if (error) {
      console.warn('[diagnostic_status_history] insert ignorado:', error.message);
    }
  } catch (error) {
    console.warn('[diagnostic_status_history] erro ignorado:', error);
  }
}

async function tryInsertAuditLog(params: {
  diagnosticId: string;
  revisionId?: string | null;
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  metadata?: unknown;
}) {
  try {
    const supabase = getSupabase();

    const { error } = await supabase.from('diagnostic_audit_log').insert({
      diagnostic_id: params.diagnosticId,
      revision_id: params.revisionId ?? null,
      action: params.action,
      actor_user_id: params.actorUserId ?? null,
      actor_email: params.actorEmail ?? null,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.warn('[diagnostic_audit_log] insert ignorado:', error.message);
    }
  } catch (error) {
    console.warn('[diagnostic_audit_log] erro ignorado:', error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(_request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do diagnóstico é obrigatório.' },
        { status: 400 }
      );
    }

    const { data, error } = await findDiagnosticByIdOrCode(id);

    if (error) {
      console.error('[GET /api/diagnosticos/:id] erro Supabase:', error);
      return NextResponse.json(
        { error: 'Falha ao buscar diagnóstico.' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Diagnóstico não encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[GET /api/diagnosticos/:id] erro fatal:', error);
    return NextResponse.json(
      { error: 'Erro interno ao buscar diagnóstico.' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do diagnóstico é obrigatório.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const payloadBody = asRecord(body);

    const { data: existing, error: existingError } = await findDiagnosticByIdOrCode(id);

    if (existingError) {
      console.error('[PUT /api/diagnosticos/:id] erro ao localizar registro:', existingError);
      return NextResponse.json(
        { error: 'Falha ao localizar diagnóstico.' },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Diagnóstico não encontrado.' },
        { status: 404 }
      );
    }

    const payloadJson = payloadBody.payload ?? existing.payload_json ?? null;
    const resultJson =
      payloadBody.result ??
      asRecord(payloadJson).result ??
      existing.result_json ??
      null;

    if (
      Object.prototype.hasOwnProperty.call(payloadBody, 'status') &&
      payloadBody.status != null &&
      !isDbStatus(payloadBody.status)
    ) {
      return NextResponse.json(
        { error: invalidStatusMessage() },
        { status: 400 }
      );
    }

    const nextStatus = normalizeStatus(payloadBody.status ?? existing.status);
    const companyName = extractCompanyName(payloadJson, existing.company_name);
    const cnpj = extractCnpj(payloadJson, existing.cnpj);
    const segment = extractSegment(payloadJson, existing.segment);
    const market = extractMarket(payloadJson, existing.market);
    const versionLabel = extractVersionLabel(payloadJson, existing.version_label);
    const title = buildTitle(companyName, payloadBody.title ?? existing.title);

    const nextRevision =
      typeof existing.current_revision === 'number'
        ? existing.current_revision + 1
        : Number(existing.current_revision || 0) + 1 || 1;

    const origin =
      typeof payloadBody.origin === 'string' && payloadBody.origin.trim()
        ? payloadBody.origin.trim()
        : 'frontend_detalhe';

    const note =
      typeof payloadBody.note === 'string' && payloadBody.note.trim()
        ? payloadBody.note.trim()
        : 'Atualização do diagnóstico';

    const actorUserId =
      payloadBody.updated_by ?? existing.updated_by ?? existing.created_by ?? null;

    const actorEmail =
      typeof payloadBody.actor_email === 'string' && payloadBody.actor_email.trim()
        ? payloadBody.actor_email.trim()
        : null;

    const supabase = getSupabase();

    const { data: updated, error: updateError } = await supabase
      .from('diagnostics')
      .update({
        title,
        company_name: companyName,
        cnpj,
        segment,
        market,
        version_label: versionLabel,
        status: nextStatus,
        payload_json: payloadJson,
        result_json: resultJson,
        updated_by: actorUserId,
        reviewed_by:
          nextStatus === 'revisado' || nextStatus === 'aprovado'
            ? payloadBody.reviewed_by ?? existing.reviewed_by ?? actorUserId
            : existing.reviewed_by ?? null,
        current_revision: nextRevision,
        is_active:
          typeof payloadBody.is_active === 'boolean'
            ? payloadBody.is_active
            : existing.is_active ?? true,
      })
      .eq('id', existing.id)
      .select(DIAGNOSTIC_SELECT)
      .single();

    if (updateError) {
      console.error('[PUT /api/diagnosticos/:id] erro update:', updateError);
      return NextResponse.json(
        { error: 'Falha ao atualizar diagnóstico.' },
        { status: 500 }
      );
    }

    const createdRevision = await tryInsertRevision({
      diagnosticId: existing.id,
      revisionNumber: nextRevision,
      payloadJson,
      resultJson,
      changeNote: note,
      createdBy: actorUserId,
    });

    if (existing.status !== nextStatus) {
      await tryInsertStatusHistory({
        diagnosticId: existing.id,
        fromStatus: existing.status,
        toStatus: nextStatus,
        note,
        changedBy: actorUserId,
      });
    }

    await tryInsertAuditLog({
      diagnosticId: existing.id,
      revisionId: createdRevision?.id ?? null,
      action: 'update_payload',
      actorUserId,
      actorEmail,
      metadata: buildAuditMetadata({
        beforeRow: existing,
        afterRow: updated,
        origin,
        action: 'update_payload',
        note,
      }),
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error('[PUT /api/diagnosticos/:id] erro fatal:', error);
    return NextResponse.json(
      { error: 'Erro interno ao atualizar diagnóstico.' },
      { status: 500 }
    );
  }
}
