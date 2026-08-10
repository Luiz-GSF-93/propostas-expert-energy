const DEFAULT_AMORTIZATION = "PRICE";


async function refreshCurrentInstallmentAmount(adminSupabase, contractId) {
  const { data: installments, error } = await adminSupabase
    .from("finance_loan_installments")
    .select("installment_number, due_date, installment_amount, status")
    .eq("contract_id", contractId)
    .order("due_date", { ascending: true })
    .order("installment_number", { ascending: true });

  if (error) throw error;

  const rows = installments || [];
  const normalizeStatus = (value) => String(value || "").toLowerCase().trim();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  const toTime = (value) => {
    if (!value) return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };

  const nextOpenOrPending =
    rows.find((item) => {
      const status = normalizeStatus(item.status);
      const dueTime = toTime(item.due_date);
      return ["open", "pending"].includes(status) && dueTime !== null && dueTime >= todayTime;
    }) ||
    rows.find((item) => ["open", "pending"].includes(normalizeStatus(item.status))) ||
    rows.find((item) => normalizeStatus(item.status) === "overdue") ||
    null;

  const currentInstallmentAmount = Number(nextOpenOrPending?.installment_amount || 0);

  const { error: updateError } = await adminSupabase
    .from("finance_loan_contracts")
    .update({
      current_installment_amount: currentInstallmentAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);

  if (updateError) throw updateError;

  return currentInstallmentAmount;
}



async function syncLoanCostsSafe(adminSupabase, scope = "unknown") {
  try {
    const { syncLoanCostsFromLoans } = require("./finance-costs-sync.service");
    if (typeof syncLoanCostsFromLoans === "function") {
      await syncLoanCostsFromLoans(adminSupabase);
    }
  } catch (error) {
    console.error(`[finance.loans.${scope}.sync-costs]`, error);
  }
}


function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function parseNullableNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = normalizeText(value)
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .replace(/%/g, "");

  if (!raw) return null;

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw) || /^-?\d+(,\d+)?$/.test(raw)) {
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function parseNumber(value, fallback = 0) {
  const parsed = parseNullableNumber(value);
  return parsed === null ? fallback : parsed;
}

function parseInteger(value, fallback = 0) {
  const parsed = parseNullableNumber(value);
  if (parsed === null) return fallback;
  return Math.round(parsed);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = normalizeText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateIso(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function extractPayInterestDuringGraceFromNotes(notes) {
  const raw = normalizeText(notes).toLowerCase();
  if (!raw) return false;
  return raw.includes("[juros_na_carencia=sim]") || raw.includes("[pay_interest_during_grace=true]");
}


function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function annualToMonthlyRate(rateAnnualPercent) {
  if (!rateAnnualPercent) return 0;
  return (Math.pow(1 + rateAnnualPercent / 100, 1 / 12) - 1) * 100;
}

function monthlyToAnnualRate(rateMonthlyPercent) {
  if (!rateMonthlyPercent) return 0;
  return (Math.pow(1 + rateMonthlyPercent / 100, 12) - 1) * 100;
}

function getDebtLevelLabel(balanceOutstanding, grossRevenue) {
  const debt = Number(balanceOutstanding || 0);
  const revenue = Number(grossRevenue || 0);

  if (revenue <= 0) {
    return debt > 0
      ? "🔴 Alto (>30%) - revisar endividamento"
      : "✅ Saudável (≤10%)";
  }

  const ratio = debt / revenue;
  if (ratio <= 0.10) return "✅ Saudável (≤10%)";
  if (ratio <= 0.30) return "⚠️ Moderado (10-30%)";
  return "🔴 Alto (>30%) - revisar endividamento";
}

function normalizeLoanInput(input) {
  let monthlyRate = parseNullableNumber(input.monthly_rate);
  let annualRate = parseNullableNumber(input.annual_rate);

  if ((!monthlyRate || monthlyRate === 0) && annualRate) {
    monthlyRate = annualToMonthlyRate(annualRate);
  }
  if ((!annualRate || annualRate === 0) && monthlyRate) {
    annualRate = monthlyToAnnualRate(monthlyRate);
  }

  let monthlyIndexRate = parseNullableNumber(input.monthly_index_rate) || 0;
  let annualIndexRate = parseNullableNumber(input.annual_index_rate) || 0;

  if ((!monthlyIndexRate || monthlyIndexRate === 0) && annualIndexRate) {
    monthlyIndexRate = annualToMonthlyRate(annualIndexRate);
  }
  if ((!annualIndexRate || annualIndexRate === 0) && monthlyIndexRate) {
    annualIndexRate = monthlyToAnnualRate(monthlyIndexRate);
  }

  const principalAmount = parseNumber(input.principal_amount, 0);
  const netAmount = parseNumber(input.net_amount, principalAmount);

  const explicitIofValue = parseNullableNumber(input.iof);
  const iofPercent = parseNullableNumber(input.iof_percent);
  const iofAmount =
    iofPercent !== null
      ? principalAmount * (iofPercent / 100)
      : parseNumber(explicitIofValue, 0);

  return {
    contract_number: normalizeText(input.contract_number) || `EMP-${Date.now()}`,
    lender: normalizeText(input.lender),
    loan_type: normalizeText(input.loan_type) || "Empréstimo",
    principal_amount: principalAmount,
    net_amount: netAmount,
    installments_total: parseInteger(input.installments_total, 0),
    installments_paid: parseInteger(input.installments_paid, 0),
    monthly_rate: monthlyRate || 0,
    annual_rate: annualRate || 0,
    monthly_index_rate: monthlyIndexRate || 0,
    annual_index_rate: annualIndexRate || 0,
    iof: iofAmount,
    fees: parseNumber(input.fees, 0),
    grace_months: parseInteger(input.grace_months, 0),
    pay_interest_during_grace: Boolean(
      input.pay_interest_during_grace === true ||
      String(input.pay_interest_during_grace || "").toLowerCase() === "true" ||
      String(input.pay_interest_during_grace || "").toLowerCase() === "sim" ||
      String(input.pay_interest_during_grace || "").toLowerCase() === "yes" ||
      extractPayInterestDuringGraceFromNotes(input.notes)
    ),
    amortization_system: normalizeText(input.amortization_system).toUpperCase() || DEFAULT_AMORTIZATION,
    start_date: formatDateIso(parseDate(input.start_date)),
    release_date: formatDateIso(parseDate(input.release_date)),
    first_due_date: formatDateIso(parseDate(input.first_due_date)),
    final_due_date: formatDateIso(parseDate(input.final_due_date)),
    status: normalizeText(input.status) || "ativo",
    notes: (() => {
      const baseNotes = normalizeText(input.notes).replace(/\s*\[juros_na_carencia=(sim|nao)\]\s*/gi, "").trim();
      const payGrace = Boolean(
        input.pay_interest_during_grace === true ||
        String(input.pay_interest_during_grace || "").toLowerCase() === "true" ||
        String(input.pay_interest_during_grace || "").toLowerCase() === "sim" ||
        String(input.pay_interest_during_grace || "").toLowerCase() === "yes" ||
        extractPayInterestDuringGraceFromNotes(input.notes)
      );
      return `${baseNotes}${baseNotes ? " " : ""}[juros_na_carencia=${payGrace ? "sim" : "nao"}]`.trim();
    })(),
    source: normalizeText(input.source) || "manual",
  };
}

function buildSchedule(contract) {
  const principal = Number(contract.principal_amount || 0);
  const installments = Number(contract.installments_total || 0);
  const monthlyRate = Number(contract.monthly_rate || 0) / 100;
  const installmentsPaid = Number(contract.installments_paid || 0);
  const iof = Number(contract.iof || 0);
  const fees = Number(contract.fees || 0);
  const graceMonths = Number(contract.grace_months || 0);
  const payInterestDuringGrace = Boolean(contract.pay_interest_during_grace);
  const extraPerInstallment = installments > 0 ? (iof + fees) / installments : 0;

  if (!principal || !installments) return [];

  const start =
    parseDate(contract.first_due_date) ||
    addMonths(parseDate(contract.start_date) || new Date(), 1);

  const schedule = [];
  let balance = principal;
  let seq = 1;

  if (graceMonths > 0 && payInterestDuringGrace) {
    for (let g = 0; g < graceMonths; g += 1) {
      const dueDate = addMonths(start, g);
      const dueDateIso = formatDateIso(dueDate);
      const interest = balance * monthlyRate;
      const paid = seq <= installmentsPaid;
      const overdue = !paid && dueDate < new Date();

      schedule.push({
        installment_number: seq,
        due_date: dueDateIso,
        installment_amount: interest,
        amortization_amount: 0,
        interest_amount: interest,
        extra_cost_amount: 0,
        balance_before: balance,
        balance_after: balance,
        paid_amount: paid ? interest : null,
        paid_at: paid ? dueDateIso : null,
        status: paid ? "paid" : overdue ? "overdue" : "open",
      });

      seq += 1;
    }
  }

  const amortStartShift = graceMonths;

  if ((contract.amortization_system || DEFAULT_AMORTIZATION).toUpperCase() === "SAC") {
    const amortization = principal / installments;

    for (let i = 1; i <= installments; i += 1) {
      const balanceBefore = balance;
      const interest = balanceBefore * monthlyRate;
      const installment = amortization + interest + extraPerInstallment;
      const balanceAfter = Math.max(balanceBefore - amortization, 0);
      const dueDate = addMonths(start, amortStartShift + i - 1);
      const paid = seq <= installmentsPaid;
      const overdue = !paid && dueDate < new Date();

      schedule.push({
        installment_number: seq,
        due_date: formatDateIso(dueDate),
        installment_amount: installment,
        amortization_amount: amortization,
        interest_amount: interest,
        extra_cost_amount: extraPerInstallment,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        paid_amount: paid ? Number(installment.toFixed(2)) : null,
        paid_at: paid ? formatDateIso(dueDate) : null,
        status: paid ? "paid" : overdue ? "overdue" : "open",
      });

      balance = balanceAfter;
      seq += 1;
    }

    return schedule;
  }

  const paymentBase =
    monthlyRate === 0
      ? principal / installments
      : principal *
        ((monthlyRate * Math.pow(1 + monthlyRate, installments)) /
          (Math.pow(1 + monthlyRate, installments) - 1));

  for (let i = 1; i <= installments; i += 1) {
    const balanceBefore = balance;
    const interest = balanceBefore * monthlyRate;
    const amortization = monthlyRate === 0 ? principal / installments : paymentBase - interest;
    const installment = paymentBase + extraPerInstallment;
    const balanceAfter = Math.max(balanceBefore - amortization, 0);
    const dueDate = addMonths(start, amortStartShift + i - 1);
    const paid = seq <= installmentsPaid;
    const overdue = !paid && dueDate < new Date();

    schedule.push({
      installment_number: seq,
      due_date: formatDateIso(dueDate),
      installment_amount: installment,
      amortization_amount: amortization,
      interest_amount: interest,
      extra_cost_amount: extraPerInstallment,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      status: paid ? "paid" : overdue ? "overdue" : "open",
    });

    balance = balanceAfter;
    seq += 1;
  }

  return schedule;
}

function summarizeContract(contract, schedule) {
  const allItems = Array.isArray(schedule) ? schedule : [];

  const activeSchedule = allItems.filter(
    (item) => !["settled", "cancelled"].includes(String(item.status || "").toLowerCase())
  );

  const historicalPaidItems = allItems.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    return status === "paid";
  });

  const paid = historicalPaidItems.length;
  const overdueItems = activeSchedule
    .filter((item) => String(item.status || "").toLowerCase() === "overdue")
    .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));

  const openItems = activeSchedule
    .filter((item) => String(item.status || "").toLowerCase() === "open")
    .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));

  const overdue = overdueItems.length;
  const open = openItems.length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureOpenItems = openItems.filter((item) => {
    if (!item.due_date) return false;
    const due = new Date(`${item.due_date}T00:00:00`);
    return !Number.isNaN(due.getTime()) && due >= today;
  });

  const firstOverdue = overdueItems[0] || null;
  const nextFuture = futureOpenItems[0] || null;

  const totalScheduled = activeSchedule.reduce(
    (sum, item) => sum + Number(item.paid_amount ?? item.installment_amount ?? 0),
    0
  );

  const totalOverdueAmount = overdueItems.reduce(
    (sum, item) => sum + Number(item.installment_amount || 0),
    0
  );

  const totalPaid = historicalPaidItems.reduce(
    (sum, item) => sum + Number(item.installment_amount || 0),
    0
  );

  const remainingScheduled = Math.max(totalScheduled - totalPaid, 0);

  const monthlyCost =
    Number(nextFuture?.installment_amount || 0) ||
    Number(openItems[0]?.installment_amount || 0) ||
    Number(contract.current_installment_amount || 0);

  const totalLoanCost = Math.max(
    totalScheduled - Number(contract.principal_amount || 0),
    0
  );

  return {
    ...contract,
    balance_outstanding: remainingScheduled,
    remaining_scheduled_amount: remainingScheduled,
    total_scheduled_amount: totalScheduled,
    total_loan_cost: totalLoanCost,
    installments_paid_count: paid,
    installments_open_count: open,
    installments_overdue_count: overdue,
    total_overdue_amount: totalOverdueAmount,
    first_overdue_date: firstOverdue?.due_date || null,
    next_future_due_date: nextFuture?.due_date || null,
    next_due_date: nextFuture?.due_date || firstOverdue?.due_date || null,
    current_installment_amount: monthlyCost,
    total_paid_amount: totalPaid,
  };
}

async function fetchLatestSnapshot(adminSupabase) {
  const { data } = await adminSupabase
    .from("financial_dashboard_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function fetchLoanContracts(adminSupabase) {
  const { data, error } = await adminSupabase
    .from("finance_loan_contracts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar contratos de empréstimos: ${error.message}`);
  }

  return data || [];
}

async function fetchLoanInstallments(adminSupabase, contractId) {
  const { data, error } = await adminSupabase
    .from("finance_loan_installments")
    .select("*")
    .eq("contract_id", contractId)
    .order("installment_number", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar parcelas: ${error.message}`);
  }

  return data || [];
}

async function replaceInstallments(adminSupabase, contractId, schedule) {
  const { error: deleteError } = await adminSupabase
    .from("finance_loan_installments")
    .delete()
    .eq("contract_id", contractId);

  if (deleteError) {
    throw new Error(`Erro ao limpar parcelas: ${deleteError.message}`);
  }

  if (!schedule.length) return;

  const payload = schedule.map((item) => ({
    contract_id: contractId,
    installment_number: item.installment_number,
    due_date: item.due_date,
    installment_amount: item.installment_amount,
    amortization_amount: item.amortization_amount,
    interest_amount: item.interest_amount,
    extra_cost_amount: item.extra_cost_amount,
    balance_before: item.balance_before,
    balance_after: item.balance_after,
    paid_amount:
      String(item.status || "").toLowerCase() === "paid"
        ? Number(item.paid_amount ?? item.installment_amount ?? 0)
        : null,
    paid_at:
      String(item.status || "").toLowerCase() === "paid"
        ? item.paid_at || item.due_date || null
        : null,
    status: item.status,
  }));

  const { error: insertError } = await adminSupabase
    .from("finance_loan_installments")
    .insert(payload);

  if (insertError) {
    throw new Error(`Erro ao gravar parcelas: ${insertError.message}`);
  }
}

async function createLoanContract(adminSupabase, input) {
  const contract = normalizeLoanInput(input);
  const schedule = buildSchedule(contract);
  const summary = summarizeContract(contract, schedule);

  const insertPayload = {
    ...contract,
    balance_outstanding: Number(summary.balance_outstanding || 0),
    current_installment_amount: Number(summary.current_installment_amount || 0),
    final_due_date: schedule[schedule.length - 1]?.due_date || contract.final_due_date || null,
  };


  const { data, error } = await adminSupabase
    .from("finance_loan_contracts")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao cadastrar contrato: ${error.message}`);
  }

  await replaceInstallments(adminSupabase, data.id, schedule);
  await refreshCurrentInstallmentAmount(adminSupabase, data.id);
  await syncLoanCostsSafe(adminSupabase, "create");

  return getLoanContractDetail(adminSupabase, data.id);
}

async function updateLoanContract(adminSupabase, contractId, input) {
  const normalized = normalizeLoanInput(input);
  const schedule = buildSchedule(normalized);
  const summary = summarizeContract(normalized, schedule);

  const updatePayload = {
    ...normalized,
    balance_outstanding: Number(summary.balance_outstanding || 0),
    current_installment_amount: Number(summary.current_installment_amount || 0),
    final_due_date: schedule[schedule.length - 1]?.due_date || normalized.final_due_date || null,
    updated_at: new Date().toISOString(),
  };


  const { data, error } = await adminSupabase
    .from("finance_loan_contracts")
    .update(updatePayload)
    .eq("id", contractId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao atualizar contrato: ${error.message}`);
  }

  await replaceInstallments(adminSupabase, contractId, schedule);
  await refreshCurrentInstallmentAmount(adminSupabase, contractId);
  await syncLoanCostsSafe(adminSupabase, "update");

  return getLoanContractDetail(adminSupabase, data.id);
}

async function markInstallmentStatus(adminSupabase, contractId, installmentNumber, input = {}) {
  const installmentNo = Number(installmentNumber);
  if (!Number.isFinite(installmentNo) || installmentNo <= 0) {
    throw new Error("Número da parcela inválido.");
  }

  const { data: current, error: currentError } = await adminSupabase
    .from("finance_loan_installments")
    .select("*")
    .eq("contract_id", contractId)
    .eq("installment_number", installmentNo)
    .single();

  if (currentError) {
    throw new Error(`Erro ao localizar parcela: ${currentError.message}`);
  }

  const requestedPaid = String(input?.status || "").toLowerCase() === "paid";
  const dueDate = parseDate(current?.due_date);
  const today = new Date();

  const reopenStatus =
    dueDate && dueDate < today ? "overdue" : "open";

  const paidAt =
    requestedPaid
      ? formatDateIso(parseDate(input?.paid_at || input?.paid_date) || new Date())
      : null;

  const paidAmount =
    requestedPaid
      ? Number(
          parseNumber(
            input?.paid_amount,
            Number(current?.installment_amount || 0)
          ).toFixed(2)
        )
      : null;

  const { error: updateError } = await adminSupabase
    .from("finance_loan_installments")
    .update({
      status: requestedPaid ? "paid" : reopenStatus,
      paid_at: paidAt,
      paid_amount: paidAmount,
    })
    .eq("contract_id", contractId)
    .eq("installment_number", installmentNo);

  if (updateError) {
    throw new Error(`Erro ao atualizar parcela: ${updateError.message}`);
  }

  const refreshedSchedule = await fetchLoanInstallments(adminSupabase, contractId);
  const paidCount = refreshedSchedule.filter(
    (item) => String(item.status || "").toLowerCase() === "paid"
  ).length;

  const { error: contractError } = await adminSupabase
    .from("finance_loan_contracts")
    .update({
      installments_paid: paidCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);

  if (contractError) {
    throw new Error(`Erro ao atualizar contrato: ${contractError.message}`);
  }

  return getLoanContractDetail(adminSupabase, contractId);
}

async function getLoansDashboardData(adminSupabase) {
  const contractsRaw = await fetchLoanContracts(adminSupabase);
  const contracts = [];

  for (const contract of contractsRaw) {
    const schedule = await fetchLoanInstallments(adminSupabase, contract.id);
    contracts.push(summarizeContract(contract, schedule));
  }

  const latestSnapshot = await fetchLatestSnapshot(adminSupabase);

  const summary = {
    total_contracts: contracts.length,
    total_principal: contracts.reduce((s, c) => s + Number(c.principal_amount || 0), 0),
    total_net_amount: contracts.reduce((s, c) => s + Number(c.net_amount || 0), 0),
    total_balance_outstanding: contracts.reduce((s, c) => s + Number(c.balance_outstanding || 0), 0),
    total_installments_paid: contracts.reduce((s, c) => s + Number(c.installments_paid_count || 0), 0),
    total_installments_open: contracts.reduce((s, c) => s + Number(c.installments_open_count || 0), 0),
    total_installments_overdue: contracts.reduce((s, c) => s + Number(c.installments_overdue_count || 0), 0),
    total_overdue_amount: contracts.reduce((s, c) => s + Number(c.total_overdue_amount || 0), 0),
    total_paid_amount: contracts.reduce((s, c) => s + Number(c.total_paid_amount || 0), 0),
    total_monthly_cost: contracts.reduce((s, c) => s + Number(c.current_installment_amount || 0), 0),
    avg_monthly_rate: contracts.length
      ? contracts.reduce((s, c) => s + Number(c.monthly_rate || 0), 0) / contracts.length
      : 0,
    avg_annual_rate: contracts.length
      ? contracts.reduce((s, c) => s + Number(c.annual_rate || 0), 0) / contracts.length
      : 0,
    next_due_date:
      contracts
        .map((c) => c.next_due_date)
        .filter(Boolean)
        .sort()[0] || null,
  };

  const debtLevel = getDebtLevelLabel(
    summary.total_balance_outstanding,
    latestSnapshot?.gross_revenue || 0
  );

  await refreshCurrentInstallmentAmount(adminSupabase, contractId);
  await syncLoanCostsSafe(adminSupabase, "mark-status");

  return {
    latest_batch: latestSnapshot
      ? {
          snapshot_id: latestSnapshot.id,
          reference_year: latestSnapshot.reference_year,
          gross_revenue: Number(latestSnapshot.gross_revenue || 0),
          created_at: latestSnapshot.created_at,
        }
      : null,
    summary: {
      ...summary,
      debt_level_label: debtLevel,
      debt_ratio:
        Number(latestSnapshot?.gross_revenue || 0) > 0
          ? summary.total_balance_outstanding / Number(latestSnapshot.gross_revenue || 0)
          : summary.total_balance_outstanding > 0
          ? 1
          : 0,
    },
    contracts,
  };
}

async function getLoanContractDetail(adminSupabase, contractId) {
  const { data: contract, error } = await adminSupabase
    .from("finance_loan_contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (error || !contract) {
    throw new Error("Contrato de empréstimo não encontrado.");
  }

  const schedule = await fetchLoanInstallments(adminSupabase, contractId);
  const summarizedContract = summarizeContract(contract, schedule);

  return {
    contract: summarizedContract,
    schedule,
    schedule_summary: {
      total_installments: schedule.length,
      paid_installments: schedule.filter((item) => item.status === "paid").length,
      open_installments: schedule.filter((item) => item.status === "open").length,
      overdue_installments: schedule.filter((item) => item.status === "overdue").length,
      total_interest: schedule.reduce((sum, item) => sum + Number(item.interest_amount || 0), 0),
      total_amortization: schedule.reduce((sum, item) => sum + Number(item.amortization_amount || 0), 0),
      total_extra_costs: schedule.reduce((sum, item) => sum + Number(item.extra_cost_amount || 0), 0),
    },
  };
}

function calculateLoanSimulation(input) {
  const normalized = normalizeLoanInput(input);
  const schedule = buildSchedule(normalized);
  const contract = summarizeContract(normalized, schedule);


  return {
    contract,
    schedule,
    schedule_summary: {
      total_installments: schedule.length,
      paid_installments: schedule.filter((item) => item.status === "paid").length,
      open_installments: schedule.filter((item) => item.status === "open").length,
      overdue_installments: schedule.filter((item) => item.status === "overdue").length,
      total_interest: schedule.reduce((sum, item) => sum + Number(item.interest_amount || 0), 0),
      total_amortization: schedule.reduce((sum, item) => sum + Number(item.amortization_amount || 0), 0),
      total_extra_costs: schedule.reduce((sum, item) => sum + Number(item.extra_cost_amount || 0), 0),
    },
  };
}

module.exports = {
  getLoansDashboardData,
  getLoanContractDetail,
  calculateLoanSimulation,
  createLoanContract,
  updateLoanContract,
  markInstallmentStatus,
};
