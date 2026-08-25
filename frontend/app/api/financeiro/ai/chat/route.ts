import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  calcMargins, dscr, projecaoCaixa, pctChange, anomalia, simularCenario, mean
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

const SYS = `Voce e o Copiloto Financeiro da Expert Energy. Recebe o CONTEXTO completo (Fluxo de Caixa + DRE + Custos Fixos/variaveis + Planejamento + Emprestimos + Margens + Cenarios + Projecoes 60/90d). Responda em portugues, direto, com numeros em R$, % e datas dd/mm/aaaa. NAO invente dados — use apenas o que esta no contexto. Estrutura obrigatoria: 1) Sumario executivo (1 paragrafo) 2) Analise por modulo (com numeros) 3) Comparativo historico 4) Sugestoes praticas 5) Oportunidades 6) Riscos.`;

function detectarAgentes(pergunta: string): { nome: string; ativo: boolean }[] {
  const p = pergunta.toLowerCase();
  return [
    { nome: "dre",          ativo: /(lucro|receita|despesa|margem|ebitda|resultado|dre|demonstração)/.test(p) },
    { nome: "fluxo_caixa",  ativo: /(caixa|saldo|projec|fluxo|60 dias|90 dias|déficit|receb)/.test(p) },
    { nome: "custos",       ativo: /(custo|custeio|abc|rateio|desperd|produto|unidade)/.test(p) },
    { nome: "planejamento", ativo: /(orçamento|orcame|meta|forecast|simul|cenario|cenário|ating)/.test(p) },
    { nome: "emprestimos",  ativo: /(empréstimo|emprestimo|financiamento|parcela|cet|dscr|selic|banco|divida|dívida|refinanc)/.test(p) }
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

  // Contexto enriquecido dos 5 módulos
  const ctx = await loadFinanceContextFull(year, month);
  const dreAny: any = ctx.now.dre;
  const recTot = Number(dreAny.receitas          ?? dreAny.receita         ?? dreAny.receita_total ?? 0);
  const cusTot = Number(dreAny.custo_operacional ?? dreAny.custos          ?? dreAny.custo_total   ?? 0);
  const dOp    = Number(dreAny.desp_operacional  ?? dreAny.despesas        ?? dreAny.despesa_op    ?? 0);
  const dFin   = Number(dreAny.desp_financeira   ?? dreAny.financeiro      ?? dreAny.despesa_fin   ?? 0);
  const margem = calcMargins(recTot, cusTot, dOp, dFin);
  const medEnt = mean(ctx.historico.cashflow.slice(-3).map((m:any)=>m.receita));
  const medSai = mean(ctx.historico.cashflow.slice(-3).map((m:any)=>m.despesa));
  const proj60 = projecaoCaixa(ctx.now.cashflow.saldo, medEnt, medSai, 2);
  const recTotSafe = recTot > 0 ? recTot : 1;
  const cusTotSafe = cusTot > 0 ? cusTot : 0;
  const cenReal = simularCenario(recTotSafe, cusTotSafe, 0, 0);

  const contexto = {
    periodo: { year, month, label: `${year}-${String(month).padStart(2,"0")}` },
    fluxo_caixa: ctx.now.cashflow,
    dre: {  custo: cusTot, desp_op: dOp, desp_fin: dFin,
           
           custo_operacional:   ctx.now.dre.custo_operacional,
           desp_operacional:    ctx.now.dre.desp_operacional,
           desp_financeira:     ctx.now.dre.desp_financeira },
    margens: { bruta_val: margem.margem_bruta_val, bruta_pct: margem.margem_bruta_pct, ebitda_val: margem.ebitda_val, ebitda_pct: margem.ebitda_pct, liquida_val: margem.margem_liquida_val ?? (recTot - cusTot - dOp - dFin), liquida_pct: margem.margem_liquida_pct },
    custos_mes: ((ctx.now.costs as any)?.count ?? (ctx.now.costs as any)?.items?.length ?? 0),
    planejamento: ((ctx.now.planning as any)?.count ?? (ctx.now.planning as any)?.items?.length ?? 0),
    emprestimos: { count: ((ctx.now.loans as any)?.count ?? 0), parcela_total: ((ctx.now.loans as any)?.parcela_mes ?? (ctx.now.loans as any)?.parcela_total ?? 0), saldo_devedor: ((ctx.now.loans as any)?.saldo_dev ?? (ctx.now.loans as any)?.saldo_devedor ?? 0) },
    projecoes: { sessenta_dias: proj60.saldo_futuro },
    cenarios: { realista: cenReal },
    historico_12m: ctx.historico
  };

  const agentes = detectarAgentes(pergunta);
  const agentesAtivos = agentes.filter(a => a.ativo).map(a => a.nome);

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({
      resposta: `[FALLBACK] OPENAI_API_KEY ausente. Módulos ativos: ${agentesAtivos.join(", ") || "copy"}. ` +
                `Dados do período ${contexto.periodo.label}: Saldo R$ ${ctx.now.cashflow.saldo.toLocaleString("pt-BR",{minimumFractionDigits:2})}; ` +
                `Receitas R$ ${recTot.toLocaleString("pt-BR")}; Empréstimos ${((ctx.now.loans as any)?.count ?? 0)}; ` +
                `Parcela mensal R$ ${(((ctx.now.loans as any)?.parcela_mes ?? (ctx.now.loans as any)?.parcela_total ?? 0)||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}.`,
      modulos_ativos: agentesAtivos
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
          { role: "system", content: `${SYS}

CONTEXTO FINANCEIRO ATUAL:
${JSON.stringify(ctx, null, 2)}` },
          { role: "user", content: `PERGUNTA: ${pergunta}

MODULOS DETECTADOS: ${agentesAtivos.length ? agentesAtivos.join(", ") : "todos"}

CONTEXTO_JSON: ${JSON.stringify(contexto, null, 2)}` }]
      })
    });
    const data = await resp.json();
    const resposta = data?.choices?.[0]?.message?.content || "[sem resposta da OpenAI]";

    await logFinanceAiEvent({
      user_email: guard.user.email, user_id: guard.user.id,
      action: "chat_multiagent",
      period_ref: `${year}-${String(month).padStart(2,"0")}`,
      prompt: pergunta,
      responseSummary: resposta.slice(0, 300),
      modules_used: agentesAtivos
    });

    return NextResponse.json({ resposta, modulos_ativos: agentesAtivos, contexto_resumo: contexto });
  } catch (e: any) {
    await logFinanceAiEvent({
      user_email: guard.user.email, user_id: guard.user.id,
      action: "chat_multiagent_erro",
      period_ref: `${year}-${String(month).padStart(2,"0")}`,
      prompt: pergunta,
      responseSummary: `erro: ${e.message?.slice(0,150)||"desconhecido"}`,
      modules_used: agentesAtivos
    });
    return NextResponse.json({ error: "openai_falhou", detalhe: e?.message || String(e) }, { status: 502 });
  }
}
