const DEFAULT_AMORTIZATION = "PRICE";


async function syncLoanCostsSafe(adminSupabase, scope = "unknown") {
  try {
    const { syncLoanCostsFromLoans } = require("./finance-costs-sync.service");
    if (typeof syncLoanCostsFromLoans === "function") {
      await syncLoanCostsFromLoans(adminSupabase);
    }
  } catch (error) {
    console.error(`[finance.loans.admin.${scope}.sync-costs]`, error);
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

function normalizeLoanInput(input, current = {}) {
  let monthlyRate = parseNullableNumber(input.monthly_rate ?? current.monthly_rate);
  let annualRate = parseNullableNumber(input.annual_rate ?? current.annual_rate);

  if ((!monthlyRate || monthlyRate === 0) && annualRate) {
    monthlyRate = annualToMonthlyRate(annualRate);
  }
  if ((!annualRate || annualRate === 0) && monthlyRate) {
    annualRate = monthlyToAnnualRate(monthlyRate);
  }

  const principalAmount = parseNumber(input.principal_amount ?? current.principal_amount, 0);
  const explicitIofValue = parseNullableNumber(input.iof ?? current.iof);
  const iofPercent = parseNullableNumber(input.iof_percent);
  const iofAmount =
    iofPercent !== null
      ? principalAmount * (iofPercent / 100)
      : parseNumber(explicitIofValue, 0);

  return {
    contract_number: normalizeText(input.contract_number ?? current.contract_number) || `EMP-${Date.now()}`,
    lender: normalizeText(input.lender ?? current.lender),
    loan_type: normalizeText(input.loan_type ?? current.loan_type) || "Empréstimo",
    principal_amount: principalAmount,
    net_amount: parseNumber(input.net_amount ?? current.net_amount, principalAmount),
    installments_total: parseInteger(input.installments_total ?? current.installments_total, 0),
    installments_paid: parseInteger(input.installments_paid ?? current.installments_paid, 0),
    monthly_rate: monthlyRate || 0,
    annual_rate: annualRate || 0,
    monthly_index_rate: parseNumber(input.monthly_index_rate ?? current.monthly_index_rate, 0),
    annual_index_rate: parseNumber(input.annual_index_rate ?? current.annual_index_rate, 0),
    iof: iofAmount,
    fees: parseNumber(input.fees ?? current.fees, 0),
    grace_months: parseInteger(input.grace_months ?? current.grace_months, 0),
    pay_interest_during_grace: Boolean(
      (input.pay_interest_during_grace ?? current.pay_interest_during_grace) === true ||
      String(input.pay_interest_during_grace ?? current.pay_interest_during_grace ?? "").toLowerCase() === "true" ||
      String(input.pay_interest_during_grace ?? current.pay_interest_during_grace ?? "").toLowerCase() === "sim" ||
      String(input.pay_interest_during_grace ?? current.pay_interest_during_grace ?? "").toLowerCase() === "yes"
    ),
    amortization_system: normalizeText(input.amortization_system ?? current.amortization_system).toUpperCase() || DEFAULT_AMORTIZATION,
    start_date: formatDateIso(parseDate(input.start_date ?? current.start_date)),
    release_date: formatDateIso(parseDate(input.release_date ?? current.release_date)),
    first_due_date: formatDateIso(parseDate(input.first_due_date ?? current.first_due_date)),
    final_due_date: formatDateIso(parseDate(input.final_due_date ?? current.final_due_date)),
    status: normalizeText(input.status ?? current.status) || "ativo",
    notes: normalizeText(input.notes ?? current.notes),
    source: normalizeText(input.source ?? current.source) || "manual",
  };
}

function buildSchedule(contract) {
  const principal = Number(contract.principal_amount || 0);
  const installments = Number(contract.installments_total || 0);
  const monthlyRate = Number(contract.monthly_rate || 0) / 100;
  const installmentsPaid = Number(contract.installments_paid || 0);
  const iof = Number(contract.iof || 0);
  const fees = Number(contract.fees || 0);
  const graceMonths = Math.max(0, Number(contract.grace_months || 0));
  const payInterestDuringGrace = Boolean(contract.pay_interest_during_grace);
  const extraPerInstallment = installments > 0 ? (iof + fees) / installments : 0;

  if (!principal || !installments) return [];

  const round2 = (value) => Number(Number(value || 0).toFixed(2));

  const contractBaseDate =
    parseDate(contract.start_date) ||
    parseDate(contract.release_date) ||
    null;

  const firstAmortizingDueDate =
    parseDate(contract.first_due_date) ||
    addMonths(contractBaseDate || new Date(), graceMonths + 1);

  const graceStartDate = contractBaseDate
    ? addMonths(contractBaseDate, 1)
    : addMonths(firstAmortizingDueDate, -graceMonths);

  // Se NÃO paga juros na carência, capitaliza mês a mês no saldo.
  let principalForAmortization = round2(principal);

  if (graceMonths > 0 && !payInterestDuringGrace && monthlyRate > 0) {
    for (let g = 0; g < graceMonths; g += 1) {
      principalForAmortization = round2(
        principalForAmortization * (1 + monthlyRate)
      );
    }
  }

  const schedule = [];
  let balance = principalForAmortization;
  let seq = 1;

  // Se paga juros na carência, gera parcelas só de juros antes da 1ª parcela amortizada.
  if (graceMonths > 0 && payInterestDuringGrace) {
    const graceBalance = round2(principal);

    for (let g = 0; g < graceMonths; g += 1) {
      const dueDate = addMonths(graceStartDate, g);
      const dueDateIso = formatDateIso(dueDate);
      const interest = round2(graceBalance * monthlyRate);
      const paid = seq <= installmentsPaid;
      const overdue = !paid && dueDate < new Date();

      schedule.push({
        installment_number: seq,
        due_date: dueDateIso,
        installment_amount: interest,
        amortization_amount: 0,
        interest_amount: interest,
        extra_cost_amount: 0,
        balance_before: graceBalance,
        balance_after: graceBalance,
        paid_amount: paid ? interest : null,
        paid_at: paid ? dueDateIso : null,
        status: paid ? "paid" : overdue ? "overdue" : "open",
      });

      seq += 1;
    }

    balance = graceBalance;
  }

  if ((contract.amortization_system || DEFAULT_AMORTIZATION).toUpperCase() === "SAC") {
    const baseAmortization = installments > 0
      ? round2(principalForAmortization / installments)
      : 0;

    for (let i = 1; i <= installments; i += 1) {
      const balanceBefore = round2(balance);
      const interest = round2(balanceBefore * monthlyRate);
      const amortization =
        i === installments
          ? round2(balanceBefore)
          : Math.min(baseAmortization, round2(balanceBefore));
      const installment = round2(amortization + interest + extraPerInstallment);
      const balanceAfter = round2(Math.max(balanceBefore - amortization, 0));
      const dueDate = addMonths(firstAmortizingDueDate, i - 1);
      const dueDateIso = formatDateIso(dueDate);
      const paid = seq <= installmentsPaid;
      const overdue = !paid && dueDate < new Date();

      schedule.push({
        installment_number: seq,
        due_date: dueDateIso,
        installment_amount: installment,
        amortization_amount: amortization,
        interest_amount: interest,
        extra_cost_amount: round2(extraPerInstallment),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        paid_amount: paid ? installment : null,
        paid_at: paid ? dueDateIso : null,
        status: paid ? "paid" : overdue ? "overdue" : "open",
      });

      balance = balanceAfter;
      seq += 1;
    }

    return schedule;
  }

  // PRICE
  const paymentBase =
    monthlyRate === 0
      ? principalForAmortization / installments
      : principalForAmortization *
        ((monthlyRate * Math.pow(1 + monthlyRate, installments)) /
          (Math.pow(1 + monthlyRate, installments) - 1));

  for (let i = 1; i <= installments; i += 1) {
    const balanceBefore = round2(balance);
    const interest = round2(balanceBefore * monthlyRate);
    const amortization =
      i === installments
        ? round2(balanceBefore)
        : round2(paymentBase - interest);
    const installment =
      i === installments
        ? round2(amortization + interest + extraPerInstallment)
        : round2(paymentBase + extraPerInstallment);
    const balanceAfter = round2(Math.max(balanceBefore - amortization, 0));
    const dueDate = addMonths(firstAmortizingDueDate, i - 1);
    const dueDateIso = formatDateIso(dueDate);
    const paid = seq <= installmentsPaid;
    const overdue = !paid && dueDate < new Date();

    schedule.push({
      installment_number: seq,
      due_date: dueDateIso,
      installment_amount: installment,
      amortization_amount: amortization,
      interest_amount: interest,
      extra_cost_amount: round2(extraPerInstallment),
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      paid_amount: paid ? installment : null,
      paid_at: paid ? dueDateIso : null,
      status: paid ? "paid" : overdue ? "overdue" : "open",
    });

    balance = balanceAfter;
    seq += 1;
  }

  return schedule;
}

async function getContract(adminSupabase, contractId) {
  const { data, error } = await adminSupabase
    .from("finance_loan_contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`Contrato não encontrado. id=${contractId}`);
  }

  return data;
}

async function getSchedule(adminSupabase, contractId) {
  const { data, error } = await adminSupabase
    .from("finance_loan_installments")
    .select("*")
    .eq("contract_id", contractId)
    .order("installment_number", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function replaceOpenInstallments(adminSupabase, contractId, fullSchedule) {
  const { error: delError } = await adminSupabase
    .from("finance_loan_installments")
    .delete()
    .eq("contract_id", contractId)
    .in("status", ["open", "overdue"]);

  if (delError) throw delError;

  const openRows = fullSchedule.filter((item) => item.status !== "paid");
  if (openRows.length === 0) return;

  const payload = openRows.map((item) => ({
    contract_id: contractId,
    installment_number: item.installment_number,
    due_date: item.due_date,
    installment_amount: item.installment_amount,
    amortization_amount: item.amortization_amount,
    interest_amount: item.interest_amount,
    extra_cost_amount: item.extra_cost_amount,
    balance_before: item.balance_before,
    balance_after: item.balance_after,
    status: item.status,
  }));

  const { error: insError } = await adminSupabase
    .from("finance_loan_installments")
    .insert(payload);

  if (insError) throw insError;
}

async function updateLoanContract(adminSupabase, contractId, input) {
  const current = await getContract(adminSupabase, contractId);
  const schedule = await getSchedule(adminSupabase, contractId);
  const paidCount = schedule.filter((item) => item.status === "paid").length;

  const structuralKeys = [
    "principal_amount",
    "installments_total",
    "monthly_rate",
    "annual_rate",
    "iof",
    "iof_percent",
    "fees",
    "grace_months",
    "first_due_date",
    "amortization_system",
  ];

  const touchedStructural = structuralKeys.some((key) => input[key] !== undefined);

  if (paidCount > 0 && touchedStructural) {
    throw new Error(
      "Este contrato já possui parcelas pagas. Edição estrutural bloqueada. Você pode alterar apenas dados descritivos, ou usar quitação/encerramento."
    );
  }

  const normalized = normalizeLoanInput(input, current);

  const { data: updatedRows, error: updateError } = await adminSupabase
    .from("finance_loan_contracts")
    .update({
      ...normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId)
    .select("*");

  if (updateError) throw updateError;

  const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
  if (!updated) {
    throw new Error("Contrato não encontrado após atualização.");
  }

  let finalContract = updated;

  if (paidCount === 0 && touchedStructural) {
    const regenerated = buildSchedule(updated);
    await replaceOpenInstallments(adminSupabase, contractId, regenerated);

    const openOrOverdue = regenerated.filter(
      (item) => String(item.status || "").toLowerCase() !== "paid"
    );

    const nextInstallment =
      openOrOverdue.find((item) =>
        ["overdue", "open", "pending"].includes(String(item.status || "").toLowerCase())
      ) ||
      openOrOverdue[0] ||
      regenerated[0] ||
      null;

    const balanceOutstanding = Number(
      openOrOverdue
        .reduce((sum, item) => sum + Number(item.installment_amount || 0), 0)
        .toFixed(2)
    );

    const currentInstallmentAmount = Number(
      Number(nextInstallment?.installment_amount || 0).toFixed(2)
    );

    const finalDueDate =
      regenerated[regenerated.length - 1]?.due_date ||
      updated.final_due_date ||
      null;

    const { data: refreshedRows, error: refreshError } = await adminSupabase
      .from("finance_loan_contracts")
      .update({
        balance_outstanding: balanceOutstanding,
        current_installment_amount: currentInstallmentAmount,
        final_due_date: finalDueDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contractId)
      .select("*");

    if (refreshError) throw refreshError;

    finalContract = Array.isArray(refreshedRows) ? refreshedRows[0] : refreshedRows;
    if (!finalContract) {
      throw new Error("Contrato não encontrado após recalcular cronograma.");
    }

    await syncLoanCostsSafe(adminSupabase, "update-structural");
  }

  return finalContract;
}

function buildSettlementQuote(contract, schedule, settlementDateRaw) {
  const settlementDate = parseDate(settlementDateRaw) || new Date();

  const activeOpen = schedule.filter((item) =>
    ["open", "overdue"].includes(String(item.status || "").toLowerCase())
  );

  if (activeOpen.length === 0) {
    return {
      settlement_date: formatDateIso(settlementDate),
      open_installments: 0,
      future_scheduled_amount: 0,
      principal_present_value: 0,
      current_interest_value: 0,
      current_extra_cost_value: 0,
      settlement_amount: 0,
      settlement_savings: 0,
      months_avoided: 0,
    };
  }

  const firstOpen = activeOpen[0];
  const futureScheduledAmount = activeOpen.reduce(
    (sum, item) => sum + Number(item.installment_amount || 0),
    0
  );

  const principalPresentValue = Number(firstOpen.balance_before || contract.principal_amount || 0);
  const currentInterestValue = Number(firstOpen.interest_amount || 0);
  const currentExtraCostValue = Number(firstOpen.extra_cost_amount || 0);

  const settlementAmount = Math.max(
    principalPresentValue + currentInterestValue + currentExtraCostValue,
    0
  );

  const settlementSavings = Math.max(futureScheduledAmount - settlementAmount, 0);

  return {
    settlement_date: formatDateIso(settlementDate),
    open_installments: activeOpen.length,
    future_scheduled_amount: Number(futureScheduledAmount.toFixed(2)),
    principal_present_value: Number(principalPresentValue.toFixed(2)),
    current_interest_value: Number(currentInterestValue.toFixed(2)),
    current_extra_cost_value: Number(currentExtraCostValue.toFixed(2)),
    settlement_amount: Number(settlementAmount.toFixed(2)),
    settlement_savings: Number(settlementSavings.toFixed(2)),
    months_avoided: Math.max(activeOpen.length - 1, 0),
  };
}

async function previewSettlement(adminSupabase, contractId, settlementDateRaw) {
  const contract = await getContract(adminSupabase, contractId);
  const schedule = await getSchedule(adminSupabase, contractId);
  return buildSettlementQuote(contract, schedule, settlementDateRaw);
}

async function applySettlement(adminSupabase, contractId, payload) {
  const contract = await getContract(adminSupabase, contractId);
  const schedule = await getSchedule(adminSupabase, contractId);
  const mode = normalizeText(payload.mode || "settlement").toLowerCase();
  const quote = buildSettlementQuote(contract, schedule, payload.settlement_date);

  if (mode === "close") {
    const { error: installmentsError } = await adminSupabase
      .from("finance_loan_installments")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("contract_id", contractId)
      .in("status", ["open", "overdue"]);

    if (installmentsError) throw installmentsError;

    const notes = [contract.notes, `Encerrado em ${quote.settlement_date}`].filter(Boolean).join(" | ");

    const { data, error } = await adminSupabase
      .from("finance_loan_contracts")
      .update({
        status: "encerrado",
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contractId)
      .select("*")
      .single();

    if (error) throw error;

    return {
      mode: "close",
      contract: data,
      quote,
    };
  }

  const openItems = schedule.filter((item) =>
    ["open", "overdue"].includes(String(item.status || "").toLowerCase())
  );

  if (openItems.length === 0) {
    return {
      mode: "settlement",
      contract,
      quote,
    };
  }

  const firstOpen = openItems[0];
  const remainingIds = openItems.slice(1).map((item) => item.id);

  const { error: payError } = await adminSupabase
    .from("finance_loan_installments")
    .update({
      status: "paid",
      paid_amount: quote.settlement_amount,
      paid_at: quote.settlement_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", firstOpen.id);

  if (payError) throw payError;

  if (remainingIds.length > 0) {
    const { error: restError } = await adminSupabase
      .from("finance_loan_installments")
      .update({
        status: "settled",
        paid_amount: 0,
        paid_at: quote.settlement_date,
        updated_at: new Date().toISOString(),
      })
      .in("id", remainingIds);

    if (restError) throw restError;
  }

  const notes = [
    contract.notes,
    `Quitação antecipada em ${quote.settlement_date}; valor quitado ${quote.settlement_amount}; economia ${quote.settlement_savings}`,
  ].filter(Boolean).join(" | ");

  const { data, error } = await adminSupabase
    .from("finance_loan_contracts")
    .update({
      status: "encerrado",
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId)
    .select("*")
    .single();

  if (error) throw error;

  return {
    mode: "settlement",
    contract: data,
    quote,
  };
}


async function deleteLoanContract(adminSupabase, contractId) {
  const { error: installmentsError } = await adminSupabase
    .from("finance_loan_installments")
    .delete()
    .eq("contract_id", contractId);

  if (installmentsError) throw installmentsError;

  const { data, error } = await adminSupabase
    .from("finance_loan_contracts")
    .delete()
    .eq("id", contractId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  updateLoanContract,
  previewSettlement,
  applySettlement,
  deleteLoanContract,
};
