"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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
  { value: "emprestimo", label: "Empréstimo" },
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

function monthShort(month: number) {
  return MONTHS.find((item) => item.value === month)?.short || String(month);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

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

function monthTone(saldo: number) {
  return saldo >= 0
    ? "bg-emerald-50 text-emerald-700"
    : "bg-rose-50 text-rose-700";
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
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

function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  if (/[;"\n,]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

async function authJson(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

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

export default function FluxoCaixaPage() {
  const [year, setYear] = useState(getDefaultYear());
  const [payload, setPayload] = useState<CashFlowPayload>({
    year: Number(getDefaultYear()),
    entries: [],
    auto_expenses: [],
  });
  const [form, setForm] = useState<FormState>(getEmptyForm(getDefaultYear()));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");

  const categories =
    form.type === "receita" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

  function resetForm(nextYear = year) {
    setForm(getEmptyForm(nextYear));
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);
      setSuccess("");

      const response = await authJson(
        `/api/finance/fluxo-caixa?year=${encodeURIComponent(year)}`
      );

      setPayload({
        year: Number(response?.year || year),
        entries: Array.isArray(response?.entries) ? response.entries : [],
        auto_expenses: Array.isArray(response?.auto_expenses)
          ? response.auto_expenses
          : [],
      });
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
    setForm((prev) => {
      if (prev.id) return prev;
      return { ...prev, year };
    });
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

  const totalEntradas = useMemo(
    () => monthlySummary.reduce((sum, item) => sum + item.entradas, 0),
    [monthlySummary]
  );

  const totalSaidas = useMemo(
    () => monthlySummary.reduce((sum, item) => sum + item.saidas, 0),
    [monthlySummary]
  );

  const saldoFinal = totalEntradas - totalSaidas;

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

  const latestFixedCostRow = useMemo(() => {
    return [...monthlySummary].reverse().find((item) => item.custosFixos > 0) || null;
  }, [monthlySummary]);

  const reservaBase = latestFixedCostRow?.custosFixos || 0;
  const reservaMinima = reservaBase * 3;
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

      if (!payloadBody.description) {
        throw new Error("Descrição obrigatória.");
      }

      if (payloadBody.amount <= 0) {
        throw new Error("Valor deve ser maior que zero.");
      }

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

    const confirmed = window.confirm(
      `Excluir o lançamento "${entry.description}"?`
    );

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

      const csv = [header, ...rows]
        .map((line) => line.map(csvEscape).join(";"))
        .join("\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fluxo-caixa-${year}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          html,
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .print-page {
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-card,
          .print-table {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
          }

          .print-header {
            display: block !important;
          }
        }

        .print-header {
          display: none;
        }
      `}</style>

      <div className="print-page space-y-6 p-6">
        <div className="print-header border-b border-slate-300 pb-3">
          <h1 className="text-xl font-bold text-slate-900">{COMPANY_NAME}</h1>
          <p className="text-sm text-slate-600">
            Relatório de Fluxo de Caixa — Ano {payload.year}
          </p>
        </div>

        <div className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Fluxo de Caixa
              </h1>
              <p className="text-sm text-slate-500">
                Gestão anual de receitas, despesas e lançamentos automáticos do caixa.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Ano
                </label>
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Filtro
                </label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Categoria, descrição, origem..."
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                {exporting ? "Exportando..." : "Download CSV"}
              </button>

              <button
                onClick={handlePrint}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Imprimir A4
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="print-card rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-sm text-emerald-700">Entradas anuais</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-900">
              {formatMoney(totalEntradas)}
            </div>
          </div>

          <div className="print-card rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <div className="text-sm text-rose-700">Saídas anuais</div>
            <div className="mt-2 text-2xl font-semibold text-rose-900">
              {formatMoney(totalSaidas)}
            </div>
          </div>

          <div className="print-card rounded-2xl border border-sky-200 bg-sky-50 p-5">
            <div className="text-sm text-sky-700">Saldo final</div>
            <div className="mt-2 text-2xl font-semibold text-sky-900">
              {formatMoney(saldoFinal)}
            </div>
          </div>

          <div className="print-card rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="text-sm text-amber-700">Melhor mês</div>
            <div className="mt-2 text-lg font-semibold text-amber-900">
              {melhorMes ? melhorMes.monthLabel : "—"}
            </div>
            <div className="mt-1 text-sm text-amber-800">
              {melhorMes ? formatMoney(melhorMes.saldo) : "Sem dados"}
            </div>
          </div>

          <div className="print-card rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="text-sm text-violet-700">Pior mês</div>
            <div className="mt-2 text-lg font-semibold text-violet-900">
              {piorMes ? piorMes.monthLabel : "—"}
            </div>
            <div className="mt-1 text-sm text-violet-800">
              {piorMes ? formatMoney(piorMes.saldo) : "Sem dados"}
            </div>
          </div>

          <div className="print-card rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm text-slate-700">Reserva mínima</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {formatMoney(reservaMinima)}
            </div>
            <div className="mt-1 text-xs text-slate-600">{indicadorReserva}</div>
          </div>
        </div>

        <div className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {form.id ? "Editar lançamento manual" : "Novo lançamento manual"}
            </h2>
            <p className="text-sm text-slate-500">
              Despesas automáticas de custos e empréstimos são calculadas pelo sistema.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Ano
              </label>
              <input
                value={form.year}
                onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Mês
              </label>
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
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Tipo
              </label>
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
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Categoria
              </label>
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
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Descrição
              </label>
              <input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ex.: Venda à vista, compra emergencial, honorários..."
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Valor R$
              </label>
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

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Resumo mensal de {payload.year}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3 text-right">Entradas</th>
                  <th className="px-4 py-3 text-right">Saídas</th>
                  <th className="px-4 py-3 text-right">Custos fixos</th>
                  <th className="px-4 py-3 text-right">Custos variáveis</th>
                  <th className="px-4 py-3 text-right">Empréstimos</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((item) => (
                  <tr key={item.month} className="border-t border-slate-100">
                    <td className="px-4 py-3">{item.monthLabel}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {formatMoney(item.entradas)}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-700">
                      {formatMoney(item.saidas)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(item.custosFixos)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(item.custosVariaveis)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(item.emprestimos)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(item.saldo)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${monthTone(item.saldo)}`}>
                        {item.indicador}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td className="px-4 py-3">Total anual</td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {formatMoney(totalEntradas)}
                  </td>
                  <td className="px-4 py-3 text-right text-rose-700">
                    {formatMoney(totalSaidas)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(monthlySummary.reduce((sum, item) => sum + item.custosFixos, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(monthlySummary.reduce((sum, item) => sum + item.custosVariaveis, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(monthlySummary.reduce((sum, item) => sum + item.emprestimos, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(saldoFinal)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${monthTone(saldoFinal)}`}>
                      {saldoFinal >= 0 ? "✅ positivo" : "⚠️ prejuízo"}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Tabela anual em colunas jan–dez
            </h2>
            <p className="text-sm text-slate-500">
              {search
                ? `Filtro aplicado: "${search}"`
                : "Consolidação anual por tipo, categoria e descrição."}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1500px] text-sm">
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
              <tfoot className="bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td colSpan={4} className="px-4 py-3">
                    Total geral filtrado
                  </td>
                  {pivotTotals.months.map((value, index) => (
                    <td key={`total-${index}`} className="px-4 py-3 text-right">
                      {value ? formatMoney(value) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    {formatMoney(pivotTotals.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Lançamentos detalhados
            </h2>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-slate-500">Carregando...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">
              Nenhum lançamento encontrado para o filtro atual.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
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
          )}
        </div>
      </div>
    </>
  );
}
