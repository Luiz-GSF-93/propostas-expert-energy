"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

type EntryType = "receita" | "despesa";

type CashFlowEntry = {
  id: string;
  year: number;
  month: number;
  type: EntryType;
  category: string;
  description: string;
  amount: number;
  auto_generated?: boolean;
  source?: string | null;
  source_reference_id?: string | null;
};

type CashFlowPayload = {
  year: number;
  entries: CashFlowEntry[];
  auto_expenses?: CashFlowEntry[];
};

type FormState = {
  id?: string;
  year: string;
  month: string;
  type: EntryType;
  category: string;
  description: string;
  amount: string;
};

type CategoryOption = {
  value: string;
  label: string;
};

type PivotRow = {
  key: string;
  type: EntryType;
  category: string;
  description: string;
  source: string;
  auto_generated: boolean;
  months: number[];
  total: number;
};

type CostsSnapshot = {
  fixedMonthly: number;
  fixedAnnual: number;
  variableMonthly: number;
  variableAnnual: number;
  closingCostBase: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COMPANY_NAME = "Expert Energy Performance em Energia Ltda";

const MONTHS = [
  { value: 1, label: "Janeiro", short: "Jan" },
  { value: 2, label: "Fevereiro", short: "Fev" },
  { value: 3, label: "Março", short: "Mar" },
  { value: 4, label: "Abril", short: "Abr" },
  { value: 5, label: "Maio", short: "Mai" },
  { value: 6, label: "Junho", short: "Jun" },
  { value: 7, label: "Julho", short: "Jul" },
  { value: 8, label: "Agosto", short: "Ago" },
  { value: 9, label: "Setembro", short: "Set" },
  { value: 10, label: "Outubro", short: "Out" },
  { value: 11, label: "Novembro", short: "Nov" },
  { value: 12, label: "Dezembro", short: "Dez" },
];

const REVENUE_CATEGORIES: CategoryOption[] = [
  { value: "vendas_vista", label: "Vendas à vista" },
  { value: "vendas_prazo", label: "Vendas à prazo" },
  { value: "vendas_recorrentes", label: "Vendas recorrentes" },
  { value: "receitas_financeiras", label: "Receitas financeiras" },
  { value: "receita_financiamento", label: "Receita de financiamento" },
  { value: "outras_receitas", label: "Outras receitas" },
];

const EXPENSE_CATEGORIES: CategoryOption[] = [
  { value: "custos_fixos", label: "Custos fixos" },
  { value: "custos_variaveis", label: "Custos variáveis" },
  { value: "custos_avulsos", label: "Custos avulsos" },
  { value: "investimentos_capex", label: "Investimentos / Capex" },
];

function getDefaultYear() {
  return String(new Date().getFullYear());
}

function getEmptyForm(year = getDefaultYear()): FormState {
  return {
    year,
    month: "1",
    type: "receita",
    category: REVENUE_CATEGORIES[0]?.value || "",
    description: "",
    amount: "",
  };
}

function monthLabel(month: number) {
  return MONTHS.find((item) => item.value === month)?.label || String(month);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInputAmount(value: number) {
  return String(Number(value || 0)).replace(".", ",");
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  if (/[;"\n,]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function monthTone(saldo: number) {
  return saldo >= 0
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : "bg-rose-50 text-rose-700 border border-rose-200";
}

function metricTone(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-700";
}

function entryMatchesSearch(entry: CashFlowEntry, q: string) {
  if (!q) return true;
  const haystack = [
    entry.type,
    entry.category,
    entry.description,
    entry.source,
    entry.auto_generated ? "automatico automático auto" : "manual",
    monthLabel(entry.month),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q.toLowerCase());
}

function isTruthyActive(status: unknown) {
  const raw = safeText(status).toLowerCase();
  return ["ativo", "active", "aberto", "open"].includes(raw);
}

function isVariableCostEntry(entry: Record<string, unknown>) {
  const category = safeText(entry.category).toLowerCase();
  const costType = safeText(entry.cost_type).toLowerCase();
  const description = safeText(entry.description).toLowerCase();
  const percent = toNumber(entry.percentage_rate);

  return (
    category.includes("vari") ||
    costType.includes("vari") ||
    description.includes("vari") ||
    percent > 0
  );
}

function isFixedCostEntry(entry: Record<string, unknown>) {
  if (isVariableCostEntry(entry)) return false;
  const category = safeText(entry.category).toLowerCase();
  const costType = safeText(entry.cost_type).toLowerCase();
  return category.includes("fix") || costType.includes("fix");
}

function findCardMetricValue(source: unknown, names: string[]) {
  const wanted = names.map((name) => String(name).trim().toLowerCase());

  const items = Array.isArray(source)
    ? source
    : source && typeof source === "object"
      ? Object.values(source as Record<string, unknown>)
      : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const title = String(
      record.title ?? record.label ?? record.name ?? record.key ?? ""
    )
      .trim()
      .toLowerCase();

    if (!wanted.includes(title)) continue;

    const value =
      record.value ??
      record.amount ??
      record.total ??
      record.metric ??
      record.number;

    const parsed = toNumber(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function pickNumberFromSources(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
) {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      const parsed = toNumber(value);
      if (parsed > 0) return parsed;
    }
  }
  return 0;
}

function deriveCostsFromEntries(entries: Record<string, unknown>[]) {
  const activeEntries = entries.filter((item) => isTruthyActive(item.status));

  const fixedMonthly = activeEntries
    .filter(isFixedCostEntry)
    .reduce((sum, item) => sum + toNumber(item.monthly_amount || item.amount), 0);

  const variableMonthly = activeEntries
    .filter(isVariableCostEntry)
    .reduce((sum, item) => sum + toNumber(item.monthly_amount || item.amount), 0);

  const fixedAnnual = activeEntries
    .filter(isFixedCostEntry)
    .reduce(
      (sum, item) =>
        sum +
        toNumber(
          item.annual_amount ||
            item.total_amount ||
            (toNumber(item.monthly_amount || item.amount) * 12)
        ),
      0
    );

  const variableAnnual = activeEntries
    .filter(isVariableCostEntry)
    .reduce(
      (sum, item) =>
        sum +
        toNumber(
          item.annual_amount ||
            item.total_amount ||
            (toNumber(item.monthly_amount || item.amount) * 12)
        ),
      0
    );

  return {
    fixedMonthly,
    fixedAnnual,
    variableMonthly,
    variableAnnual,
  };
}

function parseCostsSnapshot(payload: Record<string, any>): CostsSnapshot {
  const summary = payload?.summary || null;
  const metrics = payload?.metrics || null;
  const cards = payload?.cards || null;
  const summaryCards = payload?.summaryCards || null;
  const sources = [summary, metrics, payload];

  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const derived = deriveCostsFromEntries(entries);

  const fixedMonthlyFromCard =
    findCardMetricValue(cards, [
      "Total Pago de Custos Fixos",
      "Total pago de custos fixos",
    ]) ||
    findCardMetricValue(summaryCards, [
      "Total Pago de Custos Fixos",
      "Total pago de custos fixos",
    ]);

  const variableMonthlyFromCard =
    findCardMetricValue(cards, [
      "Total de Custo Variável",
      "Total de custo variável",
      "Total Custo Variável",
    ]) ||
    findCardMetricValue(summaryCards, [
      "Total de Custo Variável",
      "Total de custo variável",
      "Total Custo Variável",
    ]);

  const totalCostsFromCard =
    findCardMetricValue(cards, [
      "Custos",
      "Custo",
      "Total de Custo variável + Total pago de custos fixos",
      "Total de custo variável + total pago de custos fixos",
    ]) ||
    findCardMetricValue(summaryCards, [
      "Custos",
      "Custo",
      "Total de Custo variável + Total pago de custos fixos",
      "Total de custo variável + total pago de custos fixos",
    ]);

  const fixedMonthly =
    fixedMonthlyFromCard ||
    pickNumberFromSources(sources, [
      "total_fixed_amount",
      "total_paid_fixed_costs",
      "fixed_costs_total",
      "total_fixed_costs_monthly",
      "monthly_fixed_costs",
      "custos_fixos_mensal",
      "totalPaidFixedCosts",
    ]) ||
    derived.fixedMonthly;

  const fixedAnnual =
    pickNumberFromSources(sources, [
      "total_fixed_amount",
      "total_fixed_costs",
      "fixed_costs_annual",
      "annual_fixed_costs",
      "custos_fixos_total",
      "totalPaidFixedCostsAnnual",
    ]) ||
    derived.fixedAnnual ||
    fixedMonthly * 12;

  const variableMonthly =
    variableMonthlyFromCard ||
    pickNumberFromSources(sources, [
      "total_variable_amount",
      "total_variable_costs_monthly",
      "monthly_variable_costs",
      "variable_costs_monthly",
      "custos_variaveis_mensal",
      "totalVariableCostsMonthly",
    ]) ||
    derived.variableMonthly;

  const variableAnnual =
    pickNumberFromSources(sources, [
      "total_variable_amount",
      "total_variable_costs",
      "variable_costs_total",
      "annual_variable_costs",
      "custos_variaveis_total",
      "totalVariableCosts",
    ]) ||
    derived.variableAnnual ||
    variableMonthly * 12;

  const closingCostBase =
    pickNumberFromSources([summary, metrics, payload], [
      "total_costs",
      "totalCosts",
      "custos_total",
    ]) ||
    totalCostsFromCard ||
    (fixedMonthly + variableMonthly);

  return {
    fixedMonthly,
    fixedAnnual,
    variableMonthly,
    variableAnnual,
    closingCostBase,
  };
}


function getAnnualPivotSection(): HTMLElement | null {
  const normalize = (value: string) =>
    String(value || "")
      .normalize("NFKC")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const headings = Array.from(document.querySelectorAll("h2"));
  const targetHeading = headings.find((node) => {
    const text = normalize(node.textContent || "");
    return (
      text.includes("tabela anual em colunas jan-dez") ||
      text.includes("tabela anual em colunas")
    );
  });

  if (!targetHeading) return null;

  let current: HTMLElement | null = targetHeading.parentElement;
  while (current && current !== document.body) {
    if (current.querySelector("table")) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

async function authJson(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

  const response = await fetch(`/api/backend?path=${encodeURIComponent(path)}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.message || `Erro HTTP ${response.status}`);
  }

  return json;
}

function ExecutiveCard({
  title,
  value,
  subtitle,
  accent = "slate",
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent?: "emerald" | "rose" | "sky" | "amber" | "violet" | "slate";
}) {
  const styles: Record<string, string> = {
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    rose: "border-rose-200 bg-gradient-to-br from-rose-50 to-white",
    sky: "border-sky-200 bg-gradient-to-br from-sky-50 to-white",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
    violet: "border-violet-200 bg-gradient-to-br from-violet-50 to-white",
    slate: "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${styles[accent]}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
      {subtitle ? <div className="mt-2 text-sm text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function MiniBarChart({
  data,
  colorClass,
}: {
  data: { label: string; value: number }[];
  colorClass: string;
}) {
  const maxValue = Math.max(...data.map((item) => Math.abs(item.value)), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = Math.max(2, (Math.abs(item.value) / maxValue) * 100);
        return (
          <div key={item.label} className="grid grid-cols-[44px_1fr_120px] items-center gap-3">
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="h-3 rounded-full bg-slate-100">
              <div
                className={`h-3 rounded-full ${colorClass}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <div className={`text-right text-sm font-medium ${metricTone(item.value)}`}>
              {formatMoney(item.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}


export default function FluxoCaixaPage() {
  const router = useRouter();

  const [year, setYear] = useState(getDefaultYear());
  const [payload, setPayload] = useState<CashFlowPayload>({
    year: Number(getDefaultYear()),
    entries: [],
    auto_expenses: [],
  });
  const [costsSnapshot, setCostsSnapshot] = useState<CostsSnapshot>({
    fixedMonthly: 0,
    fixedAnnual: 0,
    variableMonthly: 0,
    variableAnnual: 0,
    closingCostBase: 0,
  });
  const [form, setForm] = useState<FormState>(getEmptyForm(getDefaultYear()));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [sectionsOpen, setSectionsOpen] = useState({
    monthly: true,
    pivot: true,
    detailed: true,
  });

  const categories =
    form.type === "receita" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

  function resetForm(nextYear = year) {
    setForm(getEmptyForm(nextYear));
  }

  function toggleSection(key: "monthly" | "pivot" | "detailed") {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);
      setSuccess("");

      const [cashFlowResponse, costsResponse] = await Promise.all([
        authJson(`/api/finance/fluxo-caixa?year=${encodeURIComponent(year)}`),
        authJson("/api/finance/custos-v2/dashboard"),
      ]);

      setPayload({
        year: Number(cashFlowResponse?.year || year),
        entries: Array.isArray(cashFlowResponse?.entries)
          ? cashFlowResponse.entries
          : [],
        auto_expenses: Array.isArray(cashFlowResponse?.auto_expenses)
          ? cashFlowResponse.auto_expenses
          : [],
      });

      setCostsSnapshot(parseCostsSnapshot(costsResponse || {}));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar fluxo de caixa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [year]);

  useEffect(() => {
    setForm((prev) => (prev.id ? prev : { ...prev, year }));
  }, [year]);

  const manualEntries = useMemo(() => payload.entries || [], [payload]);
  const autoEntries = useMemo(() => payload.auto_expenses || [], [payload]);

  const allEntries = useMemo(() => {
    return [...manualEntries, ...autoEntries].sort((a, b) => {
      if (a.month !== b.month) return a.month - b.month;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.description.localeCompare(b.description);
    });
  }, [manualEntries, autoEntries]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((item) => entryMatchesSearch(item, search));
  }, [allEntries, search]);

  const monthlySummary = useMemo(() => {
    return MONTHS.map((month) => {
      const items = allEntries.filter((item) => Number(item.month) === month.value);

      const entradas = items
        .filter((item) => item.type === "receita")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);

      const saidas = items
        .filter((item) => item.type === "despesa")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);

      const custosFixos = items
        .filter((item) => item.type === "despesa" && item.category === "custos_fixos")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);

      const custosVariaveis = items
        .filter((item) => item.type === "despesa" && item.category === "custos_variaveis")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);

      const emprestimos = items
        .filter((item) => item.type === "despesa" && item.category === "emprestimo")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);

      const saldo = entradas - saidas;

      return {
        month: month.value,
        monthLabel: month.label,
        monthShort: month.short,
        entradas,
        saidas,
        saldo,
        custosFixos,
        custosVariaveis,
        emprestimos,
        indicador: saldo >= 0 ? "✅ positivo" : "⚠️ prejuízo",
      };
    });
  }, [allEntries]);

  const monthlyAccumulated = useMemo(() => {
    let running = 0;
    return monthlySummary.map((item) => {
      running += item.saldo;
      return {
        ...item,
        acumulado: running,
      };
    });
  }, [monthlySummary]);

  const totalEntradas = useMemo(
    () => monthlySummary.reduce((sum, item) => sum + item.entradas, 0),
    [monthlySummary]
  );

  const totalSaidas = useMemo(
    () => monthlySummary.reduce((sum, item) => sum + item.saidas, 0),
    [monthlySummary]
  );

  const saldoFinal = totalEntradas - totalSaidas;

  const saldoFechamento = totalEntradas - ((costsSnapshot.closingCostBase || 0) * 12);
  const reservaMinima = costsSnapshot.fixedMonthly * 3;

  const monthsWithMovement = useMemo(
    () =>
      monthlySummary.filter(
        (item) => item.entradas > 0 || item.saidas > 0 || item.saldo !== 0
      ),
    [monthlySummary]
  );

  const melhorMes = useMemo(() => {
    if (monthsWithMovement.length === 0) return null;
    return [...monthsWithMovement].sort((a, b) => b.saldo - a.saldo)[0];
  }, [monthsWithMovement]);

  const piorMes = useMemo(() => {
    if (monthsWithMovement.length === 0) return null;
    return [...monthsWithMovement].sort((a, b) => a.saldo - b.saldo)[0];
  }, [monthsWithMovement]);

  const indicadorReserva =
    saldoFinal < reservaMinima
      ? "⚠️ Abaixo da reserva ideal de 3 meses"
      : "✅ Reserva adequada";

  const pivotRows = useMemo<PivotRow[]>(() => {
    const map = new Map<string, PivotRow>();

    filteredEntries.forEach((entry) => {
      const source = safeText(entry.source || (entry.auto_generated ? "automático" : "manual"));
      const key = [
        entry.type,
        entry.category,
        entry.description,
        source,
        entry.auto_generated ? "1" : "0",
      ].join("::");

      if (!map.has(key)) {
        map.set(key, {
          key,
          type: entry.type,
          category: entry.category,
          description: entry.description,
          source,
          auto_generated: Boolean(entry.auto_generated),
          months: new Array(12).fill(0),
          total: 0,
        });
      }

      const row = map.get(key)!;
      const idx = Math.max(0, Math.min(11, Number(entry.month) - 1));
      row.months[idx] += toNumber(entry.amount);
      row.total += toNumber(entry.amount);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.description.localeCompare(b.description);
    });
  }, [filteredEntries]);

  const pivotTotals = useMemo(() => {
    const months = new Array(12).fill(0);
    let total = 0;

    pivotRows.forEach((row) => {
      row.months.forEach((value, index) => {
        months[index] += value;
      });
      total += row.total;
    });

    return { months, total };
  }, [pivotRows]);

  const entradasChart = useMemo(
    () => monthlySummary.map((item) => ({ label: item.monthShort, value: item.entradas })),
    [monthlySummary]
  );

  const saidasChart = useMemo(
    () => monthlySummary.map((item) => ({ label: item.monthShort, value: item.saidas })),
    [monthlySummary]
  );

  const acumuladoChart = useMemo(
    () => monthlyAccumulated.map((item) => ({ label: item.monthShort, value: item.acumulado })),
    [monthlyAccumulated]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setSuccess("");

      const targetYear = Number(form.year);
      const payloadBody = {
        year: targetYear,
        month: Number(form.month),
        type: form.type,
        category: form.category,
        description: form.description.trim(),
        amount: Number(toNumber(form.amount).toFixed(2)),
      };

      if (!payloadBody.description) throw new Error("Descrição obrigatória.");
      if (payloadBody.amount <= 0) throw new Error("Valor deve ser maior que zero.");

      if (form.id) {
        await authJson(`/api/finance/fluxo-caixa/${form.id}`, {
          method: "PUT",
          body: JSON.stringify(payloadBody),
        });
        setSuccess("Lançamento atualizado com sucesso.");
      } else {
        await authJson("/api/finance/fluxo-caixa", {
          method: "POST",
          body: JSON.stringify(payloadBody),
        });
        setSuccess("Lançamento criado com sucesso.");
      }

      if (String(targetYear) !== year) {
        setYear(String(targetYear));
      } else {
        await load();
      }

      resetForm(String(targetYear));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar lançamento.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(entry: CashFlowEntry) {
    if (entry.auto_generated) return;

    setForm({
      id: entry.id,
      year: String(entry.year),
      month: String(entry.month),
      type: entry.type,
      category: entry.category,
      description: entry.description,
      amount: formatInputAmount(entry.amount),
    });

    setSuccess("");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(entry: CashFlowEntry) {
    if (entry.auto_generated) {
      setError("Lançamentos automáticos não podem ser excluídos manualmente.");
      return;
    }

    const confirmed = window.confirm(`Excluir o lançamento "${entry.description}"?`);
    if (!confirmed) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess("");

      await authJson(`/api/finance/fluxo-caixa/${entry.id}`, {
        method: "DELETE",
      });

      setSuccess("Lançamento excluído com sucesso.");
      if (form.id === entry.id) resetForm();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao excluir lançamento.");
    } finally {
      setSaving(false);
    }
  }

  function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
    const csv = [header, ...rows]
      .map((line) => line.map(csvEscape).join(";"))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    try {
      setExporting(true);

      const header = [
        "Ano",
        "Mês",
        "Tipo",
        "Categoria",
        "Descrição",
        "Origem",
        "Automático",
        "Valor",
      ];

      const rows = filteredEntries.map((item) => [
        item.year,
        monthLabel(item.month),
        item.type,
        item.category,
        item.description,
        item.source || (item.auto_generated ? "automático" : "manual"),
        item.auto_generated ? "sim" : "não",
        toNumber(item.amount).toFixed(2).replace(".", ","),
      ]);

      downloadCsv(`fluxo-caixa-detalhado-${year}.csv`, header, rows);
    } finally {
      setExporting(false);
    }
  }

  function handleExportPivotCsv() {
    const header = [
      "Tipo",
      "Categoria",
      "Descrição",
      "Origem",
      ...MONTHS.map((m) => m.short),
      "Total ano",
    ];

    const rows = pivotRows.map((row) => [
      row.type,
      row.category,
      row.description,
      row.source,
      ...row.months.map((value) => value.toFixed(2).replace(".", ",")),
      row.total.toFixed(2).replace(".", ","),
    ]);

    downloadCsv(`fluxo-caixa-pivot-${year}.csv`, header, rows);
  }

  function handlePrint() {
    const pivotSection = getAnnualPivotSection();
    if (pivotSection) {
      pivotSection.classList.add("cashflow-hide-on-full-print");
    }

    document.body.classList.add("cashflow-full-print");
    window.print();
  }

  function handlePrintPivotOnly() {
    const section = getAnnualPivotSection();

    if (!section) {
      window.alert("Tabela anual não encontrada para impressão.");
      return;
    }

    const popup = window.open("", "_blank", "width=1600,height=1000");

    if (!popup) {
      window.alert("Não foi possível abrir a janela de impressão.");
      return;
    }

    const issuedAt = new Date().toLocaleString("pt-BR");

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Tabela anual em colunas jan-dez</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 8mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }

            .print-shell {
              width: 100%;
              padding: 0;
              margin: 0;
            }

            .print-header {
              margin-bottom: 12px;
              border: 1px solid #cbd5e1;
              border-radius: 10px;
              padding: 12px 14px;
              background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
            }

            .print-header-top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 12px;
              margin-bottom: 8px;
            }

            .print-brand {
              min-width: 0;
            }

            .print-kicker {
              margin: 0 0 4px 0;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #475569;
            }

            .print-company {
              margin: 0;
              font-size: 20px;
              font-weight: 700;
              color: #0f172a;
            }

            .print-title {
              margin: 4px 0 0 0;
              font-size: 12px;
              color: #334155;
            }

            .print-meta {
              min-width: 240px;
              border: 1px solid #dbeafe;
              border-radius: 8px;
              background: #ffffff;
              padding: 8px 10px;
            }

            .print-meta-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              font-size: 10px;
              line-height: 1.4;
              margin-bottom: 4px;
            }

            .print-meta-row:last-child {
              margin-bottom: 0;
            }

            .print-meta-label {
              font-weight: 700;
              color: #475569;
            }

            .print-meta-value {
              color: #0f172a;
              text-align: right;
            }

            .print-note {
              margin: 0;
              padding-top: 8px;
              border-top: 1px solid #dbeafe;
              font-size: 10px;
              color: #475569;
            }

            section {
              border: 1px solid #cbd5e1;
              border-radius: 10px;
              padding: 10px;
              overflow: hidden;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            thead th {
              font-size: 7px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              color: #334155;
              border-bottom: 1px solid #cbd5e1;
              background: #f8fafc;
              padding: 4px 3px;
              text-align: left;
            }

            tbody td {
              font-size: 7px;
              line-height: 1.1;
              padding: 4px 3px;
              border-bottom: 1px solid #e2e8f0;
              vertical-align: top;
              word-break: break-word;
              overflow-wrap: anywhere;
            }

            tbody tr:nth-child(even) {
              background: #fcfcfd;
            }

            th:nth-child(1), td:nth-child(1) { width: 6%; }
            th:nth-child(2), td:nth-child(2) { width: 10%; }
            th:nth-child(3), td:nth-child(3) { width: 15%; }
            th:nth-child(4), td:nth-child(4) { width: 8%; }
            th:nth-child(n+5), td:nth-child(n+5) {
              width: 4.8%;
              text-align: center;
            }

            .text-emerald-700 { color: #047857 !important; }
            .text-rose-700 { color: #be123c !important; }
            .text-slate-900,
            .text-slate-800,
            .text-slate-700,
            .text-slate-600,
            .text-slate-500 {
              color: #0f172a !important;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-shell">
            <div class="print-header">
              <div class="print-header-top">
                <div class="print-brand">
                  <p class="print-kicker">Módulo Financeiro</p>
                  <h1 class="print-company">${COMPANY_NAME}</h1>
                  <p class="print-title">Tabela anual em colunas jan–dez · Fluxo de Caixa</p>
                </div>

                <div class="print-meta">
                  <div class="print-meta-row">
                    <span class="print-meta-label">Ano</span>
                    <span class="print-meta-value">${payload.year}</span>
                  </div>
                  <div class="print-meta-row">
                    <span class="print-meta-label">Emitido em</span>
                    <span class="print-meta-value">${issuedAt}</span>
                  </div>
                  <div class="print-meta-row">
                    <span class="print-meta-label">Formato</span>
                    <span class="print-meta-value">A4 horizontal</span>
                  </div>
                </div>
              </div>

              <p class="print-note">
                Consolidação anual por tipo, categoria e descrição para análise gerencial e impressão.
              </p>
            </div>

            ${section.outerHTML}
          </div>
        </body>
      </html>
    `;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();

    setTimeout(() => {
      popup.print();
    }, 400);
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 7mm;
        }

        @media print {
          html,
          body {
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .screen-only-cards {
            display: none !important;
          }

          .print-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }

          .print-summary,
          .print-table {
            box-shadow: none !important;
            border-color: #cbd5e1 !important;
            break-inside: avoid-page;
            page-break-inside: avoid;
            overflow: visible !important;
            margin-bottom: 8px !important;
          }

          .print-summary {
            break-after: page;
            page-break-after: always;
          }

          .print-table table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
          }

          .print-table th,
          .print-table td {
            padding: 4px 5px !important;
            font-size: 8px !important;
            line-height: 1.2 !important;
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
            vertical-align: top !important;
          }

          .print-table th {
            font-size: 7px !important;
            letter-spacing: 0.04em !important;
            text-transform: uppercase !important;
          }

          .print-monthly {
            break-before: auto;
            page-break-before: auto;
          }

          .print-monthly table {
            width: 100% !important;
            transform: none !important;
          }

          .print-pivot {
            break-before: page;
            page-break-before: always;
            overflow: hidden !important;
          }

          .print-pivot table {
            width: 100% !important;
            table-layout: fixed !important;
            transform: none !important;
            margin: 0 !important;
          }

          .print-pivot th,
          .print-pivot td {
            font-size: 6.5px !important;
            line-height: 1.05 !important;
            padding: 3px 2px !important;
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
          }

          .print-pivot th:nth-child(1),
          .print-pivot td:nth-child(1) {
            width: 7% !important;
          }

          .print-pivot th:nth-child(2),
          .print-pivot td:nth-child(2) {
            width: 10% !important;
          }

          .print-pivot th:nth-child(3),
          .print-pivot td:nth-child(3) {
            width: 14% !important;
          }

          .print-pivot th:nth-child(4),
          .print-pivot td:nth-child(4) {
            width: 8% !important;
          }

          .print-pivot th:nth-child(n+5),
          .print-pivot td:nth-child(n+5) {
            width: 4.7% !important;
            text-align: center !important;
          }

          .print-detail {
            break-before: page;
            page-break-before: always;
          }

          body.cashflow-full-print .print-pivot {
            display: none !important;
          }

          .cashflow-hide-on-full-print {
            display: none !important;
          }

          .print-detail table {
            width: 114% !important;
            transform: scale(0.875) !important;
            transform-origin: top left !important;
          }

          .print-dense-table th,
          .print-dense-table td {
            padding: 4px 5px !important;
            font-size: 8px !important;
          }
        }

        .print-only {
          display: none;
        }
      `}</style>

      <div className="print-wrapper space-y-6 p-4 md:p-6">
        <div className="print-only border-b border-slate-300 pb-3">
          <h1 className="text-xl font-bold text-slate-900">{COMPANY_NAME}</h1>
          <p className="text-sm text-slate-600">Relatório de Fluxo de Caixa — Ano {payload.year}</p>
          <p className="text-xs text-slate-500">
            Resumo executivo, evolução financeira e tabela anual consolidada.
          </p>
        </div>

        <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Fluxo de Caixa</h1>
              <p className="text-sm text-slate-500">
                Receitas manuais, despesas manuais, custos variáveis automáticos e parcelas reais de empréstimos por mês.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <button
                onClick={() => router.push("/financeiro")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar ao dashboard
              </button>

              <button
                onClick={() => setYear(String(Number(year || getDefaultYear()) - 1))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ano anterior
              </button>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Ano
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={() => setYear(String(Number(year || getDefaultYear()) + 1))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Próximo ano
              </button>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Filtro
                </label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Categoria, descrição, origem..."
                  className="w-64 max-w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={load}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Atualizar
              </button>

              <button
                onClick={handleExportCsv}
                disabled={exporting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {exporting ? "Exportando..." : "CSV detalhado"}
              </button>

              <button
                onClick={handleExportPivotCsv}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                CSV pivotado
              </button>

              <button
                onClick={handlePrint}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Imprimir A4
              </button>

              <button
                onClick={handlePrintPivotOnly}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Imprimir tabela anual A4 horizontal
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="no-print rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="no-print rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="screen-only-cards grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
          <ExecutiveCard
            title="Entradas anuais"
            value={formatMoney(totalEntradas)}
            subtitle="Receitas lançadas no ano"
            accent="emerald"
          />
          <ExecutiveCard
            title="Saídas anuais"
            value={formatMoney(totalSaidas)}
            subtitle="Despesas totais do fluxo"
            accent="rose"
          />
          <ExecutiveCard
            title="Saldo final"
            value={formatMoney(saldoFinal)}
            subtitle="Entradas - saídas"
            accent="sky"
          />
          <ExecutiveCard
            title="Saldo de fechamento"
            value={formatMoney(saldoFechamento)}
            subtitle="Entradas anuais - (card Custos da API Custos × 12)"
            accent="slate"
          />
          <ExecutiveCard
            title="Melhor mês"
            value={melhorMes ? melhorMes.monthLabel : "—"}
            subtitle={melhorMes ? formatMoney(melhorMes.saldo) : "Sem dados"}
            accent="amber"
          />
          <ExecutiveCard
            title="Pior mês"
            value={piorMes ? piorMes.monthLabel : "—"}
            subtitle={piorMes ? formatMoney(piorMes.saldo) : "Sem dados"}
            accent="violet"
          />
          <ExecutiveCard
            title="Reserva mínima"
            value={formatMoney(reservaMinima)}
            subtitle="Custos fixos da API Custos × 3"
            accent="slate"
          />
        </div>

        <div className="print-summary rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Resumo executivo</h2>
            <p className="text-sm text-slate-500">
              Painel consolidado do ano {payload.year}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Entradas anuais</div>
              <div className="mt-2 text-lg font-semibold text-emerald-700">{formatMoney(totalEntradas)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Saídas anuais</div>
              <div className="mt-2 text-lg font-semibold text-rose-700">{formatMoney(totalSaidas)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Saldo final</div>
              <div className={`mt-2 text-lg font-semibold ${metricTone(saldoFinal)}`}>{formatMoney(saldoFinal)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Saldo de fechamento</div>
              <div className={`mt-2 text-lg font-semibold ${metricTone(saldoFechamento)}`}>{formatMoney(saldoFechamento)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Melhor mês</div>
              <div className="mt-2 text-base font-semibold text-slate-900">
                {melhorMes ? `${melhorMes.monthLabel} · ${formatMoney(melhorMes.saldo)}` : "Sem dados"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Pior mês</div>
              <div className="mt-2 text-base font-semibold text-slate-900">
                {piorMes ? `${piorMes.monthLabel} · ${formatMoney(piorMes.saldo)}` : "Sem dados"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Reserva mínima</div>
              <div className="mt-2 text-base font-semibold text-slate-900">{formatMoney(reservaMinima)}</div>
              <div className="mt-1 text-xs text-slate-500">Base: custos fixos da API Custos × 3</div>
            </div>
          </div>
        </div>

        <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {form.id ? "Editar lançamento manual" : "Novo lançamento manual"}
            </h2>
            <p className="text-sm text-slate-500">
              Custos fixos são manuais. Custos variáveis e empréstimos são automáticos.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Ano</label>
              <input
                value={form.year}
                onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Mês</label>
              <select
                value={form.month}
                onChange={(e) => setForm((prev) => ({ ...prev, month: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {MONTHS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => {
                  const nextType = e.target.value as EntryType;
                  const nextCategories =
                    nextType === "receita" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

                  setForm((prev) => ({
                    ...prev,
                    type: nextType,
                    category: nextCategories[0]?.value || "",
                  }));
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Descrição</label>
              <input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ex.: Venda à vista, compra emergencial, honorários..."
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Valor R$</label>
              <input
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="0,00"
              />
            </div>

            <div className="flex items-end gap-2 xl:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : form.id ? "Salvar edição" : "Salvar"}
              </button>

              <button
                type="button"
                onClick={() => resetForm()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </button>
            </div>
          </form>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="print-table rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Saldo acumulado</h2>
              <p className="text-sm text-slate-500">Evolução mês a mês.</p>
            </div>
            <MiniBarChart
              data={monthlyAccumulated.map((item) => ({ label: item.monthShort, value: item.acumulado }))}
              colorClass="bg-sky-500"
            />
          </div>

          <div className="print-table rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Entradas mensais</h2>
              <p className="text-sm text-slate-500">Receitas do ano.</p>
            </div>
            <MiniBarChart
              data={monthlySummary.map((item) => ({ label: item.monthShort, value: item.entradas }))}
              colorClass="bg-emerald-500"
            />
          </div>

          <div className="print-table rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Saídas mensais</h2>
              <p className="text-sm text-slate-500">Despesas do ano.</p>
            </div>
            <MiniBarChart
              data={monthlySummary.map((item) => ({ label: item.monthShort, value: item.saidas }))}
              colorClass="bg-rose-500"
            />
          </div>
        </div>

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Resumo mensal de {payload.year}</h2>
            </div>
            <button
              type="button"
              onClick={() => toggleSection("monthly")}
              className="no-print rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {sectionsOpen.monthly ? "Recuar" : "Expandir"}
            </button>
          </div>

          {sectionsOpen.monthly ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm print-dense-table">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Mês</th>
                    <th className="px-4 py-3 text-right">Entradas</th>
                    <th className="px-4 py-3 text-right">Saídas</th>
                    <th className="px-4 py-3 text-right">Custos fixos</th>
                    <th className="px-4 py-3 text-right">Custos variáveis</th>
                    <th className="px-4 py-3 text-right">Empréstimos</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Acumulado</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAccumulated.map((item) => (
                    <tr key={item.month} className="border-t border-slate-100">
                      <td className="px-4 py-3">{item.monthLabel}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{formatMoney(item.entradas)}</td>
                      <td className="px-4 py-3 text-right text-rose-700">{formatMoney(item.saidas)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(item.custosFixos)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(item.custosVariaveis)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(item.emprestimos)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(item.saldo)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${metricTone(item.acumulado)}`}>
                        {formatMoney(item.acumulado)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${monthTone(item.saldo)}`}>
                          {item.indicador}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tabela anual em colunas jan–dez</h2>
              <p className="text-sm text-slate-500">
                {search ? `Filtro aplicado: "${search}"` : "Consolidação anual por tipo, categoria e descrição."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleSection("pivot")}
              className="no-print rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {sectionsOpen.pivot ? "Recuar" : "Expandir"}
            </button>
          </div>

          {sectionsOpen.pivot ? (
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] text-sm print-dense-table">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Origem</th>
                    {MONTHS.map((month) => (
                      <th key={month.value} className="px-4 py-3 text-right">
                        {month.short}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Total ano</th>
                  </tr>
                </thead>
                <tbody>
                  {pivotRows.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-6 text-center text-slate-500">
                        Nenhum lançamento encontrado para o filtro atual.
                      </td>
                    </tr>
                  ) : (
                    pivotRows.map((row) => (
                      <tr key={row.key} className="border-t border-slate-100">
                        <td className={`px-4 py-3 font-medium ${row.type === "despesa" ? "text-rose-700" : "text-emerald-700"}`}>
                          {row.type}
                        </td>
                        <td className="px-4 py-3">{row.category}</td>
                        <td className="px-4 py-3">{row.description}</td>
                        <td className="px-4 py-3">{row.source}</td>
                        {row.months.map((value, index) => (
                          <td
                            key={`${row.key}-${index}`}
                            className={`px-4 py-3 text-right ${
                              row.type === "despesa" ? "text-rose-700" : "text-emerald-700"
                            }`}
                          >
                            {value ? formatMoney(value) : "—"}
                          </td>
                        ))}
                        <td className={`px-4 py-3 text-right font-semibold ${
                          row.type === "despesa" ? "text-rose-700" : "text-emerald-700"
                        }`}>
                          {formatMoney(row.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Lançamentos detalhados</h2>
            </div>
            <button
              type="button"
              onClick={() => toggleSection("detailed")}
              className="no-print rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {sectionsOpen.detailed ? "Recuar" : "Expandir"}
            </button>
          </div>

          {sectionsOpen.detailed ? (
            loading ? (
              <div className="p-5 text-sm text-slate-500">Carregando...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                Nenhum lançamento encontrado para o filtro atual.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm print-dense-table">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Mês</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Descrição</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="no-print px-4 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">{monthLabel(item.month)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              item.type === "despesa"
                                ? "font-medium text-rose-700"
                                : "font-medium text-emerald-700"
                            }
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">{item.category}</td>
                        <td className="px-4 py-3">{item.description}</td>
                        <td className="px-4 py-3">
                          {item.source || (item.auto_generated ? "automático" : "manual")}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            item.type === "despesa"
                              ? "text-rose-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {formatMoney(item.amount)}
                        </td>
                        <td className="no-print px-4 py-3 text-center">
                          {item.auto_generated ? (
                            <span className="text-xs text-slate-400">Automático</span>
                          ) : (
                            <div className="flex justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEdit(item)}
                                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                className="rounded-md border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                Excluir
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
