import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  ehPerguntaCategoria, detectarAgentes, montarContextoResumido,
  SYS, supabaseAdmin,
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let contratosResumo = {
    mrr: 0,
    arr: 0,
    total_ativos: 0,
    lista: [] as any[]
  };

  if (supabaseAdmin) {
    try {
      const { data: dbContracts } = await supabaseAdmin
        .from("contracts")
        .select("*, clients(razao_social, cnpj)");
      const ativos = (dbContracts || []).filter((c: any) => c.status === "ativo");
      const mrr = ativos.reduce((acc: number, c: any) => acc + Number(c.valor_mensal || 0), 0);
      contratosResumo = {
        mrr,
        arr: mrr * 12,
        total_ativos: ativos.length,
        lista: ativos.map((c: any) => ({
          empresa: c.clients?.razao_social,
          valor_mensal: c.valor_mensal,
          vigencia_fim: c.data_fim,
          reajuste: c.indice_reajuste,
          renovacao_auto: c.renovacao_automatica
        }))
      };
    } catch (e) {
      console.warn("[Chat-AI] Erro ao carregar contratos:", e);
    }
  }

  const agentes = detectarAgentes(prompt, true);
  const contextoResumido = montarContextoResumido(ctx, agentes);

  const contextoCompleto = {
    ...contextoResumido,
    gestao_contratos_recorrentes: contratosResumo
  };
  const contextoJSON = JSON.stringify(contextoCompleto, null, 2);

  const apiKey = (typeof process !== "undefined" ? process.env.OPENAI_API_KEY || "" : "");
  const model  = (typeof process !== "undefined" ? process.env.OPENAI_MODEL || "gpt-4o-mini" : "gpt-4o-mini");

  if (!apiKey) {
    const fb = `[Consultor Financeiro Virtual Expert Energy]:
Análise de Caixa e Contratos (${month}/${year}):
• Base Recorrente MRR: R$ ${contratosResumo.mrr.toLocaleString("pt-BR", {minimumFractionDigits: 2})} (${contratosResumo.total_ativos} contratos ativos | ARR Projetado: R$ ${contratosResumo.arr.toLocaleString("pt-BR", {minimumFractionDigits: 2})}).
• Análise da Pergunta: "${prompt}"
• Estratégia Recomendada: Mantenha a previsibilidade sustentada pelos contratos vigentes e acompanhe as renovações nos próximos 90 dias com reajustes pelo IPCA/IGP-M.`;

    return NextResponse.json({
      resposta: fb,
      modulos_ativos: [...agentes, "contratos"],
      context: contextoCompleto,
      fallback: true,
    });
  }

  try {
    const sysPrompt = SYS + `\n\nVOCÊ É O DIRETOR FINANCEIRO E ESTRATÉGICO (CFO/IA) DA EXPERT ENERGY.
Você possui acesso total a:
1. Fluxo de Caixa, DRE e Custos Operacionais.
2. Planejamento, Metas e Empréstimos.
3. MÓDULO DE GESTÃO DE CONTRATOS & MRR: Base de receita recorrente mensal (MRR), ARR anualizado, renovações automáticas, consultorias de Mercado Livre (ACL), telemedição Energy Link e índices de reajuste contratual.
Responda com autoridade executiva, números precisos em R$ (BRL) e recomendações estratégicas acionáveis.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.3,
        messages: [
          { role: "system", content: sysPrompt + "\n\nCONTEXTO CONSOLIDADO (FINANCEIRO + CONTRATOS MRR):\n" + contextoJSON },
          { role: "user", content: prompt }
        ],
      })
    });

    if (!resp.ok) {
      return NextResponse.json({
        resposta: `Aviso: Análise gerada com base nos dados locais de contratos e fluxo de caixa. (MRR Ativo: R$ ${contratosResumo.mrr.toFixed(2)})`,
        context: contextoCompleto
      });
    }

    const data = await resp.json();
    const resposta = data.choices?.[0]?.message?.content || "Sem resposta da IA.";

    await logFinanceAiEvent({
      user_email: guard.user.email, user_id: guard.user.id,
      action: "chat", period_ref: `${year}-${String(month).padStart(2,"0")}`,
      prompt: prompt.slice(0, 100), response: resposta.slice(0, 100),
    });

    return NextResponse.json({
      resposta,
      modulos_ativos: [...agentes, "contratos"],
      contexto_resumido: contextoCompleto
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
