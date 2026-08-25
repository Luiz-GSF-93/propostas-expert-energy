import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  calcMargins, projecaoCaixa, simularCenario, mean
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

const SYS = `Voce e um CFO virtual da Expert Energy com acesso simultaneo aos 5 modulos financeiros:
1) FLUXO DE CAIXA  2) DRE (margem/EBITDA)  3) CUSTOS  4) PLANEJAMENTO/ORCAMENTO  5) EMPRESTIMOS/FINANCIAMENTOS

REGRAS OBRIGATORIAS:
- Use SOMENTE os numeros do CONTEXTO_JSON abaixo. Se faltar dado, declare explicitamente.
- SEMPRE investigue TODOS os 5 modulos antes de responder perguntas sobre "lucro", "caixa", "custos", "financiamento", "previsao" ou "analise geral".
- Perguntas temporais ("ultimos 12 meses", "este ano") → use historico_12m do frontend.
- Perguntas futuras ("como ficara", "proximos 90 dias") → use projecoes e cenarios.
- Cite valores em R$ e % sempre que possivel.

FORMATO DA RESPOSTA (portugues-BR, tom executivo):
1) SUMARIO EXECUTIVO - 3-4 frases com o quadro geral.
2) POR MODULO - analise curta de cada modulo relevante (cite R$ e %).
3) COMPARATIVO - variacao atual vs anterior quando aplicavel.
4) SUGESTOES DE GESTAO - 2-4 acoes concretas com impacto financeiro estimado.
5) OPORTUNIDADES - 1-3 melhorias vinculadas aos dados.
6) RISCOS / ALERTAS - DSCR<1.2, projecao negativa, anomalia estatistica detectada.`;

function detectarAgentes(pergunta: string): { nome: string; ativo: boolean }[] {
  const p = pergunta.toLowerCase();
  return [
    { nome: "dre",          ativo: /(lucro|receita|despesa|margem|ebitda|resultado|dre|demonstra)/.test(p) },
    { nome: "fluxo_caixa",  ativo: /(caixa|saldo|projec|fluxo|60 dias|90 dias|deficit|receb)/.test(p) },
    { nome: "custos",       ativo: /(custo|custeio|abc|rateio|desperd|produto|unidade)/.test(p) },
    { nome: "planejamento", ativo: /(orcamento|orcame|meta|forecast|simul|cenario|ating)/.test(p) },
    { nome: "emprestimos",  ativo: /(emprestimo|financiamento|parcela|cet|dscr|selic|banco|divida|refinanc)/.test(p) }
  ];
}

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

  // Contexto enriquecido dos 5 modulos
  const ctx = await loadFinanceContextFull(year, month);

  // TIPOS REAIS DO server.ts:
  //   CFTotals:   { receita, despesa, outros, saldo, count }
  //   DRETotals:  { receitas, despesas, resultado, linhas, receita_operacional,
  //                 receita_financeira, custo_operacional, desp_operacional, desp_financeira }
  //   LoanTotals: { total, ativos, parcela_mes, saldo_total, cet_medio_anual, by_status, all }
  //   calcMargins: { margem_bruta_val, margem_bruta_pct, ebitda_val, ebitda_pct,
  //                  margem_liquida_val, margem_liquida_pct }
  const dre: any   = ctx.now.dre;
  const cf: any    = ctx.now.cashflow;
  const cust: any  = ctx.now.costs;
  const plan: any  = ctx.now.planning;
  const loans: any = ctx.now.loans;

  const receita  = Number(dre.receitas           || 0);
  const custoOp  = Number(dre.custo_operacional  || 0);
  const despOp   = Number(dre.desp_operacional   || 0);
  const despFin  = Number(dre.desp_financeira    || 0);
  const margem   = calcMargins(receita, custoOp, despOp, despFin);

  const medEnt = mean((ctx.historico.cashflow || []).slice(-3).map((m: any) => Number(m?.receita || 0)));
  const medSai = mean((ctx.historico.cashflow || []).slice(-3).map((m: any) => Number(m?.despesa || 0)));
  const proj60 = projecaoCaixa(Number(cf.saldo || 0), Number(medEnt), Number(medSai), 2);

  const recSafe = receita > 0 ? receita : 1;
  const cusSafe = custoOp;
  const cenReal = simularCenario(recSafe, cusSafe, 0, 0);

  const contexto = {
    periodo: { year, month, label: `${year}-${String(month).padStart(2, "0")}` },
    fluxo_caixa: {
      saldo:   Number(cf.saldo   || 0),
      receita: Number(cf.receita || 0),
      despesa: Number(cf.despesa || 0),
      outros:  Number(cf.outros  || 0),
      count:   Number(cf.count   || 0)
    },
    dre: {
      receita:              receita,
      custo_operacional:    custoOp,
      desp_operacional:     despOp,
      desp_financeira:      despFin,
      receita_operacional:  Number(dre.receita_operacional || 0),
      receita_financeira:   Number(dre.receita_financeira  || 0),
      resultado:            Number(dre.resultado || 0),
      linhas:               Number(dre.linhas || 0)
    },
    margens: {
      margem_bruta_val:   margem.margem_bruta_val,
      margem_bruta_pct:   margem.margem_bruta_pct,
      ebitda_val:         margem.ebitda_val,
      ebitda_pct:         margem.ebitda_pct,
      margem_liquida_val: margem.margem_liquida_val,
      margem_liquida_pct: margem.margem_liquida_pct
    },
    custos: {
      itens:         cust?.items?.length ?? cust?.count ?? 0,
      fixos:         Number(cust?.fixos     ?? 0),
      variaveis:     Number(cust?.variaveis ?? 0),
      por_categoria: cust?.por_categoria   ?? {}
    },
    planejamento: {
      itens: plan?.items?.length ?? plan?.count ?? 0
    },
    emprestimos: {
      total:           Number(loans?.total           ?? 0),
      ativos:          Number(loans?.ativos          ?? 0),
      parcela_mes:     Number(loans?.parcela_mes     ?? 0),
      saldo_total:     Number(loans?.saldo_total     ?? 0),
      cet_medio_anual: Number(loans?.cet_medio_anual ?? 0)
    },
    projecoes: {
      sessenta_dias:      proj60.saldo_futuro,
      media_entradas_3m:  Number(medEnt),
      media_saidas_3m:    Number(medSai)
    },
    cenarios: { realista: cenReal }
  };

  const agentes = detectarAgentes(pergunta);
  const agentesAtivos = agentes.filter((a) => a.ativo).map((a) => a.nome);
  const modulosMsg = agentesAtivos.length > 0 ? agentesAtivos.join(", ") : "todos";

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({
      resposta:
        `[FALLBACK - OPENAI_API_KEY ausente] Modulos investigados: ${modulosMsg}. ` +
        `Periodo ${contexto.periodo.label}: Saldo R$ ${contexto.fluxo_caixa.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}; ` +
        `Receitas R$ ${receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}; ` +
        `Emprestimos ativos ${contexto.emprestimos.ativos}/${contexto.emprestimos.total}; ` +
        `Parcela mensal R$ ${contexto.emprestimos.parcela_mes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}; ` +
        `CET medio ${contexto.emprestimos.cet_medio_anual.toFixed(2)}%; ` +
        `Projecao 60d: R$ ${proj60.saldo_futuro.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
      modulos_ativos: agentesAtivos,
      contexto
    });
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: SYS },
          {
            role: "user",
            content:
              `PERGUNTA: ${pergunta}\n\n` +
              `MODULOS DETECTADOS: ${modulosMsg}\n\n` +
              `CONTEXTO_JSON: ${JSON.stringify(contexto, null, 2)}`
          }
        ]
      })
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      await logFinanceAiEvent({
        user_email: guard.user.email,
        user_id: guard.user.id,
        action: "chat_openai_erro",
        period_ref: `${year}-${String(month).padStart(2, "0")}`,
        prompt: pergunta,
        responseSummary: `OpenAI status ${resp.status}: ${errTxt.slice(0, 200)}`,
        modules_used: agentesAtivos
      });
      return NextResponse.json(
        { error: "openai_falhou", status: resp.status, detalhe: errTxt.slice(0, 500) },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const resposta = data?.choices?.[0]?.message?.content || "[sem conteudo na resposta da OpenAI]";

    await logFinanceAiEvent({
      user_email: guard.user.email,
      user_id: guard.user.id,
      action: "chat_multiagent_v4",
      period_ref: `${year}-${String(month).padStart(2, "0")}`,
      prompt: pergunta,
      responseSummary: resposta.slice(0, 300),
      modules_used: agentesAtivos
    });

    return NextResponse.json({
      resposta,
      modulos_ativos: agentesAtivos,
      contexto_resumo: contexto
    });
  } catch (e: any) {
    await logFinanceAiEvent({
      user_email: guard.user.email,
      user_id: guard.user.id,
      action: "chat_multiagent_excecao",
      period_ref: `${year}-${String(month).padStart(2, "0")}`,
      prompt: pergunta,
      responseSummary: `excecao: ${e?.message?.slice(0, 150) || "desconhecido"}`,
      modules_used: agentesAtivos
    });
    return NextResponse.json(
      { error: "openai_excecao", detalhe: e?.message || String(e) },
      { status: 502 }
    );
  }
}
