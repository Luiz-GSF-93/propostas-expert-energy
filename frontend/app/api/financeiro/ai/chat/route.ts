import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContext, logFinanceAiEvent,
  sumCashflow, sumDre, sumLoans, pctChange
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

const SYS = `Você é um analista financeiro sênior. Use SOMENTE os números do CONTEXTO fornecido (tabelas Supabase). Se faltar dado, diga explicitamente.

Sua resposta deve seguir este formato (em português do Brasil, tom executivo):

1) SUMÁRIO EXECUTIVO — até 4 frases com o quadro geral do período.
2) COMPARATIVO — variação % entre o mês atual e o anterior (usar campo comparativo.* do contexto).
3) 2-3 SUGESTÕES CONCRETAS DE GESTÃO — cada uma com ação + impacto estimado quando possível.
4) 1-2 OPORTUNIDADES DE MELHORIA — oportunidades vinculadas aos dados (corte, renegociação, realocação).

Sempre cite números reais (R$) e % quando existirem no contexto. Seja direto.`;

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) {
    return NextResponse.json({
      error: guard.reason, auth_status: guard.status,
      dbg: { has_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) }
    }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const pergunta = String(body?.prompt || "").trim();
  if (!pergunta) return NextResponse.json({ error: "prompt_vazio" }, { status: 400 });

  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);
  const ctx = await loadFinanceContext(year, month);

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "openai_api_key_missing" }, { status: 500 });

  const cf    = sumCashflow(ctx.now.data.cashflow);
  const cfP   = sumCashflow(ctx.anterior.data.cashflow);
  const dre   = sumDre(ctx.now.data.dre);
  const dreP  = sumDre(ctx.anterior.data.dre);
  const loans = sumLoans(ctx.now.data.loans);

  const resumo = {
    periodo_atual: ctx.periodo,
    periodo_anterior: ctx.periodo_ant,
    fluxos: {
      atual: cf,
      anterior: cfP,
      variacao_saldo_pct: pctChange(cf.saldo, cfP.saldo)
    },
    dre: {
      atual: dre,
      anterior: dreP,
      variacao_resultado_pct: pctChange(dre.resultado, dreP.resultado)
    },
    emprestimos: {
      total: loans.total,
      parcela_mensal_ativa: loans.parcela_mes,
      saldo_devedor_total: loans.saldo_total,
      distribuicao_por_status: loans.by_status,
      Contratos_detalhados: ctx.now.data.loans.map((l: any) => ({
        contract_number: l.contract_number,
        lender: l.lender,
        status: l.status,
        parcela_mensal: Number(l.current_installment_amount ?? 0),
        saldo: Number(l.balance_outstanding ?? 0),
        taxa_mensal: Number(l.monthly_rate ?? 0),
        sistema: l.amortization_system,
        proximo_vencimento: l.final_due_date
      }))
    },
    custos_ativos: ctx.now.data.costs,
    dre_linhas_detalhadas: ctx.now.data.dre.slice(0, 30),
    fluxos_detalhados: ctx.now.data.cashflow.slice(0, 50),
    planejamento: ctx.now.data.planning.slice(0, 15)
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
              `CONTEXTO FINANCEIRO (Supabase, somente leitura):\n${JSON.stringify(resumo).slice(0, 28000)}\n\n` +
              `PERGUNTA DO ADMIN:\n${pergunta}\n\n` +
              `Responda no formato pedido (sumário + comparativo + sugestões + oportunidades), citando R$ e %.`
          }
        ]
      })
    });
    const j = await r.json();
    resposta = j?.choices?.[0]?.message?.content || "[sem resposta da OpenAI]";
  } catch (e: any) {
    await logFinanceAiEvent({
      userId: guard.user.id, userEmail: guard.user.email,
      action: "error", period: ctx.periodo, prompt: pergunta,
      meta: { stage: "openai_call", error: String(e?.message || e) }
    });
    return NextResponse.json({ error: "openai_call_failed", detail: String(e?.message || e) }, { status: 502 });
  }

  await logFinanceAiEvent({
    userId: guard.user.id, userEmail: guard.user.email,
    action: "chat", period: ctx.periodo, prompt: pergunta,
    responseSummary: resposta.slice(0, 800),
    modulesUsed: Object.keys(ctx.now.tables)
  });

  return NextResponse.json({
    resposta,
    contexto_usado: {
      periodo: ctx.periodo,
      periodo_anterior: ctx.periodo_ant,
      fluxos: { atual: cf, anterior: cfP },
      dre:    { atual: dre, anterior: dreP },
      emprestimos: { total: loans.total, parcela_mensal_ativa: loans.parcela_mes, saldo_total: loans.saldo_total }
    }
  });
}
