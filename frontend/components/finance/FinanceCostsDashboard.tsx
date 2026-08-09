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
  status: string;
  created_at: string | null;
  updated_at: string | null;
  effective_amount: number;
  share_pct: number;
};

type DashboardData = {
  settings?: {
    estimated_revenue?: number;
  };
  summary?: {
    total_fixed?: number;
    total_variable?: number;
    total_costs?: number;
    variable_share_pct?: number;
    fixed_share_pct?: number;
    fixed_count?: number;
    variable_count?: number;
    total_entries?: number;
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

export default function FinanceCostsDashboard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [estimatedRevenue, setEstimatedRevenue] = useState("0");
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

  const topFive = useMemo(() => {
    const fromApi = dashboard?.top_five_costs;
    if (Array.isArray(fromApi) && fromApi.length > 0) {
      return fromApi;
    }

    return [...entries]
      .sort((a, b) => Number(b.effective_amount || 0) - Number(a.effective_amount || 0))
      .slice(0, 5);
  }, [dashboard, entries]);

  const totalSharePct = useMemo(() => {
    return entries.reduce((sum, item) => sum + Number(item.share_pct || 0), 0);
  }, [entries]);

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
      const response = await apiFetch("/api/finance/custos-v2/entries", token, {
        method: "POST",
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

      setSuccess("Custo cadastrado com sucesso.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
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
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Dashboard de custos
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              Custos fixos e variáveis
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Cadastro real com salvamento, totais, indicadores e distribuição proporcional sobre o faturamento estimado.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
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
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Salvar faturamento
            </button>

            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {showForm ? "Fechar cadastro" : "Cadastrar custo"}
            </button>
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
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-slate-900">Novo custo</h3>
            <p className="mt-1 text-sm text-slate-600">
              Para custos fixos, informe apenas o valor mensal. Para custos variáveis, informe apenas o percentual.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              Salvar custo
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowForm(false);
              }}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Custos
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatCurrencyBRL(summary?.total_costs || 0)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            soma total de custo fixo e soma total de custo variáveis
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            % total custo variáveis
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatPercentBR(summary?.variable_share_pct || 0)}%
          </p>
          <p className="mt-2 text-xs text-slate-500">
            percentual total de custos variáveis no total consolidado
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Maiores custos
          </p>
          <div className="mt-3 space-y-1">
            {topFive.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum custo cadastrado.</p>
            ) : (
              topFive.map((item, index) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-slate-700">
                    {index + 1}. {item.description}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrencyBRL(item.effective_amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Indicador
          </p>
          <p className="mt-3 text-lg font-bold text-slate-900">
            {(summary?.total_entries || 0)} lançamentos · {(summary?.fixed_count || 0)} fixos · {(summary?.variable_count || 0)} variáveis
          </p>
          <p className="mt-2 text-xs text-slate-500">
            quantidade de lançamentos entre custos fixos e variáveis
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total pago de custos fixos
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatCurrencyBRL(summary?.total_fixed || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total de custo variável
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatCurrencyBRL(summary?.total_variable || 0)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            calculado sobre o faturamento mensal estimado
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Base de faturamento
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatCurrencyBRL(dashboard?.settings?.estimated_revenue || 0)}
          </p>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">Lançamentos cadastrados</h3>
          <p className="mt-1 text-sm text-slate-600">
            Os percentuais fracionados abaixo representam a participação de cada custo no total consolidado.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            Nenhum custo cadastrado até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Categoria</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Descrição</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Fornecedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Venc.</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Valor mensal</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">% custo</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Impacto mensal</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">% fracionado</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-slate-800">{entry.description}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.cost_type}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.supplier || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.due_day ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {entry.category === "fixo" ? formatCurrencyBRL(entry.monthly_amount) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {entry.category === "variavel"
                        ? `${formatPercentBR(entry.percentage_rate)}%`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrencyBRL(entry.effective_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatPercentBR(entry.share_pct)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="border-t border-slate-200">
                  <td colSpan={7} className="px-4 py-3 text-right font-semibold text-slate-700">
                    Soma dos percentuais fracionados
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {formatCurrencyBRL(summary?.total_costs || 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {formatPercentBR(totalSharePct)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
