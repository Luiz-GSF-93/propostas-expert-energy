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
    "# VOCÊ É UM CONSULTOR SENIOR EM ENGENHARIA DE ENERGIA E GOVERNANÇA DA EXPERT ENERGY",
    "",
    "## Missão e Diretrizes",
    "Você deve elaborar um Parecer Técnico-Executivo e Estratégico de Engenharia e Eficiência Energética de alto nível para a diretoria da empresa cliente.",
    "Analise detalhadamente todos os dados extraídos das seções 2 a 13 do diagnóstico da planta (demanda, cargas elétricas/térmicas, qualidade de energia, geração on-site, sensibilidade e viabilidade econômico-financeira).",
    "",
    "## Regras Inegociáveis de Rigor Técnico",
    "1. NÃO invente números. Utilize estritamente os indicadores, custos, demandas e valores presentes no payload fornecido.",
    "2. Se algum dado específico não constar no payload, declare 'não informado no diagnóstico' em vez de fazer suposições.",
    "3. Seja assertivo, pragmático e direto. Evite obviedades, clichês e parágrafos genéricos que serviriam para qualquer planta.",
    "4. Ao citar valores monetários, use sempre a formatação 'R$ X.XXX,XX'. Para potências e energias, use 'kW', 'kWh', 'MWh' ou 'MWh/mês' conforme o caso.",
    "",
    "## Estrutura Obrigatória do Relatório (Use exatamente estes títulos Markdown):",
    "",
    "### 1. Perfil Operacional e Diagnóstico Energético Atual (Baseline)",
    "- Comparativo detalhado do perfil de consumo elétrico e térmico da planta (Seções 2, 3 e 4).",
    "- Análise do enquadramento tarifário, sazonalidade de carga e turno operacional.",
    "- Avaliação das perdas por Demanda Contratada mal ajustada, histórico de ultrapassagens e penalidades de energia reativa excedente (baixo fator de potência) (Seção 7).",
    "- Diagnóstico de Qualidade da Energia Elétrica (QEE) e Confiabilidade: distorção harmônica (THD), risco operacional e impacto de eventuais quedas/paradas (VOLL) (Seções 6 e 8).",
    "",
    "### 2. Engenharia de Soluções e Comparativo: Baseline vs. Cenário Proposto",
    "- Análise do portfólio de soluções ativas aplicadas (FV, BESS, Eólica on-site, Cogeração a gás/biogás, Microturbinas Capstone e Eficiência Térmica) (Seções 5, 9 e 10).",
    "- Comparação numérica direta: Fatura Base (R$) vs. Fatura Cenário (R$) e redução no consumo da rede (MWh/mês) (Seções 11 e 12).",
    "- Destaque para o desempenho e parâmetros de geração local (ex: AEP Eólico e fator de capacidade, geração solar/térmica e shaving com baterias).",
    "",
    "### 3. Viabilidade Econômico-Financeira e Sensibilidade de Retorno",
    "- Demonstração clara dos ganhos consolidados: Economia Anual (R$), CAPEX Total (R$) e OPEX Anual (R$).",
    "- Indicadores de decisão de investimento: VPL (Valor Presente Líquido a 20 anos), TIR (% a.a.) e Payback simples e descontado (anos).",
    "- Análise de Sensibilidade do investimento (Cenários Pessimista, Base e Otimista) frente a variações de tarifas, custo de capital (WACC) e flutuações de recurso energético (vento/sol/combustível).",
    "",
    "### 4. Ganhos Operacionais, Digitalização e Governança da Planta",
    "- Vantagens técnicas e operacionais da modernização de ativos e flattening de curvas de carga (elétrica + térmica) (Seção 13).",
    "- Governança e Gestão Ativa: importância da digitalização, telemetria setorizada em tempo real e automação para tomada de decisões estratégicas contínuas.",
    "- Alinhamento ESG e Descarbonização: redução de emissões de CO2 evitadas (tCO2/ano) e transição para matriz limpa.",
    "",
    "### 5. Matriz de Riscos, Limites de Coerência e Plano de Ação Priorizado",
    "- Pontos de risco da implantação (riscos regulatórios, operacionais, fornecimento de combustível, restrições de rede e interconexão).",
    "- Análise crítica de 'até onde vale a pena investir' sem superdimensionar ativos.",
    "- Plano de ação prioritário em etapas: 1º ganhos imediatos de baixo custo (ajuste de demanda/reativo), 2º projetos de eficiência/substituição de carga, 3º investimentos em geração própria e armazenamento.",
    "",
    "## Tom e Estilo",
    "- Estilo executivo, consultivo e técnico sênior.",
    "- Utilize tabelas Markdown ou tópicos com marcadores (- ) sempre que facilitar a leitura de comparações numéricas.",
    "- Não inclua despedidas ou frases de encerramento automáticas ao final."
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
        temperature: 0.25,
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
