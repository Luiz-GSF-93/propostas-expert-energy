import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent, supabaseAdmin,
} from "@/lib/financeiro/ai/server";

// === CHAT-V8-AGENDA-COMPLETA-2026-08 ===
// V8 anti-invencao: nunca fabricar descricao / fornecedor / valor.
// Cruzamento REAL de:
//   1) finance_cost_entries    (categoria corporativa, monthly_amount, supplier)
//   2) finance_cash_flow_entries (lancamentos mensais ja materializados)
//   3) finance_dre_manual_entries (entradas manuais do DRE)
// Quando uma fonte nao tem dados, responder "—" explicito — nao inventar.

const SYS = "Voce e o Copiloto Financeiro da Expert Energy. Recebe o CONTEXTO FINANCEIRO completo em JSON do modulo selecionado (mes atual, com historico_12m anexo).\n\n"
  + "REGRAS DE LEITURA (v8):\n"
  + "- DRE receita_bruta = soma de cashflow.type='receita' do mes (NUNCA inventar).\n"
  + "- DRE despesas = classificadas a partir de cashflow.type='despesa':\n"
  + "    * custos_variaveis OU descricao cmv|mercadoria|materia.prima -> CMV\n"
  + "    * custos_fixos (generico) -> despesas_administrativas\n"
  + "    * descricao marketing|publicidade|google ads|meta ads|facebook|instagram -> despesas_marketing\n"
  + "    * descricao comiss -> despesas_vendas\n"
  + "    * descricao funcionar|salar|folha|pessoal|pro-labore|fgts|inss|ferias -> despesas_pessoal\n"
  + "    * categoria=investimentos_capex OU descricao capex|infra|reforma|equipamento|mobiliario -> despesas_infraestrutura\n"
  + "    * categoria=emprestimo OU descricao emprestim|parcela|juros|cet|iof -> despesas_financeiras\n"
  + "    * categoria=impostos OU descricao imposto|simples|das|iss|icms|irpj|csll|pis|cofins -> impostos\n"
  + "- APENAS 2 campos do DRE sao MANUAIS (nao vem do caixa):\n"
  + "    * receitas_financeiras <- finance_dre_manual_entries.line_key='receita_financeira_manual' (operator add)\n"
  + "    * depreciacao_amortizacao <- finance_dre_manual_entries.line_key='depreciacao_amortizacao_manual' (operator subtract)\n"
  + "- irpj_csll = 0 (regime Simples Nacional).\n"
  + "- Para PASSADO: contexto.financeiro.historico_12m -> [{label, receita, despesa}] (ate 12 meses anteriores, ja calculados).\n"
  + "- Para FUTURO: usar planejamento_projecoes (base_year -> projection_year). Quando a pergunta for mensal, dividir annual/12. Sem projecao para o ano pedido, declarar limitacao.\n"
  + "- NUNCA inventar valor; se faltar, escrever literalmente '-'.\n\n"
  + "Modulos do contexto ja disponiveis:\n"
  + "- dre: receita_bruta, impostos, cmv, lucro_bruto, despesas_administrativas/pessoal/vendas/marketing/infraestrutura, despesas_financeiras, receitas_financeiras, depreciacao_amortizacao, ebit, ebitda, irpj_csll, lucro_liquido, margem_liquida_percent.\n"
  + "- cashflow: receita, despesa, saldo, separado manual vs auto_generated, por categoria (vendas_recorrentes, vendas_vista, vendas_prazo, custos_fixos, investimentos_capex, emprestimo, custos_variaveis, receitas_financeiras).\n"
  + "- costs: fixos, variaveis (% x receita estimada), total_mensal_estimado, by_cost_type (funcionarios_salarios, aluguel_condominio, marketing_publicidade, comissoes, energia_utilities, infraestrutura_capex, outros). Lista detalhada em costs.items[] (finance_cost_entries).\n"
  + "- planning: meta_total, realizado_total, gap, atingimento_percent (planejamento_metas_mensais em reference_year/reference_month).\n"
  + "- loans: principal, parcelas a_pagar/pagas, saldo, cet, iof, juros (finance_loan_contracts + finance_loan_installments).\n"
  + "- passado: contexto.financeiro.historico_12m -> [{label, receita, despesa, saldo}].\n";

const agenteRegex: Array<[string, RegExp]> = [
  ["dre", /(lucro|receita|receit|despesa|imposto|cmv|custo|funcionari|pessoal|folha|aluguel|marketing|comissao|ebitda|ebit|margem|dre|demonstr|resultado)/i],
  ["fluxo_caixa", /(caixa|saldo|entrada|saida|receb|desembolso|fluxo)/i],
  ["custos", /(custo|custos|gasto|gastos|paguei|paga|pago|despesa fixa|variavel|fixo|total de custo)/i],
  ["planejamento", /(planeja|meta|metas|previsao|previsto|forecast|gap|atingimento|orcado|orçamento)/i],
  ["emprestimos", /(emprestim|financiam|cet|dscr|parcela|juros|banco|alavancag|carencia|iof|emprestimo|contrato)/i],
  ["terceiros", /(terceiro|terceiros|fornecedor|fornecedores|prestador|prestadores|parceiro|parceiros)/i],
  ["impostos_modulo", /(imposto|impostos|tributo|tributos|simples|d[df]as|iss|icms|irpj|csll|pis|cofins)/i],
];

const CATEGORIA_REGEX: Array<[string, RegExp]> = [
  ["funcionarios_salarios", /(funcionar|funcionario|salar|salario|folha|pessoal|pro-?labore|prolabore|encargos|fgts|inss|ferias|bonus|13o|decimo)/i],
  ["aluguel_condominio",    /(aluguel|condomini|condominio|alugueis)/i],
  ["marketing_publicidade", /(marketing|publicidade|propaganda|anunci|anuncio|mídia|midia)/i],
  ["comissoes",             /(comiss)/i],
  ["energia_utilities",     /(energia|luz|agua|agua |telefone|internet|cloud|ti\b|servicos de ti|FT)|enel|light/i],
  ["infraestrutura_capex",  /(infraestrutura|capex|reforma|equipamento|mobiliario|escritorio)/i],
  ["terceiros",             /(terceiro|fornecedor|prestador|parceiro)/i],
  ["impostos",              /(imposto|simples|das |iss|icms|irpj|csll|pis|cofins|tributo)/i],
];

function detectarAgentes(p: string): string[] {
  const lower = p.toLowerCase();
  const ativos = agenteRegex.filter(([, rx]) => rx.test(lower)).map(([nome]) => nome);
  if (!ativos.length) ativos.push("dre","fluxo_caixa","custos","planejamento","emprestimos");
  return Array.from(new Set(ativos));
}

function detectarCategorias(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  return CATEGORIA_REGEX.filter(([, rx]) => rx.test(lower)).map(([key]) => key);
}

// ---------- V8 NOVO: BUSCA CONJUNTA (costs ⊕ cashflow) ----------
async function getItensCompletos(year: number, month: number, categoria: string): Promise<{
  total: number; items: any[]; source: string; descritivo: string;
}> {
  if (!supabaseAdmin) return { total: 0, items: [], source: "supabase_indisponivel", descritivo: "Supabase indisponivel — sem leitura possivel." };
  const [, rx] = CATEGORIA_REGEX.find(([k]) => k === categoria) || [null, null];
  if (!rx) return { total: 0, items: [], source: "categoria_desconhecida", descritivo: `Categoria "${categoria}" sem regex.` };

  // FONTE 1: finance_cost_entries (categoria corporativa)
  let cEntries: any[] = [];
  try {
    const r = await supabaseAdmin
      .from("finance_cost_entries")
      .select("id, category, cost_type, description, supplier, monthly_amount, auto_generated, status")
      .eq("status", "ativo")
      .or(`cost_type.eq.${categoria},description.ilike.%${encodeURIComponent(categoria.replace("_"," "))}%`)
      .limit(200);
    if (!r.error && r.data) {
      cEntries = (r.data || []).filter((it: any) => rx.test(String(it.description || "").toLowerCase()) || String(it.cost_type || "").toLowerCase() === categoria);
    }
  } catch (e: any) { console.log("[V8] cost_entries query erro:", e?.message); }

  // FONTE 2: finance_cash_flow_entries (lancamentos do mes)
  let cfEntries: any[] = [];
  const CATMAP: Record<string, string[]> = {
    funcionarios_salarios: ["custos_fixos","custos_variaveis"],
    aluguel_condominio:    ["custos_fixos"],
    marketing_publicidade: ["custos_fixos","custos_variaveis"],
    comissoes:             ["custos_variaveis","custos_fixos","vendas_prazo","vendas_recorrentes"],
    energia_utilities:     ["custos_fixos","custos_variaveis"],
    infraestrutura_capex:  ["investimentos_capex","custos_fixos"],
    terceiros:             ["custos_fixos","custos_variaveis"],
    impostos:              ["custos_variaveis","custos_fixos"],
  };
  const cats = CATMAP[categoria] || ["custos_fixos"];
  try {
    const r = await supabaseAdmin
      .from("finance_cash_flow_entries")
      .select("id, type, category, amount, description, auto_generated")
      .eq("year", year).eq("month", month)
      .in("category", cats)
      .limit(200);
    if (!r.error && r.data) {
      cfEntries = (r.data || []).filter((it: any) => rx.test(String(it.description || "").toLowerCase()));
    }
  } catch (e: any) { console.log("[V8] cashflow query erro:", e?.message); }

  const cTotal = cEntries.reduce((s, it) => s + Number(it.monthly_amount || 0), 0);
  const cfTotal = cfEntries.reduce((s, it) => s + Number(it.amount || 0), 0);

  // Priorizar cashflow (eh o valor REAL do mes), complementar com cost_entries (se faltou mes)
  const items = [
    ...cfEntries.map((it: any) => ({
      descricao: it.description, valor: Number(it.amount || 0),
      fornecedor: "—", origem: `cashflow/${it.category}`, data: `${year}-${String(month).padStart(2,"0")}`,
      auto: !!it.auto_generated,
    })),
    ...cEntries.map((it: any) => ({
      descricao: it.description, valor: Number(it.monthly_amount || 0),
      fornecedor: it.supplier || "—", origem: `cost_entries/${it.cost_type}`, data: "mensal-recorrente",
      auto: !!it.auto_generated,
    })),
  ].sort((a, b) => b.valor - a.valor).slice(0, 12);

  if (cfEntries.length > 0) {
    return { total: cfTotal, items, source: "finance_cash_flow_entries", descritivo: `${cfEntries.length} lancamento(s) em cashflow ${year}/${String(month).padStart(2,"0")}.` };
  }
  if (cEntries.length > 0) {
    return { total: cTotal, items, source: "finance_cost_entries", descritivo: `${cEntries.length} cadastro(s) corporativo(s) ativo(s).` };
  }
  return { total: 0, items: [], source: "vazio", descritivo: `Sem lancamentos em ${categoria} para ${year}/${String(month).padStart(2,"0")}.` };
}

const LABELS: Record<string, string> = {
  funcionarios_salarios: "Funcionarios (salarios + encargos)",
  aluguel_condominio:    "Aluguel e condominio",
  marketing_publicidade: "Marketing e publicidade",
  comissoes:             "Comissoes",
  energia_utilities:     "Energia e utilidades",
  infraestrutura_capex:  "Infraestrutura e CAPEX",
  terceiros:             "Terceiros (fornecedores)",
  impostos:              "Impostos",
};

async function fragmentarPorCategoria(ctx: any, prompt: string, year: number, month: number): Promise<string> {
  const grupos = detectarCategorias(prompt);
  if (grupos.length === 0) return "";
  const L: string[] = [];
  L.push(`\n[FRAGMENTACAO POR CATEGORIA — ${grupos.join(", ")}]`);
  for (const grupo of grupos) {
    const r = await getItensCompletos(year, month, grupo);
    const label = LABELS[grupo] || grupo;
    if (r.total === 0 && r.items.length === 0) {
      L.push(`${label}: — (${r.descritivo})`);
      continue;
    }
    L.push(`${label}: R$ ${r.total.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} (${r.descritivo})`);
    for (const it of r.items.slice(0, 5)) {
      const v = it.valor.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
      const forn = it.fornecedor && it.fornecedor !== "—" ? ` | fornecedor: ${it.fornecedor}` : "";
      const auto = it.auto ? " [auto]" : "";
      L.push(`  • ${it.descricao}: R$ ${v}${forn}${auto}`);
    }
    if (r.items.length > 5) L.push(`  • (+${r.items.length - 5} outros)`);
  }
  return L.join("\n");
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

function ehPerguntaCategoria(prompt: string): boolean {
  return detectarCategorias(prompt).length > 0;
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
  const ehCategoria = ehPerguntaCategoria(prompt);

  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    const fb = formatarFallback({ ctx, prompt, agentes });
    const frag = await fragmentarPorCategoria(ctx, prompt, year, month);
    return NextResponse.json({ resposta: fb + frag, modulos_ativos: agentes, context: contextoResumido, fallback: true });
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.3,
        messages: [
          { role: "system", content: SYS + "\n\nCONTEXTO FINANCEIRO FILTRADO:\n" + contextoJSON },
          { role: "user", content: `MODULOS DETECTADOS: ${agentes.join(", ")}\nCATEGORIA ESPECIFICA: ${ehCategoria ? "sim — fragmentar resposta por cost_type" : "nao"}\n\nPERGUNTA: ${prompt}` },
        ],
      }),
    });
    const data = await resp.json();
    const resposta = data?.choices?.[0]?.message?.content || "[sem resposta da OpenAI]";
    let respostaFinal = resposta;
    if (ehCategoria) respostaFinal = resposta + await fragmentarPorCategoria(ctx, prompt, year, month);
    await logFinanceAiEvent({ user_email: guard.user.email, user_id: guard.user.id, action: "chat_v8", period_ref: `${year}-${String(month).padStart(2,"0")}`, prompt, response: `[modulos: ${agentes.join(",")}] ${respostaFinal}` });
    return NextResponse.json({ resposta: respostaFinal, modulos_ativos: agentes, context: contextoResumido });
  } catch (e: any) {
    await logFinanceAiEvent({ user_email: guard.user.email, user_id: guard.user.id, action: "chat_v8_erro", period_ref: `${year}-${String(month).padStart(2,"0")}`, prompt, response: `erro: ${e.message?.slice(0,150)||"?"}` });
    return NextResponse.json({ error: "openai_falhou", detalhe: e?.message || String(e) }, { status: 502 });
  }
}

function formatarFallback({ ctx, prompt, agentes }: { ctx: any; prompt: string; agentes: string[] }): string {
  const now = ctx.now;
  const BRL = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const L: string[] = [];
  L.push(`[FALLBACK] OPENAI indisponivel — resposta direta do banco.`);
  L.push(`"${prompt}" | ${agentes.join(", ")} | ${now.label}`);
  if (agentes.includes("dre")) {
    const d = now.dre;
    L.push(`DRE: receita_bruta R$ ${BRL(d.receita_bruta)} | impostos R$ ${BRL(d.impostos)} | lucro_bruto R$ ${BRL(d.lucro_bruto)} | EBIT R$ ${BRL(d.ebit)} | lucro_liquido R$ ${BRL(d.lucro_liquido)}.`);
  }
  if (agentes.includes("fluxo_caixa")) {
    const c = now.cashflow;
    L.push(`Fluxo caixa: saldo R$ ${BRL(c.saldo)} | receitas R$ ${BRL(c.receita)} | despesas R$ ${BRL(c.despesa)} (manual R$ ${BRL(c.despesa_manual)} | auto R$ ${BRL(c.despesa_auto)}).`);
  }
  if (agentes.includes("custos")) {
    const c = now.costs || {};
    L.push(`Custos: total R$ ${BRL(c.total_mensal_estimado)} (fixos R$ ${BRL(c.fixos)} | variaveis R$ ${BRL(c.variaveis)}).`);
  }
  if (agentes.includes("planejamento")) L.push(`Planejamento: meta R$ ${BRL(now.planning?.meta_total)} | realizado R$ ${BRL(now.planning?.realizado_total)} | gap R$ ${BRL(now.planning?.gap)}.`);
  if (agentes.includes("emprestimos")) L.push(`Emprestimos: ${now.loans?.ativos} ativos | parcela R$ ${BRL(now.loans?.parcela_mes)} | saldo R$ ${BRL(now.loans?.saldo_devedor_total)}.`);
  if (agentes.includes("terceiros")) L.push(`Terceiros: — (nenhum cadastro de fornecedores foi encontrado nas tabelas financeiras; verificar finance_suppliers ou coluna supplier em finance_cost_entries).`);
  if (agentes.includes("impostos_modulo")) L.push(`Impostos: — (nenhuma entrada com auto_generated=true na categoria custos_variaveis/impostos para ${now.label}).`);
  return L.join("\n");
}
