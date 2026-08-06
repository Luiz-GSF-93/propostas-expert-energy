const DEFAULT_AMORTIZATION = "PRICE";

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

function extractRowValues(row) {
  if (Array.isArray(row?.values)) return row.values;
  if (Array.isArray(row?.row_data)) return row.row_data;
  if (Array.isArray(row?.row)) return row.row;
  if (Array.isArray(row)) return row;
  return [];
}

function isMeaningfulCell(value) {
  const normalized = normalizeText(value);
  return normalized !== "" && normalized !== "-" && normalized !== "—";
}

function isEmptyRow(row) {
  return !extractRowValues(row).some(isMeaningfulCell);
}

function isTitleRow(row) {
  const values = extractRowValues(row).map(normalizeText);
  const meaningful = values.filter(isMeaningfulCell);
  if (meaningful.length === 0) return false;

  const first = meaningful[0].toLowerCase();
  const onlyFirstCell = meaningful.length === 1;

  return (
    onlyFirstCell &&
    (
      first.includes("fluxo de caixa") ||
      first.includes("demonstração do resultado") ||
      first.includes("demonstracao do resultado") ||
      first.includes("gestão de custos") ||
      first.includes("gestao de custos") ||
      first.includes("empréstimos") ||
      first.includes("emprestimos") ||
      first.includes("controle de empréstimos") ||
      first.includes("controle de emprestimos")
    )
  );
}

function scoreLoanHeader(values) {
  const cells = values.map((v) => normalizeText(v).toLowerCase());
  let score = 0;

  for (const cell of cells) {
    if (!cell) continue;
    if (
      cell.includes("contrato") ||
      cell.includes("banco") ||
      cell.includes("credor") ||
      cell.includes("modalidade") ||
      cell.includes("tipo") ||
      cell.includes("principal") ||
      cell.includes("valor") ||
      cell.includes("parcela") ||
      cell.includes("juros") ||
      cell.includes("iof") ||
      cell.includes("tarifa") ||
      cell.includes("vencimento") ||
      cell.includes("índice") ||
      cell.includes("indice") ||
      cell.includes("amortização") ||
      cell.includes("amortizacao") ||
      cell.includes("carência") ||
      cell.includes("carencia")
    ) {
      score += 2;
    } else {
      score += 0.1;
    }
  }

  return score;
}

function detectHeaderIndex(rows) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 25); i += 1) {
    const score = scoreLoanHeader(extractRowValues(rows[i]));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function buildHeaders(row) {
  return extractRowValues(row).map((value, index) => {
    const normalized = normalizeText(value);
    return normalized || `Coluna ${index + 1}`;
  });
}

function rowToObject(headers, row) {
  const values = extractRowValues(row);
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = values[index] ?? "";
  });
  return obj;
}

function findField(source, aliases) {
  const entries = Object.entries(source || {});
  for (const [key, value] of entries) {
    const normalizedKey = normalizeText(key).toLowerCase();
    if (aliases.some((alias) => normalizedKey.includes(alias))) {
      return value;
    }
  }
  return "";
}

function normalizeLoanRecord(raw, index) {
  const contractNumber = normalizeText(
    findField(raw, ["contrato", "nº contrato", "numero contrato", "id"])
  ) || `EMP-${index + 1}`;

  const lender = normalizeText(
    findField(raw, ["banco", "credor", "instituição", "instituicao", "financeira"])
  );

  const loanType = normalizeText(
    findField(raw, ["modalidade", "tipo", "produto", "linha"])
  );

  const principalAmount = parseNumber(
    findField(raw, ["valor principal", "principal", "valor contratado", "valor"]),
    0
  );

  const netAmount = parseNumber(
    findField(raw, ["valor líquido", "valor liquido", "valor liberado", "valor líquido liberado"]),
    principalAmount
  );

  const installmentAmount = parseNullableNumber(
    findField(raw, ["valor parcela", "parcela mensal", "parcela"])
  );

  const installmentsTotal = parseInteger(
    findField(raw, ["parcelas", "qtd parcelas", "quantidade parcelas", "numero parcelas"]),
    0
  );

  const installmentsPaid = parseInteger(
    findField(raw, ["parcelas pagas", "pagas", "qtd pagas"]),
    0
  );

  let monthlyRate = parseNullableNumber(
    findField(raw, ["juros a.m", "taxa a.m", "taxa mês", "taxa mes", "juros mês", "juros mes"])
  );

  let annualRate = parseNullableNumber(
    findField(raw, ["juros a.a", "taxa a.a", "taxa ano", "juros ano"])
  );

  if ((monthlyRate === null || monthlyRate === 0) && annualRate) {
    monthlyRate = annualToMonthlyRate(annualRate);
  }
  if ((annualRate === null || annualRate === 0) && monthlyRate) {
    annualRate = monthlyToAnnualRate(monthlyRate);
  }

  let monthlyIndexRate = parseNullableNumber(
    findField(raw, ["índice a.m", "indice a.m", "índice mes", "indice mes"])
  );
  let annualIndexRate = parseNullableNumber(
    findField(raw, ["índice a.a", "indice a.a", "índice ano", "indice ano"])
  );

  if ((monthlyIndexRate === null || monthlyIndexRate === 0) && annualIndexRate) {
    monthlyIndexRate = annualToMonthlyRate(annualIndexRate);
  }
  if ((annualIndexRate === null || annualIndexRate === 0) && monthlyIndexRate) {
    annualIndexRate = monthlyToAnnualRate(monthlyIndexRate);
  }

  const iof = parseNumber(findField(raw, ["iof"]), 0);
  const fees = parseNumber(
    findField(raw, ["tarifa", "custo adicional", "custo", "seguro", "despesa adicional"]),
    0
  );

  const graceMonths = parseInteger(
    findField(raw, ["carência", "carencia", "meses carência", "meses carencia"]),
    0
  );

  const amortizationSystem = normalizeText(
    findField(raw, ["amortização", "amortizacao", "sistema"])
  ).toUpperCase() || DEFAULT_AMORTIZATION;

  const startDate = parseDate(findField(raw, ["contratação", "contratacao", "início", "inicio", "data contrato"]));
  const releaseDate = parseDate(findField(raw, ["liberação", "liberacao", "data liberação", "data liberacao"]));
  const firstDueDate = parseDate(findField(raw, ["primeiro vencimento", "1º vencimento", "1 vencimento"]));
  const finalDueDate = parseDate(findField(raw, ["vencimento final", "data final", "último vencimento", "ultimo vencimento"]));

  const importedOutstanding = parseNullableNumber(
    findField(raw, ["saldo devedor", "saldo atual", "saldo"])
  );

  const notes = normalizeText(findField(raw, ["observação", "observacao", "nota", "detalhe"]));
  const status = normalizeText(findField(raw, ["status"])) || "ativo";

  return {
    id: contractNumber,
    contract_number: contractNumber,
    lender,
    loan_type: loanType,
    principal_amount: principalAmount,
    net_amount: netAmount,
    installment_amount: installmentAmount,
    installments_total: installmentsTotal,
    installments_paid: installmentsPaid,
    monthly_rate: monthlyRate || 0,
    annual_rate: annualRate || 0,
    monthly_index_rate: monthlyIndexRate || 0,
    annual_index_rate: annualIndexRate || 0,
    iof,
    fees,
    grace_months: graceMonths,
    amortization_system: amortizationSystem || DEFAULT_AMORTIZATION,
    start_date: formatDateIso(startDate),
    release_date: formatDateIso(releaseDate),
    first_due_date: formatDateIso(firstDueDate),
    final_due_date: formatDateIso(finalDueDate),
    imported_balance_outstanding: importedOutstanding,
    notes,
    status,
    raw_fields: raw,
  };
}

function buildSchedule(contract) {
  const principal = Number(contract.principal_amount || 0);
  const installments = Number(contract.installments_total || 0);
  const monthlyRate = Number(contract.monthly_rate || 0) / 100;
  const installmentsPaid = Number(contract.installments_paid || 0);
  const iof = Number(contract.iof || 0);
  const fees = Number(contract.fees || 0);
  const extraPerInstallment = installments > 0 ? (iof + fees) / installments : 0;

  if (!principal || !installments) {
    return [];
  }

  const start = parseDate(contract.first_due_date) ||
    addMonths(parseDate(contract.start_date) || new Date(), 1);

  const schedule = [];
  let balance = principal;

  if ((contract.amortization_system || DEFAULT_AMORTIZATION).toUpperCase() === "SAC") {
    const amortization = principal / installments;

    for (let i = 1; i <= installments; i += 1) {
      const balanceBefore = balance;
      const interest = balanceBefore * monthlyRate;
      const installment = amortization + interest + extraPerInstallment;
      const balanceAfter = Math.max(balanceBefore - amortization, 0);
      const dueDate = addMonths(start, i - 1 + Number(contract.grace_months || 0));
      const paid = i <= installmentsPaid;
      const overdue = !paid && dueDate < new Date();

      schedule.push({
        number: i,
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
    }

    return schedule;
  }

  // PRICE
  const paymentBase =
    monthlyRate === 0
      ? principal / installments
      : principal * ((monthlyRate * Math.pow(1 + monthlyRate, installments)) / (Math.pow(1 + monthlyRate, installments) - 1));

  for (let i = 1; i <= installments; i += 1) {
    const balanceBefore = balance;
    const interest = balanceBefore * monthlyRate;
    const amortization = monthlyRate === 0 ? principal / installments : paymentBase - interest;
    const installment = paymentBase + extraPerInstallment;
    const balanceAfter = Math.max(balanceBefore - amortization, 0);
    const dueDate = addMonths(start, i - 1 + Number(contract.grace_months || 0));
    const paid = i <= installmentsPaid;
    const overdue = !paid && dueDate < new Date();

    schedule.push({
      number: i,
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
  }

  return schedule;
}

function summarizeContract(contract, schedule) {
  const paid = schedule.filter((item) => item.status === "paid").length;
  const overdue = schedule.filter((item) => item.status === "overdue").length;
  const open = schedule.filter((item) => item.status === "open").length;
  const nextDue = schedule.find((item) => item.status !== "paid");
  const outstanding = contract.imported_balance_outstanding ?? schedule[schedule.length - 1]?.balance_after ?? 0;
  const monthlyCost = schedule.find((item) => item.status !== "paid")?.installment_amount ?? contract.installment_amount ?? 0;
  const totalPaid = schedule
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + item.installment_amount, 0);

  return {
    ...contract,
    balance_outstanding: outstanding,
    installments_paid_count: paid,
    installments_open_count: open,
    installments_overdue_count: overdue,
    next_due_date: nextDue?.due_date || null,
    current_installment_amount: monthlyCost,
    total_paid_amount: totalPaid,
  };
}

function summarizePortfolio(contracts) {
  const summary = {
    total_contracts: contracts.length,
    total_principal: 0,
    total_net_amount: 0,
    total_balance_outstanding: 0,
    total_installments_paid: 0,
    total_installments_open: 0,
    total_installments_overdue: 0,
    total_monthly_cost: 0,
    avg_monthly_rate: 0,
    avg_annual_rate: 0,
    next_due_date: null,
  };

  let monthlyRateBase = 0;
  let annualRateBase = 0;
  let monthlyRateCount = 0;
  let annualRateCount = 0;
  const nextDates = [];

  for (const item of contracts) {
    summary.total_principal += Number(item.principal_amount || 0);
    summary.total_net_amount += Number(item.net_amount || 0);
    summary.total_balance_outstanding += Number(item.balance_outstanding || 0);
    summary.total_installments_paid += Number(item.installments_paid_count || 0);
    summary.total_installments_open += Number(item.installments_open_count || 0);
    summary.total_installments_overdue += Number(item.installments_overdue_count || 0);
    summary.total_monthly_cost += Number(item.current_installment_amount || 0);

    if (item.monthly_rate) {
      monthlyRateBase += Number(item.monthly_rate);
      monthlyRateCount += 1;
    }
    if (item.annual_rate) {
      annualRateBase += Number(item.annual_rate);
      annualRateCount += 1;
    }
    if (item.next_due_date) {
      nextDates.push(item.next_due_date);
    }
  }

  summary.avg_monthly_rate = monthlyRateCount ? monthlyRateBase / monthlyRateCount : 0;
  summary.avg_annual_rate = annualRateCount ? annualRateBase / annualRateCount : 0;
  summary.next_due_date = nextDates.sort()[0] || null;

  return summary;
}

async function getLatestCompletedBatch(adminSupabase) {
  const { data, error } = await adminSupabase
    .from("financial_import_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar lote financeiro: ${error.message}`);
  }

  return data;
}

async function fetchSheetRows(adminSupabase, batchId, sheetName) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await adminSupabase
      .from("financial_import_staging")
      .select("id, row_number, payload_json, sheet_name")
      .eq("batch_id", batchId)
      .eq("sheet_name", sheetName)
      .order("row_number", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Erro ao carregar linhas da aba ${sheetName}: ${error.message}`);
    }

    const rows = (data || []).map((row) => {
      const payload = row.payload_json || {};
      return {
        id: row.id,
        row_number: row.row_number,
        row: payload.row || payload.row_data || payload.values || [],
      };
    });

    allRows = allRows.concat(rows);

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

async function extractLoanContracts(adminSupabase) {
  const latestBatch = await getLatestCompletedBatch(adminSupabase);

  if (!latestBatch) {
    return {
      latestBatch: null,
      headers: [],
      contracts: [],
    };
  }

  const allRows = await fetchSheetRows(adminSupabase, latestBatch.id, "Empréstimos");
  const usefulRows = allRows.filter((row) => !isEmptyRow(row) && !isTitleRow(row));

  if (usefulRows.length === 0) {
    return {
      latestBatch,
      headers: [],
      contracts: [],
    };
  }

  const headerIndex = detectHeaderIndex(usefulRows);
  const headers = buildHeaders(usefulRows[headerIndex] || []);
  const dataRows = usefulRows
    .filter((_, index) => index !== headerIndex)
    .filter((row) => !isEmptyRow(row) && !isTitleRow(row));

  const contracts = dataRows
    .map((row) => rowToObject(headers, row))
    .map((raw, index) => normalizeLoanRecord(raw, index))
    .filter((item) => item.contract_number || item.principal_amount || item.lender);

  const contractsWithSummary = contracts.map((contract) => {
    const schedule = buildSchedule(contract);
    return summarizeContract(contract, schedule);
  });

  return {
    latestBatch,
    headers,
    contracts: contractsWithSummary,
  };
}

async function getLoansDashboardData(adminSupabase) {
  const { latestBatch, headers, contracts } = await extractLoanContracts(adminSupabase);
  const summary = summarizePortfolio(contracts);

  return {
    latest_batch: latestBatch
      ? {
          id: latestBatch.id,
          source_file_name: latestBatch.source_file_name,
          source_version: latestBatch.source_version,
          import_status: latestBatch.import_status,
          created_at: latestBatch.created_at,
          updated_at: latestBatch.updated_at,
        }
      : null,
    headers,
    summary,
    contracts,
  };
}

async function getLoanContractDetail(adminSupabase, contractId) {
  const { latestBatch, contracts } = await extractLoanContracts(adminSupabase);
  const contract = contracts.find((item) => item.id === contractId);

  if (!contract) {
    throw new Error("Contrato de empréstimo não encontrado.");
  }

  const schedule = buildSchedule(contract);

  return {
    latest_batch: latestBatch
      ? {
          id: latestBatch.id,
          source_file_name: latestBatch.source_file_name,
          source_version: latestBatch.source_version,
          import_status: latestBatch.import_status,
        }
      : null,
    contract,
    schedule,
    schedule_summary: {
      total_installments: schedule.length,
      paid_installments: schedule.filter((item) => item.status === "paid").length,
      open_installments: schedule.filter((item) => item.status === "open").length,
      overdue_installments: schedule.filter((item) => item.status === "overdue").length,
      total_interest: schedule.reduce((sum, item) => sum + item.interest_amount, 0),
      total_amortization: schedule.reduce((sum, item) => sum + item.amortization_amount, 0),
      total_extra_costs: schedule.reduce((sum, item) => sum + item.extra_cost_amount, 0),
    },
  };
}

function calculateLoanSimulation(input) {
  const normalized = normalizeLoanRecord(
    {
      "Contrato": input.contract_number || "SIMULACAO",
      "Banco": input.lender || "Simulação",
      "Tipo": input.loan_type || input.modalidade || "Empréstimo",
      "Valor Principal": input.principal_amount,
      "Valor Líquido": input.net_amount || input.principal_amount,
      "Parcelas": input.installments_total,
      "Parcelas Pagas": input.installments_paid || 0,
      "Juros a.m": input.monthly_rate,
      "Juros a.a": input.annual_rate,
      "Índice a.m": input.monthly_index_rate,
      "Índice a.a": input.annual_index_rate,
      "IOF": input.iof,
      "Tarifa": input.fees,
      "Carência": input.grace_months,
      "Amortização": input.amortization_system || DEFAULT_AMORTIZATION,
      "Primeiro Vencimento": input.first_due_date,
      "Data Contrato": input.start_date,
      "Status": "simulação",
    },
    0
  );

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
      total_interest: schedule.reduce((sum, item) => sum + item.interest_amount, 0),
      total_amortization: schedule.reduce((sum, item) => sum + item.amortization_amount, 0),
      total_extra_costs: schedule.reduce((sum, item) => sum + item.extra_cost_amount, 0),
    },
  };
}

module.exports = {
  getLoansDashboardData,
  getLoanContractDetail,
  calculateLoanSimulation,
};
