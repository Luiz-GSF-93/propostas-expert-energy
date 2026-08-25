import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  calcMargins, dscr, projecaoCaixa, pctChange, anomalia, mean
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

const SYS = `Você é um CFO virtual com acesso aos 5 módulos financeiros do projeto Expert Energy:
  1) FLUXO DE CAIXA  2) DRE  3) CUSTOS  4) PLANEJAMENTO/ORÇAMENTO  5) EMPRÉSTIMOS/FINANCIAMENTOS

REGRAS:
- Use SOMENTE números do CONTEXTO. Se faltar dado, declare explicitamente.
- Ao ser perguntado sobre "lucro", "caixa", "custos", "financiamento", "previsão" → INVESTIGUE TODOS OS 5 MÓDULOS antes de responder.
- Para perguntas de variação temporal ("últimos 12 meses", "este ano"), use a seção historico_12m.
- Para perguntas de futuro ("como ficará", "próximos 90 dias"), use projecoes e cenarios.

FORMATO DA RESPOSTA (português-BR, tom executivo):
1) SUMÁRIO EXECUTIVO — 3-4 frases com quadro geral.
2) POR MÓDULO — análise curta dos 5 módulos quando relevante (cite R$ e %).
3) COMPARATIVO — variação atual vs anterior quando aplicável.
4) SUGESTÕES DE GESTÃO — 2-4 ações concretas com impacto.
5) OPORTUNIDADES — 1-3 melhorias vinculadas aos dados.
6) RISCOS / ALERTAS — se DSCR<1.2, projeção negativa ou anomalia estatística detectada.`;

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const pergunta = String(body?.prompt ?? "").trim();
  if (!pergunta) return NextResponse.json({ error: "prompt_vazio" }, { status: 400 });

  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);
  const ctx = await loadFinanceContextFull(year, month);

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "openai_api_key_missing" }, { status: 500 });

  // ---------- Cálculos analíticos para o contexto ----------
  const cf = ctx.now.cashflow;
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
  const margens = calcMargins(dre.receitas, dre.custo_operacional, dre.desp_operacional, dre.desp_financeira);
  const DSCR = dscr(cf.saldo, loans.parcela_mes);

  // Histórico 12 meses para perguntas de(year-ending)
  const histo12 = {
    cashflow_12m: ctx.historico.cashflow.map((m: any, i: number) => ({ mes: ctx.historico.labels[i], receita: m.receita, despesa: m.despesa, saldo: m.saldo })),
    dre_12m:      ctx.historico.dre.map((m: any, i: number) => ({ mes: ctx.historico.labels[i], receita: m.receitas, despesa: m.despesas, resultado: m.resultado })),
    soma_receitas_12m: ctx.historico.dre.reduce((s: number, m: any) => s + m.receitas, 0),
    soma_despesas_12m: ctx.historico.dre.reduce((s: number, m: any) => s + m.despesas, 0),
    soma_resultado_12m: ctx.historico.dre.reduce((s: number, m: any) => s + m.resultado, 0)
  };

  // Anomalias
  const anomR = anomalia(dre.receitas, ctx.historico.dre.map((d: any) => d.receitas));
  const anomD = anomalia(dre.despesas, ctx.historico.dre.map((d: any) => d.despesas));

  // Detecção de intenção para enriquecer contexto
  const lower = pergunta.toLowerCase();
  const wants =
    (lower.includes("lucro") || lower.includes("caiu") || lower.includes("cair")) ? "investigacao_resultado" :
    (lower.includes("caixa") || lower.includes("60 dias") || lower.includes("90 dias") || lower.includes("sald")) ? "projecao_caixa" :
    (lower.includes("financiament") || lower.includes("empréstim") || lower.includes("cet") || lower.includes("antecipar") || lower.includes("refinanc")) ? "emprestimos" :
    (lower.includes("custo") || lower.includes("despes")) ? "custos" :
    (lower.includes("orcament") || lower.includes("planej") || lower.includes("meta")) ? "planejamento" :
    (lower.includes("12 meses") || lower.includes("último ano") || lower.includes("ano")) ? "historico_12m" :
    (lower.includes("simul") || lower.includes("cenario") || lower.includes("otimista") || lower.includes("pessimista")) ? "simulacao" :
    "geral";

  // Cenário automático (otimista / realista / pessimista) — sempre presente
  const cenarios = {
    otimista:   { receita: dre.receitas * 1.10, custos: dre.despesas * 0.98, lucro: dre.receitas * 1.10 - dre.despesas * 0.98 },
    realista:   { receita: dre.receitas * 1.02, custos: dre.despesas * 1.02, lucro: dre.receitas * 1.02 - dre.despesas * 1.02 },
    pessimista: { receita: dre.receitas * 0.90, custos: dre.despesas * 1.08, lucro: dre.receitas * 0.90 - dre.despesas * 1.08 }
  };

  const contexto = {
    intencao_detectada: wants,
    periodo_atual:      ctx.periodo,
    periodo_anterior:   ctx.periodo_anterior,
    tabelas_usadas:     ctx.tables,

    fluxo_caixa: {
      atual: cf, anterior: cfP,
      variacao_saldo_pct: pctChange(cf.saldo, cfP.saldo),
      media_3m_entradas: medias3m.entradas,
      media_3m_saidas:   medias3m.saidas,
      projecao_60d: proj60,
      projecao_90d: proj90
    },

    dre: {
      atual: dre, anterior: dreP,
      variacao_receita_pct:   pctChange(dre.receitas,   dreP.receitas),
      variacao_despesa_pct:   pctChange(dre.despesas,   dreP.despesas),
      variacao_resultado_pct: pctChange(dre.resultado,  dreP.resultado),
      margens,
      anomalias: { receita_recente: anomR, despesa_recente: anomD }
    },

    custos: {
      totais: cust,
      mensal_total: cust.total,
      anual_estimado: cust.total * 12,
      concentracao_categoria: Object.entries(cust.por_categoria).sort((a,b)=>b[1]-a[1])
    },

    planejamento: {
      totais: plan,
      metas_total: plan.metas_total,
      realizado_total: plan.realizado_total,
      cumprimento_pct: plan.metas_total > 0 ? (plan.realizado_total / plan.metas_total) * 100 : null
    },

    emprestimos: {
      totais: loans,
      parcela_mensal_ativa: loans.parcela_mes,
      saldo_devedor_total: loans.saldo_total,
      cet_medio_anual: loans.cet_medio_anual,
      DSCR,
      distribuicao_por_status: loans.by_status,
      refinanciamento_simulado_1_1_am: loans.parcela_mes > 0 && loans.cet_medio_anual > 0
        ? {
            nova_parcela_mensal: (loans.saldo_total * 0.011) / (1 - Math.pow(1.011, -36)),
            economia_mensal:     loans.parcela_mes - (loans.saldo_total * 0.011) / (1 - Math.pow(1.011, -36)),
            economia_anual:      (loans.parcela_mes - (loans.saldo_total * 0.011) / (1 - Math.pow(1.011, -36))) * 12
          } : null,
      contratos_detalhados: ctx.now.brutas.loans.slice(0, 20).map((l: any) => ({
        contrato: l.contract_number, banco: l.lender, status: l.status,
        parcela_mensal: Number(l.current_installment_amount ?? 0),
        saldo_devedor:  Number(l.balance_outstanding ?? 0),
        taxa_mensal:    Number(l.monthly_rate ?? (l.annual_rate ? l.annual_rate/12 : 0)),
        sistema:        l.amortization_system,
        proximo_venc:   l.final_due_date
      }))
    },

    cenarios,
    historico_12m: histo12
  };

  let resposta = "";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.25,
        messages: [
          { role: "system", content: SYS },
          { role: "user", content:
              `CONTEXTO FINANCEIRO (Supabase, somente leitura — intencao_detectada="${wants}"):\n` +
              `${JSON.stringify(contexto).slice(0, 28000)}\n\n` +
              `PERGUNTA DO ADMIN: ${pergunta}\n\n` +
              `Responda no formato: sumario -> por módulo -> comparativo -> sugestões -> oportunidades -> riscos. Cite R$ e %.` }
        ]
      })
    });
    const j = await r.json();
    resposta = j?.choices?.[0]?.message?.content || "[sem resposta da OpenAI]";
    // Fallback útil se a chave estiver inválida
    if (j?.error) {
      return NextResponse.json({ error: "openai_error", detail: j.error.message }, { status: 502 });
    }
  } catch (e: any) {
    await logFinanceAiEvent({ userId: guard.user.id, userEmail: guard.user.email, action: "error", period: ctx.periodo, prompt: pergunta, meta: { stage: "openai_call", error: String(e?.message || e) } });
    return NextResponse.json({ error: "openai_call_failed", detail: String(e?.message || e) }, { status: 502 });
  }

  await logFinanceAiEvent({
    userId: guard.user.id, userEmail: guard.user.email,
    action: "chat", period: ctx.periodo, prompt: pergunta,
    responseSummary: resposta.slice(0, 800),
    modulesUsed: Object.keys(ctx.tables),
    meta: { intencao: wants, DSCR, cet: loans.cet_medio_anual }
  });

  return NextResponse.json({
    resposta,
    intencao_detectada: wants,
    contexto_resumido: {
      periodo: ctx.periodo,
      cf_saldo: cf.saldo, dre_resultado: dre.resultado, margem_ebitda_pct: margens.ebitda_pct,
      custos_mensal: cust.total, emprestimos_parcela: loans.parcela_mes,
      emprestimos_cet_medio: loans.cet_medio_anual, DSCR,
      projecao_60d: proj60.saldo_futuro, projecao_90d: proj90.saldo_futuro,
      soma_resultado_12m: histo12.soma_resultado_12m
    }
  });
}
