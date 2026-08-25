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



type AdminGuard =
  | { ok: true;  user: { id: string; email: string; role: string; tenant: string | null } }
  | { ok: false; status: number; reason: string };

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month - 1 + 1, 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  return { start, end: `${y}-${m}-01` };
}

async function safeSelect(table: string, year: number, month: number) {
  if (!supabaseAdmin) return [];
  const { start, end } = monthRange(year, month);
  try {
    const { data, error } = await supabaseAdmin
      .from(table).select("*").eq("active", true)
      .gte("created_at", start).lt("created_at", end).limit(500);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

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
  const { data: prof, error: pe } = await supabaseAdmin
    .from(profileTable).select("*").eq("email", email).maybeSingle();
  if (pe) return { ok: false, status: 500, reason: "profile_lookup_error" };
  if (!prof) return { ok: false, status: 403, reason: "profile_not_found" };
  const role = String(prof[roleCol] || "").toLowerCase();
  if (role !== "admin") return { ok: false, status: 403, reason: "not_admin" };
  return {
    ok: true, user: {
      id: ud.user.id, email, role,
      tenant: tenantCol !== "none" ? prof[tenantCol] : null
    }
  };
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
      cashflow: () => safeSelect(tabs.cashflow, year, month),
      dre:      () => safeSelect(tabs.dre,      year, month),
      costs:    () => safeSelect(tabs.costs,    year, month),
      loans:    () => safeSelect(tabs.loans,    year, month),
      planning: () => safeSelect(tabs.planning, year, month)
    }
  };
}

export async function loadFinanceContext(year: number, month: number) {
  const ctx = buildFinanceContext({ year, month });
  const [cashflow, dre, costs, loans, planning] = await Promise.all([
    ctx.fetchers.cashflow(), ctx.fetchers.dre(), ctx.fetchers.costs(),
    ctx.fetchers.loans(),    ctx.fetchers.planning()
  ]);
  return { ...ctx, data: { cashflow, dre, costs, loans, planning } };
}

export async function logFinanceAiEvent(rec: Record<string, any>) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("finance_ai_audit_log").insert({
      user_id: rec.userId ?? null,
      user_email: rec.userEmail ?? null,
      action: rec.action,
      period: rec.period ?? null,
      prompt: rec.prompt ?? null,
      response_summary: rec.responseSummary ?? null,
      modules_used: rec.modulesUsed ?? [],
      meta: rec.meta ?? {}
    });
  } catch { /* auditoria nunca pode quebrar a IA */ }
}
