"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type ProposalLite = {
  id?: string;
  status?: string;
  created_at?: string;
  approved_at?: string;
};

type GoalRow = {
  year: number;
  month: number;
  target_value: number | string | null;
};

type GoalsPanelProps = {
  isAdmin: boolean;
  accessToken: string;
  filteredProposals: ProposalLite[];
  extractProposalValue: (proposal: any) => number;
  normalizeStatus: (status?: string) => string;
};

const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Fev" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Abr" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Ago" },
  { value: 9, label: "Set" },
  { value: 10, label: "Out" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dez" },
];

const AVAILABLE_YEARS = Array.from({ length: 12 }, (_, index) => 2025 + index);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function parseGoalValue(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export default function GoalsPanel({
  isAdmin,
  accessToken,
  filteredProposals,
  extractProposalValue,
  normalizeStatus,
}: GoalsPanelProps) {
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [savingGoals, setSavingGoals] = useState(false);
  const [cardsCollapsed, setCardsCollapsed] = useState(true);
  const [chartCollapsed, setChartCollapsed] = useState(true);
  const [goals, setGoals] = useState<Record<number, string>>({
    1: "",
    2: "",
    3: "",
    4: "",
    5: "",
    6: "",
    7: "",
    8: "",
    9: "",
    10: "",
    11: "",
    12: "",
  });

  useEffect(() => {
    async function loadGoals() {
      if (!accessToken) {
        setLoadingGoals(false);
        return;
      }

      setLoadingGoals(true);

      try {
        const response = await apiFetch(
          `/api/monthly-goals?year=${selectedYear}`,
          accessToken
        );

        if (!response.ok) {
          throw new Error("Falha ao carregar metas.");
        }

        const json = await response.json();

        const rows: GoalRow[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.items)
          ? json.items
          : Array.isArray(json?.goals)
          ? json.goals
          : [];

        const nextGoals: Record<number, string> = {
          1: "",
          2: "",
          3: "",
          4: "",
          5: "",
          6: "",
          7: "",
          8: "",
          9: "",
          10: "",
          11: "",
          12: "",
        };

        for (const row of rows) {
          if (!row?.month) continue;
          const value =
            typeof row.target_value === "number"
              ? row.target_value.toString()
              : typeof row.target_value === "string"
              ? row.target_value
              : "";
          nextGoals[row.month] = value;
        }

        setGoals(nextGoals);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingGoals(false);
      }
    }

    loadGoals();
  }, [accessToken, selectedYear]);

  const approvedByMonth = useMemo(() => {
    const result: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
      12: 0,
    };

    for (const proposal of filteredProposals) {
        const normalizedStatus = normalizeStatus(proposal.status);

        if (!(normalizedStatus === "approved" || normalizedStatus === "published")) {
          continue;
        }

        const approvalDateRaw = proposal.approved_at || proposal.created_at;
        if (!approvalDateRaw) continue;

        const date = new Date(approvalDateRaw);
        if (Number.isNaN(date.getTime())) continue;
        if (date.getFullYear() !== selectedYear) continue;

        const month = date.getMonth() + 1;
        result[month] += extractProposalValue(proposal);
      }

    return result;
  }, [filteredProposals, extractProposalValue, normalizeStatus, selectedYear]);

  const targetByMonth = useMemo(() => {
    const result: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
      12: 0,
    };

    for (const month of MONTHS) {
      result[month.value] = parseGoalValue(goals[month.value] || "");
    }

    return result;
  }, [goals]);

  const totals = useMemo(() => {
    let totalTarget = 0;
    let totalApproved = 0;

    for (const month of MONTHS) {
      totalTarget += targetByMonth[month.value] || 0;
      totalApproved += approvedByMonth[month.value] || 0;
    }

    const percentage = totalTarget > 0 ? (totalApproved / totalTarget) * 100 : 0;

    return {
      totalTarget,
      totalApproved,
      percentage,
    };
  }, [approvedByMonth, targetByMonth]);

  const chartMax = useMemo(() => {
    const values = MONTHS.flatMap((month) => [
      approvedByMonth[month.value] || 0,
      targetByMonth[month.value] || 0,
    ]);
    return Math.max(...values, 1);
  }, [approvedByMonth, targetByMonth]);

  function handleGoalChange(month: number, value: string) {
    setGoals((current) => ({
      ...current,
      [month]: value,
    }));
  }

  function replicateToAllMonths() {
    const firstFilled =
      MONTHS.map((month) => goals[month.value]).find((value) => String(value || "").trim()) ||
      "";

    if (!firstFilled) {
      window.alert("Preencha pelo menos um mês para replicar.");
      return;
    }

    const replicated: Record<number, string> = {
      1: firstFilled,
      2: firstFilled,
      3: firstFilled,
      4: firstFilled,
      5: firstFilled,
      6: firstFilled,
      7: firstFilled,
      8: firstFilled,
      9: firstFilled,
      10: firstFilled,
      11: firstFilled,
      12: firstFilled,
    };

    setGoals(replicated);
  }

  async function saveGoals() {
    if (!isAdmin) return;
    if (!accessToken) return;

    setSavingGoals(true);

    try {
      const payload = MONTHS.map((month) => ({
        month: month.value,
        target_value: parseGoalValue(goals[month.value] || "0"),
      }));

      const response = await apiFetch(
        `/api/monthly-goals/${selectedYear}`,
        accessToken,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ goals: payload }),
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao salvar metas.");
      }

      window.alert("Metas salvas com sucesso.");
    } catch (error) {
      console.error(error);
      window.alert("Não foi possível salvar as metas mensais.");
    } finally {
      setSavingGoals(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Metas x aprovadas</h2>
            <p className="text-sm text-slate-600">
              Comparativo mensal entre metas cadastradas e propostas aprovadas no mês da aprovação.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              {AVAILABLE_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setChartCollapsed((prev) => !prev)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {chartCollapsed ? "Expandir gráfico" : "Recolher gráfico"}
            </button>
          </div>
        </div>

        {!chartCollapsed && (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Meta anual
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {loadingGoals ? "Carregando..." : formatCurrency(totals.totalTarget)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Aprovado no ano
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">
                  {formatCurrency(totals.totalApproved)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Atingimento
                </p>
                <p className="mt-2 text-2xl font-bold text-violet-700">
                  {formatPercent(totals.percentage)}
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <div className="grid min-w-[960px] grid-cols-12 gap-4">
                {MONTHS.map((month) => {
                  const target = targetByMonth[month.value] || 0;
                  const approved = approvedByMonth[month.value] || 0;

                  const targetHeight = `${Math.max((target / chartMax) * 180, target > 0 ? 8 : 0)}px`;
                  const approvedHeight = `${Math.max((approved / chartMax) * 180, approved > 0 ? 8 : 0)}px`;

                  return (
                    <div
                      key={month.value}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <p className="mb-3 text-center text-sm font-semibold text-slate-700">
                        {month.label}
                      </p>

                      <div className="flex h-[220px] items-end justify-center gap-3">
                        <div className="flex flex-col items-center gap-2">
                          <div
                            className="w-8 rounded-t bg-slate-300"
                            style={{ height: targetHeight }}
                            title={`Meta: ${formatCurrency(target)}`}
                          />
                          <span className="text-[11px] text-slate-500">Meta</span>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                          <div
                            className="w-8 rounded-t bg-emerald-500"
                            style={{ height: approvedHeight }}
                            title={`Aprovado: ${formatCurrency(approved)}`}
                          />
                          <span className="text-[11px] text-slate-500">Aprov.</span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1 text-xs text-slate-600">
                        <p>Meta: {formatCurrency(target)}</p>
                        <p>Aprovado: {formatCurrency(approved)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Cadastro de metas mensais
            </h2>
            <p className="text-sm text-slate-600">
              Defina metas globais por mês para acompanhar a operação.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCardsCollapsed((prev) => !prev)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {cardsCollapsed ? "Expandir cadastro" : "Recolher cadastro"}
          </button>
        </div>

        {!cardsCollapsed && (
          <div className="mt-6">
            {isAdmin ? (
              <>
                <div className="mb-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={replicateToAllMonths}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Replicar valor para todos os meses
                  </button>

                  <button
                    type="button"
                    onClick={saveGoals}
                    disabled={savingGoals}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingGoals ? "Salvando..." : "Salvar metas"}
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {MONTHS.map((month) => (
                    <div
                      key={month.value}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        {month.label}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={goals[month.value] || ""}
                        onChange={(e) => handleGoalChange(month.value, e.target.value)}
                        placeholder="Ex.: 150000"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Somente administradores podem cadastrar ou alterar metas mensais.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
