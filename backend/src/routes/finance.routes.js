const express = require("express");
const { processImportedBatch } = require("../services/finance/finance-process-batch.service");
const router = express.Router();
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

module.exports = router;
