'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { requestEnergiaExport, sendEnergiaImport } from '@/lib/diagnostico-bridge';
import {
  getDiagnosticApi,
  getDiagnosticHistoryApi,
  updateDiagnosticApi,
  updateDiagnosticStatusApi,
  type DiagnosticApiRecord as ApiDiagnosticRecord,
  type DiagnosticHistoryResponse,
  type DiagnosticStatusHistoryRecord,
  type DiagnosticRevisionRecord,
  type DiagnosticAuditLogRecord,
} from '@/lib/diagnostico-api';
import type { DiagnosticApiRecord } from '@/lib/diagnostico-summary';

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function number(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function dateTime(value?: string | null) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status?: string | null) {
  return {
    rascunho: 'Rascunho',
    em_revisao: 'Em revisão',
    revisado: 'Revisado',
    aprovado: 'Aprovado',
    arquivado: 'Arquivado',
    '—': '—',
  }[status || '—'] || status || '—';
}

function actionLabel(action?: string | null) {
  switch (action) {
    case 'visualizou_html_privado':
      return 'Visualização do HTML privado';
    case 'shell_html_carregado':
      return 'HTML privado carregado';
    case 'tentativa_copia_html':
    case 'atalho_copia_html':
      return 'Tentativa de cópia do HTML';
    case 'tentativa_recorte_html':
      return 'Tentativa de recorte do HTML';
    case 'menu_contexto_html':
      return 'Abertura do menu de contexto no HTML';
    case 'tentativa_impressao_html':
    case 'atalho_impressao_html':
      return 'Tentativa de impressão do HTML';
    case 'tentativa_salvar_html':
    case 'atalho_salvar_html':
      return 'Tentativa de salvar o HTML';
    default:
      break;
  }

  if (!action) return '—';

  switch (action) {
    case 'create':
      return 'Criação';
    case 'update':
      return 'Atualização';
    case 'status_change':
      return 'Mudança de status';
    case 'revision':
      return 'Revisão';
    case 'history':
      return 'Histórico';
    default:
      return action.replaceAll('_', ' ');
  }
}

type DbStatus = 'rascunho' | 'em_revisao' | 'revisado' | 'aprovado' | 'arquivado';

type EnergiaUiState = {
  fields?: Array<Record<string, unknown>>;
  globals?: Record<string, unknown>;
  tables?: Array<Record<string, unknown>>;
  storage?: {
    local?: Record<string, string>;
    session?: Record<string, string>;
  };
  metricChips?: string[];
  loadLineMetrics?: string;
  capturedAt?: string;
};

type EnergiaUiApi = {
  exportState?: () => EnergiaUiState;
  importState?: (state: EnergiaUiState) => void;
  refresh?: () => void;
};

function getEnergiaUiApi(iframe: HTMLIFrameElement | null): EnergiaUiApi | null {
  const energiaWindow = iframe?.contentWindow as (Window & {
    __ENERGIAPRO_UI__?: EnergiaUiApi;
  }) | null;

  return energiaWindow?.__ENERGIAPRO_UI__ ?? null;
}


function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  return {};
}

function safeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRecord(item: ApiDiagnosticRecord): DiagnosticApiRecord {
  const payload = asObject(item.payload_json);
  const result = asObject(item.result_json || payload.result);
  const input = asObject(payload.input);
  const meta = asObject(payload.meta);
  const demRes = asObject(result.demRes);
  const thdRes = asObject(result.thdRes);
  const equipComparativo = asObject(result.EquipComparativo);
  const equipItems = Array.isArray(equipComparativo.items) ? equipComparativo.items : [];

  const companyName =
    input.razao ||
    item.company_name ||
    item.title ||
    'Empresa sem nome';

  const demandKw = safeNumber(input.dc || input.dcP || demRes.dc_atual_p);
  const monthlyConsumptionKwh = safeNumber(result.E_mes) * 1000;

  const fBase = safeNumber(result.F_base);
  const fCen = safeNumber(result.F_cen);
  const ecoAnual = safeNumber(result.eco_anual);

  const baselineScenarioAnnual = fBase > 0 || fCen > 0 ? Math.max(0, fBase - fCen) : 0;
  const potentialGainAnnual = ecoAnual > 0 ? ecoAnual : baselineScenarioAnnual;

  const estimatedSavingsValue =
    potentialGainAnnual > 0 ? potentialGainAnnual / 12 : 0;

  const estimatedSavingsPercent =
    fBase > 0 && potentialGainAnnual > 0
      ? (potentialGainAnnual / (fBase * 12)) * 100
      : 0;

  const paybackMonths = safeNumber(result.payback) * 12;

  const thermalReductionFromItems = equipItems.reduce((sum, row) => {
    const current = asObject(row);
    return sum + safeNumber(current.economia_anual_num);
  }, 0);

  const thermalReductionAnnual = safeNumber(
    result.thermalReductionAnnual ??
      result.reducao_termica_anual ??
      result.ganho_termico_anual ??
      result.thermRed_anual ??
      equipComparativo.gain_total ??
      thermalReductionFromItems
  );

  const demandOptimizationAnnual = safeNumber(
    result.demandOptimizationAnnual ??
      result.demanda_otima_anual ??
      result.ganho_demanda_anual ??
      result.demOpt_anual ??
      demRes.ganho_anual_estimado ??
      demRes.ganho_anual ??
      demRes.ganho_estimado_anual
  );

  const powerQualityAnnual = safeNumber(
    result.powerQualityAnnual ??
      result.qee_thd_reativo_anual ??
      result.ganho_qee_anual ??
      thdRes.total_RS_ano ??
      thdRes.total_rs_ano ??
      thdRes.ganho_anual_estimado
  );

  const loadProfileGainText = String(
    meta.loadLineMetrics ??
      meta.recGain ??
      result.loadLineMetrics ??
      result.recGain ??
      ''
  );

  const summary = {
    companyName,
    demandKw,
    monthlyConsumptionKwh,
    estimatedSavingsValue,
    estimatedSavingsPercent,
    paybackMonths,
    baselineScenarioAnnual,
    thermalReductionAnnual,
    demandOptimizationAnnual,
    powerQualityAnnual,
    potentialGainAnnual,
    loadProfileGainText,
  };

  return {
    ...(item as any),
    payload,
    result,
    summary,
    companyName,
    versionLabel: item.version_label ?? null,
    currentRevision: item.current_revision ?? null,
    createdBy: item.created_by ?? null,
    updatedBy: item.updated_by ?? null,
    reviewedBy: item.reviewed_by ?? null,
    isActive: item.is_active ?? null,
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
  } as unknown as DiagnosticApiRecord;
}

export default function DiagnosticoDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [record, setRecord] = useState<DiagnosticApiRecord | null>(null);
  const [message, setMessage] = useState('Carregando diagnóstico...');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<DiagnosticHistoryResponse | null>(null);

  async function reload() {
    if (!id) return;

    try {
      setLoading(true);
      setHistoryLoading(true);

      const [apiItem, historyResponse] = await Promise.all([
        getDiagnosticApi(id),
        getDiagnosticHistoryApi(id),
      ]);

      const item = normalizeRecord(apiItem);
      setRecord(item);
      setHistory(historyResponse);
      setMessage(`Diagnóstico ${item.code || item.id} carregado.`);
    } catch (error) {
      console.error(error);
      setRecord(null);
      setHistory(null);
      setMessage(error instanceof Error ? error.message : 'Diagnóstico não encontrado.');
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [id]);

    async function handleFrameLoad() {
    if (!record) return;
    try {
      await sendEnergiaImport(iframeRef.current, record.payload);

      const energiaUiApi = getEnergiaUiApi(iframeRef.current);
      const payloadMeta = asObject(asObject(record.payload).meta);
      const savedUiState = asObject(payloadMeta.energiapro_ui_state);

      if (energiaUiApi?.importState && Object.keys(savedUiState).length) {
        energiaUiApi.importState(savedUiState as EnergiaUiState);
      }

      energiaUiApi?.refresh?.();

      setMessage(`Diagnóstico ${record.code || record.id} carregado dentro do EnergiaPro.`);
    } catch (error) {
      console.error(error);
      setMessage('Falha ao enviar os dados salvos para o HTML do EnergiaPro.');
    }
  }

    async function handleSaveCurrent() {
    if (!record) return;

    try {
      setSaving(true);
      setMessage('Exportando alterações do HTML...');
      const rawPayload = await requestEnergiaExport(iframeRef.current);
      const energiaUiApi = getEnergiaUiApi(iframeRef.current);
      const uiState = energiaUiApi?.exportState?.();

      const rawPayloadObject = asObject(rawPayload);
      const rawMeta = asObject(rawPayloadObject.meta);
      const currentMeta = asObject(asObject(record.payload).meta);

      const mergedPayload = {
        ...rawPayloadObject,
        meta: {
          ...rawMeta,
          energiapro_ui_state:
            uiState ??
            rawMeta.energiapro_ui_state ??
            currentMeta.energiapro_ui_state ??
            null,
          loadLineMetrics:
            (uiState && typeof uiState.loadLineMetrics === 'string' && uiState.loadLineMetrics.trim()) ||
            (typeof rawMeta.loadLineMetrics === 'string' && rawMeta.loadLineMetrics.trim()) ||
            (typeof currentMeta.loadLineMetrics === 'string' && currentMeta.loadLineMetrics.trim()) ||
            (typeof rawMeta.recGain === 'string' && rawMeta.recGain.trim()) ||
            (typeof currentMeta.recGain === 'string' && currentMeta.recGain.trim()) ||
            '',
          recGain:
            (uiState && typeof uiState.loadLineMetrics === 'string' && uiState.loadLineMetrics.trim()) ||
            (typeof rawMeta.recGain === 'string' && rawMeta.recGain.trim()) ||
            (typeof currentMeta.recGain === 'string' && currentMeta.recGain.trim()) ||
            '',
        },
      };

      const savedApi = await updateDiagnosticApi(record.id, {
        payload: mergedPayload,
        note: 'Atualização pela tela de detalhe',
      });

      const saved = normalizeRecord(savedApi);
      setRecord(saved);
      setMessage(`Diagnóstico ${saved.code || saved.id} atualizado com sucesso.`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar diagnóstico.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusOnly(nextStatus: DbStatus) {
    if (!record) return;

    try {
      const updatedApi = await updateDiagnosticStatusApi(record.id, {
        status: nextStatus,
        note: `Status alterado para ${nextStatus}`,
        origin: 'frontend_status',
      });

      const updated = normalizeRecord(updatedApi);
      setRecord(updated);
      setMessage(`Status alterado para ${statusLabel(updated.status || nextStatus)}.`);
      await reload();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Falha ao alterar status.');
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-500">Carregando diagnóstico...</p>
        </div>
      </main>
    );
  }

  if (!record) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Diagnóstico não encontrado</h1>
          <p className="mt-3 text-sm text-slate-600">
            {message || 'O ID informado não existe no Supabase ou você está abrindo um teste antigo que não foi migrado.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/diagnostico"
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Voltar à lista
            </Link>
            <Link
              href="/dashboard"
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const summary = record.summary;
  const statusHistory = history?.statusHistory ?? [];
  const revisions = history?.revisions ?? [];
  const auditLog = history?.auditLog ?? [];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                Diagnóstico EnergiaPro
              </p>
              <h1 className="mt-2 text-3xl font-bold">{summary.companyName}</h1>
              <p className="mt-2 text-sm text-emerald-50">
                ID {record.code || record.id} • Status atual: {statusLabel(record.status)}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"
              >
                Voltar ao dashboard
              </Link>
              <Link
                href="/diagnostico"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"
              >
                Lista de diagnósticos
              </Link>
              <button
                onClick={handleSaveCurrent}
                disabled={saving}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Resumo</h2>

              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <span>Empresa</span>
                  <strong>{summary.companyName}</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Demanda</span>
                  <strong>{number(summary.demandKw)} kW</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Consumo mensal</span>
                  <strong>{number(summary.monthlyConsumptionKwh)} kWh</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Economia estimada</span>
                  <strong>{currency(summary.estimatedSavingsValue)}</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Economia %</span>
                  <strong>{number(summary.estimatedSavingsPercent)}%</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Payback</span>
                  <strong>{number(summary.paybackMonths)} meses</strong>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <h3 className="text-sm font-bold text-emerald-800">Potencial de ganho</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-4">
                    <span>Potencial de ganho/ano</span>
                    <strong>{currency(summary.potentialGainAnnual)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Redução térmica/ano</span>
                    <strong>{currency(summary.thermalReductionAnnual)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Demanda ótima/ano</span>
                    <strong>{currency(summary.demandOptimizationAnnual)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>QEE / reativo / THD / ano</span>
                    <strong>{currency(summary.powerQualityAnnual)}</strong>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span>Ganho FC / oscilação</span>
                    <strong className="max-w-[160px] text-right">
                      {summary.loadProfileGainText || '—'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Ações de status</h2>
              <div className="mt-4 grid gap-2">
                <button onClick={() => handleStatusOnly('rascunho')} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                  Marcar como rascunho
                </button>
                <button onClick={() => handleStatusOnly('em_revisao')} className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-200">
                  Enviar para revisão
                </button>
                <button onClick={() => handleStatusOnly('revisado')} className="rounded-2xl bg-sky-100 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-200">
                  Marcar como revisado
                </button>
                <button onClick={() => handleStatusOnly('aprovado')} className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-200">
                  Aprovar
                </button>
                <button onClick={() => handleStatusOnly('arquivado')} className="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-200">
                  Arquivar
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
              {message}
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <iframe
              ref={iframeRef}
              src="/energiapro/index.html"
              title={`EnergiaPro ${record.id}`}
              onLoad={handleFrameLoad}
              className="h-[85vh] w-full"
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Histórico de status</h2>
              <span className="text-xs text-slate-500">
                {historyLoading ? 'Carregando...' : `${statusHistory.length} evento(s)`}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {statusHistory.length ? (
                statusHistory.map((item: DiagnosticStatusHistoryRecord) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-slate-900">
                        {statusLabel(item.from_status || '—')} → {statusLabel(item.to_status)}
                      </strong>
                      <span className="text-xs text-slate-500">{dateTime(item.changed_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.note || 'Sem observação.'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Alterado por: {item.actor_email || item.actor_user_id || '—'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Nenhum histórico de status disponível.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Revisões</h2>
              <span className="text-xs text-slate-500">
                {historyLoading ? 'Carregando...' : `${revisions.length} revisão(ões)`}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {revisions.length ? (
                revisions.map((item: DiagnosticRevisionRecord) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-slate-900">Revisão #{item.revision_number}</strong>
                      <span className="text-xs text-slate-500">{dateTime(item.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.change_note || 'Sem descrição.'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Criado por: {item.created_by || '—'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Nenhuma revisão encontrada.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Auditoria</h2>
              <span className="text-xs text-slate-500">
                {historyLoading ? 'Carregando...' : `${auditLog.length} ação(ões)`}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {auditLog.length ? (
                auditLog.map((item: DiagnosticAuditLogRecord) => {
                  const metadata = asObject(item.metadata);
                  const changedFields = Array.isArray(metadata.changed_fields)
                    ? metadata.changed_fields
                    : [];

                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-slate-900">
                          {actionLabel(item.action)}
                        </strong>
                        <span className="text-xs text-slate-500">{dateTime(item.created_at)}</span>
                      </div>

                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        <p>
                          <span className="font-medium text-slate-700">Usuário:</span>{' '}
                          {item.actor_email || item.actor_user_id || '—'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Origem:</span>{' '}
                          {metadata.origin || '—'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">De → Para:</span>{' '}
                          {statusLabel(metadata.from_status || '—')} → {statusLabel(metadata.to_status || '—')}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Campos alterados:</span>{' '}
                          {changedFields.length ? changedFields.join(', ') : '—'}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">Nenhuma ação de auditoria encontrada.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
