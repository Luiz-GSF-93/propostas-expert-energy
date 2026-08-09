const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return res.status(401).json({ message: "Token de autenticação não informado." });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ message: "Token inválido ou sessão expirada." });
    }

    req.user = data.user;
    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Falha ao validar autenticação.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getSettings() {
  const { data, error } = await supabase
    .from("finance_cost_settings")
    .select("*")
    .eq("singleton_key", "default")
    .single();

  if (error) throw error;
  return data;
}

async function getEntries() {
  const { data, error } = await supabase
    .from("finance_cost_entries")
    .select("*")
    .eq("status", "ativo")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function normalizeEntry(row, estimatedRevenue) {
  const category = row.category === "variavel" ? "variavel" : "fixo";
  const monthlyAmount = toNumber(row.monthly_amount);
  const percentageRate = toNumber(row.percentage_rate);

  const monthlyImpact =
    category === "fixo"
      ? monthlyAmount
      : estimatedRevenue * (percentageRate / 100);

  return {
    id: row.id,
    category,
    description: row.description || "",
    cost_type: row.cost_type || "",
    supplier: row.supplier || "",
    due_day: row.due_day ?? null,
    monthly_amount: monthlyAmount,
    percentage_rate: percentageRate,
    monthly_impact: monthlyImpact,
    status: row.status || "ativo",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function buildDashboardPayload(settings, rows) {
  const estimatedRevenue = toNumber(settings?.estimated_revenue);

  const normalized = rows.map((row) => normalizeEntry(row, estimatedRevenue));

  const totalFixedAmount = normalized
    .filter((item) => item.category === "fixo")
    .reduce((sum, item) => sum + item.monthly_amount, 0);

  const totalVariablePercent = normalized
    .filter((item) => item.category === "variavel")
    .reduce((sum, item) => sum + item.percentage_rate, 0);

  const totalVariableAmount = estimatedRevenue * (totalVariablePercent / 100);
  const totalCosts = totalFixedAmount + totalVariableAmount;

  const entries = normalized.map((item) => ({
    ...item,
    fractional_percent: totalCosts > 0 ? (item.monthly_impact / totalCosts) * 100 : 0,
  }));

  const topFiveCosts = [...entries]
    .sort((a, b) => b.monthly_impact - a.monthly_impact)
    .slice(0, 5);

  return {
    settings: {
      estimated_revenue: estimatedRevenue,
    },
    summary: {
      total_fixed_amount: totalFixedAmount,
      total_variable_percent: totalVariablePercent,
      total_variable_amount: totalVariableAmount,
      total_costs: totalCosts,
      total_entries: entries.length,
      fixed_entries: entries.filter((item) => item.category === "fixo").length,
      variable_entries: entries.filter((item) => item.category === "variavel").length,
    },
    top_five_costs: topFiveCosts,
    entries,
  };
}

function parseEntryPayload(body) {
  const category = body?.category === "variavel" ? "variavel" : "fixo";
  const description = String(body?.description || "").trim();
  const costType = String(body?.cost_type || "").trim();
  const supplier = String(body?.supplier || "").trim() || null;

  const dueDayRaw = body?.due_day;
  const dueDay =
    dueDayRaw === null || dueDayRaw === undefined || dueDayRaw === ""
      ? null
      : Math.min(Math.max(Number(dueDayRaw), 1), 31);

  const monthlyAmount = toNumber(body?.monthly_amount);
  const percentageRate = toNumber(body?.percentage_rate);

  if (!description) {
    const error = new Error("Descrição é obrigatória.");
    error.statusCode = 400;
    throw error;
  }

  if (!costType) {
    const error = new Error("Tipo é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (category === "fixo" && monthlyAmount <= 0) {
    const error = new Error("Para custo fixo, informe um valor mensal maior que zero.");
    error.statusCode = 400;
    throw error;
  }

  if (category === "variavel" && percentageRate <= 0) {
    const error = new Error("Para custo variável, informe um percentual maior que zero.");
    error.statusCode = 400;
    throw error;
  }

  return {
    category,
    description,
    cost_type: costType,
    supplier,
    due_day: category === "fixo" ? dueDay : null,
    monthly_amount: category === "fixo" ? monthlyAmount : 0,
    percentage_rate: category === "variavel" ? percentageRate : 0,
    updated_at: new Date().toISOString(),
  };
}

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const [settings, entries] = await Promise.all([getSettings(), getEntries()]);
    return res.json(buildDashboardPayload(settings, entries));
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao carregar dashboard de custos.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/entries", requireAuth, async (req, res) => {
  try {
    const entries = await getEntries();
    return res.json({ entries });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao carregar lançamentos de custos.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({ settings });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao carregar configurações de custos.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

router.put("/settings", requireAuth, async (req, res) => {
  try {
    const estimatedRevenue = toNumber(req.body?.estimated_revenue);

    const { data, error } = await supabase
      .from("finance_cost_settings")
      .upsert(
        {
          singleton_key: "default",
          estimated_revenue: estimatedRevenue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "singleton_key" }
      )
      .select("*")
      .single();

    if (error) throw error;

    return res.json({
      message: "Configuração de faturamento estimado salva com sucesso.",
      settings: data,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao salvar faturamento estimado.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/entries", requireAuth, async (req, res) => {
  try {
    const payload = {
      ...parseEntryPayload(req.body),
      status: "ativo",
    };

    const { data, error } = await supabase
      .from("finance_cost_entries")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return res.status(201).json({
      message: "Custo cadastrado com sucesso.",
      entry: data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error instanceof Error ? error.message : "Erro ao cadastrar custo.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

router.put("/entries/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!id) {
      return res.status(400).json({ message: "ID do lançamento não informado." });
    }

    const payload = parseEntryPayload(req.body);

    const { data, error } = await supabase
      .from("finance_cost_entries")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return res.json({
      message: "Lançamento atualizado com sucesso.",
      entry: data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error instanceof Error ? error.message : "Erro ao atualizar lançamento.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete("/entries/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!id) {
      return res.status(400).json({ message: "ID do lançamento não informado." });
    }

    const { data, error } = await supabase
      .from("finance_cost_entries")
      .update({
        status: "inativo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,status")
      .single();

    if (error) throw error;

    return res.json({
      message: "Lançamento excluído com sucesso.",
      entry: data,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao excluir lançamento.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

module.exports = router;
