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

type FourteenthForm = {
  reference_year: number;
  salary_base_amount: string;
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

export default function PlanejamentoPage() {
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [savingIndicators, setSavingIndicators] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [savingProjection, setSavingProjection] = useState(false);
  const [savingCommercial, setSavingCommercial] = useState(false);
  const [savingCommission, setSavingCommission] = useState(false);
  const [savingFourteenth, setSavingFourteenth] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [summary, setSummary] = useState<PlanningSummary | null>(null);
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

  const [fourteenthForm, setFourteenthForm] = useState<FourteenthForm>({
    reference_year: currentYear,
    salary_base_amount: "",
    notes: "",
  });

  async function loadData(token: string) {
    const requestId = ++requestIdRef.current;
    const year = Number(goalForm.reference_year || currentYear);

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const [
        summaryResponse,
        goalsResponse,
        actionsResponse,
        projectionsResponse,
        commercialResponse,
        commissionResponse,
        fourteenthResponse,
      ] = await Promise.all([
        authJson(`/api/finance/planejamento/resumo?year=${year}`, token),
        authJson(`/api/finance/planejamento/metas?year=${year}`, token),
        authJson(`/api/finance/planejamento/plano-acao?year=${year}`, token),
        authJson(`/api/finance/planejamento/projecoes?year=${year}`, token),
        authJson(`/api/finance/planejamento/meta-comercial?year=${year}`, token),
        authJson(`/api/finance/planejamento/comissao?year=${year}`, token),
        authJson(`/api/finance/planejamento/decimo-quarto?year=${year}`, token),
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

      setGoalForm((prev) => ({ ...prev, reference_year: Number(goalsResponse?.year || year) }));
      setActionForm((prev) => ({ ...prev, reference_year: Number(actionsResponse?.year || year) }));
      setProjectionForm((prev) => ({ ...prev, base_year: Number(projectionsResponse?.base_year || year) }));
      setCommercialForm((prev) => ({ ...prev, reference_year: Number(commercialResponse?.year || year) }));
      setCommissionForm({
        reference_year: Number(commissionResponse?.reference_year || year),
        commission_percent: String(commissionResponse?.commission_percent ?? 0),
        recurrent_goal_required_percent: String(commissionResponse?.recurrent_goal_required_percent ?? 100),
        notes: String(commissionResponse?.notes || ""),
      });
      setFourteenthForm({
        reference_year: Number(fourteenthResponse?.reference_year || year),
        salary_base_amount: String(fourteenthResponse?.salary_base_amount ?? ""),
        notes: String(fourteenthResponse?.notes || ""),
      });

      setMonthlyGoals(Array.isArray(goalsResponse?.months) ? goalsResponse.months : []);
      setMonthlyTotals(goalsResponse?.totals || {
        meta_amount: 0,
        actual_amount: 0,
        difference_amount: 0,
        achieved_percent: 0,
      });

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
      setCommercialTotals(commercialResponse?.totals || {
        goal_amount: 0,
        actual_amount: 0,
        performance_percent: 0,
        by_type: {},
      });

      setCommission(commissionResponse || null);
      setFourteenth(fourteenthResponse || null);
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
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
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
        reference_year: actionForm.reference_year,
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
    if (!item.id || !window.confirm(`Remover a iniciativa "${item.initiative}"?`)) return;
    try {
      const response = await authJson(`/api/finance/planejamento/plano-acao/${item.id}`, accessToken, {
        method: "DELETE",
      });
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
          revenue_amount: toNumber(projectionForm.revenue_amount),
          net_profit_amount: toNumber(projectionForm.net_profit_amount),
          net_margin_percent: toNumber(projectionForm.net_margin_percent),
          monthly_fixed_cost: toNumber(projectionForm.monthly_fixed_cost),
          employee_count: Number(projectionForm.employee_count || 0),
          notes: projectionForm.notes,
        }),
      });
      setProjections(Array.isArray(response?.items) ? response.items : []);
      setSuccess("Projeção plurianual salva com sucesso.");
      setProjectionForm({
        id: "",
        base_year: projectionForm.base_year,
        projection_year: currentYear + 1,
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
      const response = await authJson(`/api/finance/planejamento/projecoes/${item.id}`, accessToken, {
        method: "DELETE",
      });
      setProjections(Array.isArray(response?.items) ? response.items : []);
      setSuccess("Projeção removida com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover projeção.");
    }
  }

  function handleEditProjection(item: ProjectionItem) {
    setProjectionForm({
      id: item.id || "",
      base_year: item.base_year,
      projection_year: item.projection_year,
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
      const response = await authJson(
        `/api/finance/planejamento/meta-comercial/${item.id}?year=${item.reference_year}`,
        accessToken,
        { method: "DELETE" }
      );
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

  async function handleSaveFourteenth() {
    if (!accessToken) return setError("Sessão expirada ou token de autenticação indisponível. Faça login novamente.");
    setSavingFourteenth(true);
    setError("");
    setSuccess("");
    try {
      const response = await authJson("/api/finance/planejamento/decimo-quarto", accessToken, {
        method: "PUT",
        body: JSON.stringify({
          reference_year: fourteenthForm.reference_year,
          salary_base_amount: toNumber(fourteenthForm.salary_base_amount),
          notes: fourteenthForm.notes,
        }),
      });
      setFourteenth(response || null);
      setSuccess("14º salário salvo com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar 14º salário.");
    } finally {
      setSavingFourteenth(false);
    }
  }

  const actionPaybackPreview = useMemo(
    () => computePaybackMonths(actionForm.investment_amount, actionForm.expected_impact_amount),
    [actionForm.investment_amount, actionForm.expected_impact_amount]
  );

  const projectionWorkingCapitalPreview = useMemo(
    () => computeWorkingCapital(projectionForm.monthly_fixed_cost),
    [projectionForm.monthly_fixed_cost]
  );

  const commercialRecurringTotals = commercialTotals?.by_type?.["Contrato Recorrente"] || {
    goal_amount: 0,
    actual_amount: 0,
    performance_percent: 0,
  };

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
                <h1 className="mt-2 text-3xl font-black tracking-tight">Dashboard Executivo</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Patch 4: Projeção Plurianual, Meta Comercial, Comissão e 14º salário.
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
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <DashboardCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Indicadores manuais</p>
                <h2 className="mt-2 text-xl font-black">Configuração inicial</h2>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Clientes recorrentes</span>
                  <input
                    value={form.recurring_clients}
                    onChange={(e) => setForm((prev) => ({ ...prev, recurring_clients: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                    inputMode="numeric"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Ticket médio (R$)</span>
                  <input
                    value={form.average_ticket}
                    onChange={(e) => setForm((prev) => ({ ...prev, average_ticket: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                    inputMode="decimal"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.dark_mode}
                    onChange={(e) => setForm((prev) => ({ ...prev, dark_mode: e.target.checked }))}
                  />
                  <span className="text-sm">Habilitar preferência Dark Mode</span>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
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
                    className="min-h-[120px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                  />
                </label>
              </div>

              <div className="mt-5">
                <button
                  onClick={handleSaveIndicators}
                  disabled={savingIndicators}
                  className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {savingIndicators ? "Salvando..." : "Salvar indicadores"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Integrações</p>
              <h2 className="mt-2 text-xl font-black">Status da integração</h2>

              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <strong>DRE:</strong> {summary?.integration_status?.dre_ok ? "✅ conectado" : "⚠️ fallback/indisponível"}
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <strong>Snapshot financeiro / Fluxo:</strong> {summary?.integration_status?.snapshot_ok ? "✅ conectado" : "⚠️ indisponível"}
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <strong>Custos:</strong> {summary?.integration_status?.costs_ok ? "✅ conectado" : "⚠️ fallback/indisponível"}
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <strong>Ano base:</strong> {summary?.year || currentYear}
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <strong>Snapshot:</strong> {summary?.latest_batch?.created_at || "não disponível"}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Metas Mensais</p>
                  <h2 className="mt-2 text-xl font-black">Cadastrar / atualizar meta do mês</h2>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                  Ano {goalForm.reference_year}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Mês</span>
                  <select
                    value={goalForm.reference_month}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, reference_month: Number(e.target.value) }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                  >
                    {MONTH_LABELS.map((label, index) => (
                      <option key={label} value={index + 1}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Ano</span>
                  <input
                    value={goalForm.reference_year}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, reference_year: Number(e.target.value || currentYear) }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                    inputMode="numeric"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Meta (R$)</span>
                  <input
                    value={goalForm.meta_amount}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, meta_amount: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                    inputMode="decimal"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Realizado (R$)</span>
                  <input
                    value={goalForm.actual_amount}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, actual_amount: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                    inputMode="decimal"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea
                    value={goalForm.notes}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={handleSaveMonthlyGoal}
                  disabled={savingGoal}
                  className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {savingGoal ? "Salvando..." : "Salvar meta mensal"}
                </button>
                <button
                  onClick={() => setGoalForm({
                    reference_year: currentYear,
                    reference_month: new Date().getMonth() + 1,
                    meta_amount: "",
                    actual_amount: "",
                    notes: "",
                  })}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Limpar formulário
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Performance</p>
              <h2 className="mt-2 text-xl font-black">Meta x Realizado</h2>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
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

              <div className="mt-6">
                <MiniBarsChart items={monthlyGoals} />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Metas Mensais</p>
                <h2 className="mt-2 text-xl font-black">Tabela consolidada Jan–Dez</h2>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
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
                <tbody className="divide-y divide-slate-100">
                  {monthlyGoals.map((item) => (
                    <tr key={`${item.reference_year}-${item.reference_month}`}>
                      <td className="px-3 py-3 font-semibold">{item.month_label}</td>
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
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Plano de Ação</p>
                  <h2 className="mt-2 text-xl font-black">{actionForm.id ? "Editar iniciativa" : "Nova iniciativa"}</h2>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                  Payback: {actionPaybackPreview != null ? `${actionPaybackPreview.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} meses` : "—"}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Iniciativa</span>
                  <input value={actionForm.initiative} onChange={(e) => setActionForm((prev) => ({ ...prev, initiative: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Categoria</span>
                  <select value={actionForm.category} onChange={(e) => setActionForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                    {ACTION_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Responsável</span>
                  <input value={actionForm.owner_name} onChange={(e) => setActionForm((prev) => ({ ...prev, owner_name: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Data início</span>
                  <input type="date" value={actionForm.start_date} onChange={(e) => setActionForm((prev) => ({ ...prev, start_date: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Data fim</span>
                  <input type="date" value={actionForm.end_date} onChange={(e) => setActionForm((prev) => ({ ...prev, end_date: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Investimento (R$)</span>
                  <input value={actionForm.investment_amount} onChange={(e) => setActionForm((prev) => ({ ...prev, investment_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Impacto esperado (R$)</span>
                  <input value={actionForm.expected_impact_amount} onChange={(e) => setActionForm((prev) => ({ ...prev, expected_impact_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Tipo de impacto</span>
                  <select value={actionForm.impact_type} onChange={(e) => setActionForm((prev) => ({ ...prev, impact_type: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                    {ACTION_IMPACT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Status</span>
                  <select value={actionForm.status} onChange={(e) => setActionForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                    {ACTION_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea value={actionForm.notes} onChange={(e) => setActionForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[110px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={handleSaveActionPlan} disabled={savingAction} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                  {savingAction ? "Salvando..." : actionForm.id ? "Atualizar iniciativa" : "Salvar iniciativa"}
                </button>
                <button
                  onClick={() => setActionForm({
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
                  })}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                >
                  Limpar formulário
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Resumo do Plano de Ação</p>
              <h2 className="mt-2 text-xl font-black">Visão executiva</h2>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Iniciativas</div>
                  <div className="mt-2 text-xl font-extrabold">{actionSummary.total_items}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Investimento total</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(actionSummary.total_investment_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Impacto esperado</div>
                  <div className="mt-2 text-xl font-extrabold">{formatMoney(actionSummary.total_expected_impact_amount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Payback médio</div>
                  <div className="mt-2 text-xl font-extrabold">
                    {actionSummary.average_payback_months != null
                      ? `${actionSummary.average_payback_months.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} meses`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Plano de Ação</p>
                <h2 className="mt-2 text-xl font-black">Tabela consolidada</h2>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                    <th className="px-3 py-3">Iniciativa</th>
                    <th className="px-3 py-3">Categoria</th>
                    <th className="px-3 py-3">Responsável</th>
                    <th className="px-3 py-3">Início</th>
                    <th className="px-3 py-3">Fim</th>
                    <th className="px-3 py-3">Investimento</th>
                    <th className="px-3 py-3">Impacto esperado</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3">Payback</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {actionPlans.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma iniciativa cadastrada.</td>
                    </tr>
                  ) : (
                    actionPlans.map((item) => (
                      <tr key={item.id || `${item.reference_year}-${item.initiative}`}>
                        <td className="px-3 py-3">
                          <div className="font-semibold">{item.initiative}</div>
                          {item.notes ? <div className="mt-1 max-w-[260px] text-xs text-slate-500">{item.notes}</div> : null}
                        </td>
                        <td className="px-3 py-3">{item.category}</td>
                        <td className="px-3 py-3">{item.owner_name || "—"}</td>
                        <td className="px-3 py-3">{formatDateBr(item.start_date)}</td>
                        <td className="px-3 py-3">{formatDateBr(item.end_date)}</td>
                        <td className="px-3 py-3">{formatMoney(item.investment_amount)}</td>
                        <td className="px-3 py-3">{formatMoney(item.expected_impact_amount)}</td>
                        <td className="px-3 py-3">{item.impact_type === "reducao_custos" ? "Redução de custos" : "Financeiro"}</td>
                        <td className="px-3 py-3">
                          {item.payback_months != null
                            ? `${item.payback_months.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} meses`
                            : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${actionStatusTone(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => handleEditActionPlan(item)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold">Editar</button>
                            <button onClick={() => handleDeleteActionPlan(item)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Excluir</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Projeção Plurianual</p>
              <h2 className="mt-2 text-xl font-black">Cadastrar / atualizar projeção</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Ano base</span>
                  <input value={projectionForm.base_year} onChange={(e) => setProjectionForm((prev) => ({ ...prev, base_year: Number(e.target.value || currentYear) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="numeric" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Ano projetado</span>
                  <input value={projectionForm.projection_year} onChange={(e) => setProjectionForm((prev) => ({ ...prev, projection_year: Number(e.target.value || currentYear + 1) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="numeric" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Faturamento (R$)</span>
                  <input value={projectionForm.revenue_amount} onChange={(e) => setProjectionForm((prev) => ({ ...prev, revenue_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Lucro líquido (R$)</span>
                  <input value={projectionForm.net_profit_amount} onChange={(e) => setProjectionForm((prev) => ({ ...prev, net_profit_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Margem líquida (%)</span>
                  <input value={projectionForm.net_margin_percent} onChange={(e) => setProjectionForm((prev) => ({ ...prev, net_margin_percent: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Custo fixo mensal (R$)</span>
                  <input value={projectionForm.monthly_fixed_cost} onChange={(e) => setProjectionForm((prev) => ({ ...prev, monthly_fixed_cost: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Funcionários</span>
                  <input value={projectionForm.employee_count} onChange={(e) => setProjectionForm((prev) => ({ ...prev, employee_count: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="numeric" />
                </label>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Capital de giro (auto)</span>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
                    {formatMoney(projectionWorkingCapitalPreview)}
                  </div>
                </div>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea value={projectionForm.notes} onChange={(e) => setProjectionForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
              </div>

              <div className="mt-5 flex gap-3">
                <button onClick={handleSaveProjection} disabled={savingProjection} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                  {savingProjection ? "Salvando..." : "Salvar projeção"}
                </button>
                <button
                  onClick={() => setProjectionForm({
                    id: "",
                    base_year: currentYear,
                    projection_year: currentYear + 1,
                    revenue_amount: "",
                    net_profit_amount: "",
                    net_margin_percent: "",
                    monthly_fixed_cost: "",
                    employee_count: "",
                    notes: "",
                  })}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Meta Comercial</p>
              <h2 className="mt-2 text-xl font-black">Cadastrar / atualizar meta comercial</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Ano</span>
                  <input value={commercialForm.reference_year} onChange={(e) => setCommercialForm((prev) => ({ ...prev, reference_year: Number(e.target.value || currentYear) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="numeric" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Mês</span>
                  <select value={commercialForm.reference_month} onChange={(e) => setCommercialForm((prev) => ({ ...prev, reference_month: Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                    {MONTH_LABELS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Tipo</span>
                  <select value={commercialForm.goal_type} onChange={(e) => setCommercialForm((prev) => ({ ...prev, goal_type: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                    {COMMERCIAL_GOAL_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Meta financeira (R$)</span>
                  <input value={commercialForm.goal_amount} onChange={(e) => setCommercialForm((prev) => ({ ...prev, goal_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Realizado (R$)</span>
                  <input value={commercialForm.actual_amount} onChange={(e) => setCommercialForm((prev) => ({ ...prev, actual_amount: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                </label>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Performance</span>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
                    {formatPercent(
                      toNumber(commercialForm.goal_amount) > 0
                        ? (toNumber(commercialForm.actual_amount) / toNumber(commercialForm.goal_amount)) * 100
                        : 0
                    )}
                  </div>
                </div>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Observações</span>
                  <textarea value={commercialForm.notes} onChange={(e) => setCommercialForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[96px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                </label>
              </div>

              <div className="mt-5 flex gap-3">
                <button onClick={handleSaveCommercialGoal} disabled={savingCommercial} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                  {savingCommercial ? "Salvando..." : "Salvar meta comercial"}
                </button>
                <button
                  onClick={() => setCommercialForm({
                    id: "",
                    reference_year: currentYear,
                    reference_month: new Date().getMonth() + 1,
                    goal_type: "Contrato Recorrente",
                    goal_amount: "",
                    actual_amount: "",
                    notes: "",
                  })}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                >
                  Limpar
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Projeção Plurianual</p>
            <h2 className="mt-2 text-xl font-black">Ano Atual, Ano+1 e Ano+2</h2>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                    <th className="px-3 py-3">Ano</th>
                    <th className="px-3 py-3">Faturamento</th>
                    <th className="px-3 py-3">Lucro Líquido</th>
                    <th className="px-3 py-3">Margem</th>
                    <th className="px-3 py-3">Custo Fixo Mensal</th>
                    <th className="px-3 py-3">Funcionários</th>
                    <th className="px-3 py-3">Capital de Giro</th>
                    <th className="px-3 py-3">Δ Faturamento</th>
                    <th className="px-3 py-3">Δ Lucro</th>
                    <th className="px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projections.map((item) => (
                    <tr key={`${item.base_year}-${item.projection_year}`}>
                      <td className="px-3 py-3 font-semibold">
                        {item.projection_year}
                        {item.is_auto_current_year ? (
                          <div className="mt-1 text-[11px] text-sky-600">Automático</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">{formatMoney(item.revenue_amount)}</td>
                      <td className="px-3 py-3">{formatMoney(item.net_profit_amount)}</td>
                      <td className="px-3 py-3">{formatPercent(item.net_margin_percent)}</td>
                      <td className="px-3 py-3">{formatMoney(item.monthly_fixed_cost)}</td>
                      <td className="px-3 py-3">{item.employee_count}</td>
                      <td className="px-3 py-3">{formatMoney(item.working_capital_amount)}</td>
                      <td className="px-3 py-3">
                        {item.revenue_delta_amount != null ? (
                          <>
                            <div>{formatMoney(item.revenue_delta_amount)}</div>
                            <div className="text-xs text-slate-500">{formatPercent(item.revenue_delta_percent || 0)}</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {item.net_profit_delta_amount != null ? (
                          <>
                            <div>{formatMoney(item.net_profit_delta_amount)}</div>
                            <div className="text-xs text-slate-500">{formatPercent(item.net_profit_delta_percent || 0)}</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleEditProjection(item)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold">Editar</button>
                          {!item.is_auto_current_year && item.id ? (
                            <button onClick={() => handleDeleteProjection(item)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Excluir</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:items-start">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Meta Comercial</p>
              <h2 className="mt-2 text-xl font-black">Tabela consolidada</h2>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[860px] divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                      <th className="px-3 py-3">Mês</th>
                      <th className="px-3 py-3">Tipo</th>
                      <th className="px-3 py-3">Meta</th>
                      <th className="px-3 py-3">Realizado</th>
                      <th className="px-3 py-3">Performance</th>
                      <th className="px-3 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {commercialGoals.map((item) => (
                      <tr key={`${item.reference_year}-${item.reference_month}-${item.goal_type}`}>
                        <td className="px-3 py-3 font-semibold">{item.month_label}</td>
                        <td className="px-3 py-3">{item.goal_type}</td>
                        <td className="px-3 py-3">{formatMoney(item.goal_amount)}</td>
                        <td className="px-3 py-3">{formatMoney(item.actual_amount)}</td>
                        <td className="px-3 py-3">{formatPercent(item.performance_percent)}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => handleEditCommercialGoal(item)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold">Editar</button>
                            {item.id ? (
                              <button onClick={() => handleDeleteCommercialGoal(item)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Excluir</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6 2xl:sticky 2xl:top-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Comissão</p>
                <h2 className="mt-2 text-xl font-black">Configuração e cálculo automático</h2>

                <div className="mt-5 grid gap-4 grid-cols-1">
                  <label className="space-y-2">
                    <span className="text-sm font-medium">% Comissão</span>
                    <input value={commissionForm.commission_percent} onChange={(e) => setCommissionForm((prev) => ({ ...prev, commission_percent: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium">% mínimo meta recorrente</span>
                    <input value={commissionForm.recurrent_goal_required_percent} onChange={(e) => setCommissionForm((prev) => ({ ...prev, recurrent_goal_required_percent: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" inputMode="decimal" />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium">Observações</span>
                    <textarea value={commissionForm.notes} onChange={(e) => setCommissionForm((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[90px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                  </label>
                </div>

                <div className="mt-5 grid gap-3 grid-cols-1">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Meta recorrente</div>
                    <div className="mt-2 text-xl font-extrabold">{formatMoney(commercialRecurringTotals.goal_amount)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Realizado recorrente</div>
                    <div className="mt-2 text-xl font-extrabold">{formatMoney(commercialRecurringTotals.actual_amount)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Performance recorrente</div>
                    <div className="mt-2 text-xl font-extrabold">{formatPercent(commission?.recurring_performance_percent || 0)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Comissão projetada</div>
                    <div className="mt-2 text-xl font-extrabold">{formatMoney(commission?.commission_amount || 0)}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      {commission?.eligible ? "Elegível para comissão" : "Ainda não elegível"}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <button onClick={handleSaveCommission} disabled={savingCommission} className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                    {savingCommission ? "Salvando..." : "Salvar comissão"}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">14º salário</p>
                <h2 className="mt-2 text-xl font-black">Simulação automática</h2>

                <div className="mt-5 grid gap-4 grid-cols-1">
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Salário base (R$)</span>
                    <input
                      value={fourteenthForm.salary_base_amount}
                      onChange={(e) =>
                        setFourteenthForm((prev) => ({
                          ...prev,
                          salary_base_amount: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                      inputMode="decimal"
                    />
                  </label>

                  <div className="space-y-2">
                    <span className="text-sm font-medium">% atingimento anual</span>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
                      {formatPercent(fourteenth?.achievement_percent || 0)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-sm font-medium">Fator aplicado</span>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
                      {(fourteenth?.factor || 0).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} salário(s)
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-sm font-medium">Pagamento projetado</span>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
                      {formatMoney(fourteenth?.projected_payment_amount || 0)}
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium">Regra aplicada</span>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      {fourteenth?.rule_label || "Sem regra calculada"}
                    </div>
                  </div>

                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium">Observações</span>
                    <textarea
                      value={fourteenthForm.notes}
                      onChange={(e) =>
                        setFourteenthForm((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                      className="min-h-[90px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-5">
                  <button
                    onClick={handleSaveFourteenth}
                    disabled={savingFourteenth}
                    className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {savingFourteenth ? "Salvando..." : "Salvar 14º salário"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {showPlaceholders ? (
            <section className="grid gap-4 lg:grid-cols-2">
              {[
                "Gráficos avançados",
                "Relatórios / PDF / CSV",
                "Modo impressão A4",
                "Polimento responsivo final",
              ].map((title) => (
                <div
                  key={title}
                  className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm"
                >
                  <div className="text-base font-black text-slate-900">{title}</div>
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
