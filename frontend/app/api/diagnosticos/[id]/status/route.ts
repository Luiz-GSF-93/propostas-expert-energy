import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  asRecord,
  normalizeStatus,
  buildAuditMetadata,
  statusActionName,
} from '@/lib/diagnostico/audit';
import { requireApiUser } from '@/lib/auth/require-api-user';
import { canChangeDiagnosticStatus, diagnosticPermissionMessage } from '@/lib/auth/diagnostico-permissions';
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

async function findRevisionId(diagnosticId: string, revisionNumber?: number | null) {
  if (!revisionNumber) return null;

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('diagnostic_revisions')
      .select('id')
      .eq('diagnostic_id', diagnosticId)
      .eq('revision_number', revisionNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[diagnostic_revisions] lookup ignorado:', error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.warn('[diagnostic_revisions] lookup erro ignorado:', error);
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

export async function PATCH(
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

    if (!isDbStatus(payloadBody.status)) {
      return NextResponse.json(
        { error: invalidStatusMessage() },
        { status: 400 }
      );
    }

    const nextStatus = normalizeStatus(payloadBody.status);

    if (!canChangeDiagnosticStatus(auth.user, nextStatus)) {
      return NextResponse.json(
        { error: diagnosticPermissionMessage(nextStatus) },
        { status: 403 }
      );
    }

    const note =
      typeof payloadBody.note === 'string' && payloadBody.note.trim()
        ? payloadBody.note.trim()
        : `Status alterado para ${nextStatus}`;

    const origin =
      typeof payloadBody.origin === 'string' && payloadBody.origin.trim()
        ? payloadBody.origin.trim()
        : 'frontend_status';

    const actorEmail =
      typeof payloadBody.actor_email === 'string' && payloadBody.actor_email.trim()
        ? payloadBody.actor_email.trim()
        : null;

    const { data: existing, error: existingError } = await findDiagnosticByIdOrCode(id);

    if (existingError) {
      console.error('[PATCH /api/diagnosticos/:id/status] erro find:', existingError);
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

    if (existing.status === nextStatus) {
      return NextResponse.json(existing, { status: 200 });
    }

    const actorUserId =
      payloadBody.updated_by ??
      payloadBody.reviewed_by ??
      existing.updated_by ??
      existing.created_by ??
      null;

    const supabase = getSupabase();

    const { data: updated, error: updateError } = await supabase
      .from('diagnostics')
      .update({
        status: nextStatus,
        updated_by: actorUserId,
        reviewed_by:
          nextStatus === 'revisado' || nextStatus === 'aprovado'
            ? payloadBody.reviewed_by ?? existing.reviewed_by ?? actorUserId
            : existing.reviewed_by ?? null,
      })
      .eq('id', existing.id)
      .select(DIAGNOSTIC_SELECT)
      .single();

    if (updateError) {
      console.error('[PATCH /api/diagnosticos/:id/status] erro update:', updateError);
      return NextResponse.json(
        { error: 'Falha ao atualizar status.' },
        { status: 500 }
      );
    }

    await tryInsertStatusHistory({
      diagnosticId: existing.id,
      fromStatus: existing.status,
      toStatus: nextStatus,
      note,
      changedBy: actorUserId,
    });

    const revisionId = await findRevisionId(
      existing.id,
      updated.current_revision ?? existing.current_revision
    );

    const action = statusActionName(nextStatus);

    await tryInsertAuditLog({
      diagnosticId: existing.id,
      revisionId,
      action,
      actorUserId,
      actorEmail,
      metadata: buildAuditMetadata({
        beforeRow: existing,
        afterRow: updated,
        origin,
        action,
        note,
      }),
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/diagnosticos/:id/status] erro fatal:', error);
    return NextResponse.json(
      { error: 'Erro interno ao atualizar status.' },
      { status: 500 }
    );
  }
}
