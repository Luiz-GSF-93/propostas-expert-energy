function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  let raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const hasPercent = raw.includes("%");
  const negativeByParentheses = raw.startsWith("(") && raw.endsWith(")");

  raw = raw
    .replace(/[R$\s]/g, "")
    .replace(/[^\d,.\-()%]/g, "")
    .replace(/[()]/g, "");

  if (!raw) {
    return null;
  }

  if (raw.includes(",") && raw.includes(".")) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (raw.includes(",")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else {
    raw = raw.replace(/,/g, "");
  }

  const dotParts = raw.split(".");
  if (dotParts.length > 2) {
    raw = `${dotParts.slice(0, -1).join("")}.${dotParts[dotParts.length - 1]}`;
  }

  let parsed = Number(raw);

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

function normalizeCurrency(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (Math.abs(numeric) > 9999999999.99) {
    return 0;
  }

  return Number(numeric.toFixed(2));
}

function normalizeRate(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (Math.abs(numeric) > 10) {
    return 0;
  }

  return Number(numeric.toFixed(6));
}

function normalizeYear(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 2000 || numeric > 2100) {
    return new Date().getFullYear();
  }

  return Math.trunc(numeric);
}

async function loadAllStagingRows(adminSupabase, batchId) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await adminSupabase
      .from("financial_import_staging")
      .select("sheet_name, row_number, payload_json, created_at")
      .eq("batch_id", batchId)
      .order("sheet_name", { ascending: true })
      .order("row_number", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Erro ao ler staging: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows = allRows.concat(data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

function buildSheetRowMap(stagingRows) {
  const map = new Map();

  for (const row of stagingRows) {
    if (!map.has(row.sheet_name)) {
      map.set(row.sheet_name, new Map());
    }

    const rowMap = map.get(row.sheet_name);
    const values = Array.isArray(row.payload_json?.row) ? row.payload_json.row : [];
    rowMap.set(row.row_number, values);
  }

  return map;
}

function getCell(sheetRowMap, sheetName, rowNumber, columnIndex) {
  const sheet = sheetRowMap.get(sheetName);

  if (!sheet) {
    return null;
  }

  const row = sheet.get(rowNumber);

  if (!row || !Array.isArray(row)) {
    return null;
  }

  return row[columnIndex] ?? null;
}

function pickNumber(sheetRowMap, sources) {
  for (const source of sources) {
    const raw = getCell(sheetRowMap, source.sheet, source.row, source.col);
    const parsed = parseNumber(raw);

    if (parsed !== null && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
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

  const stagingRows = await loadAllStagingRows(adminSupabase, batchId);

  if (!stagingRows || stagingRows.length === 0) {
    throw new Error("Nenhuma linha encontrada no staging para este lote.");
  }

  const sheetRowMap = buildSheetRowMap(stagingRows);

  const rawMetrics = {
    gross_revenue: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 6, col: 0 },
      { sheet: "Dashboard", row: 19, col: 13 },
      { sheet: "DRE", row: 27, col: 2 },
      { sheet: "DRE", row: 5, col: 13 }
    ]),
    net_profit: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 6, col: 3 },
      { sheet: "Dashboard", row: 21, col: 13 },
      { sheet: "DRE", row: 32, col: 2 },
      { sheet: "DRE", row: 22, col: 13 }
    ]),
    net_margin: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 6, col: 6 },
      { sheet: "Dashboard", row: 27, col: 4 },
      { sheet: "DRE", row: 33, col: 2 },
      { sheet: "DRE", row: 23, col: 13 }
    ]),
    ebitda: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 6, col: 9 },
      { sheet: "DRE", row: 30, col: 2 }
    ]),
    cash_balance: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 6, col: 12 },
      { sheet: "Dashboard", row: 22, col: 13 },
      { sheet: "Fluxo de Caixa", row: 32, col: 2 },
      { sheet: "Fluxo de Caixa", row: 24, col: 13 }
    ]),
    fixed_costs: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 10, col: 3 },
      { sheet: "Ponto de Equilíbrio", row: 6, col: 1 }
    ]),
    variable_cost_rate: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 10, col: 6 },
      { sheet: "Ponto de Equilíbrio", row: 7, col: 1 }
    ]),
    break_even: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 10, col: 0 },
      { sheet: "Ponto de Equilíbrio", row: 15, col: 1 },
      { sheet: "Ponto de Equilíbrio", row: 22, col: 2 }
    ]),
    total_loans: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 14, col: 0 }
    ]),
    loan_installments_year: pickNumber(sheetRowMap, [
      { sheet: "Dashboard", row: 14, col: 3 },
      { sheet: "Dashboard", row: 23, col: 13 },
      { sheet: "Fluxo de Caixa", row: 20, col: 14 }
    ])
  };

  const snapshotPayload = {
    reference_year: normalizeYear(referenceYear),
    gross_revenue: normalizeCurrency(rawMetrics.gross_revenue),
    net_profit: normalizeCurrency(rawMetrics.net_profit),
    net_margin: normalizeRate(rawMetrics.net_margin),
    ebitda: normalizeCurrency(rawMetrics.ebitda),
    cash_balance: normalizeCurrency(rawMetrics.cash_balance),
    fixed_costs: normalizeCurrency(rawMetrics.fixed_costs),
    variable_cost_rate: normalizeRate(rawMetrics.variable_cost_rate),
    break_even: normalizeCurrency(rawMetrics.break_even),
    total_loans: normalizeCurrency(rawMetrics.total_loans),
    loan_installments_year: normalizeCurrency(rawMetrics.loan_installments_year)
  };

  console.log("[finance.process.snapshot]", {
    batchId,
    rawMetrics,
    snapshotPayload
  });

  const { data: snapshot, error: snapshotError } = await adminSupabase
    .from("financial_dashboard_snapshots")
    .insert(snapshotPayload)
    .select("*")
    .single();

  if (snapshotError) {
    throw new Error(`Erro ao gravar snapshot: ${snapshotError.message}. payload=${JSON.stringify(snapshotPayload)}`);
  }

  const notes = JSON.stringify({
    processed_at: new Date().toISOString(),
    processor: "phase-1c-a.2",
    snapshot_id: snapshot.id,
    metrics_found: snapshotPayload
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
