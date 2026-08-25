import { createClient } from "@supabase/supabase-js";

const url =
  (typeof process !== "undefined"
    ? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    : "");
const serviceRole =
  (typeof process !== "undefined" ? process.env.SUPABASE_SERVICE_ROLE_KEY || "" : "");

export const supabaseAdmin =
  url && serviceRole
    ? createClient(url, serviceRole, { auth: { persistSession: false } })
    : null;

function env(key: string, def = "") {
  return (typeof process !== "undefined" && process.env[key]) || def;
}

// ---------- Fetchers ----------
async function fetchYearSpan(table: string, yearStart: number, yearEnd: number) {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from(table).select("*")
      .gte("year", yearStart).lte("year", yearEnd).limit(5000);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

async function fetchAll(table: string, limit = 2000) {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin.from(table).select("*").limit(limit);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

async function fetchActive(table: string, statusCol = "status") {
  const rows = await fetchAll(table);
  const ok = new Set(["active","ativo","vigente","em_dia","aberto","open","current","1","true"]);
  return rows.filter((r: any) => ok.has(String(r[statusCol] ?? "").toLowerCase()));
}

// ---------- Normalizadores ----------
export function normCashType(t: any): "in" | "out" | "other" {
  const v = String(t ?? "").toLowerCase().trim();
  if (["in","entrada","receita","receitas","income","credit","cr","c","+"].includes(v)) return "in";
  if (["out","saida","saída","despesa","despesas","expense","debit","db","d","-"].includes(v)) return "out";
  return "other";
}

export function normDreSec(s: any): "revenue" | "expense" | "other" {
  const v = String(s ?? "").toLowerCase().trim();
  if (["revenue","receita","receitas","income","credit","cr","entradas"].includes(v)) return "revenue";
  if (["expense","despesa","despesas","custo","custos","cost","debit","db","saidas","saídas"].includes(v)) return "expense";
  return "other";
}

// ---------- Sums ----------
export type CFTotals = { receita: number; despesa: number; outros: number; saldo: number; count: number };
export function sumCF(rows: any[]): CFTotals {
  const t: CFTotals = { receita: 0, despesa: 0, outros: 0, saldo: 0, count: rows.length };
  for (const r of rows) {
    const amt = Number(r.amount ?? r.valor ?? 0);
    const k = normCashType(r.type ?? r.tipo);
    if (k === "in") t.receita += amt; else if (k === "out") t.despesa += amt; else t.outros += amt;
  }
  t.saldo = t.receita - t.despesa;
  return t;
}

export type DRETotals = {
  receitas: number; despesas: number; resultado: number; linhas: number;
  receita_operacional: number; receita_financeira: number;
  custo_operacional: number; desp_operacional: number; desp_financeira: number;
};
export function sumDRE(rows: any[]): DRETotals {
  const t: DRETotals = {
    receitas: 0, despesas: 0, resultado: 0, linhas: rows.length,
    receita_operacional: 0, receita_financeira: 0,
    custo_operacional: 0, desp_operacional: 0, desp_financeira: 0
  };
  for (const r of rows) {
    const amt = Number(r.amount ?? r.valor ?? 0);
    const sec = normDreSec(r.section ?? r.secao ?? r.seção);
    const lk = String(r.line_key ?? r.lineKey ?? "").toLowerCase();
    const isFin = lk.includes("financ") || lk.includes("juro") || lk.includes("rend");
    const isCust = lk.includes("custo") || lk.includes("cmv") || lk.includes("produto") || lk.includes("insumo");
    if (sec === "revenue") {
      t.receitas += amt;
      if (isFin) t.receita_financeira += amt; else t.receita_operacional += amt;
    } else if (sec === "expense") {
      t.despesas += amt;
      if (isFin) t.desp_financeira += amt;
      else if (isCust) t.custo_operacional += amt;
      else t.desp_operacional += amt;
    }
  }
  t.resultado = t.receitas - t.despesas;
  return t;
}

export function sumCosts(rows: any[]) {
  const t = {
    total: 0, fixos: 0, variaveis: 0,
    por_categoria: {} as Record<string, number>,
    por_status: {} as Record<string, number>,
    count: rows.length, items: rows.slice(0, 30)
  };
  for (const r of rows) {
    const amt = Number(r.monthly_amount ?? r.amount ?? r.valor ?? 0);
    const ct = String(r.cost_type ?? "").toLowerCase();
    const cat = String(r.category ?? "outros").trim() || "outros";
    const st  = String(r.status ?? "active");
    t.total += amt;
    if (ct.includes("fix") || ct === "f") t.fixos += amt;
    else if (ct.includes("var") || ct === "v") t.variaveis += amt;
    t.por_categoria[cat] = (t.por_categoria[cat] ?? 0) + amt;
    t.por_status[st]       = (t.por_status[st]  ?? 0) + amt;
  }
  return t;
}

export function sumPlanning(rows: any[]) {
  const t = { count: rows.length, metas_total: 0, realizado_total: 0, items: rows.slice(0, 30) };
  for (const r of rows) {
    t.metas_total     += Number(r.target ?? r.goal ?? r.meta ?? 0);
    t.realizado_total += Number(r.actual ?? r.realized ?? r.realizado ?? 0);
  }
  return t;
}

export type LoanTotals = {
  total: number; ativos: number;
  parcela_mes: number; saldo_total: number;
  cet_medio_anual: number;
  by_status: Record<string, { count: number; parcela: number; saldo: number }>;
  all: any[];
};
export function sumLoans(rows: any[]): LoanTotals {
  const t: LoanTotals = {
    total: rows.length, ativos: 0,
    parcela_mes: 0, saldo_total: 0,
    cet_medio_anual: 0,
    by_status: {}, all: rows
  };
  let soma = 0, n = 0;
  const activeSet = new Set(["active","ativo","vigente","em_dia","aberto","open","current"]);
  for (const r of rows) {
    const parc  = Number(r.current_installment_amount ?? r.installment_amount ?? r.parcela ?? 0);
    const saldo = Number(r.balance_outstanding ?? r.saldo ?? r.outstanding_balance ?? 0);
    const taxaMes = Number(r.annual_rate ? r.annual_rate / 12 : r.monthly_rate ?? 0);
    const iof     = Number(r.iof ?? 0);
    const fees    = Number(r.fees ?? 0);
    const cetAnual = taxaMes > 0
      ? (Math.pow(1 + taxaMes + (iof + fees) / Math.max(saldo, 1), 12) - 1) * 100
      : 0;
    const st = String(r.status ?? "").toLowerCase() || "(vazio)";
    t.by_status[st] = t.by_status[st] ?? { count: 0, parcela: 0, saldo: 0 };
    t.by_status[st].count   += 1;
    t.by_status[st].parcela += parc;
    t.by_status[st].saldo   += saldo;
    if (activeSet.has(st)) {
      t.ativos += 1;
      t.parcela_mes += parc;
      t.saldo_total += saldo;
      if (cetAnual > 0) { soma += cetAnual; n += 1; }
    }
  }
  t.cet_medio_anual = n > 0 ? soma / n : 0;
  return t;
}

// ---------- Análise financeira ----------
export function calcMargins(receita: number, custo_op: number, desp_op: number, desp_fin: number) {
  const bruto  = receita - custo_op;
  const ebitda = receita - custo_op - desp_op;
  const liquido = receita - custo_op - desp_op - desp_fin;
  const safe = (v: number) => receita > 0 ? (v / receita) * 100 : null;
  return {
    margem_bruta_val:    bruto,
    margem_bruta_pct:    safe(bruto),
    ebitda_val:          ebitda,
    ebitda_pct:          safe(ebitda),
    margem_liquida_val:  liquido,
    margem_liquida_pct:  safe(liquido)
  };
}

export function dscr(caixa_op_mes: number, servico_divida_mes: number): number | null {
  if (servico_divida_mes <= 0) return null;
  return caixa_op_mes / servico_divida_mes;
}

export function projecaoCaixa(saldoNow: number, medEntradas: number, medSaidas: number, meses: number) {
  const liq = medEntradas - medSaidas;
  const futuro = saldoNow + liq * meses;
  const deficitMeses = liq < 0 ? Math.ceil(saldoNow / Math.abs(liq)) : null;
  return { saldo_futuro: futuro, variacao_mensal_media: liq, meses_ate_deficit: deficitMeses };
}

export function pctChange(now: number, before: number): number | null {
  if (!isFinite(now) || !isFinite(before) || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

export function mean(nums: number[]) {
  const v = nums.filter((x) => Number.isFinite(x));
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

export function stddev(nums: number[]) {
  const v = nums.filter((x) => Number.isFinite(x));
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

export function anomalia(atual: number, historico: number[]) {
  const m = mean(historico), s = stddev(historico);
  const limite = m + 2 * s;
  return { is_anomalia: atual > limite && s > 0, limite_sup: limite, media: m, desvio: s };
}

// Simulador de cenários
export function simularCenario(receita: number, custos: number, pctReceita: number, pctCustos: number) {
  const novaReceita = receita * (1 + pctReceita);
  const novoCustos  = custos  * (1 + pctCustos);
  const novoLucro   = novaReceita - novoCustos;
  return { receita: novaReceita, custos: novoCustos, lucro: novoLucro, delta_lucro: novoLucro - (receita - custos) };
}

// ---------- Histórico 12 meses ----------
export async function loadHistorico12m(tabs: { cashflow: string; dre: string; costs: string }) {
  const now = new Date();
  const meses: Array<{ year: number; month: number; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
    meses.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      label: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    });
  }
  const anoInicio = meses[0].year, anoFim = meses[meses.length - 1].year;
  const [cfRows, dreRows, costsRows] = await Promise.all([
    fetchYearSpan(tabs.cashflow, anoInicio, anoFim),
    fetchYearSpan(tabs.dre,      anoInicio, anoFim),
    fetchActive(tabs.costs, "status")
  ]);
  const cf = meses.map(m => sumCF(
    cfRows.filter((r: any) => Number(r.year) === m.year && Number(r.month) === m.month)
  ));
  const dre = meses.map(m => sumDRE(
    dreRows.filter((r: any) => Number(r.year) === m.year && Number(r.month) === m.month)
  ));
  const cust = sumCosts(costsRows);
  const custos_mensais = meses.map(() => cust.total);
  return { cashflow: cf, dre, custos_mensais, labels: meses.map(m => m.label) };
}

// ---------- Admin guard ----------
type AdminGuard =
  | { ok: true;  user: { id: string; email: string; role: string; tenant: string | null } }
  | { ok: false; status: number; reason: string };

export async function checkAdminFromRequest(req: Request): Promise<AdminGuard> {
  if (!supabaseAdmin) return { ok: false, status: 500, reason: "supabase_admin_not_configured" };
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : "";
  if (!token) return { ok: false, status: 401, reason: "missing_token" };
  const { data: ud, error: ue } = await supabaseAdmin.auth.getUser(token);
  if (ue || !ud?.user) return { ok: false, status: 401, reason: "invalid_token" };
  const email = ud.user.email || "";
  const profileTable = env("FINANCE_AI_PROFILE_TABLE", "profiles");
  const roleCol = env("FINANCE_AI_ROLE_COLUMN", "role");
  const tenantCol = env("FINANCE_AI_TENANT_COLUMN", "none");
  const { data: prof, error: pe } = await supabaseAdmin.from(profileTable).select("*").eq("email", email).maybeSingle();
  if (pe)    return { ok: false, status: 500, reason: "profile_lookup_error" };
  if (!prof) return { ok: false, status: 403, reason: "profile_not_found" };
  const role = String(prof[roleCol] ?? "").toLowerCase();
  if (role !== "admin") return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true, user: { id: ud.user.id, email, role, tenant: tenantCol !== "none" ? prof[tenantCol] : null } };
}

function previousPeriod(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function buildTabs() {
  return {
    cashflow: env("FINANCE_AI_CASHFLOW_TABLE", "finance_cash_flow_entries"),
    dre:      env("FINANCE_AI_DRE_TABLE",      "finance_dre_manual_entries"),
    costs:    env("FINANCE_AI_COSTS_TABLE",    "finance_cost_entries"),
    planning: env("FINANCE_AI_PLANNING_TABLE", "finance_planning_goals"),
    loans:    env("FINANCE_AI_LOANS_TABLE",    "finance_loan_contracts")
  };
}

export async function loadFinanceContextFull(year: number, month: number) {
  const tabs = buildTabs();
  const prev = previousPeriod(year, month);

  const fetchMonth = async (tab: string, y: number, m: number) => {
    const rows = await fetchYearSpan(tab, y, y);
    return rows.filter((r: any) => Number(r.month) === m);
  };

  const [cfNowRows, dreNowRows, costs, loans, planning, cfPrevRows, drePrevRows] = await Promise.all([
    fetchMonth(tabs.cashflow, year, month),
    fetchMonth(tabs.dre,      year, month),
    fetchActive(tabs.costs, "status"),
    fetchAll(tabs.loans),
    fetchAll(tabs.planning),
    fetchMonth(tabs.cashflow, prev.year, prev.month),
    fetchMonth(tabs.dre,      prev.year, prev.month)
  ]);

  const histo = await loadHistorico12m(tabs);

  return {
    periodo: `${year}-${String(month).padStart(2, "0")}`,
    periodo_anterior: `${prev.year}-${String(prev.month).padStart(2, "0")}`,
    tables: tabs,
    now: {
      cashflow: sumCF(cfNowRows),
      dre: sumDRE(dreNowRows),
      costs: sumCosts(costs),
      loans: sumLoans(loans),
      planning: sumPlanning(planning),
      brutas: { cashflow: cfNowRows, dre: dreNowRows, loans, costs, planning }
    },
    anterior: {
      cashflow: sumCF(cfPrevRows),
      dre:      sumDRE(drePrevRows)
    },
    historico: histo
  };
}

export async function logFinanceAiEvent(rec: Record<string, any>) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("finance_ai_audit_log").insert({
      user_id:          rec.userId ?? null,
      user_email:       rec.userEmail ?? null,
      action:           rec.action,
      period_ref:       rec.period ?? null,
      prompt:           rec.prompt ?? null,
      response_excerpt: rec.responseSummary ?? null,
      modules_used:     rec.modulesUsed ?? [],
      meta:             rec.meta ?? {}
    });
  } catch { /* auditoria nunca pode quebrar */ }
}
