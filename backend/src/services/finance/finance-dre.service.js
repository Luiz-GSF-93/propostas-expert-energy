const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const REVENUE_CATEGORIES = new Set([
  "vendas_vista",
  "vendas_prazo",
  "vendas_recorrentes",
  "outras_receitas",
]);

const EXCLUDED_REVENUE_CATEGORIES = new Set([
  "receitas_financeiras",
  "receita_financiamento",
]);

const MANUAL_LINE_TO_BUCKET = {
  receita_manual: "receita_manual",
  impostos_manual: "impostos_manual",
  cmv_manual: "cmv_manual",
  despesa_administrativa_manual: "despesas_administrativas",
  despesa_pessoal_manual: "despesas_pessoal",
  despesa_vendas_manual: "despesas_vendas",
  despesa_marketing_manual: "despesas_marketing",
  despesa_infra_manual: "despesas_infraestrutura",
  despesa_financeira_manual: "despesas_financeiras",
  receita_financeira_manual: "receitas_financeiras",
  depreciacao_amortizacao_manual: "depreciacao_amortizacao",
  irpj_csll: "irpj_csll",
  custom: "custom",
};

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Number(toNumber(value).toFixed(2));
}

function safeText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isTruthyActive(status) {
  const raw = normalizeText(status);
  return ["ativo", "active", "aberto", "open"].includes(raw);
}

function createMonthMap() {
  return Object.fromEntries(MONTHS.map((month) => [month, 0]));
}

function sumMonthMap(monthMap) {
  return round2(
    MONTHS.reduce((sum, month) => sum + toNumber(monthMap[month]), 0)
  );
}

function monthArrayFromMap(monthMap) {
  return MONTHS.map((month) => round2(monthMap[month] || 0));
}

function totalPercent(total, base) {
  if (!base) return 0;
  return round2((toNumber(total) / toNumber(base)) * 100);
}

function addToMonthMap(monthMap, month, value) {
  const key = Number(month);
  if (!MONTHS.includes(key)) return;
  monthMap[key] = round2((monthMap[key] || 0) + toNumber(value));
}

function pickKeywordBucket(entry) {
  const category = normalizeText(entry.category);
  const costType = normalizeText(entry.cost_type);
  const description = normalizeText(entry.description);
  const supplier = normalizeText(entry.supplier);
  const text = [category, costType, description, supplier].join(" ");

  if (
    text.includes("materia-prima") ||
    text.includes("materia prima") ||
    text.includes("cmv")
  ) {
    return "cmv";
  }

  if (
    text.includes("salario") ||
    text.includes("salarios") ||
    text.includes("folha") ||
    text.includes("pro-labore") ||
    text.includes("pro labore") ||
    text.includes("pró-labore") ||
    text.includes("socios") ||
    text.includes("sócios")
  ) {
    return "despesas_pessoal";
  }

  if (
    text.includes("comissao") ||
    text.includes("comissões") ||
    text.includes("comissoes") ||
    text.includes("cartao") ||
    text.includes("cartão") ||
    text.includes("frete") ||
    text.includes("embalagem")
  ) {
    return "despesas_vendas";
  }

  if (
    text.includes("marketing") ||
    text.includes("ads") ||
    text.includes("divulgacao") ||
    text.includes("divulgação") ||
    text.includes("trafego") ||
    text.includes("tráfego")
  ) {
    return "despesas_marketing";
  }

  // Administrativas: SOMENTE os tipos informados pelo usuário
  if (
    (
      category.includes("fixo") ||
      text.includes("fixo")
    ) &&
    (
      text.includes("aluguel") ||
      text.includes("contabilidade") ||
      text.includes("limpeza") ||
      text.includes("conservacao") ||
      text.includes("conservação") ||
      text.includes("material de escritorio") ||
      text.includes("material de escritório") ||
      text.includes("internet") ||
      text.includes("sindicato") ||
      text.includes("classe profissional") ||
      text.includes("cesta bancaria") ||
      text.includes("cesta bancária") ||
      text.includes("convenio medico") ||
      text.includes("convênio médico") ||
      text.includes("software") ||
      text.includes("sistema") ||
      text.includes("assessoria juridica") ||
      text.includes("assessoria jurídica") ||
      text.includes("juridica") ||
      text.includes("jurídica") ||
      text.includes("servico m2m") ||
      text.includes("serviço m2m") ||
      text.includes("m2m") ||
      text.includes("telefone") ||
      text.includes("outros fixos") ||
      text.includes("condominio") ||
      text.includes("condomínio") ||
      text.includes("predial") ||
      text.includes("seguro") ||
      text.includes("energia eletrica") ||
      text.includes("energia elétrica")
    )
  ) {
    return "despesas_administrativas";
  }

  if (
    text.includes("agua") ||
    text.includes("água") ||
    text.includes("manutencao") ||
    text.includes("manutenção")
  ) {
    return "despesas_infraestrutura";
  }

  if (
    text.includes("juros") ||
    text.includes("emprestimo") ||
    text.includes("empréstimo") ||
    text.includes("banco") ||
    text.includes("financiamento") ||
    text.includes("cesta bancaria") ||
    text.includes("cesta bancária")
  ) {
    return "despesas_financeiras";
  }

  if (
    text.includes("receita financeira") ||
    text.includes("rendimento") ||
    text.includes("aplicacao financeira") ||
    text.includes("aplicação financeira")
  ) {
    return "receitas_financeiras";
  }

  if (
    text.includes("depreciacao") ||
    text.includes("depreciação") ||
    text.includes("amortizacao") ||
    text.includes("amortização")
  ) {
    return "depreciacao_amortizacao";
  }

  // Fallback mais seguro: evita inflar administrativas
  if (category.includes("variavel")) {
    return "despesas_vendas";
  }

  if (category.includes("fixo")) {
    return "despesas_infraestrutura";
  }

  return "despesas_infraestrutura";
}

function getCostEntryMonthlyAmount(entry, receitaBrutaMes) {
  const monthlyAmount = toNumber(entry.monthly_amount || entry.amount);
  const percentageRate = toNumber(entry.percentage_rate);

  if (percentageRate > 0) {
    return round2((toNumber(receitaBrutaMes) * percentageRate) / 100);
  }

  return round2(monthlyAmount);
}

async function readFirstExistingTable(adminSupabase, candidates, select, applyQuery) {
  let lastError = null;

  for (const table of candidates) {
    let query = adminSupabase.from(table).select(select);

    if (typeof applyQuery === "function") {
      query = applyQuery(query);
    }

    const { data, error } = await query;

    if (!error) {
      return { table, data: data || [] };
    }

    lastError = error;
  }

  if (lastError) throw lastError;
  return { table: null, data: [] };
}

function createManualBuckets() {
  return {
    receita_manual: createMonthMap(),
    impostos_manual: createMonthMap(),
    cmv_manual: createMonthMap(),
    despesas_administrativas: createMonthMap(),
    despesas_pessoal: createMonthMap(),
    despesas_vendas: createMonthMap(),
    despesas_marketing: createMonthMap(),
    despesas_infraestrutura: createMonthMap(),
    despesas_financeiras: createMonthMap(),
    receitas_financeiras: createMonthMap(),
    depreciacao_amortizacao: createMonthMap(),
    irpj_csll: createMonthMap(),
    custom_add: createMonthMap(),
    custom_subtract: createMonthMap(),
  };
}

function applyManualEntries(manualEntries) {
  const buckets = createManualBuckets();

  for (const entry of manualEntries) {
    const bucket = MANUAL_LINE_TO_BUCKET[entry.line_key] || "custom";
    const month = Number(entry.month);
    const amount = toNumber(entry.amount);

    if (bucket === "custom") {
      if (entry.operator === "subtract") {
        addToMonthMap(buckets.custom_subtract, month, amount);
      } else {
        addToMonthMap(buckets.custom_add, month, amount);
      }
      continue;
    }

    addToMonthMap(buckets[bucket], month, amount);
  }

  return buckets;
}

function buildRows(monthly, annualReceitaBruta) {
  const makeRow = (label, key) => {
    const monthMap = monthly[key] || createMonthMap();
    const total = sumMonthMap(monthMap);
    return {
      key,
      label,
      months: monthArrayFromMap(monthMap),
      total,
      percent: totalPercent(total, annualReceitaBruta),
    };
  };

  return [
    makeRow("(=) Receita Bruta de Vendas", "receita_bruta"),
    makeRow("(-) Impostos", "impostos"),
    makeRow("(=) Receita Líquida", "receita_liquida"),
    makeRow("(-) Custo das Mercadorias Vendidas (CMV)", "cmv"),
    makeRow("(=) Lucro Bruto", "lucro_bruto"),
    makeRow("(-) Despesas Administrativas", "despesas_administrativas"),
    makeRow("(-) Despesas com Pessoal", "despesas_pessoal"),
    makeRow("(-) Despesas com Vendas", "despesas_vendas"),
    makeRow("(-) Despesas de Marketing", "despesas_marketing"),
    makeRow("(-) Despesas com Infraestrutura", "despesas_infraestrutura"),
    makeRow("(-) Despesas Financeiras", "despesas_financeiras"),
    makeRow("(+) Receitas Financeiras", "receitas_financeiras"),
    makeRow("(-) Depreciação e Amortização", "depreciacao_amortizacao"),
    makeRow("(=) LAJIR / EBIT", "ebit"),
    makeRow("(-) IRPJ + CSLL", "irpj_csll"),
    makeRow("(=) Lucro Líquido do Exercício", "lucro_liquido"),
    makeRow("(=) Margem Líquida (%)", "margem_liquida_percent"),
  ];
}

function getRoicHint(roic) {
  if (roic > 20) return "ROIC acima de 20%: excelente";
  if (roic > 15) return "ROIC acima de 15%: muito bom";
  if (roic >= 10) return "ROIC entre 10% e 15%: bom";
  if (roic < 8) return "ROIC abaixo de 8%: geralmente baixo";
  return "ROIC em faixa intermediária";
}

async function getDreYear(adminSupabase, year) {
  const targetYear = Number(year);

  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
    throw new Error("Ano inválido para DRE.");
  }

  const [
    { data: settings },
    { data: manualEntries },
    { data: cashFlowEntries },
    { data: costEntries, error: costEntriesError },
  ] = await Promise.all([
    adminSupabase
      .from("finance_dre_settings")
      .select("*")
      .eq("year", targetYear)
      .maybeSingle(),
    adminSupabase
      .from("finance_dre_manual_entries")
      .select("*")
      .eq("year", targetYear)
      .eq("active", true)
      .order("month", { ascending: true })
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("finance_cash_flow_entries")
      .select("*")
      .eq("year", targetYear)
      .eq("active", true)
      .order("month", { ascending: true })
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("finance_cost_entries")
      .select("*"),
  ]);

  if (costEntriesError) {
    throw costEntriesError;
  }

  const taxPercent = toNumber(settings?.tax_percent);
  const investedCapital = toNumber(settings?.invested_capital);
  const equityValue = toNumber(settings?.equity_value);
  const cashFlow = cashFlowEntries || [];
  const costs = Array.isArray(costEntries) ? costEntries : [];
  const activeCosts = costs.filter((item) => isTruthyActive(item.status));
  const manual = manualEntries || [];
  const manualBuckets = applyManualEntries(manual);

  const monthly = {
    receita_bruta: createMonthMap(),
    impostos: createMonthMap(),
    receita_liquida: createMonthMap(),
    cmv: createMonthMap(),
    lucro_bruto: createMonthMap(),
    despesas_administrativas: createMonthMap(),
    despesas_pessoal: createMonthMap(),
    despesas_vendas: createMonthMap(),
    despesas_marketing: createMonthMap(),
    despesas_infraestrutura: createMonthMap(),
    despesas_financeiras: createMonthMap(),
    receitas_financeiras: createMonthMap(),
    depreciacao_amortizacao: createMonthMap(),
    ebit: createMonthMap(),
    irpj_csll: createMonthMap(),
    lucro_liquido: createMonthMap(),
    margem_liquida_percent: createMonthMap(),
    ebitda: createMonthMap(),
  };

  // Receita bruta do Fluxo de Caixa
  for (const entry of cashFlow) {
    const month = Number(entry.month);
    const type = safeText(entry.type).toLowerCase();
    const category = safeText(entry.category);

    if (type !== "receita") continue;
    if (EXCLUDED_REVENUE_CATEGORIES.has(category)) continue;
    if (!REVENUE_CATEGORIES.has(category)) continue;

    addToMonthMap(monthly.receita_bruta, month, entry.amount);
  }

  // Inclui receitas manuais adicionais
  for (const month of MONTHS) {
    addToMonthMap(monthly.receita_bruta, month, manualBuckets.receita_manual[month]);
  }

  // Custos por bucket
  for (const costEntry of activeCosts) {
    const bucket = pickKeywordBucket(costEntry);





    for (const month of MONTHS) {
      const receitaBrutaMes = monthly.receita_bruta[month];
      const value = getCostEntryMonthlyAmount(costEntry, receitaBrutaMes);
      addToMonthMap(monthly[bucket], month, value);
    }
  }

  // Aplicar ajustes manuais por linha
  for (const month of MONTHS) {
    addToMonthMap(monthly.impostos, month, manualBuckets.impostos_manual[month]);
    addToMonthMap(monthly.cmv, month, manualBuckets.cmv_manual[month]);
    addToMonthMap(monthly.despesas_administrativas, month, manualBuckets.despesas_administrativas[month]);
    addToMonthMap(monthly.despesas_pessoal, month, manualBuckets.despesas_pessoal[month]);
    addToMonthMap(monthly.despesas_vendas, month, manualBuckets.despesas_vendas[month]);
    addToMonthMap(monthly.despesas_marketing, month, manualBuckets.despesas_marketing[month]);
    addToMonthMap(monthly.despesas_infraestrutura, month, manualBuckets.despesas_infraestrutura[month]);
    addToMonthMap(monthly.despesas_financeiras, month, manualBuckets.despesas_financeiras[month]);
    addToMonthMap(monthly.receitas_financeiras, month, manualBuckets.receitas_financeiras[month]);
    addToMonthMap(monthly.depreciacao_amortizacao, month, manualBuckets.depreciacao_amortizacao[month]);
    addToMonthMap(monthly.irpj_csll, month, manualBuckets.irpj_csll[month]);
  }

  // Impostos automáticos + cálculos
  for (const month of MONTHS) {
    const receitaBruta = toNumber(monthly.receita_bruta[month]);
    const impostoAutomatico = round2((receitaBruta * taxPercent) / 100);
    addToMonthMap(monthly.impostos, month, impostoAutomatico);

    const receitaLiquida = round2(receitaBruta - toNumber(monthly.impostos[month]));
    monthly.receita_liquida[month] = receitaLiquida;

    const lucroBruto = round2(receitaLiquida - toNumber(monthly.cmv[month]));
    monthly.lucro_bruto[month] = lucroBruto;

    const ebit = round2(
      lucroBruto
      - toNumber(monthly.despesas_administrativas[month])
      - toNumber(monthly.despesas_pessoal[month])
      - toNumber(monthly.despesas_vendas[month])
      - toNumber(monthly.despesas_marketing[month])
      - toNumber(monthly.despesas_infraestrutura[month])
      - toNumber(monthly.despesas_financeiras[month])
      + toNumber(monthly.receitas_financeiras[month])
      - toNumber(monthly.depreciacao_amortizacao[month])
      + toNumber(manualBuckets.custom_add[month])
      - toNumber(manualBuckets.custom_subtract[month])
    );
    monthly.ebit[month] = ebit;

    const lucroLiquido = round2(ebit - toNumber(monthly.irpj_csll[month]));
    monthly.lucro_liquido[month] = lucroLiquido;

    monthly.margem_liquida_percent[month] = receitaBruta
      ? round2((lucroLiquido / receitaBruta) * 100)
      : 0;

    // seguindo a lógica usual: EBITDA = EBIT + depreciação/amortização
    monthly.ebitda[month] = round2(ebit + toNumber(monthly.depreciacao_amortizacao[month]));
  }

  const annualReceitaBruta = sumMonthMap(monthly.receita_bruta);
  const annualLucroBruto = sumMonthMap(monthly.lucro_bruto);
  const annualEbit = sumMonthMap(monthly.ebit);
  const annualDepreciacao = sumMonthMap(monthly.depreciacao_amortizacao);
  const annualEbitda = sumMonthMap(monthly.ebitda);
  const annualLucroLiquido = sumMonthMap(monthly.lucro_liquido);

  const annualLoanPayments = activeCosts
    .filter((item) => {
      const loanText =
        `${item?.cost_type || ""} ${item?.description || ""} ${item?.supplier || ""}`.toLowerCase();
      return loanText.includes("empréstimo") || loanText.includes("emprestimo");
    })
    .reduce((sum, item) => sum + (toNumber(item?.monthly_amount) * 12), 0);

  const cashFlowRows =
    typeof activeCashFlowEntries !== "undefined"
      ? activeCashFlowEntries
      : typeof cashFlowEntries !== "undefined"
      ? cashFlowEntries
      : [];

  const annualReceipts = (Array.isArray(cashFlowRows) ? cashFlowRows : [])
    .filter((entry) => {
      const type = String(entry?.type || "").toLowerCase();
      return type === "receita" || type === "entrada" || type === "income";
    })
    .reduce((sum, entry) => sum + toNumber(entry?.amount), 0);

  const annualFixedCostsFromCosts = activeCosts
    .filter((item) => String(item?.category || "").toLowerCase() === "fixo")
    .reduce((sum, item) => sum + (toNumber(item?.monthly_amount) * 12), 0);

  const cashClosingBalance = annualReceipts - annualFixedCostsFromCosts;
  const nopatAnnual = annualEbitda * (1 - taxPercent / 100);
  const capitalInvested = (equityValue + cashClosingBalance) - annualLoanPayments;
  const roicPercent = capitalInvested !== 0 ? (nopatAnnual / capitalInvested) * 100 : 0;

  const cards = {
    receita_bruta_anual: annualReceitaBruta,
    receita_bruta_media_mensal: round2(annualReceitaBruta / 12),
    lucro_bruto_anual: annualLucroBruto,
    lucro_bruto_media_mensal: round2(annualLucroBruto / 12),
    margem_bruta_percent: totalPercent(annualLucroBruto, annualReceitaBruta),
    ebitda_anual: annualEbitda,
    margem_ebitda_percent: totalPercent(annualEbitda, annualReceitaBruta),
    lucro_liquido_anual: annualLucroLiquido,
    lucro_liquido_media_mensal: round2(annualLucroLiquido / 12),
    margem_liquida_percent: totalPercent(annualLucroLiquido, annualReceitaBruta),
    roi_percent: investedCapital ? round2((annualLucroLiquido / investedCapital) * 100) : 0,
    ebit_anual: annualEbit,
    roic_percent: round2(roicPercent),
    roic_nopat_anual: round2(nopatAnnual),
    roic_capital_investido: round2(capitalInvested),
    roic_hint: getRoicHint(roicPercent),
    depreciacao_amortizacao_anual: annualDepreciacao,
  };

  const months = MONTHS.map((month) => ({
    month,
    label: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][month - 1],
    receita_bruta: round2(monthly.receita_bruta[month]),
    impostos: round2(monthly.impostos[month]),
    receita_liquida: round2(monthly.receita_liquida[month]),
    cmv: round2(monthly.cmv[month]),
    lucro_bruto: round2(monthly.lucro_bruto[month]),
    despesas_administrativas: round2(monthly.despesas_administrativas[month]),
    despesas_pessoal: round2(monthly.despesas_pessoal[month]),
    despesas_vendas: round2(monthly.despesas_vendas[month]),
    despesas_marketing: round2(monthly.despesas_marketing[month]),
    despesas_infraestrutura: round2(monthly.despesas_infraestrutura[month]),
    despesas_financeiras: round2(monthly.despesas_financeiras[month]),
    receitas_financeiras: round2(monthly.receitas_financeiras[month]),
    depreciacao_amortizacao: round2(monthly.depreciacao_amortizacao[month]),
    ebit: round2(monthly.ebit[month]),
    ebitda: round2(monthly.ebitda[month]),
    irpj_csll: round2(monthly.irpj_csll[month]),
    lucro_liquido: round2(monthly.lucro_liquido[month]),
    margem_liquida_percent: round2(monthly.margem_liquida_percent[month]),
  }));

  const rows = buildRows(monthly, annualReceitaBruta);

  return {
    year: targetYear,
    settings: {
      tax_percent: round2(taxPercent),
      invested_capital: round2(investedCapital),
      equity_value: round2(equityValue),
    },
    cards,
    months,
    rows,
    manual_entries: manual,
    sources: {
      cash_flow_table: "finance_cash_flow_entries",
      cost_table: "finance_cost_entries",
    },
  };
}

async function upsertDreSettings(adminSupabase, payload) {
  const year = Number(payload?.year);
  const tax_percent = round2(payload?.tax_percent);
  const invested_capital = round2(payload?.invested_capital);
  const equity_value = round2(payload?.equity_value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Ano inválido.");
  }

  const { data, error } = await adminSupabase
    .from("finance_dre_settings")
    .upsert(
      {
        year,
        tax_percent,
        invested_capital,
        equity_value,
        active: true,
      },
      { onConflict: "year" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createDreManualEntry(adminSupabase, payload) {
  const insertPayload = {
    year: Number(payload?.year),
    month: Number(payload?.month),
    section: payload?.section,
    line_key: payload?.line_key,
    operator: payload?.operator,
    description: safeText(payload?.description),
    amount: round2(payload?.amount),
    active: true,
  };

  const { data, error } = await adminSupabase
    .from("finance_dre_manual_entries")
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateDreManualEntry(adminSupabase, id, payload) {
  const updatePayload = {
    year: Number(payload?.year),
    month: Number(payload?.month),
    section: payload?.section,
    line_key: payload?.line_key,
    operator: payload?.operator,
    description: safeText(payload?.description),
    amount: round2(payload?.amount),
  };

  const { data, error } = await adminSupabase
    .from("finance_dre_manual_entries")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteDreManualEntry(adminSupabase, id) {
  const { data, error } = await adminSupabase
    .from("finance_dre_manual_entries")
    .update({ active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getDreYear,
  upsertDreSettings,
  createDreManualEntry,
  updateDreManualEntry,
  deleteDreManualEntry,
};
