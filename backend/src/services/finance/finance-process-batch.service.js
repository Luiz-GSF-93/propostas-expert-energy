function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const hasPercent = raw.includes("%");
  const negativeByParentheses = raw.startsWith("(") && raw.endsWith(")");

  let sanitized = raw
    .replace(/[R$\s]/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");

  if (!sanitized || sanitized === "-" || sanitized === "." || sanitized === "-.") {
    return null;
  }

  let parsed = Number(sanitized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (negativeByParentheses) {
    parsed = parsed * -1;
  }

  if (hasPercent) {
    parsed = parsed / 100;
  }

  return parsed;
}

function flattenValues(input, acc = []) {
  if (input == null) {
    return acc;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      flattenValues(item, acc);
    }
    return acc;
  }

  if (typeof input === "object") {
    for (const value of Object.values(input)) {
      flattenValues(value, acc);
    }
    return acc;
  }

  acc.push(input);
  return acc;
}

function buildPreparedRows(stagingRows) {
  return stagingRows.map((row) => {
    const rawValues = flattenValues(row.payload_json ?? {});
    const textValues = rawValues
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    const numbers = rawValues
      .map((value) => parseNumber(value))
      .filter((value) => Number.isFinite(value));

    return {
      sheet_name: row.sheet_name,
      row_number: row.row_number,
      text: normalizeText(textValues.join(" | ")),
      numbers
    };
  });
}

function findMetric(preparedRows, options) {
  const {
    sheetNames = [],
    patterns = [],
    fallbackPatterns = []
  } = options;

  const rows = preparedRows.filter((row) => sheetNames.includes(row.sheet_name));

  for (const row of rows) {
    const matched = patterns.some((pattern) => pattern.test(row.text));
    if (!matched) {
      continue;
    }

    if (row.numbers.length > 0) {
      return row.numbers[row.numbers.length - 1];
    }
  }

  for (const row of rows) {
    const matched = fallbackPatterns.some((pattern) => pattern.test(row.text));
    if (!matched) {
      continue;
    }

    if (row.numbers.length > 0) {
      return row.numbers[row.numbers.length - 1];
    }
  }

  return null;
}

async function processImportedBatch({ batchId, referenceYear, adminSupabase }) {
  const { data: batch, error: batchError } = await adminSupabase
    .from("financial_import_batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    throw new Error("Lote de importação não encontrado.");
  }

  const { data: stagingRows, error: stagingError } = await adminSupabase
    .from("financial_import_staging")
    .select("sheet_name, row_number, payload_json, created_at")
    .eq("batch_id", batchId)
    .order("sheet_name", { ascending: true })
    .order("row_number", { ascending: true });

  if (stagingError) {
    throw new Error(`Erro ao ler staging: ${stagingError.message}`);
  }

  if (!stagingRows || stagingRows.length === 0) {
    throw new Error("Nenhuma linha encontrada no staging para este lote.");
  }

  const preparedRows = buildPreparedRows(stagingRows);

  const grossRevenue =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "DRE"],
      patterns: [/receita bruta/, /faturamento bruto/, /faturamento total/],
      fallbackPatterns: [/faturamento/, /receita/]
    }) ?? 0;

  const netProfit =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "DRE"],
      patterns: [/lucro liquido/, /resultado liquido/, /prejuizo liquido/],
      fallbackPatterns: [/lucro/, /resultado/]
    }) ?? 0;

  const netMargin =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "DRE"],
      patterns: [/margem liquida/],
      fallbackPatterns: [/margem/]
    }) ?? 0;

  const ebitda =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "DRE"],
      patterns: [/ebitda/]
    }) ?? 0;

  const cashBalance =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "Fluxo de Caixa"],
      patterns: [/saldo final de caixa/, /saldo de caixa/, /caixa final/, /saldo final/],
      fallbackPatterns: [/caixa/]
    }) ?? 0;

  const fixedCosts =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "Ponto de Equilíbrio", "Custos"],
      patterns: [/custos fixos totais/, /custo fixo total/, /custos fixos/]
    }) ?? 0;

  const variableCostRate =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "Ponto de Equilíbrio", "Markup e Preço"],
      patterns: [/taxa de custo variavel/, /percentual de custo variavel/, /custo variavel/]
    }) ?? 0;

  const breakEven =
    findMetric(preparedRows, {
      sheetNames: ["Dashboard", "Ponto de Equilíbrio"],
      patterns: [/ponto de equilibrio/, /break even/]
    }) ?? 0;

  const snapshotPayload = {
    reference_year: Number(referenceYear) || new Date().getFullYear(),
    gross_revenue: grossRevenue,
    net_profit: netProfit,
    net_margin: netMargin,
    ebitda,
    cash_balance: cashBalance,
    fixed_costs: fixedCosts,
    variable_cost_rate: variableCostRate,
    break_even: breakEven,
    total_loans: 0,
    loan_installments_year: 0
  };

  const { data: snapshot, error: snapshotError } = await adminSupabase
    .from("financial_dashboard_snapshots")
    .insert(snapshotPayload)
    .select("*")
    .single();

  if (snapshotError) {
    throw new Error(`Erro ao gravar snapshot: ${snapshotError.message}`);
  }

  const notes = JSON.stringify({
    processed_at: new Date().toISOString(),
    processor: "phase-1c-a",
    snapshot_id: snapshot.id,
    metrics_found: {
      gross_revenue: grossRevenue,
      net_profit: netProfit,
      net_margin: netMargin,
      ebitda,
      cash_balance: cashBalance,
      fixed_costs: fixedCosts,
      variable_cost_rate: variableCostRate,
      break_even: breakEven
    }
  });

  const { error: updateBatchError } = await adminSupabase
    .from("financial_import_batches")
    .update({
      notes,
      updated_at: new Date().toISOString()
    })
    .eq("id", batchId);

  if (updateBatchError) {
    throw new Error(`Snapshot criado, mas falhou ao atualizar lote: ${updateBatchError.message}`);
  }

  return {
    batch_id: batchId,
    snapshot_id: snapshot.id,
    snapshot: snapshotPayload,
    staging_rows: stagingRows.length,
    sheets_processed: [...new Set(stagingRows.map((row) => row.sheet_name))]
  };
}

module.exports = {
  processImportedBatch
};
