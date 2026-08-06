"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";

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
    return Math.max(0, ...(data?.rows || []).map((item) => item.row.length));
  }, [data]);

  if (loading) {
    return (
      <FinanceModuleShell title={title} subtitle={subtitle}>
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-600">Carregando dados...</p>
        </section>
      </FinanceModuleShell>
    );
  }

  if (forbidden) {
    return (
      <FinanceModuleShell title={title} subtitle={subtitle}>
        <section className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
          <p className="text-rose-600">Acesso restrito ao administrador.</p>
        </section>
      </FinanceModuleShell>
    );
  }

  if (errorMessage) {
    return (
      <FinanceModuleShell title={title} subtitle={subtitle}>
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-8 shadow-sm">
          <p className="text-amber-700">{errorMessage}</p>
        </section>
      </FinanceModuleShell>
    );
  }

  return (
    <FinanceModuleShell title={title} subtitle={subtitle}>
      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 px-6 py-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
          <div><strong>Aba:</strong> {data?.sheet_name || "—"}</div>
          <div><strong>Linhas:</strong> {data?.row_count || 0}</div>
          <div><strong>Arquivo:</strong> {data?.source_file_name || "—"}</div>
          <div><strong>Versão:</strong> {data?.source_version || "—"}</div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Visualização da aba</h2>
          <p className="mt-1 text-sm text-slate-500">
            Leitura direta do staging financeiro já importado e validado.
          </p>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
          Dica: role horizontalmente para visualizar todos os meses e colunas da planilha.
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1600px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
              <tr>
                <th className="sticky left-0 z-20 min-w-[90px] border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-left font-semibold">
                  Linha
                </th>
                {Array.from({ length: maxColumns }).map((_, index) => (
                  <th
                    key={index}
                    className="min-w-[140px] border-b border-slate-200 px-3 py-3 text-left font-semibold whitespace-nowrap"
                  >
                    Col {index + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((item) => (
                <tr key={item.row_number} className="odd:bg-white even:bg-slate-50">
                  <td className="sticky left-0 z-10 min-w-[90px] border-b border-r border-slate-100 bg-inherit px-3 py-3 font-medium text-slate-500">
                    {item.row_number}
                  </td>
                  {Array.from({ length: maxColumns }).map((_, index) => (
                    <td
                      key={index}
                      className="min-w-[140px] border-b border-slate-100 px-3 py-3 align-top text-slate-800"
                    >
                      <div className="max-w-[240px] whitespace-normal break-words">
                        {displayCell(item.row[index])}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </FinanceModuleShell>
  );
}
