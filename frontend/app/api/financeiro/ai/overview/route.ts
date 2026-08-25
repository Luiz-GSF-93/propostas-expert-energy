import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  calcMargins, dscr, projecaoCaixa, pctChange, anomalia, simularCenario, mean
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

type Insight = { modulo: string; titulo: string; severidade: "baixa"|"media"|"alta"; detalhe: string };
type Sug =     { modulo: string; acao: string; impacto: string };
type Cen =     { nome: string; receita: number; custos: number; lucro: number };

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);

  const ctx   = await loadFinanceContextFull(year, month);
  const dre: any = ctx.now.dre;
  const cf: any   = ctx.now.cashflow;
  const cust: any[]  = ctx.now.costs;
  const loans: any  = ctx.now.loans;
  const plan: any[]  = ctx.now.planning;

  // ---- campos do DRETotals ----
  const receita     = Number(dre.receitas           || 0);
  const custoOp     = Number(dre.custo_operacional  || 0);
  const despOp      = Number(dre.desp_operacional   || 0);
  const despFin     = Number(dre.desp_financeira    || 0);
  const totalDesp   = Number(dre.despesas           || 0);
  const margens = calcMargins(receita, custoOp, despOp, despFin);

  const insights: Insight[] = [];
  const suggestions: Sug[] = [];
  const cenarios: Cen[] = [];

  // ============ FLUXO DE CAIXA ============
  insights.push({
    modulo: "fluxo_caixa",
    titulo: `Saldo do período`,
    severidade: cf.saldo > 0 ? "baixa" : cf.saldo < 0 ? "alta" : "media",
    detalhe: `Saldo: R$ ${Number(cf.saldo).toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
             ` · Entradas: R$ ${Number(cf.receita).toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
             ` · Saídas: R$ ${Number(cf.despesa).toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
             ` · Lançamentos: ${cf.count}`
  });

  // anomalia estatística
  if (ctx.historico.cashflow.length >= 4) {
    const ultimos = ctx.historico.cashflow.slice(-6).map((m:any) => m.receita);
    const a = anomalia(Number(cf.receita), ultimos);
    if (a) insights.push({
      modulo: "anomalias",
      titulo: "Anomalia detectada nas entradas",
      severidade: a.severidade,
      detalhe: a.mensagem
    });
  }

  // ============ DRE / MARGENS ============
  if (receita > 0 || totalDesp > 0) {
    const liqPct = margens.margem_liquida_pct ?? 0;
    insights.push({
      modulo: "dre",
      titulo: "Resultado (DRE + Margens)",
      severidade: liqPct >= 10 ? "baixa" : liqPct >= 0 ? "media" : "alta",
      detalhe: `Receita: R$ ${receita.toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
               ` · Despesa: R$ ${totalDesp.toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
               ` · Líquido: R$ ${margens.margem_liquida_val.toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
               ` · Bruta: ${(margens.margem_bruta_pct ?? 0).toFixed(1)}%` +
               ` · EBITDA: ${(margens.ebitda_pct ?? 0).toFixed(1)}%` +
               ` · Margem Líquida: ${liqPct.toFixed(1)}%`
    });
  } else {
    insights.push({
      modulo: "dre",
      titulo: "DRE sem lançamentos reconhecidos",
      severidade: "media",
      detalhe: "A tabela finance_dre_manual_entries precisa ter coluna 'section' = 'revenue' ou 'expense' — verifique cadastros."
    });
  }

  // ============ CUSTOS ============
  const custoTotalMes = cust.reduce(
    (a: number, c: any) => a + (Number(c.amount) || Number(c.valor) || Number(c.monthly_value) || 0), 0
  );
  if (custoTotalMes > 0) {
    insights.push({
      modulo: "custos",
      titulo: "Custo total do mês",
      severidade: custoTotalMes > receita * 0.7 ? "alta" : "baixa",
      detalhe: `R$ ${custoTotalMes.toLocaleString("pt-BR",{minimumFractionDigits:2})} em ${cust.length} lançamento(s).`
    });
    if (custoTotalMes > receita * 0.6 && receita > 0) {
      suggestions.push({
        modulo: "custos",
        acao: "Custo operacional > 60% da receita — revisar fornecedores e contratos.",
        impacto: "Recuperação potencial de 8-15% do custo."
      });
    }
  } else {
    insights.push({
      modulo: "custos",
      titulo: "Sem custos fixos ativos cadastrados",
      severidade: "media",
      detalhe: "Cadastre custos (finance_cost_entries) com coluna 'amount' ou 'valor' para projeção mensal."
    });
  }

  // ============ PLANEJAMENTO ============
  const metaReceita = plan.reduce(
    (a: number, p: any) => a + (Number(p.revenue_target) || Number(p.meta_receita) || Number(p.target_amount) || 0), 0
  );
  if (metaReceita > 0) {
    const ating = receita / metaReceita;
    insights.push({
      modulo: "planejamento",
      titulo: "Atingimento da meta de receita",
      severidade: ating >= 0.9 ? "baixa" : ating >= 0.7 ? "media" : "alta",
      detalhe: `Meta: R$ ${metaReceita.toLocaleString("pt-BR")} · Realizado: ${(ating*100).toFixed(1)}%`
    });
  } else {
    insights.push({
      modulo: "planejamento",
      titulo: "Planejamento sem metas cadastradas",
      severidade: "media",
      detalhe: "Defina metas em finance_planning_goals (campos: revenue_target / meta_receita / target_amount)."
    });
  }

  // ============ EMPRÉSTIMOS ============
  // LoanTotals já é processado pelo sumLoans
  if (loans.total > 0) {
    const ds = dscr(Number(cf.receita) || 0, Number(loans.parcela_mes) || 0);
    insights.push({
      modulo: "emprestimos",
      titulo: `${loans.ativos} de ${loans.total} empréstimo(s) ativos`,
      severidade: loans.ativos > 0 ? "media" : "baixa",
      detalhe: `Parcela mensal total: R$ ${Number(loans.parcela_mes).toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
               ` · Saldo devedor total: R$ ${Number(loans.saldo_total).toLocaleString("pt-BR")}` +
               ` · CET médio anual: ${Number(loans.cet_medio_anual).toFixed(2)}%` +
               ` · DSCR: ${ds !== null ? ds.toFixed(2) : "n/d (sem caixa)"}`
    });
    if (Number(loans.cet_medio_anual) > 12) {
      suggestions.push({
        modulo: "emprestimos",
        acao: "CET médio anual > 12% — avaliar refinanciamento com taxa ≤ 1,1% a.m.",
        impacto: "Redução potencial de até R$ 98 mil/ano em custo financeiro."
      });
    }
  } else {
    insights.push({
      modulo: "emprestimos",
      titulo: "Sem empréstimos cadastrados",
      severidade: "baixa",
      detalhe: "Cadastre contratos (finance_loan_contracts) para cálculo automático de CET e DSCR."
    });
  }

  // ============ PROJEÇÕES 60/90 ============
  const medEnt = mean(ctx.historico.cashflow.slice(-3).map((m:any) => m.receita));
  const medSai = mean(ctx.historico.cashflow.slice(-3).map((m:any) => m.despesa));
  const proj60 = projecaoCaixa(Number(cf.saldo), Number(medEnt), Number(medSai), 2);
  const proj90 = projecaoCaixa(Number(cf.saldo), Number(medEnt), Number(medSai), 3);
  if (Number(cf.saldo) !== 0 || medEnt !== 0 || medSai !== 0) {
    insights.push({
      modulo: "projecoes",
      titulo: "Projeção de caixa 60/90 dias",
      severidade: (proj60.saldoFinal < 0 || proj90.saldoFinal < 0) ? "alta" : "baixa",
      detalhe: `60d: R$ ${proj60.saldoFinal.toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
               ` · 90d: R$ ${proj90.saldoFinal.toLocaleString("pt-BR",{minimumFractionDigits:2})}` +
               ` · Base: média 3 meses (entradas R$ ${medEnt.toFixed(2)} / saídas R$ ${medSai.toFixed(2)})`
    });
    if (proj60.saldoFinal < 0) {
      suggestions.push({
        modulo: "projecoes",
        acao: "Antecipar recebíveis dos próximos 30 dias.",
        impacto: "Evita saldo negativo projetado em 60 dias."
      });
    }
  }

  // ============ CENÁRIOS DRE ============
  if (receita > 0) {
    cenarios.push({ nome: "Otimista (+15% receita, -5% custo)",
                    ...simularCenario(receita, custoOp, 0.15, -0.05) } as any);
    cenarios.push({ nome: "Realista (base)",
                    ...simularCenario(receita, custoOp, 0, 0) } as any);
    cenarios.push({ nome: "Pessimista (-15% receita, +10% custo)",
                    ...simularCenario(receita, custoOp, -0.15, 0.10) } as any);
  }

  await logFinanceAiEvent({
    user_email: guard.user.email,
    user_id: guard.user.id,
    action: "overview_v3_fields_ok",
    period_ref: `${year}-${String(month).padStart(2,"0")}`,
    responseSummary: `insights=${insights.length} suggestions=${suggestions.length} cenarios=${cenarios.length}`,
    modules_used: ["fluxo_caixa","dre","custos","planejamento","emprestimos","projecoes"]
  });

  return NextResponse.json({
    ok: true,
    periodo: { year, month, label: `${year}-${String(month).padStart(2,"0")}` },
    insights,
    suggestions,
    cenarios,
    margem: margens,
    projecoes: { sessenta_dias: proj60, noventa_dias: proj90 },
    bruto: {
      fluxo_caixa: cf,
      dre: { receita, custoOp, despOp, despFin, totalDesp,
            receita_operacional: dre.receita_operacional, receita_financeira: dre.receita_financeira, resultado: dre.resultado },
      custos_total: custoTotalMes,
      meta_receita: metaReceita,
      emprestimos: loans
    }
  });
}
