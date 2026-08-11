"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type CashFlowEntry = {
  id: string;
  year: number;
  month: number;
  type: "receita" | "despesa";
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
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
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [data, setData] = useState<CashFlowPayload>({ year: currentYear, entries: [], auto_expenses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const payload = await authJson(`/api/finance/fluxo-caixa?year=${encodeURIComponent(year)}`);
      setData({
        year: Number(payload?.year || year),
        entries: Array.isArray(payload?.entries) ? payload.entries : [],
        auto_expenses: Array.isArray(payload?.auto_expenses) ? payload.auto_expenses : [],
      });
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar fluxo de caixa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [year]);

  const allEntries = useMemo(() => {
    return [...(data.entries || []), ...(data.auto_expenses || [])].sort((a, b) => {
      if (a.month !== b.month) return a.month - b.month;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.description.localeCompare(b.description);
    });
  }, [data]);

  const totalEntradas = allEntries
    .filter((item) => item.type === "receita")
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);

  const totalSaidas = allEntries
    .filter((item) => item.type === "despesa")
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);

  const saldoFinal = totalEntradas - totalSaidas;

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Fluxo de Caixa</h1>
            <p className="text-sm text-slate-500">
              Leitura autenticada do novo módulo de fluxo de caixa.
            </p>
          </div>

          <div className="flex items-end gap-3">
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

            <button
              onClick={load}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-sm text-emerald-700">Total de entradas</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-900">{formatMoney(totalEntradas)}</div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="text-sm text-rose-700">Total de saídas</div>
          <div className="mt-2 text-2xl font-semibold text-rose-900">{formatMoney(totalSaidas)}</div>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <div className="text-sm text-sky-700">Saldo final</div>
          <div className="mt-2 text-2xl font-semibold text-sky-900">{formatMoney(saldoFinal)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Lançamentos do ano {data.year}</h2>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-slate-500">Carregando...</div>
        ) : allEntries.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">Nenhum lançamento encontrado.</div>
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
                </tr>
              </thead>
              <tbody>
                {allEntries.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{MONTHS[item.month - 1] || item.month}</td>
                    <td className="px-4 py-3">
                      <span className={item.type === "despesa" ? "text-rose-700" : "text-emerald-700"}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.category}</td>
                    <td className="px-4 py-3">{item.description}</td>
                    <td className="px-4 py-3">{item.source || (item.auto_generated ? "automático" : "manual")}</td>
                    <td className={`px-4 py-3 text-right font-medium ${item.type === "despesa" ? "text-rose-700" : "text-emerald-700"}`}>
                      {formatMoney(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
