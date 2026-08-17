"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import { supabase } from "@/lib/supabase";

type AnyRecord = Record<string, any>;

type LoanContract = {
  id: string;
  contract_number?: string;
  contract_code?: string;
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
  total_paid_amount?: number | string;
  total_paid?: number | string;
  installments_paid_count?: number | string;
  installments_open_count?: number | string;
  installments_overdue_count?: number | string;
  total_overdue_amount?: number | string;
  first_overdue_date?: string | null;
  next_future_due_date?: string | null;
  next_due_date?: string | null;
  balance_outstanding?: number | string;
  remaining_scheduled_amount?: number | string;
  total_scheduled_amount?: number | string;
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

type SettlementQuote = {
  settlement_date: string;
  open_installments: number;
  future_scheduled_amount: number;
  principal_present_value: number;
  current_interest_value: number;
  current_extra_cost_value: number;
  settlement_amount: number;
  settlement_savings: number;
  months_avoided: number;
};

const API_BASE = "/api/backend";

type LoanForm = {
  contract_number: string;
  lender: string;
  loan_type: string;
  principal_amount: string;
  installments_total: string;
  monthly_rate: string;
  annual_rate: string;
  iof_percent: string;
  fees: string;
  grace_months: string;
  first_due_date: string;
  amortization_system: string;
  status: string;
  notes: string;
  pay_interest_during_grace: string;
};

const EMPTY_FORM: LoanForm = {
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
  pay_interest_during_grace: "nao",
};

type RateSyncFormState = {
  monthly_rate: string;
  annual_rate: string;
};

function normalizeRateInput(value: string) {
  return String(value ?? "").replace(",", ".").trim();
}

function formatRateInput(value: number, decimals = 6) {
  if (!Number.isFinite(value)) return "";
  return value
    .toFixed(decimals)
    .replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "")
    .replace(/\.$/, "");
}

function monthlyToAnnualEquivalent(monthlyPercent: number) {
  const monthly = Number(monthlyPercent || 0) / 100;
  if (!Number.isFinite(monthly)) return 0;
  return (Math.pow(1 + monthly, 12) - 1) * 100;
}

function annualToMonthlyEquivalent(annualPercent: number) {
  const annual = Number(annualPercent || 0) / 100;
  if (!Number.isFinite(annual) || annual <= -1) return 0;
  return (Math.pow(1 + annual, 1 / 12) - 1) * 100;
}

function syncRatesFromMonthly<T extends RateSyncFormState>(prev: T, rawValue: string): T {
  const monthlyRaw = normalizeRateInput(rawValue);

  if (!monthlyRaw) {
    return {
      ...prev,
      monthly_rate: "",
      annual_rate: "",
    };
  }

  const monthly = Number(monthlyRaw);
  if (!Number.isFinite(monthly)) {
    return {
      ...prev,
      monthly_rate: monthlyRaw,
    };
  }

  return {
    ...prev,
    monthly_rate: monthlyRaw,
    annual_rate: formatRateInput(monthlyToAnnualEquivalent(monthly), 3),
  };
}

function syncRatesFromAnnual<T extends RateSyncFormState>(prev: T, rawValue: string): T {
  const annualRaw = normalizeRateInput(rawValue);

  if (!annualRaw) {
    return {
      ...prev,
      monthly_rate: "",
      annual_rate: "",
    };
  }

  const annual = Number(annualRaw);
  if (!Number.isFinite(annual)) {
    return {
      ...prev,
      annual_rate: annualRaw,
    };
  }

  return {
    ...prev,
    annual_rate: annualRaw,
    monthly_rate: formatRateInput(annualToMonthlyEquivalent(annual), 6),
  };
}


function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
  return `${toNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function calculateIofAmount(principalRaw: unknown, iofPercentRaw: unknown): number {
  const principal = toNumber(principalRaw);
  const iofPercent = toNumber(iofPercentRaw);
  if (principal <= 0 || iofPercent <= 0) return 0;
  return Number((principal * (iofPercent / 100)).toFixed(2));
}

function getIofPercentFromContract(contract: any): string {
  const principal = toNumber(contract?.principal_amount);
  const iof = toNumber(contract?.iof);

  if (principal <= 0 || iof <= 0) return "0";

  const percent = (iof / principal) * 100;
  return String(Number(percent.toFixed(6))).replace(".", ",");
}

function getContractConsolidatedAmount(contract: any, schedule?: any[]): number {
  if (Array.isArray(schedule) && schedule.length > 0) {
    const totalFromSchedule = schedule.reduce(
      (sum, item) => sum + toNumber(item?.installment_amount),
      0
    );
    if (totalFromSchedule > 0) return totalFromSchedule;
  }

  const totalScheduled = toNumber(contract?.total_scheduled_amount);
  if (totalScheduled > 0) return totalScheduled;

  const principal = toNumber(contract?.principal_amount);
  const explicitCost = toNumber(contract?.total_loan_cost);
  if (principal > 0 || explicitCost > 0) {
    return principal + explicitCost;
  }

  return toNumber(contract?.remaining_scheduled_amount ?? contract?.balance_outstanding);
}

function getContractLoanCostAmount(contract: any, schedule?: any[]): number {
  const consolidated = getContractConsolidatedAmount(contract, schedule);
  const principal = toNumber(contract?.principal_amount);
  const explicitCost = toNumber(contract?.total_loan_cost);

  if (explicitCost > 0 && Math.abs(explicitCost - Math.max(consolidated - principal, 0)) <= 1) {
    return explicitCost;
  }

  return Math.max(consolidated - principal, 0);
}

function getInstallmentVisualState(item: any) {
  const isPaid = String(item?.status || "").toLowerCase() === "paid";
  const isOverdue = String(item?.status || "").toLowerCase() === "overdue";
  const isGrace = Number(item?.amortization_amount || 0) === 0 && Number(item?.interest_amount || 0) > 0;

  if (isPaid) {
    return {
      rowClass: "bg-emerald-50/80",
      badgeClass: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      badgeLabel: "Paga",
    };
  }

  if (isOverdue) {
    return {
      rowClass: "bg-rose-50/80",
      badgeClass: "bg-rose-100 text-rose-700 border border-rose-200",
      badgeLabel: "Atrasada",
    };
  }

  if (isGrace) {
    return {
      rowClass: "bg-amber-50/80",
      badgeClass: "bg-amber-100 text-amber-700 border border-amber-200",
      badgeLabel: "Carência",
    };
  }

  return {
    rowClass: "bg-white",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
    badgeLabel: "Aberta",
  };
}

function formatDateBr(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function describeContractShort(item: LoanContract | null | undefined): string {
  if (!item) return "Contrato";
  return item.contract_number || item.contract_code || item.lender || item.loan_type || "Contrato";
}

function normalizeFilterStatus(status?: string): "active" | "encerrado" {
  const normalized = String(status || "").toLowerCase();
  if (["encerrado", "closed", "settled", "cancelled"].includes(normalized)) return "encerrado";
  return "active";
}

function statusClasses(status?: string): string {
  const normalized = (status || "").toLowerCase();
  if (normalized === "paid" || normalized === "pago") return "bg-emerald-100 text-emerald-700 border border-emerald-200";
  if (normalized === "overdue" || normalized === "vencido") return "bg-rose-100 text-rose-700 border border-rose-200";
  if (normalized === "encerrado" || normalized === "closed" || normalized === "settled") return "bg-slate-200 text-slate-700 border border-slate-300";
  return "bg-amber-100 text-amber-800 border border-amber-200";
}

function debtLevel(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio)) return { label: "Sem base suficiente", tone: "bg-slate-100 text-slate-700 border border-slate-200" };
  if (ratio <= 0.1) return { label: "✅ Saudável (≤10%)", tone: "bg-emerald-100 text-emerald-700 border border-emerald-200" };
  if (ratio <= 0.3) return { label: "⚠️ Moderado (10-30%)", tone: "bg-amber-100 text-amber-800 border border-amber-200" };
  return { label: "🔴 Alto (>30%) - revisar endividamento", tone: "bg-rose-100 text-rose-700 border border-rose-200" };
}

async function authJson(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

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
  if (!response.ok) throw new Error(json?.message || `Erro HTTP ${response.status}`);
  return json;
}

export default function EmprestimosPage() {
  const [summary, setSummary] = useState<AnyRecord | null>(null);
  const [latestBatch, setLatestBatch] = useState<AnyRecord | null>(null);
  const [contracts, setContracts] = useState<LoanContract[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<LoanContract | null>(null);
  const [schedule, setSchedule] = useState<LoanInstallment[]>([]);
  const [settlementQuote, setSettlementQuote] = useState<SettlementQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [settlementMode, setSettlementMode] = useState<"settlement" | "close">("settlement");
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState<LoanForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<LoanForm>(EMPTY_FORM);

  async function loadBaseData(preferredId?: string | null) {
    setLoading(true);
    try {
      setError(null);

      const [summaryResponse, contractsResponse] = await Promise.all([
        authJson("/api/finance/emprestimos/resumo"),
        authJson("/api/finance/emprestimos/contratos"),
      ]);

      const nextSummary = summaryResponse?.summary ?? null;
      const nextLatestBatch = summaryResponse?.latest_batch ?? null;
      const nextContracts = Array.isArray(contractsResponse?.contracts)
        ? contractsResponse.contracts
        : Array.isArray(contractsResponse?.data)
          ? contractsResponse.data
          : Array.isArray(contractsResponse)
            ? contractsResponse
            : [];

      setSummary(nextSummary);
      setLatestBatch(nextLatestBatch);
      setContracts(nextContracts);

      const id = preferredId || selectedId || nextContracts?.[0]?.id || null;
      setSelectedId(id);

      if (!id) {
        setSelectedContract(null);
        setSchedule([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
      setSummary(null);
      setLatestBatch(null);
      setContracts([]);
      setSelectedContract(null);
      setSchedule([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadContractDetail(contractId: string) {
    setDetailLoading(true);
    try {
      const [detailResponse, scheduleResponse] = await Promise.all([
        authJson(`/api/finance/emprestimos/contratos/${contractId}`),
        authJson(`/api/finance/emprestimos/contratos/${contractId}/parcelas`),
      ]);

      const contract = detailResponse?.contract ?? detailResponse;
      setSelectedContract(contract);
      setSchedule(scheduleResponse?.schedule ?? []);
      setSettlementQuote(null);

      setEditForm({
        contract_number: contract.contract_number || "",
        lender: contract.lender || "",
        loan_type: contract.loan_type || contract.contract_name || "Empréstimo",
        principal_amount: String(contract.principal_amount ?? ""),
        installments_total: String(contract.installments_total ?? ""),
        monthly_rate: String(contract.monthly_rate ?? ""),
        annual_rate: String(contract.annual_rate ?? ""),
        iof_percent: getIofPercentFromContract(contract),
        fees: String(contract.fees ?? 0),
        grace_months: String(contract.grace_months ?? 0),
        first_due_date: contract.first_due_date || "",
        amortization_system: contract.amortization_system || "PRICE",
        status: contract.status || "active",
        notes: contract.notes || "",
        pay_interest_during_grace: contract.pay_interest_during_grace ? "sim" : "nao",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar contrato.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadContractDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contracts.filter((item) => {
      const bag = [
        item.contract_number,
        item.contract_code,
        item.loan_type,
        item.contract_name,
        item.lender,
        item.status,
      ].filter(Boolean).join(" ").toLowerCase();

      const normalizedStatus = normalizeFilterStatus(item.status);
      const matchSearch = !term || bag.includes(term);
      const matchStatus = statusFilter === "all" ? true : normalizedStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [contracts, search, statusFilter]);

  const lenderSummary = useMemo(() => {
    const map = new Map<string, { lender: string; principal: number; saldo: number; contratos: number }>();

    filteredContracts.forEach((item) => {
      const lender = item.lender || "Não informado";
      const current = map.get(lender) || { lender, principal: 0, saldo: 0, contratos: 0 };
      current.principal += toNumber(item.principal_amount);
      current.saldo += toNumber(item.remaining_scheduled_amount ?? item.balance_outstanding);
      current.contratos += 1;
      map.set(lender, current);
    });

    return [...map.values()].sort((a, b) => b.saldo - a.saldo);
  }, [filteredContracts]);

  const alerts = useMemo(() => {
    const startOfDay = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const endOfDay = (date: Date) => {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    const parseDateOnly = (value?: string | null) => {
      if (!value) return null;
      const raw = String(value).slice(0, 10);
      const [year, month, day] = raw.split("-").map(Number);
      if (!year || !month || !day) return null;
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    };

    const today = startOfDay(new Date());

    const mk = (days: number) => {
      const limit = endOfDay(new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + days
      ));

      return filteredContracts.filter((item) => {
        const due = parseDateOnly(item.next_future_due_date || item.next_due_date);
        if (!due) return false;
        return due >= today && due <= limit;
      }).length;
    };

    return {
      d7: mk(7),
      d15: mk(15),
      d30: mk(30),
    };
  }, [filteredContracts]);

  const totalPrincipal = filteredContracts.reduce((acc, item) => acc + toNumber(item.principal_amount), 0);
  const annualRevenue = toNumber(latestBatch?.gross_revenue);
  const activeContractsForDebt = filteredContracts.filter(
    (item) => normalizeFilterStatus(item.status) === "active"
  );
  const monthlyCost = activeContractsForDebt.reduce(
    (acc, item) => acc + toNumber(item.current_installment_amount ?? item.installment_amount),
    0
  );
  const annualDebtCommitment = monthlyCost * 12;
  const calculatedDebtRatio = annualRevenue > 0 ? annualDebtCommitment / annualRevenue : null;
  const totalSaldo = filteredContracts.reduce((acc, item) => acc + toNumber(item.remaining_scheduled_amount ?? item.balance_outstanding), 0);
  const totalPagoResumo = Number(summary?.total_paid_amount ?? 0);
  const totalPago = totalPagoResumo;
  const overdueContracts = filteredContracts.reduce(
    (acc, item) => acc + toNumber(item.installments_overdue_count),
    0
  );
  const overdueAmount = filteredContracts.reduce(
    (acc, item) => acc + toNumber(item.total_overdue_amount),
    0
  );

  const overdueInstallmentsCount = overdueContracts;
  const overdueInstallmentsAmount = overdueAmount;
  const totalLoanCost = filteredContracts.reduce((acc, item) => acc + toNumber(item.total_loan_cost), 0);
  const firstOverdueContract = [...filteredContracts]
    .filter((item) => item.first_overdue_date && toNumber(item.installments_overdue_count) > 0)
    .sort((a, b) => String(a.first_overdue_date || "").localeCompare(String(b.first_overdue_date || "")))[0];

  const nextFutureContract = [...filteredContracts]
    .filter((item) => item.next_future_due_date)
    .sort((a, b) => String(a.next_future_due_date || "").localeCompare(String(b.next_future_due_date || "")))[0];

  const nextDueCardValue = firstOverdueContract
    ? "Parcela atrasada"
    : nextFutureContract
      ? formatDateBr(nextFutureContract.next_future_due_date)
      : "—";

  const nextDueCardHint = firstOverdueContract
    ? `1ª vencida: ${formatDateBr(firstOverdueContract.first_overdue_date)} • ${describeContractShort(firstOverdueContract)}\nPróximo futuro: ${nextFutureContract ? `${formatDateBr(nextFutureContract.next_future_due_date)} • ${describeContractShort(nextFutureContract)}` : "não há"}`
    : nextFutureContract
      ? `Próximo futuro: ${formatDateBr(nextFutureContract.next_future_due_date)} • ${describeContractShort(nextFutureContract)}`
      : "Sem vencimentos futuros";
  const debtBadge = debtLevel(calculatedDebtRatio);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = {
        contract_number: form.contract_number,
        lender: form.lender,
        loan_type: form.loan_type,
        principal_amount: Number(form.principal_amount),
        installments_total: Number(form.installments_total),
        monthly_rate: Number(form.monthly_rate),
        annual_rate: Number(form.annual_rate),
        iof_percent: Number(form.iof_percent),
        iof: calculateIofAmount(form.principal_amount, form.iof_percent),
        fees: Number(form.fees),
        grace_months: Number(form.grace_months),
        pay_interest_during_grace: form.pay_interest_during_grace === "sim",
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
      setIsNewOpen(false);
      await loadBaseData(newId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar contrato.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      setSaving(true);
      const payload = {
        contract_number: editForm.contract_number,
        lender: editForm.lender,
        loan_type: editForm.loan_type,
        principal_amount: Number(editForm.principal_amount),
        installments_total: Number(editForm.installments_total),
        monthly_rate: Number(editForm.monthly_rate),
        annual_rate: Number(editForm.annual_rate),
        iof_percent: Number(editForm.iof_percent),
        iof: calculateIofAmount(editForm.principal_amount, editForm.iof_percent),
        fees: Number(editForm.fees),
        grace_months: Number(editForm.grace_months),
        pay_interest_during_grace: editForm.pay_interest_during_grace === "sim",
        first_due_date: editForm.first_due_date,
        amortization_system: editForm.amortization_system,
        status: editForm.status,
        notes: editForm.notes,
      };

      await authJson(`/api/finance/emprestimos/contratos/${selectedId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setSuccess("Contrato atualizado com sucesso.");
      setIsEditOpen(false);
      await Promise.all([loadBaseData(selectedId), loadContractDetail(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar contrato.");
    } finally {
      setSaving(false);
    }
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function exportSelectedContractCsv() {
    if (!selectedContract) {
      setError("Selecione um contrato para exportar.");
      return;
    }

    const header = [
      ["Campo", "Valor"],
      ["Código", selectedContract.contract_number || selectedContract.contract_code || ""],
      ["Instituição", selectedContract.lender || ""],
      ["Modalidade", selectedContract.loan_type || selectedContract.contract_name || ""],
      ["Principal", String(toNumber(selectedContract.principal_amount).toFixed(2))],
      ["Saldo consolidado", String(toNumber(selectedContract.remaining_scheduled_amount ?? selectedContract.balance_outstanding).toFixed(2))],
      ["Custo do empréstimo", String(toNumber(selectedContract.total_loan_cost).toFixed(2))],
      ["Parcela atual", String(toNumber(selectedContract.current_installment_amount ?? selectedContract.installment_amount).toFixed(2))],
      ["Juros a.m.", String(toNumber(selectedContract.monthly_rate).toFixed(2))],
      ["Juros a.a.", String(toNumber(selectedContract.annual_rate).toFixed(2))],
      ["IOF", String(toNumber(selectedContract.iof).toFixed(2))],
      ["Tarifas", String(toNumber(selectedContract.fees).toFixed(2))],
      ["Primeiro vencimento", selectedContract.first_due_date || ""],
      ["Próximo vencimento", selectedContract.next_due_date || ""],
      ["Status", selectedContract.status || ""],
      ["" , ""],
      ["Cronograma", ""],
      ["Parcela", "Vencimento;Valor;Amortização;Juros;Custos;Saldo após;Valor pago;Data pagamento;Status"],
    ];

    const scheduleRows = schedule.map((item) => [
      String(item.installment_number),
      [
        item.due_date || "",
        toNumber(item.installment_amount).toFixed(2),
        toNumber(item.amortization_amount).toFixed(2),
        toNumber(item.interest_amount).toFixed(2),
        toNumber(item.extra_cost_amount).toFixed(2),
        toNumber(item.balance_after).toFixed(2),
        String(item.status || "").toLowerCase() === "paid"
          ? toNumber(item.paid_amount ?? item.installment_amount).toFixed(2)
          : "",
        String(item.status || "").toLowerCase() === "paid"
          ? item.paid_at || ""
          : "",
        item.status || "",
      ].join(";"),
    ]);

    const csv = [...header, ...scheduleRows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const code = selectedContract.contract_number || selectedContract.contract_code || "contrato";
    link.href = url;
    link.download = `emprestimo-${code}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printSelectedContractReport() {
    if (!selectedContract) {
      setError("Selecione um contrato para imprimir.");
      return;
    }

    const reportDate = new Date().toLocaleString("pt-BR");
    const code = selectedContract.contract_number || selectedContract.contract_code || "—";
    const lender = selectedContract.lender || "—";
    const type = selectedContract.loan_type || selectedContract.contract_name || "—";
    const principal = formatMoney(selectedContract.principal_amount);
    const saldo = formatMoney(selectedContract.remaining_scheduled_amount ?? selectedContract.balance_outstanding);
    const custo = formatMoney(getContractLoanCostAmount(selectedContract, schedule));
    const parcela = formatMoney(selectedContract.current_installment_amount ?? selectedContract.installment_amount);
    const jurosAm = formatPercent(selectedContract.monthly_rate);
    const jurosAa = formatPercent(selectedContract.annual_rate);
    const iof = formatMoney(selectedContract.iof);
    const fees = formatMoney(selectedContract.fees);
    const primeiroVenc = formatDateBr(selectedContract.first_due_date);
    const proxVenc = formatDateBr(selectedContract.next_due_date);
    const status = selectedContract.status || "—";
    const notas = selectedContract.notes || "—";

    const rows = schedule.map((item) => `
      <tr>
        <td>${escapeHtml(item.installment_number)}</td>
        <td>${escapeHtml(formatDateBr(item.due_date))}</td>
        <td>${escapeHtml(formatMoney(item.installment_amount))}</td>
        <td>${escapeHtml(formatMoney(item.amortization_amount))}</td>
        <td>${escapeHtml(formatMoney(item.interest_amount))}</td>
        <td>${escapeHtml(formatMoney(item.extra_cost_amount))}</td>
        <td>${escapeHtml(formatMoney(item.balance_after))}</td>
        <td>${escapeHtml(String(item.status || "").toLowerCase() === "paid" ? formatMoney(item.paid_amount ?? item.installment_amount) : "—")}</td>
        <td>${escapeHtml(String(item.status || "").toLowerCase() === "paid" ? formatDateBr(item.paid_at) : "—")}</td>
        <td>${escapeHtml(item.status || "")}</td>
      </tr>
    `).join("");

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório de Empréstimo - ${escapeHtml(code)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 14mm;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
            margin: 0;
            font-size: 12px;
          }
          .header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 16px;
          }
          .header h1 {
            margin: 0;
            font-size: 20px;
          }
          .header p {
            margin: 4px 0 0;
            color: #475569;
          }
          .meta {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 16px;
          }
          .box {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 10px;
          }
          .box .label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: #64748b;
            margin-bottom: 6px;
          }
          .box .value {
            font-size: 13px;
            font-weight: 700;
            word-break: break-word;
          }
          .section-title {
            margin: 18px 0 8px;
            font-size: 14px;
            font-weight: 700;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 11px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 6px 7px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f1f5f9;
          }
          .summary {
            margin-top: 18px;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 12px;
            background: #f8fafc;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 10px;
          }
          .footer {
            margin-top: 20px;
            font-size: 11px;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Expert Energy Perfomance em Energia</h1>
          <p>Relatório do contrato de empréstimo selecionado</p>
          <p>Data da impressão: ${escapeHtml(reportDate)}</p>
        </div>

        <div class="meta">
          <div class="box"><div class="label">Código</div><div class="value">${escapeHtml(code)}</div></div>
          <div class="box"><div class="label">Instituição</div><div class="value">${escapeHtml(lender)}</div></div>
          <div class="box"><div class="label">Modalidade</div><div class="value">${escapeHtml(type)}</div></div>
          <div class="box"><div class="label">Principal</div><div class="value">${escapeHtml(principal)}</div></div>
          <div class="box"><div class="label">Saldo consolidado</div><div class="value">${escapeHtml(saldo)}</div></div>
          <div class="box"><div class="label">Custo do empréstimo</div><div class="value">${escapeHtml(custo)}</div></div>
          <div class="box"><div class="label">Parcela atual</div><div class="value">${escapeHtml(parcela)}</div></div>
          <div class="box"><div class="label">Juros</div><div class="value">${escapeHtml(jurosAm)} a.m. • ${escapeHtml(jurosAa)} a.a.</div></div>
          <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(status)}</div></div>
          <div class="box"><div class="label">IOF</div><div class="value">${escapeHtml(iof)}</div></div>
          <div class="box"><div class="label">Tarifas</div><div class="value">${escapeHtml(fees)}</div></div>
          <div class="box"><div class="label">Vencimentos</div><div class="value">${escapeHtml(primeiroVenc)} → ${escapeHtml(proxVenc)}</div></div>
        </div>

        <div class="section-title">Observações</div>
        <div class="box">${escapeHtml(notas)}</div>

        <div class="section-title">Cronograma</div>
        <table>
          <thead>
            <tr>
              <th>Parcela</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Amortização</th>
              <th>Juros</th>
              <th>Custos</th>
              <th>Saldo após</th>
              <th>Valor pago</th>
              <th>Data pagamento</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="summary">
          <div class="section-title" style="margin-top:0">Resumo do contrato</div>
          <div class="summary-grid">
            <div class="box"><div class="label">Principal</div><div class="value">${escapeHtml(principal)}</div></div>
            <div class="box"><div class="label">Saldo consolidado</div><div class="value">${escapeHtml(saldo)}</div></div>
            <div class="box"><div class="label">Custo do empréstimo</div><div class="value">${escapeHtml(custo)}</div></div>
            <div class="box"><div class="label">Parcela atual</div><div class="value">${escapeHtml(parcela)}</div></div>
          </div>
        </div>

        <div class="footer">
          Relatório gerado pelo módulo de gestão de empréstimos.
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Não foi possível abrir a janela de impressão.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }

  async function handleDeleteContract() {
    if (!selectedId) return;

    const confirmed = window.confirm(
      "Excluir definitivamente este contrato e todas as parcelas vinculadas? Esta ação não poderá ser desfeita."
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      await authJson(`/api/finance/emprestimos/contratos/${selectedId}`, {
        method: "DELETE",
      });

      setSuccess("Contrato excluído com sucesso.");
      setSelectedId(null);
      setSelectedContract(null);
      setSchedule([]);
      setSettlementQuote(null);
      await loadBaseData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir contrato.");
    } finally {
      setSaving(false);
    }
  }

  function parseMoneyInput(value: string) {
    const raw = String(value || "")
      .replace(/R\$\s?/gi, "")
      .replace(/\s/g, "")
      .trim();

    if (!raw) return 0;

    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw) || /^-?\d+(,\d+)?$/.test(raw)) {
      return Number(raw.replace(/\./g, "").replace(",", "."));
    }

    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      return Number(raw);
    }

    return Number(raw.replace(/\./g, "").replace(",", "."));
  }

  function closePaymentModal() {
    if (saving) return;
    setPaymentModal({
      open: false,
      item: null,
      action: "paid",
      paidAmount: "",
      paidAt: new Date().toISOString().slice(0, 10),
    });
  }

  function handleInstallmentAction(item: LoanInstallment) {
    const isPaid = String(item.status || "").toLowerCase() === "paid";

    setError("");
    setSuccess("");
    setPaymentModal({
      open: true,
      item,
      action: isPaid ? "reopen" : "paid",
      paidAmount: Number(item.paid_amount ?? item.installment_amount ?? 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      paidAt: item.paid_at || new Date().toISOString().slice(0, 10),
    });
  }

  async function handleSubmitInstallmentAction() {
    if (!selectedId || !paymentModal.item) return;

    const isReopen = paymentModal.action === "reopen";

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      let payload: AnyRecord;

      if (isReopen) {
        payload = {
          status: "open",
          paid_amount: null,
          paid_at: null,
        };
      } else {
        const parsedPaidAmount = parseMoneyInput(paymentModal.paidAmount);

        if (!parsedPaidAmount || parsedPaidAmount <= 0) {
          setError("Informe um valor pago válido.");
          setSaving(false);
          return;
        }

        payload = {
          status: "paid",
          paid_amount: parsedPaidAmount,
          paid_at: paymentModal.paidAt || new Date().toISOString().slice(0, 10),
        };
      }

      await authJson(
        `/api/finance/emprestimos/contratos/${selectedId}/parcelas/${paymentModal.item.installment_number}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      closePaymentModal();
      setSuccess(isReopen ? "Parcela reaberta com sucesso." : "Parcela marcada como paga.");
      await Promise.all([loadContractDetail(selectedId), loadBaseData(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar parcela.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviewSettlement() {
    if (!selectedId) return;
    try {
      setSaving(true);
      const response = await authJson(`/api/finance/emprestimos/contratos/${selectedId}/quitacao-preview`, {
        method: "POST",
        body: JSON.stringify({ settlement_date: settlementDate }),
      });
      setSettlementQuote(response.quote);
      setIsSettlementOpen(true);
      setSettlementMode("settlement");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao simular quitação.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSettlement(mode: "settlement" | "close") {
    if (!selectedId) return;
    try {
      setSaving(true);
      const response = await authJson(`/api/finance/emprestimos/contratos/${selectedId}/encerrar`, {
        method: "POST",
        body: JSON.stringify({
          mode,
          settlement_date: settlementDate,
        }),
      });

      setSuccess(
        mode === "settlement"
          ? `Quitação antecipada aplicada. Economia estimada: ${formatMoney(response?.quote?.settlement_savings)}`
          : "Contrato encerrado com sucesso."
      );

      setIsSettlementOpen(false);
      await Promise.all([loadBaseData(selectedId), loadContractDetail(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao encerrar contrato.");
    } finally {
      setSaving(false);
    }
  }

  const iofPreview = useMemo(() => {
    const principal = parseMoneyInput(form.principal_amount);
    const percent = parseMoneyInput(form.iof_percent);
    return principal * (percent / 100);
  }, [form.principal_amount, form.iof_percent]);

  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    item: LoanInstallment | null;
    action: "paid" | "reopen";
    paidAmount: string;
    paidAt: string;
  }>({
    open: false,
    item: null,
    action: "paid",
    paidAmount: "",
    paidAt: new Date().toISOString().slice(0, 10),
  });

  const hasPaidInstallments = toNumber(
    selectedContract?.installments_paid_count ?? selectedContract?.installments_paid ?? 0
  ) > 0;

  return (
    <FinanceModuleShell
      title="Empréstimos"
      subtitle="Gestão profissional de contratos, quitação antecipada, alertas e consolidado executivo."
    >
      <div className="space-y-5">
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Painel executivo de empréstimos</h2>
            <p className="text-[11px] sm:text-xs text-slate-500 leading-snug break-words min-w-0">Cards compactos, alertas e ações de edição/quitação.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => loadBaseData(selectedId)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Atualizar painel</button>
            <button onClick={() => setIsNewOpen(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Novo contrato</button>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
          <DashboardCard label="Total emprestado" value={formatMoney(totalPrincipal)} hint="Valores principais" />
          <DashboardCard label="Saldo consolidado" value={formatMoney(totalSaldo)} hint="Parcelas futuras menos pagas" />
          <DashboardCard label="Custo dos empréstimos" value={formatMoney(totalLoanCost)} hint="Parcelas totais menos principal" />
          <DashboardCard label="Custo mensal" value={formatMoney(monthlyCost)} hint="Impacto mensal atual" />
          <DashboardCard label="Total pago" value={formatMoney(totalPago)} hint="Somente parcelas pagas registradas (resumo consolidado)" />
          <DashboardCard label="Contratos" value={`${filteredContracts.length}/${contracts.length}`} hint="Filtrados / totais" />
          <DashboardCard label="Próximo vencimento" value={nextDueCardValue} hint={nextDueCardHint} />
          <DashboardCard label="Alertas 7/15/30" value={`${alerts.d7}/${alerts.d15}/${alerts.d30}`} hint="Vencimentos próximos" />
          <DashboardCard
            label="Parcelas atrasadas"
            value={String(overdueInstallmentsCount)}
            hint={`Em atraso consolidado: ${formatMoney(overdueInstallmentsAmount)}`}
          />
          <div className="rounded-[18px] border border-slate-200 bg-white p-3 sm:p-3.5 shadow-sm min-w-0 overflow-hidden md:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 break-words">Nível de endividamento</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${debtBadge.tone}`}>{debtBadge.label}</span>
              {typeof calculatedDebtRatio === "number" ? <span className="text-[11px] sm:text-xs text-slate-500 leading-snug break-words min-w-0">Índice anualizado: {formatPercent(calculatedDebtRatio * 100)}</span> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Resumo por instituição</h3>
            <div className="mt-3 space-y-2">
              {lenderSummary.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Sem dados por instituição.</div>
              ) : lenderSummary.map((item) => (
                <div key={item.lender} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.lender}</p>
                    <p className="text-xs text-slate-500">{item.contratos} contrato(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Saldo</p>
                    <p className="text-sm font-semibold text-slate-900">{formatMoney(item.saldo)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Ações rápidas</h3>
            <div className="mt-3 grid gap-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contrato, banco, modalidade" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900">
                <option value="all">Todos</option>
                <option value="active">Active</option>
                <option value="encerrado">Encerrado</option>
              </select>
              <input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900" />
              <button onClick={handlePreviewSettlement} disabled={!selectedId || saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Simular quitação do contrato selecionado</button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Contratos cadastrados</h3>
                <p className="text-xs text-slate-500">Com destaque de custo e saldo</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">{filteredContracts.length} registro(s)</span>
            </div>

            <div className="mt-4 space-y-2.5">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Carregando...</div>
              ) : filteredContracts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Nenhum contrato encontrado.</div>
              ) : filteredContracts.map((contract) => {
                const isActive = contract.id === selectedId;
                return (
                  <button
                    key={contract.id}
                    type="button"
                    onClick={() => setSelectedId(contract.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition min-w-0 ${isActive ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
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
                        {contract.status || "ativo"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <InfoMini label="Principal" value={formatMoney(contract.principal_amount)} inverted={isActive} />
                      <InfoMini label="Parcela" value={formatMoney(contract.current_installment_amount ?? contract.installment_amount)} inverted={isActive} />
                      <InfoMini label="Saldo" value={formatMoney(getContractConsolidatedAmount(contract))} inverted={isActive} />
                      <InfoMini label="Custo" value={formatMoney(getContractLoanCostAmount(contract))} inverted={isActive} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Detalhe do contrato</h3>
                  <p className="text-xs text-slate-500">Edição, encerramento e quitação antecipada</p>
                </div>
                {selectedContract ? (
                  <div className="flex flex-wrap items-center gap-2 max-w-full">
                    <button onClick={() => setIsEditOpen(true)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Editar contrato</button>
                    <button onClick={exportSelectedContractCsv} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Download CSV</button>
                    <button onClick={printSelectedContractReport} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Imprimir relatório</button>
                    <button onClick={handlePreviewSettlement} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">Simular quitação</button>
                    <button onClick={() => { setSettlementMode("close"); setIsSettlementOpen(true); }} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">Encerrar sem quitação</button>
                    <button onClick={handleDeleteContract} className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">Excluir contrato</button>
                  </div>
                ) : null}
              </div>

              {detailLoading ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Carregando detalhe...</div>
              ) : !selectedContract ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Selecione um contrato.</div>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                    <DetailItem label="Código" value={selectedContract.contract_number || selectedContract.contract_code || "—"} />
                    <DetailItem label="Instituição" value={selectedContract.lender || "—"} />
                    <DetailItem label="Modalidade" value={selectedContract.loan_type || selectedContract.contract_name || "—"} />
                    <DetailItem label="Sistema" value={selectedContract.amortization_system || "—"} />
                    <DetailItem label="Principal" value={formatMoney(selectedContract.principal_amount)} />
                    <DetailItem label="Valor líquido" value={formatMoney(selectedContract.net_amount ?? selectedContract.principal_amount)} />
                    <DetailItem label="Saldo consolidado" value={formatMoney(selectedContract.remaining_scheduled_amount ?? selectedContract.balance_outstanding)} />
                    <DetailItem label="Custo do empréstimo" value={formatMoney(getContractLoanCostAmount(selectedContract, schedule))} />
                    <DetailItem label="Parcela atual" value={formatMoney(selectedContract.current_installment_amount ?? selectedContract.installment_amount)} />
                    <DetailItem label="Parcelas totais" value={String(selectedContract.installments_total ?? "—")} />
                    <DetailItem label="Juros a.m." value={formatPercent(selectedContract.monthly_rate)} />
                    <DetailItem label="Juros a.a." value={formatPercent(selectedContract.annual_rate)} />
                    <DetailItem label="IOF aplicado" value={formatMoney(selectedContract.iof)} />
                    <DetailItem label="Tarifas / custos" value={formatMoney(selectedContract.fees)} />
                    <DetailItem label="Primeiro vencimento" value={formatDateBr(selectedContract.first_due_date)} />
                    <DetailItem label="Próximo vencimento" value={formatDateBr(selectedContract.next_due_date)} />
                  </div>

                  {settlementQuote ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">Simulação de quitação antecipada</p>
                          <p className="mt-1 text-xs text-emerald-700">
                            Economia calculada pelas parcelas futuras evitadas menos o valor presente da quitação.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-right shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">Economia estimada</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-700">
                            {formatMoney(settlementQuote.settlement_savings)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {settlementQuote.months_avoided} mês(es) evitados
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 text-sm">
                        <QuoteItem label="Total futuro em aberto" value={formatMoney(settlementQuote.future_scheduled_amount)} />
                        <QuoteItem label="Saldo presente" value={formatMoney(settlementQuote.principal_present_value)} />
                        <QuoteItem label="Juros do mês" value={formatMoney(settlementQuote.current_interest_value)} />
                        <QuoteItem label="Custos do mês" value={formatMoney(settlementQuote.current_extra_cost_value)} />
                        <QuoteItem label="Valor da quitação" value={formatMoney(settlementQuote.settlement_amount)} />
                        <QuoteItem label="Data base" value={formatDateBr(settlementQuote.settlement_date)} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button onClick={() => { setSettlementMode("settlement"); setIsSettlementOpen(true); }} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Confirmar quitação</button>
                        <button onClick={() => setSettlementQuote(null)} className="rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">Limpar simulação</button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Cronograma</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[1080px] text-sm [&_td]:align-middle [&_th]:align-middle">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 bg-slate-50/70">
                      <th className="px-3 py-3 font-semibold">Parcela</th>
                      <th className="px-3 py-3 font-semibold">Vencimento</th>
                      <th className="px-3 py-3 font-semibold text-right">Valor</th>
                      <th className="px-3 py-3 font-semibold text-right">Amortização</th>
                      <th className="px-3 py-3 font-semibold text-right">Juros</th>
                      <th className="px-3 py-3 font-semibold text-right">Custos</th>
                      <th className="px-3 py-3 font-semibold text-right">Saldo após</th>
                      <th className="px-3 py-3 font-semibold text-right">Valor pago</th>
                      <th className="px-3 py-3 font-semibold text-center">Data pagamento</th>
                      <th className="px-3 py-3 font-semibold text-center">Status</th>
                      <th className="px-3 py-3 font-semibold text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition">
                        <td className="px-3 py-3">{item.installment_number}</td>
                        <td className="px-3 py-3">{formatDateBr(item.due_date)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(item.installment_amount)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(item.amortization_amount)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(item.interest_amount)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(item.extra_cost_amount)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(item.balance_after)}</td>
                        <td className="px-3 py-3 text-right text-slate-600">
                          {String(item.status || "").toLowerCase() === "paid"
                            ? formatMoney(item.paid_amount ?? item.installment_amount)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-600">
                          {String(item.status || "").toLowerCase() === "paid"
                            ? formatDateBr(item.paid_at)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(item.status)}`}>
                            {item.status || "open"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            disabled={saving || ["settled", "cancelled"].includes(String(item.status || "").toLowerCase())}
                            onClick={() => handleInstallmentAction(item)}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {String(item.status || "").toLowerCase() === "paid" ? "Reabrir" : "Marcar paga"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {paymentModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {paymentModal.action === "reopen" ? "Reabrir parcela" : "Marcar parcela como paga"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Parcela {paymentModal.item?.installment_number} • vencimento {formatDateBr(paymentModal.item?.due_date)}
                </p>
              </div>

              <button
                type="button"
                onClick={closePaymentModal}
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Valor pago</span>
                <input
                  type="text"
                  value={paymentModal.paidAmount}
                  onChange={(e) =>
                    setPaymentModal((prev) => ({ ...prev, paidAmount: e.target.value }))
                  }
                  disabled={paymentModal.action === "reopen"}
                  className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 disabled:bg-slate-100"
                  placeholder="0,00"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Data do pagamento</span>
                <input
                  type="date"
                  value={paymentModal.paidAt}
                  onChange={(e) =>
                    setPaymentModal((prev) => ({ ...prev, paidAt: e.target.value }))
                  }
                  disabled={paymentModal.action === "reopen"}
                  className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePaymentModal}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSubmitInstallmentAction}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {paymentModal.action === "reopen" ? "Confirmar reabertura" : "Salvar pagamento"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isNewOpen ? (
        <ContractModal
          title="Novo contrato"
          mode="create"
          form={form}
          setForm={setForm}
          iofPreview={iofPreview}
          saving={saving}
          structuralLocked={false}
          onClose={() => setIsNewOpen(false)}
          onSubmit={handleCreate}
        />
      ) : null}

      {isEditOpen ? (
        <ContractModal
          title="Editar contrato"
          mode="edit"
          form={editForm}
          setForm={setEditForm}
          iofPreview={0}
          saving={saving}
          structuralLocked={hasPaidInstallments}
          onClose={() => setIsEditOpen(false)}
          onSubmit={handleUpdate}
        />
      ) : null}

      {isSettlementOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {settlementMode === "settlement" ? "Confirmar quitação antecipada" : "Encerrar contrato"}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {settlementMode === "settlement"
                ? "A economia será calculada pelas parcelas futuras evitadas menos o valor presente da quitação."
                : "O encerramento sem quitação cancela parcelas futuras abertas."}
            </p>

            {settlementQuote && settlementMode === "settlement" ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p><strong>Valor da quitação:</strong> {formatMoney(settlementQuote.settlement_amount)}</p>
                <p><strong>Economia estimada:</strong> {formatMoney(settlementQuote.settlement_savings)}</p>
                <p><strong>Meses evitados:</strong> {settlementQuote.months_avoided}</p>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setIsSettlementOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
              <button
                onClick={() => handleSettlement(settlementMode)}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Processando..." : settlementMode === "settlement" ? "Confirmar quitação" : "Confirmar encerramento"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FinanceModuleShell>
  );
}

function ContractModal({
  title,
  mode,
  form,
  setForm,
  iofPreview,
  saving,
  structuralLocked,
  onClose,
  onSubmit,
}: {
  title: string;
  mode: "create" | "edit";
  form: LoanForm;
  setForm: React.Dispatch<React.SetStateAction<LoanForm>>;
  iofPreview: number;
  saving: boolean;
  structuralLocked: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{mode === "create" ? "Cadastre um novo contrato com cálculo automático de IOF, parcelas e custos." : "Edite dados do contrato. Campos estruturais podem ser bloqueados quando já houver parcelas pagas."}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Fechar</button>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          {mode === "edit" && structuralLocked ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Este contrato já possui parcelas pagas. Os campos estruturais ficam bloqueados para preservar o cronograma e o histórico financeiro.
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Código do contrato" value={form.contract_number} onChange={(value) => setForm((prev) => ({ ...prev, contract_number: value }))} />
            <Field label="Instituição" value={form.lender} onChange={(value) => setForm((prev) => ({ ...prev, lender: value }))} />
            <Field label="Modalidade" value={form.loan_type} onChange={(value) => setForm((prev) => ({ ...prev, loan_type: value }))} />
            <SelectField label="Status" value={form.status} onChange={(value) => setForm((prev) => ({ ...prev, status: value }))} options={[{ value: "active", label: "Ativo" }, { value: "open", label: "Aberto" }, { value: "encerrado", label: "Encerrado" }]} />
            <Field label="Valor do empréstimo" disabled={mode === "edit" && structuralLocked} value={form.principal_amount} onChange={(value) => setForm((prev) => ({ ...prev, principal_amount: value }))} type="number" />
            <Field label="Parcelas totais" disabled={mode === "edit" && structuralLocked} value={form.installments_total} onChange={(value) => setForm((prev) => ({ ...prev, installments_total: value }))} type="number" />
            <Field label="Juros a.m." disabled={mode === "edit" && structuralLocked} value={form.monthly_rate} onChange={(value) => setForm((prev) => syncRatesFromMonthly(prev, value))} type="number" />
            <Field label="Juros a.a." disabled={mode === "edit" && structuralLocked} value={form.annual_rate} onChange={(value) => setForm((prev) => syncRatesFromAnnual(prev, value))} type="number" />
            <Field label="IOF (%)" disabled={mode === "edit" && structuralLocked} value={form.iof_percent} onChange={(value) => setForm((prev) => ({ ...prev, iof_percent: value }))} type="number" />
            <Field label="Tarifas / custos" disabled={mode === "edit" && structuralLocked} value={form.fees} onChange={(value) => setForm((prev) => ({ ...prev, fees: value }))} type="number" />
            <Field label="Carência (meses)" disabled={mode === "edit" && structuralLocked} value={form.grace_months} onChange={(value) => setForm((prev) => ({ ...prev, grace_months: value }))} type="number" />

                <SelectField
                  label="Juros na carência"
                  value={form.pay_interest_during_grace}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, pay_interest_during_grace: value }))
                  }
                  options={[
                    { label: "Não", value: "nao" },
                    { label: "Sim", value: "sim" },
                  ]}
                  disabled={mode === "edit" && structuralLocked}
                />
            <Field label="Primeiro vencimento" disabled={mode === "edit" && structuralLocked} value={form.first_due_date} onChange={(value) => setForm((prev) => ({ ...prev, first_due_date: value }))} type="date" />
            <SelectField label="Sistema de amortização" disabled={mode === "edit" && structuralLocked} value={form.amortization_system} onChange={(value) => setForm((prev) => ({ ...prev, amortization_system: value }))} options={[{ value: "PRICE", label: "PRICE" }, { value: "SAC", label: "SAC" }]} />
          </div>

          {iofPreview > 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">IOF estimado:</span> {formatMoney(iofPreview)}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Observações</label>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DashboardCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[18px] border border-slate-200 bg-white p-3 sm:p-3.5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 break-words">{label}</p>
      <p className="mt-1.5 text-[clamp(0.86rem,0.95vw,1.22rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-slate-900 [font-variant-numeric:tabular-nums] break-words">
        {value}
      </p>
      <p className="mt-1 whitespace-pre-line text-[10px] leading-4 text-slate-500 break-words">{hint}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900 break-words">{value}</p>
    </div>
  );
}

function QuoteItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function InfoMini({ label, value, inverted = false }: { label: string; value: string; inverted?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl px-2.5 py-2 ${inverted ? "bg-white/10" : "bg-white"}`}>
      <p className={`truncate text-[9px] font-semibold uppercase tracking-[0.12em] ${inverted ? "text-slate-300" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 break-words text-[12px] font-semibold leading-tight ${inverted ? "text-white" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} disabled={disabled} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500" />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
