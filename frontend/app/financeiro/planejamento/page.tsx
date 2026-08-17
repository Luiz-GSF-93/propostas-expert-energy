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
    by_type: Record<string, {
      goal_amount: number;
      actual_amount: number;
      performance_percent: number;
    }>;
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
          {/* COLE AQUI O RESTANTE DO JSX FINAL DO PATCH 4 */}
        </div>
      </main>
    </FinanceModuleShell>
  );
}
