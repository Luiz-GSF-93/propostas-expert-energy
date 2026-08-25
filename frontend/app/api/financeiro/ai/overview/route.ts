import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContext, logFinanceAiEvent
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) {
    const envUrl = typeof process !== "undefined"
      ? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "(empty)")
      : "(undefined)";
    const hasSR   = typeof process !== "undefined" && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const hasAnon = typeof process !== "undefined" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const authH   = req.headers.get("authorization") || "";
    const m       = authH.match(/^Bearer\s+(.+)$/i);
    const tok30   = m ? m[1].slice(0, 30) + "..." : "(sem bearer)";
    return NextResponse.json({
      error: guard.reason,
      auth_status: guard.status,
      dbg: {
        env_supabase_url: envUrl,
        has_service_role: hasSR,
        has_anon_key: hasAnon,
        auth_header_present: Boolean(authH),
        token_prefix_30: tok30
      }
    }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);
  const ctx = await loadFinanceContext(year, month);

  type I = { titulo: string; severidade: "baixa" | "media" | "alta"; detalhe: string };
  const insights: I[] = [];
  const totalIn  = ctx.data.cashflow.filter((r: any) => r.type === "in").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const totalOut = ctx.data.cashflow.filter((r: any) => r.type === "out").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const saldo = totalIn - totalOut;

  if (ctx.data.cashflow.length === 0) {
    insights.push({ titulo: "Sem dados de fluxo de caixa no período", severidade: "media", detalhe: "Cadastre entradas e saídas para gerar visão executiva." });
  } else if (saldo < 0) {
    insights.push({ titulo: "Fluxo de caixa negativo no período", severidade: "alta",
      detalhe: `Entradas R$ ${totalIn.toFixed(2)} < Saídas R$ ${totalOut.toFixed(2)} (saldo R$ ${saldo.toFixed(2)}).` });
  } else {
    insights.push({ titulo: "Fluxo de caixa positivo", severidade: "baixa",
      detalhe: `Saldo do período: R$ ${saldo.toFixed(2)}.` });
  }

  const ativos = ctx.data.costs.filter((c: any) => String(c.status || "").toLowerCase() === "active").length;
  if (ativos === 0) {
    insights.push({ titulo: "Nenhum custo fixo ativo cadastrado", severidade: "media",
      detalhe: "Cadastre custos para projeção mensal confiável." });
  } else {
    insights.push({ titulo: `${ativos} custo(s) fixo(s) ativo(s)`, severidade: "baixa",
      detalhe: "Verifique reajustes e fornecedores periodicamente." });
  }

  if (ctx.data.loans.length > 0) {
    const parc = ctx.data.loans.reduce((s: number, l: any) => s + Number(l.current_installment_amount || 0), 0);
    insights.push({ titulo: `${ctx.data.loans.length} empréstimo(s) cadastrado(s)`,
      severidade: parc > saldo ? "alta" : "media",
      detalhe: `Parcela mensal total: R$ ${parc.toFixed(2)}.` });
  } else {
    insights.push({ titulo: "Sem empréstimos cadastrados", severidade: "baixa",
      detalhe: "Cadastre contratos para projetar parcelas e saldo devedor." });
  }

  if (ctx.data.dre.length > 0) {
    const receita = ctx.data.dre.filter((r: any) => r.section === "revenue").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const despesa = ctx.data.dre.filter((r: any) => r.section === "expense").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    insights.push({ titulo: "DRE preenchida no período", severidade: "baixa",
      detalhe: `Receitas R$ ${receita.toFixed(2)} · Despesas R$ ${despesa.toFixed(2)}.` });
  } else {
    insights.push({ titulo: "DRE sem lançamentos no período", severidade: "media",
      detalhe: "Lançar receitas e despesas aumenta a precisão da análise." });
  }

  await logFinanceAiEvent({
    userId: guard.user.id, userEmail: guard.user.email,
    action: "overview", period: ctx.periodo,
    modulesUsed: Object.keys(ctx.tables),
    meta: { counts: {
      cashflow: ctx.data.cashflow.length, dre: ctx.data.dre.length,
      costs: ctx.data.costs.length, loans: ctx.data.loans.length,
      planning: ctx.data.planning.length
    } }
  });

  return NextResponse.json({
    periodo: ctx.periodo,
    counts: {
      cashflow: ctx.data.cashflow.length, dre: ctx.data.dre.length,
      costs: ctx.data.costs.length, loans: ctx.data.loans.length,
      planning: ctx.data.planning.length
    },
    insights,
    tabelas_usadas: ctx.tables
  });
}
