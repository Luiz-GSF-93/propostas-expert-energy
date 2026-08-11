const CASH_FLOW_TABLE =
  process.env.FINANCE_CASH_FLOW_TABLE || "finance_cash_flow_entries";

const LOAN_CONTRACTS_TABLE =
  process.env.FINANCE_LOAN_CONTRACTS_TABLE || "finance_loan_contracts";

const LOAN_INSTALLMENTS_TABLE =
  process.env.FINANCE_LOAN_INSTALLMENTS_TABLE || "finance_loan_installments";

const COST_TABLE_CANDIDATES = [
  process.env.FINANCE_COSTS_TABLE,
  "finance_cost_entries",
  "finance_cost_entries_v2",
  "finance_costs",
].filter(Boolean);

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeType(value) {
  const raw = normalizeText(value).toLowerCase();
  return raw === "despesa" ? "despesa" : "receita";
}

function ensureYear(year) {
  const parsed = Number(year);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new Error("Ano inválido.");
  }
  return parsed;
}

function ensureMonth(month) {
  const parsed = Number(month);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new Error("Mês inválido.");
  }
  return parsed;
}

function isTruthyActive(status) {
  const raw = String(status ?? "").toLowerCase().trim();
  return ["ativo", "active", "aberto", "open"].includes(raw);
}

function isLoanContractActive(contract) {
  const status = String(contract?.status || "").toLowerCase().trim();

  const inactiveStatuses = new Set([
    "encerrado",
    "encerrada",
    "quitado",
    "quitada",
    "liquidado",
    "liquidada",
    "cancelado",
    "cancelada",
    "inativo",
    "inativa",
    "deleted",
    "closed",
    "settled",
  ]);

  if (inactiveStatuses.has(status)) return false;
  if (contract?.is_active === false) return false;
  if (contract?.closed_at) return false;
  if (contract?.ended_at) return false;
  if (contract?.settled_at) return false;
  if (contract?.settlement_date) return false;

  return true;
}

function parseDateYearMonth(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function normalizeManualEntry(row) {
  return {
    id: String(row.id),
    year: Number(row.year),
    month: Number(row.month),
    type: normalizeType(row.type),
    category: normalizeText(row.category),
    description: normalizeText(row.description),
    amount: Number(toNumber(row.amount).toFixed(2)),
    auto_generated: Boolean(row.auto_generated),
    source: row.source || null,
  };
}

function buildAutoEntry({
  id,
  year,
  month,
  category,
  description,
  amount,
  source,
}) {
  return {
    id,
    year,
    month,
    type: "despesa",
    category,
    description,
    amount: Number(toNumber(amount).toFixed(2)),
    auto_generated: true,
    source: source || null,
  };
}

async function listManualEntries(adminSupabase, year) {
  const targetYear = ensureYear(year);

  const { data, error } = await adminSupabase
    .from(CASH_FLOW_TABLE)
    .select("*")
    .eq("year", targetYear)
    .eq("active", true)
    .eq("auto_generated", false)
    .order("month", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar lançamentos manuais: ${error.message}`);
  }

  return (data || []).map(normalizeManualEntry);
}

function isVariableCostRow(row) {
  const category = normalizeText(row?.category).toLowerCase();
  const costType = normalizeText(row?.cost_type).toLowerCase();
  const description = normalizeText(row?.description).toLowerCase();
  const percentageRate = toNumber(row?.percentage_rate);

  return (
    category.includes("vari") ||
    costType.includes("vari") ||
    description.includes("vari") ||
    percentageRate > 0
  );
}

function isLoanCostRow(row) {
  const category = normalizeText(row?.category).toLowerCase();
  const costType = normalizeText(row?.cost_type).toLowerCase();
  const description = normalizeText(row?.description).toLowerCase();
  const originModule = normalizeText(row?.origin_module).toLowerCase();

  return (
    originModule === "emprestimos" ||
    category.includes("empr") ||
    costType.includes("empr") ||
    description.includes("empr")
  );
}

function isFixedCostRow(row) {
  if (isLoanCostRow(row)) return false;
  if (isVariableCostRow(row)) return false;

  const category = normalizeText(row?.category).toLowerCase();
  const costType = normalizeText(row?.cost_type).toLowerCase();
  const monthlyAmount = toNumber(row?.monthly_amount);

  if (category.includes("fix")) return true;
  if (costType.includes("fix")) return true;

  return monthlyAmount > 0;
}

async function fetchActiveCostRows(adminSupabase) {
  for (const table of COST_TABLE_CANDIDATES) {
    const { data, error } = await adminSupabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) {
      return data || [];
    }
  }

  return [];
}

function sumMonthlyRevenueByMonth(entries, month) {
  return entries
    .filter((item) => normalizeType(item.type) === "receita" && Number(item.month) === month)
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
}

async function buildAutoCostExpenses(adminSupabase, year, manualEntries) {
  const rows = await fetchActiveCostRows(adminSupabase);
  const activeRows = rows.filter((row) => isTruthyActive(row?.status));

  const fixedMonthlyTotal = Number(
    activeRows
      .filter(isFixedCostRow)
      .reduce((sum, row) => sum + toNumber(row?.monthly_amount), 0)
      .toFixed(2)
  );

  const totalVariablePercent = Number(
    activeRows
      .filter(isVariableCostRow)
      .reduce((sum, row) => sum + toNumber(row?.percentage_rate), 0)
      .toFixed(4)
  );

  const autoEntries = [];

  for (let month = 1; month <= 12; month += 1) {
    if (fixedMonthlyTotal > 0) {
      autoEntries.push(
        buildAutoEntry({
          id: `auto-fixo-${year}-${month}`,
          year,
          month,
          category: "custos_fixos",
          description: "custos fixos automáticos",
          amount: fixedMonthlyTotal,
          source: "custos",
        })
      );
    }

    const monthRevenue = sumMonthlyRevenueByMonth(manualEntries, month);
    const variableAmount = Number(
      (monthRevenue * (totalVariablePercent / 100)).toFixed(2)
    );

    if (variableAmount > 0) {
      autoEntries.push(
        buildAutoEntry({
          id: `auto-variavel-${year}-${month}`,
          year,
          month,
          category: "custos_variaveis",
          description: `custos variáveis automáticos (${String(totalVariablePercent).replace(".", ",")}%)`,
          amount: variableAmount,
          source: "custos",
        })
      );
    }
  }

  return autoEntries;
}

async function fetchActiveLoanContracts(adminSupabase) {
  const { data, error } = await adminSupabase
    .from(LOAN_CONTRACTS_TABLE)
    .select("id, contract_number, lender, status")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao carregar contratos de empréstimo: ${error.message}`);
  }

  return (data || []).filter(isLoanContractActive);
}

async function fetchLoanInstallmentsByYear(adminSupabase, year) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data, error } = await adminSupabase
    .from(LOAN_INSTALLMENTS_TABLE)
    .select("id, contract_id, due_date, installment_amount, status")
    .gte("due_date", from)
    .lte("due_date", to)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar parcelas de empréstimos: ${error.message}`);
  }

  return data || [];
}

async function buildAutoLoanExpenses(adminSupabase, year) {
  const contracts = await fetchActiveLoanContracts(adminSupabase);
  const activeIds = new Set(contracts.map((item) => String(item.id)));

  if (!activeIds.size) return [];

  const installments = await fetchLoanInstallmentsByYear(adminSupabase, year);

  const validInstallments = installments.filter((item) => {
    const contractId = String(item?.contract_id || "");
    const status = String(item?.status || "").toLowerCase().trim();

    if (!activeIds.has(contractId)) return false;
    if (["cancelled", "settled"].includes(status)) return false;

    return true;
  });

  const totalsByMonth = new Map();

  validInstallments.forEach((item) => {
    const parsed = parseDateYearMonth(item?.due_date);
    if (!parsed || parsed.year !== year) return;

    const current = totalsByMonth.get(parsed.month) || 0;
    totalsByMonth.set(
      parsed.month,
      Number((current + toNumber(item?.installment_amount)).toFixed(2))
    );
  });

  const autoEntries = [];

  for (let month = 1; month <= 12; month += 1) {
    const amount = toNumber(totalsByMonth.get(month));
    if (amount <= 0) continue;

    autoEntries.push(
      buildAutoEntry({
        id: `auto-emprestimo-${year}-${month}`,
        year,
        month,
        category: "emprestimo",
        description: "custo mensal de empréstimos",
        amount,
        source: "emprestimos",
      })
    );
  }

  return autoEntries;
}

async function getCashFlowYear(adminSupabase, yearInput) {
  const year = ensureYear(yearInput);
  const entries = await listManualEntries(adminSupabase, year);
  const autoCosts = await buildAutoCostExpenses(adminSupabase, year, entries);
  const autoLoans = await buildAutoLoanExpenses(adminSupabase, year);

  return {
    year,
    entries,
    auto_expenses: [...autoCosts, ...autoLoans],
  };
}

function normalizeEntryInput(input) {
  const year = ensureYear(input?.year);
  const month = ensureMonth(input?.month);
  const type = normalizeType(input?.type);
  const category = normalizeText(input?.category);
  const description = normalizeText(input?.description);
  const amount = Number(toNumber(input?.amount).toFixed(2));

  if (!category) throw new Error("Categoria obrigatória.");
  if (!description) throw new Error("Descrição obrigatória.");
  if (amount <= 0) throw new Error("Valor deve ser maior que zero.");

  return {
    year,
    month,
    type,
    category,
    description,
    amount,
    auto_generated: false,
    active: true,
  };
}

async function createCashFlowEntry(adminSupabase, input) {
  const payload = normalizeEntryInput(input);

  const { data, error } = await adminSupabase
    .from(CASH_FLOW_TABLE)
    .insert(payload)
    .select("*");

  if (error) {
    throw new Error(`Erro ao criar lançamento: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Lançamento não retornado após criação.");

  return normalizeManualEntry(row);
}

async function updateCashFlowEntry(adminSupabase, entryId, input) {
  const id = normalizeText(entryId);
  if (!id) throw new Error("ID inválido.");

  const { data: currentRows, error: currentError } = await adminSupabase
    .from(CASH_FLOW_TABLE)
    .select("*")
    .eq("id", id)
    .limit(1);

  if (currentError) {
    throw new Error(`Erro ao localizar lançamento: ${currentError.message}`);
  }

  const current = Array.isArray(currentRows) ? currentRows[0] : currentRows;
  if (!current) throw new Error("Lançamento não encontrado.");
  if (current.auto_generated) {
    throw new Error("Lançamentos automáticos não podem ser editados manualmente.");
  }

  const payload = normalizeEntryInput({
    ...current,
    ...input,
  });

  const { data, error } = await adminSupabase
    .from(CASH_FLOW_TABLE)
    .update(payload)
    .eq("id", id)
    .select("*");

  if (error) {
    throw new Error(`Erro ao atualizar lançamento: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Lançamento não retornado após atualização.");

  return normalizeManualEntry(row);
}

async function deleteCashFlowEntry(adminSupabase, entryId) {
  const id = normalizeText(entryId);
  if (!id) throw new Error("ID inválido.");

  const { data: currentRows, error: currentError } = await adminSupabase
    .from(CASH_FLOW_TABLE)
    .select("*")
    .eq("id", id)
    .limit(1);

  if (currentError) {
    throw new Error(`Erro ao localizar lançamento: ${currentError.message}`);
  }

  const current = Array.isArray(currentRows) ? currentRows[0] : currentRows;
  if (!current) throw new Error("Lançamento não encontrado.");
  if (current.auto_generated) {
    throw new Error("Lançamentos automáticos não podem ser excluídos manualmente.");
  }

  const { error } = await adminSupabase
    .from(CASH_FLOW_TABLE)
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Erro ao excluir lançamento: ${error.message}`);
  }

  return { id };
}

module.exports = {
  getCashFlowYear,
  createCashFlowEntry,
  updateCashFlowEntry,
  deleteCashFlowEntry,
};
