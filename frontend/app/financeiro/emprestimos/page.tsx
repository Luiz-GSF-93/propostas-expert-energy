"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import { supabase } from "@/lib/supabase";

type AnyRecord = Record<string, any>;

type LoanContract = {
  id: string;
  contract_code?: string;
  contract_number?: string;
  contract_name?: string;
  loan_type?: string;
  lender?: string;
  principal_amount?: number | string;
  net_amount?: number | string;
  installments_total?: number | string;
  installments_paid?: number | string;
  installment_amount?: number | string;
  current_installment_amount?: number | string;
  monthly_rate?: number | string;
  annual_rate?: number | string;
  iof?: number | string;
  fees?: number | string;
  grace_months?: number | string;
  first_due_date?: string | null;
  final_due_date?: string | null;
  amortization_system?: string;
  status?: string;
  notes?: string;
  total_paid?: number | string;
  total_paid_amount?: number | string;
  total_open?: number | string;
  paid_installments?: number | string;
  open_installments?: number | string;
  overdue_installments?: number | string;
  installments_paid_count?: number | string;
  installments_open_count?: number | string;
  installments_overdue_count?: number | string;
  next_due_date?: string | null;
  current_balance?: number | string;
  balance_outstanding?: number | string;
};

type LoanInstallment = {
  id: string;
  contract_id: string;
  installment_number: number;
  due_date?: string | null;
  installment_amount?: number | string;
  amortization_amount?: number | string;
  interest_amount?: number | string;
  extra_cost_amount?: number | string;
  balance_before?: number | string;
  balance_after?: number | string;
  paid_amount?: number | string;
  paid_at?: string | null;
  status?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const EMPTY_FORM = {
  contract_code: "",
  contract_name: "",
  lender: "",
  principal_amount: "100000",
  installments_total: "24",
  monthly_rate: "1.8",
  annual_rate: "23.86",
  iof: "3800",
  fees: "1200",
  grace_months: "0",
  first_due_date: "2026-09-10",
  amortization_system: "PRICE",
  status: "active",
  notes: "",
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value
      .replace(/\s/g, "")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatMoney(value: unknown): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatPercent(value: unknown): string {
  const numeric = toNumber(value);
  return `${numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateBr(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function pickNumber(source: AnyRecord | null | undefined, keys: string[], fallback = 0): number {
  if (!source) return fallback;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return toNumber(value);
    }
  }
  return fallback;
}

function pickString(source: AnyRecord | null | undefined, keys: string[], fallback = ""): string {
  if (!source) return fallback;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }
  return fallback;
}

function statusClasses(status?: string): string {
  const normalized = (status || "").toLowerCase();
  if (normalized === "paid" || normalized === "pago") {
    return "bg-emerald-100 text-emerald-700 border border-emerald-200";
  }
  if (normalized === "overdue" || normalized === "vencido") {
    return "bg-rose-100 text-rose-700 border border-rose-200";
  }
  if (normalized === "active" || normalized === "ativo" || normalized === "open" || normalized === "aberto") {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }
  if (normalized === "closed" || normalized === "encerrado") {
    return "bg-slate-200 text-slate-700 border border-slate-300";
  }
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function debtLevel(ratio: number | null): { label: string; tone: string } {
  if (ratio === null || !Number.isFinite(ratio)) {
    return {
      label: "Sem base suficiente",
      tone: "bg-slate-100 text-slate-700 border border-slate-200",
    };
  }
  if (ratio <= 0.1) {
    return {
      label: "✅ Saudável (≤10%)",
      tone: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    };
  }
  if (ratio <= 0.3) {
    return {
      label: "⚠️ Moderado (10-30%)",
      tone: "bg-amber-100 text-amber-800 border border-amber-200",
    };
  }
  return {
    label: "🔴 Alto (>30%) - revisar endividamento",
    tone: "bg-rose-100 text-rose-700 border border-rose-200",
  };
}

async function authJson(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.message || `Erro HTTP ${response.status}`);
  }

  return json;
}

export default function EmprestimosPage() {
  const [summary, setSummary] = useState<AnyRecord | null>(null);
  const [contracts, setContracts] = useState<LoanContract[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<LoanContract | null>(null);
  const [schedule, setSchedule] = useState<LoanInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const rollup = useMemo(() => {
    const totalContracts = contracts.length;
    const activeContracts = contracts.filter(
      (item) => !["closed", "encerrado"].includes((item.status || "").toLowerCase())
    ).length;

    const totalPrincipal = contracts.reduce(
      (acc, item) => acc + toNumber(item.principal_amount),
      0
    );

    const totalOpen = contracts.reduce(
      (acc, item) =>
        acc +
        toNumber(
          item.current_balance ?? item.balance_outstanding ?? item.total_open ?? item.principal_amount
        ),
      0
    );

    const totalPaid = contracts.reduce(
      (acc, item) => acc + toNumber(item.total_paid ?? item.total_paid_amount),
      0
    );

    const totalMonthly = contracts.reduce(
      (acc, item) => acc + toNumber(item.installment_amount ?? item.current_installment_amount),
      0
    );

    const monthlyRates = contracts
      .map((item) => toNumber(item.monthly_rate))
      .filter((value) => value > 0);

    const annualRates = contracts
      .map((item) => toNumber(item.annual_rate))
      .filter((value) => value > 0);

    const avgMonthlyRate =
      monthlyRates.length > 0
        ? monthlyRates.reduce((acc, value) => acc + value, 0) / monthlyRates.length
        : 0;

    const avgAnnualRate =
      annualRates.length > 0
        ? annualRates.reduce((acc, value) => acc + value, 0) / annualRates.length
        : 0;

    const openInstallments = contracts.reduce(
      (acc, item) => acc + toNumber(item.open_installments ?? item.installments_open_count),
      0
    );

    const overdueInstallments = contracts.reduce(
      (acc, item) => acc + toNumber(item.overdue_installments ?? item.installments_overdue_count),
      0
    );

    const nextDueDate = contracts
      .map((item) => item.next_due_date)
      .filter(Boolean)
      .sort()[0] || "";

    return {
      totalContracts,
      activeContracts,
      totalPrincipal,
      totalOpen,
      totalPaid,
      totalMonthly,
      avgMonthlyRate,
      avgAnnualRate,
      openInstallments,
      overdueInstallments,
      nextDueDate,
    };
  }, [contracts]);

  const dashboard = useMemo(() => {
    const totalContracts = pickNumber(summary, ["total_contracts", "contracts_total"], rollup.totalContracts);
    const activeContracts = pickNumber(summary, ["active_contracts"], rollup.activeContracts);
    const totalPrincipal = pickNumber(summary, ["total_principal", "principal_total", "total_amount"], rollup.totalPrincipal);
    const totalOpen = pickNumber(summary, ["total_open", "outstanding_balance", "total_outstanding", "total_balance_outstanding"], rollup.totalOpen);
    const totalPaid = pickNumber(summary, ["total_paid", "total_paid_amount"], rollup.totalPaid);
    const totalMonthly = pickNumber(summary, ["monthly_cost_total", "total_monthly_cost"], rollup.totalMonthly);
    const avgMonthlyRate = pickNumber(summary, ["avg_monthly_rate", "average_monthly_rate"], rollup.avgMonthlyRate);
    const avgAnnualRate = pickNumber(summary, ["avg_annual_rate", "average_annual_rate"], rollup.avgAnnualRate);
    const openInstallments = pickNumber(summary, ["open_installments", "installments_open_total", "total_installments_open"], rollup.openInstallments);
    const overdueInstallments = pickNumber(summary, ["overdue_installments", "installments_overdue_total", "total_installments_overdue"], rollup.overdueInstallments);
    const nextDueDate = pickString(summary, ["next_due_date", "nearest_due_date"], rollup.nextDueDate);
    const debtRatioRaw = summary
      ? pickNumber(summary, ["debt_ratio", "debt_level_ratio", "indebtedness_ratio"], Number.NaN)
      : Number.NaN;

    const debtRatio = Number.isFinite(debtRatioRaw) ? debtRatioRaw : null;

    return {
      totalContracts,
      activeContracts,
      totalPrincipal,
      totalOpen,
      totalPaid,
      totalMonthly,
      avgMonthlyRate,
      avgAnnualRate,
      openInstallments,
      overdueInstallments,
      nextDueDate,
      debtRatio,
    };
  }, [rollup, summary]);

  const debtBadge = debtLevel(dashboard.debtRatio);

  async function loadBaseData(preferredId?: string | null) {
    setLoading(true);
    setError("");

    try {
      const [summaryResponse, contractsResponse] = await Promise.all([
        authJson("/api/finance/emprestimos/resumo"),
        authJson("/api/finance/emprestimos/contratos"),
      ]);

      const nextSummary = summaryResponse?.summary ?? summaryResponse ?? {};
      const nextContracts = contractsResponse?.contracts ?? contractsResponse?.rows ?? [];

      setSummary(nextSummary);
      setContracts(nextContracts);

      const nextSelectedId =
        preferredId ||
        selectedId ||
        nextContracts?.[0]?.id ||
        null;

      setSelectedId(nextSelectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar empréstimos.");
    } finally {
      setLoading(false);
    }
  }

  async function loadContractDetail(contractId: string) {
    setDetailLoading(true);
    setError("");

    try {
      const [detailResponse, scheduleResponse] = await Promise.all([
        authJson(`/api/finance/emprestimos/contratos/${contractId}`),
        authJson(`/api/finance/emprestimos/contratos/${contractId}/parcelas`),
      ]);

      setSelectedContract(detailResponse?.contract ?? detailResponse ?? null);
      setSchedule(scheduleResponse?.schedule ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar detalhes do contrato.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadContractDetail(selectedId);
    } else {
      setSelectedContract(null);
      setSchedule([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  async function handleCreateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        contract_code: form.contract_code,
        contract_name: form.contract_name,
        lender: form.lender,
        principal_amount: Number(form.principal_amount),
        installments_total: Number(form.installments_total),
        monthly_rate: Number(form.monthly_rate),
        annual_rate: Number(form.annual_rate),
        iof: Number(form.iof),
        fees: Number(form.fees),
        grace_months: Number(form.grace_months),
        first_due_date: form.first_due_date,
        amortization_system: form.amortization_system,
        status: form.status,
        notes: form.notes,
      };

      const response = await authJson("/api/finance/emprestimos/contratos", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const newId = response?.contract?.id ?? response?.id ?? null;

      setSuccess("Contrato criado com sucesso.");
      setIsModalOpen(false);
      resetForm();
      await loadBaseData(newId);

      if (newId) {
        setSelectedId(newId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar contrato.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInstallmentAction(item: LoanInstallment) {
    if (!selectedId) return;

    const isPaid = (item.status || "").toLowerCase() === "paid";

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      let payload: AnyRecord;

      if (isPaid) {
        payload = {
          status: "open",
          paid_amount: 0,
        };
      } else {
        const suggested = String(toNumber(item.installment_amount).toFixed(2));
        const paidAmountInput = window.prompt("Valor pago da parcela", suggested);
        if (paidAmountInput === null) {
          setSaving(false);
          return;
        }

        const paidDateInput =
          window.prompt(
            "Data do pagamento (AAAA-MM-DD)",
            new Date().toISOString().slice(0, 10)
          ) || new Date().toISOString().slice(0, 10);

        payload = {
          status: "paid",
          paid_amount: Number(
            paidAmountInput.replace(/\./g, "").replace(",", ".")
          ),
          paid_date: paidDateInput,
        };
      }

      await authJson(
        `/api/finance/emprestimos/contratos/${selectedId}/parcelas/${item.installment_number}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      setSuccess(isPaid ? "Parcela reaberta com sucesso." : "Parcela marcada como paga.");
      await Promise.all([loadContractDetail(selectedId), loadBaseData(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar parcela.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FinanceModuleShell
      title="Empréstimos"
      subtitle="Gestão profissional de contratos, parcelas, custos financeiros e acompanhamento do endividamento."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Painel consolidado de empréstimos
            </h2>
            <p className="text-sm text-slate-500">
              Visão gerencial com totais, custo mensal, juros médios e controle de parcelas.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => loadBaseData(selectedId)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Atualizar painel
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Novo contrato
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardCard
            label="Total contratado"
            value={formatMoney(dashboard.totalPrincipal)}
            hint="Soma dos valores originais dos contratos"
          />
          <DashboardCard
            label="Saldo em aberto"
            value={formatMoney(dashboard.totalOpen)}
            hint="Total ainda a pagar"
          />
          <DashboardCard
            label="Total pago"
            value={formatMoney(dashboard.totalPaid)}
            hint="Parcelas liquidadas"
          />
          <DashboardCard
            label="Custo mensal total"
            value={formatMoney(dashboard.totalMonthly)}
            hint="Impacto mensal consolidado"
          />
          <DashboardCard
            label="Contratos"
            value={`${dashboard.activeContracts}/${dashboard.totalContracts}`}
            hint="Ativos / totais"
          />
          <DashboardCard
            label="Juros médios"
            value={`${formatPercent(dashboard.avgMonthlyRate)} a.m. • ${formatPercent(dashboard.avgAnnualRate)} a.a.`}
            hint="Média simples dos contratos"
          />
          <DashboardCard
            label="Próximo vencimento"
            value={dashboard.nextDueDate ? formatDateBr(dashboard.nextDueDate) : "—"}
            hint={`${dashboard.openInstallments} parcelas em aberto`}
          />
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Nível de endividamento
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${debtBadge.tone}`}>
                {debtBadge.label}
              </span>
              {dashboard.debtRatio !== null ? (
                <span className="text-sm text-slate-500">
                  Índice: {formatPercent(dashboard.debtRatio * 100)}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Baseado no consolidado financeiro disponível no resumo do backend.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1.85fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Contratos cadastrados
                </h3>
                <p className="text-sm text-slate-500">
                  Clique em “Abrir” para visualizar detalhes e ajustar parcelas.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {contracts.length} registros
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Carregando contratos...
                </div>
              ) : contracts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Nenhum contrato cadastrado. Use o botão <strong>Novo contrato</strong>.
                </div>
              ) : (
                contracts.map((contract) => {
                  const isActive = contract.id === selectedId;
                  return (
                    <button
                      key={contract.id}
                      type="button"
                      onClick={() => setSelectedId(contract.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white shadow-md"
                          : "border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                            {(contract.contract_code || contract.contract_number || "Sem código")}
                          </p>
                          <h4 className="mt-1 text-sm font-semibold">
                            {(contract.contract_name || contract.loan_type || "Contrato sem nome")}
                          </h4>
                          <p className={`mt-1 text-sm ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                            {contract.lender || "Instituição não informada"}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isActive ? "bg-white/10 text-white border border-white/20" : statusClasses(contract.status)}`}>
                          {contract.status || "open"}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <InfoMini
                          label="Valor"
                          value={formatMoney(contract.principal_amount)}
                          inverted={isActive}
                        />
                        <InfoMini
                          label="Parcela"
                          value={formatMoney(contract.installment_amount ?? contract.current_installment_amount)}
                          inverted={isActive}
                        />
                        <InfoMini
                          label="Saldo"
                          value={formatMoney(contract.current_balance ?? contract.balance_outstanding ?? contract.total_open)}
                          inverted={isActive}
                        />
                        <InfoMini
                          label="Próx. venc."
                          value={formatDateBr(contract.next_due_date ?? contract.first_due_date)}
                          inverted={isActive}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Detalhe do contrato
                  </h3>
                  <p className="text-sm text-slate-500">
                    Visão completa do cadastro, taxas, custos e situação das parcelas.
                  </p>
                </div>
                {selectedContract ? (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(selectedContract.status)}`}>
                    {selectedContract.status || "active"}
                  </span>
                ) : null}
              </div>

              {detailLoading ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Carregando detalhe do contrato...
                </div>
              ) : !selectedContract ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Selecione um contrato para visualizar os detalhes.
                </div>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <DetailItem label="Código" value={(selectedContract.contract_code || selectedContract.contract_number || "—")} />
                    <DetailItem label="Instituição" value={selectedContract.lender || "—"} />
                    <DetailItem label="Valor do empréstimo" value={formatMoney(selectedContract.principal_amount)} />
                    <DetailItem label="Saldo atual" value={formatMoney(selectedContract.current_balance ?? selectedContract.balance_outstanding ?? selectedContract.total_open)} />
                    <DetailItem label="Parcela estimada" value={formatMoney(selectedContract.installment_amount ?? selectedContract.current_installment_amount)} />
                    <DetailItem label="Parcelas totais" value={toText(selectedContract.installments_total || "—")} />
                    <DetailItem label="Juros a.m." value={formatPercent(selectedContract.monthly_rate)} />
                    <DetailItem label="Juros a.a." value={formatPercent(selectedContract.annual_rate)} />
                    <DetailItem label="IOF" value={formatMoney(selectedContract.iof)} />
                    <DetailItem label="Tarifas / custos" value={formatMoney(selectedContract.fees)} />
                    <DetailItem label="Carência" value={`${toNumber(selectedContract.grace_months)} mês(es)`} />
                    <DetailItem label="Amortização" value={selectedContract.amortization_system || "—"} />
                    <DetailItem label="Primeiro vencimento" value={formatDateBr(selectedContract.first_due_date)} />
                    <DetailItem label="Próximo vencimento" value={formatDateBr(selectedContract.next_due_date)} />
                    <DetailItem label="Parcelas pagas" value={toText(selectedContract.paid_installments ?? selectedContract.installments_paid_count ?? "0")} />
                    <DetailItem label="Parcelas em aberto" value={toText(selectedContract.open_installments ?? selectedContract.installments_open_count ?? "0")} />
                  </div>

                  {selectedContract.notes ? (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="mb-1 font-semibold text-slate-800">Observações</p>
                      <p>{selectedContract.notes}</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Ajuste mensal de parcelas
                  </h3>
                  <p className="text-sm text-slate-500">
                    Marque como paga ou reabra parcelas conforme vencimento.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {schedule.length} parcelas
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-3 font-semibold">Parcela</th>
                      <th className="px-3 py-3 font-semibold">Vencimento</th>
                      <th className="px-3 py-3 font-semibold text-right">Valor</th>
                      <th className="px-3 py-3 font-semibold text-right">Amortização</th>
                      <th className="px-3 py-3 font-semibold text-right">Juros</th>
                      <th className="px-3 py-3 font-semibold text-right">Custos extras</th>
                      <th className="px-3 py-3 font-semibold text-right">Saldo após</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLoading ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                          Carregando cronograma...
                        </td>
                      </tr>
                    ) : schedule.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                          Nenhuma parcela encontrada para este contrato.
                        </td>
                      </tr>
                    ) : (
                      schedule.map((item) => {
                        const isPaid = (item.status || "").toLowerCase() === "paid";
                        return (
                          <tr key={item.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-3 font-medium text-slate-900">
                              {item.installment_number}
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {formatDateBr(item.due_date)}
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-slate-900">
                              {formatMoney(item.installment_amount)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {formatMoney(item.amortization_amount)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {formatMoney(item.interest_amount)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {formatMoney(item.extra_cost_amount)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {formatMoney(item.balance_after)}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(item.status)}`}>
                                {item.status || "open"}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleInstallmentAction(item)}
                                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isPaid ? "Reabrir" : "Marcar paga"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  Novo contrato de empréstimo
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Preencha os campos para gerar automaticamente o cronograma das parcelas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field
                  label="Código do contrato"
                  value={form.contract_code}
                  onChange={(value) => setForm((prev) => ({ ...prev, contract_code: value }))}
                  placeholder="BNDES-001"
                />
                <Field
                  label="Nome do contrato"
                  value={form.contract_name}
                  onChange={(value) => setForm((prev) => ({ ...prev, contract_name: value }))}
                  placeholder="Capital de Giro"
                />
                <Field
                  label="Instituição"
                  value={form.lender}
                  onChange={(value) => setForm((prev) => ({ ...prev, lender: value }))}
                  placeholder="BNDES"
                />
                <SelectField
                  label="Status"
                  value={form.status}
                  onChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
                  options={[
                    { value: "active", label: "Ativo" },
                    { value: "open", label: "Aberto" },
                    { value: "closed", label: "Encerrado" },
                  ]}
                />

                <Field
                  label="Valor do empréstimo"
                  value={form.principal_amount}
                  onChange={(value) => setForm((prev) => ({ ...prev, principal_amount: value }))}
                  type="number"
                />
                <Field
                  label="Parcelas totais"
                  value={form.installments_total}
                  onChange={(value) => setForm((prev) => ({ ...prev, installments_total: value }))}
                  type="number"
                />
                <Field
                  label="Juros a.m."
                  value={form.monthly_rate}
                  onChange={(value) => setForm((prev) => ({ ...prev, monthly_rate: value }))}
                  type="number"
                />
                <Field
                  label="Juros a.a."
                  value={form.annual_rate}
                  onChange={(value) => setForm((prev) => ({ ...prev, annual_rate: value }))}
                  type="number"
                />

                <Field
                  label="IOF"
                  value={form.iof}
                  onChange={(value) => setForm((prev) => ({ ...prev, iof: value }))}
                  type="number"
                />
                <Field
                  label="Tarifas / custos"
                  value={form.fees}
                  onChange={(value) => setForm((prev) => ({ ...prev, fees: value }))}
                  type="number"
                />
                <Field
                  label="Carência (meses)"
                  value={form.grace_months}
                  onChange={(value) => setForm((prev) => ({ ...prev, grace_months: value }))}
                  type="number"
                />
                <Field
                  label="Primeiro vencimento"
                  value={form.first_due_date}
                  onChange={(value) => setForm((prev) => ({ ...prev, first_due_date: value }))}
                  type="date"
                />

                <SelectField
                  label="Sistema de amortização"
                  value={form.amortization_system}
                  onChange={(value) => setForm((prev) => ({ ...prev, amortization_system: value }))}
                  options={[
                    { value: "PRICE", label: "PRICE" },
                    { value: "SAC", label: "SAC" },
                  ]}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Observações
                </label>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  placeholder="Informações complementares do contrato"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Salvando..." : "Salvar contrato"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </FinanceModuleShell>
  );
}

function DashboardCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function InfoMini({
  label,
  value,
  inverted = false,
}: {
  label: string;
  value: string;
  inverted?: boolean;
}) {
  return (
    <div className={`rounded-xl px-3 py-2 ${inverted ? "bg-white/10" : "bg-white"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${inverted ? "text-slate-300" : "text-slate-400"}`}>
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold ${inverted ? "text-white" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
