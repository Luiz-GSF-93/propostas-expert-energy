const { updateLoanContract, previewSettlement, applySettlement, deleteLoanContract } = require("../services/finance/finance-loans-admin.service");
const express = require("express");
const { processImportedBatch } = require("../services/finance/finance-process-batch.service");
const router = express.Router();

const {
  getDreYear,
  upsertDreSettings,
  createDreManualEntry,
  updateDreManualEntry,
  deleteDreManualEntry,
} = require("../services/finance/finance-dre.service");
const {
  getPlanningSummary,
  getPlanningIndicators,
  upsertPlanningIndicators,
  getPlanningMonthlyGoals,
  upsertPlanningMonthlyGoal,
  deletePlanningMonthlyGoal,
} = require("../services/finance/finance-planning.service");



async function getLatestFinanceBatch() {
  const { data, error } = await adminSupabase
    .from("financial_import_batches")
    .select("*")
    .eq("import_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar último lote financeiro: ${error.message}`);
  }

  return data || null;
}

async function getFinanceSheetRows(batchId, sheetName) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await adminSupabase
      .from("financial_import_staging")
      .select("row_number, payload_json")
      .eq("batch_id", batchId)
      .eq("sheet_name", sheetName)
      .order("row_number", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Erro ao buscar aba ${sheetName}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows = allRows.concat(
      data.map((row) => ({
        row_number: row.row_number,
        row: Array.isArray(row.payload_json?.row) ? row.payload_json.row : [],
      }))
    );

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

function parseBatchNotes(notes) {
  if (!notes) {
    return {};
  }


function extractFinanceValues(row) {
  if (Array.isArray(row?.values)) return row.values;
  if (Array.isArray(row?.row_data)) return row.row_data;
  if (Array.isArray(row?.row)) return row.row;
  return [];
}

function normalizeFinanceCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return String(value).replace(/\s+/g, " ").trim();
}

function isMeaningfulFinanceCell(value) {
  const normalized = normalizeFinanceCell(value);
  if (normalized === "") return false;
  if (typeof normalized === "number") return true;
  return normalized !== "-" && normalized !== "—";
}

function isFinanceRowEmpty(row) {
  const values = extractFinanceValues(row);
  return !values.some(isMeaningfulFinanceCell);
}

function scoreFinanceHeader(values) {
  const cells = values.map(normalizeFinanceCell);
  let score = 0;

  for (const cell of cells) {
    if (!cell) continue;
    const lower = String(cell).toLowerCase();

    if (
      lower.includes("conta") ||
      lower.includes("descr") ||
      lower.includes("categoria") ||
      lower.includes("tipo") ||
      lower.includes("jan") ||
      lower.includes("fev") ||
      lower.includes("mar") ||
      lower.includes("abr") ||
      lower.includes("mai") ||
      lower.includes("jun") ||
      lower.includes("jul") ||
      lower.includes("ago") ||
      lower.includes("set") ||
      lower.includes("out") ||
      lower.includes("nov") ||
      lower.includes("dez") ||
      lower.includes("total") ||
      lower.includes("real") ||
      lower.includes("orçado") ||
      lower.includes("orcado")
    ) {
      score += 2;
    } else {
      score += 0.15;
    }
  }

  return score;
}

function detectFinanceHeaderIndex(rows) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const values = extractFinanceValues(rows[i]);
    const score = scoreFinanceHeader(values);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function buildFinanceHeaders(row) {
  const values = extractFinanceValues(row);
  return values.map((value, index) => {
    const normalized = normalizeFinanceCell(value);
    return normalized || `Coluna ${index + 1}`;
  });
}

function formatFinanceSheetPayload(sheetName, allRows, latestBatch) {
  const usefulRows = allRows.filter((row) => !isFinanceRowEmpty(row));
  const headerIndex = detectFinanceHeaderIndex(usefulRows);
  const headerRow = usefulRows[headerIndex] || { row_number: null };
  const headers = buildFinanceHeaders(headerRow);

  const rows = usefulRows
    .filter((_, index) => index !== headerIndex)
    .map((row, index) => ({
      id: row.id || `${sheetName}-${row.row_number || index + 1}`,
      row_number: row.row_number ?? index + 1,
      values: extractFinanceValues(row).map(normalizeFinanceCell),
    }));

  return {
    batch_id: latestBatch.id,
    source_file_name: latestBatch.source_file_name,
    source_version: latestBatch.source_version,
    import_status: latestBatch.import_status,
    sheet_name: sheetName,
    row_count: rows.length,
    header_row_number: headerRow?.row_number ?? null,
    headers,
    rows,
  };
}


  if (typeof notes === "object") {
    return notes;
  }

  try {
    return JSON.parse(notes);
  } catch (error) {
    return {};
  }
}


function normalizeCellValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return String(value).replace(/\s+/g, " ").trim();
}

function isMeaningfulCell(value) {
  const v = normalizeCellValue(value);
  if (v === "") return false;
  if (typeof v === "number") return true;
  return v !== "-" && v !== "—";
}

function isEmptyFinanceRow(row) {
  const values = Array.isArray(row?.row_data) ? row.row_data : [];
  return !values.some(isMeaningfulCell);
}

function scoreHeaderRow(values) {
  const normalized = values.map(normalizeCellValue);
  let score = 0;
  for (const cell of normalized) {
    if (!cell) continue;
    const lower = String(cell).toLowerCase();
    if (
      lower.includes("descr") ||
      lower.includes("conta") ||
      lower.includes("categoria") ||
      lower.includes("tipo") ||
      lower.includes("jan") ||
      lower.includes("fev") ||
      lower.includes("mar") ||
      lower.includes("abr") ||
      lower.includes("mai") ||
      lower.includes("jun") ||
      lower.includes("jul") ||
      lower.includes("ago") ||
      lower.includes("set") ||
      lower.includes("out") ||
      lower.includes("nov") ||
      lower.includes("dez") ||
      lower.includes("total") ||
      lower.includes("real") ||
      lower.includes("orçado") ||
      lower.includes("orcado")
    ) {
      score += 2;
    } else if (cell) {
      score += 0.25;
    }
  }
  return score;
}

function detectHeaderIndex(rows) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const values = Array.isArray(rows[i]?.row_data) ? rows[i].row_data : [];
    const score = scoreHeaderRow(values);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function buildHeadersFromRow(row) {
  const values = Array.isArray(row?.row_data) ? row.row_data : [];
  return values.map((value, index) => {
    const normalized = normalizeCellValue(value);
    return normalized || `Coluna ${index + 1}`;
  });
}

function formatFinanceSheetResponse(sheetName, allRows, latestBatch) {
  const filteredRows = allRows.filter((row) => !isEmptyFinanceRow(row));
  const headerIndex = detectHeaderIndex(filteredRows);
  const headerRow = filteredRows[headerIndex] || { row_data: [] };
  const headers = buildHeadersFromRow(headerRow);

  const rows = filteredRows
    .filter((_, index) => index !== headerIndex)
    .map((row) => ({
      id: row.id,
      row_number: row.row_number,
      values: Array.isArray(row.row_data) ? row.row_data.map(normalizeCellValue) : [],
    }));

  return {
    batch_id: latestBatch.id,
    source_file_name: latestBatch.source_file_name,
    source_version: latestBatch.source_version,
    import_status: latestBatch.import_status,
    sheet_name: sheetName,
    row_count: rows.length,
    header_row_number: headerRow?.row_number ?? null,
    headers,
    rows,
  };
}



const XLSX = require("xlsx");
const { adminSupabase } = require("../config/supabase");
const authMiddleware = require("../middlewares/auth");

async function requireAdmin(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const { data: profile, error } = await adminSupabase
      .from("profiles")
      .select("id, role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("finance.requireAdmin.error", error);
      return res.status(500).json({ message: "Erro ao validar acesso administrativo." });
    }

    if (!profile || String(profile.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Acesso restrito ao administrador." });
    }

    req.financeProfile = profile;
    next();
  } catch (error) {
    console.error("finance.requireAdmin.catch", error);
    return res.status(500).json({ message: "Erro interno ao validar acesso." });
  }
}

router.use(authMiddleware);
router.use(requireAdmin);


function normalizeExcelValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === undefined) {
    return null;
  }

  return value;
}


router.get("/summary", async (req, res) => {
  try {
    const { data, error } = await adminSupabase
      .from("financial_dashboard_snapshots")
      .select("*")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("finance.summary.error", error);
      return res.status(500).json({ message: "Erro ao carregar resumo financeiro." });
    }

    return res.status(200).json({
      reference_year: data?.reference_year ?? 2026,
      reference_month: data?.reference_month ?? null,
      gross_revenue: Number(data?.gross_revenue ?? 0),
      net_profit: Number(data?.net_profit ?? 0),
      net_margin: Number(data?.net_margin ?? 0),
      ebitda: Number(data?.ebitda ?? 0),
      cash_balance: Number(data?.cash_balance ?? 0),
      fixed_costs: Number(data?.fixed_costs ?? 0),
      variable_cost_rate: Number(data?.variable_cost_rate ?? 0),
      break_even: Number(data?.break_even ?? 0),
      total_loans: Number(data?.total_loans ?? 0),
      loan_installments_year: Number(data?.loan_installments_year ?? 0),
    });
  } catch (error) {
    console.error("finance.summary.catch", error);
    return res.status(500).json({ message: "Erro interno ao carregar resumo financeiro." });
  }
});

router.get("/bootstrap", async (req, res) => {
  try {
    const [summaryResult, importResult] = await Promise.all([
      adminSupabase
        .from("financial_dashboard_snapshots")
        .select("*")
        .order("reference_year", { ascending: false })
        .order("reference_month", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      adminSupabase
        .from("financial_import_batches")
        .select("id, source_file_name, source_version, import_status, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (summaryResult.error) {
      console.error("finance.bootstrap.summary.error", summaryResult.error);
      return res.status(500).json({ message: "Erro ao carregar snapshot financeiro." });
    }

    if (importResult.error) {
      console.error("finance.bootstrap.import.error", importResult.error);
      return res.status(500).json({ message: "Erro ao carregar status de importação." });
    }

    const summary = summaryResult.data ?? {};

    return res.status(200).json({
      module: {
        key: "financeiro",
        label: "Gestão Financeira",
        phase: "fase_1",
        access: "admin_only",
      },
      summary: {
        reference_year: summary.reference_year ?? 2026,
        reference_month: summary.reference_month ?? null,
        gross_revenue: Number(summary.gross_revenue ?? 0),
        net_profit: Number(summary.net_profit ?? 0),
        net_margin: Number(summary.net_margin ?? 0),
        ebitda: Number(summary.ebitda ?? 0),
        cash_balance: Number(summary.cash_balance ?? 0),
        fixed_costs: Number(summary.fixed_costs ?? 0),
        variable_cost_rate: Number(summary.variable_cost_rate ?? 0),
        break_even: Number(summary.break_even ?? 0),
        total_loans: Number(summary.total_loans ?? 0),
        loan_installments_year: Number(summary.loan_installments_year ?? 0),
      },
      sections: [
        { key: "visao-geral", label: "Visão Geral", status: "ready" },
        { key: "custos", label: "Custos", status: "planned" },
        { key: "fluxo-caixa", label: "Fluxo de Caixa", status: "planned" },
        { key: "dre", label: "DRE", status: "planned" },
        { key: "planejamento", label: "Planejamento", status: "planned" },
        { key: "emprestimos", label: "Empréstimos", status: "planned" }
      ],
      latest_import: importResult.data ?? null
    });
  } catch (error) {
    console.error("finance.bootstrap.catch", error);
    return res.status(500).json({ message: "Erro interno ao carregar módulo financeiro." });
  }
});

router.get("/import/batches", async (req, res) => {
  try {
    const { data, error } = await adminSupabase
      .from("financial_import_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("finance.batches.error", error);
      return res.status(500).json({ message: "Erro ao listar lotes de importação." });
    }

    return res.status(200).json({ data: data ?? [] });
  } catch (error) {
    console.error("finance.batches.catch", error);
    return res.status(500).json({ message: "Erro interno ao listar importações." });
  }
});


router.post("/import/excel", async (req, res) => {
  try {
    const sourceFilePath = String(req.body?.source_file_path || "").trim();
    const sourceFileName = String(req.body?.source_file_name || "").trim() || "finance.xlsx";
    const sourceVersion = String(req.body?.source_version || "").trim() || "fase_1b";

    if (!sourceFilePath) {
      return res.status(400).json({ message: "source_file_path é obrigatório." });
    }

    const fs = require("fs");
    const pathModule = require("path");

    if (!fs.existsSync(sourceFilePath)) {
      return res.status(400).json({ message: "Arquivo Excel não encontrado no caminho informado." });
    }

    const workbook = XLSX.readFile(sourceFilePath, { cellDates: true });
    const sheetNames = workbook.SheetNames || [];

    const { data: batch, error: batchError } = await adminSupabase
      .from("financial_import_batches")
      .insert({
        source_file_name: sourceFileName,
        source_version: sourceVersion,
        imported_by: req.user.id,
        import_status: "processing",
        notes: `Importação inicial de staging via backend. Arquivo: ${pathModule.basename(sourceFilePath)}`,
      })
      .select("*")
      .single();

    if (batchError || !batch) {
      console.error("finance.import.batch.error", batchError);
      return res.status(500).json({ message: "Não foi possível criar o lote de importação." });
    }

    const stagingRows = [];

    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
        raw: false,
      });

      rows.forEach((row, index) => {
        const normalizedRow = Array.isArray(row)
          ? row.map((value) => normalizeExcelValue(value))
          : [];

        stagingRows.push({
          batch_id: batch.id,
          sheet_name: sheetName,
          row_number: index + 1,
          payload_json: {
            row: normalizedRow,
          },
        });
      });
    }

    const chunkSize = 300;

    for (let i = 0; i < stagingRows.length; i += chunkSize) {
      const chunk = stagingRows.slice(i, i + chunkSize);

      const { error: stagingError } = await adminSupabase
        .from("financial_import_staging")
        .insert(chunk);

      if (stagingError) {
        console.error("finance.import.staging.error", stagingError);

        await adminSupabase
          .from("financial_import_batches")
          .update({
            import_status: "error",
            notes: `Falha ao inserir staging: ${stagingError.message || "erro desconhecido"}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", batch.id);

        return res.status(500).json({
          message: "Erro ao salvar linhas do Excel em staging.",
          batch_id: batch.id,
        });
      }
    }

    const { error: finishError } = await adminSupabase
      .from("financial_import_batches")
      .update({
        import_status: "completed",
        updated_at: new Date().toISOString(),
        notes: `Importação concluída com ${sheetNames.length} abas e ${stagingRows.length} linhas em staging.`,
      })
      .eq("id", batch.id);

    if (finishError) {
      console.error("finance.import.finish.error", finishError);
    }

    return res.status(200).json({
      message: "Importação concluída com sucesso.",
      batch_id: batch.id,
      sheets: sheetNames.length,
      rows_imported: stagingRows.length,
      sheet_names: sheetNames,
    });
  } catch (error) {
    console.error("finance.import.excel.catch", error);
    return res.status(500).json({ message: "Erro interno ao importar Excel." });
  }
});


router.get("/import/batches/:id/preview", async (req, res) => {
  try {
    const batchId = req.params.id;

    const { data, error } = await adminSupabase
      .from("financial_import_staging")
      .select("sheet_name, row_number, payload_json")
      .eq("batch_id", batchId)
      .order("sheet_name", { ascending: true })
      .order("row_number", { ascending: true })
      .limit(200);

    if (error) {
      console.error("finance.import.preview.error", error);
      return res.status(500).json({ message: "Erro ao carregar preview do staging." });
    }

    return res.status(200).json({ data: data ?? [] });
  } catch (error) {
    console.error("finance.import.preview.catch", error);
    return res.status(500).json({ message: "Erro interno ao carregar preview." });
  }
});


router.post("/import/batches/:id/process", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const batchId = req.params.id;
    const referenceYear = req.body?.reference_year ?? new Date().getFullYear();

    const result = await processImportedBatch({
      batchId,
      referenceYear,
      adminSupabase
    });

    return res.status(200).json({
      message: "Lote processado com sucesso.",
      ...result
    });
  } catch (error) {
    console.error("[finance.import.process]", error);
    return res.status(500).json({
      message: error.message || "Erro ao processar lote financeiro."
    });
  }
});

router.get("/bootstrap", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [
      { data: latestSnapshot, error: snapshotError },
      { data: latestImportBatch, error: importError }
    ] = await Promise.all([
      adminSupabase
        .from("financial_dashboard_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminSupabase
        .from("financial_import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (snapshotError) {
      throw new Error(`Erro ao buscar snapshot: ${snapshotError.message}`);
    }

    if (importError) {
      throw new Error(`Erro ao buscar lote de importação: ${importError.message}`);
    }

    const parsedNotes = parseBatchNotes(latestImportBatch?.notes);

    const summary = latestSnapshot
      ? {
          reference_year: Number(latestSnapshot.reference_year) || new Date().getFullYear(),
          reference_month: latestSnapshot.reference_month ?? null,
          gross_revenue: Number(latestSnapshot.gross_revenue || 0),
          net_profit: Number(latestSnapshot.net_profit || 0),
          net_margin: Number(latestSnapshot.net_margin || 0),
          ebitda: Number(latestSnapshot.ebitda || 0),
          cash_balance: Number(latestSnapshot.cash_balance || 0),
          fixed_costs: Number(latestSnapshot.fixed_costs || 0),
          variable_cost_rate: Number(latestSnapshot.variable_cost_rate || 0),
          break_even: Number(latestSnapshot.break_even || 0),
          total_loans: Number(latestSnapshot.total_loans || 0),
          loan_installments_year: Number(latestSnapshot.loan_installments_year || 0),
          created_at: latestSnapshot.created_at,
          updated_at: latestSnapshot.updated_at
        }
      : {
          reference_year: new Date().getFullYear(),
          reference_month: null,
          gross_revenue: 0,
          net_profit: 0,
          net_margin: 0,
          ebitda: 0,
          cash_balance: 0,
          fixed_costs: 0,
          variable_cost_rate: 0,
          break_even: 0,
          total_loans: 0,
          loan_installments_year: 0,
          created_at: null,
          updated_at: null
        };

    const latestImport = latestImportBatch
      ? {
          id: latestImportBatch.id,
          source_file_name: latestImportBatch.source_file_name,
          source_version: latestImportBatch.source_version,
          import_status: latestImportBatch.import_status,
          imported_by: latestImportBatch.imported_by,
          created_at: latestImportBatch.created_at,
          updated_at: latestImportBatch.updated_at,
          notes: parsedNotes
        }
      : null;

    const processingStatus = {
      has_snapshot: !!latestSnapshot,
      has_import_batch: !!latestImportBatch,
      latest_snapshot_id: parsedNotes?.snapshot_id || latestSnapshot?.id || null,
      processor: parsedNotes?.processor || null,
      processed_at: parsedNotes?.processed_at || null,
      metrics_found: parsedNotes?.metrics_found || null
    };

    return res.status(200).json({
      summary,
      latest_import_batch: latestImport,
      processing_status: processingStatus
    });
  } catch (error) {
    console.error("[finance.bootstrap]", error);
    return res.status(500).json({
      message: error.message || "Erro ao carregar bootstrap financeiro."
    });
  }
});


router.get("/fluxo-caixa-importado", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const latestBatch = await getLatestFinanceBatch();

    if (!latestBatch) {
      return res.status(200).json({
        batch_id: null,
        source_file_name: null,
        source_version: null,
        import_status: "empty",
        sheet_name: "Fluxo de Caixa",
        row_count: 0,
        header_row_number: null,
        headers: [],
        rows: []
      });
    }

    const rows = await getFinanceSheetRows(latestBatch.id, "Fluxo de Caixa");

    return res.status(200).json(
      formatFinanceSheetPayload("Fluxo de Caixa", rows, latestBatch)
    );
  } catch (error) {
    console.error("[finance.fluxo-caixa]", error);
    return res.status(500).json({
      message: error.message || "Erro ao carregar fluxo de caixa."
    });
  }
});


router.get("/dre-importado", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const latestBatch = await getLatestFinanceBatch();

    if (!latestBatch) {
      return res.status(200).json({
        batch_id: null,
        source_file_name: null,
        source_version: null,
        import_status: "empty",
        sheet_name: "DRE",
        row_count: 0,
        header_row_number: null,
        headers: [],
        rows: []
      });
    }

    const rows = await getFinanceSheetRows(latestBatch.id, "DRE");

    return res.status(200).json(
      formatFinanceSheetPayload("DRE", rows, latestBatch)
    );
  } catch (error) {
    console.error("[finance.dre]", error);
    return res.status(500).json({
      message: error.message || "Erro ao carregar DRE."
    });
  }
});



router.get("/custos", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const latestBatch = await getLatestFinanceBatch();

    if (!latestBatch) {
      return res.status(200).json({
        batch_id: null,
        source_file_name: null,
        source_version: null,
        import_status: "empty",
        sheet_name: "Custos",
        row_count: 0,
        header_row_number: null,
        headers: [],
        rows: []
      });
    }

    const rows = await getFinanceSheetRows(latestBatch.id, "Custos");

    return res.status(200).json(
      formatFinanceSheetPayload("Custos", rows, latestBatch)
    );
  } catch (error) {
    console.error("[finance.custos]", error);
    return res.status(500).json({
      message: error.message || "Erro ao carregar custos."
    });
  }
});




router.get("/emprestimos", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const latestBatch = await getLatestFinanceBatch();

    if (!latestBatch) {
      return res.status(200).json({
        batch_id: null,
        source_file_name: null,
        source_version: null,
        import_status: "empty",
        sheet_name: "Empréstimos",
        row_count: 0,
        header_row_number: null,
        headers: [],
        rows: []
      });
    }

    const rows = await getFinanceSheetRows(latestBatch.id, "Empréstimos");

    return res.status(200).json(
      formatFinanceSheetPayload("Empréstimos", rows, latestBatch)
    );
  } catch (error) {
    console.error("[finance.emprestimos]", error);
    return res.status(500).json({
      message: error.message || "Erro ao carregar empréstimos."
    });
  }
});




router.get("/emprestimos/resumo", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { getLoansDashboardData } = require("../services/finance/finance-loans.service");
    const payload = await getLoansDashboardData(adminSupabase);

    return res.status(200).json({
      latest_batch: payload.latest_batch,
      summary: payload.summary,
      total_contracts: payload.contracts.length,
    });
  } catch (error) {
    console.error("[finance.emprestimos.resumo]", error);
    return res.status(500).json({
      message: error.message || "Erro ao carregar resumo de empréstimos."
    });
  }
});

router.get("/emprestimos/contratos", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { getLoansDashboardData } = require("../services/finance/finance-loans.service");
    const payload = await getLoansDashboardData(adminSupabase);

    return res.status(200).json({
      latest_batch: payload.latest_batch,
      headers: payload.headers,
      contracts: payload.contracts,
    });
  } catch (error) {
    console.error("[finance.emprestimos.contratos]", error);
    return res.status(500).json({
      message: error.message || "Erro ao carregar contratos de empréstimos."
    });
  }
});

router.get("/emprestimos/contratos/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { getLoanContractDetail } = require("../services/finance/finance-loans.service");
    const payload = await getLoanContractDetail(adminSupabase, req.params.id);

    return res.status(200).json(payload);
  } catch (error) {
    console.error("[finance.emprestimos.contrato]", error);
    return res.status(404).json({
      message: error.message || "Erro ao carregar contrato de empréstimo."
    });
  }
});

router.get("/emprestimos/contratos/:id/parcelas", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { getLoanContractDetail } = require("../services/finance/finance-loans.service");
    const payload = await getLoanContractDetail(adminSupabase, req.params.id);

    return res.status(200).json({
      contract_id: payload.contract.id,
      schedule: payload.schedule,
      schedule_summary: payload.schedule_summary,
    });
  } catch (error) {
    console.error("[finance.emprestimos.parcelas]", error);
    return res.status(404).json({
      message: error.message || "Erro ao carregar parcelas do empréstimo."
    });
  }
});

router.post("/emprestimos/calcular", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { calculateLoanSimulation } = require("../services/finance/finance-loans.service");
    const payload = calculateLoanSimulation(req.body || {});

    return res.status(200).json(payload);
  } catch (error) {
    console.error("[finance.emprestimos.calcular]", error);
    return res.status(400).json({
      message: error.message || "Erro ao calcular empréstimo."
    });
  }
});




router.post("/emprestimos/contratos", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { createLoanContract } = require("../services/finance/finance-loans.service");
    const payload = await createLoanContract(adminSupabase, req.body || {});
    return res.status(201).json(payload);
  } catch (error) {
    console.error("[finance.emprestimos.create]", error);
    return res.status(400).json({
      message: error.message || "Erro ao cadastrar empréstimo."
    });
  }
});


router.patch("/emprestimos/contratos/:id/parcelas/:number", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { markInstallmentStatus } = require("../services/finance/finance-loans.service");
    const payload = await markInstallmentStatus(
      adminSupabase,
      req.params.id,
      Number(req.params.number),
      req.body || {}
    );
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[finance.emprestimos.installment.update]", error);
    return res.status(400).json({
      message: error.message || "Erro ao atualizar parcela."
    });
  }
});







router.put("/emprestimos/contratos/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const contract = await updateLoanContract(adminSupabase, req.params.id, req.body || {});
    return res.json({ contract });
  } catch (error) {
    return res.status(400).json({
      message: `Erro ao atualizar contrato: ${error.message}`,
    });
  }
});

router.post("/emprestimos/contratos/:id/quitacao-preview", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const quote = await previewSettlement(
      adminSupabase,
      req.params.id,
      req.body?.settlement_date
    );
    return res.json({ quote });
  } catch (error) {
    return res.status(400).json({
      message: `Erro ao simular quitação: ${error.message}`,
    });
  }
});

router.post("/emprestimos/contratos/:id/encerrar", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await applySettlement(adminSupabase, req.params.id, req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      message: `Erro ao encerrar contrato: ${error.message}`,
    });
  }
});







router.delete("/emprestimos/contratos/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteLoanContract(adminSupabase, req.params.id);
    return res.json({ deleted });
  } catch (error) {
    return res.status(400).json({
      message: `Erro ao excluir contrato: ${error.message}`,
    });
  }
});


router.get("/fluxo-caixa", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { getCashFlowYear } = require("../services/finance/finance-cash-flow.service");
    const year = Number(req.query.year || new Date().getFullYear());
    const payload = await getCashFlowYear(adminSupabase, year);
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      message: error?.message || "Erro ao carregar fluxo de caixa.",
    });
  }
});

router.post("/fluxo-caixa", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { createCashFlowEntry } = require("../services/finance/finance-cash-flow.service");
    const entry = await createCashFlowEntry(adminSupabase, req.body || {});
    return res.status(201).json({ entry });
  } catch (error) {
    return res.status(400).json({
      message: error?.message || "Erro ao criar lançamento de fluxo de caixa.",
    });
  }
});

router.put("/fluxo-caixa/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { updateCashFlowEntry } = require("../services/finance/finance-cash-flow.service");
    const entry = await updateCashFlowEntry(adminSupabase, req.params.id, req.body || {});
    return res.json({ entry });
  } catch (error) {
    return res.status(400).json({
      message: error?.message || "Erro ao atualizar lançamento de fluxo de caixa.",
    });
  }
});

router.delete("/fluxo-caixa/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { deleteCashFlowEntry } = require("../services/finance/finance-cash-flow.service");
    const result = await deleteCashFlowEntry(adminSupabase, req.params.id);
    return res.json({ deleted: result });
  } catch (error) {
    return res.status(400).json({
      message: error?.message || "Erro ao excluir lançamento de fluxo de caixa.",
    });
  }
});



router.get("/dre", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const payload = await getDreYear(adminSupabase, year);
    return res.json(payload);
  } catch (error) {
    console.error("Erro ao carregar DRE:", error);
    return res.status(500).json({
      message: error?.message || "Erro ao carregar DRE.",
    });
  }
});

router.put("/dre/settings", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = await upsertDreSettings(adminSupabase, req.body || {});
    return res.json(data);
  } catch (error) {
    console.error("Erro ao salvar configurações DRE:", error);
    return res.status(500).json({
      message: error?.message || "Erro ao salvar configurações do DRE.",
    });
  }
});

router.post("/dre/manual-entries", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = await createDreManualEntry(adminSupabase, req.body || {});
    return res.status(201).json(data);
  } catch (error) {
    console.error("Erro ao criar lançamento manual do DRE:", error);
    return res.status(500).json({
      message: error?.message || "Erro ao criar lançamento manual do DRE.",
    });
  }
});

router.put("/dre/manual-entries/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = await updateDreManualEntry(adminSupabase, req.params.id, req.body || {});
    return res.json(data);
  } catch (error) {
    console.error("Erro ao atualizar lançamento manual do DRE:", error);
    return res.status(500).json({
      message: error?.message || "Erro ao atualizar lançamento manual do DRE.",
    });
  }
});

router.delete("/dre/manual-entries/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = await deleteDreManualEntry(adminSupabase, req.params.id);
    return res.json(data);
  } catch (error) {
    console.error("Erro ao excluir lançamento manual do DRE:", error);
    return res.status(500).json({
      message: error?.message || "Erro ao excluir lançamento manual do DRE.",
    });
  }
});


router.get("/planejamento/resumo", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const payload = await getPlanningSummary(adminSupabase, year);
    return res.json(payload);
  } catch (error) {
    console.error("finance.planejamento.resumo.error", error);
    return res.status(500).json({
      message: "Erro ao carregar resumo do Planejamento.",
      detail: error.message,
    });
  }
});

router.get("/planejamento/indicadores", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const payload = await getPlanningIndicators(adminSupabase, year);
    return res.json(payload);
  } catch (error) {
    console.error("finance.planejamento.indicadores.error", error);
    return res.status(500).json({
      message: "Erro ao carregar indicadores do Planejamento.",
      detail: error.message,
    });
  }
});

router.put("/planejamento/indicadores", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const payload = await upsertPlanningIndicators(adminSupabase, req.body || {}, userId);
    return res.json(payload);
  } catch (error) {
    console.error("finance.planejamento.indicadores.put.error", error);
    return res.status(500).json({
      message: "Erro ao salvar indicadores do Planejamento.",
      detail: error.message,
    });
  }
});


router.get("/planejamento/metas", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const payload = await getPlanningMonthlyGoals(adminSupabase, year);
    return res.json(payload);
  } catch (error) {
    console.error("finance.planejamento.metas.list.error", error);
    return res.status(500).json({
      message: "Erro ao carregar metas mensais do Planejamento.",
      detail: error.message,
    });
  }
});

router.put("/planejamento/metas", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.user?.id || req.profile?.id || null;
    const payload = await upsertPlanningMonthlyGoal(adminSupabase, req.body, userId);
    return res.json(payload);
  } catch (error) {
    console.error("finance.planejamento.metas.upsert.error", error);
    return res.status(500).json({
      message: "Erro ao salvar meta mensal do Planejamento.",
      detail: error.message,
    });
  }
});

router.delete("/planejamento/metas/:year/:month", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const payload = await deletePlanningMonthlyGoal(
      adminSupabase,
      req.params.year,
      req.params.month
    );
    return res.json(payload);
  } catch (error) {
    console.error("finance.planejamento.metas.delete.error", error);
    return res.status(500).json({
      message: "Erro ao remover meta mensal do Planejamento.",
      detail: error.message,
    });
  }
});


module.exports = router;

function extractFinanceValues(row) {
  if (Array.isArray(row?.values)) return row.values;
  if (Array.isArray(row?.row_data)) return row.row_data;
  if (Array.isArray(row?.row)) return row.row;
  return [];
}

function normalizeFinanceCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return String(value).replace(/\s+/g, " ").trim();
}

function isMeaningfulFinanceCell(value) {
  const normalized = normalizeFinanceCell(value);
  if (normalized === "") return false;
  if (typeof normalized === "number") return true;
  return normalized !== "-" && normalized !== "—";
}

function isFinanceRowEmpty(row) {
  const values = extractFinanceValues(row);
  return !values.some(isMeaningfulFinanceCell);
}

function isFinanceTitleRow(row) {
  const values = extractFinanceValues(row).map(normalizeFinanceCell);
  const meaningfulValues = values.filter(isMeaningfulFinanceCell);

  if (meaningfulValues.length === 0) return false;

  const first = String(meaningfulValues[0] || "").toLowerCase();
  const firstRaw = String(meaningfulValues[0] || "");

  const looksLikeMainTitle =
    first.includes("fluxo de caixa") ||
    first.includes("projeção anual") ||
    first.includes("projecao anual") ||
    first.includes("demonstração do resultado") ||
    first.includes("demonstracao do resultado") ||
    first.includes("dre -") ||
    first.includes("gestão de custos") ||
    first.includes("gestao de custos") ||
    first.includes("custos fixos e variáveis") ||
    first.includes("custos fixos e variaveis") ||
    first.includes("controle de empréstimos") ||
    first.includes("controle de emprestimos") ||
    first.includes("resumo dos empréstimos") ||
    first.includes("resumo dos emprestimos") ||
    first.includes("💰") ||
    first.includes("📑");

  const looksLikeDescription =
    first.includes("acompanhe entradas") ||
    first.includes("identifique meses críticos") ||
    first.includes("identifique meses criticos") ||
    first.includes("planeje sua liquidez") ||
    first.includes("apuração mensal") ||
    first.includes("apuracao mensal") ||
    first.includes("resultado contábil da empresa") ||
    first.includes("resultado contabil da empresa");

  const onlyFirstCellFilled = meaningfulValues.length === 1;
  const longSentence =
    firstRaw.length >= 45 &&
    (firstRaw.includes(".") || firstRaw.includes(",") || firstRaw.includes(":"));

  return (
    (looksLikeMainTitle && meaningfulValues.length <= 2) ||
    (looksLikeDescription && onlyFirstCellFilled) ||
    (onlyFirstCellFilled && longSentence)
  );
}

function scoreFinanceHeader(values) {
  const cells = values.map(normalizeFinanceCell);
  let score = 0;

  for (const cell of cells) {
    if (!cell) continue;
    const lower = String(cell).toLowerCase();

    if (
      lower.includes("conta") ||
      lower.includes("descr") ||
      lower.includes("categoria") ||
      lower.includes("tipo") ||
      lower.includes("jan") ||
      lower.includes("fev") ||
      lower.includes("mar") ||
      lower.includes("abr") ||
      lower.includes("mai") ||
      lower.includes("jun") ||
      lower.includes("jul") ||
      lower.includes("ago") ||
      lower.includes("set") ||
      lower.includes("out") ||
      lower.includes("nov") ||
      lower.includes("dez") ||
      lower.includes("total") ||
      lower.includes("real") ||
      lower.includes("orçado") ||
      lower.includes("orcado")
    ) {
      score += 2;
    } else {
      score += 0.15;
    }
  }

  return score;
}

function detectFinanceHeaderIndex(rows) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const values = extractFinanceValues(rows[i]);
    const score = scoreFinanceHeader(values);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function buildFinanceHeaders(row) {
  const values = extractFinanceValues(row);
  return values.map((value, index) => {
    const normalized = normalizeFinanceCell(value);
    return normalized || `Coluna ${index + 1}`;
  });
}

function formatFinanceSheetPayload(sheetName, allRows, latestBatch) {
  const prefilteredRows = allRows.filter(
    (row) => !isFinanceRowEmpty(row) && !isFinanceTitleRow(row)
  );

  const headerIndex = detectFinanceHeaderIndex(prefilteredRows);
  const headerRow = prefilteredRows[headerIndex] || { row_number: null };
  const headers = buildFinanceHeaders(headerRow);

  const rows = prefilteredRows
    .filter((_, index) => index !== headerIndex)
    .filter((row) => !isFinanceRowEmpty(row) && !isFinanceTitleRow(row))
    .map((row, index) => ({
      id: row.id || `${sheetName}-${row.row_number || index + 1}`,
      row_number: row.row_number ?? index + 1,
      values: extractFinanceValues(row).map(normalizeFinanceCell),
    }));

  return {
    batch_id: latestBatch.id,
    source_file_name: latestBatch.source_file_name,
    source_version: latestBatch.source_version,
    import_status: latestBatch.import_status,
    sheet_name: sheetName,
    row_count: rows.length,
    header_row_number: headerRow?.row_number ?? null,
    headers,
    rows,
  };
}
