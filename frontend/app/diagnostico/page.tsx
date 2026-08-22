'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  listDiagnosticsApi,
  type DiagnosticApiRecord as ApiDiagnosticRecord,
} from '@/lib/diagnostico-api';
import type { DiagnosticApiRecord } from '@/lib/diagnostico-summary';

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
  const payload = asObject((item as any).payload_json);
  const result = asObject((item as any).result_json || payload.result);
  const input = asObject(payload.input);
  const meta = asObject(payload.meta);
  const demRes = asObject(result.demRes);

  const companyName =
    input.razao ||
    (item as any).company_name ||
    (item as any).title ||
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

  const thermalReductionAnnual = safeNumber(
    result.thermalReductionAnnual ??
      result.reducao_termica_anual ??
      result.ganho_termico_anual ??
      result.thermRed_anual
  );

  const demandOptimizationAnnual = safeNumber(
    result.demandOptimizationAnnual ??
      result.demanda_otima_anual ??
      result.ganho_demanda_anual ??
      result.demOpt_anual
  );

  const powerQualityAnnual = safeNumber(
    result.powerQualityAnnual ??
      result.qee_thd_reativo_anual ??
      result.ganho_qee_anual
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
    loadProfileGainText: String(meta.recGain || ''),
  };

  return {
    ...(item as any),
    payload,
    result,
    summary,
    companyName,
    versionLabel: (item as any).version_label ?? null,
    currentRevision: (item as any).current_revision ?? null,
    createdBy: (item as any).created_by ?? null,
    updatedBy: (item as any).updated_by ?? null,
    reviewedBy: (item as any).reviewed_by ?? null,
    isActive: (item as any).is_active ?? null,
    createdAt: (item as any).created_at ?? null,
    updatedAt: (item as any).updated_at ?? null,
  } as unknown as DiagnosticApiRecord;
}


type DbStatus = 'rascunho' | 'em_revisao' | 'revisado' | 'aprovado' | 'arquivado';

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function number(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function statusLabel(status: string) {
  return {
    rascunho: 'Rascunho',
    em_revisao: 'Em revisão',
    revisado: 'Revisado',
    aprovado: 'Aprovado',
    arquivado: 'Arquivado',
  }[status] || status;
}

function statusClass(status: string) {
  return {
    rascunho: 'bg-slate-100 text-slate-700',
    em_revisao: 'bg-amber-100 text-amber-700',
    revisado: 'bg-sky-100 text-sky-700',
    aprovado: 'bg-emerald-100 text-emerald-700',
    arquivado: 'bg-rose-100 text-rose-700',
  }[status] || 'bg-slate-100 text-slate-700';
}

export default function DiagnosticoPage() {
  const [items, setItems] = useState<DiagnosticApiRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | DbStatus>('all');
  const [message, setMessage] = useState('Carregando diagnósticos...');

  async function reload() {
    try {
      setMessage('Carregando diagnósticos...');
      const data = await listDiagnosticsApi();
      const normalized = data.map(normalizeRecord);
      setItems(normalized);
      setMessage(normalized.length ? 'Diagnósticos carregados.' : 'Nenhum diagnóstico encontrado.');
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar diagnósticos.');
      setItems([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const okStatus = status === 'all' || item.status === status;
      const term = search.trim().toLowerCase();
      const okSearch =
        !term ||
        item.id.toLowerCase().includes(term) ||
        item.title.toLowerCase().includes(term) ||
        item.summary.companyName.toLowerCase().includes(term);

      return okStatus && okSearch;
    });
  }, [items, search, status]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        acc.count += 1;
        acc.savings += item.summary.estimatedSavingsValue || 0;
        acc.demand += item.summary.demandKw || 0;
        acc.potential += item.summary.potentialGainAnnual || 0;
        return acc;
      },
      { count: 0, savings: 0, demand: 0, potential: 0 },
    );
  }, [filtered]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                Diagnóstico EnergiaPro
              </p>
              <h1 className="mt-2 text-3xl font-bold">Central de diagnósticos</h1>
              <p className="mt-2 text-sm text-emerald-50">
                Persistência server-side via Supabase com auditoria, revisão e status.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20"
              >
                Voltar ao dashboard
              </Link>

              <Link
                href="/diagnostico/novo"
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow transition hover:bg-emerald-50"
              >
                Novo diagnóstico
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Diagnósticos filtrados</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{number(totals.count)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Economia estimada total</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{currency(totals.savings)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Demanda total</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{number(totals.demand)} kW</p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm text-emerald-700">Potencial de ganho/ano</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{currency(totals.potential)}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por empresa, título ou ID"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-emerald-500"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'all' | DbStatus)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
            >
              <option value="all">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="em_revisao">Em revisão</option>
              <option value="revisado">Revisado</option>
              <option value="aprovado">Aprovado</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {message}
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Demanda</th>
                  <th className="px-4 py-3">Consumo</th>
                  <th className="px-4 py-3">Economia</th>
                  <th className="px-4 py-3">Potencial/ano</th>
                  <th className="px-4 py-3">Payback</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      Nenhum diagnóstico encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.code || item.id}</td>
                      <td className="px-4 py-3">{item.summary.companyName}</td>
                      <td className="px-4 py-3">{number(item.summary.demandKw)} kW</td>
                      <td className="px-4 py-3">{number(item.summary.monthlyConsumptionKwh)} kWh</td>
                      <td className="px-4 py-3">{currency(item.summary.estimatedSavingsValue)}</td>
                      <td className="px-4 py-3">{currency(item.summary.potentialGainAnnual)}</td>
                      <td className="px-4 py-3">{number(item.summary.paybackMonths)} meses</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{new Date(item.updatedAt).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/diagnostico/${item.id}`}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                          >
                            Abrir
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
