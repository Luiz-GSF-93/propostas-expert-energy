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

function monthTone(saldo: number) {
  return saldo >= 0
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : "bg-rose-50 text-rose-700 border border-rose-200";
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
  if (/[;"\n,]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function metricTone(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-700";
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
  formatAsMoney = true,
}: {
  data: { label: string; value: number }[];
  colorClass: string;
  formatAsMoney?: boolean;
}) {
  const maxValue = Math.max(...data.map((item) => Math.abs(item.value)), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = Math.max(2, (Math.abs(item.value) / maxValue) * 100);
        return (
          <div key={item.label} className="grid grid-cols-[56px_1fr_120px] items-center gap-3">
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="h-3 rounded-full bg-slate-100">
              <div
                className={`h-3 rounded-full ${colorClass}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <div className={`text-right text-sm font-medium ${metricTone(item.value)}`}>
              {formatAsMoney ? formatMoney(item.value) : item.value}
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
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .print-wrapper {
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-table,
          .print-summary {
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .screen-only-cards {
            display: none !important;
          }

          .print-dense-table th,
          .print-dense-table td {
            padding: 6px 8px !important;
            font-size: 10px !important;
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
            Resumo executivo, evolução mensal e tabela anual consolidada.
          </p>
        </div>

        <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Fluxo de Caixa</h1>
              <p className="text-sm text-slate-500">
                Gestão anual de receitas, despesas e lançamentos automáticos do caixa.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <button
                onClick={() => router.push("/financeiro")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar ao dashboard
              </button>

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

        <div className="screen-only-cards grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <ExecutiveCard
            title="Entradas anuais"
            value={formatMoney(totalEntradas)}
            subtitle="Soma anual das receitas"
            accent="emerald"
          />
          <ExecutiveCard
            title="Saídas anuais"
            value={formatMoney(totalSaidas)}
            subtitle="Soma anual das despesas"
            accent="rose"
          />
          <ExecutiveCard
            title="Saldo final"
            value={formatMoney(saldoFinal)}
            subtitle={saldoFinal >= 0 ? "Caixa positivo" : "Atenção ao caixa"}
            accent="sky"
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
            subtitle={indicadorReserva}
            accent="slate"
          />
        </div>

        <div className="print-summary rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Resumo executivo</h2>
            <p className="text-sm text-slate-500">
              Visão anual consolidada para análise financeira e impressão.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
              <div className="mt-1 text-xs text-slate-500">{indicadorReserva}</div>
            </div>
          </div>
        </div>

        <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
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
          <div className="print-table rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-1">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Evolução do saldo acumulado</h2>
              <p className="text-sm text-slate-500">Saldo acumulado mês a mês.</p>
            </div>
            <MiniBarChart data={acumuladoChart} colorClass="bg-sky-500" />
          </div>

          <div className="print-table rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-1">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Entradas mensais</h2>
              <p className="text-sm text-slate-500">Evolução das receitas no ano.</p>
            </div>
            <MiniBarChart data={entradasChart} colorClass="bg-emerald-500" />
          </div>

          <div className="print-table rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-1">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Saídas mensais</h2>
              <p className="text-sm text-slate-500">Evolução das despesas no ano.</p>
            </div>
            <MiniBarChart data={saidasChart} colorClass="bg-rose-500" />
          </div>
        </div>

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Resumo mensal de {payload.year}</h2>
          </div>

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
              <tfoot className="bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td className="px-4 py-3">Total anual</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{formatMoney(totalEntradas)}</td>
                  <td className="px-4 py-3 text-right text-rose-700">{formatMoney(totalSaidas)}</td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(monthlySummary.reduce((sum, item) => sum + item.custosFixos, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(monthlySummary.reduce((sum, item) => sum + item.custosVariaveis, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(monthlySummary.reduce((sum, item) => sum + item.emprestimos, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(saldoFinal)}</td>
                  <td className={`px-4 py-3 text-right ${metricTone(saldoFinal)}`}>{formatMoney(saldoFinal)}</td>
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
            <h2 className="text-lg font-semibold text-slate-900">Tabela anual em colunas jan–dez</h2>
            <p className="text-sm text-slate-500">
              {search ? `Filtro aplicado: "${search}"` : "Consolidação anual por tipo, categoria e descrição."}
            </p>
          </div>

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
              <tfoot className="bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td colSpan={4} className="px-4 py-3">Total geral filtrado</td>
                  {pivotTotals.months.map((value, index) => (
                    <td key={`total-${index}`} className="px-4 py-3 text-right">
                      {value ? formatMoney(value) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">{formatMoney(pivotTotals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="print-table rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Lançamentos detalhados</h2>
          </div>

          {loading ? (
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
          )}
        </div>
      </div>
    </>
  );
}
