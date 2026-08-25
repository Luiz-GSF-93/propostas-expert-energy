"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import FinanceAISection from "@/components/finance/FinanceAISection";

type FinanceBootstrap = {
  module?: {
    key?: string;
    label?: string;
    phase?: string;
    access?: string;
  };
  summary?: {
    reference_year?: number;
    reference_month?: number | null;
    gross_revenue?: number;
    net_profit?: number;
    net_margin?: number;
    ebitda?: number;
    cash_balance?: number;
    fixed_costs?: number;
    variable_cost_rate?: number;
    break_even?: number;
    total_loans?: number;
    loan_installments_year?: number;
  };
  sections?: Array<{
    key: string;
    label: string;
    status: string;
  }>;
  latest_import?: {
    id: string;
    source_file_name?: string;
    source_version?: string;
    import_status?: string;
    created_at?: string;
  } | null;
};

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value?: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

const hrefMap: Record<string, string> = {
  "visao-geral": "/financeiro",
  "fluxo-caixa": "/financeiro/fluxo-caixa",
  dre: "/financeiro/dre",
  custos: "/financeiro/custos",
  planejamento: "/financeiro/planejamento",
  emprestimos: "/financeiro/emprestimos",
};

export default function FinanceiroPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState("Carregando módulo financeiro...");
  const [data, setData] = useState<FinanceBootstrap | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/";
          return;
        }

        const response = await apiFetch("/api/finance/bootstrap", session.access_token);

        if (response.status === 403) {
          if (!mounted) return;
          setForbidden(true);
          setMessage("Acesso restrito ao administrador.");
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("Falha ao carregar módulo financeiro.");
        }

        const payload = (await response.json()) as FinanceBootstrap;

        if (!mounted) return;
        setData(payload);
        setLoading(false);
      } catch (error) {
        console.error("financeiro.load.error", error);
        if (!mounted) return;
        setMessage("Não foi possível carregar o módulo financeiro nesta etapa inicial.");
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const cards = useMemo(() => {
    const summary = data?.summary || {};
    return [
      { label: "Faturamento anual", value: formatCurrency(summary.gross_revenue) },
      { label: "Lucro líquido", value: formatCurrency(summary.net_profit) },
      { label: "Margem líquida", value: formatPercent(summary.net_margin) },
      { label: "EBITDA", value: formatCurrency(summary.ebitda) },
      { label: "Saldo de caixa", value: formatCurrency(summary.cash_balance) },
      { label: "Custos fixos mensais", value: formatCurrency(summary.fixed_costs) },
      { label: "Custos variáveis", value: formatPercent(summary.variable_cost_rate) },
      { label: "Ponto de equilíbrio", value: formatCurrency(summary.break_even) },
      { label: "Total em empréstimos", value: formatCurrency(summary.total_loans) },
      { label: "Parcelas no ano", value: formatCurrency(summary.loan_installments_year) },
    ];
  }, [data]);

  if (loading) {
    return (
      <FinanceModuleShell
        title="Gestão Financeira"
        subtitle="Módulo administrativo conectado ao snapshot financeiro real."
      >
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-600">{message}</p>
        </section>
      </FinanceModuleShell>
    );
  }

  if (forbidden) {
    return (
      <FinanceModuleShell
        title="Gestão Financeira"
        subtitle="Módulo administrativo conectado ao snapshot financeiro real."
      >
        <section className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
          <p className="text-red-600">Acesso restrito ao administrador.</p>
        </section>
      </FinanceModuleShell>
    );
  }

  return (
    <FinanceModuleShell
      title="Gestão Financeira"
      subtitle="Módulo administrativo conectado ao snapshot financeiro real."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {card.label}
            </p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-slate-200/80 bg-white/90 p-8 shadow-sm backdrop-blur">
          <h2 className="text-xl font-bold text-slate-900">Última importação</h2>
          {data?.latest_import ? (
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div><strong>Arquivo:</strong> {data.latest_import.source_file_name || "N/D"}</div>
              <div><strong>Versão:</strong> {data.latest_import.source_version || "N/D"}</div>
              <div><strong>Status:</strong> {data.latest_import.import_status || "N/D"}</div>
              <div><strong>Importado em:</strong> {data.latest_import.created_at || "N/D"}</div>
              <div><strong>Lote:</strong> {data.latest_import.id || "N/D"}</div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              Nenhum lote de importação registrado ainda.
            </p>
          )}
        </section>

        <section className="rounded-[28px] border border-slate-200/80 bg-white/90 p-8 shadow-sm backdrop-blur">
          <h2 className="text-xl font-bold text-slate-900">Seções do módulo</h2>
          <div className="mt-4 grid gap-3">
            {(data?.sections || []).map((section) => {
              const href = hrefMap[section.key];
              const activeLink = Boolean(href && href !== "/financeiro");
              const displayStatus =
                section.key === "planejamento" && activeLink
                  ? "READY"
                  : section.status;

              return (
                <div
                  key={section.key}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{section.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{section.key}</div>
                      <div className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                        {displayStatus}
                      </div>
                    </div>

                    {activeLink ? (
                      <Link
                        href={href}
                        className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                      >
                        Abrir
                      </Link>
                    ) : (
                      <span className="inline-flex items-center rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                        {href ? "Abrir" : section.key === "visao-geral" ? "Atual" : "Em breve"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </section>

      <FinanceAISection />
    </FinanceModuleShell>
  );
}
