import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContext, logFinanceAiEvent
} from "@/lib/financeiro/ai/server";
export const runtime = "nodejs";

const SYS = "Você é um analista financeiro sênior. Use SOMENTE os números do contexto Supabase. Se faltar dado, diga explicitamente. Tom executivo, português do Brasil, até 6 bullets ou 1 parágrafo curto.";

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const pergunta = String(body?.prompt || "").trim();
  if (!pergunta) return NextResponse.json({ error: "prompt_vazio" }, { status: 400 });

  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);
  const ctx = await loadFinanceContext(year, month);

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "openai_api_key_missing" }, { status: 500 });

  const resumo = {
    periodo: ctx.periodo,
    contagens: {
      fluxo_caixa: ctx.data.cashflow.length, dre: ctx.data.dre.length,
      custos: ctx.data.costs.length, emprestimos: ctx.data.loans.length,
      planejamento: ctx.data.planning.length
    },
    amostras: {
      cashflow: ctx.data.cashflow.slice(0,20),
      dre:      ctx.data.dre.slice(0,20),
      costs:    ctx.data.costs.slice(0,20),
      loans:    ctx.data.loans.slice(0,5),
      planning: ctx.data.planning.slice(0,10)
    }
  };

  let resposta = "";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: `CONTEXTO (Supabase, somente leitura):\n${JSON.stringify(resumo).slice(0,28000)}\n\nPERGUNTA DO ADMIN:\n${pergunta}` }
        ]
      })
    });
    const j = await r.json();
    resposta = j?.choices?.[0]?.message?.content || "[sem resposta da OpenAI]";
  } catch (e: any) {
    await logFinanceAiEvent({
      userId: guard.user.id, userEmail: guard.user.email,
      action: "error", period: ctx.periodo, prompt: pergunta,
      meta: { stage: "openai_call", error: String(e?.message||e) }
    });
    return NextResponse.json({ error: "openai_call_failed", detail: String(e?.message||e) }, { status: 502 });
  }

  await logFinanceAiEvent({
    userId: guard.user.id, userEmail: guard.user.email,
    action: "chat", period: ctx.periodo, prompt: pergunta,
    responseSummary: resposta.slice(0,500),
    modulesUsed: Object.keys(ctx.tables)
  });

  return NextResponse.json({ resposta, contexto: { periodo: ctx.periodo, contagens: resumo.contagens } });
}
