import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// === CHAT-V5-DRE-FRAGMENTADO ===
// SYS V5: instrui a IA a fragmentar despesas por cost_type quando o usuario
// perguntar sobre uma categoria especifica (funcionarios, aluguel, marketing etc.).
const SYS = `Voce e o Copiloto Financeiro da Expert Energy. Recebe o CONTEXTO FINANCEIRO do mes atual em JSON, ja filtrado pelos modulos detectados.

Modulos e campos chave:
- dre: receita_bruta, impostos, cmv, lucro_bruto, despesas_administrativas/pessoal/vendas/marketing/infraestrutura, despesas_financeiras, receitas_financeiras, depreciacao_amortizacao, ebit, ebitda, irpj_csll, lucro_liquido, margem_liquida_percent.
- cashflow: receita, despesa, saldo, separado manual vs auto_generated, por categoria (vendas_recorrentes, vendas_vista, vendas_prazo, custos_fixos, investimentos_capex, emprestimo, custos_variaveis, receitas_financeiras).
- costs: fixos, variaveis (% x receita estimada), total_mensal_estimado, by_cost_type (mapa com chaves: funcionarios_salarios, aluguel_condominio, marketing_publicidade, comissoes, energia_utilities, infraestrutura_capex, outros).
- planning: meta_total, realizado_total, gap, atingimento_pct, por Contrato Recorrente/Avulso.
- loans: ativos, parcela_mes, saldo_devedor_total, cet_efetivo_anual_pct (com iof+fees), cet_medio_anual_pct, iof, fees, grace_meses_ativos, ds_cr.

REGRA DE OURO - FRAGMENTACAO POR CATEGORIA:
Quando a pergunta do usuario for sobre UMA categoria especifica de despesa (ex.: "qual a despesa paga de funcionarios", "quanto paguei de aluguel", "despesa com marketing", "comissoes deste mes"), voce DEVE:
  1) Responder de forma DIRETA e FRAGMENTADA, listando apenas aquela categoria, com valor total + 3-5 itens principais (descricao + valor) extraidos do contexto ou de finance_cost_entries quando o agregado nao bastar.
  2) NAO repita o DRE completo nem outros topicos nao perguntados.
Quando a pergunta for sobre o DRE completo ou multi-topico, use o quadro 17-linhas padrao.
Quando for projecao/fluxo, use flux_caixa + loans historico.

Tom: executivo, direto, objetivo, em portugues. Use SOMENTE dados do contexto, NAO invente valores. Formate R$ (pt-BR) e %. Quando envolver comparacao, destaque variacao.`;

const agenteRegex: Array<[string, RegExp]> = [
  ["dre",          /(lucro|receita|despesa|margem|ebitda|resultado|dre|demonstra|tributo|imposto|cmv|custo|funcionari|funcionario|salari|salario|folha|pessoal|pro-labore|prolabore|aluguel|condomini|marketing|publicidad|comissao|energia)/i],
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

function montarContextoResumido(ctx: any, agentes: string[]): any {
  const now = ctx.now || {};
  const out: any = { label: now.label, periodo: now.periodo };
  if (agentes.includes("dre")) out.dre = now.dre;
  if (agentes.includes("fluxo_caixa")) out.cashflow = now.cashflow;
  if (agentes.includes("custos")) out.costs = now.costs;
  if (agentes.includes("planejamento")) out.planning = now.planning;
  if (agentes.includes("emprestimos")) out.loans = now.loans;
  return out;
}

function fragmentarPorCategoria(ctx: any, prompt: string): string {
  const lower = prompt.toLowerCase();
  const now = ctx.now;
  const BRL = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cat: any = now?.costs?.by_cost_type || now?.costs?.por_cost_type || null;

  const items: Array<[string, RegExp]> = [
    ["funcionarios_salarios", /(funcionario|funcionario|salario|salario|folha|pessoal|pro-labore|prolabore|encargos|fgts|inss|ferias|bonus)/i],
    ["aluguel_condominio",     /(aluguel|condominio|condominio)/i],
    ["marketing_publicidade",  /(marketing|publicidade|propaganda|anuncio|anuncio)/i],
    ["comissoes",              /(comissao|comissao)/i],
    ["energia_utilities",      /(energia|luz|agua|agua|telefone|internet|cloud|ti)/i],
    ["infraestrutura_capex",   /(infraestrutura|investimento|capex|reforma|equipamento|mobiliario)/i],
  ];

  const grupos: string[] = [];
  for (const [key, rx] of items) if (rx.test(lower)) grupos.push(key);
  if (grupos.length === 0) return "";

  const L: string[] = [];
  L.push(`\n[FRAGMENTACAO POR CATEGORIA — ${grupos.join(", ")}]`);
  if (!cat) {
    L.push(`(Agregado por cost_type nao disponivel no contexto resumido — detalhamento vem de finance_cost_entries, sera injetado pela IA.)`);
    return L.join("\n");
  }
  for (const key of grupos) {
    const item = cat[key];
    const valor = typeof item === "number" ? item : Number(item?.total ?? item?.valor ?? 0);
    L.push(`  ${key}: R$ ${BRL(valor)} (mes atual).`);
  }
  return L.join("\n");
}

function ehPerguntaCategoria(prompt: string): boolean {
  return /(qual|quanto|despesa|gasto|paguei|paga|custo)/i.test(prompt);
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
  const contextoResumido = montarContextoResumido(ctx, agentes);
  const contextoJSON = JSON.stringify(contextoResumido, null, 2);

  const apiKey = (typeof process !== "undefined" ? process.env.OPENAI_API_KEY || "" : "");
  const model  = (typeof process !== "undefined" ? process.env.OPENAI_MODEL || "gpt-4o-mini" : "gpt-4o-mini");

  if (!apiKey) {
    const fb = formatarFallback({ ctx, prompt, agentes });
    const frag = fragmentarPorCategoria(ctx, prompt);
    return NextResponse.json({
      resposta: fb + frag,
      modulos_ativos: agentes,
      context: contextoResumido,
      fallback: true,
    });
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.3,
        messages: [
          { role: "system", content: SYS + "\n\nCONTEXTO FINANCEIRO FILTRADO:\n" + contextoJSON },
          { role: "user", content: `MODULOS DETECTADOS: ${agentes.join(", ")}\nCATEGORIA ESPECIFICA: ${ehPerguntaCategoria(prompt) ? "sim — fragmentar resposta por cost_type" : "nao"}\n\nPERGUNTA: ${prompt}` },
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

    return NextResponse.json({ resposta, modulos_ativos: agentes, context: contextoResumido });
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
  L.push(`Pergunta: "${prompt}" | Modulos: ${agentes.join(", ")} | Periodo ${now.label}.`);
  if (agentes.includes("dre")) {
    L.push(`DRE: receita_bruta R$ ${BRL(now.dre.receita_bruta)} | impostos R$ ${BRL(now.dre.impostos)} | lucro_bruto R$ ${BRL(now.dre.lucro_bruto)} | despesas_op R$ ${BRL((now.dre.despesas_administrativas||0)+(now.dre.despesas_pessoal||0)+(now.dre.despesas_vendas||0)+(now.dre.despesas_marketing||0)+(now.dre.despesas_infraestrutura||0))} | despesas_fin R$ ${BRL(now.dre.despesas_financeiras)} | receitas_fin R$ ${BRL(now.dre.receitas_financeiras)} | LAJIR/EBIT R$ ${BRL(now.dre.ebit)} | lucro_liquido R$ ${BRL(now.dre.lucro_liquido)} (Margem ${PCT(now.dre.margem_liquida_percent)}).`);
  }
  if (agentes.includes("fluxo_caixa")) {
    L.push(`Fluxo de caixa: saldo R$ ${BRL(now.cashflow.saldo)} | entradas R$ ${BRL(now.cashflow.receita)} | saidas R$ ${BRL(now.cashflow.despesa)} (manual R$ ${BRL(now.cashflow.despesa_manual)} / auto R$ ${BRL(now.cashflow.despesa_auto)}).`);
  }
  if (agentes.includes("custos")) {
    L.push(`Custos: total mensal estimado R$ ${BRL(now.costs?.total_mensal_estimado)} (fixos R$ ${BRL(now.costs?.fixos)} | variaveis R$ ${BRL(now.costs?.variaveis)}).`);
  }
  if (agentes.includes("planejamento")) {
    L.push(`Planejamento: meta R$ ${BRL(now.planning?.meta_total)} | realizado R$ ${BRL(now.planning?.realizado_total)} | gap R$ ${BRL(now.planning?.gap)} | atingimento ${PCT(now.planning?.atingimento_pct)}.`);
  }
  if (agentes.includes("emprestimos")) {
    L.push(`Emprestimos: ${now.loans?.ativos} ativos | parcela_mes R$ ${BRL(now.loans?.parcela_mes)} | saldo devedor R$ ${BRL(now.loans?.saldo_devedor_total)} | CET efetivo ${PCT(now.loans?.cet_efetivo_anual_pct)}/ano.`);
  }
  return L.join("\n");
}
