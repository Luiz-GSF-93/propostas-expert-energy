"use client";

import { useEffect, useMemo, useState } from "react";

type EntryType = "receita" | "despesa";

type CategoryOption = {
  value: string;
  label: string;
};

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
};

type CashFlowMonthSummary = {
  month: number;
  receita: number;
  despesa: number;
  saldo: number;
};

type CashFlowYearPayload = {
  year: number;
  entries: CashFlowEntry[];
  auto_expenses?: CashFlowEntry[];
};

const MONTHS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
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
  { value: "emprestimo", label: "Empréstimo" },
];

type FormState = {
  id?: string;
  type: EntryType;
  year: string;
  month: string;
  category: string;
  description: string;
  amount: string;
};

const EMPTY_FORM: FormState = {
  type: "receita",
  year: String(new Date().getFullYear()),
  month: String(new Date().getMonth() + 1),
  category: REVENUE_CATEGORIES[0].value,
  description: "",
  amount: "",
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value
      .replace(/\s/g, "")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function monthLabel(month: number) {
  return MONTHS.find((item) => item.value === month)?.label || `Mês ${month}`;
}

function getCategories(type: EntryType) {
  return type === "receita" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;
}

function getStatusLabel(saldo: number) {
  return saldo >= 0 ? "✅ positivo" : "⚠️ prejuízo";
}

function exportCsv(filename: string, rows: string[][]) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(";")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function FluxoCaixaPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<CashFlowEntry[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");

  async function fetchJson(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
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

  async function loadYearData(targetYear = year) {
    setLoading(true);
    setError(null);

    try {
      const data: CashFlowYearPayload = await fetchJson(
        `/api/finance/fluxo-caixa?year=${encodeURIComponent(targetYear)}`
      );

      const merged = [
        ...(Array.isArray(data.entries) ? data.entries : []),
        ...(Array.isArray(data.auto_expenses) ? data.auto_expenses : []),
      ];

      setEntries(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar fluxo de caixa.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadYearData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLowerCase();

    return entries.filter((item) => {
      const bag = [
        item.type,
        item.category,
        item.description,
        item.year,
        monthLabel(item.month),
      ]
        .join(" ")
        .toLowerCase();

      return !term || bag.includes(term);
    });
  }, [entries, search]);

  const monthSummaries = useMemo<CashFlowMonthSummary[]>(() => {
    return MONTHS.map((month) => {
      const items = visibleEntries.filter((item) => item.month === month.value);
      const receita = items
        .filter((item) => item.type === "receita")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);

      const despesa = items
        .filter((item) => item.type === "despesa")
        .reduce((sum, item) => sum + toNumber(item.amount), 0);

      return {
        month: month.value,
        receita,
        despesa,
        saldo: receita - despesa,
      };
    });
  }, [visibleEntries]);

  const totalEntradas = monthSummaries.reduce((sum, item) => sum + item.receita, 0);
  const totalSaidas = monthSummaries.reduce((sum, item) => sum + item.despesa, 0);
  const saldoFinal = totalEntradas - totalSaidas;

  const worstMonth = [...monthSummaries].sort((a, b) => a.saldo - b.saldo)[0];
  const bestMonth = [...monthSummaries].sort((a, b) => b.saldo - a.saldo)[0];

  const totalCustosFixos = visibleEntries
    .filter((item) => item.type === "despesa" && item.category === "custos_fixos")
    .reduce((sum, item) => sum + toNumber(item.amount), 0);

  const reservaMinima = totalCustosFixos * 3;
  const reservaStatus =
    saldoFinal >= reservaMinima
      ? "✅ Reserva adequada"
      : "⚠️ Abaixo da reserva ideal de 3 meses";

  const chartMax = Math.max(
    ...monthSummaries.flatMap((item) => [item.receita, item.despesa, Math.abs(item.saldo)]),
    1
  );

  function resetForm(nextType: EntryType = "receita") {
    setForm({
      ...EMPTY_FORM,
      type: nextType,
      category: getCategories(nextType)[0]?.value || "",
      year,
    });
  }

  function handleTypeChange(nextType: EntryType) {
    setForm((prev) => ({
      ...prev,
      type: nextType,
      category: getCategories(nextType)[0]?.value || "",
    }));
  }

  function handleEdit(entry: CashFlowEntry) {
    setForm({
      id: entry.id,
      type: entry.type,
      year: String(entry.year),
      month: String(entry.month),
      category: entry.category,
      description: entry.description,
      amount: String(entry.amount).replace(".", ","),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess("");

    try {
      const payload = {
        year: Number(form.year),
        month: Number(form.month),
        type: form.type,
        category: form.category,
        description: form.description,
        amount: toNumber(form.amount),
      };

      const method = form.id ? "PUT" : "POST";
      const endpoint = form.id
        ? `/api/finance/fluxo-caixa/${form.id}`
        : "/api/finance/fluxo-caixa";

      await fetchJson(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      setSuccess(form.id ? "Lançamento atualizado com sucesso." : "Lançamento salvo com sucesso.");
      resetForm(form.type);
      await loadYearData(form.year);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar lançamento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Deseja realmente excluir este lançamento?");
    if (!confirmed) return;

    try {
      await fetchJson(`/api/finance/fluxo-caixa/${id}`, { method: "DELETE" });
      setSuccess("Lançamento excluído com sucesso.");
      await loadYearData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir lançamento.");
    }
  }

  function handleExportCsv() {
    const rows: string[][] = [
      ["Ano", "Mês", "Tipo", "Categoria", "Descrição", "Valor", "Origem"],
      ...visibleEntries.map((item) => [
        String(item.year),
        monthLabel(item.month),
        item.type,
        item.category,
        item.description,
        String(toNumber(item.amount).toFixed(2)).replace(".", ","),
        item.auto_generated ? "Automático" : "Manual",
      ]),
      [],
      ["RESUMO", "", "", "", "Total entradas", String(totalEntradas.toFixed(2)).replace(".", ","), ""],
      ["RESUMO", "", "", "", "Total saídas", String(totalSaidas.toFixed(2)).replace(".", ","), ""],
      ["RESUMO", "", "", "", "Saldo final", String(saldoFinal.toFixed(2)).replace(".", ","), ""],
    ];

    exportCsv(`fluxo-caixa-${year}.csv`, rows);
  }

  const entriesByCategory = useMemo(() => {
    const categories = new Map<string, CashFlowEntry[]>();

    visibleEntries.forEach((entry) => {
      const key = `${entry.type}::${entry.category}::${entry.description}`;
      if (!categories.has(key)) categories.set(key, []);
      categories.get(key)!.push(entry);
    });

    return [...categories.entries()].map(([key, items]) => {
      const [type, category, description] = key.split("::");
      const values = MONTHS.map((month) => {
        const found = items.find((item) => item.month === month.value);
        return found ? toNumber(found.amount) : 0;
      });

      return {
        key,
        type,
        category,
        description,
        items,
        values,
        total: values.reduce((sum, value) => sum + value, 0),
      };
    });
  }, [visibleEntries]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Fluxo de caixa</h1>
              <p className="mt-1 text-sm text-slate-500">
                Gestão anual de receitas, despesas, empréstimos, análise mensal e visão para impressão.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 no-print">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar categoria, descrição, mês..."
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900"
              />
              <select
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setForm((prev) => ({ ...prev, year: e.target.value }));
                }}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900"
              >
                {Array.from({ length: 8 }).map((_, idx) => {
                  const target = currentYear - 2 + idx;
                  return (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={() => window.print()}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Imprimir relatório
              </button>
              <button
                onClick={handleExportCsv}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Download CSV
              </button>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Total de entradas anuais" value={formatMoney(totalEntradas)} tone="emerald" />
          <StatCard label="Total de saídas anuais" value={formatMoney(totalSaidas)} tone="rose" />
          <StatCard label="Saldo final" value={formatMoney(saldoFinal)} tone={saldoFinal >= 0 ? "emerald" : "rose"} />
          <StatCard
            label="Pior mês"
            value={`${monthLabel(worstMonth?.month || 1)} • ${formatMoney(worstMonth?.saldo || 0)}`}
            tone="amber"
          />
          <StatCard
            label="Melhor mês"
            value={`${monthLabel(bestMonth?.month || 1)} • ${formatMoney(bestMonth?.saldo || 0)}`}
            tone="sky"
          />
          <StatCard
            label="Reserva mínima"
            value={formatMoney(reservaMinima)}
            hint={reservaStatus}
            tone={saldoFinal >= reservaMinima ? "emerald" : "amber"}
          />
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[420px,1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Cadastro de lançamento</h2>
              <p className="mt-1 text-sm text-slate-500">
                Receitas e despesas por ano e mês. Empréstimos e custos automáticos devem vir da API.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid grid-cols-2 gap-3">
                <TypeButton
                  active={form.type === "receita"}
                  label="Receita"
                  tone="emerald"
                  onClick={() => handleTypeChange("receita")}
                />
                <TypeButton
                  active={form.type === "despesa"}
                  label="Despesa"
                  tone="rose"
                  onClick={() => handleTypeChange("despesa")}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Ano"
                  value={form.year}
                  onChange={(value) => setForm((prev) => ({ ...prev, year: value }))}
                  type="number"
                />
                <SelectField
                  label="Mês"
                  value={form.month}
                  onChange={(value) => setForm((prev) => ({ ...prev, month: value }))}
                  options={MONTHS.map((item) => ({ value: String(item.value), label: item.label }))}
                />
                <SelectField
                  label="Categoria"
                  value={form.category}
                  onChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                  options={getCategories(form.type).map((item) => ({ value: item.value, label: item.label }))}
                />
                <Field
                  label="Valor R$"
                  value={form.amount}
                  onChange={(value) => setForm((prev) => ({ ...prev, amount: value }))}
                  type="text"
                />
              </div>

              <Field
                label="Descrição"
                value={form.description}
                onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
                type="text"
              />

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : form.id ? "Salvar edição" : "Salvar"}
                </button>

                <button
                  type="button"
                  onClick={() => resetForm(form.type)}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Limpar
                </button>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}
            </form>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Resumo mês a mês</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-3 font-medium">Mês</th>
                      <th className="px-3 py-3 font-medium">Receitas</th>
                      <th className="px-3 py-3 font-medium">Despesas</th>
                      <th className="px-3 py-3 font-medium">Saldo</th>
                      <th className="px-3 py-3 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthSummaries.map((item) => (
                      <tr key={item.month} className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium">{monthLabel(item.month)}</td>
                        <td className="px-3 py-3 text-emerald-700">{formatMoney(item.receita)}</td>
                        <td className="px-3 py-3 text-rose-700">{formatMoney(item.despesa)}</td>
                        <td className={`px-3 py-3 font-medium ${item.saldo >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {formatMoney(item.saldo)}
                        </td>
                        <td className="px-3 py-3">{getStatusLabel(item.saldo)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-3">Total</td>
                      <td className="px-3 py-3 text-emerald-700">{formatMoney(totalEntradas)}</td>
                      <td className="px-3 py-3 text-rose-700">{formatMoney(totalSaidas)}</td>
                      <td className={`px-3 py-3 ${saldoFinal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatMoney(saldoFinal)}
                      </td>
                      <td className="px-3 py-3">{getStatusLabel(saldoFinal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Evolução do saldo de caixa mensal">
                <div className="space-y-3">
                  {monthSummaries.map((item) => {
                    const width = Math.max((Math.abs(item.saldo) / chartMax) * 100, 2);
                    return (
                      <div key={item.month}>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                          <span>{monthLabel(item.month)}</span>
                          <span>{formatMoney(item.saldo)}</span>
                        </div>
                        <div className="h-3 rounded-full bg-slate-100">
                          <div
                            className={`h-3 rounded-full ${item.saldo >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ChartCard>

              <ChartCard title="Entradas vs saídas mensais">
                <div className="space-y-4">
                  {monthSummaries.map((item) => {
                    const receitaWidth = Math.max((item.receita / chartMax) * 100, item.receita > 0 ? 2 : 0);
                    const despesaWidth = Math.max((item.despesa / chartMax) * 100, item.despesa > 0 ? 2 : 0);

                    return (
                      <div key={item.month}>
                        <div className="mb-2 text-xs font-medium text-slate-600">{monthLabel(item.month)}</div>
                        <div className="space-y-2">
                          <div>
                            <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                              <span>Entradas</span>
                              <span>{formatMoney(item.receita)}</span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-100">
                              <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${receitaWidth}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                              <span>Saídas</span>
                              <span>{formatMoney(item.despesa)}</span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-100">
                              <div className="h-3 rounded-full bg-rose-500" style={{ width: `${despesaWidth}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ChartCard>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Estrutura anual por linhas e meses</h2>
              <p className="text-sm text-slate-500">
                Cada linha representa um cadastro. Receitas em verde, despesas em vermelho.
              </p>
            </div>
            <div className="print-only hidden text-right text-xs text-slate-500">
              Expert Energy Performance em Energia Ltda
              <br />
              Relatório de fluxo de caixa anual
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1400px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 font-medium">Categoria</th>
                  <th className="px-3 py-3 font-medium">Descrição</th>
                  {MONTHS.map((month) => (
                    <th key={month.value} className="px-3 py-3 font-medium">
                      {month.label.slice(0, 3)}
                    </th>
                  ))}
                  <th className="px-3 py-3 font-medium">Total</th>
                  <th className="px-3 py-3 font-medium no-print">Ações</th>
                </tr>
              </thead>
              <tbody>
                {entriesByCategory.map((row) => {
                  const isExpense = row.type === "despesa";

                  return (
                    <tr key={row.key} className="border-b border-slate-100">
                      <td className={`px-3 py-3 font-medium ${isExpense ? "text-rose-700" : "text-emerald-700"}`}>
                        {isExpense ? "Despesa" : "Receita"}
                      </td>
                      <td className="px-3 py-3">{row.category}</td>
                      <td className="px-3 py-3">{row.description}</td>
                      {row.values.map((value, index) => (
                        <td
                          key={`${row.key}-${index}`}
                          className={`px-3 py-3 ${isExpense ? "text-rose-700" : "text-emerald-700"}`}
                        >
                          {value ? formatMoney(value) : "—"}
                        </td>
                      ))}
                      <td className={`px-3 py-3 font-semibold ${isExpense ? "text-rose-700" : "text-emerald-700"}`}>
                        {formatMoney(row.total)}
                      </td>
                      <td className="px-3 py-3 no-print">
                        <div className="flex gap-2">
                          <button
                            onClick={() => row.items[0] && handleEdit(row.items[0])}
                            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          {!row.items[0]?.auto_generated ? (
                            <button
                              onClick={() => row.items[0] && handleDelete(row.items[0].id)}
                              className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Excluir
                            </button>
                          ) : (
                            <span className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500">
                              Automático
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                <tr className="bg-slate-50 font-semibold">
                  <td className="px-3 py-3" colSpan={3}>
                    Total / resumo
                  </td>
                  {MONTHS.map((month) => {
                    const summary = monthSummaries.find((item) => item.month === month.value);
                    return (
                      <td
                        key={`total-${month.value}`}
                        className={`px-3 py-3 ${(summary?.saldo || 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                      >
                        {formatMoney(summary?.saldo || 0)}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-3 ${saldoFinal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {formatMoney(saldoFinal)}
                  </td>
                  <td className="px-3 py-3 no-print">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {loading ? <div className="mt-4 text-sm text-slate-500">Carregando dados...</div> : null}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "slate" | "emerald" | "rose" | "amber" | "sky";
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-2 text-xs opacity-80">{hint}</div> : null}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function TypeButton({
  active,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  tone: "emerald" | "rose";
  onClick: () => void;
}) {
  const activeClass =
    tone === "emerald"
      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
      : "border-rose-500 bg-rose-50 text-rose-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
        active
          ? activeClass
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
