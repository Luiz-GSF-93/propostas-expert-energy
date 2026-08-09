const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOAN_CONTRACTS_TABLE =
  process.env.FINANCE_LOAN_CONTRACTS_TABLE || "finance_loan_contracts";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDay(value) {
  const day = Number(value);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return Math.trunc(day);
}

function parseDayFromDate(value) {
  if (!value) return null;
  try {
    const date = new Date(String(value));
    const day = date.getUTCDate();
    return safeDay(day);
  } catch {
    return null;
  }
}

function getSupplier(contract) {
  return (
    contract.supplier ||
    contract.lender_name ||
    contract.creditor_name ||
    contract.bank_name ||
    contract.institution_name ||
    contract.vendor_name ||
    contract.financial_institution ||
    contract.contractor_name ||
    "Empréstimo"
  );
}

function getDueDay(contract) {
  return (
    safeDay(contract.due_day) ||
    safeDay(contract.payment_day) ||
    safeDay(contract.installment_due_day) ||
    parseDayFromDate(contract.next_due_date) ||
    parseDayFromDate(contract.first_due_date) ||
    null
  );
}

function getMonthlyAmount(contract) {
  const direct =
    toNumber(contract.monthly_payment) ||
    toNumber(contract.installment_amount) ||
    toNumber(contract.installment_value) ||
    toNumber(contract.payment_amount) ||
    toNumber(contract.monthly_installment_amount) ||
    toNumber(contract.current_installment_amount) ||
    0;

  if (direct > 0) return direct;

  if (Array.isArray(contract.schedule) && contract.schedule.length > 0) {
    const nextItem =
      contract.schedule.find((item) =>
        ["open", "overdue", "pending"].includes(String(item.status || "").toLowerCase())
      ) || contract.schedule[0];

    return (
      toNumber(nextItem.installment_amount) ||
      toNumber(nextItem.amount) ||
      toNumber(nextItem.payment_amount) ||
      0
    );
  }

  return 0;
}

function isLoanContractActive(contract) {
  const status = String(contract.status || "").toLowerCase().trim();
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
  if (contract.is_active === false) return false;
  if (contract.deleted_at) return false;
  if (contract.closed_at) return false;
  if (contract.ended_at) return false;
  if (contract.settled_at) return false;
  if (contract.settlement_date) return false;
  return true;
}

function getLoanInstitutionName(contract) {
  return (
    contract?.institution ||
    contract?.instituicao ||
    contract?.instituição ||
    contract?.financial_institution ||
    contract?.bank_name ||
    contract?.lender_name ||
    contract?.lender ||
    "Empréstimo"
  );
}

function buildAutoLoanCostPayload(contract) {
  const originContractId = String(contract.id || "").trim();
  if (!originContractId) return null;

  const monthlyAmount = getMonthlyAmount(contract);
  const dueDay = getDueDay(contract);
  const supplier = getSupplier(contract);

  return {
    category: "fixo",
    description: "parcelas de empréstimos",
    cost_type: "empréstimo",
    supplier,
    due_day: dueDay,
    monthly_amount: monthlyAmount,
    percentage_rate: 0,
    status: isLoanContractActive(contract) && monthlyAmount > 0 ? "ativo" : "inativo",
    origin_module: "emprestimos",
    origin_contract_id: originContractId,
    auto_generated: true,
    allow_manual_edit: false,
    allow_manual_delete: false,
    updated_at: new Date().toISOString(),
  };
}

async function fetchLoanContracts() {
  const { data, error } = await supabase
    .from(LOAN_CONTRACTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Erro ao carregar contratos da tabela ${LOAN_CONTRACTS_TABLE}: ${error.message}`
    );
  }

  return Array.isArray(data) ? data : [];
}

async function syncLoanCostsFromLoans() {
  const contracts = await fetchLoanContracts();

  const activePayloads = contracts
    .filter(isLoanContractActive)
    .map(buildAutoLoanCostPayload)
    .filter((item) => item && item.monthly_amount > 0);

  if (activePayloads.length > 0) {
    const { error } = await supabase
      .from("finance_cost_entries")
      .upsert(activePayloads, {
        onConflict: "origin_module,origin_contract_id",
      });

    if (error) {
      throw new Error(`Erro ao sincronizar linhas automáticas: ${error.message}`);
    }
  }

  const activeIds = new Set(
    activePayloads.map((item) => String(item.origin_contract_id || ""))
  );

  const { data: existingAutoRows, error: existingAutoRowsError } = await supabase
    .from("finance_cost_entries")
    .select("id, origin_contract_id, status")
    .eq("origin_module", "emprestimos")
    .eq("auto_generated", true);

  if (existingAutoRowsError) {
    throw new Error(
      `Erro ao carregar linhas automáticas existentes: ${existingAutoRowsError.message}`
    );
  }

  const rowsToDeactivate = (existingAutoRows || []).filter((row) => {
    const contractId = String(row.origin_contract_id || "");
    return contractId && !activeIds.has(contractId) && row.status !== "inativo";
  });

  if (rowsToDeactivate.length > 0) {
    const ids = rowsToDeactivate.map((row) => row.id);
    const { error } = await supabase
      .from("finance_cost_entries")
      .update({
        status: "inativo",
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (error) {
      throw new Error(`Erro ao desativar linhas automáticas órfãs: ${error.message}`);
    }
  }

  return {
    contracts_read: contracts.length,
    active_cost_rows: activePayloads.length,
    deactivated_rows: rowsToDeactivate.length,
  };
}

module.exports = {
  syncLoanCostsFromLoans,
  buildAutoLoanCostPayload,
  LOAN_CONTRACTS_TABLE,
};
