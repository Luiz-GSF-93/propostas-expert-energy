// === DIAG-AI-REPORT-ROUTE-V2-CHAT-EOF ===
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

function safeText(s: unknown, max = 300): string {
  const v = typeof s === "string" ? s : s == null ? "" : String(s);
  return v.length > max ? v.slice(0, max) + "..." : v;
}

async function sb(path: string, init?: RequestInit) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
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
    "- Use bullet points (item) quando listar 2 ou mais itens.",
    "- Quando citar economia, use o simbolo R$ com 2 casas.",
    "",
    "## Proibicoes",
    "- Nao inserir disclaimers genericos no final.",
    "- Nao pedir mais dados ao usuario.",
    "- Nao usar expressoes como 'como modelo de linguagem'."
  ].join("\n");
}

function nomeCriador(
  id: string | null | undefined,
  creators: Record<string, ProfileLite>
): string {
  if (!id) return "nao informado";
  const p = creators[id];
  if (!p) return id;
  return p.full_name || p.email || id;
}

function buildUserPrompt(
  diag: any,
  company: any,
  creators: Record<string, ProfileLite>,
  extra: string
): string {
  const s = diag?.summary ?? {};
  const lines: string[] = [];
  lines.push("# CONTEXTO DO DIAGNOSTICO");
  lines.push("");
  lines.push(
    "- Codigo: " +
      (diag?.code ?? "nao informado") +
      " (versao " +
      (diag?.version ?? "?") +
      ")"
  );
  lines.push("- Status: " + (diag?.status ?? "nao informado"));
  lines.push("- ID interno: " + (diag?.id ?? "nao informado"));
  lines.push("");
  lines.push("## Cliente");
  lines.push(
    "- Empresa: " +
      (company?.name ?? company?.razao_social ?? "nao informado")
  );
  lines.push("- CNPJ: " + (company?.cnpj ?? "nao informado"));
  lines.push("- Segmento: " + (company?.segment ?? "nao informado"));
  lines.push("- Mercado: " + (company?.market ?? company?.mercado ?? "nao informado"));
  lines.push("");
  lines.push("## Responsaveis");
  lines.push("- Criado por: " + nomeCriador(diag?.created_by, creators));
  lines.push("- Atualizado por: " + nomeCriador(diag?.updated_by, creators));
  lines.push("- Revisado por: " + nomeCriador(diag?.reviewed_by, creators));
  lines.push("");
  lines.push("## Indicadores apurados");
  lines.push("- Demanda contratada: " + (s.demandKw ?? "nao informado") + " kW");
  lines.push(
    "- Consumo medio mensal: " +
      (s.monthlyConsumptionKwh ?? "nao informado") +
      " kWh/mes"
  );
  lines.push("- Fator de carga atual: " + (s.loadFactorBefore ?? "nao informado") + " %");
  lines.push(
    "- Fator de carga projetado: " + (s.loadFactorAfter ?? "nao informado") + " %"
  );
  lines.push(
    "- Economia estimada anual: R$ " +
      (s.estimatedSavingsValue ?? "nao informado") +
      " (" +
      (s.estimatedSavingsPercent ?? "?") +
      " %)"
  );
  lines.push(
    "- Payback estimado: " + (s.paybackMonths ?? "nao informado") + " meses"
  );
  lines.push(
    "- Ganho potencial anual (R$): " + (s.potentialGainAnnual ?? "nao informado")
  );
  lines.push(
    "- Reducao termica anual: " + (s.thermalReductionAnnual ?? "nao informado")
  );
  lines.push(
    "- Otimizacao de demanda anual: " +
      (s.demandOptimizationAnnual ?? "nao informado")
  );
  lines.push(
    "- Qualidade de energia anual: " + (s.powerQualityAnnual ?? "nao informado")
  );
  lines.push("- Observacoes: " + (s.loadProfileGainText ?? "nao informado"));
  lines.push("");
  if (extra && extra.trim().length > 0) {
    lines.push("## Pedido adicional do usuario");
    lines.push(extra.trim());
    lines.push("");
  }
  return lines.join("\n");
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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return NextResponse.json(
        {
          error: "config_error",
          message: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes"
        },
        { status: 500 }
      );
    }
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "config_error", message: "OPENAI_API_KEY ausente" },
        { status: 500 }
      );
    }

    const { id: diagId } = await ctx.params;
    if (!diagId) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const extraPrompt = String(body?.prompt ?? "").trim();

    // 1) diagnostico
    const diagRes = await sb(
      "/diagnosticos?id=eq." + encodeURIComponent(diagId) + "&limit=1"
    );
    if (!diagRes.ok) {
      return NextResponse.json(
        {
          error: "diagnostico_lookup_failed",
          status: diagRes.status,
          detail: safeText(diagRes.text, 300)
        },
        { status: 502 }
      );
    }
    const diagRows = JSON.parse(diagRes.text);
    if (!Array.isArray(diagRows) || diagRows.length === 0) {
      return NextResponse.json({ error: "diagnostico_not_found" }, { status: 404 });
    }
    const diag = diagRows[0];

    // 2) empresa
    let company: any = null;
    if (diag.company_id) {
      const compRes = await sb(
        "/companies?id=eq." + encodeURIComponent(diag.company_id) + "&limit=1"
      );
      if (compRes.ok) {
        try {
          const arr = JSON.parse(compRes.text);
          company = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
        } catch {
          company = null;
        }
      }
    }

    // 3) profiles (criadores)
    const creators: Record<string, ProfileLite> = {};
    const profileIds = Array.from(
      new Set([diag.created_by, diag.updated_by, diag.reviewed_by].filter(Boolean))
    );
    if (profileIds.length > 0) {
      const inList = profileIds.map((p) => '"' + p + '"').join(",");
      const profRes = await sb(
        "/profiles?id=in.(" + inList + ")&select=id,full_name,email,role"
      );
      if (profRes.ok) {
        try {
          const arr = JSON.parse(profRes.text);
          for (const p of Array.isArray(arr) ? arr : []) {
            creators[p.id] = p;
          }
        } catch {
          /* ignore */
        }
      }
    }

    // 4) OpenAI
    const sys = buildSysPrompt();
    const userContent = buildUserPrompt(diag, company, creators, extraPrompt);
    const report = await callOpenAI(sys, userContent, req.signal);

    // 5) auditoria (nao bloqueia resposta)
    sb("/audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          action: "ai_report_generated",
          entity: "diagnosticos",
          entity_id: diagId,
          metadata: {
            model: OPENAI_MODEL,
            latency_ms: Date.now() - startedAt,
            prompt_chars: userContent.length,
            report_chars: report.length
          },
          created_at: new Date().toISOString()
        }
      ])
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      report,
      meta: {
        diag_id: diagId,
        diag_code: diag?.code ?? null,
        latency_ms: Date.now() - startedAt,
        model: OPENAI_MODEL
      }
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
  return NextResponse.json(
    {
      ok: true,
      hint: "Use POST com body { prompt?: string }. Retorna relatorio IA do diagnostico."
    },
    { status: 200 }
  );
}
