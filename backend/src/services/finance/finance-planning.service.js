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


const PLANNING_ACTION_CATEGORIES = [
  "Marketing",
  "Vendas",
  "Compras",
  "Tecnologia",
  "Produto",
  "Operações",
  "Infraestrutura",
  "Outros",
];

const PLANNING_ACTION_STATUSES = [
  "Planejado",
  "Não Iniciado",
  "Em Andamento",
  "Aguardando",
  "Inviável",
  "Concluído",
];

const PLANNING_ACTION_IMPACT_TYPES = ["financeiro", "reducao_custos"];

function planningSanitizeShortText(value, maxLength = 200) {
  if (value == null) return "";
  return String(value).trim().slice(0, maxLength);
}

function planningSanitizeLongText(value, maxLength = 4000) {
  if (value == null) return "";
  return String(value).trim().slice(0, maxLength);
}

function planningSanitizeDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? raw : null;
}

function planningValidateEnum(value, allowedValues, fallbackValue) {
  const normalized = String(value ?? "").trim();
  return allowedValues.includes(normalized) ? normalized : fallbackValue;
}

function planningComputePaybackMonths(investmentAmount, expectedImpactAmount) {
  const investment = planningSanitizeMoney(investmentAmount);
  const impact = planningSanitizeMoney(expectedImpactAmount);

  if (investment <= 0 || impact <= 0) return null;
  return Number((investment / impact).toFixed(2));
}

function planningNormalizeActionPlanRow(row) {
  const investmentAmount = planningSanitizeMoney(row?.investment_amount);
  const expectedImpactAmount = planningSanitizeMoney(row?.expected_impact_amount);

  return {
    id: row?.id || null,
    reference_year: planningSanitizeYear(row?.reference_year),
    initiative: planningSanitizeShortText(row?.initiative, 200),
    category: planningValidateEnum(row?.category, PLANNING_ACTION_CATEGORIES, "Outros"),
    owner_name: planningSanitizeShortText(row?.owner_name, 160),
    start_date: planningSanitizeDate(row?.start_date),
    end_date: planningSanitizeDate(row?.end_date),
    investment_amount: investmentAmount,
    expected_impact_amount: expectedImpactAmount,
    impact_type: planningValidateEnum(row?.impact_type, PLANNING_ACTION_IMPACT_TYPES, "financeiro"),
    payback_months: planningComputePaybackMonths(investmentAmount, expectedImpactAmount),
    status: planningValidateEnum(row?.status, PLANNING_ACTION_STATUSES, "Planejado"),
    notes: planningSanitizeLongText(row?.notes, 4000),
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
    created_by: row?.created_by || null,
    updated_by: row?.updated_by || null,
  };
}

async function getPlanningActionPlans(adminSupabase, year = getCurrentYear()) {
  const normalizedYear = planningSanitizeYear(year);

  const { data, error } = await adminSupabase
    .from("planejamento_plano_acao")
    .select("id, reference_year, initiative, category, owner_name, start_date, end_date, investment_amount, expected_impact_amount, impact_type, status, notes, created_at, updated_at, created_by, updated_by")
    .eq("reference_year", normalizedYear)
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao carregar plano de ação: ${error.message}`);
  }

  const items = (data || []).map(planningNormalizeActionPlanRow);

  const summary = items.reduce(
    (acc, item) => {
      acc.total_items += 1;
      acc.total_investment_amount += item.investment_amount;
      acc.total_expected_impact_amount += item.expected_impact_amount;
      acc.status_breakdown[item.status] = (acc.status_breakdown[item.status] || 0) + 1;

      if (typeof item.payback_months === "number" && Number.isFinite(item.payback_months)) {
        acc.payback_sum += item.payback_months;
        acc.payback_count += 1;
      }

      return acc;
    },
    {
      total_items: 0,
      total_investment_amount: 0,
      total_expected_impact_amount: 0,
      status_breakdown: {},
      payback_sum: 0,
      payback_count: 0,
    }
  );

  return {
    year: normalizedYear,
    items,
    summary: {
      total_items: summary.total_items,
      total_investment_amount: summary.total_investment_amount,
      total_expected_impact_amount: summary.total_expected_impact_amount,
      average_payback_months:
        summary.payback_count > 0
          ? Number((summary.payback_sum / summary.payback_count).toFixed(2))
          : null,
      status_breakdown: summary.status_breakdown,
    },
    options: {
      categories: PLANNING_ACTION_CATEGORIES,
      statuses: PLANNING_ACTION_STATUSES,
      impact_types: PLANNING_ACTION_IMPACT_TYPES,
    },
  };
}

async function upsertPlanningActionPlan(adminSupabase, payload, userId = null) {
  const id = planningSanitizeShortText(payload?.id, 80) || null;
  const referenceYear = planningSanitizeYear(payload?.reference_year);
  const row = {
    reference_year: referenceYear,
    initiative: planningSanitizeShortText(payload?.initiative, 200),
    category: planningValidateEnum(payload?.category, PLANNING_ACTION_CATEGORIES, "Outros"),
    owner_name: planningSanitizeShortText(payload?.owner_name, 160),
    start_date: planningSanitizeDate(payload?.start_date),
    end_date: planningSanitizeDate(payload?.end_date),
    investment_amount: planningSanitizeMoney(payload?.investment_amount),
    expected_impact_amount: planningSanitizeMoney(payload?.expected_impact_amount),
    impact_type: planningValidateEnum(payload?.impact_type, PLANNING_ACTION_IMPACT_TYPES, "financeiro"),
    status: planningValidateEnum(payload?.status, PLANNING_ACTION_STATUSES, "Planejado"),
    notes: planningSanitizeLongText(payload?.notes, 4000),
    updated_by: userId || null,
  };

  if (!row.initiative) {
    throw new Error("A iniciativa é obrigatória no Plano de Ação.");
  }

  if (id) {
    const { error } = await adminSupabase
      .from("planejamento_plano_acao")
      .update(row)
      .eq("id", id);

    if (error) {
      throw new Error(`Erro ao atualizar plano de ação: ${error.message}`);
    }
  } else {
    const { error } = await adminSupabase
      .from("planejamento_plano_acao")
      .insert({
        ...row,
        created_by: userId || null,
      });

    if (error) {
      throw new Error(`Erro ao criar plano de ação: ${error.message}`);
    }
  }

  return getPlanningActionPlans(adminSupabase, referenceYear);
}

async function deletePlanningActionPlan(adminSupabase, id) {
  const normalizedId = planningSanitizeShortText(id, 80);

  if (!normalizedId) {
    throw new Error("ID inválido para remoção do plano de ação.");
  }

  const { data: existing, error: existingError } = await adminSupabase
    .from("planejamento_plano_acao")
    .select("id, reference_year")
    .eq("id", normalizedId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Erro ao localizar plano de ação: ${existingError.message}`);
  }

  if (!existing) {
    throw new Error("Plano de ação não encontrado.");
  }

  const { error } = await adminSupabase
    .from("planejamento_plano_acao")
    .delete()
    .eq("id", normalizedId);

  if (error) {
    throw new Error(`Erro ao remover plano de ação: ${error.message}`);
  }

  return getPlanningActionPlans(adminSupabase, existing.reference_year || getCurrentYear());
}


const PLANNING_COMMERCIAL_GOAL_TYPES = ["Contrato Recorrente", "Contrato Avulso"];

function planningSanitizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function planningComputeWorkingCapital(monthlyFixedCost) {
  const fixed = planningSanitizeMoney(monthlyFixedCost);
  return Number((fixed * 3).toFixed(2));
}

function planningComputePerformancePercent(goalAmount, actualAmount) {
  const goal = planningSanitizeMoney(goalAmount);
  const actual = planningSanitizeMoney(actualAmount);
  if (goal <= 0) return 0;
  return Number(((actual / goal) * 100).toFixed(2));
}

function planningNormalizeProjectionRow(row) {
  const revenueAmount = planningSanitizeMoney(row?.revenue_amount);
  const netProfitAmount = planningSanitizeMoney(row?.net_profit_amount);
  const netMarginPercent = planningSanitizeMoney(row?.net_margin_percent);
  const monthlyFixedCost = planningSanitizeMoney(row?.monthly_fixed_cost);
  const employeeCount = planningSanitizeInteger(row?.employee_count, 0);
  const workingCapitalAmount = planningSanitizeMoney(
    row?.working_capital_amount || planningComputeWorkingCapital(monthlyFixedCost)
  );

  return {
    id: row?.id || null,
    base_year: planningSanitizeYear(row?.base_year),
    projection_year: planningSanitizeYear(row?.projection_year),
    revenue_amount: revenueAmount,
    net_profit_amount: netProfitAmount,
    net_margin_percent: netMarginPercent,
    monthly_fixed_cost: monthlyFixedCost,
    employee_count: employeeCount,
    working_capital_amount: workingCapitalAmount,
    notes: planningSanitizeLongText(row?.notes, 4000),
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
    created_by: row?.created_by || null,
    updated_by: row?.updated_by || null,
  };
}

async function getPlanningProjections(adminSupabase, baseYear = getCurrentYear()) {
  const normalizedBaseYear = planningSanitizeYear(baseYear);

  const summary = await getPlanningSummary(adminSupabase, normalizedBaseYear);

  const { data, error } = await adminSupabase
    .from("planejamento_projecoes")
    .select("id, base_year, projection_year, revenue_amount, net_profit_amount, net_margin_percent, monthly_fixed_cost, employee_count, working_capital_amount, notes, created_at, updated_at, created_by, updated_by")
    .eq("base_year", normalizedBaseYear)
    .order("projection_year", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar projeções plurianuais: ${error.message}`);
  }

  const rowMap = new Map((data || []).map((row) => [Number(row.projection_year), row]));
  const years = [normalizedBaseYear, normalizedBaseYear + 1, normalizedBaseYear + 2];

  const items = years.map((year, index) => {
    const row = rowMap.get(year);
    const isCurrentYear = year === normalizedBaseYear;

    const normalized = isCurrentYear
      ? {
          id: row?.id || null,
          base_year: normalizedBaseYear,
          projection_year: year,
          revenue_amount: planningSanitizeMoney(summary?.cards?.faturamento_anual),
          net_profit_amount: planningSanitizeMoney(summary?.cards?.lucro_liquido_anual),
          net_margin_percent: planningSanitizeMoney(summary?.cards?.margem_liquida_percent),
          monthly_fixed_cost: planningSanitizeMoney(summary?.cards?.custo_fixo_mensal),
          employee_count: planningSanitizeInteger(row?.employee_count, 0),
          working_capital_amount: planningComputeWorkingCapital(summary?.cards?.custo_fixo_mensal),
          notes: planningSanitizeLongText(row?.notes, 4000),
          created_at: row?.created_at || null,
          updated_at: row?.updated_at || null,
          created_by: row?.created_by || null,
          updated_by: row?.updated_by || null,
        }
      : planningNormalizeProjectionRow({
          ...row,
          base_year: normalizedBaseYear,
          projection_year: year,
        });

    const previous = index > 0 ? years[index - 1] : null;
    const previousItem = previous ? rowMap.get(previous) : null;

    return {
      ...normalized,
      is_auto_current_year: isCurrentYear,
      revenue_delta_amount: null,
      revenue_delta_percent: null,
      net_profit_delta_amount: null,
      net_profit_delta_percent: null,
      monthly_fixed_cost_delta_amount: null,
      monthly_fixed_cost_delta_percent: null,
      working_capital_delta_amount: null,
      working_capital_delta_percent: null,
    };
  });

  for (let i = 1; i < items.length; i += 1) {
    const current = items[i];
    const previous = items[i - 1];

    const delta = (curr, prev) => Number((curr - prev).toFixed(2));
    const percent = (curr, prev) => {
      if (!prev) return 0;
      return Number((((curr - prev) / prev) * 100).toFixed(2));
    };

    current.revenue_delta_amount = delta(current.revenue_amount, previous.revenue_amount);
    current.revenue_delta_percent = previous.revenue_amount ? percent(current.revenue_amount, previous.revenue_amount) : 0;
    current.net_profit_delta_amount = delta(current.net_profit_amount, previous.net_profit_amount);
    current.net_profit_delta_percent = previous.net_profit_amount ? percent(current.net_profit_amount, previous.net_profit_amount) : 0;
    current.monthly_fixed_cost_delta_amount = delta(current.monthly_fixed_cost, previous.monthly_fixed_cost);
    current.monthly_fixed_cost_delta_percent = previous.monthly_fixed_cost ? percent(current.monthly_fixed_cost, previous.monthly_fixed_cost) : 0;
    current.working_capital_delta_amount = delta(current.working_capital_amount, previous.working_capital_amount);
    current.working_capital_delta_percent = previous.working_capital_amount ? percent(current.working_capital_amount, previous.working_capital_amount) : 0;
  }

  return {
    base_year: normalizedBaseYear,
    items,
  };
}

async function upsertPlanningProjection(adminSupabase, payload, userId = null) {
  const baseYear = planningSanitizeYear(payload?.base_year || payload?.reference_year || getCurrentYear());
  const projectionYear = planningSanitizeYear(payload?.projection_year);
  const currentYear = baseYear;

  const row = {
    base_year: baseYear,
    projection_year: projectionYear,
    revenue_amount: planningSanitizeMoney(payload?.revenue_amount),
    net_profit_amount: planningSanitizeMoney(payload?.net_profit_amount),
    net_margin_percent: planningSanitizeMoney(payload?.net_margin_percent),
    monthly_fixed_cost: planningSanitizeMoney(payload?.monthly_fixed_cost),
    employee_count: planningSanitizeInteger(payload?.employee_count, 0),
    working_capital_amount: planningComputeWorkingCapital(payload?.monthly_fixed_cost),
    notes: planningSanitizeLongText(payload?.notes, 4000),
    updated_by: userId || null,
  };

  if (projectionYear === currentYear) {
    row.revenue_amount = planningSanitizeMoney(payload?.revenue_amount);
    row.net_profit_amount = planningSanitizeMoney(payload?.net_profit_amount);
    row.net_margin_percent = planningSanitizeMoney(payload?.net_margin_percent);
    row.monthly_fixed_cost = planningSanitizeMoney(payload?.monthly_fixed_cost);
    row.working_capital_amount = planningComputeWorkingCapital(row.monthly_fixed_cost);
  }

  const { error } = await adminSupabase
    .from("planejamento_projecoes")
    .upsert(
      {
        ...row,
        created_by: userId || null,
      },
      {
        onConflict: "base_year,projection_year",
        ignoreDuplicates: false,
      }
    );

  if (error) {
    throw new Error(`Erro ao salvar projeção plurianual: ${error.message}`);
  }

  return getPlanningProjections(adminSupabase, baseYear);
}

async function deletePlanningProjection(adminSupabase, id) {
  const normalizedId = planningSanitizeShortText(id, 80);

  const { data: existing, error: existingError } = await adminSupabase
    .from("planejamento_projecoes")
    .select("id, base_year")
    .eq("id", normalizedId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Erro ao localizar projeção: ${existingError.message}`);
  }

  if (!existing) {
    throw new Error("Projeção não encontrada.");
  }

  const { error } = await adminSupabase
    .from("planejamento_projecoes")
    .delete()
    .eq("id", normalizedId);

  if (error) {
    throw new Error(`Erro ao remover projeção: ${error.message}`);
  }

  return getPlanningProjections(adminSupabase, existing.base_year || getCurrentYear());
}

function planningNormalizeCommercialRow(row, year, month, goalType) {
  const goalAmount = planningSanitizeMoney(row?.goal_amount);
  const actualAmount = planningSanitizeMoney(row?.actual_amount);
  const performancePercent = planningComputePerformancePercent(goalAmount, actualAmount);

  return {
    id: row?.id || null,
    reference_year: planningSanitizeYear(row?.reference_year || year),
    reference_month: planningSanitizeInteger(row?.reference_month || month, month),
    month_label: PLANNING_MONTH_LABELS[month - 1] || String(month),
    goal_type: planningValidateEnum(row?.goal_type || goalType, PLANNING_COMMERCIAL_GOAL_TYPES, "Contrato Recorrente"),
    goal_amount: goalAmount,
    actual_amount: actualAmount,
    performance_percent: performancePercent,
    notes: planningSanitizeLongText(row?.notes, 4000),
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
    created_by: row?.created_by || null,
    updated_by: row?.updated_by || null,
  };
}

async function getPlanningCommercialGoals(adminSupabase, year = getCurrentYear()) {
  const normalizedYear = planningSanitizeYear(year);

  const { data, error } = await adminSupabase
    .from("planejamento_meta_comercial")
    .select("id, reference_year, reference_month, goal_type, goal_amount, actual_amount, notes, created_at, updated_at, created_by, updated_by")
    .eq("reference_year", normalizedYear)
    .order("reference_month", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar metas comerciais: ${error.message}`);
  }

  const rowMap = new Map(
    (data || []).map((row) => [`${row.reference_month}-${row.goal_type}`, row])
  );

  const items = [];
  for (let month = 1; month <= 12; month += 1) {
    for (const goalType of PLANNING_COMMERCIAL_GOAL_TYPES) {
      const row = rowMap.get(`${month}-${goalType}`) || null;
      items.push(planningNormalizeCommercialRow(row, normalizedYear, month, goalType));
    }
  }

  const totals = items.reduce(
    (acc, item) => {
      const bucket = acc.by_type[item.goal_type] || {
        goal_amount: 0,
        actual_amount: 0,
        performance_percent: 0,
      };

      bucket.goal_amount += item.goal_amount;
      bucket.actual_amount += item.actual_amount;
      bucket.performance_percent = planningComputePerformancePercent(bucket.goal_amount, bucket.actual_amount);

      acc.by_type[item.goal_type] = bucket;
      acc.goal_amount += item.goal_amount;
      acc.actual_amount += item.actual_amount;
      acc.performance_percent = planningComputePerformancePercent(acc.goal_amount, acc.actual_amount);

      return acc;
    },
    {
      goal_amount: 0,
      actual_amount: 0,
      performance_percent: 0,
      by_type: {},
    }
  );

  return {
    year: normalizedYear,
    items,
    totals,
    goal_types: PLANNING_COMMERCIAL_GOAL_TYPES,
  };
}

async function upsertPlanningCommercialGoal(adminSupabase, payload, userId = null) {
  const referenceYear = planningSanitizeYear(payload?.reference_year);
  const referenceMonth = planningSanitizeMonth(payload?.reference_month);
  const goalType = planningValidateEnum(payload?.goal_type, PLANNING_COMMERCIAL_GOAL_TYPES, "Contrato Recorrente");

  const row = {
    reference_year: referenceYear,
    reference_month: referenceMonth,
    goal_type: goalType,
    goal_amount: planningSanitizeMoney(payload?.goal_amount),
    actual_amount: planningSanitizeMoney(payload?.actual_amount),
    notes: planningSanitizeLongText(payload?.notes, 4000),
    updated_by: userId || null,
    created_by: userId || null,
  };

  const { error } = await adminSupabase
    .from("planejamento_meta_comercial")
    .upsert(row, {
      onConflict: "reference_year,reference_month,goal_type",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Erro ao salvar meta comercial: ${error.message}`);
  }

  return getPlanningCommercialGoals(adminSupabase, referenceYear);
}

async function deletePlanningCommercialGoal(adminSupabase, id, fallbackYear = getCurrentYear()) {
  const normalizedId = planningSanitizeShortText(id, 80);

  const { data: existing, error: existingError } = await adminSupabase
    .from("planejamento_meta_comercial")
    .select("id, reference_year")
    .eq("id", normalizedId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Erro ao localizar meta comercial: ${existingError.message}`);
  }

  if (!existing) {
    throw new Error("Meta comercial não encontrada.");
  }

  const { error } = await adminSupabase
    .from("planejamento_meta_comercial")
    .delete()
    .eq("id", normalizedId);

  if (error) {
    throw new Error(`Erro ao remover meta comercial: ${error.message}`);
  }

  return getPlanningCommercialGoals(adminSupabase, existing.reference_year || fallbackYear);
}

async function getPlanningCommissionSettings(adminSupabase, year = getCurrentYear()) {
  const normalizedYear = planningSanitizeYear(year);

  const { data, error } = await adminSupabase
    .from("planejamento_comissoes")
    .select("id, reference_year, commission_percent, recurrent_goal_required_percent, notes, created_at, updated_at, created_by, updated_by")
    .eq("reference_year", normalizedYear)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar configuração de comissão: ${error.message}`);
  }

  const commercial = await getPlanningCommercialGoals(adminSupabase, normalizedYear);
  const recurring = commercial?.totals?.by_type?.["Contrato Recorrente"] || {
    goal_amount: 0,
    actual_amount: 0,
    performance_percent: 0,
  };

  const commissionPercent = planningSanitizeMoney(data?.commission_percent);
  const recurrentGoalRequiredPercent = planningSanitizeMoney(data?.recurrent_goal_required_percent || 100);

  const eligible = recurring.performance_percent >= recurrentGoalRequiredPercent;
  const commissionAmount = eligible
    ? Number(((recurring.actual_amount * commissionPercent) / 100).toFixed(2))
    : 0;

  return {
    id: data?.id || null,
    reference_year: normalizedYear,
    commission_percent: commissionPercent,
    recurrent_goal_required_percent: recurrentGoalRequiredPercent,
    notes: planningSanitizeLongText(data?.notes, 4000),
    recurring_goal_amount: recurring.goal_amount,
    recurring_actual_amount: recurring.actual_amount,
    recurring_performance_percent: recurring.performance_percent,
    eligible,
    commission_amount: commissionAmount,
  };
}

async function upsertPlanningCommissionSettings(adminSupabase, payload, userId = null) {
  const referenceYear = planningSanitizeYear(payload?.reference_year);

  const row = {
    reference_year: referenceYear,
    commission_percent: planningSanitizeMoney(payload?.commission_percent),
    recurrent_goal_required_percent: planningSanitizeMoney(payload?.recurrent_goal_required_percent || 100),
    notes: planningSanitizeLongText(payload?.notes, 4000),
    updated_by: userId || null,
    created_by: userId || null,
  };

  const { error } = await adminSupabase
    .from("planejamento_comissoes")
    .upsert(row, {
      onConflict: "reference_year",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Erro ao salvar configuração de comissão: ${error.message}`);
  }

  return getPlanningCommissionSettings(adminSupabase, referenceYear);
}

function planningComputeFourteenthFactor(achievementPercent) {
  const percent = planningSanitizeMoney(achievementPercent);
  if (percent < 50) return 0;
  return Number((percent / 100).toFixed(2));
}

async function getPlanningFourteenth(adminSupabase, year = getCurrentYear()) {
  const normalizedYear = planningSanitizeYear(year);

  const { data, error } = await adminSupabase
    .from("planejamento_decimo_quarto")
    .select("id, reference_year, achievement_percent, salary_base_amount, projected_payment_amount, notes, created_at, updated_at, created_by, updated_by")
    .eq("reference_year", normalizedYear)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar 14º salário: ${error.message}`);
  }

  const monthlyGoals = await getPlanningMonthlyGoals(adminSupabase, normalizedYear);
  const achievementPercent = planningSanitizeMoney(
    monthlyGoals?.totals?.achieved_percent || data?.achievement_percent || 0
  );
  const salaryBaseAmount = planningSanitizeMoney(data?.salary_base_amount);
  const factor = planningComputeFourteenthFactor(achievementPercent);
  const projectedPaymentAmount = Number((salaryBaseAmount * factor).toFixed(2));

  let ruleLabel = "Sem pagamento";
  if (achievementPercent >= 100) {
    ruleLabel = "Pagamento integral ou proporcional ao excedente";
  } else if (achievementPercent >= 50) {
    ruleLabel = "Pagamento proporcional";
  }

  return {
    id: data?.id || null,
    reference_year: normalizedYear,
    achievement_percent: achievementPercent,
    salary_base_amount: salaryBaseAmount,
    factor,
    projected_payment_amount: projectedPaymentAmount,
    notes: planningSanitizeLongText(data?.notes, 4000),
    rule_label: ruleLabel,
  };
}

async function upsertPlanningFourteenth(adminSupabase, payload, userId = null) {
  const referenceYear = planningSanitizeYear(payload?.reference_year);
  const monthlyGoals = await getPlanningMonthlyGoals(adminSupabase, referenceYear);
  const achievementPercent = planningSanitizeMoney(monthlyGoals?.totals?.achieved_percent || 0);
  const salaryBaseAmount = planningSanitizeMoney(payload?.salary_base_amount);
  const factor = planningComputeFourteenthFactor(achievementPercent);
  const projectedPaymentAmount = Number((salaryBaseAmount * factor).toFixed(2));

  const row = {
    reference_year: referenceYear,
    achievement_percent: achievementPercent,
    salary_base_amount: salaryBaseAmount,
    projected_payment_amount: projectedPaymentAmount,
    notes: planningSanitizeLongText(payload?.notes, 4000),
    updated_by: userId || null,
    created_by: userId || null,
  };

  const { error } = await adminSupabase
    .from("planejamento_decimo_quarto")
    .upsert(row, {
      onConflict: "reference_year",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Erro ao salvar 14º salário: ${error.message}`);
  }

  return getPlanningFourteenth(adminSupabase, referenceYear);
}

module.exports = {
  getPlanningSummary,
  getPlanningIndicators,
  upsertPlanningIndicators,
  getPlanningMonthlyGoals,
  upsertPlanningMonthlyGoal,
  deletePlanningMonthlyGoal,
  getPlanningActionPlans,
  upsertPlanningActionPlan,
  deletePlanningActionPlan,
  getPlanningProjections,
  upsertPlanningProjection,
  deletePlanningProjection,
  getPlanningCommercialGoals,
  upsertPlanningCommercialGoal,
  deletePlanningCommercialGoal,
  getPlanningCommissionSettings,
  upsertPlanningCommissionSettings,
  getPlanningFourteenth,
  upsertPlanningFourteenth,
};
