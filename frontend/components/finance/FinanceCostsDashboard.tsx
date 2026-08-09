"use client";

import { useMemo, useState } from "react";

type CostCategory = "fixo" | "variavel";

type CostEntry = {
  id: string;
  category: CostCategory;
  description: string;
  costType: string;
  supplier: string;
  dueDay: number | null;
  monthlyAmount: number;
  percentageRate: number;
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
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercentBR(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function entryMonthlyImpact(entry: CostEntry, estimatedRevenue: number) {
  if (entry.category === "fixo") {
    return Number(entry.monthlyAmount || 0);
  }

  return Number(estimatedRevenue || 0) * (Number(entry.percentageRate || 0) / 100);
}

export default function FinanceCostsDashboard() {
  const [showForm, setShowForm] = useState(false);
  const [estimatedRevenue, setEstimatedRevenue] = useState("150000");
  const [form, setForm] = useState<CostForm>(EMPTY_FORM);
  const [entries, setEntries] = useState<CostEntry[]>([
    {
      id: "1",
      category: "fixo",
      description: "Aluguel escritório",
      costType: "aluguel",
      supplier: "Imobiliária Centro",
      dueDay: 5,
      monthlyAmount: 8500,
      percentageRate: 0,
    },
    {
      id: "2",
      category: "fixo",
      description: "Contabilidade mensal",
      costType: "contabilidade",
      supplier: "Contábil Alpha",
      dueDay: 10,
      monthlyAmount: 2200,
      percentageRate: 0,
    },
    {
      id: "3",
      category: "variavel",
      description: "Comissões comerciais",
      costType: "comissões",
      supplier: "Equipe comercial",
      dueDay: null,
      monthlyAmount: 0,
      percentageRate: 4.5,
    },
    {
      id: "4",
      category: "variavel",
      description: "Taxa de cartão",
      costType: "taxa de cartão",
      supplier: "Operadora",
      dueDay: null,
      monthlyAmount: 0,
      percentageRate: 2.2,
    },
  ]);

  const estimatedRevenueValue = useMemo(() => parseNumber(estimatedRevenue), [estimatedRevenue]);

  const totalFixed = useMemo(
    () =>
      entries
        .filter((entry) => entry.category === "fixo")
        .reduce((sum, entry) => sum + Number(entry.monthlyAmount || 0), 0),
    [entries]
  );

  const totalVariablePercent = useMemo(
    () =>
      entries
        .filter((entry) => entry.category === "variavel")
        .reduce((sum, entry) => sum + Number(entry.percentageRate || 0), 0),
    [entries]
  );

  const totalVariableAmount = useMemo(
    () => estimatedRevenueValue * (totalVariablePercent / 100),
    [estimatedRevenueValue, totalVariablePercent]
  );

  const totalCosts = useMemo(() => totalFixed + totalVariableAmount, [totalFixed, totalVariableAmount]);

  const indicatorLabel = useMemo(() => {
    const fixedCount = entries.filter((entry) => entry.category === "fixo").length;
    const variableCount = entries.filter((entry) => entry.category === "variavel").length;
    return `${entries.length} lançamentos · ${fixedCount} fixos · ${variableCount} variáveis`;
  }, [entries]);

  const entriesWithImpact = useMemo(() => {
    return entries.map((entry) => {
      const monthlyImpact = entryMonthlyImpact(entry, estimatedRevenueValue);
      const fractionalPercent = totalCosts > 0 ? (monthlyImpact / totalCosts) * 100 : 0;

      return {
        ...entry,
        monthlyImpact,
        fractionalPercent,
      };
    });
  }, [entries, estimatedRevenueValue, totalCosts]);

  const topFiveCosts = useMemo(() => {
    return [...entriesWithImpact]
      .sort((a, b) => b.monthlyImpact - a.monthlyImpact)
      .slice(0, 5);
  }, [entriesWithImpact]);

  function updateForm<K extends keyof CostForm>(field: K, value: CostForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    if (!form.description.trim()) {
      alert("Preencha a descrição do custo.");
      return;
    }

    const nextEntry: CostEntry = {
      id: `${Date.now()}`,
      category: form.category,
      description: form.description.trim(),
      costType: form.costType,
      supplier: form.supplier.trim(),
      dueDay: form.category === "fixo" && form.dueDay ? Math.min(Math.max(Number(form.dueDay), 1), 31) : null,
      monthlyAmount: form.category === "fixo" ? parseNumber(form.monthlyAmount) : 0,
      percentageRate: form.category === "variavel" ? parseNumber(form.percentageRate) : 0,
    };

    setEntries((current) => [nextEntry, ...current]);
    setForm({
      ...EMPTY_FORM,
      costType: form.category === "variavel" ? "comissões" : "aluguel",
    });
    setShowForm(false);
  }

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
              Painel dedicado para cadastro, acompanhamento e distribuição proporcional dos custos da operação.
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
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none ring-0 focus:border-slate-500"
                placeholder="150000"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {showForm ? "Fechar cadastro" : "Cadastrar custo"}
            </button>
          </div>
        </div>
      </div>

      {showForm ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-slate-900">Novo custo</h3>
            <p className="mt-1 text-sm text-slate-600">
              Para custos fixos, informe o valor mensal. Para custos variáveis, informe apenas o percentual.
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
                onChange={(e) => updateForm("description", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
                placeholder="Ex.: aluguel sede / comissão externa"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Tipo</span>
              <select
                value={form.costType}
                onChange={(e) => updateForm("costType", e.target.value)}
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
                onChange={(e) => updateForm("supplier", e.target.value)}
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
                    onChange={(e) => updateForm("dueDay", e.target.value)}
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
                    onChange={(e) => updateForm("monthlyAmount", e.target.value)}
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
                  onChange={(e) => updateForm("percentageRate", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900"
                  placeholder="0,00"
                />
              </label>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
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
            {formatCurrencyBRL(totalCosts)}
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
            {formatPercentBR(totalVariablePercent)}%
          </p>
          <p className="mt-2 text-xs text-slate-500">
            percentual total de custos variáveis
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Maiores custos
          </p>
          <div className="mt-3 space-y-1">
            {topFiveCosts.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum custo cadastrado.</p>
            ) : (
              topFiveCosts.map((item, index) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-slate-700">
                    {index + 1}. {item.description}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrencyBRL(item.monthlyImpact)}
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
          <p className="mt-3 text-lg font-bold text-slate-900">{indicatorLabel}</p>
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
            {formatCurrencyBRL(totalFixed)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total de custo variável
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatCurrencyBRL(totalVariableAmount)}
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
            {formatCurrencyBRL(estimatedRevenueValue)}
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

        {entriesWithImpact.length === 0 ? (
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
                {entriesWithImpact.map((entry) => (
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
                    <td className="px-4 py-3 text-slate-600">{entry.costType}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.supplier || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.dueDay ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {entry.category === "fixo"
                        ? formatCurrencyBRL(entry.monthlyAmount)
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {entry.category === "variavel"
                        ? `${formatPercentBR(entry.percentageRate)}%`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrencyBRL(entry.monthlyImpact)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatPercentBR(entry.fractionalPercent)}%
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
                    {formatCurrencyBRL(totalCosts)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {formatPercentBR(
                      entriesWithImpact.reduce((sum, entry) => sum + entry.fractionalPercent, 0)
                    )}%
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
