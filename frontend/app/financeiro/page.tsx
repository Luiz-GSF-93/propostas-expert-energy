"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

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
      { label: "Ponto de equilíbrio", value: formatCurrency(summary.break_even) },
    ];
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe_0%,_#f8fafc_32%,_#f1f5f9_100%)] p-6 text-slate-900">
        <h1 className="text-3xl font-bold">Gestão Financeira</h1>
        <p className="mt-2 text-slate-600">{message}</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe_0%,_#f8fafc_32%,_#f1f5f9_100%)] p-6 text-slate-900">
        <h1 className="text-3xl font-bold">Gestão Financeira</h1>
        <p className="mt-2 text-red-600">Acesso restrito ao administrador.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe_0%,_#f8fafc_32%,_#f1f5f9_100%)] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[32px] border border-white/60 bg-white/80 shadow-sm backdrop-blur">
          <div className="bg-[linear-gradient(135deg,_#0f172a_0%,_#1e293b_45%,_#334155_100%)] px-8 py-8 text-white">
            <h1 className="text-3xl font-bold tracking-tight">Gestão Financeira</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Módulo administrativo separado do dashboard comercial, com foco em performance, segurança e evolução por fases.
            </p>
          </div>
          <div className="border-t border-slate-200 bg-blue-50 px-8 py-3 text-sm text-blue-900">
            Fase 1 ativa: estrutura inicial, snapshots, acesso admin-only e base preparada para importar o Excel.
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

        <section className="rounded-[32px] border border-slate-200/80 bg-white/90 p-8 shadow-sm backdrop-blur">
          <h2 className="text-xl font-bold text-slate-900">Status da implantação</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data?.sections || []).map((section) => (
              <div
                key={section.key}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="text-sm font-semibold text-slate-900">{section.label}</div>
                <div className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                  {section.status}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200/80 bg-white/90 p-8 shadow-sm backdrop-blur">
          <h2 className="text-xl font-bold text-slate-900">Última importação conhecida</h2>
          {data?.latest_import ? (
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div><strong>Arquivo:</strong> {data.latest_import.source_file_name || "N/D"}</div>
              <div><strong>Versão:</strong> {data.latest_import.source_version || "N/D"}</div>
              <div><strong>Status:</strong> {data.latest_import.import_status || "N/D"}</div>
              <div><strong>Data:</strong> {data.latest_import.created_at || "N/D"}</div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              Nenhum lote de importação registrado ainda. A base já está pronta para a carga controlada do Excel na próxima etapa.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
