"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

type FinanceSummary = {
  reference_year: number;
  reference_month: number | null;
  gross_revenue: number;
  net_profit: number;
  net_margin: number;
  ebitda: number;
  cash_balance: number;
  fixed_costs: number;
  variable_cost_rate: number;
  break_even: number;
  total_loans: number;
  loan_installments_year: number;
  created_at?: string | null;
  updated_at?: string | null;
};

type FinanceSection = {
  key: string;
  label: string;
  status: "ready" | "planned" | string;
};

type FinanceBootstrap = {
  module: {
    key: string;
    label: string;
    phase: string;
    access: string;
  };
  summary: FinanceSummary;
  sections: FinanceSection[];
  latest_import: {
    id: string;
    source_file_name: string;
    source_version: string;
    import_status: string;
    created_at: string;
  } | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusBadge(status: string) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "ready") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (normalized === "planned") {
    return "bg-amber-100 text-amber-700";
  }

  if (normalized === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-slate-100 text-slate-700";
}

export default function FinanceiroPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<FinanceBootstrap | null>(null);

  useEffect(() => {
    let active = true;

    async function loadFinance() {
      try {
        setLoading(true);
        setErrorMessage("");
        setForbidden(false);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("Sessão não encontrada.");
        }

        const response = await apiFetch(
          "/api/finance/bootstrap",
          session.access_token
        );

        if (!active) return;

        if (response.status === 403) {
          setForbidden(true);
          setData(null);
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.message || "Erro ao carregar gestão financeira.");
        }

        const body = await response.json();
        setData(body);
      } catch (error) {
        if (!active) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Erro ao carregar gestão financeira."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadFinance();

    return () => {
      active = false;
    };
  }, []);

  const summary = data?.summary;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                {data?.module?.phase || "fase_1"}
              </p>
              <h1 className="text-3xl font-bold text-slate-900">
                {data?.module?.label || "Gestão Financeira"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Módulo administrativo conectado ao snapshot financeiro real.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div>
                <span className="font-semibold">Acesso:</span>{" "}
                {data?.module?.access || "admin_only"}
              </div>
              <div>
                <span className="font-semibold">Ano de referência:</span>{" "}
                {summary?.reference_year || "—"}
              </div>
            </div>
          </div>
        </header>

        {loading && (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Carregando dados financeiros...
          </section>
        )}

        {!loading && forbidden && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-700 shadow-sm">
            Acesso restrito ao administrador.
          </section>
        )}

        {!loading && !forbidden && errorMessage && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm">
            {errorMessage}
          </section>
        )}

        {!loading && !forbidden && !errorMessage && summary && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Receita bruta anual</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatCurrency(summary.gross_revenue)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Lucro líquido</p>
                <p className={`mt-2 text-2xl font-bold ${summary.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(summary.net_profit)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Margem líquida</p>
                <p className={`mt-2 text-2xl font-bold ${summary.net_margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatPercent(summary.net_margin)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">EBITDA</p>
                <p className={`mt-2 text-2xl font-bold ${summary.ebitda >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(summary.ebitda)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Saldo de caixa</p>
                <p className={`mt-2 text-2xl font-bold ${summary.cash_balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(summary.cash_balance)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Custos fixos mensais</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatCurrency(summary.fixed_costs)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Custos variáveis</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatPercent(summary.variable_cost_rate)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Ponto de equilíbrio</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatCurrency(summary.break_even)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Total em empréstimos</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatCurrency(summary.total_loans)}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Parcelas no ano</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatCurrency(summary.loan_installments_year)}
                </p>
              </article>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Última importação
                </h2>

                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div>
                    <span className="font-semibold">Arquivo:</span>{" "}
                    {data?.latest_import?.source_file_name || "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Versão:</span>{" "}
                    {data?.latest_import?.source_version || "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Status:</span>{" "}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(
                        data?.latest_import?.import_status || ""
                      )}`}
                    >
                      {data?.latest_import?.import_status || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Importado em:</span>{" "}
                    {formatDateTime(data?.latest_import?.created_at)}
                  </div>
                  <div>
                    <span className="font-semibold">Lote:</span>{" "}
                    {data?.latest_import?.id || "—"}
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Seções do módulo
                </h2>

                <div className="mt-4 grid gap-3">
                  {(data?.sections || []).map((section) => {
                    const hrefMap: Record<string, string> = {
                      "visao-geral": "/financeiro",
                      "fluxo-caixa": "/financeiro/fluxo-caixa",
                      "dre": "/financeiro/dre",
                    };

                    const href = hrefMap[section.key];

                    const content = (
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-100">
                        <div>
                          <p className="font-medium text-slate-900">
                            {section.label}
                          </p>
                          <p className="text-xs text-slate-500">{section.key}</p>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(
                            section.status
                          )}`}
                        >
                          {section.status}
                        </span>
                      </div>
                    );

                    return href ? (
                      <Link key={section.key} href={href} className="block">
                        {content}
                      </Link>
                    ) : (
                      <div key={section.key}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
