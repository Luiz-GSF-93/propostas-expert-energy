"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import { supabase } from "@/lib/supabase";

const API_BASE = "/api/backend";
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

type PlanningMonthlyGoal = {
  id?: string | null;
  reference_year: number;
  reference_month: number;
  month_label: string;
  meta_amount: number;
  actual_amount: number;
  difference_amount: number;
  achieved_percent: number;
  status_code: string;
  status_icon: string;
  status_label: string;
  notes?: string;
};

type PlanningMonthlyGoalsResponse = {
  year: number;
  months: PlanningMonthlyGoal[];
  totals: {
    meta_amount: number;
    actual_amount: number;
    difference_amount: number;
    achieved_percent: number;
  };
};

type ManualIndicatorsForm = {
  reference_year: number;
  recurring_clients: string;
  average_ticket: string;
  dark_mode: boolean;
  starts_collapsed: boolean;
  notes: string;
};

type MonthlyGoalForm = {
  reference_year: number;
  reference_month: number;
  meta_amount: string;
  actual_amount: string;
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

function statusTone(statusCode: string) {
  if (statusCode === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (statusCode === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (statusCode === "danger") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
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

function MiniBarsChart({ items }: { items: PlanningMonthlyGoal[] }) {
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => [item.meta_amount || 0, item.actual_amount || 0])
  );

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const metaWidth = `${Math.max(6, (item.meta_amount / maxValue) * 100)}%`;
        const actualWidth = `${Math.max(6, (item.actual_amount / maxValue) * 100)}%`;

        return (
          <div key={item.reference_month} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>{item.month_label}</span>
              <span>{formatPercent(item.achieved_percent)}</span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-10 text-[10px] uppercase tracking-wide text-slate-400">Meta</span>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-slate-300" style={{ width: metaWidth }} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-10 text-[10px] uppercase tracking-wide text-slate-400">Real</span>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-sky-500" style={{ width: actualWidth }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PlanejamentoPage() {
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [savingIndicators, setSavingIndicators] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summary, setSummary] = useState<PlanningSummary | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const requestIdRef = useRef(0);

  const [monthlyGoals, setMonthlyGoals] = useState<PlanningMonthlyGoal[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<PlanningMonthlyGoalsResponse["totals"]>({
    meta_amount: 0,
    actual_amount: 0,
    difference_amount: 0,
    achieved_percent: 0,
  });

  const [form, setForm] = useState<ManualIndicatorsForm>({
    reference_year: currentYear,
    recurring_clients: "0",
    average_ticket: "0",
    dark_mode: false,
    starts_collapsed: true,
    notes: "",
  });

  const [goalForm, setGoalForm] = useState<MonthlyGoalForm>({
    reference_year: currentYear,
    reference_month: new Date().getMonth() + 1,
    meta_amount: "",
    actual_amount: "",
    notes: "",
  });

  async function loadData(token: string) {
    const requestId = ++requestIdRef.current;
    const year = Number(goalForm.reference_year || currentYear);

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const [summaryResponse, goalsResponse] = await Promise.all([
        authJson(`/api/finance/planejamento/resumo?year=${year}`, token),
        authJson(`/api/finance/planejamento/metas?year=${year}`, token),
      ]);

      if (requestId !== requestIdRef.current) return;

      setSummary(summaryResponse);
      setForm({
        reference_year: Number(summaryResponse?.manual_indicators?.reference_year || year),
        recurring_clients: String(summaryResponse?.manual_indicators?.recurring_clients ?? 0),
        average_ticket: String(summaryResponse?.manual_indicators?.average_ticket ?? 0),
        dark_mode: Boolean(summaryResponse?.manual_indicators?.dark_mode),
        starts_collapsed: summaryResponse?.manual_indicators?.starts_collapsed !== false,
        notes: String(summaryResponse?.manual_indicators?.notes || ""),
      });

      setGoalForm((prev) => ({
        ...prev,
        reference_year: Number(goalsResponse?.year || year),
      }));

      setMonthlyGoals(Array.isArray(goalsResponse?.months) ? goalsResponse.months : []);
      setMonthlyTotals(
        goalsResponse?.totals || {
          meta_amount: 0,
          actual_amount: 0,
          difference_amount: 0,
          achieved_percent: 0,
        }
      );

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

    setSavingIndicators(true);
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
      setSavingIndicators(false);
    }
  }

  async function handleSaveMonthlyGoal() {
    if (!accessToken) {
      setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
      return;
    }

    setSavingGoal(true);
    setError("");
    setSuccess("");

    try {
      const response = await authJson("/api/finance/planejamento/metas", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          reference_year: goalForm.reference_year,
          reference_month: goalForm.reference_month,
          meta_amount: toNumber(goalForm.meta_amount),
          actual_amount: toNumber(goalForm.actual_amount),
          notes: goalForm.notes,
        }),
      });

      setMonthlyGoals(Array.isArray(response?.months) ? response.months : []);
      setMonthlyTotals(response?.totals || monthlyTotals);
      setSuccess("Meta mensal salva com sucesso.");

      setGoalForm((prev) => ({
        ...prev,
        meta_amount: "",
        actual_amount: "",
        notes: "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar meta mensal.");
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleDeleteMonthlyGoal(item: PlanningMonthlyGoal) {
    if (!accessToken) {
      setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
      return;
    }

    const confirmed = window.confirm(
      `Remover meta mensal de ${item.month_label}/${item.reference_year}?`
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      const response = await authJson(
        `/api/finance/planejamento/metas/${item.reference_year}/${item.reference_month}`,
        accessToken,
        { method: "DELETE" }
      );

      setMonthlyGoals(Array.isArray(response?.months) ? response.months : []);
      setMonthlyTotals(response?.totals || monthlyTotals);
      setSuccess("Meta mensal removida com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover meta mensal.");
    }
  }

  function handleEditMonthlyGoal(item: PlanningMonthlyGoal) {
    setGoalForm({
      reference_year: item.reference_year,
      reference_month: item.reference_month,
      meta_amount: item.meta_amount ? String(item.meta_amount) : "",
      actual_amount: item.actual_amount ? String(item.actual_amount) : "",
      notes: item.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        hint: "Campo manual configurável",
      },
      {
        label: "Ticket Médio (R$)",
        value: formatMoney(summary.cards.ticket_medio),
        hint: "Campo manual configurável",
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
                  Patch 2: Metas Mensais com cálculo automático, status e visual comparativo.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    accessToken
                      ? loadData(accessToken)
                      : setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.")
                  }
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
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  Indicadores manuais
                </p>
                <h2 className="mt-2 text-xl font-black">Configuração inicial</h2>
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
                  disabled={savingIndicators}
                  className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingIndicators ? "Salvando..." : "Salvar indicadores"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                Integrações
              </p>
              <h2 className="mt-2 text-xl font-black">Status da integração</h2>

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

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                    Metas Mensais
                  </p>
                  <h2 className="mt-2 text-xl font-black">Cadastrar / atualizar meta do mês</h2>
                </div>

                <div className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  Ano {goalForm.reference_year}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Mês</span>
                  <select
                    value={goalForm.reference_month}
                    onChange={(e) =>
                      setGoalForm((prev) => ({ ...prev, reference_month: Number(e.target.value) }))
                    }
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  >
                    {MONTH_LABELS.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Ano</span>
                  <input
                    value={goalForm.reference_year}
                    onChange={(e) =>
                      setGoalForm((prev) => ({ ...prev, reference_year: Number(e.target.value || currentYear) }))
                    }
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    inputMode="numeric"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Meta (R$)</span>
                  <input
                    value={goalForm.meta_amount}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, meta_amount: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    inputMode="decimal"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Realizado (R$)</span>
                  <input
                    value={goalForm.actual_amount}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, actual_amount: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    inputMode="decimal"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea
                    value={goalForm.notes}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={handleSaveMonthlyGoal}
                  disabled={savingGoal}
                  className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingGoal ? "Salvando..." : "Salvar meta mensal"}
                </button>

                <button
                  onClick={() =>
                    setGoalForm({
                      reference_year: currentYear,
                      reference_month: new Date().getMonth() + 1,
                      meta_amount: "",
                      actual_amount: "",
                      notes: "",
                    })
                  }
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Limpar formulário
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                Performance
              </p>
              <h2 className="mt-2 text-xl font-black">Meta x Realizado</h2>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Meta anual</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(monthlyTotals.meta_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Realizado anual</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(monthlyTotals.actual_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Diferença</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(monthlyTotals.difference_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">% atingido</div>
                  <div className="mt-2 text-xl font-extrabold">{formatPercent(monthlyTotals.achieved_percent)}</div>
                </div>
              </div>

              <div className="mt-6">
                <MiniBarsChart items={monthlyGoals} />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  Metas Mensais
                </p>
                <h2 className="mt-2 text-xl font-black">Tabela consolidada Jan–Dez</h2>
              </div>

              <button
                onClick={() =>
                  accessToken
                    ? loadData(accessToken)
                    : setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.")
                }
                className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Recarregar metas
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                    <th className="px-3 py-3">Mês</th>
                    <th className="px-3 py-3">Meta</th>
                    <th className="px-3 py-3">Realizado</th>
                    <th className="px-3 py-3">Diferença</th>
                    <th className="px-3 py-3">% Atingido</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlyGoals.map((item) => (
                    <tr key={`${item.reference_year}-${item.reference_month}`} className="align-top">
                      <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {item.month_label}
                      </td>
                      <td className="px-3 py-3">{formatMoney(item.meta_amount)}</td>
                      <td className="px-3 py-3">{formatMoney(item.actual_amount)}</td>
                      <td className="px-3 py-3">{formatMoney(item.difference_amount)}</td>
                      <td className="px-3 py-3">{formatPercent(item.achieved_percent)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(item.status_code)}`}>
                          {item.status_icon} {item.status_label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleEditMonthlyGoal(item)}
                            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteMonthlyGoal(item)}
                            className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            Limpar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 font-bold dark:border-slate-700">
                    <td className="px-3 py-4">Total</td>
                    <td className="px-3 py-4">{formatMoney(monthlyTotals.meta_amount)}</td>
                    <td className="px-3 py-4">{formatMoney(monthlyTotals.actual_amount)}</td>
                    <td className="px-3 py-4">{formatMoney(monthlyTotals.difference_amount)}</td>
                    <td className="px-3 py-4">{formatPercent(monthlyTotals.achieved_percent)}</td>
                    <td className="px-3 py-4" colSpan={2}>Consolidado anual</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {showPlaceholders ? (
            <section className="grid gap-4 lg:grid-cols-2">
              {[
                "Plano de Ação",
                "Projeção Plurianual",
                "Meta Comercial",
                "Comissionamento",
                "14º Salário",
                "Gráficos avançados",
                "Relatórios / PDF / CSV",
              ].map((title) => (
                <div
                  key={title}
                  className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                >
                  <div className="text-base font-black text-slate-900 dark:text-slate-100">{title}</div>
                  <p className="mt-2">
                    Estrutura reservada para os próximos patches do módulo Planejamento.
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
