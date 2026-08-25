import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  calcMargins, dscr, projecaoCaixa, pctChange, anomalia, simularCenario, mean
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

type Insight = { modulo: string; titulo: string; severidade: "baixa"|"media"|"alta"; detalhe: string; acao?: string };

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);

  const ctx  = await loadFinanceContextFull(year, month);
  const ctxP = await loadFinanceContextFull(year, month === 1 ? month + 1 : month - 1);

  const cf   = ctx.now.cashflow;
  const cfP  = ctxP.now.cashflow;
  const dre  = ctx.now.dre;
  const dreP = ctxP.now.dre;
  const cust = ctx.now.costs;
  const plan = ctx.now.planning;
  const loans = ctx.now.loans;

  const insights: Insight[] = [];
  const suggestions: { modulo: string; acao: string; impacto: string }[] = [];
  const cenarios: { nome: string; receita: number; custos: number; lucro: number }[] = [];

  // ---- FLUXO DE CAIXA ----
  if (cf.saldo > 0) {
    insights.push({ modulo: "fluxo_caixa", titulo: "Fluxo de caixa positivo no período", severidade: "baixa",
      detalhe: `Saldo: R$ ${cf.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · Entradas: R$ ${cf.receita.toFixed(2)} · Saídas: R$ ${cf.despesa.toFixed(2)}` });
  } else if (cf.saldo < 0) {
    insights.push({ modulo: "fluxo_caixa", titulo: "Saldo negativo no fluxo de caixa", severidade: "alta",
      detalhe: `Saldo: R$ ${cf.saldo.toFixed(2)} · revisar recebíveis e despesas do mês.` });
  } else {
    insights.push({ modulo: "fluxo_caixa", titulo: "Fluxo zerado no período", severidade: "media",
      detalhe: "Sem movimentações reconhecidas — verifique tipos de lançamento." });
  }

  // ---- DRE / Margens ----
  const margens = calcMargins(dre.receita_total || 0, dre.custo_total || 0, dre.despesa_op || 0, dre.despesa_fin || 0);
  if (dre.receita_total > 0 || dre.custo_total > 0) {
    insights.push({
      modulo: "dre", titulo: "Margem Líquida no mês", severidade: margens.margemLiquida >= 0.10 ? "baixa" : margens.margemLiquida >= 0 ? "media" : "alta",
      detalhe: `Bruta: ${(margens.margemBruta * 100).toFixed(1)}% · EBITDA: ${(margens.margemEbitda * 100).toFixed(1)}% · Líquida: ${(margens.margemLiquida * 100).toFixed(1)}%`
    });
  } else {
    insights.push({ modulo: "dre", titulo: "DRE sem lançamentos do mês", severidade: "media",
      detalhe: "Cadastre receitas e despesas para calcular margens e EBITDA." });
  }

  // ---- CUSTOS ----
  const custoTotalMes = cust.reduce((acc, c) => acc + (Number(c.amount) || Number(c.valor) || 0), 0);
  if (custoTotalMes > 0) {
    insights.push({
      modulo: "custos", titulo: "Custo total do mês", severidade: custoTotalMes > dre.receita_total * 0.7 ? "alta" : "baixa",
      detalhe: `R$ ${custoTotalMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${cust.length} lançamento(s).`
    });
    suggestions.push({ modulo: "custos", acao: "Revisar centros de custo acima de 70% da receita.", impacto: "Redução média de 8-15% do custo operacional." });
  } else {
    insights.push({ modulo: "custos", titulo: "Sem custos fixos ativos cadastrados", severidade: "media",
      detalhe: "Cadastre custos para projeção mensal confiável." });
  }

  // ---- PLANEJAMENTO ----
  const metaReceita = plan.reduce((a, p) => a + (Number(p.revenue_target) || Number(p.meta_receita) || 0), 0);
  if (metaReceita > 0) {
    const atingimento = dre.receita_total / metaReceita;
    insights.push({
      modulo: "planejamento", titulo: "Atingimento da meta de receita", severidade: atingimento >= 0.9 ? "baixa" : atingimento >= 0.7 ? "media" : "alta",
      detalhe: `Meta: R$ ${metaReceita.toLocaleString("pt-BR")} · Realizado: ${(atingimento * 100).toFixed(1)}%`
    });
  } else {
    insights.push({ modulo: "planejamento", titulo: "Planejamento sem metas cadastradas", severidade: "media",
      detalhe: "Defina metas para acompanhar atingimento mensal." });
  }

  // ---- EMPRÉSTIMOS ----
  if (loans.count > 0) {
    const indicadorDSCR = dscr(cf.receita, loans.parcela_total || 0);
    insights.push({
      modulo: "emprestimos", titulo: `${loans.count} empréstimo(s) cadastrado(s)`, severidade: "media",
      detalhe: `Parcela mensal total: R$ ${(loans.parcela_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · Saldo devedor: R$ ${(loans.saldo_devedor || 0).toLocaleString("pt-BR")} · DSCR: ${indicadorDSCR ? indicadorDSCR.toFixed(2) : "n/d"}`
    });
    if (indicadorDSCR !== null && indicadorDSCR < 1.2) {
      suggestions.push({ modulo: "emprestimos", acao: "Avaliar refinanciamento dos contratos com taxa > 1,1% a.m.", impacto: "Redução potencial de até R$ 98 mil/ano em custo financeiro." });
    }
  } else {
    insights.push({ modulo: "emprestimos", titulo: "Sem empréstimos ativos", severidade: "baixa", detalhe: "Cadastre contratos para cálculo de CET e DSCR." });
  }

  // ---- PROJEÇÃO 60/90 DIAS ----
  const medEntradas = mean(ctx.historico.cashflow.slice(-3).map((m:any) => m.receita));
  const medSaidas   = mean(ctx.historico.cashflow.slice(-3).map((m:any) => m.despesa));
  const proj60 = projecaoCaixa(cf.saldo, medEntradas, medSaidas, 2);
  const proj90 = projecaoCaixa(cf.saldo, medEntradas, medSaidas, 3);
  if (cf.saldo !== 0 || medEntradas !== 0 || medSaidas !== 0) {
    insights.push({
      modulo: "projecoes", titulo: "Projeção de caixa 60/90 dias", severidade: (proj60.saldoFinal < 0 || proj90.saldoFinal < 0) ? "alta" : "baixa",
      detalhe: `60d: R$ ${proj60.saldoFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · 90d: R$ ${proj90.saldoFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    });
    if (proj60.saldoFinal < 0) {
      suggestions.push({ modulo: "projecoes", acao: "Antecipar recebíveis dos próximos 30 dias.", impacto: "Evita déficit projetado em 60 dias." });
    }
  }

  // ---- CENÁRIOS ----
  if (dre.receita_total > 0) {
    cenarios.push({ nome: "Otimista (+15% receita)",   ...simularCenario(dre.receita_total, dre.custo_total, 0.15, -0.05) });
    cenarios.push({ nome: "Realista (base)",           ...simularCenario(dre.receita_total, dre.custo_total, 0, 0) });
    cenarios.push({ nome: "Pessimista (-15% receita)", ...simularCenario(dre.receita_total, dre.custo_total, -0.15, 0.10) });
  }

  await logFinanceAiEvent({
    user_email: guard.user.email,
    user_id: guard.user.id,
    action: "overview_v2",
    period_ref: `${year}-${String(month).padStart(2, "0")}`,
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
    brutto: {
      fluxo_caixa: cf,
      dre: { receita_total: dre.receita_total, custo_total: dre.custo_total, despesa_op: dre.despesa_op, despesa_fin: dre.despesa_fin },
      custos_total: custoTotalMes,
      planejamento_metas: metaReceita,
      emprestimos: { count: loans.count, parcela_total: loans.parcela_total, saldo_devedor: loans.saldo_devedor }
    }
  });
}
