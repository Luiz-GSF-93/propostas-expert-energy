"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import { supabase } from "@/lib/supabase";
const API_BASE = "/api/backend";

type PlanningSummary = {
  year: number;
  latest_batch?: {
    snapshot_id?: string;
    reference_year?: number;
    gross_revenue?: number;
    created_at?: string;
  } | null;
  integration_status?: {
    dre_ok?: boolean;
    snapshot_ok?: boolean;
    costs_ok?: boolean;
  };
  cards: {
    faturamento_anual: number;
    lucro_liquido_anual: number;
    margem_liquida_percent: number;
    reserva_caixa: number;
    roi_percent: number;
    clientes_recorrentes: number;
    ticket_medio: number;
    custo_fixo_mensal: number;
  };
  manual_indicators: {
    reference_year: number;
    recurring_clients: number;
    average_ticket: number;
    dark_mode: boolean;
    starts_collapsed: boolean;
    notes: string;
  };
  notices: string[];
};

type ManualIndicatorsForm = {
  reference_year: number;
  recurring_clients: string;
  average_ticket: string;
  dark_mode: boolean;
  starts_collapsed: boolean;
  notes: string;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(value: unknown): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatPercent(value: unknown): string {
  return `${toNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

async function authJson(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}?path=${encodeURIComponent(path)}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    credentials: "include",
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      json?.message ||
      json?.error ||
      `Erro HTTP ${response.status}`;
    throw new Error(message);
  }

  return json;
}

function DashboardCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-[clamp(1rem,1.45vw,1.65rem)] font-extrabold leading-[1.08] tracking-tight text-slate-900 [overflow-wrap:anywhere] dark:text-slate-50">
        {value}
      </div>
      {hint ? (
        <div className="mt-2 whitespace-pre-line text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export default function PlanejamentoPage() {
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summary, setSummary] = useState<PlanningSummary | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const requestIdRef = useRef(0);
  const [form, setForm] = useState<ManualIndicatorsForm>({
    reference_year: currentYear,
    recurring_clients: "0",
    average_ticket: "0",
    dark_mode: false,
    starts_collapsed: true,
    notes: "",
  });

  async function loadData(token: string) {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await authJson(`/api/finance/planejamento/resumo?year=${currentYear}`, token);

      if (requestId !== requestIdRef.current) return;

      setSummary(response);
      setForm({
        reference_year: Number(response?.manual_indicators?.reference_year || currentYear),
        recurring_clients: String(response?.manual_indicators?.recurring_clients ?? 0),
        average_ticket: String(response?.manual_indicators?.average_ticket ?? 0),
        dark_mode: Boolean(response?.manual_indicators?.dark_mode),
        starts_collapsed: response?.manual_indicators?.starts_collapsed !== false,
        notes: String(response?.manual_indicators?.notes || ""),
      });
      setShowPlaceholders(false);
      setError("");
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      const message = err instanceof Error ? err.message : "Erro ao carregar Planejamento.";
      setError(message.includes("403") ? "Acesso restrito a administradores." : message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let mounted = true;

    async function syncSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      setAccessToken(data?.session?.access_token || "");
      setAuthReady(true);
    }

    syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAccessToken(session?.access_token || "");
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!accessToken) {
      setLoading(false);
      setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
      return;
    }

    loadData(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, accessToken]);

  async function handleSaveIndicators() {
    if (!accessToken) {
      setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await authJson("/api/finance/planejamento/indicadores", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          reference_year: form.reference_year,
          recurring_clients: toNumber(form.recurring_clients),
          average_ticket: toNumber(form.average_ticket),
          dark_mode: form.dark_mode,
          starts_collapsed: form.starts_collapsed,
          notes: form.notes,
        }),
      });

      setSuccess("Indicadores do Planejamento salvos com sucesso.");
      await loadData(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar indicadores.");
    } finally {
      setSaving(false);
    }
  }

  const cards = useMemo(() => {
    if (!summary) return [];
    return [
      {
        label: "Faturamento Anual (R$)",
        value: formatMoney(summary.cards.faturamento_anual),
        hint: "Origem automática: API DRE > Receita Bruta",
      },
      {
        label: "Lucro Líquido Anual (R$)",
        value: formatMoney(summary.cards.lucro_liquido_anual),
        hint: "Origem automática: API DRE > Lucro Líquido",
      },
      {
        label: "Margem Líquida (%)",
        value: formatPercent(summary.cards.margem_liquida_percent),
        hint: "Origem automática: API DRE > Margem Líquida",
      },
      {
        label: "Reserva de Caixa",
        value: formatMoney(summary.cards.reserva_caixa),
        hint: "Origem automática: Fluxo de Caixa / snapshot financeiro",
      },
      {
        label: "ROI sobre o Capital (%)",
        value: formatPercent(summary.cards.roi_percent),
        hint: "Origem automática: API DRE > ROI",
      },
      {
        label: "Clientes Recorrentes",
        value: String(summary.cards.clientes_recorrentes || 0),
        hint: "Campo manual configurável neste Patch 1",
      },
      {
        label: "Ticket Médio (R$)",
        value: formatMoney(summary.cards.ticket_medio),
        hint: "Campo manual configurável neste Patch 1",
      },
      {
        label: "Custo Fixo Mensal",
        value: formatMoney(summary.cards.custo_fixo_mensal),
        hint: "Origem automática: API Custos > categoria Fixo",
      },
    ];
  }, [summary]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl animate-pulse space-y-4">
          <div className="h-10 w-72 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-36 rounded-3xl bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <FinanceModuleShell
      title="Planejamento"
      subtitle="Dashboard executivo e integração com DRE, Fluxo de Caixa e Custos."
    >
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600 dark:text-sky-400">
                Planejamento
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                Dashboard Executivo
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Tela base do módulo Planejamento. Demais blocos iniciam recolhidos neste Patch 1.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => accessToken ? loadData(accessToken) : setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.")}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Atualizar painel
              </button>
              <button
                onClick={() => setShowPlaceholders((prev) => !prev)}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-slate-100 dark:text-slate-900"
              >
                {showPlaceholders ? "Ocultar seções futuras" : "Expandir seções futuras"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              {success}
            </div>
          ) : null}

          {summary?.notices?.length ? (
            <div className="mt-4 space-y-2">
              {summary.notices.map((notice, index) => (
                <div
                  key={`${notice}-${index}`}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  {notice}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <DashboardCard
              key={card.label}
              label={card.label}
              value={card.value}
              hint={card.hint}
            />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  Indicadores manuais
                </p>
                <h2 className="mt-2 text-xl font-black">Configuração inicial</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Clientes recorrentes</span>
                <input
                  value={form.recurring_clients}
                  onChange={(e) => setForm((prev) => ({ ...prev, recurring_clients: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  inputMode="numeric"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">Ticket médio (R$)</span>
                <input
                  value={form.average_ticket}
                  onChange={(e) => setForm((prev) => ({ ...prev, average_ticket: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  inputMode="decimal"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={form.dark_mode}
                  onChange={(e) => setForm((prev) => ({ ...prev, dark_mode: e.target.checked }))}
                />
                <span className="text-sm">Habilitar preferência Dark Mode</span>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={form.starts_collapsed}
                  onChange={(e) => setForm((prev) => ({ ...prev, starts_collapsed: e.target.checked }))}
                />
                <span className="text-sm">Tela deve iniciar recolhida</span>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium">Observações</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="min-h-[120px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={handleSaveIndicators}
                disabled={saving}
                className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar indicadores"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
              Integrações
            </p>
            <h2 className="mt-2 text-xl font-black">Status do Patch 1</h2>

            <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <strong>DRE:</strong> {summary?.integration_status?.dre_ok ? "✅ conectado" : "⚠️ fallback/indisponível"}
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <strong>Snapshot financeiro / Fluxo:</strong> {summary?.integration_status?.snapshot_ok ? "✅ conectado" : "⚠️ indisponível"}
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <strong>Custos:</strong> {summary?.integration_status?.costs_ok ? "✅ conectado" : "⚠️ fallback/indisponível"}
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <strong>Ano base:</strong> {summary?.year || currentYear}
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <strong>Snapshot:</strong> {summary?.latest_batch?.created_at || "não disponível"}
              </div>
            </div>
          </div>
        </section>

        {showPlaceholders ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {[
              "Metas Mensais",
              "Plano de Ação",
              "Projeção Plurianual",
              "Meta Comercial",
              "Comissionamento",
              "14º Salário",
              "Gráficos",
              "Relatórios / PDF / CSV",
            ].map((title) => (
              <div
                key={title}
                className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
              >
                <div className="text-base font-black text-slate-900 dark:text-slate-100">{title}</div>
                <p className="mt-2">
                  Estrutura reservada no Patch 1. Implementação funcional prevista nos próximos patches.
                </p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      </main>
    </FinanceModuleShell>
  );
}