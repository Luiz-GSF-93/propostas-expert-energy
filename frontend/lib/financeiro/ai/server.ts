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

// ⚠️ Fluxo de caixa: NÃO filtra em 'active' (pode haver legado) e seleciona year+month sempre
async function selectMonth(table: string, year: number, month: number) {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from(table).select("*")
      .eq("year",  year)
      .eq("month", month)
      .limit(2000);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

// ⚠️ DRE: idem
async function selectDreMonth(table: string, year: number, month: number) {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from(table).select("*")
      .eq("year",  year)
      .eq("month", month)
      .limit(2000);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

// ⚠️ Custos: aceita múltiplos status (active/vigente/em_dia/...)
async function selectActive(table: string, statusCol = "status") {
  if (!supabaseAdmin) return [];
  try {
    // pega TUDO e filtra no servidor do nosso código, tolerante aos valores
    const { data, error } = await supabaseAdmin
      .from(table).select("*").limit(2000);
    if (error) return [];
    return (data || []).filter((r: any) => {
      const s = String(r[statusCol] ?? "").toLowerCase();
      return ["active","ativo","vigente","em_dia","aberto","open","current","1","true"].includes(s);
    });
  } catch { return []; }
}

// ⚠️ Empréstimos: aceita vários status, e captura TODOS para ter visão completa
async function selectAllLoans(table: string) {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from(table).select("*").limit(500);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

// ⚠️ Planning: tudo
async function selectAll(table: string) {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin.from(table).select("*").limit(500);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

// ⚠️ Normalização de campos: aceita PT/EN/símbolos
export function normCashflowType(t: string): "in" | "out" | "other" {
  const v = String(t ?? "").toLowerCase().trim();
  if (["in","entrada","receita","receitas","income","credit","crédito","c","+","entrada_caixa"].includes(v)) return "in";
  if (["out","saida","saída","despesa","despesas","expense","debit","débito","d","-","saida_caixa"].includes(v)) return "out";
  return "other";
}

export function normDreSection(s: string): "revenue" | "expense" | "other" {
  const v = String(s ?? "").toLowerCase().trim();
  if (["revenue","receita","receitas","income","credit","crédito","entradas"].includes(v)) return "revenue";
  if (["expense","despesa","despesas","custo","custos","cost","debit","débito","saidas","saídas"].includes(v)) return "expense";
  return "other";
}

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
  const roleCol      = env("FINANCE_AI_ROLE_COLUMN",     "role");
  const tenantCol    = env("FINANCE_AI_TENANT_COLUMN",   "none");

  const { data: prof, error: pe } = await supabaseAdmin
    .from(profileTable).select("*").eq("email", email).maybeSingle();
  if (pe)            return { ok: false, status: 500, reason: "profile_lookup_error" };
  if (!prof)         return { ok: false, status: 403, reason: "profile_not_found" };
  const role = String(prof[roleCol] || "").toLowerCase();
  if (role !== "admin") return { ok: false, status: 403, reason: "not_admin" };

  return { ok: true, user: {
    id: ud.user.id, email, role,
    tenant: tenantCol !== "none" ? prof[tenantCol] : null
  } };
}

function previousPeriod(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function buildFinanceContext({ year, month }: { year: number; month: number }) {
  const tabs = {
    cashflow: env("FINANCE_AI_CASHFLOW_TABLE", "finance_cash_flow_entries"),
    dre:      env("FINANCE_AI_DRE_TABLE",      "finance_dre_manual_entries"),
    costs:    env("FINANCE_AI_COSTS_TABLE",    "finance_cost_entries"),
    planning: env("FINANCE_AI_PLANNING_TABLE", "finance_planning_goals"),
    loans:    env("FINANCE_AI_LOANS_TABLE",    "finance_loan_contracts")
  };
  return {
    periodo: `${year}-${String(month).padStart(2, "0")}`,
    tables: tabs,
    fetchers: {
      cashflow: () => selectMonth(tabs.cashflow, year, month),
      dre:      () => selectDreMonth(tabs.dre,  year, month),
      costs:    () => selectActive(tabs.costs,  "status"),
      loans:    () => selectAllLoans(tabs.loans),
      planning: () => selectAll(tabs.planning)
    }
  };
}

export async function loadFinanceContext(year: number, month: number) {
  const ctxNow  = buildFinanceContext({ year, month });
  const prev = previousPeriod(year, month);
  const ctxPrev = buildFinanceContext({ year: prev.year, month: prev.month });

  const [cashflow, dre, costs, loans, planning] = await Promise.all([
    ctxNow.fetchers.cashflow(), ctxNow.fetchers.dre(), ctxNow.fetchers.costs(),
    ctxNow.fetchers.loans(),    ctxNow.fetchers.planning()
  ]);
  const [cashflowP, dreP, loansP] = await Promise.all([
    ctxPrev.fetchers.cashflow(), ctxPrev.fetchers.dre(), ctxPrev.fetchers.loans()
  ]);
  return {
    now: { ...ctxNow, data: { cashflow, dre, costs, loans, planning } },
    anterior:  { ...ctxPrev, data: { cashflow: cashflowP, dre: dreP, loans: loansP } },
    periodo:      ctxNow.periodo,
    periodo_ant:  ctxPrev.periodo,
    tables: ctxNow.tables
  };
}

// Helpers de agregação tolerantes
export type CFTotals = { receita: number; despesa: number; saldo: number; outros: number; count: number };
export function sumCashflow(rows: any[]): CFTotals {
  const t: CFTotals = { receita: 0, despesa: 0, saldo: 0, outros: 0, count: rows.length };
  for (const r of rows) {
    const amt = Number(r.amount ?? r.valor ?? 0);
    const kind = normCashflowType(r.type ?? r.tipo ?? "");
    if (kind === "in") t.receita += amt;
    else if (kind === "out") t.despesa += amt;
    else t.outros += amt;
  }
  t.saldo = t.receita - t.despesa;
  return t;
}

export type DRETotals = { receitas: number; despesas: number; resultado: number; rows: number };
export function sumDre(rows: any[]): DRETotals {
  const t: DRETotals = { receitas: 0, despesas: 0, resultado: 0, rows: rows.length };
  for (const r of rows) {
    const amt = Number(r.amount ?? r.valor ?? 0);
    const sec = normDreSection(r.section ?? r.secao ?? r.seção ?? "");
    if (sec === "revenue") t.receitas += amt;
    else if (sec === "expense") t.despesas += amt;
  }
  t.resultado = t.receitas - t.despesas;
  return t;
}

export type LoanTotals = {
  total: number;
  parcela_mes: number;
  saldo_total: number;
  by_status: Record<string, { count: number; parcela: number; saldo: number }>;
  all: any[];
};
export function sumLoans(rows: any[]): LoanTotals {
  const t: LoanTotals = {
    total: rows.length,
    parcela_mes: 0,
    saldo_total: 0,
    by_status: {},
    all: rows
  };
  for (const r of rows) {
    const parc = Number(r.current_installment_amount ?? r.installment_amount ?? r.parcela ?? 0);
    const saldo = Number(r.balance_outstanding ?? r.saldo ?? r.outstanding_balance ?? 0);
    const s = String(r.status ?? "").toLowerCase() || "(sem status)";
    if (!t.by_status[s]) t.by_status[s] = { count: 0, parcela: 0, saldo: 0 };
    t.by_status[s].count   += 1;
    t.by_status[s].parcela += parc;
    t.by_status[s].saldo   += saldo;
    // Considera "ativo" para a soma de parcela mensal
    const is_active = ["active","ativo","vigente","em_dia","aberto","open","current","1","true"].includes(s);
    if (is_active) {
      t.parcela_mes += parc;
      t.saldo_total += saldo;
    }
  }
  return t;
}

// Variação % segura
export function pctChange(now: number, before: number): number | null {
  if (!isFinite(now) || !isFinite(before) || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
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
  } catch { /* auditoria nunca pode quebrar a IA */ }
}
