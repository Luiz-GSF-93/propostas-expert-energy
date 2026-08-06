"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";

type LoansSummary = {
  total_contracts: number;
  total_principal: number;
  total_net_amount: number;
  total_balance_outstanding: number;
  total_installments_paid: number;
  total_installments_open: number;
  total_installments_overdue: number;
  total_monthly_cost: number;
  avg_monthly_rate: number;
  avg_annual_rate: number;
  next_due_date: string | null;
};

type LoanContract = {
  id: string;
  contract_number: string;
  lender: string;
  loan_type: string;
  principal_amount: number;
  net_amount: number;
  installment_amount: number | null;
  installments_total: number;
  installments_paid_count: number;
  installments_open_count: number;
  installments_overdue_count: number;
  balance_outstanding: number;
  current_installment_amount: number;
  next_due_date: string | null;
  monthly_rate: number;
  annual_rate: number;
  monthly_index_rate: number;
  annual_index_rate: number;
  iof: number;
  fees: number;
  grace_months: number;
  amortization_system: string;
  start_date: string | null;
  release_date: string | null;
  first_due_date: string | null;
  final_due_date: string | null;
  notes: string;
  status: string;
};

type LoanInstallment = {
  number: number;
  due_date: string | null;
  installment_amount: number;
  amortization_amount: number;
  interest_amount: number;
  extra_cost_amount: number;
  balance_before: number;
  balance_after: number;
  status: "paid" | "open" | "overdue";
};

type LoanDetailResponse = {
  contract: LoanContract;
  schedule: LoanInstallment[];
  schedule_summary: {
    total_installments: number;
    paid_installments: number;
    open_installments: number;
    overdue_installments: number;
    total_interest: number;
    total_amortization: number;
    total_extra_costs: number;
  };
};

type CalcResponse = {
  contract: LoanContract;
  schedule: LoanInstallment[];
  schedule_summary: LoanDetailResponse["schedule_summary"];
};

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value?: number | null) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [yyyy, mm, dd] = value.split("-");
  if (!yyyy || !mm || !dd) return value;
  return `${dd}/${mm}/${yyyy}`;
}

async function getToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw new Error("Erro ao obter sessão");
  if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");
  return session.access_token;
}

export default function EmprestimosPage() {
  const [summary, setSummary] = useState<LoansSummary | null>(null);
  const [contracts, setContracts] = useState<LoanContract[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<LoanDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const [calcForm, setCalcForm] = useState({
    principal_amount: "100000",
    installments_total: "24",
    monthly_rate: "1.8",
    annual_rate: "",
    iof: "0",
    fees: "0",
    grace_months: "0",
    amortization_system: "PRICE",
    first_due_date: "",
  });
  const [calcResult, setCalcResult] = useState<CalcResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const token = await getToken();

        const [summaryRes, contractsRes] = await Promise.all([
          apiFetch("/api/finance/emprestimos/resumo", token),
          apiFetch("/api/finance/emprestimos/contratos", token),
        ]);

        const summaryJson = await summaryRes.json();
        const contractsJson = await contractsRes.json();

        if (!summaryRes.ok) throw new Error(summaryJson?.message || "Erro ao carregar resumo");
        if (!contractsRes.ok) throw new Error(contractsJson?.message || "Erro ao carregar contratos");

        if (!active) return;

        setSummary(summaryJson.summary || null);
        setContracts(Array.isArray(contractsJson.contracts) ? contractsJson.contracts : []);

        const firstId = contractsJson.contracts?.[0]?.id || "";
        setSelectedId((prev) => prev || firstId);
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
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedId) {
      setDetail(null);
      return;
    }

    async function loadDetail() {
      try {
        setDetailLoading(true);
        const token = await getToken();
        const res = await apiFetch(`/api/finance/emprestimos/contratos/${selectedId}`, token);
        const json = await res.json();

        if (!res.ok) throw new Error(json?.message || "Erro ao carregar detalhe do empréstimo");
        if (active) {
          setDetail(json);

          setCalcForm((prev) => ({
            ...prev,
            principal_amount: String(json.contract?.principal_amount ?? prev.principal_amount),
            installments_total: String(json.contract?.installments_total ?? prev.installments_total),
            monthly_rate: String(json.contract?.monthly_rate ?? prev.monthly_rate),
            annual_rate: String(json.contract?.annual_rate ?? prev.annual_rate),
            iof: String(json.contract?.iof ?? prev.iof),
            fees: String(json.contract?.fees ?? prev.fees),
            grace_months: String(json.contract?.grace_months ?? prev.grace_months),
            amortization_system: json.contract?.amortization_system || prev.amortization_system,
            first_due_date: json.contract?.first_due_date || prev.first_due_date,
          }));
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Erro ao carregar detalhe");
        }
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    let active = true;

    async function calculate() {
      if (!calcForm.principal_amount || !calcForm.installments_total) {
        setCalcResult(null);
        return;
      }

      if (!calcForm.monthly_rate && !calcForm.annual_rate) {
        setCalcResult(null);
        return;
      }

      try {
        const token = await getToken();
        const res = await apiFetch("/api/finance/emprestimos/calcular", token, {
          method: "POST",
          body: JSON.stringify({
            principal_amount: calcForm.principal_amount,
            installments_total: calcForm.installments_total,
            monthly_rate: calcForm.monthly_rate,
            annual_rate: calcForm.annual_rate,
            iof: calcForm.iof,
            fees: calcForm.fees,
            grace_months: calcForm.grace_months,
            amortization_system: calcForm.amortization_system,
            first_due_date: calcForm.first_due_date,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Erro ao calcular empréstimo");

        if (active) {
          setCalcResult(json);
        }
      } catch {
        if (active) {
          setCalcResult(null);
        }
      }
    }

    const timer = setTimeout(calculate, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [calcForm]);

  const cards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Total de contratos", value: String(summary.total_contracts || 0) },
      { label: "Saldo devedor total", value: formatCurrency(summary.total_balance_outstanding) },
      { label: "Parcelas pagas", value: String(summary.total_installments_paid || 0) },
      { label: "Parcelas em aberto", value: String(summary.total_installments_open || 0) },
      { label: "Parcelas vencidas", value: String(summary.total_installments_overdue || 0) },
      { label: "Custo mensal total", value: formatCurrency(summary.total_monthly_cost) },
      { label: "Juros médios a.m.", value: formatPercent(summary.avg_monthly_rate) },
      { label: "Juros médios a.a.", value: formatPercent(summary.avg_annual_rate) },
      { label: "Próximo vencimento", value: formatDate(summary.next_due_date) },
    ];
  }, [summary]);

  return (
    <FinanceModuleShell
      title="Empréstimos"
      subtitle="Gestão consolidada de contratos, parcelas, taxas, custos adicionais e simulação automática."
    >
      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Carregando módulo de empréstimos...</p>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm font-medium text-red-700">Erro: {error}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
                <p className="mt-3 text-2xl font-bold text-slate-900">{card.value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Contratos</h2>
                  <p className="text-sm text-slate-500">Selecione um empréstimo para ver parcelas, custos e cronograma.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-3">Contrato</th>
                      <th className="px-3 py-3">Banco</th>
                      <th className="px-3 py-3 text-right">Saldo</th>
                      <th className="px-3 py-3 text-right">Parcela</th>
                      <th className="px-3 py-3 text-right">a.m.</th>
                      <th className="px-3 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((contract) => {
                      const active = selectedId === contract.id;
                      return (
                        <tr
                          key={contract.id}
                          className={active ? "bg-slate-100" : "border-b border-slate-100 hover:bg-slate-50"}
                        >
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-900">{contract.contract_number}</div>
                            <div className="text-xs text-slate-500">{contract.loan_type || "Empréstimo"}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{contract.lender || "-"}</td>
                          <td className="px-3 py-3 text-right font-medium text-slate-900">
                            {formatCurrency(contract.balance_outstanding)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-700">
                            {formatCurrency(contract.current_installment_amount)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-700">
                            {formatPercent(contract.monthly_rate)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedId(contract.id)}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                active
                                  ? "bg-slate-900 text-white"
                                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {active ? "Selecionado" : "Abrir"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">Detalhe do contrato</h2>
              <p className="mt-1 text-sm text-slate-500">Campos completos do cadastro, taxas e situação das parcelas.</p>

              {detailLoading ? (
                <p className="mt-6 text-sm text-slate-500">Carregando detalhe...</p>
              ) : !detail ? (
                <p className="mt-6 text-sm text-slate-500">Selecione um contrato para visualizar.</p>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ["Banco", detail.contract.lender || "-"],
                      ["Contrato", detail.contract.contract_number || "-"],
                      ["Modalidade", detail.contract.loan_type || "-"],
                      ["Amortização", detail.contract.amortization_system || "-"],
                      ["Valor principal", formatCurrency(detail.contract.principal_amount)],
                      ["Valor líquido", formatCurrency(detail.contract.net_amount)],
                      ["Saldo devedor", formatCurrency(detail.contract.balance_outstanding)],
                      ["Parcela atual", formatCurrency(detail.contract.current_installment_amount)],
                      ["Juros a.m.", formatPercent(detail.contract.monthly_rate)],
                      ["Juros a.a.", formatPercent(detail.contract.annual_rate)],
                      ["Índice a.m.", formatPercent(detail.contract.monthly_index_rate)],
                      ["Índice a.a.", formatPercent(detail.contract.annual_index_rate)],
                      ["IOF", formatCurrency(detail.contract.iof)],
                      ["Tarifas / custos", formatCurrency(detail.contract.fees)],
                      ["Carência", `${detail.contract.grace_months || 0} mês(es)`],
                      ["1º vencimento", formatDate(detail.contract.first_due_date)],
                      ["Vencimento final", formatDate(detail.contract.final_due_date)],
                      ["Status", detail.contract.status || "-"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                        <p className="mt-2 font-semibold text-slate-900">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-bold text-slate-900">Resumo do cronograma</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Pagas</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{detail.schedule_summary.paid_installments}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Em aberto</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{detail.schedule_summary.open_installments}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Vencidas</p>
                        <p className="mt-1 text-lg font-semibold text-red-600">{detail.schedule_summary.overdue_installments}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">Parcelas do contrato</h2>
              <p className="mt-1 text-sm text-slate-500">Acompanhamento de vencimento, amortização, juros e saldo.</p>

              {!detail?.schedule?.length ? (
                <p className="mt-6 text-sm text-slate-500">Sem cronograma calculado para este contrato.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-3">Parcela</th>
                        <th className="px-3 py-3">Vencimento</th>
                        <th className="px-3 py-3 text-right">Valor</th>
                        <th className="px-3 py-3 text-right">Amortização</th>
                        <th className="px-3 py-3 text-right">Juros</th>
                        <th className="px-3 py-3 text-right">Custos</th>
                        <th className="px-3 py-3 text-right">Saldo após</th>
                        <th className="px-3 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.schedule.map((item) => (
                        <tr key={item.number} className="border-b border-slate-100">
                          <td className="px-3 py-3 font-medium text-slate-900">{item.number}</td>
                          <td className="px-3 py-3 text-slate-700">{formatDate(item.due_date)}</td>
                          <td className="px-3 py-3 text-right text-slate-900">{formatCurrency(item.installment_amount)}</td>
                          <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(item.amortization_amount)}</td>
                          <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(item.interest_amount)}</td>
                          <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(item.extra_cost_amount)}</td>
                          <td className="px-3 py-3 text-right text-slate-900">{formatCurrency(item.balance_after)}</td>
                          <td className="px-3 py-3 text-right">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                item.status === "paid"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : item.status === "overdue"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {item.status === "paid"
                                ? "Paga"
                                : item.status === "overdue"
                                ? "Vencida"
                                : "Em aberto"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">Calculadora automática</h2>
              <p className="mt-1 text-sm text-slate-500">Simule o contrato com atualização automática ao editar os campos.</p>

              <div className="mt-5 grid gap-3">
                {[
                  ["principal_amount", "Valor principal", "number"],
                  ["installments_total", "Quantidade de parcelas", "number"],
                  ["monthly_rate", "Juros a.m. (%)", "number"],
                  ["annual_rate", "Juros a.a. (%)", "number"],
                  ["iof", "IOF (R$)", "number"],
                  ["fees", "Tarifas / custos (R$)", "number"],
                  ["grace_months", "Carência (meses)", "number"],
                  ["first_due_date", "Primeiro vencimento", "date"],
                ].map(([key, label, type]) => (
                  <label key={key} className="grid gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                    <input
                      type={type}
                      value={(calcForm as Record<string, string>)[key]}
                      onChange={(e) => setCalcForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 focus:border-slate-500"
                    />
                  </label>
                ))}

                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sistema de amortização</span>
                  <select
                    value={calcForm.amortization_system}
                    onChange={(e) => setCalcForm((prev) => ({ ...prev, amortization_system: e.target.value }))}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                  >
                    <option value="PRICE">PRICE</option>
                    <option value="SAC">SAC</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-900">Resultado da simulação</h3>

                {!calcResult ? (
                  <p className="mt-3 text-sm text-slate-500">Preencha principal, parcelas e taxa para calcular.</p>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Parcela estimada</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(calcResult.contract.current_installment_amount)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Saldo final</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(calcResult.contract.balance_outstanding)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Juros totais</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(calcResult.schedule_summary.total_interest)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Custos extras</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(calcResult.schedule_summary.total_extra_costs)}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">
                      A simulação é recalculada automaticamente ao alterar valor, prazo, taxa, IOF, tarifas e carência.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </FinanceModuleShell>
  );
}
