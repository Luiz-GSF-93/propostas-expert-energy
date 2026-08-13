"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

type DreSettings = {
  tax_percent: number;
  invested_capital: number;
};

type DreCardMetrics = {
  receita_bruta_anual: number;
  receita_bruta_media_mensal: number;
  lucro_bruto_anual: number;
  lucro_bruto_media_mensal: number;
  margem_bruta_percent: number;
  ebitda_anual: number;
  margem_ebitda_percent: number;
  lucro_liquido_anual: number;
  lucro_liquido_media_mensal: number;
  margem_liquida_percent: number;
  roi_percent: number;
  ebit_anual: number;
  depreciacao_amortizacao_anual: number;
};

type DreMonth = {
  month: number;
  label: string;
  receita_bruta: number;
  impostos: number;
  receita_liquida: number;
  cmv: number;
  lucro_bruto: number;
  despesas_administrativas: number;
  despesas_pessoal: number;
  despesas_vendas: number;
  despesas_marketing: number;
  despesas_infraestrutura: number;
  despesas_financeiras: number;
  receitas_financeiras: number;
  depreciacao_amortizacao: number;
  ebit: number;
  ebitda: number;
  irpj_csll: number;
  lucro_liquido: number;
  margem_liquida_percent: number;
};

type DreRow = {
  key: string;
  label: string;
  months: number[];
  total: number;
  percent: number;
};

type DreManualEntry = {
  id: string;
  year: number;
  month: number;
  section: string;
  line_key: string;
  operator: "add" | "subtract";
  description: string;
  amount: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type DrePayload = {
  year: number;
  settings: DreSettings;
  cards: DreCardMetrics;
  months: DreMonth[];
  rows: DreRow[];
  manual_entries: DreManualEntry[];
  sources?: {
    cash_flow_table?: string | null;
    cost_table?: string | null;
  };
};

type ManualFormState = {
  id?: string;
  year: string;
  month: string;
  section: string;
  line_key: string;
  operator: "add" | "subtract";
  description: string;
  amount: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COMPANY_NAME = "Expert Energy Performance em Energia";
const COMPANY_DOCUMENT = "CNPJ 16.640.933/0001-83";
const COMPANY_SITE = "www.expertenergy.com.br";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const DEFAULT_PAYLOAD: DrePayload = {
  year: new Date().getFullYear(),
  settings: {
    tax_percent: 0,
    invested_capital: 0,
  },
  cards: {
    receita_bruta_anual: 0,
    receita_bruta_media_mensal: 0,
    lucro_bruto_anual: 0,
    lucro_bruto_media_mensal: 0,
    margem_bruta_percent: 0,
    ebitda_anual: 0,
    margem_ebitda_percent: 0,
    lucro_liquido_anual: 0,
    lucro_liquido_media_mensal: 0,
    margem_liquida_percent: 0,
    roi_percent: 0,
    ebit_anual: 0,
    depreciacao_amortizacao_anual: 0,
  },
  months: [],
  rows: [],
  manual_entries: [],
  sources: {
    cash_flow_table: null,
    cost_table: null,
  },
};

const MANUAL_LINE_OPTIONS = [
  { value: "receita_manual", label: "Receita manual" },
  { value: "impostos_manual", label: "Impostos manual" },
  { value: "cmv_manual", label: "CMV manual" },
  { value: "despesa_administrativa_manual", label: "Despesa administrativa manual" },
  { value: "despesa_pessoal_manual", label: "Despesa com pessoal manual" },
  { value: "despesa_vendas_manual", label: "Despesa com vendas manual" },
  { value: "despesa_marketing_manual", label: "Despesa de marketing manual" },
  { value: "despesa_infra_manual", label: "Despesa de infraestrutura manual" },
  { value: "despesa_financeira_manual", label: "Despesa financeira manual" },
  { value: "receita_financeira_manual", label: "Receita financeira manual" },
  { value: "depreciacao_amortizacao_manual", label: "Depreciação / amortização manual" },
  { value: "irpj_csll", label: "IRPJ + CSLL" },
  { value: "custom", label: "Linha personalizada" },
];

const SECTION_OPTIONS = [
  { value: "receitas", label: "Receitas" },
  { value: "cmv", label: "CMV" },
  { value: "despesas", label: "Despesas" },
  { value: "financeiro", label: "Financeiro" },
  { value: "tributos", label: "Tributos" },
  { value: "resultado", label: "Resultado" },
];

function getDefaultYear() {
  return String(new Date().getFullYear());
}

function getEmptyForm(year = getDefaultYear()): ManualFormState {
  return {
    year,
    month: "1",
    section: "tributos",
    line_key: "irpj_csll",
    operator: "subtract",
    description: "",
    amount: "",
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatInputAmount(value: number) {
  return String(Number(value || 0)).replace(".", ",");
}

function metricTone(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-700";
}

function monthName(month: number) {
  return MONTH_LABELS[Math.max(0, Math.min(11, month - 1))] || String(month);
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

function IndicatorCard({
  title,
  value,
  hint,
  accent = "slate",
}: {
  title: string;
  value: string;
  hint: string;
  accent?: "emerald" | "sky" | "violet" | "amber" | "rose" | "slate";
}) {
  const accents: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50/70",
    sky: "border-sky-200 bg-sky-50/70",
    violet: "border-violet-200 bg-violet-50/70",
    amber: "border-amber-200 bg-amber-50/70",
    rose: "border-rose-200 bg-rose-50/70",
    slate: "border-slate-200 bg-slate-50/70",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accents[accent]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 break-words text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-600">{hint}</div>
    </div>
  );
}

function getBarHeight(value: number, maxAbsValue: number) {
  if (!maxAbsValue) return 8;
  const ratio = Math.abs(value) / maxAbsValue;
  return Math.max(8, Math.round(ratio * 140));
}

export default function DrePage() {
  const router = useRouter();

  const [year, setYear] = useState(getDefaultYear());
  const [payload, setPayload] = useState<DrePayload>(DEFAULT_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<ManualFormState>(getEmptyForm(getDefaultYear()));
  const [taxPercentInput, setTaxPercentInput] = useState("0");
  const [capitalInput, setCapitalInput] = useState("0");

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const targetYear = Number(year || getDefaultYear());
      const response = await authJson(`/api/finance/dre?year=${encodeURIComponent(targetYear)}`);

      setPayload(response || DEFAULT_PAYLOAD);
      setTaxPercentInput(String(toNumber(response?.settings?.tax_percent)).replace(".", ","));
      setCapitalInput(String(toNumber(response?.settings?.invested_capital)).replace(".", ","));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar DRE.");
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

  const months = useMemo(() => payload.months || [], [payload]);
  const rows = useMemo(() => payload.rows || [], [payload]);
  const manualEntries = useMemo(() => payload.manual_entries || [], [payload]);

  const lucroChart = useMemo(() => {
    return months.map((item) => ({
      label: item.label,
      value: item.lucro_liquido,
    }));
  }, [months]);

  const maxAbsChartValue = useMemo(() => {
    return lucroChart.reduce((max, item) => Math.max(max, Math.abs(toNumber(item.value))), 0);
  }, [lucroChart]);

  function resetForm(nextYear = year) {
    setForm(getEmptyForm(nextYear));
  }

  async function handleSaveSettings() {
    try {
      setSavingSettings(true);
      setError(null);
      setSuccess("");

      const body = {
        year: Number(year),
        tax_percent: toNumber(taxPercentInput),
        invested_capital: toNumber(capitalInput),
      };

      await authJson("/api/finance/dre/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      });

      setSuccess("Configurações do DRE salvas com sucesso.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configurações do DRE.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSubmitManualEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSavingEntry(true);
      setError(null);
      setSuccess("");

      const body = {
        year: Number(form.year),
        month: Number(form.month),
        section: form.section,
        line_key: form.line_key,
        operator: form.operator,
        description: form.description.trim(),
        amount: toNumber(form.amount),
      };

      if (!body.description) throw new Error("Descrição obrigatória.");
      if (body.amount <= 0) throw new Error("Valor deve ser maior que zero.");

      if (form.id) {
        await authJson(`/api/finance/dre/manual-entries/${form.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setSuccess("Lançamento manual atualizado com sucesso.");
      } else {
        await authJson("/api/finance/dre/manual-entries", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setSuccess("Lançamento manual criado com sucesso.");
      }

      resetForm(String(body.year));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar lançamento manual.");
    } finally {
      setSavingEntry(false);
    }
  }

  async function handleDeleteManualEntry(id: string) {
    if (!window.confirm("Deseja realmente excluir este lançamento manual do DRE?")) return;

    try {
      setError(null);
      setSuccess("");
      await authJson(`/api/finance/dre/manual-entries/${id}`, { method: "DELETE" });
      setSuccess("Lançamento manual excluído com sucesso.");
      if (form.id === id) resetForm(year);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao excluir lançamento manual.");
    }
  }

  function handleEditManualEntry(entry: DreManualEntry) {
    setForm({
      id: entry.id,
      year: String(entry.year),
      month: String(entry.month),
      section: entry.section,
      line_key: entry.line_key,
      operator: entry.operator,
      description: entry.description || "",
      amount: formatInputAmount(entry.amount || 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDownloadCsv() {
    const header = ["Conta", ...MONTH_LABELS, "Total Ano", "%"];
    const lines = [
      header.join(";"),
      ...rows.map((row) => [
        `"${row.label.replace(/"/g, '""')}"`,
        ...row.months.map((value) => String(toNumber(value).toFixed(2)).replace(".", ",")),
        String(toNumber(row.total).toFixed(2)).replace(".", ","),
        String(toNumber(row.percent).toFixed(2)).replace(".", ",") + "%",
      ].join(";")),
    ];

    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dre-${payload.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    document.body.classList.add("dre-print");
    window.print();
  }

  useEffect(() => {
    const afterPrint = () => {
      document.body.classList.remove("dre-print");
    };

    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-[1600px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          <h1 className="text-xl font-semibold text-slate-900">Carregando DRE</h1>
          <p className="mt-2 text-sm text-slate-500">Buscando estrutura do Demonstrativo de Resultado do Exercício.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .print-shell {
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-header {
            display: block !important;
            margin-bottom: 12px !important;
            border-bottom: 1px solid #cbd5e1 !important;
            padding-bottom: 8px !important;
          }

          .print-table-wrap {
            overflow: visible !important;
          }

          .print-table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }

          .print-table th,
          .print-table td {
            font-size: 7px !important;
            line-height: 1.15 !important;
            padding: 4px 3px !important;
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
            border-color: #cbd5e1 !important;
          }

          .print-table th:nth-child(1),
          .print-table td:nth-child(1) {
            width: 18% !important;
          }

          .print-table th:nth-child(n+2):nth-child(-n+13),
          .print-table td:nth-child(n+2):nth-child(-n+13) {
            width: 5.2% !important;
            text-align: center !important;
          }

          .print-table th:nth-child(14),
          .print-table td:nth-child(14) {
            width: 9% !important;
            text-align: center !important;
          }

          .print-table th:nth-child(15),
          .print-table td:nth-child(15) {
            width: 6% !important;
            text-align: center !important;
          }
        }

        .print-header {
          display: none;
        }
      `}</style>

      <div className="print-shell mx-auto max-w-[1700px] space-y-6 p-4 md:p-6">
        <div className="print-header">
          <h1 className="text-xl font-bold text-slate-900">{COMPANY_NAME}</h1>
          <p className="text-sm text-slate-700">{COMPANY_DOCUMENT}</p>
          <p className="text-sm text-slate-700">{COMPANY_SITE}</p>
          <p className="mt-2 text-sm text-slate-700">Demonstrativo de Resultado do Exercício (DRE) — Ano {payload.year}</p>
        </div>

        <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">DRE</h1>
              <p className="text-sm text-slate-500">
                Demonstrativo de Resultado do Exercício com integração de Fluxo de Caixa e Custos.
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

              <button
                onClick={load}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Atualizar
              </button>

              <button
                onClick={handleDownloadCsv}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Download CSV
              </button>

              <button
                onClick={handlePrint}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Imprimir DRE A4 horizontal
              </button>
            </div>
          </div>
        </section>

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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <IndicatorCard
            title="Receita Bruta"
            value={formatMoney(payload.cards.receita_bruta_anual)}
            hint={`Média mensal: ${formatMoney(payload.cards.receita_bruta_media_mensal)}`}
            accent="emerald"
          />
          <IndicatorCard
            title="Lucro Bruto"
            value={formatMoney(payload.cards.lucro_bruto_anual)}
            hint={`Média mensal: ${formatMoney(payload.cards.lucro_bruto_media_mensal)}`}
            accent="sky"
          />
          <IndicatorCard
            title="Margem Bruta (%)"
            value={formatPercent(payload.cards.margem_bruta_percent)}
            hint="Lucro bruto / receita bruta"
            accent="amber"
          />
          <IndicatorCard
            title="EBITDA"
            value={formatMoney(payload.cards.ebitda_anual)}
            hint={`Margem EBITDA: ${formatPercent(payload.cards.margem_ebitda_percent)}`}
            accent="violet"
          />
          <IndicatorCard
            title="Lucro Líquido"
            value={formatMoney(payload.cards.lucro_liquido_anual)}
            hint={`Média mensal: ${formatMoney(payload.cards.lucro_liquido_media_mensal)}`}
            accent="rose"
          />
          <IndicatorCard
            title="Margem Líquida (%)"
            value={formatPercent(payload.cards.margem_liquida_percent)}
            hint="Lucro líquido / receita bruta"
            accent="slate"
          />
          <IndicatorCard
            title="ROI (%)"
            value={formatPercent(payload.cards.roi_percent)}
            hint={`Capital investido: ${formatMoney(payload.settings.invested_capital)}`}
            accent="emerald"
          />
          <IndicatorCard
            title="EBIT"
            value={formatMoney(payload.cards.ebit_anual)}
            hint={`Depreciação/Amortização: ${formatMoney(payload.cards.depreciacao_amortizacao_anual)}`}
            accent="sky"
          />
        </section>

        <section className="no-print grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Configurações do DRE</h2>
            <p className="mt-1 text-sm text-slate-500">
              Percentual de imposto e capital investido para cálculo dos indicadores.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  % imposto
                </label>
                <input
                  value={taxPercentInput}
                  onChange={(e) => setTaxPercentInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Ex.: 6,5"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Capital investido
                </label>
                <input
                  value={capitalInput}
                  onChange={(e) => setCapitalInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Ex.: 250000"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingSettings ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Lucro / Prejuízo mensal</h2>
            <p className="mt-1 text-sm text-slate-500">
              Gráfico em barras baseado no lucro líquido de cada mês.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-12">
              {lucroChart.map((item) => {
                const positive = item.value >= 0;
                const barHeight = getBarHeight(item.value, maxAbsChartValue);

                return (
                  <div key={item.label} className="flex flex-col items-center">
                    <div className="mb-2 text-center text-[11px] font-medium text-slate-500">
                      {item.label}
                    </div>

                    <div className="flex h-44 w-full items-end justify-center rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
                      <div
                        className={`w-full rounded-t-md ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ height: `${barHeight}px` }}
                        title={`${item.label}: ${formatMoney(item.value)}`}
                      />
                    </div>

                    <div className={`mt-2 text-center text-xs font-semibold ${metricTone(item.value)}`}>
                      {formatMoney(item.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {form.id ? "Editar lançamento manual do DRE" : "Novo lançamento manual do DRE"}
            </h2>
            <p className="text-sm text-slate-500">
              Insira ajustes manuais por mês, com opção de somar ou subtrair.
            </p>
          </div>

          <form onSubmit={handleSubmitManualEntry} className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Ano</label>
              <input
                type="number"
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
                {MONTH_LABELS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Seção</label>
              <select
                value={form.section}
                onChange={(e) => setForm((prev) => ({ ...prev, section: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {SECTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Linha</label>
              <select
                value={form.line_key}
                onChange={(e) => setForm((prev) => ({ ...prev, line_key: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {MANUAL_LINE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Operação</label>
              <select
                value={form.operator}
                onChange={(e) => setForm((prev) => ({ ...prev, operator: e.target.value as "add" | "subtract" }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="add">Somar</option>
                <option value="subtract">Subtrair</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Valor (R$)</label>
              <input
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="0,00"
              />
            </div>

            <div className="md:col-span-2 xl:col-span-4">
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Descrição</label>
              <input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Descreva o lançamento manual"
              />
            </div>

            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-2">
              <button
                type="submit"
                disabled={savingEntry}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingEntry ? "Salvando..." : form.id ? "Salvar edição" : "Salvar lançamento"}
              </button>

              <button
                type="button"
                onClick={() => resetForm(year)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Estrutura anual do DRE</h2>
            <p className="text-sm text-slate-500">
              Conta, meses de janeiro a dezembro, total anual e percentual sobre a receita bruta.
            </p>
          </div>

          <div className="print-table-wrap overflow-x-auto">
            <table className="print-table min-w-[1600px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Conta
                  </th>
                  {MONTH_LABELS.map((label) => (
                    <th
                      key={label}
                      className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Total Ano
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100 even:bg-slate-50/50">
                    <td className="px-3 py-3 font-medium text-slate-800">{row.label}</td>
                    {row.months.map((value, index) => (
                      <td
                        key={`${row.key}-${index}`}
                        className={`px-3 py-3 text-center font-medium ${metricTone(value)}`}
                      >
                        {row.key === "margem_liquida_percent" ? formatPercent(value) : formatMoney(value)}
                      </td>
                    ))}
                    <td className={`px-3 py-3 text-center font-semibold ${metricTone(row.total)}`}>
                      {row.key === "margem_liquida_percent" ? formatPercent(row.total) : formatMoney(row.total)}
                    </td>
                    <td className={`px-3 py-3 text-center font-semibold ${metricTone(row.percent)}`}>
                      {formatPercent(row.percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Lançamentos manuais</h2>
              <p className="text-sm text-slate-500">
                Ajustes cadastrados diretamente no DRE para o ano {payload.year}.
              </p>
            </div>

            <div className="text-xs text-slate-500">
              Origem custos: {payload.sources?.cost_table || "—"} · Fluxo: {payload.sources?.cash_flow_table || "—"}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1000px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Mês</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Seção</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Linha</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Operação</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Descrição</th>
                  <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Valor</th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {manualEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                      Nenhum lançamento manual registrado para este ano.
                    </td>
                  </tr>
                ) : (
                  manualEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 even:bg-slate-50/50">
                      <td className="px-3 py-3 text-slate-700">{monthName(entry.month)}</td>
                      <td className="px-3 py-3 text-slate-700">{entry.section}</td>
                      <td className="px-3 py-3 text-slate-700">{entry.line_key}</td>
                      <td className="px-3 py-3 text-slate-700">{entry.operator === "add" ? "Somar" : "Subtrair"}</td>
                      <td className="px-3 py-3 text-slate-700">{entry.description}</td>
                      <td className={`px-3 py-3 text-right font-medium ${metricTone(entry.operator === "subtract" ? -entry.amount : entry.amount)}`}>
                        {formatMoney(entry.amount)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditManualEntry(entry)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteManualEntry(entry.id)}
                            className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
