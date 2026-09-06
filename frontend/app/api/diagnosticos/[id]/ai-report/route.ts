// frontend/app/api/diagnosticos/[id]/ai-report/route.ts
// === DIAG-AI-REPORT-ROUTE-V5-DYNAMIC ===
// Gera relatório consultivo profundo com base nos dados dinâmicos reais enviados pelo frontend.
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
    "# VOCÊ É UM CONSULTOR SÊNIOR EM ENGENHARIA DE ENERGIA E GOVERNANÇA DA EXPERT ENERGY",
    "",
    "## Missão e Diretrizes",
    "Você deve elaborar um Parecer Técnico-Executivo e Estratégico de Engenharia e Eficiência Energética de alto nível para a diretoria da empresa cliente.",
    "Analise detalhadamente todos os dados extraídos do diagnóstico específico fornecido no prompt (demanda, consumo, perfil de carga, perdas, geração on-site e indicadores financeiros de CFO).",
    "",
    "## Regras Inegociáveis de Rigor Técnico",
    "1. NÃO invente números nem use dados de clientes anteriores. Utilize estritamente os dados reais presentes no texto enviado.",
    "2. Se algum indicador específico não constar no diagnóstico, declare 'não aplicável / não identificado' em vez de fazer suposições.",
    "3. Seja assertivo, pragmático e direto. Evite clichês e parágrafos genéricos.",
    "4. Formatação: Moeda sempre em 'R$ X.XXX,XX', potências em 'kW', energias em 'kWh' ou 'MWh'.",
    "",
    "## Estrutura Obrigatória do Parecer (Use exatamente estes títulos Markdown):",
    "### 1. Resumo executivo, perfil de carga e curva sazonal",
    "### 2. Diagnóstico de demanda, ultrapassagens e qualidade da energia (QEE)",
    "### 3. Decomposição detalhada dos 6 vetores de economia e matriz de soluções",
    "### 4. Análise econômico-financeira executiva (CAPEX, VPL, TIR e Payback - Visão CFO)",
    "### 5. Governança, digitalização com Energy Link e plano de ação priorizado",
    "",
    "## Tom e Estilo",
    "- Estilo executivo, consultivo e técnico sênior direcionado a Diretores e CFOs.",
    "- Utilize tópicos objetivos com marcadores (- ) e tabelas comparativas quando pertinente.",
    "- Não inclua despedidas ou assinaturas automáticas genéricas ao final."
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
        temperature: 0.2,
        max_tokens: 3500,
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
