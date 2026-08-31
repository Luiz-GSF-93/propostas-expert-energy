// === DIAG-AI-REPORT-ROUTE-V3-NO-DB ===
// Versao simplificada: nao consulta Supabase. Recebe `{ prompt, summary, diagnostic }` no body e so chama OpenAI.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

function safeText(s: unknown, max = 300): string {
  const v = typeof s === "string" ? s : s == null ? "" : String(s);
  return v.length > max ? v.slice(0, max) + "..." : v;
}

function buildSysPrompt(): string {
  return [
    "# VOCE E UM CONSULTOR ENERGETICO SENIOR - EnergiaPro / Expert Energy Performance",
    "",
    "## Regras inegociaveis",
    "- Responda SEMPRE em portugues (pt-BR) em formato Markdown estruturado.",
    "- Use EXCLUSIVAMENTE os numeros fornecidos no payload - nunca invente valores.",
    "- Quando um indicador nao estiver disponivel, escreva 'nao informado' em vez de estimar.",
    "- Estruture em 5 secoes, nesta ordem EXATA:",
    "  1. '### 1. Indicadores-chave do cliente'",
    "  2. '### 2. Diagnostico de demanda e consumo'",
    "  3. '### 3. Potencial de economia e payback'",
    "  4. '### 4. Recomendacoes tecnicas priorizadas'",
    "  5. '### 5. Proximos passos e governanca'",
    "",
    "## Tom",
    "- Tecnico, porem acessivel; foco em interpretacao, nao em repetir numeros.",
    "- Use bullet points (- ) quando listar 2 ou mais itens.",
    "- Quando citar economia, use o simbolo R$ com 2 casas.",
    "",
    "## Proibicoes",
    "- Nao inserir disclaimers genericos no final.",
    "- Nao pedir mais dados ao usuario.",
    "- Nao usar expressoes como 'como modelo de linguagem'."
  ].join("\n");
}

async function callOpenAI(sys: string, user: string, extSignal: AbortSignal): Promise<string> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  extSignal.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => ctl.abort(), 55_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 1600,
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
      return NextResponse.json({ error: "missing_prompt" }, { status: 400 });
    }

    const sys = buildSysPrompt();
    const report = await callOpenAI(sys, prompt, req.signal);

    return NextResponse.json({
      ok: true,
      report,
      summary,                       // ecoa para o client montar PDF
      diagnostic,                    // ecoa para o client montar PDF
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

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "Use POST com body { prompt, summary, diagnostic? }. Retorna relatorio IA do diagnostico, sem consultar Supabase.",
  });
}
