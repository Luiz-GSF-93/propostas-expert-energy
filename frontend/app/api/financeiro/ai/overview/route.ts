import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContext, logFinanceAiEvent,
  sumCashflow, sumDre, sumLoans, pctChange
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

type Insight = { titulo: string; severidade: "baixa" | "media" | "alta"; detalhe: string };

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) {
    return NextResponse.json({
      error: guard.reason, auth_status: guard.status,
      dbg: {
        env_supabase_url: (typeof process !== "undefined"
          ? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "(empty)") : "(undefined)"),
        has_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
      }
    }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);

  const ctx = await loadFinanceContext(year, month);

  const cf    = sumCashflow(ctx.now.data.cashflow);
  const cfP   = sumCashflow(ctx.anterior.data.cashflow);
  const dre   = sumDre(ctx.now.data.dre);
  const dreP  = sumDre(ctx.anterior.data.dre);
  const loans = sumLoans(ctx.now.data.loans);

  const insights: Insight[] = [];
  const suggestions: string[] = [];

  // 1) Fluxo de caixa
  if (cf.count === 0) {
    insights.push({ titulo: "Sem dados de fluxo de caixa no período", severidade: "media",
      detalhe: `Lançar entradas/saídas em ${ctx.now.tables.cashflow} para ${ctx.periodo}.` });
  } else {
    const s = ctx.periodo;
    const delta = pctChange(cf.saldo, cfP.saldo);
    const txtDelta = delta === null ? "(sem base de comparação)" :
                     delta > 5 ? `alta de ${delta.toFixed(1)}% vs ${ctx.periodo_ant}` :
                     delta < -5 ? `queda de ${delta.toFixed(1)}% vs ${ctx.periodo_ant}` :
                     `estável (±${Math.abs(delta).toFixed(1)}%) vs ${ctx.periodo_ant}`;
    insights.push({
      titulo: cf.saldo >= 0 ? "Fluxo de caixa positivo" : "Fluxo de caixa negativo",
      severidade: cf.saldo >= 0 ? "baixa" : "alta",
      detalhe: `Período ${s}: saldo R$ ${cf.saldo.toFixed(2)} (receitas R$ ${cf.receita.toFixed(2)} · despesas R$ ${cf.despesa.toFixed(2)}) — ${txtDelta}.`
    });
    if (cf.saldo < 0) suggestions.push(`Priorizar recebimentos em atrasos para reverter o saldo negativo de R$ ${Math.abs(cf.saldo).toFixed(2)} em ${s}.`);
    if (cf.outros > 0) suggestions.push(`Há ${cf.outros.toFixed(2)} em lançamentos sem tipo classificado (entrada/saída); tipifique para visão completa.`);
  }

  // 2) DRE
  if (dre.rows === 0) {
    insights.push({ titulo: "DRE sem lançamentos no período", severidade: "media",
      detalhe: `Lançar receitas e despesas em ${ctx.now.tables.dre} para ${ctx.periodo}.` });
  } else {
    const dDre = pctChange(dre.resultado, dreP.resultado);
    const txtDre = dDre === null ? "" :
                   dDre > 5 ? `resultado +${dDre.toFixed(1)}% vs ${ctx.periodo_ant}` :
                   dDre < -5 ? `resultado ${dDre.toFixed(1)}% vs ${ctx.periodo_ant}` :
                   `resultado estável vs ${ctx.periodo_ant}`;
    insights.push({
      titulo: dre.resultado >= 0 ? "DRE positiva no período" : "DRE negativa no período",
      severidade: dre.resultado >= 0 ? "baixa" : "alta",
      detalhe: `Receitas R$ ${dre.receitas.toFixed(2)} · Despesas R$ ${dre.despesas.toFixed(2)} · Resultado R$ ${dre.resultado.toFixed(2)} — ${txtDre}.`
    });
    if (dre.despesas > dre.receitas) {
      suggestions.push(`Cortar/reduzir despesas variáveis. Margem atual: ${((dre.resultado / Math.max(dre.receitas,1)) * 100).toFixed(1)}%.`);
    }
  }

  // 3) Custos
  const costCount = ctx.now.data.costs.length;
  if (costCount === 0) {
    insights.push({ titulo: "Nenhum custo fixo ativo cadastrado", severidade: "media",
      detalhe: `Cadastre contratos em ${ctx.now.tables.costs} para projeção de despesa recorrente.` });
  } else {
    const totalCustos = ctx.now.data.costs.reduce((s: number, c: any) =>
      s + Number(c.monthly_amount ?? c.monthlyAmount ?? c.amount ?? 0), 0);
    insights.push({ titulo: `${costCount} custo(s) fixo(s) ativo(s)`, severidade: "baixa",
      detalhe: `Mensal total: R$ ${totalCustos.toFixed(2)}.` });
    if (totalCustos > dre.despesas && totalCustos > 0) {
      suggestions.push(`Custos fixos (R$ ${totalCustos.toFixed(2)}) superam despesas DRE do mês (R$ ${dre.despesas.toFixed(2)}); revisar contratos e reajustes.`);
    }
  }

  // 4) Empréstimos — visão completa por status
  if (loans.total === 0) {
    insights.push({ titulo: "Sem empréstimos cadastrados", severidade: "baixa",
      detalhe: `Cadastre contratos em ${ctx.now.tables.loans} para projetar parcelas e saldo devedor.` });
  } else {
    const topStatus = Object.entries(loans.by_status)
      .sort((a: any, b: any) => b[1].saldo - a[1].saldo)[0];
    insights.push({
      titulo: `${loans.total} contrato(s) — ${loans.parcela_mes > 0 ? `parcela ativa R$ ${loans.parcela_mes.toFixed(2)}` : "nenhum contrato ativo"}`,
      severidade: loans.parcela_mes > (cf.receita || 0) * 0.3 ? "alta" : "media",
      detalhe: `Saldo devedor ativo: R$ ${loans.saldo_total.toFixed(2)} · status predominante: "${topStatus[0]}" (${topStatus[1].count} contrato(s), R$ ${topStatus[1].saldo.toFixed(2)}).`
    });
    if (loans.saldo_total > 0) {
      suggestions.push(`Contrato com maior saldo devedor: R$ ${topStatus[1].saldo.toFixed(2)} (status "${topStatus[0]}"). Avalie renegociação de taxa/prazo.`);
    }
  }

  // 5) Sugestões automáticas por regra
  if (suggestions.length === 0 && cf.count > 0 && dre.rows > 0 && loans.total > 0) {
    suggestions.push("Operação saudável no mês. Manter disciplina de provisionamento de caixa para cobrir parcela mensal de empréstimos.");
  }

  await logFinanceAiEvent({
    userId: guard.user.id, userEmail: guard.user.email,
    action: "overview", period: ctx.periodo,
    modulesUsed: Object.keys(ctx.now.tables),
    meta: {
      counts: {
        cashflow: ctx.now.data.cashflow.length, dre: ctx.now.data.dre.length,
        costs: ctx.now.data.costs.length, loans: ctx.now.data.loans.length,
        planning: ctx.now.data.planning.length
      },
      totals: {
        cashflow: cf, dre, loans: { parcela_mes: loans.parcela_mes, saldo_total: loans.saldo_total, total: loans.total }
      },
      comparativo: {
        cashflow_saldo_pct: pctChange(cf.saldo, cfP.saldo),
        dre_resultado_pct: pctChange(dre.resultado, dreP.resultado)
      }
    }
  });

  return NextResponse.json({
    periodo: ctx.periodo,
    periodo_anterior: ctx.periodo_ant,
    counts: {
      cashflow: ctx.now.data.cashflow.length, dre: ctx.now.data.dre.length,
      costs: ctx.now.data.costs.length, loans: ctx.now.data.loans.length,
      planning: ctx.now.data.planning.length
    },
    insights,
    sugestoes: suggestions,
    comparativo: {
      cashflow_saldo: { atual: cf.saldo, anterior: cfP.saldo, variacao_pct: pctChange(cf.saldo, cfP.saldo) },
      dre_resultado:  { atual: dre.resultado, anterior: dreP.resultado, variacao_pct: pctChange(dre.resultado, dreP.resultado) }
    },
    resumo_numerico: {
      cashflow: cf, dre, loans: {
        parcela_mes: loans.parcela_mes, saldo_total: loans.saldo_total,
        total_contratos: loans.total, distribuicao_status: loans.by_status
      }
    }
  });
}
