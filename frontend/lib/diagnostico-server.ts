import { NextRequest } from 'next/server';
import { getSupabaseAnonClient, getSupabaseServiceClient } from '@/lib/supabase-service';
import { mapDiagnosticDbRow } from '@/lib/diagnostico-summary';

const DB_ALLOWED_STATUS = new Set([
  'rascunho',
  'em_revisao',
  'revisado',
  'aprovado',
  'arquivado',
]);

function sanitizeStatus(status: string | undefined) {
  const normalized = String(status || '').trim().toLowerCase();

  const uiToDbMap: Record<string, string> = {
    draft: 'rascunho',
    review: 'em_revisao',
    approved: 'aprovado',
    rejected: 'arquivado',
    archived: 'arquivado',
    rascunho: 'rascunho',
    em_revisao: 'em_revisao',
    revisado: 'revisado',
    aprovado: 'aprovado',
    arquivado: 'arquivado',
  };

  const mapped = uiToDbMap[normalized] || normalized;
  return DB_ALLOWED_STATUS.has(mapped) ? mapped : 'rascunho';
}

function extractHeader(payload: any) {
  const input = payload?.input || {};
  const versionLabel =
    payload?.meta?.versionLabel ||
    payload?.versionLabel ||
    'EnergiaPro v1.6.14';

  const companyName = String(
    input?.razao || input?.companyName || input?.empresa || 'Empresa sem nome',
  ).trim();

  return {
    title: `Diagnóstico - ${companyName}`,
    company_name: companyName,
    cnpj: input?.cnpj || null,
    segment: input?.segmento || null,
    market: input?.mercado || null,
    version_label: versionLabel,
  };
}

export async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    throw new Error('Usuário não autenticado.');
  }

  const anon = getSupabaseAnonClient();
  const { data, error } = await anon.auth.getUser(token);

  if (error || !data?.user) {
    throw new Error('Não foi possível validar o usuário autenticado.');
  }

  return data.user;
}

export async function listDiagnosticsServer() {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('diagnostics')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapDiagnosticDbRow);
}

export async function getDiagnosticByIdServer(id: string) {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('diagnostics')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapDiagnosticDbRow(data);
}

export async function createDiagnosticServer(user: any, body: any) {
  const supabase = getSupabaseServiceClient();

  const payload = body?.payload || {};
  const result = body?.result || payload?.result || {};
  const status = sanitizeStatus(body?.status);
  const note = body?.note || 'Criação inicial do diagnóstico';
  const header = extractHeader(payload);

  const insertPayload = {
    title: header.title,
    company_name: header.company_name,
    cnpj: header.cnpj,
    segment: header.segment,
    market: header.market,
    version_label: header.version_label,
    status,
    payload_json: payload,
    result_json: result,
    created_by: user.id,
    updated_by: user.id,
    current_revision: 1,
    is_active: true,
  };

  const { data: created, error: createError } = await supabase
    .from('diagnostics')
    .insert(insertPayload)
    .select('*')
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  const now = new Date().toISOString();

  const { data: revision, error: revisionError } = await supabase
    .from('diagnostic_revisions')
    .insert({
      diagnostic_id: created.id,
      revision_number: 1,
      payload_json: payload,
      result_json: result,
      change_note: note,
      created_by: user.id,
      created_at: now,
    })
    .select('id')
    .single();

  if (revisionError) {
    throw new Error(revisionError.message);
  }

  const { error: statusError } = await supabase
    .from('diagnostic_status_history')
    .insert({
      diagnostic_id: created.id,
      from_status: null,
      to_status: status,
      note,
      changed_by: user.id,
      changed_at: now,
    });

  if (statusError) {
    throw new Error(statusError.message);
  }

  const { error: auditError } = await supabase
    .from('diagnostic_audit_log')
    .insert({
      diagnostic_id: created.id,
      revision_id: revision.id,
      action: 'create',
      actor_user_id: user.id,
      actor_email: user.email || null,
      metadata: {
        status,
        revision_number: 1,
      },
      created_at: now,
    });

  if (auditError) {
    throw new Error(auditError.message);
  }

  return mapDiagnosticDbRow(created);
}

export async function updateDiagnosticServer(id: string, user: any, body: any) {
  const supabase = getSupabaseServiceClient();

  const { data: current, error: currentError } = await supabase
    .from('diagnostics')
    .select('*')
    .eq('id', id)
    .single();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const payload = body?.payload || {};
  const result = body?.result || payload?.result || {};
  const note = body?.note || 'Atualização do diagnóstico';
  const header = extractHeader(payload);
  const nextRevision = Number(current.current_revision || 0) + 1;

  const updatePayload = {
    title: header.title,
    company_name: header.company_name,
    cnpj: header.cnpj,
    segment: header.segment,
    market: header.market,
    version_label: header.version_label,
    payload_json: payload,
    result_json: result,
    updated_by: user.id,
    current_revision: nextRevision,
  };

  const { data: updated, error: updateError } = await supabase
    .from('diagnostics')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  const now = new Date().toISOString();

  const { data: revision, error: revisionError } = await supabase
    .from('diagnostic_revisions')
    .insert({
      diagnostic_id: id,
      revision_number: nextRevision,
      payload_json: payload,
      result_json: result,
      change_note: note,
      created_by: user.id,
      created_at: now,
    })
    .select('id')
    .single();

  if (revisionError) {
    throw new Error(revisionError.message);
  }

  const { error: auditError } = await supabase
    .from('diagnostic_audit_log')
    .insert({
      diagnostic_id: id,
      revision_id: revision.id,
      action: 'update',
      actor_user_id: user.id,
      actor_email: user.email || null,
      metadata: {
        revision_number: nextRevision,
      },
      created_at: now,
    });

  if (auditError) {
    throw new Error(auditError.message);
  }

  return mapDiagnosticDbRow(updated);
}

export async function updateDiagnosticStatusServer(id: string, user: any, body: any) {
  const supabase = getSupabaseServiceClient();

  const { data: current, error: currentError } = await supabase
    .from('diagnostics')
    .select('*')
    .eq('id', id)
    .single();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const nextStatus = sanitizeStatus(body?.status);
  const note = body?.note || `Status alterado para ${nextStatus}`;
  const now = new Date().toISOString();

  const updatePayload: Record<string, any> = {
    status: nextStatus,
    updated_by: user.id,
  };

  if (nextStatus === 'em_revisao' || nextStatus === 'revisado' || nextStatus === 'aprovado') {
    updatePayload.reviewed_by = user.id;
  }

  const { data: updated, error: updateError } = await supabase
    .from('diagnostics')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: statusError } = await supabase
    .from('diagnostic_status_history')
    .insert({
      diagnostic_id: id,
      from_status: current.status,
      to_status: nextStatus,
      note,
      changed_by: user.id,
      changed_at: now,
    });

  if (statusError) {
    throw new Error(statusError.message);
  }

  const { error: auditError } = await supabase
    .from('diagnostic_audit_log')
    .insert({
      diagnostic_id: id,
      revision_id: null,
      action: 'status_change',
      actor_user_id: user.id,
      actor_email: user.email || null,
      metadata: {
        from_status: current.status,
        to_status: nextStatus,
        note,
      },
      created_at: now,
    });

  if (auditError) {
    throw new Error(auditError.message);
  }

  return mapDiagnosticDbRow(updated);
}
