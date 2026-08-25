import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  calcMargins, dscr, projecaoCaixa, pctChange, anomalia, simularCenario, mean
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

type Insight = { modulo: string; titulo: string; severidade: "baixa"|"media"|"alta"; detalhe: string };

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);

  const ctx = await loadFinanceContextFull(year, month);
  const cf  = ctx.now.cashflow;
  const cfP = ctx.anterior.cashflow;
  const dre = ctx.now.dre;
  const dreP = ctx.anterior.dre;
  const cust = ctx.now.costs;
  const loans = ctx.now.loans;
  const plan = ctx.now.planning;

  const medias3m = {
    entradas: mean(ctx.historico.cashflow.slice(-3).map((m: any) => m.receita)),
    saidas:   mean(ctx.historico.cashflow.slice(-3).map((m: any) => m.despesa))
  };
  const proj60 = projecaoCaixa(cf.saldo, medias3m.entradas, medias3m.saidas, 2);
  const proj90 = projecaoCaixa(cf.saldo, medias3m.entradas, medias3m.saidas, 3);

  const margins = calcMargins(dre.receitas, dre.custo_operacional, dre.desp_operacional, dre.desp_financeira);
  const DSCR = dscr(cf.saldo, loans.parcela_mes);

  // Cenários
  const cenarios = {
    otimista:   simularCenario(dre.receitas, dre.despesas,  0.10, -0.02),
    realista:   simularCenario(dre.receitas, dre.despesas,  0.02,  0.02),
    pessimista: simularCenario(dre.receitas, dre.despesas, -0.10,  0.08)
  };

  const insights: Insight[] = [];

  // --- 1) FLUXO DE CAIXA ---
  {
    const d = pctChange(cf.saldo, cfP.saldo);
    let sev: Insight["severidade"] = "baixa";
    if (cf.saldo < 0 || (d !== null && d < -10)) sev = "alta";
    else if (d !== null && d < 0) sev = "media";
    insights.push({
      modulo: "fluxo_caixa",
      titulo: cf.saldo >= 0 ? "Fluxo de caixa positivo" : "Fluxo de caixa negativo",
      severidade: sev,
      detalhe: `Saldo ${ctx.periodo}: R$ ${cf.saldo.toFixed(2)} ` +
               `(receitas R$ ${cf.receita.toFixed(2)} · despesas R$ ${cf.despesa.toFixed(2)}). ` +
               `Variação vs ${ctx.periodo_anterior}: ${d === null ? "sem base" : (d >= 0 ? "+" : "") + d.toFixed(1) + "%"}. ` +
               `Projeção 60d: R$ ${proj60.saldo_futuro.toFixed(2)} · 90d: R$ ${proj90.saldo_futuro.toFixed(2)}.` +
               (proj60.meses_ate_deficit ? ` ⚠️ Risco de déficit em ~${proj60.meses_ate_deficit} meses.` : "")
    });
  }

  // --- 2) DRE / Margens ---
  {
    insights.push({
      modulo: "dre",
      titulo: dre.resultado >= 0 ? "Resultado positivo no mês" : "Resultado negativo no mês",
      severidade: dre.resultado >= 0 ? "baixa" : "alta",
      detalhe: `Receitas R$ ${dre.receitas.toFixed(2)} (operacional R$ ${dre.receita_operacional.toFixed(2)} + financeira R$ ${dre.receita_financeira.toFixed(2)}). ` +
               `Despesas R$ ${dre.despesas.toFixed(2)} (custo operacional R$ ${dre.custo_operacional.toFixed(2)} + ` +
               `desp. operacional R$ ${dre.desp_operacional.toFixed(2)} + desp. financeira R$ ${dre.desp_financeira.toFixed(2)}). ` +
               `Margem Bruta ${margins.margem_bruta_pct?.toFixed(1) ?? "n/d"}% · EBITDA ${margins.ebitda_pct?.toFixed(1) ?? "n/d"}% ` +
               `(R$ ${margins.ebitda_val.toFixed(2)}) · Margem Líquida ${margins.margem_liquida_pct?.toFixed(1) ?? "n/d"}%.`
    });

    // Anomalia histórica
    const histReceitas = ctx.historico.dre.map(d => d.receitas);
    const anomR = anomalia(dre.receitas, histReceitas);
    if (anomR.is_anomalia) {
      insights.push({
        modulo: "dre",
        titulo: "Anomalia: receita do mês fora do padrão histórico",
        severidade: "alta",
        detalhe: `Receita R$ ${dre.receitas.toFixed(2)} vs média hist 12m R$ ${anomR.media.toFixed(2)} ` +
                 `(desvio R$ ${anomR.desvio.toFixed(2)}; limite superior R$ ${anomR.limite_sup.toFixed(2)}).`
      });
    }
  }

  // --- 3) CUSTOS ---
  {
    const anomC = anomalia(cust.total, ctx.historico.custos_mensais);
    insights.push({
      modulo: "custos",
      titulo: `${cust.count} custo(s) cadastrado(s)`,
      severidade: cust.total > cf.receita * 0.6 ? "alta" : "baixa",
      detalhe: `Mensal: R$ ${cust.total.toFixed(2)} (fixos R$ ${cust.fixos.toFixed(2)} + variáveis R$ ${cust.variaveis.toFixed(2)}). ` +
               `Top categorias: ${Object.entries(cust.por_categoria).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v]) => `${k} R$ ${v.toFixed(0)}`).join(" | ")}. ` +
               (anomC.is_anomalia ? `⚠️ Total atual acima do limite estatístico (R$ ${anomC.limite_sup.toFixed(2)}).` : "")
    });
  }

  // --- 4) PLANEJAMENTO / ORÇAMENTO ---
  {
    if (plan.count === 0) {
      insights.push({
        modulo: "planejamento",
        titulo: "Sem metas/orçamento cadastrado",
        severidade: "media",
        detalhe: `Cadastre metas em ${ctx.tables.planning} para comparar realizado × orçado.`
      });
    } else {
      const cump = plan.metas_total > 0 ? (plan.realizado_total / plan.metas_total) * 100 : 0;
      insights.push({
        modulo: "planejamento",
        titulo: cump >= 90 ? "Orçamento em dia ou acima" : cump >= 70 ? "Orçamento parcialmente cumprido" : "Orçamento abaixo do planejado",
        severidade: cump >= 90 ? "baixa" : cump >= 70 ? "media" : "alta",
        detalhe: `Metas R$ ${plan.metas_total.toFixed(2)} · Realizado R$ ${plan.realizado_total.toFixed(2)} · Cumprimento ${cump.toFixed(1)}%.`
      });
    }
  }

  // --- 5) EMPRÉSTIMOS / FINANCIAMENTOS ---
  {
    const cetTxt = loans.cet_medio_anual > 0 ? ` · CET médio anual ${loans.cet_medio_anual.toFixed(1)}%` : "";
    const dscrTxt = DSCR === null ? "" : ` · DSCR ${DSCR.toFixed(2)} ${DSCR >= 1.2 ? "(saudável)" : DSCR >= 1 ? "(atenção)" : "(risco)"}`;
    insights.push({
      modulo: "emprestimos",
      titulo: `${loans.total} contrato(s) — ${loans.ativos} ativo(s)`,
      severidade: loans.parcela_mes > cf.receita * 0.3 ? "alta" : "media",
      detalhe: `Parcela mensal ativa: R$ ${loans.parcela_mes.toFixed(2)} · Saldo devedor: R$ ${loans.saldo_total.toFixed(2)}${cetTxt}${dscrTxt}. ` +
               `Distribuição: ${Object.entries(loans.by_status).map(([s,v]) => `${s}=${v.count}`).join(", ")}.`
    });

    // Refinanciamento: simular redução
    if (loans.parcela_mes > 0 && loans.cet_medio_anual > 0) {
      const novaTaxaMes = 0.011; // 1,1% a.m.
      const novaParcela = (loans.saldo_total * novaTaxaMes) / (1 - Math.pow(1 + novaTaxaMes, -Math.max(12, 24)));
      const economiaMensal = loans.parcela_mes - novaParcela;
      insights.push({
        modulo: "emprestimos",
        titulo: "Simulação: refinanciar a 1,1% a.m.",
        severidade: economiaMensal > 0 ? "media" : "baixa",
        detalhe: `Parcela atual R$ ${loans.parcela_mes.toFixed(2)} vs nova R$ ${novaParcela.toFixed(2)} ` +
                 `→ economia mensal R$ ${economiaMensal.toFixed(2)} (anual R$ ${(economiaMensal * 12).toFixed(2)}).`
      });
    }
  }

  // ---------- Sugestões automáticas ----------
  const sugestoes: string[] = [];
  if (cf.saldo < 0) sugestoes.push(`Rever política de recebíveis — saldo negativo de R$ ${Math.abs(cf.saldo).toFixed(2)} em ${ctx.periodo}.`);
  if (cf.outros > 0) sugestoes.push(`Tipificar ${cf.outros.toFixed(2)} em lançamentos sem type em ${ctx.tables.cashflow} para visão completa.`);
  if (dre.despesas > 0 && dre.receitas > 0 && (dre.despesas / dre.receitas) > 0.95) {
    sugestoes.push(`Cortar/reduzir despesas variáveis — despesas estão em ${((dre.despesas / dre.receitas) * 100).toFixed(0)}% da receita.`);
  }
  if (cust.fixos > cf.receita * 0.5) {
    sugestoes.push(`Custos fixos (R$ ${cust.fixos.toFixed(2)}) representam >50% da receita; avaliar contratos renegociáveis.`);
  }
  if (loans.parcela_mes > cf.receita * 0.35) {
    sugestoes.push(`Parcela mensal (R$ ${loans.parcela_mes.toFixed(2)}) consome >35% da receita; considerar amortização extraordinária ou refinanciamento.`);
  }
  if (DSCR !== null && DSCR < 1.2) {
    sugestoes.push(`DSCR ${DSCR.toFixed(2)} abaixo do mínimo confortável (1.2); recomenda-se melhorar fluxo operacional antes de nova dívida.`);
  }
  if (proj90.meses_ate_deficit !== null && proj90.meses_ate_deficit <= 3) {
    sugestoes.push(`⚠️ Caixa pode zerar em ~${proj90.meses_ate_deficit} meses se tendência recente se mantiver.`);
  }

  // ---------- Oportunidades ----------
  const oportunidades: string[] = [];
  if (cenarios.otimista.lucro > dre.resultado + dre.resultado * 0.15) {
    oportunidades.push(`Em cenário otimista (+10% receita, -2% despesa), lucro aumenta R$ ${(cenarios.otimista.lucro - dre.resultado).toFixed(2)}.`);
  }
  if (loans.parcela_mes > 0 && loans.cet_medio_anual > 0) {
    oportunidades.push(`Renegociação dos contratos a uma taxa média de 1,1% a.m. pode liberar fluxo mensal significativo.`);
  }
  if (cust.variaveis > 0 && cust.fixos > 0) {
    oportunidades.push(`Mix atual ${cust.fixos.toFixed(0)}/${cust.variaveis.toFixed(0)} (fixo/variável): avaliar conversão para reduzir exposição a volume.`);
  }

  await logFinanceAiEvent({
    userId: guard.user.id, userEmail: guard.user.email,
    action: "overview",
    period: ctx.periodo,
    modulesUsed: Object.keys(ctx.tables),
    meta: {
      counts: { cf: cf.count, dre: dre.linhas, cust: cust.count, loans: loans.total, plan: plan.count },
      margens: margins,
      DSCR, proj60, proj90,
      cet_medio: loans.cet_medio_anual,
      cenarios
    }
  });

  return NextResponse.json({
    periodo: ctx.periodo,
    periodo_anterior: ctx.periodo_anterior,
    modulos: {
      fluxo_caixa:    { totais: cf,    media_3m: medias3m, projetado: { d60: proj60, d90: proj90 } },
      dre:            { totais: dre,   margens: margins },
      custos:         { totais: cust },
      planejamento:   { totais: plan },
      emprestimos:    { totais: loans, DSCR, cet_medio_anual: loans.cet_medio_anual }
    },
    insights,
    sugestoes,
    oportunidades,
    cenarios,
    tabelas_usadas: ctx.tables
  });
}
