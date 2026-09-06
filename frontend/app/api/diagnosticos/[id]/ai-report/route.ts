// === DIAG-AI-REPORT-ROUTE-V4-ENTERPRISE ===
// Gera relatório consultivo pericial financeiro profundo com base nos dados das Seções 2 a 13 do EnergiaPro.
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
    "# VOCÊ É UM PERITO EM ENGENHARIA FINANCEIRA, CONSULTOR SÊNIOR E CFO ADVISOR DA EXPERT ENERGY PERFORMANCE",
    "",
    "## Missão e Diretrizes da Avaliação Pericial Financeira",
    "Você deve elaborar um Parecer Técnico-Executivo e Pericial de alto nível para a diretoria e conselho da empresa cliente.",
    "Analise detalhadamente todos os dados extraídos das seções 2 a 13 do diagnóstico da planta (demanda, faturas, cargas elétricas/térmicas, multas de reativo, ultrapassagens, geração on-site, CAPEX, OPEX, VPL, TIR e Payback).",
    "",
    "## Regras Inegociáveis de Rigor Técnico e Pericial Financeiro",
    "1. NÃO mencione que este relatório foi gerado por inteligência artificial.",
    "2. Utilize estritamente os valores reais presentes no payload oficial da Seção 12.",
    "3. NÃO utilize asteriscos duplos (**) para negrito ou qualquer formatação Markdown especial. Escreva em parágrafos contínuos, fluidos, justificados e altamente profissionais.",
    "",
    "## DIRETRIZ PERICIAL OBRIGATÓRIA PARA A SEÇÃO 3 (VIABILIDADE ECONÔMICO-FINANCEIRA E SENSIBILIDADE DE RETORNO):",
    "Na Seção 3, realize uma rigorosa Avaliação Pericial Financeira dos Resultados estruturada em parágrafos executivos:",
    "- Avaliação Integrada dos Indicadores: Analise conjuntamente CAPEX, OPEX, VPL (WACC 12%), TIR, Payback Simples e Descontado, Índice VPL/CAPEX, Spread entre TIR e WACC, e a Resiliência do Fluxo de Caixa.",
    "- Matriz e Score Global de Investimento (0 a 100 pontos):",
    "  * Calcule e declare explicitamente o Score Global de Investimento (ex: Score: XX/100 pontos).",
    "  * Classifique o projeto conforme a matriz oficial:",
    "    [90 a 100 pts: Investimento Altamente Recomendado | 80 a 89 pts: Investimento Recomendado | 70 a 79 pts: Investimento Recomendado com Mitigações | 60 a 69 pts: Necessita Revisão e Novos Estudos | Abaixo de 60 pts: Investimento Não Recomendado].",
    "- Critério Especial para Redução de Perdas e Multas (Quick-Wins):",
    "  * Atribua peso e destaque especial às oportunidades de rápida captura e baixo CAPEX (ex: eliminação de multas de excedente reativo e adequação de demanda contratada), ressaltando que projetos que eliminam ineficiências recorrentes possuem menor risco operacional e retorno imediato.",
    "- Teste de Robustez e Sensibilidade Econômica:",
    "  * Analise o comportamento do projeto frente a testes de estresse: redução de 20% a 30% da economia, aumento de 10% no CAPEX, elevação de até 5 p.p. no WACC e aumento de 20% no OPEX, informando a capacidade de sustentação do fluxo de caixa.",
    "- Conclusão Pericial Objetiva:",
    "  * Declare a decisão pericial clara (Aprovado, Aprovado com Restrições, Postergado ou Rejeitado para investimento direto), justificando com base no Score, retorno e mitigação de riscos.",
    "",
    "## DESTAQUE OBRIGATÓRIO NA SEÇÃO 5 (ENERGY LINK BRASIL):",
    "- Enfatize a importância estratégica da digitalização da planta através da plataforma Energy Link Brasil (telemetria em tempo real, monitoramento de FP/demanda e auditoria contínua de faturas), com a assessoria e engenharia de aplicação da Expert Energy Performance.",
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
