import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYS = `Voce e o Copiloto Financeiro da Expert Energy. Recebe o CONTEXTO FINANCEIRO COMPLETO do mes atual em JSON:
- dre: receita_bruta, impostos, cmv, lucro_bruto, despesas_administrativas/pessoal/vendas/marketing/infraestrutura, despesas_financeiras, receitas_financeiras, depreciacao_amortizacao, ebit, ebitda, irpj_csll, lucro_liquido, margens (%).
- cashflow: receita, despesa, saldo, separado manual vs auto_generated, por categoria.
- costs: fixos, variaveis (% x receita estimada), total mensal, por cost_type.
- planning: meta_total, realizado_total, gap, atingimento_pct, por Contrato Recorrente/Avulso.
- loans: count, ativos, parcela_mes, saldo_devedor_total, cet_efetivo_anual_pct (com iof+fees), cet_medio_anual_pct, iof, fees, grace_meses_ativos, ds_cr.
- projecoes 60/90d, historico_12m.
Responda em portugues com tom executivo, direto e objetivo. Use SOMENTE dados do contexto, NAO invente valores.
Formate valores em R$ (BRL) e percentuais em %. Quando envolver comparacao, destaque variacao.
Quando sugerir algo, conecte a um indicador financeiro concreto (DSCR, CET, margem, atingimento).
Responda LIVRE conforme o que foi perguntado, NAO use estrutura/blocos padronizados.`;

const agenteRegex: Array<[string, RegExp]> = [
  ["dre",          /(lucro|receita|despesa|margem|ebitda|resultado|dre|demonstra|tributo|imposto|cmv|custo)/i],
  ["fluxo_caixa",  /(caixa|saldo|projec|fluxo|60 dias|90 dias|deficit|receb|entrada|saida)/i],
  ["custos",       /(custo|custos|comiss|rateio|abc|fixo|variavel)/i],
  ["planejamento", /(planeja|meta|orcamento|simul|otimist|realis|pessimist|forecast|gap|atingimento|mensal)/i],
  ["emprestimos",  /(emprestim|financiam|cet|dscr|parcela|juros|banco|alavancag|carencia|iof)/i],
];

function detectarAgentes(p: string): string[] {
  const lower = p.toLowerCase();
  const ativos = agenteRegex.filter(([, rx]) => rx.test(lower)).map(([nome]) => nome);
  return ativos.length ? ativos : ["dre","fluxo_caixa","custos","planejamento","emprestimos"];
}

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const year   = Number(body?.year  ?? new Date().getFullYear());
  const month  = Number(body?.month ?? new Date().getMonth() + 1);
  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt_vazio" }, { status: 400 });

  const ctx = await loadFinanceContextFull(year, month);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: 500 });

  const agentes = detectarAgentes(prompt);
  const contextoJSON = JSON.stringify(ctx, null, 2);

  const apiKey = (typeof process !== "undefined" ? process.env.OPENAI_API_KEY || "" : "");
  const model  = (typeof process !== "undefined" ? process.env.OPENAI_MODEL || "gpt-4o-mini" : "gpt-4o-mini");

  if (!apiKey) {
    return NextResponse.json({ resposta: formatarFallback({ ctx, prompt, agentes }), modulos_ativos: agentes, context: ctx, fallback: true });
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.3,
        messages: [
          { role: "system", content: SYS + "\n\nCONTEXTO FINANCEIRO:\n" + contextoJSON },
          { role: "user", content: `MODULOS DETECTADOS: ${agentes.join(", ")}\n\nPERGUNTA: ${prompt}` },
        ],
      }),
    });
    const data = await resp.json();
    const resposta = data?.choices?.[0]?.message?.content || "[sem resposta da OpenAI]";

    await logFinanceAiEvent({
      user_email: guard.user.email, user_id: guard.user.id,
      action: "chat_multiagent", period_ref: `${year}-${String(month).padStart(2,"0")}`,
      prompt,
      response: `[modulos: ${agentes.join(",")}] ${resposta}`,
    });

    return NextResponse.json({ resposta, modulos_ativos: agentes, context: ctx });
  } catch (e: any) {
    await logFinanceAiEvent({
      user_email: guard.user.email, user_id: guard.user.id,
      action: "chat_multiagent_erro", period_ref: `${year}-${String(month).padStart(2,"0")}`,
      prompt,
      response: `[modulos: ${agentes.join(",")}] erro: ${e.message?.slice(0,150)||"?"}`,
    });
    return NextResponse.json({ error: "openai_falhou", detalhe: e?.message || String(e) }, { status: 502 });
  }
}

function formatarFallback({ ctx, prompt, agentes }: { ctx: any; prompt: string; agentes: string[] }): string {
  const now = ctx.now;
  const BRL = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = (n: number|null) => n == null ? "—" : `${Number(n).toFixed(1)}%`;
  const L: string[] = [];
  L.push(`[FALLBACK] OPENAI_API_KEY ausente — resposta montada direto do banco.`);
  L.push(`Sua pergunta: "${prompt}" | Modulos: ${agentes.join(", ")} | Periodo ${now.label}.`);
  if (agentes.includes("dre")) {
    L.push(`DRE: receita_bruta R$ ${BRL(now.dre.receita_bruta)} | CMV R$ ${BRL(now.dre.cmv)} | Lucro bruto R$ ${BRL(now.dre.lucro_bruto)} | EBITDA R$ ${BRL(now.dre.ebitda)} | Lucro liquido R$ ${BRL(now.dre.lucro_liquido)} (Margem ${PCT(now.dre.margem_liquida_percent)}).`);
  }
  if (agentes.includes("fluxo_caixa")) {
    L.push(`Fluxo de caixa: saldo R$ ${BRL(now.cashflow.saldo)} | entradas R$ ${BRL(now.cashflow.receita)} | saidas R$ ${BRL(now.cashflow.despesa)} (manual R$ ${BRL(now.cashflow.despesa_manual)} / auto R$ ${BRL(now.cashflow.despesa_auto)}).`);
  }
  if (agentes.includes("custos")) {
    L.push(`Custos: total mensal estimado R$ ${BRL(now.costs.total_mensal_estimado)} (fixos R$ ${BRL(now.costs.fixos)} | variaveis R$ ${BRL(now.costs.variaveis)}, base receita R$ ${BRL(now.costs.estimated_revenue_usado)}).`);
  }
  if (agentes.includes("planejamento")) {
    L.push(`Planejamento: meta R$ ${BRL(now.planning.meta_total)} | realizado R$ ${BRL(now.planning.realizado_total)} | gap R$ ${BRL(now.planning.gap)} | atingimento ${PCT(now.planning.atingimento_pct)}.`);
  }
  if (agentes.includes("emprestimos")) {
    L.push(`Emprestimos: ${now.loans.ativos} ativos | parcela_mes R$ ${BRL(now.loans.parcela_mes)} | saldo devedor R$ ${BRL(now.loans.saldo_devedor_total)} | CET efetivo ${PCT(now.loans.cet_efetivo_anual_pct)}/ano | ${now.loans.grace_meses_ativos} em carencia.`);
  }
  return L.join("\n");
}
