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
  total_scheduled_amount?: number | string;
  remaining_scheduled_amount?: number | string;
  total_loan_cost?: number | string;
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
  contract_number: "",
  lender: "",
  loan_type: "Empréstimo",
  principal_amount: "100000",
  installments_total: "24",
  monthly_rate: "1.8",
  annual_rate: "23.86",
  iof_percent: "3.8",
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
    const cleaned = value
      .replace(/\s/g, "")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = Number(cleaned);
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
  if (
    normalized === "active" ||
    normalized === "ativo" ||
    normalized === "open" ||
    normalized === "aberto"
  ) {
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return contracts.filter((item) => {
      const haystack = [
        item.contract_number,
        item.contract_code,
        item.loan_type,
        item.contract_name,
        item.lender,
        item.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const status = (item.status || "").toLowerCase();
      const matchSearch = !term || haystack.includes(term);
      const matchStatus = statusFilter === "all" ? true : status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [contracts, search, statusFilter]);

  const rollup = useMemo(() => {
    const totalContracts = contracts.length;
    const activeContracts = contracts.filter(
      (item) => !["closed", "encerrado"].includes((item.status || "").toLowerCase())
    ).length;

    const totalPrincipal = contracts.reduce(
      (acc, item) => acc + toNumber(item.principal_amount),
      0
    );

    const totalScheduled = contracts.reduce(
      (acc, item) =>
        acc + toNumber(item.total_scheduled_amount ?? (toNumber(item.current_installment_amount) * toNumber(item.installments_total))),
      0
    );

    const totalOpen = contracts.reduce(
      (acc, item) =>
        acc +
        toNumber(
          item.remaining_scheduled_amount ??
            item.current_balance ??
            item.balance_outstanding ??
            item.total_open
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

    const totalLoanCost = contracts.reduce(
      (acc, item) =>
        acc +
        toNumber(
          item.total_loan_cost ??
            (
              toNumber(item.total_scheduled_amount ?? (toNumber(item.current_installment_amount) * toNumber(item.installments_total))) -
              toNumber(item.principal_amount)
            )
        ),
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

    const nextDueDate =
      contracts
        .map((item) => item.next_due_date)
        .filter(Boolean)
        .sort()[0] || "";

    return {
      totalContracts,
      activeContracts,
      totalPrincipal,
      totalScheduled,
      totalOpen,
      totalPaid,
      totalMonthly,
      totalLoanCost,
      avgMonthlyRate,
      avgAnnualRate,
      openInstallments,
      overdueInstallments,
      nextDueDate,
    };
  }, [contracts]);

  const dashboard = useMemo(() => {
    const totalContracts = pickNumber(summary, ["total_contracts", "contracts_total"], rollup.totalContracts);
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
      activeContracts: rollup.activeContracts,
      totalPrincipal,
      totalScheduled: rollup.totalScheduled,
      totalOpen,
      totalPaid,
      totalMonthly,
      totalLoanCost: rollup.totalLoanCost,
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
        contract_number: form.contract_number,
        lender: form.lender,
        loan_type: form.loan_type,
        principal_amount: Number(form.principal_amount),
        installments_total: Number(form.installments_total),
        monthly_rate: Number(form.monthly_rate),
        annual_rate: Number(form.annual_rate),
        iof_percent: Number(form.iof_percent),
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

  const iofPreview = useMemo(() => {
    const principal = toNumber(form.principal_amount);
    const percent = toNumber(form.iof_percent);
    return principal * (percent / 100);
  }, [form.principal_amount, form.iof_percent]);

  const topCostContracts = useMemo(() => {
    return [...filteredContracts]
      .map((item) => {
        const totalCost =
          toNumber(
            item.total_loan_cost ??
              (
                toNumber(item.total_scheduled_amount) -
                toNumber(item.principal_amount)
              )
          ) || 0;

        return {
          id: item.id,
          contract: item,
          totalCost,
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 4);
  }, [filteredContracts]);

  const next30DaysContracts = useMemo(() => {
    const today = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);

    return [...filteredContracts]
      .filter((item) => item.next_due_date)
      .map((item) => {
        const due = new Date(`${item.next_due_date}T00:00:00`);
        return { item, due };
      })
      .filter(({ due }) => !Number.isNaN(due.getTime()) && due >= today && due <= limit)
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 6);
  }, [filteredContracts]);

  return (
    <FinanceModuleShell
      title="Empréstimos"
      subtitle="Gestão profissional de contratos, cronograma, custos financeiros, filtros e consolidado executivo."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Painel executivo de empréstimos
            </h2>
            <p className="text-sm text-slate-500">
              Consolidado com saldo total, custo financeiro, endividamento e próximos vencimentos.
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

        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
          <DashboardCard
            label="Total emprestado"
            value={formatMoney(dashboard.totalPrincipal)}
            hint="Soma dos valores principais cadastrados"
          />
          <DashboardCard
            label="Saldo consolidado"
            value={formatMoney(dashboard.totalOpen)}
            hint="Cronograma total menos parcelas já pagas"
          />
          <DashboardCard
            label="Custo dos empréstimos"
            value={formatMoney(dashboard.totalLoanCost)}
            hint="Total das parcelas menos principal total"
          />
          <DashboardCard
            label="Custo mensal total"
            value={formatMoney(dashboard.totalMonthly)}
            hint="Impacto mensal consolidado"
          />
          <DashboardCard
            label="Total pago"
            value={formatMoney(dashboard.totalPaid)}
            hint="Soma de todas as parcelas pagas"
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
          <DashboardCard
            label="Parcelas vencidas"
            value={String(dashboard.overdueInstallments)}
            hint="Requer atenção imediata"
          />
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:col-span-2 xl:col-span-3">
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
              Regra: até 10% saudável, 10% a 30% moderado e acima de 30% alto.
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_220px_220px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Buscar por contrato, banco ou modalidade
              </label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ex.: BNDES, Capital de giro, EMP-001"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
              >
                <option value="all">Todos</option>
                <option value="active">Active</option>
                <option value="ativo">Ativo</option>
                <option value="open">Open</option>
                <option value="aberto">Aberto</option>
                <option value="closed">Closed</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </div>

            <div className="flex items-end">
              <div className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{filteredContracts.length}</span>{" "}
                contrato(s) filtrado(s)
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Contratos cadastrados
                </h3>
                <p className="text-sm text-slate-500">
                  Lista filtrável, com destaque de custo e saldo.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {filteredContracts.length} registros
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Carregando contratos...
                </div>
              ) : filteredContracts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Nenhum contrato encontrado com os filtros atuais.
                </div>
              ) : (
                filteredContracts.map((contract) => {
                  const isActive = contract.id === selectedId;
                  const totalCost =
                    toNumber(
                      contract.total_loan_cost ??
                        (toNumber(contract.total_scheduled_amount) - toNumber(contract.principal_amount))
                    ) || 0;

                  return (
                    <button
                      key={contract.id}
                      type="button"
                      onClick={() => setSelectedId(contract.id)}
                      className={`w-full rounded-2xl border p-3.5 text-left transition min-w-0 ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white shadow-md"
                          : "border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-[11px] font-semibold uppercase tracking-[0.16em] ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                            {contract.contract_number || contract.contract_code || "Sem código"}
                          </p>
                          <h4 className="mt-1 break-words text-sm font-semibold leading-tight">
                            {contract.loan_type || contract.contract_name || "Contrato sem nome"}
                          </h4>
                          <p className={`mt-1 truncate text-sm ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                            {contract.lender || "Instituição não informada"}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isActive ? "bg-white/10 text-white border border-white/20" : statusClasses(contract.status)}`}>
                          {contract.status || "open"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <InfoMini
                          label="Principal"
                          value={formatMoney(contract.principal_amount)}
                          inverted={isActive}
                        />
                        <InfoMini
                          label="Parcela atual"
                          value={formatMoney(contract.installment_amount ?? contract.current_installment_amount)}
                          inverted={isActive}
                        />
                        <InfoMini
                          label="Saldo"
                          value={formatMoney(contract.remaining_scheduled_amount ?? contract.balance_outstanding)}
                          inverted={isActive}
                        />
                        <InfoMini
                          label="Custo total"
                          value={formatMoney(totalCost)}
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
                    Cadastro completo, taxas, custo do financiamento e situação do cronograma.
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
                    <DetailItem label="Código" value={selectedContract.contract_number || selectedContract.contract_code || "—"} />
                    <DetailItem label="Instituição" value={selectedContract.lender || "—"} />
                    <DetailItem label="Modalidade" value={selectedContract.loan_type || selectedContract.contract_name || "—"} />
                    <DetailItem label="Sistema" value={selectedContract.amortization_system || "—"} />
                    <DetailItem label="Principal" value={formatMoney(selectedContract.principal_amount)} />
                    <DetailItem label="Valor líquido" value={formatMoney(selectedContract.net_amount ?? selectedContract.principal_amount)} />
                    <DetailItem label="Saldo consolidado" value={formatMoney(selectedContract.remaining_scheduled_amount ?? selectedContract.balance_outstanding)} />
                    <DetailItem label="Custo do empréstimo" value={formatMoney(selectedContract.total_loan_cost)} />
                    <DetailItem label="Parcela atual" value={formatMoney(selectedContract.installment_amount ?? selectedContract.current_installment_amount)} />
                    <DetailItem label="Parcelas totais" value={toText(selectedContract.installments_total || "—")} />
                    <DetailItem label="Juros a.m." value={formatPercent(selectedContract.monthly_rate)} />
                    <DetailItem label="Juros a.a." value={formatPercent(selectedContract.annual_rate)} />
                    <DetailItem label="IOF aplicado" value={formatMoney(selectedContract.iof)} />
                    <DetailItem label="Tarifas / custos" value={formatMoney(selectedContract.fees)} />
                    <DetailItem label="Carência" value={`${toNumber(selectedContract.grace_months)} mês(es)`} />
                    <DetailItem label="Primeiro vencimento" value={formatDateBr(selectedContract.first_due_date)} />
                    <DetailItem label="Próximo vencimento" value={formatDateBr(selectedContract.next_due_date)} />
                    <DetailItem label="Parcelas pagas" value={toText(selectedContract.paid_installments ?? selectedContract.installments_paid_count ?? "0")} />
                    <DetailItem label="Parcelas em aberto" value={toText(selectedContract.open_installments ?? selectedContract.installments_open_count ?? "0")} />
                    <DetailItem label="Parcelas vencidas" value={toText(selectedContract.overdue_installments ?? selectedContract.installments_overdue_count ?? "0")} />
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
                    Marque como paga, reabra e acompanhe vencimentos.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {schedule.length} parcelas
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[980px] text-sm">
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
                  O IOF é calculado por percentual sobre o valor do empréstimo.
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
              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
                <Field
                  label="Código do contrato"
                  value={form.contract_number}
                  onChange={(value) => setForm((prev) => ({ ...prev, contract_number: value }))}
                  placeholder="BNDES-001"
                />
                <Field
                  label="Instituição"
                  value={form.lender}
                  onChange={(value) => setForm((prev) => ({ ...prev, lender: value }))}
                  placeholder="BNDES"
                />
                <Field
                  label="Modalidade"
                  value={form.loan_type}
                  onChange={(value) => setForm((prev) => ({ ...prev, loan_type: value }))}
                  placeholder="Capital de giro"
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
                  label="IOF (%)"
                  value={form.iof_percent}
                  onChange={(value) => setForm((prev) => ({ ...prev, iof_percent: value }))}
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

              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">IOF estimado:</span>{" "}
                {formatMoney(iofPreview)}
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
    <div className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-[clamp(1.1rem,1.6vw,1.9rem)] font-semibold leading-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p>
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
    <div className={`min-w-0 rounded-xl px-3 py-2 ${inverted ? "bg-white/10" : "bg-white"}`}>
      <p className={`truncate text-[10px] font-semibold uppercase tracking-[0.14em] ${inverted ? "text-slate-300" : "text-slate-400"}`}>
        {label}
      </p>
      <p className={`mt-1 break-words text-[13px] font-semibold leading-tight ${inverted ? "text-white" : "text-slate-900"}`}>
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
