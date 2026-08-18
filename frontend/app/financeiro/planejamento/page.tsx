"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import { supabase } from "@/lib/supabase";

const API_BASE = "/api/backend";
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ACTION_CATEGORIES = ["Marketing", "Vendas", "Compras", "Tecnologia", "Produto", "Operações", "Infraestrutura", "Outros"];
const ACTION_STATUSES = ["Planejado", "Não Iniciado", "Em Andamento", "Aguardando", "Inviável", "Concluído"];
const ACTION_IMPACT_TYPES = [
  { value: "financeiro", label: "Financeiro" },
  { value: "reducao_custos", label: "Redução de custos" },
];
const COMMERCIAL_GOAL_TYPES = ["Contrato Recorrente", "Contrato Avulso"];

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

type PlanningActionItem = {
  id: string | null;
  reference_year: number;
  initiative: string;
  category: string;
  owner_name: string;
  start_date: string | null;
  end_date: string | null;
  investment_amount: number;
  expected_impact_amount: number;
  impact_type: string;
  payback_months: number | null;
  status: string;
  notes: string;
};

type PlanningActionPlansResponse = {
  year: number;
  items: PlanningActionItem[];
  summary: {
    total_items: number;
    total_investment_amount: number;
    total_expected_impact_amount: number;
    average_payback_months: number | null;
    status_breakdown: Record<string, number>;
  };
};

type ProjectionItem = {
  id: string | null;
  base_year: number;
  projection_year: number;
  revenue_amount: number;
  net_profit_amount: number;
  net_margin_percent: number;
  monthly_fixed_cost: number;
  employee_count: number;
  working_capital_amount: number;
  notes: string;
  is_auto_current_year?: boolean;
  revenue_delta_amount?: number | null;
  revenue_delta_percent?: number | null;
  net_profit_delta_amount?: number | null;
  net_profit_delta_percent?: number | null;
};

type ProjectionsResponse = {
  base_year: number;
  items: ProjectionItem[];
};

type CommercialGoalItem = {
  id: string | null;
  reference_year: number;
  reference_month: number;
  month_label: string;
  goal_type: string;
  goal_amount: number;
  actual_amount: number;
  performance_percent: number;
  notes: string;
};

type CommercialGoalsResponse = {
  year: number;
  items: CommercialGoalItem[];
  totals: {
    goal_amount: number;
    actual_amount: number;
    performance_percent: number;
    by_type: Record<
      string,
      {
        goal_amount: number;
        actual_amount: number;
        performance_percent: number;
      }
    >;
  };
  goal_types: string[];
};

type CommissionResponse = {
  id: string | null;
  reference_year: number;
  commission_percent: number;
  recurrent_goal_required_percent: number;
  notes: string;
  recurring_goal_amount: number;
  recurring_actual_amount: number;
  recurring_performance_percent: number;
  eligible: boolean;
  commission_amount: number;
};

type FourteenthResponse = {
  id: string | null;
  reference_year: number;
  achievement_percent: number;
  salary_base_amount: number;
  factor: number;
  projected_payment_amount: number;
  notes: string;
  rule_label: string;
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

type ActionPlanForm = {
  id: string;
  reference_year: number;
  initiative: string;
  category: string;
  owner_name: string;
  start_date: string;
  end_date: string;
  investment_amount: string;
  expected_impact_amount: string;
  impact_type: string;
  status: string;
  notes: string;
};

type ProjectionForm = {
  id: string;
  base_year: number;
  projection_year: number;
  growth_percent: string;
  revenue_amount: string;
  net_profit_amount: string;
  net_margin_percent: string;
  monthly_fixed_cost: string;
  employee_count: string;
  notes: string;
};

type CommercialForm = {
  id: string;
  reference_year: number;
  reference_month: number;
  goal_type: string;
  goal_amount: string;
  actual_amount: string;
  notes: string;
};

type CommissionForm = {
  reference_year: number;
  commission_percent: string;
  recurrent_goal_required_percent: string;
  notes: string;
};

type SectionKey =
  | "hero"
  | "cards"
  | "indicadores"
  | "metas_form"
  | "performance"
  | "metas_tabela"
  | "plano_form"
  | "plano_resumo"
  | "plano_tabela"
  | "projecoes_form"
  | "projecoes_tabela"
  | "meta_comercial_form"
  | "meta_comercial_tabela"
  | "comissao"
  | "decimo_quarto";

const DEFAULT_COLLAPSED_SECTIONS: Record<SectionKey, boolean> = {
  hero: true,
  cards: true,
  indicadores: true,
  metas_form: true,
  performance: true,
  metas_tabela: true,
  plano_form: true,
  plano_resumo: true,
  plano_tabela: true,
  projecoes_form: true,
  projecoes_tabela: true,
  meta_comercial_form: true,
  meta_comercial_tabela: true,
  comissao: true,
  decimo_quarto: true,
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/\s/g, "").replace(/R\$\s?/g, "").replace(/[^\d,.-]/g, "");
    if (!cleaned) return 0;
    const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
    const parsed = Number(normalized);
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

function formatDateBr(value?: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function statusTone(statusCode: string) {
  if (statusCode === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (statusCode === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (statusCode === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function actionStatusTone(status: string) {
  if (status === "Concluído") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Em Andamento") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "Aguardando") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "Inviável") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function computePaybackMonths(investmentAmount: unknown, expectedImpactAmount: unknown): number | null {
  const investment = toNumber(investmentAmount);
  const impact = toNumber(expectedImpactAmount);
  if (investment <= 0 || impact <= 0) return null;
  return Number((investment / impact).toFixed(2));
}

function computeWorkingCapital(monthlyFixedCost: unknown): number {
  return Number((toNumber(monthlyFixedCost) * 3).toFixed(2));
}

function computeFourteenthEligibility(achievementPercent: unknown) {
  const percent = Number(toNumber(achievementPercent).toFixed(2));

  if (percent <= 50) {
    return {
      eligible: false,
      factor: 0,
      paymentLabel: "Sem pagamento",
      ruleLabel: "De 0,01% até 50,00%: sem pagamento.",
    };
  }

  if (percent < 100) {
    return {
      eligible: true,
      factor: Number((percent / 100).toFixed(4)),
      paymentLabel: "Pagamento proporcional",
      ruleLabel: "De 50,01% até 99,99%: pagamento proporcional abaixo de 100%.",
    };
  }

  if (percent === 100) {
    return {
      eligible: true,
      factor: 1,
      paymentLabel: "Pagamento obtido",
      ruleLabel: "100,00%: pagamento obtido integral.",
    };
  }

  return {
    eligible: true,
    factor: Number((percent / 100).toFixed(4)),
    paymentLabel: "Pagamento obtido proporcional positivo",
    ruleLabel: "> 100,00%: pagamento obtido com proporcional positivo.",
  };
}

function downloadTextFile(filename: string, content: string, contentType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(";") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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
    const message = json?.message || json?.error || `Erro HTTP ${response.status}`;
    throw new Error(message);
  }

  return json;
}

function DashboardCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-3 text-[clamp(1rem,1.35vw,1.55rem)] font-extrabold leading-[1.08] tracking-tight text-slate-900 [overflow-wrap:anywhere] dark:text-slate-50">
        {value}
      </div>
      {hint ? <div className="mt-2 whitespace-pre-line text-[11px] leading-5 text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
}

function MiniBarsChart({ items }: { items: PlanningMonthlyGoal[] }) {
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.meta_amount || 0, item.actual_amount || 0]));

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

function MetricBarsChart({
  title,
  subtitle,
  items,
  formatter = (value: number) => value.toLocaleString("pt-BR"),
  primaryLabel = "Principal",
  secondaryLabel,
}: {
  title: string;
  subtitle?: string;
  items: Array<{ label: string; value: number; secondaryValue?: number | null; note?: string }>;
  formatter?: (value: number) => string;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-base font-black text-slate-900">{title}</div>
        {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Sem dados suficientes para exibir este gráfico no ano selecionado.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(1, ...items.flatMap((item) => [Math.abs(item.value || 0), Math.abs(item.secondaryValue || 0)]));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-black text-slate-900">{title}</div>
          {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />{primaryLabel}</span>
          {secondaryLabel ? <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />{secondaryLabel}</span> : null}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {items.map((item) => {
          const primaryWidth = `${Math.max(4, (Math.abs(item.value || 0) / maxValue) * 100)}%`;
          const secondaryWidth = item.secondaryValue != null ? `${Math.max(4, (Math.abs(item.secondaryValue || 0) / maxValue) * 100)}%` : "0%";

          return (
            <div key={`${title}-${item.label}`} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-700">{item.label}</div>
                  {item.note ? <div className="text-xs text-slate-400">{item.note}</div> : null}
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>{formatter(item.value)}</div>
                  {item.secondaryValue != null ? <div>{formatter(item.secondaryValue)}</div> : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-14 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{primaryLabel}</span>
                  <div className="h-2.5 w-full rounded-full bg-slate-100">
                    <div className="h-2.5 rounded-full bg-sky-500" style={{ width: primaryWidth }} />
                  </div>
                </div>
                {item.secondaryValue != null ? (
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{secondaryLabel}</span>
                    <div className="h-2.5 w-full rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full bg-slate-300" style={{ width: secondaryWidth }} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PositiveNegativeColumnsChart({
  title,
  subtitle,
  items,
  formatter = (value: number) => value.toLocaleString("pt-BR"),
}: {
  title: string;
  subtitle?: string;
  items: Array<{ label: string; value: number; note?: string }>;
  formatter?: (value: number) => string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-base font-black text-slate-900">{title}</div>
        {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Sem dados suficientes para exibir este gráfico no ano selecionado.
        </div>
      </div>
    );
  }

  const maxAbs = Math.max(1, ...items.map((item) => Math.abs(item.value || 0)));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <div className="text-base font-black text-slate-900">{title}</div>
        {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-5">
        {items.map((item) => {
          const value = Number(item.value || 0);
          const height = `${Math.max(10, (Math.abs(value) / maxAbs) * 100)}%`;
          const positive = value >= 0;

          return (
            <div key={`${title}-${item.label}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-4">
              <div className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
              <div className="mt-2 text-center text-xs font-medium text-slate-500 [overflow-wrap:anywhere]">{formatter(value)}</div>
              {item.note ? <div className="mt-1 text-center text-[10px] leading-4 text-slate-400">{item.note}</div> : null}

              <div className="mt-4 flex h-40 items-stretch justify-center">
                <div className="relative flex h-full w-full flex-col">
                  <div className="flex h-1/2 items-end justify-center pb-1">
                    {positive ? <div className="w-10 rounded-t-xl bg-emerald-500" style={{ height }} /> : <div className="w-10" />}
                  </div>
                  <div className="h-px w-full bg-slate-300" />
                  <div className="flex h-1/2 items-start justify-center pt-1">
                    {!positive ? <div className="w-10 rounded-b-xl bg-rose-500" style={{ height }} /> : <div className="w-10" />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineTrendChart({
  title,
  subtitle,
  items,
  formatter = (value: number) => value.toLocaleString("pt-BR"),
  primaryLabel = "Meta",
  secondaryLabel = "Realizado",
}: {
  title: string;
  subtitle?: string;
  items: Array<{ label: string; value: number; secondaryValue?: number | null; note?: string }>;
  formatter?: (value: number) => string;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-base font-black text-slate-900">{title}</div>
        {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Sem dados suficientes para exibir este gráfico no ano selecionado.
        </div>
      </div>
    );
  }

  const width = 560;
  const height = 240;
  const paddingX = 24;
  const paddingY = 20;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const maxValue = Math.max(1, ...items.flatMap((item) => [Number(item.value || 0), Number(item.secondaryValue || 0)]));
  const stepX = items.length > 1 ? chartWidth / (items.length - 1) : 0;
  const toY = (value: number) => paddingY + chartHeight - (Number(value || 0) / maxValue) * chartHeight;

  const metaPoints = items
    .map((item, index) => `${paddingX + index * stepX},${toY(Number(item.value || 0))}`)
    .join(" ");

  const realizedPoints = items
    .map((item, index) => `${paddingX + index * stepX},${toY(Number(item.secondaryValue || 0))}`)
    .join(" ");

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-black text-slate-900">{title}</div>
          {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />{primaryLabel}</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />{secondaryLabel}</span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[560px] w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = paddingY + chartHeight - tick * chartHeight;
            const labelValue = maxValue * tick;
            return (
              <g key={tick}>
                <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
                <text x={paddingX} y={Math.max(12, y - 6)} fontSize="10" fill="#94a3b8">{formatter(labelValue)}</text>
              </g>
            );
          })}
          <polyline fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={metaPoints} />
          <polyline fill="none" stroke="#cbd5e1" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={realizedPoints} />
          {items.map((item, index) => {
            const x = paddingX + index * stepX;
            const yMeta = toY(Number(item.value || 0));
            const yReal = toY(Number(item.secondaryValue || 0));
            return (
              <g key={`${title}-${item.label}`}>
                <circle cx={x} cy={yMeta} r="4" fill="#0ea5e9" />
                <circle cx={x} cy={yReal} r="4" fill="#cbd5e1" />
                <text x={x} y={height - 6} textAnchor="middle" fontSize="11" fill="#64748b">{item.label}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={`${title}-legend-${item.label}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
            <div className="font-semibold text-slate-700">{item.label}</div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{primaryLabel}</span><span>{formatter(Number(item.value || 0))}</span></div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{secondaryLabel}</span><span>{formatter(Number(item.secondaryValue || 0))}</span></div>
            {item.note ? <div className="mt-2 text-[11px] text-slate-400">{item.note}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  sectionKey,
  kicker,
  title,
  collapsed,
  onToggle,
  children,
  extra,
  sticky = false,
}: {
  sectionKey: SectionKey;
  kicker: string;
  title: string;
  collapsed: boolean;
  onToggle: (key: SectionKey) => void;
  children: React.ReactNode;
  extra?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <section
      data-section={sectionKey}
      className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${sticky ? "2xl:sticky 2xl:top-6" : ""}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{kicker}</p>
          <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-50">{title}</h2>
        </div>
        <div className="flex items-center gap-2 no-print">
          {extra}
          <button
            type="button"
            onClick={() => onToggle(sectionKey)}
            className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {collapsed ? "Expandir" : "Recuar"}
          </button>
        </div>
      </div>

      {!collapsed ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

export default function PlanejamentoPage() {
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [savingIndicators, setSavingIndicators] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [savingProjection, setSavingProjection] = useState(false);
  const [savingCommercial, setSavingCommercial] = useState(false);
  const [savingCommission, setSavingCommission] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPlaceholders, setShowPlaceholders] = useState(true);
  const [summary, setSummary] = useState<PlanningSummary | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [softWarnings, setSoftWarnings] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>(DEFAULT_COLLAPSED_SECTIONS);

  const [monthlyGoals, setMonthlyGoals] = useState<PlanningMonthlyGoal[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<PlanningMonthlyGoalsResponse["totals"]>({
    meta_amount: 0,
    actual_amount: 0,
    difference_amount: 0,
    achieved_percent: 0,
  });

  const [actionPlans, setActionPlans] = useState<PlanningActionItem[]>([]);
  const [actionSummary, setActionSummary] = useState<PlanningActionPlansResponse["summary"]>({
    total_items: 0,
    total_investment_amount: 0,
    total_expected_impact_amount: 0,
    average_payback_months: null,
    status_breakdown: {},
  });

  const [projections, setProjections] = useState<ProjectionItem[]>([]);
  const [commercialGoals, setCommercialGoals] = useState<CommercialGoalItem[]>([]);
  const [commercialTotals, setCommercialTotals] = useState<CommercialGoalsResponse["totals"]>({
    goal_amount: 0,
    actual_amount: 0,
    performance_percent: 0,
    by_type: {},
  });
  const [commission, setCommission] = useState<CommissionResponse | null>(null);
  const [fourteenth, setFourteenth] = useState<FourteenthResponse | null>(null);

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

  const [actionForm, setActionForm] = useState<ActionPlanForm>({
    id: "",
    reference_year: currentYear,
    initiative: "",
    category: "Marketing",
    owner_name: "",
    start_date: "",
    end_date: "",
    investment_amount: "",
    expected_impact_amount: "",
    impact_type: "financeiro",
    status: "Planejado",
    notes: "",
  });

  const [projectionForm, setProjectionForm] = useState<ProjectionForm>({
    id: "",
    base_year: currentYear,
    projection_year: currentYear + 1,
    growth_percent: "0",
    revenue_amount: "",
    net_profit_amount: "",
    net_margin_percent: "",
    monthly_fixed_cost: "",
    employee_count: "",
    notes: "",
  });

  const [commercialForm, setCommercialForm] = useState<CommercialForm>({
    id: "",
    reference_year: currentYear,
    reference_month: new Date().getMonth() + 1,
    goal_type: "Contrato Recorrente",
    goal_amount: "",
    actual_amount: "",
    notes: "",
  });

  const [commissionForm, setCommissionForm] = useState<CommissionForm>({
    reference_year: currentYear,
    commission_percent: "2",
    recurrent_goal_required_percent: "100",
    notes: "",
  });

  function toggleSection(key: SectionKey) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function syncYearAcrossForms(year: number) {
    setSelectedYear(year);
    setForm((prev) => ({ ...prev, reference_year: year }));
    setGoalForm((prev) => ({ ...prev, reference_year: year }));
    setActionForm((prev) => ({ ...prev, reference_year: year }));
    setProjectionForm((prev) => {
      const offset = prev.projection_year - prev.base_year === 2 ? 2 : 1;
      return {
        ...prev,
        base_year: year,
        projection_year: year + offset,
        growth_percent: prev.projection_year - prev.base_year === offset ? prev.growth_percent : "0",
      };
    });
    setCommercialForm((prev) => ({ ...prev, reference_year: year }));
    setCommissionForm((prev) => ({ ...prev, reference_year: year }));
  }

  async function loadData(token: string, year = selectedYear) {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError("");
    setSuccess("");
    setSoftWarnings([]);

    try {
      const settled = await Promise.allSettled([
        authJson(`/api/finance/planejamento/resumo?year=${year}`, token),
        authJson(`/api/finance/planejamento/metas?year=${year}`, token),
        authJson(`/api/finance/planejamento/plano-acao?year=${year}`, token),
        authJson(`/api/finance/planejamento/projecoes?year=${year}`, token),
        authJson(`/api/finance/planejamento/meta-comercial?year=${year}`, token),
        authJson(`/api/finance/planejamento/comissao?year=${year}`, token),
        authJson(`/api/finance/planejamento/decimo-quarto?year=${year}`, token),
      ]);

      if (requestId !== requestIdRef.current) return;

      const requiredIndexes = [0, 1, 2];
      const firstRequiredFailure = requiredIndexes.find((index) => settled[index].status === "rejected");
      if (firstRequiredFailure != null) {
        throw (settled[firstRequiredFailure] as PromiseRejectedResult).reason;
      }

      const warnings: string[] = [];
      const getValue = <T,>(index: number, fallback: T, label: string) => {
        const item = settled[index];
        if (item.status === "fulfilled") return item.value as T;
        warnings.push(label);
        return fallback;
      };

      const summaryResponse = getValue<PlanningSummary>(0, {
        year,
        cards: {
          faturamento_anual: 0,
          lucro_liquido_anual: 0,
          margem_liquida_percent: 0,
          reserva_caixa: 0,
          roi_percent: 0,
          clientes_recorrentes: 0,
          ticket_medio: 0,
          custo_fixo_mensal: 0,
        },
        manual_indicators: {
          reference_year: year,
          recurring_clients: 0,
          average_ticket: 0,
          dark_mode: false,
          starts_collapsed: true,
          notes: "",
        },
        notices: [],
      }, "Resumo");
      const goalsResponse = getValue<PlanningMonthlyGoalsResponse>(1, {
        year,
        months: [],
        totals: { meta_amount: 0, actual_amount: 0, difference_amount: 0, achieved_percent: 0 },
      }, "Metas mensais");
      const actionsResponse = getValue<PlanningActionPlansResponse>(2, {
        year,
        items: [],
        summary: {
          total_items: 0,
          total_investment_amount: 0,
          total_expected_impact_amount: 0,
          average_payback_months: null,
          status_breakdown: {},
        },
      }, "Plano de ação");
      const projectionsResponse = getValue<ProjectionsResponse>(3, { base_year: year, items: [] }, "Projeções");
      const commercialResponse = getValue<CommercialGoalsResponse>(4, {
        year,
        items: [],
        totals: { goal_amount: 0, actual_amount: 0, performance_percent: 0, by_type: {} },
        goal_types: COMMERCIAL_GOAL_TYPES,
      }, "Meta comercial");
      const commissionResponse = getValue<CommissionResponse | null>(5, null, "Comissão");
      const fourteenthResponse = getValue<FourteenthResponse | null>(6, null, "14º salário");

      setSummary(summaryResponse);
      setSelectedYear(Number(summaryResponse?.year || year));
      setSoftWarnings(warnings.length ? warnings.map((label) => `${label} carregado com fallback.`) : []);

      setForm({
        reference_year: Number(summaryResponse?.manual_indicators?.reference_year || year),
        recurring_clients: String(summaryResponse?.manual_indicators?.recurring_clients ?? 0),
        average_ticket: String(summaryResponse?.manual_indicators?.average_ticket ?? 0),
        dark_mode: Boolean(summaryResponse?.manual_indicators?.dark_mode),
        starts_collapsed: summaryResponse?.manual_indicators?.starts_collapsed !== false,
        notes: String(summaryResponse?.manual_indicators?.notes || ""),
      });

      setGoalForm((prev) => ({ ...prev, reference_year: Number(goalsResponse?.year || year) }));
      setActionForm((prev) => ({ ...prev, reference_year: Number(actionsResponse?.year || year) }));
      setProjectionForm((prev) => ({
        ...prev,
        id: "",
        base_year: Number(projectionsResponse?.base_year || year),
        projection_year: Number(projectionsResponse?.base_year || year) + 1,
        growth_percent: "0",
        revenue_amount: "",
        net_profit_amount: "",
        net_margin_percent: "",
        monthly_fixed_cost: "",
        employee_count: "",
        notes: "",
      }));
      setCommercialForm((prev) => ({ ...prev, reference_year: Number(commercialResponse?.year || year) }));
      setCommissionForm({
        reference_year: Number(commissionResponse?.reference_year || year),
        commission_percent: String(commissionResponse?.commission_percent ?? 0),
        recurrent_goal_required_percent: String(commissionResponse?.recurrent_goal_required_percent ?? 100),
        notes: String(commissionResponse?.notes || ""),
      });

      setMonthlyGoals(Array.isArray(goalsResponse?.months) ? goalsResponse.months : []);
      setMonthlyTotals(goalsResponse?.totals || { meta_amount: 0, actual_amount: 0, difference_amount: 0, achieved_percent: 0 });

      setActionPlans(Array.isArray(actionsResponse?.items) ? actionsResponse.items : []);
      setActionSummary(actionsResponse?.summary || {
        total_items: 0,
        total_investment_amount: 0,
        total_expected_impact_amount: 0,
        average_payback_months: null,
        status_breakdown: {},
      });

      setProjections(Array.isArray(projectionsResponse?.items) ? projectionsResponse.items : []);
      setCommercialGoals(Array.isArray(commercialResponse?.items) ? commercialResponse.items : []);
      setCommercialTotals(commercialResponse?.totals || { goal_amount: 0, actual_amount: 0, performance_percent: 0, by_type: {} });

      setCommission(commissionResponse || null);
      setFourteenth(fourteenthResponse || null);
      setShowPlaceholders(false);
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
    loadData(accessToken, selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, accessToken, selectedYear]);

  async function handleSaveIndicators() {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    setSavingIndicators(true);
    setError("");
    setSuccess("");
    try {
      await authJson("/api/finance/planejamento/indicadores", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          reference_year: selectedYear,
          recurring_clients: toNumber(form.recurring_clients),
          average_ticket: toNumber(form.average_ticket),
          dark_mode: form.dark_mode,
          starts_collapsed: form.starts_collapsed,
          notes: form.notes,
        }),
      });
      setSuccess("Indicadores do Planejamento salvos com sucesso.");
      await loadData(accessToken, selectedYear);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar indicadores.");
    } finally {
      setSavingIndicators(false);
    }
  }

  async function handleSaveMonthlyGoal() {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
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
      setGoalForm((prev) => ({ ...prev, meta_amount: "", actual_amount: "", notes: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar meta mensal.");
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleDeleteMonthlyGoal(item: PlanningMonthlyGoal) {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    if (!window.confirm(`Remover meta mensal de ${item.month_label}/${item.reference_year}?`)) return;
    try {
      const response = await authJson(`/api/finance/planejamento/metas/${item.reference_year}/${item.reference_month}`, accessToken, { method: "DELETE" });
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

  async function handleSaveActionPlan() {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    setSavingAction(true);
    setError("");
    setSuccess("");
    try {
      const response = await authJson("/api/finance/planejamento/plano-acao", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          id: actionForm.id || undefined,
          reference_year: actionForm.reference_year,
          initiative: actionForm.initiative,
          category: actionForm.category,
          owner_name: actionForm.owner_name,
          start_date: actionForm.start_date || null,
          end_date: actionForm.end_date || null,
          investment_amount: toNumber(actionForm.investment_amount),
          expected_impact_amount: toNumber(actionForm.expected_impact_amount),
          impact_type: actionForm.impact_type,
          status: actionForm.status,
          notes: actionForm.notes,
        }),
      });
      setActionPlans(Array.isArray(response?.items) ? response.items : []);
      setActionSummary(response?.summary || actionSummary);
      setSuccess(actionForm.id ? "Item do plano de ação atualizado com sucesso." : "Item do plano de ação criado com sucesso.");
      setActionForm({
        id: "",
        reference_year: selectedYear,
        initiative: "",
        category: "Marketing",
        owner_name: "",
        start_date: "",
        end_date: "",
        investment_amount: "",
        expected_impact_amount: "",
        impact_type: "financeiro",
        status: "Planejado",
        notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar item do plano de ação.");
    } finally {
      setSavingAction(false);
    }
  }

  async function handleDeleteActionPlan(item: PlanningActionItem) {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    if (!item.id || !window.confirm(`Remover a iniciativa \"${item.initiative}\"?`)) return;
    try {
      const response = await authJson(`/api/finance/planejamento/plano-acao/${item.id}`, accessToken, { method: "DELETE" });
      setActionPlans(Array.isArray(response?.items) ? response.items : []);
      setActionSummary(response?.summary || actionSummary);
      setSuccess("Item do plano de ação removido com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover item do plano de ação.");
    }
  }

  function handleEditActionPlan(item: PlanningActionItem) {
    setActionForm({
      id: item.id || "",
      reference_year: item.reference_year,
      initiative: item.initiative || "",
      category: item.category || "Marketing",
      owner_name: item.owner_name || "",
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      investment_amount: item.investment_amount ? String(item.investment_amount) : "",
      expected_impact_amount: item.expected_impact_amount ? String(item.expected_impact_amount) : "",
      impact_type: item.impact_type || "financeiro",
      status: item.status || "Planejado",
      notes: item.notes || "",
    });
    window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: "smooth" });
  }

  async function handleSaveProjection() {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    if (projectionForm.projection_year <= projectionForm.base_year) {
      return setError("O ano projetado deve ser maior que o ano base.");
    }
    if (projectionForm.projection_year === selectedYear + 2 && !projectionsByYear.has(selectedYear + 1) && !projectionForm.id) {
      return setError("Para cadastrar o Ano +2, salve primeiro a projeção do Ano +1.");
    }

    setSavingProjection(true);
    setError("");
    setSuccess("");
    try {
      const response = await authJson("/api/finance/planejamento/projecoes", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          id: projectionForm.id || undefined,
          base_year: projectionForm.base_year,
          projection_year: projectionForm.projection_year,
          revenue_amount: projectionAutoValues.revenue,
          net_profit_amount: projectionAutoValues.netProfit,
          net_margin_percent: projectionAutoValues.netMargin,
          monthly_fixed_cost: projectionAutoValues.monthlyFixedCost,
          employee_count: Number(projectionForm.employee_count || 0),
          notes: projectionForm.notes,
        }),
      });
      setProjections(Array.isArray(response?.items) ? response.items : []);
      setSuccess("Projeção plurianual salva com sucesso.");
      setProjectionForm({
        id: "",
        base_year: selectedYear,
        projection_year: selectedYear + 1,
        growth_percent: "0",
        revenue_amount: "",
        net_profit_amount: "",
        net_margin_percent: "",
        monthly_fixed_cost: "",
        employee_count: "",
        notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar projeção.");
    } finally {
      setSavingProjection(false);
    }
  }

  async function handleDeleteProjection(item: ProjectionItem) {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    if (!item.id || item.is_auto_current_year) return;
    if (!window.confirm(`Remover projeção do ano ${item.projection_year}?`)) return;
    try {
      const response = await authJson(`/api/finance/planejamento/projecoes/${item.id}`, accessToken, { method: "DELETE" });
      setProjections(Array.isArray(response?.items) ? response.items : []);
      setSuccess("Projeção removida com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover projeção.");
    }
  }

  function handleEditProjection(item: ProjectionItem) {
    const reference = item.projection_year === selectedYear + 1 ? currentYearProjection : projectionsByYear.get(item.projection_year - 1) || null;
    const growthPercent = reference && toNumber(reference.revenue_amount) > 0 ? Number((((item.revenue_amount / reference.revenue_amount) - 1) * 100).toFixed(2)) : 0;

    setProjectionForm({
      id: item.id || "",
      base_year: item.base_year,
      projection_year: item.projection_year,
      growth_percent: String(growthPercent),
      revenue_amount: String(item.revenue_amount || ""),
      net_profit_amount: String(item.net_profit_amount || ""),
      net_margin_percent: String(item.net_margin_percent || ""),
      monthly_fixed_cost: String(item.monthly_fixed_cost || ""),
      employee_count: String(item.employee_count || 0),
      notes: item.notes || "",
    });
  }

  async function handleSaveCommercialGoal() {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    setSavingCommercial(true);
    setError("");
    setSuccess("");
    try {
      const response = await authJson("/api/finance/planejamento/meta-comercial", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          reference_year: commercialForm.reference_year,
          reference_month: commercialForm.reference_month,
          goal_type: commercialForm.goal_type,
          goal_amount: toNumber(commercialForm.goal_amount),
          actual_amount: toNumber(commercialForm.actual_amount),
          notes: commercialForm.notes,
        }),
      });
      setCommercialGoals(Array.isArray(response?.items) ? response.items : []);
      setCommercialTotals(response?.totals || commercialTotals);
      setSuccess("Meta comercial salva com sucesso.");
      setCommercialForm((prev) => ({ ...prev, id: "", goal_amount: "", actual_amount: "", notes: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar meta comercial.");
    } finally {
      setSavingCommercial(false);
    }
  }

  async function handleDeleteCommercialGoal(item: CommercialGoalItem) {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    if (!item.id || !window.confirm(`Remover meta comercial ${item.goal_type} de ${item.month_label}/${item.reference_year}?`)) return;
    try {
      const response = await authJson(`/api/finance/planejamento/meta-comercial/${item.id}?year=${item.reference_year}`, accessToken, { method: "DELETE" });
      setCommercialGoals(Array.isArray(response?.items) ? response.items : []);
      setCommercialTotals(response?.totals || commercialTotals);
      setSuccess("Meta comercial removida com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover meta comercial.");
    }
  }

  function handleEditCommercialGoal(item: CommercialGoalItem) {
    setCommercialForm({
      id: item.id || "",
      reference_year: item.reference_year,
      reference_month: item.reference_month,
      goal_type: item.goal_type,
      goal_amount: String(item.goal_amount || ""),
      actual_amount: String(item.actual_amount || ""),
      notes: item.notes || "",
    });
  }

  async function handleSaveCommission() {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    setSavingCommission(true);
    setError("");
    setSuccess("");
    try {
      const response = await authJson("/api/finance/planejamento/comissao", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          reference_year: commissionForm.reference_year,
          commission_percent: toNumber(commissionForm.commission_percent),
          recurrent_goal_required_percent: toNumber(commissionForm.recurrent_goal_required_percent),
          notes: commissionForm.notes,
        }),
      });
      setCommission(response || null);
      setSuccess("Configuração de comissão salva com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar comissão.");
    } finally {
      setSavingCommission(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleDownloadCsv() {
    const rows: string[][] = [];
    rows.push(["Relatório", "Expert Energy Perfomance em Energia", `Ano ${selectedYear}`]);
    rows.push([]);
    rows.push(["Resumo", "Valor", "Observação"]);
    if (summary) {
      rows.push(["Faturamento anual", String(summary.cards.faturamento_anual), "DRE"]);
      rows.push(["Lucro líquido anual", String(summary.cards.lucro_liquido_anual), "DRE"]);
      rows.push(["Margem líquida %", String(summary.cards.margem_liquida_percent), "DRE"]);
      rows.push(["Reserva de caixa", String(summary.cards.reserva_caixa), "Fluxo/Snapshot"]);
      rows.push(["ROI %", String(summary.cards.roi_percent), "DRE"]);
      rows.push(["Clientes recorrentes", String(summary.cards.clientes_recorrentes), "Manual"]);
      rows.push(["Ticket médio", String(summary.cards.ticket_medio), "Manual"]);
      rows.push(["Custo fixo mensal", String(summary.cards.custo_fixo_mensal), "Custos"]);
    }
    rows.push([]);
    rows.push(["Metas Mensais"]);
    rows.push(["Mês", "Meta", "Realizado", "Diferença", "% Atingido", "Status", "Observações"]);
    monthlyGoals.forEach((item) => {
      rows.push([
        item.month_label,
        String(item.meta_amount),
        String(item.actual_amount),
        String(item.difference_amount),
        String(item.achieved_percent),
        item.status_label,
        item.notes || "",
      ]);
    });
    rows.push([]);
    rows.push(["Plano de Ação"]);
    rows.push(["Iniciativa", "Categoria", "Responsável", "Início", "Fim", "Investimento", "Impacto", "Tipo", "Payback", "Status", "Observações"]);
    actionPlans.forEach((item) => {
      rows.push([
        item.initiative,
        item.category,
        item.owner_name,
        item.start_date || "",
        item.end_date || "",
        String(item.investment_amount),
        String(item.expected_impact_amount),
        item.impact_type,
        String(item.payback_months ?? ""),
        item.status,
        item.notes,
      ]);
    });
    rows.push([]);
    rows.push(["Projeções"]);
    rows.push(["Ano", "Faturamento", "Lucro Líquido", "Margem %", "Custo Fixo Mensal", "Funcionários", "Capital de Giro", "Observações"]);
    projections.forEach((item) => {
      rows.push([
        String(item.projection_year),
        String(item.revenue_amount),
        String(item.net_profit_amount),
        String(item.net_margin_percent),
        String(item.monthly_fixed_cost),
        String(item.employee_count),
        String(item.working_capital_amount),
        item.notes,
      ]);
    });
    rows.push([]);
    rows.push(["Meta Comercial"]);
    rows.push(["Mês", "Tipo", "Meta", "Realizado", "Performance %", "Observações"]);
    commercialGoals.forEach((item) => {
      rows.push([
        item.month_label,
        item.goal_type,
        String(item.goal_amount),
        String(item.actual_amount),
        String(item.performance_percent),
        item.notes,
      ]);
    });
    rows.push([]);
    rows.push(["Comissão"]);
    rows.push(["% Comissão", "% mínimo meta recorrente", "Meta recorrente", "Realizado recorrente", "Performance %", "Elegível", "Comissão projetada", "Observações"]);
    rows.push([
      String(commission?.commission_percent ?? 0),
      String(commission?.recurrent_goal_required_percent ?? 0),
      String(commission?.recurring_goal_amount ?? 0),
      String(commission?.recurring_actual_amount ?? 0),
      String(commission?.recurring_performance_percent ?? 0),
      commission?.eligible ? "Sim" : "Não",
      String(commission?.commission_amount ?? 0),
      commission?.notes || "",
    ]);
    rows.push([]);
    rows.push(["14º Salário"]);
    rows.push(["% atingimento anual", "Fator", "Haverá pagamento", "Regra aplicada"]);
    rows.push([
      String(fourteenth?.achievement_percent ?? 0),
      String(fourteenthRule.factor),
      fourteenthRule.eligible ? "Sim" : "Não",
      fourteenthRule.ruleLabel,
    ]);

    const content = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    downloadTextFile(`planejamento-${selectedYear}.csv`, content, "text/csv;charset=utf-8");
  }

  const actionPaybackPreview = useMemo(
    () => computePaybackMonths(actionForm.investment_amount, actionForm.expected_impact_amount),
    [actionForm.investment_amount, actionForm.expected_impact_amount]
  );

  const projectionsByYear = useMemo(() => new Map(projections.map((item) => [item.projection_year, item])), [projections]);

  const currentYearProjection = useMemo<ProjectionItem>(() => {
    const fromApi = projections.find((item) => item.projection_year === selectedYear && item.is_auto_current_year) || projections.find((item) => item.projection_year === selectedYear);
    if (fromApi) return fromApi;

    return {
      id: null,
      base_year: selectedYear,
      projection_year: selectedYear,
      revenue_amount: summary?.cards.faturamento_anual || 0,
      net_profit_amount: summary?.cards.lucro_liquido_anual || 0,
      net_margin_percent: summary?.cards.margem_liquida_percent || 0,
      monthly_fixed_cost: summary?.cards.custo_fixo_mensal || 0,
      employee_count: 0,
      working_capital_amount: computeWorkingCapital(summary?.cards.custo_fixo_mensal || 0),
      notes: "",
      is_auto_current_year: true,
    };
  }, [projections, selectedYear, summary]);

  const projectionYearOptions = useMemo(() => [selectedYear + 1, selectedYear + 2], [selectedYear]);

  const projectionReferenceItem = useMemo(() => {
    if (projectionForm.projection_year === selectedYear + 1) return currentYearProjection;
    if (projectionForm.projection_year === selectedYear + 2) return projectionsByYear.get(selectedYear + 1) || null;
    return currentYearProjection;
  }, [currentYearProjection, projectionForm.projection_year, projectionsByYear, selectedYear]);

  const projectionReferenceMissing = projectionForm.projection_year === selectedYear + 2 && !projectionReferenceItem;

  const projectionAutoValues = useMemo(() => {
    if (!projectionReferenceItem) {
      return {
        revenue: 0,
        netProfit: 0,
        netMargin: 0,
        monthlyFixedCost: 0,
        workingCapital: 0,
      };
    }

    const factor = 1 + toNumber(projectionForm.growth_percent) / 100;
    const revenue = Number((projectionReferenceItem.revenue_amount * factor).toFixed(2));
    const netProfit = Number((projectionReferenceItem.net_profit_amount * factor).toFixed(2));
    const monthlyFixedCost = Number((projectionReferenceItem.monthly_fixed_cost * factor).toFixed(2));
    const netMargin = revenue !== 0 ? Number(((netProfit / revenue) * 100).toFixed(2)) : 0;
    const workingCapital = computeWorkingCapital(monthlyFixedCost);

    return {
      revenue,
      netProfit,
      netMargin,
      monthlyFixedCost,
      workingCapital,
    };
  }, [projectionForm.growth_percent, projectionReferenceItem]);

  const projectionDisplayItems = useMemo(() => {
    const map = new Map<number, ProjectionItem>();
    map.set(currentYearProjection.projection_year, currentYearProjection);
    projections.forEach((item) => map.set(item.projection_year, item));
    return Array.from(map.values()).sort((a, b) => a.projection_year - b.projection_year);
  }, [currentYearProjection, projections]);

  const getProjectionBaseItem = (item: ProjectionItem) => {
    if (item.projection_year === selectedYear) return null;
    if (item.projection_year === selectedYear + 1) return currentYearProjection;
    return projectionsByYear.get(item.projection_year - 1) || null;
  };

  const getProjectionGrowthPercent = (item: ProjectionItem) => {
    const base = getProjectionBaseItem(item);
    if (!base || toNumber(base.revenue_amount) === 0) return null;
    return Number((((item.revenue_amount / base.revenue_amount) - 1) * 100).toFixed(2));
  };

  const commercialRecurringTotals = commercialTotals?.by_type?.["Contrato Recorrente"] || {
    goal_amount: 0,
    actual_amount: 0,
    performance_percent: 0,
  };

  const yearOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => currentYear - 2 + index), [currentYear]);

  const cards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Faturamento Anual (R$)", value: formatMoney(summary.cards.faturamento_anual), hint: "Origem automática: API DRE > Receita Bruta" },
      { label: "Lucro Líquido Anual (R$)", value: formatMoney(summary.cards.lucro_liquido_anual), hint: "Origem automática: API DRE > Lucro Líquido" },
      { label: "Margem Líquida (%)", value: formatPercent(summary.cards.margem_liquida_percent), hint: "Origem automática: API DRE > Margem Líquida" },
      { label: "Reserva de Caixa", value: formatMoney(summary.cards.reserva_caixa), hint: "Origem automática: Fluxo de Caixa / snapshot financeiro" },
      { label: "ROI sobre o Capital (%)", value: formatPercent(summary.cards.roi_percent), hint: "Origem automática: API DRE > ROI" },
      { label: "Clientes Recorrentes", value: String(summary.cards.clientes_recorrentes || 0), hint: "Campo manual configurável" },
      { label: "Ticket Médio (R$)", value: formatMoney(summary.cards.ticket_medio), hint: "Campo manual configurável" },
      { label: "Custo Fixo Mensal", value: formatMoney(summary.cards.custo_fixo_mensal), hint: "Origem automática: API Custos > categoria Fixo" },
    ];
  }, [summary]);

  const projectionRevenueChartItems = useMemo(
    () => projectionDisplayItems.map((item) => ({ label: String(item.projection_year), value: item.revenue_amount, note: item.projection_year === selectedYear ? "Ano base automático" : `Crescimento ${formatPercent(getProjectionGrowthPercent(item) || 0)}` })),
    [projectionDisplayItems, selectedYear]
  );

  const projectionProfitChartItems = useMemo(
    () => projectionDisplayItems.map((item) => ({ label: String(item.projection_year), value: item.net_profit_amount, note: item.projection_year === selectedYear ? "Resultado atual" : `Margem ${formatPercent(item.net_margin_percent)}` })),
    [projectionDisplayItems, selectedYear]
  );

  const commercialChartItems = useMemo(
    () => Object.entries(commercialTotals?.by_type || {}).map(([label, values]) => ({ label, value: values.goal_amount || 0, secondaryValue: values.actual_amount || 0, note: `Performance ${formatPercent(values.performance_percent || 0)}` })),
    [commercialTotals]
  );

  const actionStatusChartItems = useMemo(
    () => Object.entries(actionSummary?.status_breakdown || {}).map(([label, value]) => ({ label, value: Number(value) || 0, note: "Quantidade de iniciativas" })),
    [actionSummary]
  );

  const monthlyPerformanceChartItems = useMemo(
    () => monthlyGoals.map((item) => ({
      label: item.month_label,
      value: item.meta_amount || 0,
      secondaryValue: item.actual_amount || 0,
      note: `Atingimento ${formatPercent(item.achieved_percent || 0)}`,
    })),
    [monthlyGoals]
  );

  const monthlyCumulativeChartItems = useMemo(() => {
    let metaAcc = 0;
    let actualAcc = 0;
    return monthlyGoals.map((item) => {
      metaAcc += Number(item.meta_amount || 0);
      actualAcc += Number(item.actual_amount || 0);
      const achieved = metaAcc > 0 ? (actualAcc / metaAcc) * 100 : 0;
      return {
        label: item.month_label,
        value: metaAcc,
        secondaryValue: actualAcc,
        note: `Acumulado ${formatPercent(achieved)}`,
      };
    });
  }, [monthlyGoals]);

  const fourteenthRule = useMemo(
    () => computeFourteenthEligibility(fourteenth?.achievement_percent || 0),
    [fourteenth?.achievement_percent]
  );

  const fourteenthEligible = fourteenthRule.eligible;

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
        <div className="print-only mb-4 border-b border-slate-300 pb-3 text-center">
          <div className="text-lg font-bold">Expert Energy Perfomance em Energia</div>
          <div className="text-sm">www.expertenergy.com.br</div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">Planejamento · Ano {selectedYear}</div>
        </div>

        <div className="mx-auto max-w-7xl space-y-6">
          <SectionCard
            sectionKey="hero"
            kicker="Planejamento"
            title="Dashboard Executivo"
            collapsed={collapsedSections.hero}
            onToggle={toggleSection}
            extra={
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  <span>Ano</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => syncYearAcrossForms(Number(e.target.value))}
                    className="bg-transparent outline-none"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => accessToken ? loadData(accessToken, selectedYear) : setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.")}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Atualizar painel
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Imprimir A4
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlaceholders((prev) => !prev)}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-slate-100 dark:text-slate-900"
                >
                  {showPlaceholders ? "Ocultar gráficos" : "Exibir gráficos"}
                </button>
              </div>
            }
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Patch 4.3: projeção plurianual com crescimento automático, capital de giro corrigido, gráficos avançados reais e regra automática do 14º salário.
            </p>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            {softWarnings.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {softWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard sectionKey="cards" kicker="Cards executivos" title="Visão consolidada" collapsed={collapsedSections.cards} onToggle={toggleSection}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => (
                <DashboardCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
              ))}
            </div>
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] xl:items-start">
            <SectionCard sectionKey="indicadores" kicker="Indicadores manuais" title="Configuração inicial" collapsed={collapsedSections.indicadores} onToggle={toggleSection}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Clientes recorrentes</span>
                  <input value={form.recurring_clients} onChange={(e) => setForm((prev) => ({ ...prev, recurring_clients: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500" inputMode="numeric" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Ticket médio (R$)</span>
                  <input value={form.average_ticket} onChange={(e) => setForm((prev) => ({ ...prev, average_ticket: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500" inputMode="decimal" />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <input type="checkbox" checked={form.dark_mode} onChange={(e) => setForm((prev) => ({ ...prev, dark_mode: e.target.checked }))} />
                  <span className="text-sm">Habilitar preferência Dark Mode</span>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <input type="checkbox" checked={form.starts_collapsed} onChange={(e) => setForm((prev) => ({ ...prev, starts_collapsed: e.target.checked }))} />
                  <span className="text-sm">Tela deve iniciar recolhida</span>
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[120px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500" />
                </label>
              </div>

              <div className="mt-5 flex justify-end no-print">
                <button onClick={handleSaveIndicators} disabled={savingIndicators} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                  {savingIndicators ? "Salvando..." : "Salvar indicadores"}
                </button>
              </div>
            </SectionCard>

            <SectionCard sectionKey="comissao" kicker="Comissão" title="Configuração e cálculo automático" collapsed={collapsedSections.comissao} onToggle={toggleSection} sticky>
              <div className="grid gap-4 grid-cols-1">
                <label className="space-y-2">
                  <span className="text-sm font-medium">% Comissão</span>
                  <input value={commissionForm.commission_percent} onChange={(e) => setCommissionForm((prev) => ({ ...prev, commission_percent: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">% mínimo da meta recorrente</span>
                  <input value={commissionForm.recurrent_goal_required_percent} onChange={(e) => setCommissionForm((prev) => ({ ...prev, recurrent_goal_required_percent: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea value={commissionForm.notes} onChange={(e) => setCommissionForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
              </div>

              <div className="mt-5 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Meta recorrente</div>
                  <div className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.52rem,0.68vw,0.68rem)] font-extrabold leading-tight tracking-tight text-slate-900">{formatMoney(commercialRecurringTotals.goal_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Realizado recorrente</div>
                  <div className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.52rem,0.68vw,0.68rem)] font-extrabold leading-tight tracking-tight text-slate-900">{formatMoney(commercialRecurringTotals.actual_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Performance recorrente</div>
                  <div className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.52rem,0.68vw,0.68rem)] font-extrabold leading-tight tracking-tight text-slate-900">{formatPercent(commission?.recurring_performance_percent || 0)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Comissão projetada</div>
                  <div className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.52rem,0.68vw,0.68rem)] font-extrabold leading-tight tracking-tight text-slate-900">{formatMoney(commission?.commission_amount || 0)}</div>
                  <div className="mt-2 text-xs text-slate-500">{commission?.eligible ? "Elegível para comissão" : "Ainda não elegível"}</div>
                </div>
              </div>

              <div className="mt-5 no-print">
                <button onClick={handleSaveCommission} disabled={savingCommission} className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                  {savingCommission ? "Salvando..." : "Salvar comissão"}
                </button>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
            <SectionCard sectionKey="metas_form" kicker="Metas Mensais" title="Cadastrar / atualizar meta do mês" collapsed={collapsedSections.metas_form} onToggle={toggleSection} extra={<div className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Ano {goalForm.reference_year}</div>}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Mês</span>
                  <select value={goalForm.reference_month} onChange={(e) => setGoalForm((prev) => ({ ...prev, reference_month: Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                    {MONTH_LABELS.map((label, index) => (
                      <option key={label} value={index + 1}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Ano</span>
                  <input value={goalForm.reference_year} onChange={(e) => setGoalForm((prev) => ({ ...prev, reference_year: Number(e.target.value || selectedYear) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="numeric" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Meta (R$)</span>
                  <input value={goalForm.meta_amount} onChange={(e) => setGoalForm((prev) => ({ ...prev, meta_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Realizado (R$)</span>
                  <input value={goalForm.actual_amount} onChange={(e) => setGoalForm((prev) => ({ ...prev, actual_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea value={goalForm.notes} onChange={(e) => setGoalForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-3 no-print">
                <button onClick={handleSaveMonthlyGoal} disabled={savingGoal} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">{savingGoal ? "Salvando..." : "Salvar meta mensal"}</button>
                <button onClick={() => setGoalForm({ reference_year: selectedYear, reference_month: new Date().getMonth() + 1, meta_amount: "", actual_amount: "", notes: "" })} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Limpar formulário</button>
              </div>
            </SectionCard>

            <SectionCard sectionKey="performance" kicker="Performance" title="Meta x Realizado" collapsed={collapsedSections.performance} onToggle={toggleSection}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Meta anual</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(monthlyTotals.meta_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Realizado anual</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(monthlyTotals.actual_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Diferença</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(monthlyTotals.difference_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">% atingido</div>
                  <div className="mt-2 text-xl font-extrabold">{formatPercent(monthlyTotals.achieved_percent)}</div>
                </div>
              </div>
              <div className="mt-6"><MiniBarsChart items={monthlyGoals} /></div>
            </SectionCard>
          </div>

          <SectionCard sectionKey="metas_tabela" kicker="Metas Mensais" title="Tabela consolidada Jan–Dez" collapsed={collapsedSections.metas_tabela} onToggle={toggleSection}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                    <th className="px-3 py-3">Mês</th>
                    <th className="px-3 py-3">Meta</th>
                    <th className="px-3 py-3">Realizado</th>
                    <th className="px-3 py-3">Diferença</th>
                    <th className="px-3 py-3">% Atingido</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 no-print">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyGoals.map((item) => (
                    <tr key={`${item.reference_year}-${item.reference_month}`}>
                      <td className="px-3 py-3 font-semibold">{item.month_label}</td>
                      <td className="px-3 py-3">{formatMoney(item.meta_amount)}</td>
                      <td className="px-3 py-3">{formatMoney(item.actual_amount)}</td>
                      <td className="px-3 py-3">{formatMoney(item.difference_amount)}</td>
                      <td className="px-3 py-3">{formatPercent(item.achieved_percent)}</td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(item.status_code)}`}>{item.status_icon} {item.status_label}</span></td>
                      <td className="px-3 py-3 no-print">
                        <div className="flex gap-2">
                          <button onClick={() => handleEditMonthlyGoal(item)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold">Editar</button>
                          <button onClick={() => handleDeleteMonthlyGoal(item)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Limpar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
            <SectionCard sectionKey="plano_form" kicker="Plano de Ação" title={actionForm.id ? "Editar iniciativa" : "Nova iniciativa"} collapsed={collapsedSections.plano_form} onToggle={toggleSection} extra={<div className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Payback: {actionPaybackPreview != null ? `${actionPaybackPreview.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} meses` : "—"}</div>}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium">Iniciativa</span><input value={actionForm.initiative} onChange={(e) => setActionForm((prev) => ({ ...prev, initiative: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Categoria</span><select value={actionForm.category} onChange={(e) => setActionForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">{ACTION_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-medium">Responsável</span><input value={actionForm.owner_name} onChange={(e) => setActionForm((prev) => ({ ...prev, owner_name: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Data início</span><input type="date" value={actionForm.start_date} onChange={(e) => setActionForm((prev) => ({ ...prev, start_date: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Data fim</span><input type="date" value={actionForm.end_date} onChange={(e) => setActionForm((prev) => ({ ...prev, end_date: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Investimento (R$)</span><input value={actionForm.investment_amount} onChange={(e) => setActionForm((prev) => ({ ...prev, investment_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Impacto esperado (R$)</span><input value={actionForm.expected_impact_amount} onChange={(e) => setActionForm((prev) => ({ ...prev, expected_impact_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Tipo de impacto</span><select value={actionForm.impact_type} onChange={(e) => setActionForm((prev) => ({ ...prev, impact_type: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">{ACTION_IMPACT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-medium">Status</span><select value={actionForm.status} onChange={(e) => setActionForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">{ACTION_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium">Observações</span><textarea value={actionForm.notes} onChange={(e) => setActionForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[110px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" /></label>
              </div>
              <div className="mt-5 flex flex-wrap gap-3 no-print">
                <button onClick={handleSaveActionPlan} disabled={savingAction} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">{savingAction ? "Salvando..." : actionForm.id ? "Atualizar iniciativa" : "Salvar iniciativa"}</button>
                <button onClick={() => setActionForm({ id: "", reference_year: selectedYear, initiative: "", category: "Marketing", owner_name: "", start_date: "", end_date: "", investment_amount: "", expected_impact_amount: "", impact_type: "financeiro", status: "Planejado", notes: "" })} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold">Limpar formulário</button>
              </div>
            </SectionCard>

            <SectionCard sectionKey="plano_resumo" kicker="Resumo do Plano de Ação" title="Visão executiva" collapsed={collapsedSections.plano_resumo} onToggle={toggleSection}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Iniciativas</div><div className="mt-2 text-xl font-extrabold">{actionSummary.total_items}</div></div>
                <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Investimento total</div><div className="mt-2 text-xl font-extrabold">{formatMoney(actionSummary.total_investment_amount)}</div></div>
                <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Impacto esperado</div><div className="mt-2 text-xl font-extrabold">{formatMoney(actionSummary.total_expected_impact_amount)}</div></div>
                <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Payback médio</div><div className="mt-2 text-xl font-extrabold">{actionSummary.average_payback_months != null ? `${actionSummary.average_payback_months.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} meses` : "—"}</div></div>
              </div>
            </SectionCard>
          </div>

          <SectionCard sectionKey="plano_tabela" kicker="Plano de Ação" title="Tabela consolidada" collapsed={collapsedSections.plano_tabela} onToggle={toggleSection}>
            <div className="overflow-x-auto">
              <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                    <th className="px-3 py-3">Iniciativa</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3">Responsável</th><th className="px-3 py-3">Início</th><th className="px-3 py-3">Fim</th><th className="px-3 py-3">Investimento</th><th className="px-3 py-3">Impacto esperado</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Payback</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 no-print">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {actionPlans.length === 0 ? (
                    <tr><td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma iniciativa cadastrada.</td></tr>
                  ) : actionPlans.map((item) => (
                    <tr key={item.id || `${item.reference_year}-${item.initiative}`}>
                      <td className="px-3 py-3"><div className="font-semibold">{item.initiative}</div>{item.notes ? <div className="mt-1 max-w-[260px] text-xs text-slate-500">{item.notes}</div> : null}</td>
                      <td className="px-3 py-3">{item.category}</td>
                      <td className="px-3 py-3">{item.owner_name || "—"}</td>
                      <td className="px-3 py-3">{formatDateBr(item.start_date)}</td>
                      <td className="px-3 py-3">{formatDateBr(item.end_date)}</td>
                      <td className="px-3 py-3">{formatMoney(item.investment_amount)}</td>
                      <td className="px-3 py-3">{formatMoney(item.expected_impact_amount)}</td>
                      <td className="px-3 py-3">{item.impact_type === "reducao_custos" ? "Redução de custos" : "Financeiro"}</td>
                      <td className="px-3 py-3">{item.payback_months != null ? `${item.payback_months.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} meses` : "—"}</td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${actionStatusTone(item.status)}`}>{item.status}</span></td>
                      <td className="px-3 py-3 no-print"><div className="flex gap-2"><button onClick={() => handleEditActionPlan(item)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold">Editar</button><button onClick={() => handleDeleteActionPlan(item)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Excluir</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
            <SectionCard sectionKey="projecoes_form" kicker="Projeção Plurianual" title="Cadastrar / atualizar projeção" collapsed={collapsedSections.projecoes_form} onToggle={toggleSection}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2"><span className="text-sm font-medium">Ano base</span><input value={projectionForm.base_year} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600" inputMode="numeric" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Ano projetado</span><select value={projectionForm.projection_year} onChange={(e) => setProjectionForm((prev) => ({ ...prev, projection_year: Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">{projectionYearOptions.map((year) => <option key={year} value={year}>{year} {year === selectedYear + 1 ? "(Ano +1)" : "(Ano +2)"}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-medium">% de crescimento</span><input value={projectionForm.growth_percent} onChange={(e) => setProjectionForm((prev) => ({ ...prev, growth_percent: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" /></label>
                <div className="space-y-2"><span className="text-sm font-medium">Base de cálculo</span><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{projectionReferenceItem ? `Ano ${projectionReferenceItem.projection_year}` : "Indisponível"}</div></div>
                <label className="space-y-2"><span className="text-sm font-medium">Faturamento (R$)</span><input value={projectionAutoValues.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Lucro líquido (R$)</span><input value={projectionAutoValues.netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Margem líquida (%)</span><input value={projectionAutoValues.netMargin.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Custo fixo mensal (R$)</span><input value={projectionAutoValues.monthlyFixedCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Funcionários</span><input value={projectionForm.employee_count} onChange={(e) => setProjectionForm((prev) => ({ ...prev, employee_count: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="numeric" /></label>
                <div className="space-y-2"><span className="text-sm font-medium">Capital de giro (auto)</span><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">{formatMoney(projectionAutoValues.workingCapital)}</div></div>
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium">Observações</span><textarea value={projectionForm.notes} onChange={(e) => setProjectionForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" /></label>
              </div>
              <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                {projectionForm.projection_year === selectedYear + 1
                  ? "Ano +1: cálculo automático com base nos indicadores consolidados do ano base."
                  : projectionReferenceMissing
                    ? "Ano +2: para calcular corretamente, salve primeiro a projeção do Ano +1."
                    : "Ano +2: cálculo automático usando a projeção salva do Ano +1 como referência."}
              </div>
              <div className="mt-5 flex flex-wrap gap-3 no-print">
                <button onClick={handleSaveProjection} disabled={savingProjection || projectionReferenceMissing} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">{savingProjection ? "Salvando..." : "Salvar projeção"}</button>
                <button onClick={() => setProjectionForm({ id: "", base_year: selectedYear, projection_year: selectedYear + 1, growth_percent: "0", revenue_amount: "", net_profit_amount: "", net_margin_percent: "", monthly_fixed_cost: "", employee_count: "", notes: "" })} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold">Limpar</button>
              </div>
            </SectionCard>

            <SectionCard sectionKey="meta_comercial_form" kicker="Meta Comercial" title="Cadastrar / atualizar meta comercial" collapsed={collapsedSections.meta_comercial_form} onToggle={toggleSection}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2"><span className="text-sm font-medium">Ano</span><input value={commercialForm.reference_year} onChange={(e) => setCommercialForm((prev) => ({ ...prev, reference_year: Number(e.target.value || selectedYear) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="numeric" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Mês</span><select value={commercialForm.reference_month} onChange={(e) => setCommercialForm((prev) => ({ ...prev, reference_month: Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">{MONTH_LABELS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-medium">Tipo</span><select value={commercialForm.goal_type} onChange={(e) => setCommercialForm((prev) => ({ ...prev, goal_type: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">{COMMERCIAL_GOAL_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-medium">Meta financeira (R$)</span><input value={commercialForm.goal_amount} onChange={(e) => setCommercialForm((prev) => ({ ...prev, goal_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" /></label>
                <label className="space-y-2"><span className="text-sm font-medium">Realizado (R$)</span><input value={commercialForm.actual_amount} onChange={(e) => setCommercialForm((prev) => ({ ...prev, actual_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" /></label>
                <div className="space-y-2"><span className="text-sm font-medium">Performance</span><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">{formatPercent(toNumber(commercialForm.goal_amount) > 0 ? (toNumber(commercialForm.actual_amount) / toNumber(commercialForm.goal_amount)) * 100 : 0)}</div></div>
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium">Observações</span><textarea value={commercialForm.notes} onChange={(e) => setCommercialForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" /></label>
              </div>
              <div className="mt-5 flex gap-3 no-print">
                <button onClick={handleSaveCommercialGoal} disabled={savingCommercial} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">{savingCommercial ? "Salvando..." : "Salvar meta comercial"}</button>
                <button onClick={() => setCommercialForm({ id: "", reference_year: selectedYear, reference_month: new Date().getMonth() + 1, goal_type: "Contrato Recorrente", goal_amount: "", actual_amount: "", notes: "" })} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold">Limpar</button>
              </div>
            </SectionCard>
          </div>

          <SectionCard sectionKey="projecoes_tabela" kicker="Projeção Plurianual" title="Ano atual, Ano +1 e Ano +2" collapsed={collapsedSections.projecoes_tabela} onToggle={toggleSection}>
            <div className="overflow-x-auto">
              <table className="min-w-[1280px] divide-y divide-slate-200 text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400"><th className="px-3 py-3">Ano</th><th className="px-3 py-3">Base cálculo</th><th className="px-3 py-3">% Crescimento</th><th className="px-3 py-3">Faturamento</th><th className="px-3 py-3">Lucro Líquido</th><th className="px-3 py-3">Margem</th><th className="px-3 py-3">Custo Fixo Mensal</th><th className="px-3 py-3">Funcionários</th><th className="px-3 py-3">Capital de Giro</th><th className="px-3 py-3">Δ Faturamento</th><th className="px-3 py-3">Δ Lucro</th><th className="px-3 py-3 no-print">Ações</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {projectionDisplayItems.map((item) => {
                    const baseItem = getProjectionBaseItem(item);
                    const growthPercent = getProjectionGrowthPercent(item);

                    return (
                      <tr key={`${item.base_year}-${item.projection_year}`}>
                        <td className="px-3 py-3 font-semibold">{item.projection_year}{item.is_auto_current_year || item.projection_year === selectedYear ? <div className="mt-1 text-[11px] text-sky-600">Base automática</div> : null}</td>
                        <td className="px-3 py-3">{baseItem ? `Ano ${baseItem.projection_year}` : "Ano base"}</td>
                        <td className="px-3 py-3">{growthPercent != null ? formatPercent(growthPercent) : "—"}</td>
                        <td className="px-3 py-3">{formatMoney(item.revenue_amount)}</td>
                        <td className="px-3 py-3">{formatMoney(item.net_profit_amount)}</td>
                        <td className="px-3 py-3">{formatPercent(item.net_margin_percent)}</td>
                        <td className="px-3 py-3">{formatMoney(item.monthly_fixed_cost)}</td>
                        <td className="px-3 py-3">{item.employee_count}</td>
                        <td className="px-3 py-3">{formatMoney(item.working_capital_amount)}</td>
                        <td className="px-3 py-3">{item.revenue_delta_amount != null ? <><div>{formatMoney(item.revenue_delta_amount)}</div><div className="text-xs text-slate-500">{formatPercent(item.revenue_delta_percent || 0)}</div></> : "—"}</td>
                        <td className="px-3 py-3">{item.net_profit_delta_amount != null ? <><div>{formatMoney(item.net_profit_delta_amount)}</div><div className="text-xs text-slate-500">{formatPercent(item.net_profit_delta_percent || 0)}</div></> : "—"}</td>
                        <td className="px-3 py-3 no-print"><div className="flex gap-2">{item.projection_year > selectedYear ? <button onClick={() => handleEditProjection(item)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold">Editar</button> : null}{!item.is_auto_current_year && item.id ? <button onClick={() => handleDeleteProjection(item)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Excluir</button> : null}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] xl:items-start">
            <SectionCard sectionKey="meta_comercial_tabela" kicker="Meta Comercial" title="Tabela consolidada" collapsed={collapsedSections.meta_comercial_tabela} onToggle={toggleSection}>
              <div className="overflow-x-auto">
                <table className="min-w-[860px] divide-y divide-slate-200 text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400"><th className="px-3 py-3">Mês</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Meta</th><th className="px-3 py-3">Realizado</th><th className="px-3 py-3">Performance</th><th className="px-3 py-3 no-print">Ações</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {commercialGoals.map((item) => (
                      <tr key={`${item.reference_year}-${item.reference_month}-${item.goal_type}`}>
                        <td className="px-3 py-3 font-semibold">{item.month_label}</td>
                        <td className="px-3 py-3">{item.goal_type}</td>
                        <td className="px-3 py-3">{formatMoney(item.goal_amount)}</td>
                        <td className="px-3 py-3">{formatMoney(item.actual_amount)}</td>
                        <td className="px-3 py-3">{formatPercent(item.performance_percent)}</td>
                        <td className="px-3 py-3 no-print"><div className="flex gap-2"><button onClick={() => handleEditCommercialGoal(item)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold">Editar</button>{item.id ? <button onClick={() => handleDeleteCommercialGoal(item)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Excluir</button> : null}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard sectionKey="decimo_quarto" kicker="14º salário" title="Elegibilidade automática" collapsed={collapsedSections.decimo_quarto} onToggle={toggleSection} sticky>
              <div className="space-y-4">
                <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${fourteenthEligible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                  {fourteenthRule.paymentLabel}
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">% atingimento anual</div><div className="mt-2 text-xl font-extrabold">{formatPercent(fourteenth?.achievement_percent || 0)}</div></div>
                  <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Fator aplicado</div><div className="mt-2 text-xl font-extrabold">{fourteenthRule.factor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Regra aplicada</div>
                  <div className="mt-2 font-medium text-slate-700">{fourteenthRule.ruleLabel}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Objetivo deste bloco: informar se haverá direito ao pagamento conforme o percentual atingido da meta anual, independentemente do salário individual.
                </div>
              </div>
            </SectionCard>
          </div>

          {showPlaceholders ? (
            <section className="grid gap-4 lg:grid-cols-2 no-print">
              <MetricBarsChart
                title="Gráfico mensal · Meta vs realizado"
                subtitle="Comparação mês a mês entre a meta financeira e o valor realizado."
                items={monthlyPerformanceChartItems}
                formatter={formatMoney}
                primaryLabel="Meta"
                secondaryLabel="Realizado"
              />
              <LineTrendChart
                title="Gráfico acumulado · Janeiro a dezembro"
                subtitle="Linha crescente acumulada da meta e do realizado ao longo do ano."
                items={monthlyCumulativeChartItems}
                formatter={formatMoney}
                primaryLabel="Meta acumulada"
                secondaryLabel="Realizado acumulado"
              />
              <MetricBarsChart
                title="Gráfico avançado · Faturamento projetado"
                subtitle="Comparativo do ano base com Ano +1 e Ano +2 calculados automaticamente."
                items={projectionRevenueChartItems}
                formatter={formatMoney}
                primaryLabel="Receita"
              />
              <PositiveNegativeColumnsChart
                title="Gráfico avançado · Lucro líquido projetado"
                subtitle="Colunas positivas sobem e colunas negativas descem para comparar o resultado líquido por ano."
                items={projectionProfitChartItems}
                formatter={formatMoney}
              />
              <MetricBarsChart
                title="Gráfico avançado · Meta comercial por tipo"
                subtitle="Comparação entre meta financeira e realizado consolidado por categoria comercial."
                items={commercialChartItems}
                formatter={formatMoney}
                primaryLabel="Meta"
                secondaryLabel="Realizado"
              />
              <MetricBarsChart
                title="Gráfico avançado · Plano de ação por status"
                subtitle="Distribuição das iniciativas cadastradas no plano de ação do ano selecionado."
                items={actionStatusChartItems}
                formatter={(value) => `${value.toLocaleString("pt-BR")} item(ns)`}
                primaryLabel="Itens"
              />
            </section>
          ) : null}
        </div>
      </main>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        .print-only {
          display: none;
        }
        @media print {
          .print-only {
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          main {
            background: white !important;
          }
          section {
            box-shadow: none !important;
            break-inside: avoid;
          }
          table {
            font-size: 11px !important;
          }
        }
      `}</style>
    </FinanceModuleShell>
  );
}
