const { getDreYear } = require("./finance-dre.service");

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round2(value) {
  return Number(toNumber(value).toFixed(2));
}

function getCurrentYear() {
  return new Date().getFullYear();
}

async function fetchLatestSnapshot(adminSupabase) {
  const { data, error } = await adminSupabase
    .from("financial_dashboard_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar snapshot financeiro: ${error.message}`);
  }

  return data || null;
}

async function fetchPlanningIndicators(adminSupabase, year) {
  const { data, error } = await adminSupabase
    .from("planejamento_indicadores")
    .select("*")
    .eq("reference_year", year)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar indicadores manuais do Planejamento: ${error.message}`);
  }

  return (
    data || {
      reference_year: year,
      recurring_clients: 0,
      average_ticket: 0,
      dark_mode: false,
      starts_collapsed: true,
      notes: "",
    }
  );
}

async function fetchMonthlyFixedCost(adminSupabase) {
  const { data, error } = await adminSupabase
    .from("finance_cost_entries")
    .select("category, status, monthly_amount")
    .eq("status", "ativo");

  if (error) {
    throw new Error(`Erro ao carregar custos fixos para Planejamento: ${error.message}`);
  }

  return round2(
    (data || [])
      .filter((row) => String(row.category || "").toLowerCase() === "fixo")
      .reduce((sum, row) => sum + toNumber(row.monthly_amount), 0)
  );
}

async function fetchPlanningIntegrations(adminSupabase, year) {
  const latestSnapshot = await fetchLatestSnapshot(adminSupabase);
  const manualIndicators = await fetchPlanningIndicators(adminSupabase, year);

  let drePayload = null;
  let dreError = null;

  try {
    drePayload = await getDreYear(adminSupabase, year);
  } catch (error) {
    dreError = error;
    console.error("[finance.planning.dre]", error);
  }

  let fixedCost = 0;
  let costsError = null;

  try {
    fixedCost = await fetchMonthlyFixedCost(adminSupabase);
  } catch (error) {
    costsError = error;
    console.error("[finance.planning.costs]", error);
  }

  const revenueAnnual = round2(
    drePayload?.cards?.receita_bruta_anual ??
      latestSnapshot?.gross_revenue ??
      0
  );

  const netProfitAnnual = round2(
    drePayload?.cards?.lucro_liquido_anual ??
      latestSnapshot?.net_profit ??
      0
  );

  const netMarginPercent = round2(
    drePayload?.cards?.margem_liquida_percent ??
      latestSnapshot?.net_margin ??
      0
  );

  const cashReserve = round2(
    latestSnapshot?.cash_balance ?? 0
  );

  const roiPercent = round2(
    drePayload?.cards?.roi_percent ?? 0
  );

  const notices = [];
  if (dreError) notices.push("API DRE indisponível no momento. Alguns indicadores podem usar fallback.");
  if (costsError) notices.push("API Custos indisponível no momento. Custo fixo pode estar zerado.");
  if (!latestSnapshot) notices.push("Snapshot financeiro não localizado. Indicadores de fallback podem estar incompletos.");

  return {
    year,
    latest_batch: latestSnapshot
      ? {
          snapshot_id: latestSnapshot.id,
          reference_year: latestSnapshot.reference_year,
          gross_revenue: round2(latestSnapshot.gross_revenue),
          created_at: latestSnapshot.created_at,
        }
      : null,
    integration_status: {
      dre_ok: !dreError,
      snapshot_ok: Boolean(latestSnapshot),
      costs_ok: !costsError,
    },
    cards: {
      faturamento_anual: revenueAnnual,
      lucro_liquido_anual: netProfitAnnual,
      margem_liquida_percent: netMarginPercent,
      reserva_caixa: cashReserve,
      roi_percent: roiPercent,
      clientes_recorrentes: Number(manualIndicators.recurring_clients || 0),
      ticket_medio: round2(manualIndicators.average_ticket),
      custo_fixo_mensal: fixedCost,
    },
    manual_indicators: {
      reference_year: year,
      recurring_clients: Number(manualIndicators.recurring_clients || 0),
      average_ticket: round2(manualIndicators.average_ticket),
      dark_mode: Boolean(manualIndicators.dark_mode),
      starts_collapsed: Boolean(manualIndicators.starts_collapsed),
      notes: manualIndicators.notes || "",
    },
    notices,
  };
}

async function getPlanningSummary(adminSupabase, year = getCurrentYear()) {
  return fetchPlanningIntegrations(adminSupabase, Number(year || getCurrentYear()));
}

async function getPlanningIndicators(adminSupabase, year = getCurrentYear()) {
  return fetchPlanningIndicators(adminSupabase, Number(year || getCurrentYear()));
}

async function upsertPlanningIndicators(adminSupabase, payload, userId = null) {
  const referenceYear = Number(payload?.reference_year || getCurrentYear());

  const upsertPayload = {
    reference_year: referenceYear,
    recurring_clients: Number(payload?.recurring_clients || 0),
    average_ticket: round2(payload?.average_ticket),
    dark_mode: Boolean(payload?.dark_mode),
    starts_collapsed: payload?.starts_collapsed !== false,
    notes: String(payload?.notes || ""),
    updated_by: userId || null,
  };

  if (!payload?.id) {
    upsertPayload.created_by = userId || null;
  }

  const { data, error } = await adminSupabase
    .from("planejamento_indicadores")
    .upsert(upsertPayload, { onConflict: "reference_year" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar indicadores do Planejamento: ${error.message}`);
  }

  return data;
}


const PLANNING_MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function planningSanitizeYear(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const year = Number.isFinite(parsed) ? parsed : getCurrentYear();
  return Math.min(Math.max(year, 2020), 2100);
}

function planningSanitizeMonth(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    throw new Error("Mês inválido para metas mensais.");
  }
  return parsed;
}

function planningSanitizeMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Number(value) : 0;
  if (typeof value === "string") {
    const normalized = value
      .replace(/\s/g, "")
      .replace(/R\$/gi, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function planningBuildMonthlyGoalStatus(metaAmount, actualAmount) {
  const meta = planningSanitizeMoney(metaAmount);
  const actual = planningSanitizeMoney(actualAmount);
  const difference = actual - meta;
  const achievedPercent = meta > 0 ? (actual / meta) * 100 : 0;

  if (meta <= 0) {
    return {
      difference_amount: difference,
      achieved_percent: 0,
      status_code: "sem_meta",
      status_icon: "—",
      status_label: "Sem meta",
    };
  }

  if (achievedPercent >= 100) {
    return {
      difference_amount: difference,
      achieved_percent: achievedPercent,
      status_code: "success",
      status_icon: "✅",
      status_label: "Meta atingida",
    };
  }

  if (achievedPercent >= 80) {
    return {
      difference_amount: difference,
      achieved_percent: achievedPercent,
      status_code: "warning",
      status_icon: "⚠️",
      status_label: "Atenção",
    };
  }

  return {
    difference_amount: difference,
    achieved_percent: achievedPercent,
    status_code: "danger",
    status_icon: "🔴",
    status_label: "Abaixo da meta",
  };
}

async function getPlanningMonthlyGoals(adminSupabase, year = getCurrentYear()) {
  const normalizedYear = planningSanitizeYear(year);

  const { data, error } = await adminSupabase
    .from("planejamento_metas_mensais")
    .select("id, reference_year, reference_month, meta_amount, actual_amount, notes, created_at, updated_at, created_by, updated_by")
    .eq("reference_year", normalizedYear)
    .order("reference_month", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar metas mensais: ${error.message}`);
  }

  const byMonth = new Map(
    (data || []).map((row) => [Number(row.reference_month), row])
  );

  const months = PLANNING_MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const row = byMonth.get(month) || null;
    const metaAmount = planningSanitizeMoney(row?.meta_amount);
    const actualAmount = planningSanitizeMoney(row?.actual_amount);
    const status = planningBuildMonthlyGoalStatus(metaAmount, actualAmount);

    return {
      id: row?.id || null,
      reference_year: normalizedYear,
      reference_month: month,
      month_label: label,
      meta_amount: metaAmount,
      actual_amount: actualAmount,
      difference_amount: status.difference_amount,
      achieved_percent: Number(status.achieved_percent.toFixed(2)),
      status_code: status.status_code,
      status_icon: status.status_icon,
      status_label: status.status_label,
      notes: row?.notes || "",
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null,
      created_by: row?.created_by || null,
      updated_by: row?.updated_by || null,
    };
  });

  const totals = months.reduce(
    (acc, item) => {
      acc.meta_amount += item.meta_amount;
      acc.actual_amount += item.actual_amount;
      return acc;
    },
    { meta_amount: 0, actual_amount: 0 }
  );

  totals.difference_amount = totals.actual_amount - totals.meta_amount;
  totals.achieved_percent =
    totals.meta_amount > 0
      ? Number(((totals.actual_amount / totals.meta_amount) * 100).toFixed(2))
      : 0;

  return {
    year: normalizedYear,
    months,
    totals,
  };
}

async function upsertPlanningMonthlyGoal(adminSupabase, payload, userId = null) {
  const referenceYear = planningSanitizeYear(payload?.reference_year);
  const referenceMonth = planningSanitizeMonth(payload?.reference_month);

  const row = {
    reference_year: referenceYear,
    reference_month: referenceMonth,
    meta_amount: planningSanitizeMoney(payload?.meta_amount),
    actual_amount: planningSanitizeMoney(payload?.actual_amount),
    notes: payload?.notes ? String(payload.notes).trim() : "",
    updated_by: userId || null,
    created_by: userId || null,
  };

  const { error } = await adminSupabase
    .from("planejamento_metas_mensais")
    .upsert(row, {
      onConflict: "reference_year,reference_month",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Erro ao salvar meta mensal: ${error.message}`);
  }

  return getPlanningMonthlyGoals(adminSupabase, referenceYear);
}

async function deletePlanningMonthlyGoal(adminSupabase, year, month) {
  const referenceYear = planningSanitizeYear(year);
  const referenceMonth = planningSanitizeMonth(month);

  const { error } = await adminSupabase
    .from("planejamento_metas_mensais")
    .delete()
    .eq("reference_year", referenceYear)
    .eq("reference_month", referenceMonth);

  if (error) {
    throw new Error(`Erro ao remover meta mensal: ${error.message}`);
  }

  return getPlanningMonthlyGoals(adminSupabase, referenceYear);
}

module.exports = {
  getPlanningSummary,
  getPlanningIndicators,
  upsertPlanningIndicators,
  getPlanningMonthlyGoals,
  upsertPlanningMonthlyGoal,
  deletePlanningMonthlyGoal,
};
