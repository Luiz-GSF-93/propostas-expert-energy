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

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('diagnostics')
      .select(DIAGNOSTIC_SELECT)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[GET /api/diagnosticos] erro Supabase:', error);
      return NextResponse.json(
        { error: 'Falha ao listar diagnósticos.' },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (error) {
    console.error('[GET /api/diagnosticos] erro fatal:', error);
    return NextResponse.json(
      { error: 'Erro interno ao listar diagnósticos.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const body = await request.json().catch(() => null);
    const payloadBody = asRecord(body);

    const payloadJson = payloadBody.payload ?? null;
    const payloadRoot = asRecord(payloadJson);
    const resultJson = payloadBody.result ?? payloadRoot.result ?? null;

    if (!payloadJson) {
      return NextResponse.json(
        { error: 'Payload do diagnóstico é obrigatório.' },
        { status: 400 }
      );
    }

    const companyName = extractCompanyName(payloadJson);
    const cnpj = extractCnpj(payloadJson);
    const segment = extractSegment(payloadJson);
    const market = extractMarket(payloadJson);
    const versionLabel = extractVersionLabel(payloadJson);
    const status = normalizeStatus(payloadBody.status);
    const title =
      typeof payloadBody.title === 'string' && payloadBody.title.trim()
        ? payloadBody.title.trim()
        : buildTitle(companyName);

    const createdBy =
      typeof payloadBody.created_by === 'string' && payloadBody.created_by.trim()
        ? payloadBody.created_by.trim()
        : null;

    const actorEmail =
      typeof payloadBody.actor_email === 'string' && payloadBody.actor_email.trim()
        ? payloadBody.actor_email.trim()
        : null;

    const origin =
      typeof payloadBody.origin === 'string' && payloadBody.origin.trim()
        ? payloadBody.origin.trim()
        : 'frontend_novo';

    const note =
      typeof payloadBody.note === 'string' && payloadBody.note.trim()
        ? payloadBody.note.trim()
        : `Criação do diagnóstico com status ${status}`;

    const supabase = getSupabase();

    const insertData = {
      title,
      company_name: companyName,
      cnpj,
      segment,
      market,
      version_label: versionLabel,
      status,
      payload_json: payloadJson,
      result_json: resultJson,
      created_by: createdBy,
      updated_by: createdBy,
      reviewed_by: null,
      current_revision: 1,
      is_active: true,
    };

    const { data: created, error: createError } = await supabase
      .from('diagnostics')
      .insert(insertData)
      .select(DIAGNOSTIC_SELECT)
      .single();

    if (createError) {
      console.error('[POST /api/diagnosticos] erro create:', createError);
      return NextResponse.json(
        { error: 'Falha ao criar diagnóstico.' },
        { status: 500 }
      );
    }

    const createdRevision = await tryInsertRevision({
      diagnosticId: created.id,
      revisionNumber: 1,
      payloadJson,
      resultJson,
      changeNote: note,
      createdBy,
    });

    await tryInsertStatusHistory({
      diagnosticId: created.id,
      fromStatus: null,
      toStatus: status,
      note,
      changedBy: createdBy,
    });

    await tryInsertAuditLog({
      diagnosticId: created.id,
      revisionId: createdRevision?.id ?? null,
      action: 'create',
      actorUserId: createdBy,
      actorEmail,
      metadata: buildAuditMetadata({
        beforeRow: null,
        afterRow: created,
        origin,
        action: 'create',
        note,
      }),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[POST /api/diagnosticos] erro fatal:', error);
    return NextResponse.json(
      { error: 'Erro interno ao criar diagnóstico.' },
      { status: 500 }
    );
  }
}
