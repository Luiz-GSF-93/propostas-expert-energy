// =================================================================
//  lib/financeiro/ai/server.ts  —— v2.1 ALINHADO COM UI
//  Reflete EXATAMENTE como os componentes React agregam os dados.
// =================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (typeof process !== "undefined" ? process.env.SUPABASE_URL || "" : "");
const SUPABASE_KEY = (typeof process !== "undefined" ? process.env.SUPABASE_SERVICE_ROLE_KEY || "" : "");

export const supabaseAdmin = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

const env = (k: string, dflt: string) =>
  (typeof process !== "undefined" ? (process.env[k] as string | undefined) : undefined) || dflt;

// =================================================================
//  Tabelas-origem (listas Supabase diretas, descoberta no grep)
// =================================================================
export function buildTabs() {
  return {
    dreManualEntries: env("FINANCE_AI_DRE_TABLE",          "finance_dre_manual_entries"),
    cashflow:        env("FINANCE_AI_CASHFLOW_TABLE",      "finance_cash_flow_entries"),
    costs:           env("FINANCE_AI_COSTS_TABLE",         "finance_cost_entries"),
    planning:        env("FINANCE_AI_PLANNING_TABLE",      "planejamento_meta_comercial"),
    loans:           env("FINANCE_AI_LOANS_TABLE",         "finance_loan_contracts"),
    dreSettings:     "dre_settings",                       // ajuste se nome real for outro
    auditLog:        env("FINANCE_AI_AUDIT_TABLE",         "finance_ai_audit_log"),
  };
}

// =================================================================
//  Helpers numéricos
// =================================================================
export const mean   = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+Number(b||0),0)/xs.length : 0;
export const stddev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a,b)=>a+(Number(b)-m)**2,0)/(xs.length-1));
};
export const pctChange = (now: number, before: number): number|null =>
  !Number.isFinite(before) || before === 0 ? null
  : Number((((now-before)/Math.abs(before))*100).toFixed(2));

// Normalizadores — reconhecem PT e EN
export function normCashType(t: any): "receita"|"despesa"|"outros" {
  const v = String(t ?? "").trim().toLowerCase();
  if (["receita","receitas","entrada","recebimento","in","income","credit"].includes(v)) return "receita";
  if (["despesa","despesas","saida","saída","pagamento","out","expense","debit"].includes(v)) return "despesa";
  return "outros";
}
export function normDreSec(s: any): "receita"|"custo"|"despesa_op"|"despesa_fin"|"tributo"|"outros" {
  const v = String(s ?? "").trim().toLowerCase();
  if (["receita","vendas","faturamento","receitas","revenue"].includes(v)) return "receita";
  if (["cmv","custo_operacional","custos_operacionais","custo","custos"].includes(v)) return "custo";
  if (["despesa_operacional","despesas_operacionais","despesas","despesa_op","administrativo","comercial","marketing","infraestrutura","pessoal","vendas_desp"].includes(v)) return "despesa_op";
  if (["despesa_financeira","despesas_financeiras","financeiro","juros"].includes(v)) return "despesa_fin";
  if (["tributo","tributos","imposto","impostos","irpj","csll","pis","cofins","iss","icms"].includes(v)) return "tributo";
  return "outros";
}

// =================================================================
//  CUSTOS — alinha com FinanceCostsDashboard
//   Categoria: ENUM "fixo"|"variavel"  |  custo fixo usa monthly_amount
//                                          custo variavel usa percentage_rate × estimatedRevenue
// =================================================================
export type CostTotals = {
  fixos: number;
  variaveis: number;
  total_mensal_estimado: number;
  estimated_revenue_usado: number;
  por_categoria: Record<string, number>;
  por_cost_type: Record<string, number>;
  count: number;
  items: any[];
};
export function sumCosts(rows: any[], estimatedRevenue: number = 0): CostTotals {
  const t: CostTotals = {
    fixos: 0, variaveis: 0, total_mensal_estimado: 0,
    estimated_revenue_usado: estimatedRevenue,
    por_categoria: {}, por_cost_type: {},
    count: rows.length, items: rows.slice(0, 30),
  };
  for (const r of rows) {
    if (!r) continue;
    if (r.active === false) continue;
    if (String(r.status ?? "").toLowerCase() === "inativo") continue;

    const cat = String(r.category ?? r.categoria ?? "").trim().toLowerCase();
    const isVariavel = cat === "variavel" || cat === "variaveis" || cat.includes("vari");
    const monthlyAmt = Number(r.monthly_amount ?? r.amount ?? r.valor ?? 0);
    const pctRate    = Number(r.percentage_rate ?? r.percent ?? 0);

    const valor = isVariavel
      ? (estimatedRevenue * pctRate) / 100
      : monthlyAmt;

    if (!Number.isFinite(valor)) continue;

    if (isVariavel) t.variaveis += valor;
    else            t.fixos     += valor;

    t.por_categoria[cat || "outros"] = (t.por_categoria[cat || "outros"] ?? 0) + valor;
    const ct = String(r.cost_type ?? r.tipo ?? "outros").trim().toLowerCase() || "outros";
    t.por_cost_type[ct] = (t.por_cost_type[ct] ?? 0) + valor;
  }
  t.total_mensal_estimado = t.fixos + t.variaveis;
  return t;
}

// =================================================================
//  FLUXO DE CAIXA — alinha com cashflow/page.tsx
//   type enum fechado, separa manual vs auto_generated
// =================================================================
export type CFTotals = {
  receita: number;
  despesa: number;
  outros: number;
  saldo: number;
  receita_manual: number; despesa_manual: number;
  receita_auto:   number; despesa_auto:   number;
  por_category: Record<string, { receita: number; despesa: number; count: number }>;
  count: number;
  items: any[];
};
export function sumCF(rows: any[]): CFTotals {
  const t: CFTotals = {
    receita: 0, despesa: 0, outros: 0, saldo: 0,
    receita_manual: 0, despesa_manual: 0,
    receita_auto:   0, despesa_auto:   0,
    por_category: {},
    count: rows.length, items: rows.slice(0, 30),
  };
  for (const r of rows) {
    if (!r) continue;
    const typ = normCashType(r.type ?? r.tipo ?? "");
    const amt = Number(r.amount ?? r.valor ?? 0);
    if (!Number.isFinite(amt)) continue;
    const isAuto = !!r.auto_generated;

    if (typ === "receita") {
      t.receita += amt;
      if (isAuto) t.receita_auto += amt; else t.receita_manual += amt;
    } else if (typ === "despesa") {
      t.despesa += amt;
      if (isAuto) t.despesa_auto += amt; else t.despesa_manual += amt;
    } else {
      t.outros += amt;
    }

    const cat = String(r.category ?? r.categoria ?? "outros").trim().toLowerCase() || "outros";
    if (!t.por_category[cat]) t.por_category[cat] = { receita: 0, despesa: 0, count: 0 };
    if (typ === "receita") t.por_category[cat].receita += amt;
    else if (typ === "despesa") t.por_category[cat].despesa += amt;
    t.por_category[cat].count += 1;
  }
  t.saldo = t.receita - t.despesa;
  return t;
}

// =================================================================
//  DRE — alinha com dre/page.tsx (18 campos por mês)
//   Lê DreMonth (authJson('/api/finance/dre/manual?year=YYYY&month=MM'))
//   ou fallback: lê de finance_dre_manual_entries (operator +/-)
// =================================================================
export type DRETotals = {
  receita_bruta: number;
  impostos: number; receita_liquida: number;
  cmv: number; lucro_bruto: number;
  despesas_administrativas: number; despesas_pessoal: number;
  despesas_vendas: number; despesas_marketing: number;
  despesas_infraestrutura: number; despesas_financeiras: number;
  receitas_financeiras: number;
  depreciacao_amortizacao: number;
  ebit: number; ebitda: number; irpj_csll: number;
  lucro_liquido: number;
  margem_bruta_percent: number|null; margem_ebitda_percent: number|null;
  margem_liquida_percent: number|null;
  count: number; items: any[];
};

// Recebe o DreMonth derivado da API /api/finance/dre/manual
export function sumDRE(months: { receita_bruta?:any; impostos?:any; cmv?:any;
  lucro_bruto?:any; despesas_administrativas?:any; despesas_pessoal?:any;
  despesas_vendas?:any; despesas_marketing?:any; despesas_infraestrutura?:any;
  despesas_financeiras?:any; receitas_financeiras?:any;
  depreciacao_amortizacao?:any; ebit?:any; ebitda?:any; irpj_csll?:any;
  lucro_liquido?:any; margem_liquida_percent?:any; margem_bruta_percent?:any;
  margem_ebitda_percent?:any; }[] = [], alternRows: any[] = []): DRETotals {
  const T = (k: string) => Number((months?.[0] as any)?.[k] ?? 0);
  let t: DRETotals = {
    receita_bruta: T("receita_bruta"),
    impostos: T("impostos"), receita_liquida: T("receita_liquida"),
    cmv: T("cmv"), lucro_bruto: T("lucro_bruto"),
    despesas_administrativas: T("despesas_administrativas"),
    despesas_pessoal: T("despesas_pessoal"),
    despesas_vendas: T("despesas_vendas"),
    despesas_marketing: T("despesas_marketing"),
    despesas_infraestrutura: T("despesas_infraestrutura"),
    despesas_financeiras: T("despesas_financeiras"),
    receitas_financeiras: T("receitas_financeiras"),
    depreciacao_amortizacao: T("depreciacao_amortizacao"),
    ebit: T("ebit"), ebitda: T("ebitda"), irpj_csll: T("irpj_csll"),
    lucro_liquido: T("lucro_liquido"),
    margem_bruta_percent: T("margem_bruta_percent") || null,
    margem_ebitda_percent: T("margem_ebitda_percent") || null,
    margem_liquida_percent: T("margem_liquida_percent") || null,
    count: months.length, items: alternRows.slice(0, 30),
  };
  // Fallback: se months vazio, deriva de finance_dre_manual_entries via operator
  if (months.length === 0 && alternRows.length > 0) {
    const sec: Record<string, keyof DRETotals> = {
      receita: "receita_bruta", impostos: "impostos", cmv: "cmv",
      custo: "cmv", custo_operacional: "cmv",
      despesa_op: "despesas_administrativas", despesa_operacional: "despesas_administrativas",
      despesa_fin: "despesas_financeiras", despesa_financeira: "despesas_financeiras",
      tributo: "impostos", irpj: "impostos", csll: "impostos",
    };
    const recovered: any = {
      receita_bruta:0,impostos:0,cmv:0,lucro_bruto:0,
      despesas_administrativas:0,despesas_pessoal:0,despesas_vendas:0,
      despesas_marketing:0,despesas_infraestrutura:0,despesas_financeiras:0,
      receitas_financeiras:0,depreciacao_amortizacao:0,
      ebit:0,ebitda:0,irpj_csll:0,lucro_liquido:0,
    };
    for (const r of alternRows) {
      if (!r || r.active === false) continue;
      const rawBucket = normDreSec(r.section ?? r.secao ?? "");
      const bucket = (sec[rawBucket] ?? (rawBucket === "outros" ? "outros" : "outros")) as keyof DRETotals;
      if (rawBucket === "outros") continue;
      const op = String(r.operator ?? "add").trim().toLowerCase();
      const sign = (op === "subtract" || op === "-" || op === "sub") ? -1 : 1;
      const amt = Number(r.amount ?? r.valor ?? 0);
      recovered[bucket] += sign * amt;
    }
    recovered.receita_liquida = recovered.receita_bruta - recovered.impostos;
    recovered.lucro_bruto     = recovered.receita_liquida - recovered.cmv;
    recovered.ebit            = recovered.lucro_bruto
                              - recovered.despesas_administrativas - recovered.despesas_pessoal
                              - recovered.despesas_vendas - recovered.despesas_marketing
                              - recovered.despesas_infraestrutura - recovered.despesas_financeiras
                              + recovered.receitas_financeiras;
    recovered.ebitda          = recovered.ebit + recovered.depreciacao_amortizacao;
    recovered.lucro_liquido   = recovered.ebitda - recovered.irpj_csll;
    t = { ...recovered, margem_bruta_percent:null, margem_ebitda_percent:null,
          margem_liquida_percent:null, count: alternRows.length, items: alternRows.slice(0,30) };
    if (recovered.receita_bruta > 0) {
      t.margem_bruta_percent   = (recovered.lucro_bruto / recovered.receita_bruta) * 100;
      t.margem_ebitda_percent  = (recovered.ebitda / recovered.receita_bruta) * 100;
      t.margem_liquida_percent = (recovered.lucro_liquido / recovered.receita_bruta) * 100;
    }
  }
  return t;
}

// =================================================================
//  PLANEJAMENTO — alinha com planejamento/page.tsx
//   Combina CommercialGoalItem (Contrato Recorrente + Avulso)
// =================================================================
export type PlanningTotals = {
  meta_total: number; realizado_total: number; gap: number;
  atingimento_pct: number|null;
  por_tipo: Record<string, { meta:number; realizado:number; qtd:number; atingimento_pct:number|null }>;
  count: number; items: any[];
};
export function sumPlanning(rows: any[]): PlanningTotals {
  const t: PlanningTotals = { meta_total:0, realizado_total:0, gap:0, atingimento_pct:null, por_tipo:{}, count: rows.length, items: rows.slice(0,30) };
  for (const r of rows) {
    if (!r) continue;
    if (r.active === false) continue;
    const m = Number(r.goal_amount ?? r.meta_amount ?? r.target ?? r.meta ?? 0);
    const a = Number(r.actual_amount ?? r.realizado ?? r.actual ?? 0);
    if (!Number.isFinite(m) && !Number.isFinite(a)) continue;
    t.meta_total      += Number.isFinite(m) ? m : 0;
    t.realizado_total += Number.isFinite(a) ? a : 0;
    const tp = String(r.goal_type ?? r.tipo ?? "outros").trim().toLowerCase() || "outros";
    if (!t.por_tipo[tp]) t.por_tipo[tp] = { meta:0, realizado:0, qtd:0, atingimento_pct:null };
    t.por_tipo[tp].meta      += Number.isFinite(m) ? m : 0;
    t.por_tipo[tp].realizado += Number.isFinite(a) ? a : 0;
    t.por_tipo[tp].qtd       += 1;
  }
  t.gap = t.meta_total - t.realizado_total;
  for (const k of Object.keys(t.por_tipo)) {
    const v = t.por_tipo[k];
    v.atingimento_pct = v.meta > 0 ? (v.realizado / v.meta) * 100 : null;
  }
  t.atingimento_pct = t.meta_total > 0 ? (t.realizado_total / t.meta_total) * 100 : null;
  return t;
}

// =================================================================
//  EMPRÉSTIMOS — alinha com emprestimos/page.tsx
//   LÊ DOIS CAMPOS de parcela (installment_amount E current_installment_amount)
//   LÊ DOIS CAMPOS de taxa (monthly_rate e annual_rate) faz conversão PRICE
//   INCLUI iof + fees no CET efetivo
//   RESPEITA grace_months para DSCR
// =================================================================
export type LoanTotals = {
  count: number;
  ativos: number;
  parcela_mes: number;                   // soma das parcelas mensais ATIVAS
  saldo_devedor_total: number;           // soma balance_outstanding de contratos ativos
  cet_efetivo_anual_pct: number|null;    // anualizado CET incluindo iof+fees
  cet_medio_anual_pct: number|null;      // taxa anual média simples
  taxa_mensal_media_pct: number|null;
  iof_total: number; fees_total: number;
  grace_meses_ativos: number;
  parcela_durante_carencia: number;      // só juros durante carência
  items: any[];
};
export function sumLoans(rows: any[], expectedMonthlyCash: number): LoanTotals {
  const t: LoanTotals = {
    count: rows.length, ativos: 0,
    parcela_mes: 0, saldo_devedor_total: 0,
    cet_efetivo_anual_pct: null, cet_medio_anual_pct: null, taxa_mensal_media_pct: null,
    iof_total: 0, fees_total: 0,
    grace_meses_ativos: 0, parcela_durante_carencia: 0,
    items: rows.slice(0, 30),
  };
  let sumCetEfetivo = 0, sumAnual = 0, sumMensal = 0, cetCount = 0, anuCount = 0, menCount = 0;
  for (const r of rows) {
    if (!r) continue;
    if (String(r.status ?? "").toLowerCase() === "quitado") continue;
    t.ativos += 1;

    // Parcela mensal: LÊ AMBOS os campos!
    const parcela = Number(
      r.current_installment_amount
      ?? r.installment_amount
      ?? r.monthly_payment
      ?? r.parcela
      ?? 0
    );
    t.parcela_mes += Number.isFinite(parcela) ? parcela : 0;

    // Saldo devedor
    const saldo = Number(r.balance_outstanding ?? r.saldo_devedor ?? r.saldo ?? 0);
    t.saldo_devedor_total += Number.isFinite(saldo) ? saldo : 0;

    // iof + fees
    t.iof_total  += Number(r.iof  ?? r.iof_total ?? 0);
    t.fees_total += Number(r.fees ?? r.fees_total ?? 0);

    // grace months
    const grace = Number(r.grace_months ?? 0);
    if (grace > 0) {
      t.grace_meses_ativos += 1;
      const principal = Number(r.principal_amount ?? r.net_amount ?? 0);
      const taxaMensal = Number(r.monthly_rate ?? 0) / 100;
      t.parcela_durante_carencia += Number.isFinite(principal) && Number.isFinite(taxaMensal) ? principal * taxaMensal : 0;
    }

    // Taxas
    const mensal = Number(r.monthly_rate ?? r.taxa_mensal ?? 0);
    const anual  = Number(r.annual_rate  ?? r.taxa_anual  ?? 0);
    if (Number.isFinite(mensal) && mensal > 0) { sumMensal += mensal; menCount++; }
    if (Number.isFinite(anual)  && anual  > 0) {
      sumAnual += anual; anuCount++;
      // CET efetivo inclui iof + fees anualizados sobre principal
      const principal = Number(r.principal_amount ?? r.net_amount ?? 1);
      if (principal > 0) {
        const cetAnual = anual + ((t.iof_total + t.fees_total) / principal) * 100;
        sumCetEfetivo += cetAnual; cetCount++;
      }
    }
  }
  t.cet_medio_anual_pct   = anuCount ? sumAnual / anuCount : null;
  t.taxa_mensal_media_pct = menCount ? sumMensal / menCount : null;
  t.cet_efetivo_anual_pct = cetCount ? sumCetEfetivo / cetCount : null;
  return t;
}

// =================================================================
//  Derivados
// =================================================================
export function calcMargins(r: number, co: number, do_: number, df: number, tr: number) {
  const lucro_liquido = (r||0) - (co||0) - (do_||0) - (df||0) - (tr||0);
  const ebitda        = lucro_liquido + (df||0) + (tr||0);
  const mb_pct  = r > 0 ? ((r - co) / r) * 100 : null;
  const me_pct  = r > 0 ? (ebitda / r) * 100 : null;
  const ml_pct  = r > 0 ? (lucro_liquido / r) * 100 : null;
  return {
    margem_bruta_val:r-co, margem_bruta_pct:mb_pct,
    ebitda_val:ebitda,     ebitda_pct:me_pct,
    margem_liquida_val:lucro_liquido, margem_liquida_pct:ml_pct,
  };
}
export function dscr(caixaMes: number, parcela_mes: number): number|null {
  if (!parcela_mes || parcela_mes <= 0) return null;
  return Number((caixaMes / parcela_mes).toFixed(2));
}
export function projecaoCaixa(saldoNow: number, medEnt: number, medSai: number, meses: number) {
  const fluxoMensal = (medEnt||0) - (medSai||0);
  return {
    saldo_futuro: Number((saldoNow + fluxoMensal * meses).toFixed(2)),
    variacao_mensal_media: Number(fluxoMensal.toFixed(2)),
    meses_ate_deficit: fluxoMensal < 0 ? Math.ceil((saldoNow || 0) / -fluxoMensal) : null,
  };
}
export function anomalia(atual: number, hist: number[]) {
  if (hist.length < 3) return null;
  const m = mean(hist), sd = stddev(hist);
  const lim = m + 2 * sd;
  return {
    is_anomalia: atual > lim && atual > 0,
    media: Number(m.toFixed(2)),
    desvio: sd > 0 ? Number((Math.abs(atual-m)/sd).toFixed(2)) : 0,
    limite_sup: Number(lim.toFixed(2)),
  };
}
export function simularCenario(receita: number, custosTotais: number, pctRec: number, pctCus: number) {
  const r = (receita||0) * (1 + (pctRec||0)/100);
  const c = (custosTotais||0) * (1 + (pctCus||0)/100);
  return { receita: Number(r.toFixed(2)), custos: Number(c.toFixed(2)), lucro: Number((r-c).toFixed(2)) };
}

// =================================================================
//  Admin guard
// =================================================================
type AdminGuard = { ok:true; user:{id:string;email:string;role:string;tenant:string|null} }
                | { ok:false; status:number; reason:string };
export async function checkAdminFromRequest(req: Request): Promise<AdminGuard> {
  if (!supabaseAdmin) return { ok:false, status:503, reason:"GUARD_supabase_unavailable" };
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return { ok:false, status:401, reason:"GUARD_no_token" };
    const { data: u, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !u?.user) return { ok:false, status:401, reason:"GUARD_invalid_token" };

    const profileTable = env("FINANCE_AI_PROFILE_TABLE", "profiles");
    const roleCol = env("FINANCE_AI_ROLE_COLUMN", "role");
    const tenantCol = env("FINANCE_AI_TENANT_COLUMN", "none");

    let role = "user";
    let tenant: string|null = null;
    try {
      const { data: prof } = await supabaseAdmin.from(profileTable).select("*").eq("id", u.user.id).maybeSingle();
      if (prof) {
        role = String((prof as any)[roleCol] ?? "user");
        if (tenantCol !== "none") tenant = String((prof as any)[tenantCol] ?? null);
      }
    } catch {}
    if (role !== "admin") return { ok:false, status:403, reason:"GUARD_not_admin" };
    return { ok:true, user:{ id:u.user.id, email:u.user.email||"?", role, tenant } };
  } catch (e: any) {
    return { ok:false, status:500, reason:`GUARD_exception:${String(e?.message||e)}` };
  }
}

// =================================================================
//  Loader do contexto — BUSCA DE TODOS OS MÓDULOS
// =================================================================
export type FinanceContext = {
  now: { year:number; month:number; label:string;
    dre: DRETotals; cashflow: CFTotals; costs: CostTotals;
    planning: PlanningTotals; loans: LoanTotals; };
  historico_12m: { label:string; receita:number; despesa:number }[];
};

export async function loadFinanceContextFull(year: number, month: number): Promise<FinanceContext|{error:string}> {
  if (!supabaseAdmin) return { error:"supabase_admin_unavailable" };
  const tabs = buildTabs();
  try {
    // 1) DRE — tenta via tabela (operator +/-). Se vazio, ainda considera fallback manual.
    const { data: dreAlt } = await supabaseAdmin.from(tabs.dreManualEntries)
      .select("*").eq("year", year).eq("month", month);
    const dreAlts = (dreAlt ?? []) as any[];

    // 2) Custos (sem year/month)
    const { data: costsAll } = await supabaseAdmin.from(tabs.costs).select("*");
    const costsRows = (costsAll ?? []) as any[];

    // 3) Planejamento — filtra por ano+mês (suporta reference_year/month E year/month)
    const { data: planAll } = await supabaseAdmin.from(tabs.planning).select("*");
    const planRows = ((planAll ?? []) as any[]).filter((r: any) =>
      (Number(r.reference_year ?? r.year ?? 0) === year && Number(r.reference_month ?? r.month ?? 0) === month)
    );

    // 4) Empréstimos
    const { data: loansAll } = await supabaseAdmin.from(tabs.loans).select("*");
    const loansRows = (loansAll ?? []) as any[];

    // 5) Fluxo de caixa do mês + 12 meses de histórico
    const { data: cfNow } = await supabaseAdmin.from(tabs.cashflow)
      .select("*").eq("year", year).eq("month", month);
    const cfNowRows = (cfNow ?? []) as any[];
    let cfHistRows: any[] = [];
    const { data: cfY } = await supabaseAdmin.from(tabs.cashflow).select("*").eq("year", year);
    cfHistRows = (cfY ?? []) as any[];
    if (cfHistRows.length < 3) {
      const { data: cfP } = await supabaseAdmin.from(tabs.cashflow).select("*").eq("year", year - 1);
      cfHistRows = cfHistRows.concat((cfP ?? []) as any[]);
    }

    // --- Receita estimada para custos variáveis
    const estimatedRevenue =
      sumCF(cfNowRows).receita ||
      sumPlanning(planRows).meta_total ||
      0;

    // --- Aglutinações finais
    const cf = sumCF(cfNowRows);
    const dre = sumDRE([], dreAlts);   // fallback: usa dre_manual_entries
    const costs = sumCosts(costsRows, estimatedRevenue);
    const planning = sumPlanning(planRows);
    const loans = sumLoans(loansRows, cf.receita);

    const historico_12m = (() => {
      const byMonth = new Map<string,{receita:number;despesa:number}>();
      for (const r of cfHistRows) {
        if (!r) continue;
        const k = `${r.year}-${String(r.month).padStart(2,"0")}`;
        const cur = byMonth.get(k) ?? {receita:0, despesa:0};
        const typ = normCashType(r.type ?? r.tipo ?? r.category);
        const amt = Number(r.amount ?? r.valor ?? 0);
        if (typ === "receita") cur.receita += amt;
        else if (typ === "despesa") cur.despesa += amt;
        byMonth.set(k, cur);
      }
      return Array.from(byMonth.entries())
        .map(([label,v])=>({label,...v}))
        .sort((a,b)=>a.label<b.label?-1:1)
        .slice(-12);
    })();

    return {
      now: {
        year, month,
        label: `${year}-${String(month).padStart(2,"0")}`,
        dre, cashflow: cf, costs,
        planning, loans,
      },
      historico_12m,
    };
  } catch (e: any) {
    return { error:`loadFinanceContextFull:${String(e?.message||e)}` };
  }
}

// =================================================================
//  Audit
// =================================================================
export async function logFinanceAiEvent(ev: {
  user_email:string; user_id:string; action:string;
  period_ref:string; prompt:string; response:string;
}) {
  if (!supabaseAdmin) return;
  const table = env("FINANCE_AI_AUDIT_TABLE", "finance_ai_audit_log");
  try {
    await supabaseAdmin.from(table).insert({
      user_email: ev.user_email, user_id: ev.user_id,
      action: ev.action, period_ref: ev.period_ref,
      prompt: (ev.prompt ?? "").slice(0, 4000),
      response: (ev.response ?? "").slice(0, 4000),
      created_at: new Date().toISOString(),
    });
  } catch {}
}
