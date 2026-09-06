// === DIAG-AI-REPORT-ROUTE-V4-ENTERPRISE ===
// Gera relatório consultivo profundo com base nos dados das Seções 2 a 13 do EnergiaPro.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

function safeText(s: unknown, max = 300): string {
  const v = typeof s === "string" ? s : s == null ? "" : String(s);
  return v.length > max ? v.slice(0, max) + "..." : v;
}

function buildSysPrompt(): string {
  return [
    "# VOCÊ É UM DIRETOR E CONSULTOR SÊNIOR DE ENGENHARIA DE ENERGIA E CFO ADVISOR DA EXPERT ENERGY PERFORMANCE",
    "",
    "## Missão e Diretrizes Críticas",
    "Você deve elaborar um Parecer Técnico-Executivo e Estratégico de alto nível para a diretoria e conselho da empresa cliente.",
    "Analise detalhadamente todos os dados extraídos das seções 2 a 13 do diagnóstico da planta (demanda, faturas, cargas elétricas/térmicas, multas de reativo, ultrapassagens, geração on-site e viabilidade econômico-financeira).",
    "",
    "## Regras Inegociáveis de Rigor Técnico e Financeiro",
    "1. NÃO invente números. Utilize estritamente os valores presentes no payload fornecido (fatura baseline, nova fatura, economia, multas reais, CAPEX, VPL, TIR e Payback).",
    "2. SEJA CRÍTICO E REALISTA SOBRE A VIABILIDADE ECONÔMICO-FINANCEIRA (PERSPECTIVA DE CFO):",
    "   - Se o investimento (CAPEX) for muito alto e o prazo de retorno (Payback) for longo (ex: > 6 a 8 anos) e a TIR for próxima ou abaixo do custo de oportunidade (WACC/CDI), alerte a diretoria de forma transparente que o investimento em ativos pesados de geração on-site pode não ser prioritário no curto prazo.",
    "   - Nesses casos, aponte enfaticamente quais medidas são de ALTO IMPACTO IMEDIATO E ZERO/BAIXO CAPEX (ex: eliminação de multas de excedente reativo, ajuste da demanda contratada para evitar perdas contratuais, eficiência térmica operacional e migração/gestão de mercado livre).",
    "3. Enfatize o papel da consultoria da Expert Energy Performance em engenharia de aplicação, assessoria regulatória e telemetria setorizada para guiar o cliente na priorização dos investimentos mais inteligentes.",
    "4. Destaque o impacto de sustentabilidade ESG (emissões de CO2 evitadas).",
    "5. NÃO utilize asteriscos duplos (**) para negrito ou qualquer formatação especial que polua a leitura. Escreva em parágrafos contínuos, fluidos e justificados.",
    "",
    "## Estrutura Obrigatória do Relatório (Use exatamente estes 5 títulos Markdown):",
    "",
    "### 1. Perfil Operacional e Diagnóstico Energético Atual (Baseline)",
    "### 2. Engenharia de Soluções e Comparativo: Baseline vs. Cenário Proposto",
    "### 3. Viabilidade Econômico-Financeira e Sensibilidade de Retorno",
    "### 4. Ganhos Operacionais, Digitalização e Governança da Planta",
    "### 5. Matriz de Riscos, Limites de Coerência e Plano de Ação Priorizado"
  ].join("\n");
}

async function callOpenAI(sys: string, user: string, extSignal: AbortSignal): Promise<string> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  extSignal.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => ctl.abort(), 85_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.20,
        max_tokens: 3000,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      }),
      signal: ctl.signal
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error("OpenAI HTTP " + resp.status + ": " + text.slice(0, 200));
    }
    const json = JSON.parse(text);
    return json?.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timeout);
    extSignal.removeEventListener("abort", onAbort);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "config_error", message: "OPENAI_API_KEY ausente no servidor" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const prompt     = String(body?.prompt ?? "").trim();
    const summary    = body?.summary ?? null;
    const diagnostic = body?.diagnostic ?? null;

    if (!prompt) {
      return NextResponse.json({ error: "missing_prompt", message: "Payload de dados do diagnóstico ausente." }, { status: 400 });
    }

    const sys = buildSysPrompt();
    const report = await callOpenAI(sys, prompt, req.signal);

    return NextResponse.json({
      ok: true,
      report,
      summary,
      diagnostic,
      generatedAt: new Date().toISOString(),
      meta: {
        latency_ms: Date.now() - startedAt,
        model: OPENAI_MODEL,
      },
    });
  } catch (e: any) {
    console.error("[/api/diagnosticos/[id]/ai-report] erro:", e?.message);
    return NextResponse.json(
      { error: "internal_error", message: safeText(e?.message ?? e, 300) },
      { status: 500 }
    );
  }
}
