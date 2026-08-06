"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

type FinanceSheetRow = {
  row_number: number;
  row: Array<string | number | null>;
};

type FinanceSheetResponse = {
  batch_id: string | null;
  source_file_name: string | null;
  source_version: string | null;
  import_status: string;
  sheet_name: string;
  row_count: number;
  rows: FinanceSheetRow[];
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function displayCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function FinanceSheetView({
  title,
  subtitle,
  endpoint,
}: {
  title: string;
  subtitle: string;
  endpoint: string;
}) {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<FinanceSheetResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setForbidden(false);
        setErrorMessage("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/";
          return;
        }

        const response = await apiFetch(endpoint, session.access_token);

        if (!active) return;

        if (response.status === 403) {
          setForbidden(true);
          setLoading(false);
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.message || "Erro ao carregar planilha financeira.");
        }

        const payload = (await response.json()) as FinanceSheetResponse;
        setData(payload);
      } catch (error) {
        if (!active) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Erro ao carregar dados."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [endpoint]);

  const maxColumns = useMemo(() => {
    return Math.max(
      0,
      ...(data?.rows || []).map((item) => item.row.length)
    );
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-600">Carregando dados...</p>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl rounded-3xl border border-rose-200 bg-rose-50 p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-rose-700">{title}</h1>
          <p className="mt-2 text-rose-600">Acesso restrito ao administrador.</p>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl rounded-3xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-amber-800">{title}</h1>
          <p className="mt-2 text-amber-700">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-white/60 bg-white/90 shadow-sm backdrop-blur">
          <div className="bg-[linear-gradient(135deg,_#0f172a_0%,_#1e293b_45%,_#334155_100%)] px-8 py-8 text-white">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">{subtitle}</p>
          </div>

          <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-8 py-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <strong>Aba:</strong> {data?.sheet_name || "—"}
            </div>
            <div>
              <strong>Linhas:</strong> {data?.row_count || 0}
            </div>
            <div>
              <strong>Arquivo:</strong> {data?.source_file_name || "—"}
            </div>
            <div>
              <strong>Versão:</strong> {data?.source_version || "—"}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Visualização da aba</h2>
            <p className="mt-1 text-sm text-slate-500">
              Leitura direta do staging financeiro já importado e validado.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Linha</th>
                  {Array.from({ length: maxColumns }).map((_, index) => (
                    <th
                      key={index}
                      className="border-b border-slate-200 px-3 py-2 text-left font-semibold"
                    >
                      Col {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).map((item) => (
                  <tr key={item.row_number} className="odd:bg-white even:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-500">
                      {item.row_number}
                    </td>
                    {Array.from({ length: maxColumns }).map((_, index) => (
                      <td
                        key={index}
                        className="border-b border-slate-100 px-3 py-2 align-top text-slate-800"
                      >
                        {displayCell(item.row[index])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
