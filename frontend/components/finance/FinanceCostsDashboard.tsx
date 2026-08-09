"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type CostCategory = "fixo" | "variavel";

type DashboardEntry = {
  id: string;
  category: CostCategory;
  description: string;
  cost_type: string;
  supplier: string | null;
  due_day: number | null;
  monthly_amount: number;
  percentage_rate: number;
  monthly_impact: number;
  fractional_percent: number;
    computed_monthly_impact?: number;
  computed_fractional_percent?: number;
status: string;
  created_at: string | null;
  updated_at: string | null;
  origin_module?: string | null;
  origin_contract_id?: string | null;
  auto_generated?: boolean;
  allow_manual_edit?: boolean;
  allow_manual_delete?: boolean;
};

type DashboardData = {
  settings?: {
    estimated_revenue?: number;
  };
  summary?: {
    total_fixed_amount?: number;
    total_variable_percent?: number;
    total_variable_amount?: number;
    total_costs?: number;
    total_entries?: number;
    fixed_entries?: number;
    variable_entries?: number;
  };
  top_five_costs?: DashboardEntry[] | null;
  entries?: DashboardEntry[];
};

type CostForm = {
  category: CostCategory;
  description: string;
  costType: string;
  supplier: string;
  dueDay: string;
  monthlyAmount: string;
  percentageRate: string;
};

const COST_TYPE_OPTIONS = [
  "aluguel",
  "salários",
  "pró-labore",
  "energia elétrica",
  "condomínio",
  "predial",
  "internet",
  "telefone",
  "contabilidade",
  "assessoria jurídica",
  "software/sistema",
  "marketing",
  "seguro",
  "convênio médico",
  "cesta bancária",
  "bônus",
  "classe profissional",
  "sindicato",
  "material de escritório",
  "limpeza/conservação",
  "telemóvel corporativo",
  "serviço M2M",
  "comissões",
  "taxa de cartão",
  "frete/entrega",
  "embalagem",
  "matéria-prima/CMV",
  "royalties/licenças",
  "marketing variável",
  "comissão finder",
  "outros variáveis",
  "outros fixos",
];

const EMPTY_FORM: CostForm = {
  category: "fixo",
  description: "",
  costType: "aluguel",
  supplier: "",
  dueDay: "",
  monthlyAmount: "",
  percentageRate: "",
};

function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercentBR(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDateBR(value?: string | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}


function getMonthlyImpact(
  entry: {
    category?: string;
    monthly_amount?: number | null;
    percentage_rate?: number | null;
  },
  estimatedRevenue: number
) {
  const monthlyAmount = Number(entry?.monthly_amount || 0);
  const percentageRate = Number(entry?.percentage_rate || 0);

  if (String(entry?.category || "").toLowerCase() === "variavel") {
    return (estimatedRevenue * percentageRate) / 100;
  }

  return monthlyAmount;
}

function getCostPercent(entry: {
  category?: string;
  percentage_rate?: number | null;
}) {
  if (String(entry?.category || "").toLowerCase() !== "variavel") {
    return null;
  }

  return Number(entry?.percentage_rate || 0);
}

function getFractionalPercent(
  entry: {
    category?: string;
    monthly_amount?: number | null;
    percentage_rate?: number | null;
  },
  estimatedRevenue: number,
  totalCosts: number
) {
  const impact = getMonthlyImpact(entry, estimatedRevenue);
  return totalCosts > 0 ? (impact / totalCosts) * 100 : 0;
}

export default function FinanceCostsDashboard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [estimatedRevenue, setEstimatedRevenue] = useState("0");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CostForm>(EMPTY_FORM);

  async function getToken() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw new Error("Erro ao obter sessão do usuário.");
    }

    if (!session?.access_token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    return session.access_token;
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const token = await getToken();
      const response = await apiFetch("/api/finance/custos-v2/dashboard", token);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.message || "Erro ao carregar dashboard de custos.");
      }

      setDashboard(json);
      setEstimatedRevenue(String(json?.settings?.estimated_revenue ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const entries = useMemo(() => dashboard?.entries || [], [dashboard]);
  const dashboardEstimatedRevenue = Number(dashboard?.settings?.estimated_revenue || 0);
  const dashboardTotalCosts = Number(dashboard?.summary?.total_costs || 0);
  const topFiveCosts = useMemo(
    () =>
      [...entries]
        .map((entry) => ({
          ...entry,
          computed_monthly_impact: getMonthlyImpact(entry, dashboardEstimatedRevenue),
          computed_fractional_percent: getFractionalPercent(
            entry,
            dashboardEstimatedRevenue,
            dashboardTotalCosts
          ),
        }))
        .sort((a, b) => b.computed_monthly_impact - a.computed_monthly_impact)
        .slice(0, 5),
    [entries, dashboardEstimatedRevenue, dashboardTotalCosts]
  );


  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((entry) => {
      return [
        entry.category,
        entry.description,
        entry.cost_type,
        entry.supplier || "",
        String(entry.due_day || ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [entries, search]);

  const topFive = useMemo(() => {
    const source =
      filteredEntries.length > 0 || search.trim()
        ? filteredEntries
        : Array.isArray(dashboard?.top_five_costs)
        ? dashboard?.top_five_costs || []
        : entries;

    return [...source]
      .sort((a, b) => Number(b.monthly_impact || 0) - Number(a.monthly_impact || 0))
      .slice(0, 5);
  }, [dashboard, entries, filteredEntries, search]);

  const totalSharePct = useMemo(() => {
    return filteredEntries.reduce(
      (sum, item) => sum + Number(item.fractional_percent || 0),
      0
    );
  }, [filteredEntries]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  function handleEdit(entry: DashboardEntry) {
    setEditingId(entry.id);
    setForm({
      category: entry.category,
      description: entry.description || "",
      costType: entry.cost_type || (entry.category === "variavel" ? "comissões" : "aluguel"),
      supplier: entry.supplier || "",
      dueDay: entry.category === "fixo" && entry.due_day ? String(entry.due_day) : "",
      monthlyAmount: entry.category === "fixo" ? String(entry.monthly_amount || 0) : "",
      percentageRate: entry.category === "variavel" ? String(entry.percentage_rate || 0) : "",
    });
    setShowForm(true);
    setSuccess("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(entry: DashboardEntry) {
    const confirmed = window.confirm(
      `Deseja excluir o lançamento "${entry.description}"?`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const token = await getToken();
      const response = await apiFetch(`/api/finance/custos-v2/entries/${entry.id}`, token, {
        method: "DELETE",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.message || "Erro ao excluir lançamento.");
      }

      setSuccess("Lançamento excluído com sucesso.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEstimatedRevenue() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const token = await getToken();
      const response = await apiFetch("/api/finance/custos-v2/settings", token, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          estimated_revenue: Number(estimatedRevenue || 0),
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.message || "Erro ao salvar faturamento estimado.");
      }

      setSuccess("Faturamento estimado salvo com sucesso.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCost() {
    try {
      if (!form.description.trim()) {
        throw new Error("Preencha a descrição do custo.");
      }

      setSaving(true);
      setError("");
      setSuccess("");

      const token = await getToken();
      const endpoint = editingId
        ? `/api/finance/custos-v2/entries/${editingId}`
        : "/api/finance/custos-v2/entries";

      const method = editingId ? "PUT" : "POST";

      const response = await apiFetch(endpoint, token, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: form.category,
          description: form.description.trim(),
          cost_type: form.costType,
          supplier: form.supplier.trim(),
          due_day: form.category === "fixo" ? Number(form.dueDay || 0) : null,
          monthly_amount: form.category === "fixo" ? Number(form.monthlyAmount || 0) : 0,
          percentage_rate: form.category === "variavel" ? Number(form.percentageRate || 0) : 0,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.message || "Erro ao salvar custo.");
      }

      setSuccess(editingId ? "Lançamento atualizado com sucesso." : "Custo cadastrado com sucesso.");
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadCsv() {
    const rows = [
      [
        "Categoria",
        "Descrição",
        "Tipo",
        "Fornecedor",
        "Dia vencimento",
        "Valor mensal",
        "Percentual",
        "Impacto mensal",
        "Percentual fracionado",
        "Criado em",
        "Atualizado em",
      ],
      ...filteredEntries.map((entry) => [
        entry.category === "fixo" ? "fixo" : "variável",
        entry.description,
        entry.cost_type,
        entry.supplier || "",
        entry.due_day ?? "",
        entry.monthly_amount,
        entry.percentage_rate,
        entry.monthly_impact,
        getFractionalPercent(entry, dashboardEstimatedRevenue, dashboardTotalCosts),
        formatDateBR(entry.created_at),
        formatDateBR(entry.updated_at),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((item) => escapeCsv(item)).join(";"))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "custos-expert-energy.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handlePrintPdf() {
    window.print();
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Carregando dashboard de custos...</p>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm font-medium text-red-700">Erro: {error}</p>
      </div>
    );
  }

  const summary = dashboard?.summary;

  return (
    <div className="space-y-4 lg:space-y-5">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        .print-only {
          display: none;
        }

        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .print-card,
          .print-table,
          .print-section {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            break-inside: avoid;
          }

          .print-page {
            padding: 0 !important;
            margin: 0 !important;
          }

          table {
            width: 100% !important;
            font-size: 11px !important;
          }

          th,
          td {
            padding: 6px 8px !important;
          }
        }
      `}</style>

      <div className="print-only print-page">
        <div className="mb-4 border-b border-slate-300 pb-4">
          <div className="flex items-start gap-4">
            <img
              src="https://www.expertenergy.com.br/images/logo-expert-energy.png"
              alt="Expert Energy"
              className="h-14 w-auto object-contain"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Expert Energy Perfomance em Energia
              </h1>
              <p className="text-sm text-slate-700">CNPJ 16.640.933/0001-83</p>
              <p className="text-sm text-slate-700">Relatório de custos fixos e variáveis</p>
              <p className="text-sm text-slate-700">
                Emitido em {new Date().toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="print-card rounded-lg border p-3">
            <div className="text-xs uppercase text-slate-500">Custos totais</div>
            <div className="mt-1 text-lg font-bold">{formatCurrencyBRL(summary?.total_costs || 0)}</div>
          </div>
          <div className="print-card rounded-lg border p-3">
            <div className="text-xs uppercase text-slate-500">% custo variáveis</div>
            <div className="mt-1 text-lg font-bold">{formatPercentBR(summary?.total_variable_percent || 0)}%</div>
          </div>
          <div className="print-card rounded-lg border p-3">
            <div className="text-xs uppercase text-slate-500">Custos fixos</div>
            <div className="mt-1 text-lg font-bold">{formatCurrencyBRL(summary?.total_fixed_amount || 0)}</div>
          </div>
          <div className="print-card rounded-lg border p-3">
            <div className="text-xs uppercase text-slate-500">Custos variáveis</div>
            <div className="mt-1 text-lg font-bold">{formatCurrencyBRL(summary?.total_variable_amount || 0)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-4 lg:p-5 shadow-sm print-section">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Dashboard de custos
            </p>
            <h2 className="mt-1 text-lg font-bold leading-tight text-slate-900 sm:text-xl md:text-2xl break-words">
              Custos fixos e variáveis
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Cadastro real com salvamento, totais, indicadores e distribuição proporcional sobre o faturamento estimado.
            </p>
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Imprimir PDF
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <label className="block min-w-[220px]">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Faturamento estimado
              </span>
              <input
                type="number"
                step="0.01"
                value={estimatedRevenue}
                onChange={(e) => setEstimatedRevenue(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                placeholder="150000"
              />
            </label>

            <button
              type="button"
              onClick={saveEstimatedRevenue}
              disabled={saving}
              className="no-print rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Salvar faturamento
            </button>

            <button
              type="button"
              onClick={() => {
                if (showForm && !editingId) {
                  setShowForm(false);
                } else {
                  setShowForm(true);
                }
              }}
              className="no-print rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {showForm ? (editingId ? "Fechar edição" : "Fechar cadastro") : "Cadastrar custo"}
            </button>
          </div>

          <div className="w-full lg:w-[320px]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Filtro de pesquisa
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar descrição, tipo, fornecedor..."
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
          </div>
        </div>

        {success ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {success}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      {showForm ? (
        <div className="no-print rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-slate-900">
              {editingId ? "Editar lançamento" : "Novo custo"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Para custos fixos, informe apenas o valor mensal. Para custos variáveis, informe apenas o percentual.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Categoria</span>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    category: e.target.value as CostCategory,
                    costType: e.target.value === "variavel" ? "comissões" : "aluguel",
                    monthlyAmount: "",
                    percentageRate: "",
                    dueDay: e.target.value === "variavel" ? "" : current.dueDay,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
              >
                <option value="fixo">custo fixo</option>
                <option value="variavel">custo variável</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Descrição</span>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
                placeholder="Ex.: aluguel sede / comissão externa"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Tipo</span>
              <select
                value={form.costType}
                onChange={(e) => setForm((current) => ({ ...current, costType: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
              >
                {COST_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Fornecedor</span>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => setForm((current) => ({ ...current, supplier: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
                placeholder="Nome do fornecedor"
              />
            </label>

            {form.category === "fixo" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Dia de vencimento</span>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.dueDay}
                    onChange={(e) => setForm((current) => ({ ...current, dueDay: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
                    placeholder="Ex.: 10"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Valor mensal (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.monthlyAmount}
                    onChange={(e) => setForm((current) => ({ ...current, monthlyAmount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
                    placeholder="0,00"
                  />
                </label>
              </>
            ) : (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Percentual (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.percentageRate}
                  onChange={(e) => setForm((current) => ({ ...current, percentageRate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
                  placeholder="0,00"
                />
              </label>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveCost}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {editingId ? "Salvar alterações" : "Salvar custo"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4 shadow-sm print-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Custos
          </p>
          <p className="mt-2 break-words text-lg font-bold leading-tight text-slate-900 sm:text-xl xl:text-2xl">
            {formatCurrencyBRL(summary?.total_costs || 0)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            soma total de custo fixo e soma total de custo variáveis
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4 shadow-sm print-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            % total custo variáveis
          </p>
          <p className="mt-2 break-words text-lg font-bold leading-tight text-slate-900 sm:text-xl xl:text-2xl">
            {formatPercentBR(summary?.total_variable_percent || 0)}%
          </p>
          <p className="mt-2 text-xs text-slate-500">
            percentual total de custos variáveis
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4 shadow-sm print-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Maiores custos
          </p>
          <div className="mt-2 space-y-1">
            {topFive.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum custo cadastrado.</p>
            ) : (
              topFive.map((item, index) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="line-clamp-2 break-words text-slate-700">
                    {index + 1}. {item.description}
                  </span>
                  <span className="shrink-0 font-semibold text-slate-900">
                    {formatCurrencyBRL(item.computed_monthly_impact ?? getMonthlyImpact(item, dashboardEstimatedRevenue))}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4 shadow-sm print-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Indicador
          </p>
          <p className="mt-2 break-words text-sm font-bold leading-snug text-slate-900 sm:text-base xl:text-lg">
            {(summary?.total_entries || 0)} lançamentos · {(summary?.fixed_entries || 0)} fixos · {(summary?.variable_entries || 0)} variáveis
          </p>
          <p className="mt-2 text-xs text-slate-500">
            quantidade de lançamentos entre custos fixos e variáveis
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4 shadow-sm print-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total pago de custos fixos
          </p>
          <p className="mt-2 break-words text-lg font-bold leading-tight text-slate-900 sm:text-xl xl:text-2xl">
            {formatCurrencyBRL(summary?.total_fixed_amount || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4 shadow-sm print-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total de custo variável
          </p>
          <p className="mt-2 break-words text-lg font-bold leading-tight text-slate-900 sm:text-xl xl:text-2xl">
            {formatCurrencyBRL(summary?.total_variable_amount || 0)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            calculado sobre o faturamento mensal estimado
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 lg:p-4 shadow-sm print-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Base de faturamento
          </p>
          <p className="mt-2 break-words text-lg font-bold leading-tight text-slate-900 sm:text-xl xl:text-2xl">
            {formatCurrencyBRL(dashboard?.settings?.estimated_revenue || 0)}
          </p>
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm print-table overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900">Lançamentos cadastrados</h3>
          <p className="mt-1 text-sm text-slate-600">
            Os percentuais fracionados abaixo representam a participação de cada custo no total consolidado.
          </p>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500">
            Nenhum lançamento encontrado para o filtro informado.
          </div>
        ) : (
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Categoria</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Descrição</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Tipo</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Fornecedor</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">Venc.</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-700">Valor mensal</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-700">% custo</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-700">Impacto mensal</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-700">% fracionado</th>
                  <th className="no-print px-3 py-3 text-right font-semibold text-slate-700">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200">
                    <td className="px-3 py-3">
                      <span
                        className={
                          entry.category === "fixo"
                            ? "inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                            : "inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                        }
                      >
                        {entry.category === "fixo" ? "fixo" : "variável"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-800">
                      <div className="break-words">{entry.description}</div>
                      {entry.auto_generated ? (
                        <div className="mt-1 text-[11px] font-medium text-amber-700">
                          origem automática: empréstimos
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{entry.cost_type}</td>
                    <td className="px-3 py-3 text-slate-600">{entry.supplier || "-"}</td>
                    <td className="px-3 py-3 text-slate-600">{entry.due_day ?? "-"}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-800">
                      {entry.category === "fixo" ? formatCurrencyBRL(entry.monthly_amount) : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-slate-800">
                      {entry.category === "variavel"
                        ? `${formatPercentBR(entry.percentage_rate)}%`
                        : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {formatCurrencyBRL(getMonthlyImpact(entry, dashboardEstimatedRevenue))}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {formatPercentBR(getFractionalPercent(entry, dashboardEstimatedRevenue, dashboardTotalCosts))}%
                    </td>
                    <td className="no-print px-3 py-3">
                      <div className="flex justify-end gap-2">
                        {entry.auto_generated ? (
                          <span className="inline-flex rounded-lg bg-amber-100 px-3 py-2 text-[11px] font-semibold text-amber-800">
                            automático
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEdit(entry)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
                              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="border-t border-slate-200">
                  <td colSpan={7} className="px-3 py-3 text-right font-semibold text-slate-700">
                    Soma dos percentuais fracionados
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatCurrencyBRL(
                      filteredEntries.reduce((sum, entry) => sum + Number(entry.monthly_impact || 0), 0)
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatPercentBR(totalSharePct)}%
                  </td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
