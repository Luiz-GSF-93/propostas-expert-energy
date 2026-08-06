"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type FinanceSheetResponse = {
  batch_id?: string;
  source_file_name?: string;
  source_version?: string;
  import_status?: string;
  sheet_name?: string;
  row_count?: number;
  header_row_number?: number | null;
  headers?: string[];
  rows?: {
    id?: string;
    row_number?: number;
    values?: Array<string | number>;
  }[];
};

type Props = {
  title: string;
  subtitle: string;
  endpoint: string;
};

function isNegativeValue(value: unknown) {
  if (typeof value === "number") return value < 0;
  if (typeof value !== "string") return false;

  const cleaned = value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const parsed = Number(cleaned);
  return !Number.isNaN(parsed) && parsed < 0;
}

function isExpenseRowLabel(value: unknown) {
  if (typeof value !== "string") return false;
  const lower = value.toLowerCase();

  return (
    lower.includes("despesa") ||
    lower.includes("custo") ||
    lower.includes("imposto") ||
    lower.includes("saída") ||
    lower.includes("saida") ||
    lower.includes("pagamento") ||
    lower.includes("parcela") ||
    lower.includes("emprést") ||
    lower.includes("emprest") ||
    lower.includes("(-)")
  );
}

export default function FinanceSheetView({ title, subtitle, endpoint }: Props) {
  const [data, setData] = useState<FinanceSheetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw new Error("Erro ao obter sessão do usuário");
        }

        if (!session?.access_token) {
          throw new Error("Sessão expirada. Faça login novamente.");
        }

        const response = await apiFetch(endpoint, session.access_token);
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.message || "Erro ao carregar dados");
        }

        if (active) {
          setData(json);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Erro inesperado");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [endpoint]);

  const rows = useMemo(() => {
    return Array.isArray(data?.rows) ? data.rows : [];
  }, [data]);

  const headers = useMemo(() => {
    if (Array.isArray(data?.headers) && data.headers.length > 0) {
      return data.headers;
    }

    const firstRowValues = Array.isArray(rows[0]?.values) ? rows[0].values : [];
    return firstRowValues.map((_, index) => `Coluna ${index + 1}`);
  }, [data, rows]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Carregando planilha...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm font-medium text-red-700">Erro: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Nenhum dado encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>

        <Link
          href="/financeiro"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Voltar para Gestão Financeira
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Planilha</p>
          <p className="mt-2 font-semibold text-slate-900">{data.sheet_name || "-"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Linhas úteis</p>
          <p className="mt-2 font-semibold text-slate-900">{data.row_count ?? rows.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Arquivo</p>
          <p className="mt-2 break-words text-sm font-medium text-slate-900">
            {data.source_file_name || "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Versão / Status</p>
          <p className="mt-2 font-semibold text-slate-900">
            {(data.source_version || "-")} · {(data.import_status || "-")}
          </p>
        </div>
      </div>

      {!Array.isArray(data.headers) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A API não retornou cabeçalhos reais. Exibindo colunas provisórias.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-600">
            Cabeçalho detectado na linha{" "}
            <span className="font-semibold text-slate-900">
              {data.header_row_number ?? "não identificado"}
            </span>
          </p>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="min-w-[1200px] border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-slate-100">
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={`${header}-${index}`}
                    className={
                      index === 0
                        ? "sticky left-0 z-30 min-w-[280px] border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-left font-semibold text-slate-800"
                        : "min-w-[130px] border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-left font-semibold text-slate-800"
                    }
                  >
                    <div className="whitespace-normal break-words">{header}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rowIndex) => {
                const values = Array.isArray(row?.values) ? row.values : [];
                const expenseRow = isExpenseRowLabel(values[0]);
                const rowKey = row?.id || `row-${rowIndex}`;

                return (
                  <tr
                    key={rowKey}
                    className={expenseRow ? "bg-red-50/40" : "odd:bg-white even:bg-slate-50/40"}
                  >
                    {headers.map((_, index) => {
                      const value = values[index] ?? "";
                      const negative = isNegativeValue(value);

                      return (
                        <td
                          key={`${rowKey}-${index}`}
                          className={
                            index === 0
                              ? "sticky left-0 z-10 min-w-[280px] border-b border-r border-slate-200 bg-inherit px-4 py-3 align-top"
                              : "min-w-[130px] border-b border-r border-slate-200 px-4 py-3 align-top"
                          }
                        >
                          <div
                            className={[
                              "whitespace-normal break-words",
                              negative ? "font-semibold text-red-600" : "",
                              !negative && expenseRow && index > 0 ? "text-red-500" : "text-slate-700",
                            ].join(" ")}
                          >
                            {String(value)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
