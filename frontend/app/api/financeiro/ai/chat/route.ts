// === CHAT-V17-EARLY-RETURN-IMPOSTOS-SUPABASE ===
// === CHAT-V16-IMPOSTOS-COST-ENTRIES-MONTHLY-AMOUNT ===
// === CHAT-V14-FIX-TS1064-PROMISE-STRING ===
// === CHAT-V11-RESOLVE-CONFLITS-IMPOSTOS-RANGE ===
// === CHAT-V10.0-SUPPRESS-FRAG-AND-FIX-IMPOSTOS-RANGE ===
// === CHAT-V18-FIX-TS2339-CATCH-PROMISELIKE ===
// === CHAT-V19-RESPOSTA-DIRETA-NATURAL-DETALHADA ===
import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent, supabaseAdmin,
} from "@/lib/financeiro/ai/server";

// === CHAT-V8-AGENDA-COMPLETA-2026-08 ===
// V8 anti-invencao: nunca fabricar descricao / fornecedor / valor.

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
  + "REGRAS DE LEITURA (v8.6 — MES INTERROGADO):\n"
  + "- Quando a pergunta mencionar um MES diferente do periodo body (ex.: 'em julho/2026' com body.month=8), o JSON contem os blocos `cashflow_asked_month` e `dre_asked_month` com o agregado do MES perguntado. USE-O obrigatoriamente nesse caso — NAO use o bloco `cashflow`/`dre` do body.month.\n"
  + "- `cashflow_asked_month.data` e um mapa { type/category -> {total, count, auto, manual} }. `cashflow_asked_month.raw` traz ate 50 lancamentos (id/type/category/amount/description/auto_generated/source). Chave `period` = mes perguntado; `janela_atual_body` = mes do body.\n"
  + "- `dre_asked_month.items` traz as entradas manuais do DRE (finance_dre_manual_entries) do MES perguntado.\n"
  + "- Categoria especifica de RECEITA (ex.: 'vendas a prazo'): agregue SOMENTE type='receita' e category='vendas_prazo' do cashflow_asked_month.raw ou data. NUNCA some com category='vendas_recorrentes' no mesmo calculo — origens distintas.\n"
  + "- Se o mes perguntado == body.month (mesmaJanela=true), esses blocos NAO sao gerados; use normalmente `cashflow`/`dre` do contexto principal.\n\n"
  + "Modulos do contexto ja disponiveis:\n"
  + "- dre: receita_bruta, impostos, cmv, lucro_bruto, despesas_administrativas/pessoal/vendas/marketing/infraestrutura, despesas_financeiras, receitas_financeiras, depreciacao_amortizacao, ebit, ebitda, irpj_csll, lucro_liquido, margem_liquida_percent.\n"
  + "- cashflow: receita, despesa, saldo, separado manual vs auto_generated, por categoria (vendas_recorrentes, vendas_vista, vendas_prazo, custos_fixos, investimentos_capex, emprestimo, custos_variaveis, receitas_financeiras).\n"
  + "- cashflow_asked_month (v8.6): agregacao type/category do MES perguntado, presente apenas quando difere do body.month.\n"
  + "- dre_asked_month (v8.6): entradas do DRE do MES perguntado, presente apenas quando difere do body.month.\n"
  + "- costs: fixos, variaveis (% x receita estimada), total_mensal_estimado, by_cost_type (funcionarios_salarios, aluguel_condominio, marketing_publicidade, comissoes, energia_utilities, infraestrutura_capex, outros). Lista detalhada em costs.items[] (finance_cost_entries).\n"
  + "- planning: meta_total, realizado_total, gap, atingimento_percent (planejamento_metas_mensais em reference_year/reference_month).\n"
  + "- loans: principal, parcelas a_pagar/pagas, saldo, cet, iof, juros (finance_loan_contracts + finance_loan_installments).\n"
  + "- DRE acumulado do ANO: contexto.dre_manual_year <- finance_dre_manual_entries (line_key + operator + amount).\n"
  + "- Parcelas a pagar futuras: contexto.loans_future <- finance_loan_installments (status != pago, due_date >= hoje, ate 36 proximas).\n"
  + "- Metas vs realizado: contexto.planning_year <- planejamento_metas_mensais (reference_year=year, reference_month 1..12, meta+realizado+gap).\n"
  + "- Cenarios futuros ANUAIS: contexto.future_proj <- planejamento_projecoes (base_year=year, projection_year>year). Quando a pergunta for mensal, dividir revenue_amount/12.\n"
  + "- passado: contexto.financeiro.historico_12m -> [{label, receita, despesa, saldo}].\n"
  + "\nFORMATO DE SAIDA OBRIGATORIO (V19):\n"
  + "- Quando o usuario pedir valores agregados de um MODULO (custos, planejamento, dre, fluxo_caixa, emprestimos) ou usar palavras-chaves /detalhes/, /lista/, /tabela/, /mes a mes/, /mensal/, /categoria/, /anual/, /completo/, voce DEVE entregar uma tabela com os 12 meses (Jan..Dez) ou o range solicitado.\n"
  + "- Cada linha deve conter pelo menos: identificador (descricao/categoria/linha), valor em R$ (numerico, NUNCA texto vazio quando o valor existe), fonte (qual tabela Supabase).\n"
  + "- Termine SEMPRE com: (a) linha TOTAL explicita em **R$ ...**; (b) linha FONTE listando tabelas consultadas; (c) UMA frase em linguagem natural resumindo o achado.\n"
  + "- Para perguntas RANGE (janeiro a agosto, ate junho, etc), detalhe CADA mes do range em uma linha propria -- NUNCA consolide em uma linha so.\n"
  + "- NUNCA escreva apenas 0 se puder explicar a falta do dado (sem lancamentos ou -); quando o cadastro existe mas o valor mensal e zero, escreva: cadastro corporativo encontrado, mas com monthly_amount=0,00 -- revisar.\n"
  + "- Use ** para destacar totais, | em colunas de tabela markdown, e pt-BR (R$ 1.234,56).\n"
  + "- Lembre o usuario de que voce NAO inventa valores -- quando nao houver dado, retorne literalmente - ou a mensagem sem lancamentos.\n";

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
  ["marketing_publicidade", /(marketing|publicidade|propaganda|anunci|anuncio|m[íi]dia)/i],
  ["comissoes",             /(comiss)/i],
  ["energia_utilities",     /(energia|luz|agua|telefone|internet|cloud|ti\b|servicos de ti|enel|light)/i],
  ["infraestrutura_capex",  /(infraestrutura|capex|reforma|equipamento|mobiliario|escritorio)/i],
  ["terceiros",             /(terceiro|fornecedor|prestador|parceiro)/i],
  ["impostos",              /(imposto|simples|das |iss|icms|irpj|csll|pis|cofins|tributo)/i],
];

const RECEITA_KEYWORDS: Array<[string, RegExp]> = [
  ["vendas_prazo",        /(venda[s]?\s+a\s+prazo|a\s+prazo|prazo)/i],
  ["vendas_vista",        /(venda[s]?\s+a\s+vista|a\s+vista|vista)/i],
  ["vendas_recorrentes",  /(venda[s]?\s+recorrente[s]?|recorrente)/i],
  ["financiamento",       /(financia)/i],
  ["outras_receitas",     /(outra[s]?\s+receita[s]?)/i],
  ["receitas_financeiras",/(receita[s]?\s+financeira[s]?|financeira|juros\s+recebidos|rendimento)/i],
];

function detectarAgentes(p: string): string[] {
  const lower = p.toLowerCase();
  const ativos = agenteRegex.filter(([, rx]) => rx.test(lower)).map(([nome]) => nome);
  if (!ativos.length) ativos.push("dre","fluxo_caixa","custos","planejamento","emprestimos");
  return Array.from(new Set(ativos));
}

function detectarCategorias(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  // V19: gatilhos genericos - se o usuario pedir tabela/lista/detalhe
  // de custo/despesa/gasto/categoria, fragmenta TODAS as categorias.
  const GENERIC_TRIGGERS = /\b(tabela|lista|detalhe|detalhes|detalhado|detalhada|mostrar|mostre|complete|completo|categoria|categorias|mensal|mensalmente|mes a mes|por categoria|por mes|anual|anualmente|grafico|relatorio|relat[oó]rio|breakdown|detalhamento)\b/i;
  const GENERIC_WORDS   = /\b(custo|custos|despesa|despesas|gasto|gastos|spend|expense|cash out)\b/i;
  if (GENERIC_TRIGGERS.test(lower) && GENERIC_WORDS.test(lower)) {
    return CATEGORIA_REGEX.map(([key]) => key);
  }
  return CATEGORIA_REGEX.filter(([, rx]) => rx.test(lower)).map(([key]) => key);
}

function detectarCategoriaReceita(prompt: string): string | null {
  for (const [cat, rx] of RECEITA_KEYWORDS) {
    if (rx.test(prompt)) return cat;
  }
  return null;
}

async function getItensCompletos(year: number, month: number, categoria: string): Promise<{
  total: number; items: any[]; source: string; descritivo: string;
}> {
  if (!supabaseAdmin) return { total: 0, items: [], source: "supabase_indisponivel", descritivo: "Supabase indisponivel — sem leitura possivel." };
  const [, rx] = CATEGORIA_REGEX.find(([k]) => k === categoria) || [null, null];
  if (!rx) return { total: 0, items: [], source: "categoria_desconhecida", descritivo: `Categoria "${categoria}" sem regex.` };

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

const RECEITA_LABELS: Record<string, string> = {
  vendas_prazo:         "Vendas a prazo",
  vendas_vista:         "Vendas a vista",
  vendas_recorrentes:   "Vendas recorrentes",
  financiamento:        "Financiamento",
  outras_receitas:      "Outras receitas",
  receitas_financeiras: "Receitas financeiras",
};

async function fragmentarPorCategoria(ctx: any, prompt: string, year: number, month: number): Promise<string> {
  try {
    if ((ctx as any)?.__noFrag === true) return "";
  } catch {}
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

// ===== V8.8: DRE LOCAL + FOCO =====
function computeDreLocal(year: number, month: number, raw: any[]): any {
  const all = Array.isArray(raw) ? raw : [];
  const filtered = all.filter((r: any) => {
    const y = Number(r?.year ?? r?.ano ?? 0);
    const m = Number(r?.month ?? r?.mes ?? 0);
    return y === year && m === month;
  });
  const receitas = filtered.filter((r: any) => String(r?.type || "").toLowerCase() === "receita");
  const despesas = filtered.filter((r: any) => String(r?.type || "").toLowerCase() === "despesa");
  const receita_bruta = receitas.reduce((s: number, r: any) => s + Number(r?.amount || 0), 0);
  const total_despesas = despesas.reduce((s: number, r: any) => s + Number(r?.amount || 0), 0);
  return {
    source: "local_cashflow", year, month,
    receita_bruta, total_despesas,
    lucro_liquido: receita_bruta - total_despesas,
    by_category: filtered.reduce((acc: any, r: any) => {
      const k = String(r?.category || "outros");
      acc[k] = (acc[k] || 0) + Number(r?.amount || 0);
      return acc;
    }, {}),
    count: filtered.length
  };
}

function ehImpostos(prompt: string): boolean {
  const p = String(prompt || "").toLowerCase();
  return /\bimpostos?\b|tributo|tributos|csll|irpj|pis|cofins|\biss\b|icms|cbs|ibs|darf/.test(p);
}

function focusOnly(prompt: string): boolean {
  const p = String(prompt || "").toLowerCase();
  if (!/(receita|total|despesa|saldo|lucro|preju|caixa)/.test(p)) return false;
  return /\b(jul|ago|set|out|nov|dez|jan|fev|mar|abr|mai|jun)[a-z]*\s*\/?\s*\d{2,4}\b|\b\d{4}-\d{2}\b|\b\d{1,2}\/\d{2,4}\b/.test(p);
}
// === CHAT-V9.2-CLASSIFICADOR-DRE ===
function classificarLinhaDRE(r: any): string | null {
  const tRaw = String(r?.type || "").toLowerCase();
  const c = String(r?.category || "").toLowerCase();
  const d = String(r?.description || "").toLowerCase();

  if (r?.line_key === "receita_financeira_manual")     return "receitas_financeiras";
  if (r?.line_key === "depreciacao_amortizacao_manual") return "depreciacao_amortizacao";

  if (tRaw === "receita") return "receita_bruta";

  if (tRaw === "despesa") {
    if (/imposto|simples|das|iss|icms|irpj|csll|pis|cofins|tributo|cbs|ibs|darf/.test(c + " " + d)) return "impostos";
    if (c === "custos_variaveis" || /cmv|mercadoria|materia.?prima/.test(d)) return "cmv";
    if (c === "investimentos_capex" || /capex|infraestrutura|infra|reforma|equipamento|mobiliario|escritorio/.test(d)) return "despesas_infraestrutura";
    if (c === "emprestimo" || /emprestimo|emprestim|parcela|juros|cet|iof|financiamento/.test(d)) return "despesas_financeiras";
    if (/funcionar|salar|salario|folha|pessoal|pro.?labore|prolabore|encargos|fgts|inss|ferias|bonus|13o|decimo/.test(d)) return "despesas_pessoal";
    if (/comiss/.test(d)) return "despesas_vendas";
    if (/marketing|publicidade|propaganda|anunci|anuncio|google.?ads|meta.?ads|facebook|instagram|m[íi]dia/.test(d)) return "despesas_marketing";
    if (c === "custos_fixos") return "despesas_administrativas";
    return "despesas_administrativas";
  }
  return null;
}
// === CHAT-V9.2-LOADER-DRE ===
async function carregarDreAnual(year: number): Promise<any> {
  const BUCKETS = ["receita_bruta","impostos","cmv","despesas_administrativas","despesas_pessoal","despesas_vendas","despesas_marketing","despesas_infraestrutura","despesas_financeiras","receitas_financeiras","depreciacao_amortizacao"];
  const empty_mes = () => Object.fromEntries(BUCKETS.map(b => [b, 0]));
  const anual: Record<string, number> = empty_mes();
  const meses: Record<number, Record<string, number>> = {};
  for (let m = 1; m <= 12; m++) meses[m] = empty_mes();
  if (!supabaseAdmin) return { anos_meses: meses, anual, source: "supabase_indisponivel", descritivo: "supabase indisponivel" };

  let cfRows: any[] = []; let dmRows: any[] = []; let cfErr = ""; let dmErr = "";
  try {
    const r = await supabaseAdmin.from("finance_cash_flow_entries")
      .select("year,month,type,category,amount,description")
      .eq("year", year).gte("month", 1).lte("month", 12).limit(2000);
    if (!r.error && r.data) cfRows = r.data as any[]; else cfErr = String(r.error?.message || "");
  } catch (e: any) { cfErr = String(e?.message || e).slice(0, 120); }
  try {
    const r = await supabaseAdmin.from("finance_dre_manual_entries")
      .select("year,month,line_key,operator,amount,description")
      .eq("year", year);
    if (!r.error && r.data) dmRows = r.data as any[]; else dmErr = String(r.error?.message || "");
  } catch (e: any) { dmErr = String(e?.message || e).slice(0, 120); }

  for (const r of cfRows) {
    const b = classificarLinhaDRE(r); if (!b) continue;
    const m = Number(r.month); if (m < 1 || m > 12) continue;
    meses[m][b] += Number(r.amount || 0);
    anual[b] += Number(r.amount || 0);
  }
  for (const r of dmRows) {
    const b = classificarLinhaDRE(r); if (!b) continue;
    const m = Number(r.month); if (m < 1 || m > 12) continue;
    const sinal = String(r.operator||"add").toLowerCase() === "subtract" ? -1 : 1;
    meses[m][b] += sinal * Number(r.amount || 0);
    anual[b]    += sinal * Number(r.amount || 0);
  }
  return { anos_meses: meses, anual, source: cfErr||dmErr ? `parcial: cf=${cfErr||"ok"}; dm=${dmErr||"ok"}` : "finance_cash_flow_entries + finance_dre_manual_entries", descritivo: `cf=${cfRows.length} dm=${dmRows.length} ano=${year}` };
}

// === CHAT-V9.2-DETECT ===
function ehPerguntaDreAnual(prompt: string): { year: number } | null {
  const p = String(prompt||"").toLowerCase();
  if (!/\b(dre|demonstrativo|demons|resultado|lucro|preju|preju[ií]zo|exercicio|lpa|ebit|margem)\b/.test(p)) return null;
  const y = (p.match(/\b(20\d{2})\b/) || [])[1];
  if (!y) return null;
  return { year: Number(y) };
}

// === CHAT-V9.2-FORMAT-DRE-MARKDOWN ===
function formatarDreMarkdown(year: number, dre: any): string {
  const meses = dre.anos_meses || {};
  const anual = dre.anual || {};
  const BRL = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = (n: number) => (n*100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })+"%";
  type Row = { name: string; values: number[]; total: number; kind: string; pct?: number };
  const rows: Row[] = [];
  function pushBucket(name: string, bucket: string, kind: string) {
    const values: number[] = []; let total = 0;
    for (let m = 1; m <= 12; m++) { const v = Number(meses[m]?.[bucket]||0); values.push(v); total += v; }
    rows.push({ name, values, total, kind });
  }
  function pushComputed(name: string, fn: (m:number)=>number, kind: string) {
    const values: number[] = []; let total = 0;
    for (let m = 1; m <= 12; m++) { const v = fn(m); values.push(v); total += v; }
    rows.push({ name, values, total, kind });
  }
  pushBucket("(=) Receita Bruta de Vendas", "receita_bruta", "rb");
  pushBucket("(-) Impostos", "impostos", "imp");
  pushComputed("(=) Receita Líquida", m => Number(meses[m]?.receita_bruta||0) - Number(meses[m]?.impostos||0), "rl");
  pushBucket("(-) Custo das Mercadorias Vendidas (CMV)", "cmv", "cmv");
  pushComputed("(=) Lucro Bruto", m => Number(meses[m]?.receita_bruta||0) - Number(meses[m]?.impostos||0) - Number(meses[m]?.cmv||0), "lb");
  pushBucket("(-) Despesas Administrativas", "despesas_administrativas", "adm");
  pushBucket("(-) Despesas com Pessoal", "despesas_pessoal", "pes");
  pushBucket("(-) Despesas com Vendas", "despesas_vendas", "vds");
  pushBucket("(-) Despesas de Marketing", "despesas_marketing", "mkt");
  pushBucket("(-) Despesas com Infraestrutura", "despesas_infraestrutura", "inf");
  pushBucket("(-) Despesas Financeiras", "despesas_financeiras", "fin");
  pushBucket("(+) Receitas Financeiras", "receitas_financeiras", "recFin");
  pushBucket("(-) Depreciação e Amortização", "depreciacao_amortizacao", "dep");
  pushComputed("(=) LAJIR / EBIT", m => {
    const rl = Number(meses[m]?.receita_bruta||0) - Number(meses[m]?.impostos||0);
    const lb = rl - Number(meses[m]?.cmv||0);
    return lb
      - Number(meses[m]?.despesas_administrativas||0)
      - Number(meses[m]?.despesas_pessoal||0)
      - Number(meses[m]?.despesas_vendas||0)
      - Number(meses[m]?.despesas_marketing||0)
      - Number(meses[m]?.despesas_infraestrutura||0)
      - Number(meses[m]?.despesas_financeiras||0)
      + Number(meses[m]?.receitas_financeiras||0)
      - Number(meses[m]?.depreciacao_amortizacao||0);
  }, "ebit");
  rows.push({ name: "(-) IRPJ + CSLL", values: Array(12).fill(0), total: 0, kind: "irpj" });
  const ebitIdx = rows.findIndex(r => r.kind === "ebit");
  rows.push({ name: "(=) Lucro Líquido do Exercício", values: rows[ebitIdx].values.slice(), total: rows[ebitIdx].total, kind: "ll" });
  const llIdx = rows.length - 1;
  pushComputed("(=) Margem Líquida (%)", m => {
    const rec = Number(meses[m]?.receita_bruta||0);
    return rec > 0 ? Number(rows[llIdx].values[m-1]) / rec : 0;
  }, "mg");
  rows[rows.length-1].total = Number(anual.receita_bruta||0) > 0 ? rows[llIdx].total / Number(anual.receita_bruta) : 0;
  const recAnual = Number(anual.receita_bruta||0);
  for (const r of rows) r.pct = recAnual > 0 && r.kind !== "mg" ? r.total / recAnual : 0;

  const colNames = ["Conta","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez","Total Ano","%"];
  const widths   = [40,12,12,12,12,12,12,12,12,12,12,12,12,15,9];
  const pad = (s: string, w: number, right: boolean) => (s.length >= w ? s : (right ? " ".repeat(w-s.length)+s : s+" ".repeat(w-s.length)));
  const fmt = (v: number, isMg: boolean) => isMg ? PCT(v) : (v === 0 ? "0,00" : BRL(v));
  const lines: string[] = [];
  lines.push("DRE " + year + " — anual (dados vindos do Fluxo de Caixa e manuais).");
  lines.push("");
  const header =
    pad(colNames[0], widths[0], false) + " " +
    colNames.slice(1,13).map((c,i) => pad(c, widths[i+1], true)).join(" ") + " " +
    pad(colNames[13], widths[13], true) + " " +
    pad(colNames[14], widths[14], true);
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const row of rows) {
    const isMg = row.kind === "mg";
    const cells = row.values.map((v, i) => pad(fmt(v, isMg), widths[i+1], true)).join(" ");
    const totalC = pad(fmt(row.total, isMg), widths[13], true);
    const pctC = isMg ? pad(PCT(row.total), widths[14], true) : (recAnual > 0 ? pad(PCT(row.pct||0), widths[14], true) : pad("—", widths[14], true));
    lines.push(pad(row.name, widths[0], false) + " " + cells + " " + totalC + " " + pctC);
  }
  lines.push("");
  lines.push("Resumo em linguagem natural:");
  lines.push(`No ano de ${year}, a Receita Bruta foi ${BRL(recAnual)}. Os Impostos sobre vendas somaram ${BRL(Number(anual.impostos||0))} (${recAnual?PCT(Number(anual.impostos||0)/recAnual):"—"} da receita). As demais despesas operacionais elevadas implicaram Lucro Líquido do exercício de ${BRL(rows[llIdx].total)}, com Margem Líquida de ${PCT(rows[rows.length-1].total)}.`);
  lines.push("");
  lines.push(`Fonte: ${dre.source || "finance_cash_flow_entries + finance_dre_manual_entries"}. (${dre.descritivo||""})`);
  return lines.join("\n");
}

// === CHAT-V9.3-DETECT-METAS ===
function ehPerguntaMetasAnual(prompt: string): { year: number } | null {
  const p = String(prompt || "").toLowerCase();
  if (!/\b(meta|metas|planejamento|planeja[mnv]ento|or[cç]a(?:mento|mento)?|forecast|previsa|previst)\b/.test(p)) return null;
  const y = (p.match(/\b(20\d{2})\b/) || [])[1];
  if (!y) return null;
  return { year: Number(y) };
}

async function carregarMetasRecorrentes(year: number): Promise<any[]> {
  if (!supabaseAdmin) return [];
  try {
    const r = await supabaseAdmin.from("planejamento_metas_mensais")
      .select("reference_year,reference_month,meta_amount,actual_amount,notes")
      .eq("reference_year", year)
      .order("reference_month", { ascending: true });
    if (r.error || !r.data) {
      console.log("[V9.3 metas recorrentes] erro/leitura:", r.error?.message ?? "vazio");
      return [];
    }
    return (r.data as any[]) || [];
  } catch (e: any) {
    console.log("[V9.3 metas recorrentes] excecao:", String(e?.message || e).slice(0, 160));
    return [];
  }
}

function formatarMetasMarkdown(year: number, recorrentes: any[]): string {
  const BRL = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = (frac: number) => (frac*100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const recPorMes: Record<number, { meta: number; actual: number; gap: number; notes: string }> = {};
  let metaTotal = 0, actualTotal = 0;
  for (const r of recorrentes) {
    const m = Number(r.reference_month);
    if (m < 1 || m > 12) continue;
    const meta = Number(r.meta_amount || 0);
    const actual = Number(r.actual_amount ?? 0);
    recPorMes[m] = { meta, actual, gap: meta - actual, notes: String(r.notes ?? "") };
    metaTotal += meta;
    actualTotal += actual;
  }
  for (let m = 1; m <= 12; m++) {
    if (!recPorMes[m]) recPorMes[m] = { meta: 0, actual: 0, gap: 0, notes: "" };
  }

  const lines: string[] = [];
  lines.push("Metas de planejamento " + year + " (dados vindos do módulo Planejamento).");
  lines.push("");
  lines.push("METAS RECORRENTES (mensais):");
  lines.push("");
  lines.push("Mês  | Meta          | Realizado     | Gap           | Ating.");
  lines.push("------|---------------|---------------|---------------|--------");
  for (let m = 1; m <= 12; m++) {
    const x = recPorMes[m];
    const meta   = x.meta;
    const actual = x.actual;
    const km = meta > 0;
    const ka = actual > 0;
    const ating = km ? actual / meta : 0;
    const atingStr = km ? PCT(ating) : "-";
    const metaStr   = km   ? BRL(meta)   : "-";
    const actualStr = ka   ? BRL(actual) : "-";
    const gapStr    = (km || ka) ? BRL(meta - actual) : "-";
    lines.push(MES[m-1].padEnd(5) + " | " + metaStr.padEnd(13) + " | " + actualStr.padEnd(13) + " | " + gapStr.padEnd(13) + " | " + atingStr);
    if (x.notes && x.notes.trim().length > 0) {
      lines.push("     obs: " + x.notes);
    }
  }
  lines.push("------|---------------|---------------|---------------|--------");
  const gapTotal = metaTotal - actualTotal;
  lines.push("ANO   | " + (metaTotal   ? BRL(metaTotal)   : "-").padEnd(13) + " | "
                + (actualTotal ? BRL(actualTotal) : "-").padEnd(13) + " | "
                + ((metaTotal||actualTotal) ? BRL(gapTotal) : "-").padEnd(13) + " | "
                + (metaTotal > 0 ? PCT(actualTotal/metaTotal) : "-"));
  lines.push("");

  if (recorrentes.length === 0) {
    lines.push("Não há metas recorrentes registradas para " + year + " no módulo Planejamento.");
  } else {
    const mesesComMeta = Object.values(recPorMes).filter(x => x.meta > 0).length;
    if (mesesComMeta === 0) {
      lines.push("Resumo em linguagem natural:");
      lines.push("Foram encontrados " + recorrentes.length + " registro(s) em planejamento_metas_mensais para " + year + ", porém sem valor de meta definido.");
      lines.push("Realizado total (meses com valor): " + BRL(actualTotal) + ".");
    } else {
      const atingFinal = metaTotal > 0 ? (actualTotal/metaTotal) : 0;
      lines.push("Resumo em linguagem natural:");
      lines.push("Para " + year + ", as metas recorrentes mensais somam " + BRL(metaTotal) + ", com " + BRL(actualTotal) + " já realizado e gap de " + BRL(gapTotal) + " (atingimento geral de " + PCT(atingFinal) + ").");
      if (recorrentes.length < 12) {
        lines.push("Atenção: " + (12 - recorrentes.length) + " mês(es) sem linha no módulo — interpretado(s) como sem meta definida.");
      }
    }
  }
  lines.push("");
  lines.push("Fonte: planejamento_metas_mensais (tabela de metas recorrentes mensais).");
  return lines.join("\n");
}

// === CHAT-V8.8-DRE-LOCAL ===

function ehPerguntaCategoria(prompt: string): boolean {
  return detectarCategorias(prompt).length > 0;
}

function detectarMesAno(prompt: string, fallbackYear: number, fallbackMonth: number): { year: number; month: number } {
  const MESES: Record<string, number> = {
    jan:1,janeiro:1, fev:2,fevereiro:2, mar:3,marco:3,
    abr:4,abril:4, mai:5,maio:5, jun:6,junho:6,
    jul:7,julho:7, ago:8,agosto:8, set:9,setembro:9,
    out:10,outubro:10, nov:11,novembro:11, dez:12,dezembro:12
  };
  let m = prompt.match(/\b(\d{1,2})\s*\/\s*(\d{2,4})\b/);
  if (m) {
    const mm = Math.max(1, Math.min(12, Number(m[1])));
    let yy = Number(m[2]); if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
    return { year: yy, month: mm };
  }
  const iso = prompt.match(/\b(\d{4})-(\d{2})\b/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const m2 = prompt.toLowerCase().match(/\b(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co|ço|co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\s*(?:\/|\s+de\s+)?\s*(\d{2,4})?\b/);
  if (m2) {
    const mm = MESES[m2[1]];
    if (mm) {
      let yy: number | null = null;
      if (m2[2]) { yy = Number(m2[2]); if (yy < 100) yy += yy >= 70 ? 1900 : 2000; }
      if (yy == null) yy = fallbackYear;
      return { year: yy, month: mm };
    }
  }
  return { year: fallbackYear, month: fallbackMonth };
}

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });
  const body = await req.json().catch(() => ({}));
  const year   = Number(body?.year  ?? new Date().getFullYear());
  const month  = Number(body?.month ?? new Date().getMonth() + 1);
  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt_vazio" }, { status: 400 });

  const ctx: any = await loadFinanceContextFull(year, month);

  let cashflowAsked: any = null;
  let dreAsked: any = null;
  const askPeriod = detectarMesAno(prompt, year, month);
  const mesmaJanela = (askPeriod.year === year && askPeriod.month === month);
  if (supabaseAdmin && !mesmaJanela) {
    try {
      const [{ data: cfA }, { data: dreA }] = await Promise.all([
        supabaseAdmin.from("finance_cash_flow_entries")
          .select("id,type,category,amount,description,auto_generated,source")
          .eq("year", askPeriod.year).eq("month", askPeriod.month),
        supabaseAdmin.from("finance_dre_manual_entries")
          .select("section,line_key,operator,description,amount")
          .eq("year", askPeriod.year).eq("month", askPeriod.month),
      ]);
      const aggr: Record<string, any> = {};
      for (const r of (cfA ?? [])) {
        const t = String(r.type || "outros").toLowerCase();
        const c = String(r.category || "outras").toLowerCase();
        const k = t + "/" + c;
        if (!aggr[k]) aggr[k] = { type: t, category: c, total: 0, count: 0, auto: 0, manual: 0 };
        aggr[k].total += Number(r.amount || 0);
        aggr[k].count += 1;
        if (r.auto_generated) aggr[k].auto += 1; else aggr[k].manual += 1;
      }
      cashflowAsked = {
        __escopo: "mes_interrogado",
        period: askPeriod.year + "-" + String(askPeriod.month).padStart(2, "0"),
        janela_atual_body: year + "-" + String(month).padStart(2, "0"),
        data: aggr,
        raw: (cfA ?? []).slice(0, 50),
      };
      dreAsked = {
        __escopo: "mes_interrogado",
        period: askPeriod.year + "-" + String(askPeriod.month).padStart(2, "0"),
        items: (dreA ?? []),
      };
    } catch (e: any) {
      console.log("[V8.5] erro ao carregar mes perguntado:", String(e?.message || e).slice(0, 160));
    }
  }

  if (ctx && typeof ctx === "object" && "error" in ctx && (ctx as any).error) {
    return NextResponse.json({ error: (ctx as any).error }, { status: 500 });
  }

  const agentes = detectarAgentes(prompt);
  const contextoResumido = montarContextoResumido(ctx, agentes);
  (contextoResumido as any).cashflow_asked_month = cashflowAsked;
  (contextoResumido as any).dre_asked_month       = dreAsked;

  let dreManualYear: any[] = [];
  let loansFuture:   any[] = [];
  let planningYear:  any[] = [];
  let futureProj:    any[] = [];
  if (supabaseAdmin) {
    try {
      const [dm, lo, pl, pp] = await Promise.all([
        supabaseAdmin.from("finance_dre_manual_entries")
          .select("section,line_key,operator,description,amount,year,month")
          .eq("year", year),
        supabaseAdmin.from("finance_loan_installments")
          .select("contract_id,due_date,amount,principal,interest,status")
          .neq("status", "pago")
          .gte("due_date", year + "-" + String(month).padStart(2, "0") + "-01")
          .order("due_date").limit(36),
        supabaseAdmin.from("planejamento_metas_mensais")
          .select("reference_year,reference_month,meta_amount,realized_amount,gap_amount")
          .eq("reference_year", year)
          .order("reference_month"),
        supabaseAdmin.from("planejamento_projecoes")
          .select("base_year,projection_year,revenue_amount,net_profit_amount,net_margin_percent,monthly_fixed_cost,employee_count,working_capital_amount,notes")
          .eq("base_year", year)
          .gt("projection_year", year)
          .order("projection_year"),
      ]);
      dreManualYear = (dm.data || []) as any[];
      loansFuture   = (lo.data || []) as any[];
      planningYear  = (pl.data || []) as any[];
      futureProj    = (pp.data || []) as any[];
    } catch (e: any) {
      console.log("[V8.2 enriquecimento] erro:", String(e?.message || e).slice(0, 160));
    }
  }
  const contextoResumidoExt = {
    ...contextoResumido,
    historico_12m: ((ctx as any)?.historico_12m ?? []),
    dre_manual_year: dreManualYear,
    loans_future:    loansFuture,
    planning_year:   planningYear,
    future_proj:     futureProj,
  };
  const contextoJSON = JSON.stringify(contextoResumidoExt, null, 2);
  const ehCategoria = ehPerguntaCategoria(prompt);

  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const targetYear  = (cashflowAsked?.period ? Number(String(cashflowAsked.period).split("-")[0]) : year);
  const targetMonth = (cashflowAsked?.period ? Number(String(cashflowAsked.period).split("-")[1]) : month);

  // === CHAT-V8.9-FOCO-RAPIDO ===
  const __catR = detectarCategoriaReceita(prompt);
  const __pfx  = focusOnly(prompt);
  const __imp  = ehImpostos(prompt);
  // === CHAT-V9.5-FOCO-RAPIDO ===
  const __supV = (!!__catR) || __pfx || __imp;

  (ctx as any).__noFrag = false;

  // === CHAT-V9.3-POST-CARREGA-METAS ===
  const __metasAsk = ehPerguntaMetasAnual(prompt);
  if (__metasAsk) {
    try {
      const __rec = await carregarMetasRecorrentes(__metasAsk.year);
      (ctx as any).__metasRecorrentes = __rec;
      (contextoResumido as any).metas_anual = {
        year: __metasAsk.year,
        count_recorrentes: __rec.length,
      };
    } catch (e: any) {
      console.log("[V9.3 metas] erro:", String(e?.message || e).slice(0, 160));
    }
  }

  // === CHAT-V9.2-POST-CARREGA-DRE ===
  const __dreAsk = ehPerguntaDreAnual(prompt);
  if (__dreAsk && supabaseAdmin) {
    try {
      const __dre = await carregarDreAnual(__dreAsk.year);
      (ctx as any).__dreAnual = __dre;
      (contextoResumido as any).dre_anual = { year: __dreAsk.year, source: __dre.source, descritivo: __dre.descritivo };
    } catch (e: any) {
      console.log("[V9.2 DRE] erro:", String(e?.message || e).slice(0, 160));
    }
  }

  // === CHAT-V17-EARLY-RETURN-IMPOSTOS-SUPABASE-DIRECT ===
  // Antes do OpenAI (mesmo com API key): quando o prompt eh de impostos range,
  // busca direto no Supabase e responde sem alucinar zero.
  if (ehImpostos(prompt) && supabaseAdmin) {
    try {
      const MESES_V17: Array<[number, string]> = [
        [1, "janeiro|jan\b"], [2, "fevereiro|fev\b"], [3, "mar[cç]o|mar\b"], [4, "abril|abr\b"],
        [5, "maio|mai\b"], [6, "junho|jun\b"], [7, "julho|jul\b"], [8, "agosto|ago\b"],
        [9, "setembro|set\b"], [10, "outubro|out\b"], [11, "novembro|nov\b"], [12, "dezembro|dez\b"],
      ];
      const __pl = String(prompt || "").toLowerCase();
      const __msDev = MESES_V17.filter(([_, re]) => new RegExp(re, "i").test(__pl)).map(([m]) => m);
      const __isAno = /(ano|anual|todos\s+os\s+meses|inteiro)/i.test(__pl);
      const __taxMonths: number[] = __isAno
        ? Array.from({ length: 12 }, (_, i) => i + 1)
        : (__msDev.length >= 2 ? __msDev : [targetMonth]);

      // 1a fonte: cashflow direto (sem depender de cashflowAsked)
      let cfRows: any[] = [];
      try {
        cfRows = ((await supabaseAdmin.from("finance_cash_flow_entries")
          .select("year,month,type,category,description,amount")
          .eq("year", targetYear)
          .in("month", __taxMonths)
          .eq("type", "despesa")) as any)?.data || [];
      } catch { cfRows = []; }

      let finalRows: any[] = (cfRows || []).filter((r: any) =>
        /imposto|simples|das|iss|icms|irpj|csll|pis|cofins|tributo/i.test(
          String(r.category || "") + " " + String(r.description || "")
        )
      );
      let fonte = "finance_cash_flow_entries";

      // 2a fonte: cost_entries com monthly_amount (se cashflow vazio)
      if (finalRows.length === 0) {
        let costRows: any[] = [];
        try {
          costRows = ((await supabaseAdmin.from("finance_cost_entries")
            .select("cost_type,category,description,monthly_amount,status")
            .eq("status", "ativo")) as any)?.data || [];
        } catch { costRows = []; }

        const costImpostos = (costRows || []).filter((r: any) => {
          const ct = String(r.cost_type || "").toLowerCase().trim();
          const desc = String(r.description || "").toLowerCase();
          return ct === "impostos" || ct === "imposto" || ct === "tax" || ct === "tributo" || ct === "tributos" ||
                 /imposto|simples|das|iss|icms|irpj|csll|pis|cofins|tributo/i.test(ct + " " + desc);
        });

        if (costImpostos.length > 0) {
          for (const r of costImpostos) {
            const monthly = Number(r.monthly_amount || 0);
            if (!monthly) continue;
            for (const m of __taxMonths) {
              finalRows.push({
                year: targetYear, month: m, type: "despesa",
                category: String(r.category || r.cost_type || "impostos"),
                description: r.description || "Impostos",
                amount: monthly,
              });
            }
          }
          fonte = "finance_cost_entries (monthly_amount × meses)";
        }
      }

      // V19: 3a fonte - finance_dre_manual_entries com description/line_key
      // contendo "imposto" / "tributo" / "tax".
      let infoBlankCostEntries: number = 0;
      if (finalRows.length === 0) {
        try {
          const dreRows: any[] = ((await supabaseAdmin.from("finance_dre_manual_entries")
            .select("section,line_key,operator,description,amount,year,month")
            .eq("year", targetYear)
            .in("month", __taxMonths)) as any)?.data || [];
          const dreImpostos = (dreRows || []).filter((r: any) =>
            /imposto|tributo|tax/i.test(String(r.description || "") + " " + String(r.line_key || ""))
          );
          if (dreImpostos.length > 0) {
            for (const r of dreImpostos) {
              finalRows.push({
                year: targetYear, month: r.month || targetMonth, type: "despesa",
                category: "impostos",
                description: "DRE manual: " + (r.description || r.line_key || "impostos"),
                amount: Math.abs(Number(r.amount || 0)),
              });
            }
            fonte = "finance_dre_manual_entries (impostos manual)";
          }
        } catch { /* silencio: cai no fallback informativo */ }
      }
      if ((cfRows || []).length === 0) {
        try {
          const allCost: any[] = ((await supabaseAdmin.from("finance_cost_entries")
            .select("cost_type,monthly_amount")
            .eq("status", "ativo")) as any)?.data || [];
          infoBlankCostEntries = (allCost || []).filter((r: any) =>
            /imposto/i.test(String(r.cost_type || "")) && Number(r.monthly_amount || 0) === 0
          ).length;
        } catch { infoBlankCostEntries = 0; }
      }
      // V19: responde SEMPRE (mesmo com total=0), com nota informativa
      const total = finalRows.reduce((s, r) => s + Number(r.amount || 0), 0);
      const BRLV17 = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const label = __taxMonths.map((m: number) => String(m).padStart(2, "0") + "/" + targetYear).join(", ");
      let resposta =
        `**Impostos de ${label}: R$ ${BRLV17(total)}**\n\n` +
        `Fonte: ${fonte} (${finalRows.length} lancamento(s)).\n`;
      if (finalRows.length > 0) {
        resposta += "\nDetalhamento:\n" + finalRows.slice(0, 12).map((r: any) =>
          `  • ${String(r.month).padStart(2, "0")}/${targetYear} - ${r.description || "(sem descricao)"}: R$ ${BRLV17(Number(r.amount || 0))}`
        ).join("\n");
      }
      if (total === 0 && infoBlankCostEntries > 0) {
        resposta += `\nObservacao: existem ${infoBlankCostEntries} cadastro(s) em finance_cost_entries com cost_type=impostos mas com monthly_amount=0,00. Preencha o valor mensal para que o calculo apareca nas consultas.`;
      }
      if (total === 0 && infoBlankCostEntries === 0 && finalRows.length === 0) {
        resposta += `\nObservacao: nao ha lancamentos confirmados em finance_cash_flow_entries, finance_cost_entries ou finance_dre_manual_entries para o periodo. Para popular os dados, importe os valores mensais em qualquer um desses modulos.`;
      }

        await logFinanceAiEvent({
          user_email: guard.user.email, user_id: guard.user.id,
          action: "chat_v17_impostos_early_return",
          period_ref: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
          prompt, response: resposta,
        });
        return NextResponse.json({ resposta, modulos_ativos: agentes, context: contextoResumidoExt });
    } catch (e: any) {
      console.log("[V17 early-return impostos] erro:", String(e?.message || e).slice(0, 160));
      // cai no fluxo OpenAI normal ou fallback
    }
  }
  // === CHAT-V17-FIM ===

  if (!apiKey) {
    const fb = await formatarFallback({
      ctx, prompt, agentes, askPeriod, cashflowAsked, dreAsked,
      extras: { dre_manual_year: dreManualYear, loans_future: loansFuture, planning_year: planningYear, future_proj: futureProj },
    });
    const frag = await fragmentarPorCategoria(ctx, prompt, targetYear, targetMonth);
    const finalFrag = __supV ? "" : frag;
    return NextResponse.json({ resposta: fb + finalFrag, modulos_ativos: agentes, context: contextoResumidoExt, fallback: true });
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
    // V19: sempre concatena fragmentarPorCategoria() - a funcao em si
    // retorna "" se nao houver categoria detectada, entao nao polui
    // respostas meta. Mantem __noFrag como unica excepcao explicita.
    if (!(ctx as any)?.__noFrag) {
      respostaFinal = respostaFinal + await fragmentarPorCategoria(ctx, prompt, targetYear, targetMonth);
    }
    await logFinanceAiEvent({ user_email: guard.user.email, user_id: guard.user.id, action: "chat_v8_7", period_ref: `${year}-${String(month).padStart(2,"0")}`, prompt, response: `[modulos: ${agentes.join(",")}] ${respostaFinal}` });
return NextResponse.json({ resposta: respostaFinal, modulos_ativos: agentes, context: contextoResumido });
  } catch (e: any) {
    await logFinanceAiEvent({ user_email: guard.user.email, user_id: guard.user.id, action: "chat_v8_erro", period_ref: `${year}-${String(month).padStart(2,"0")}`, prompt, response: `erro: ${e.message?.slice(0,150)||"?"}` });
    return NextResponse.json({ error: "openai_falhou", detalhe: e?.message || String(e) }, { status: 502 });
  }
}

// === CHAT-V16-HELPER-IMPOSTOS-COST-ENTRIES-MONTHLY-AMOUNT ===
// finance_cost_entries NAO tem year / month / amount — usa monthly_amount (custo recorrente).
// Para um range de N meses, total = monthly_amount * N.
async function carregarImpostosCostEntriesPorRange(year: number, meses: number[], supabaseAdmin: any): Promise<any[]> {
  if (!supabaseAdmin || !meses?.length) return [];
  const out: any[] = [];
  try {
    const lookup = await supabaseAdmin.from("finance_cost_entries")
      .select("cost_type,category,description,monthly_amount,status")
      .eq("status", "ativo")
      .then((x: any) => x?.data || []);
    for (const r of (lookup || [])) {
      const ct = String(r.cost_type || "").toLowerCase().trim();
      const desc = String(r.description || "").toLowerCase();
      const match =
        ct === "impostos" || ct === "imposto" || ct === "tax" || ct === "tributo" || ct === "tributos" ||
        /imposto|simples|das|iss|icms|irpj|csll|pis|cofins|tributo/i.test(ct + " " + desc);
      if (!match) continue;
      const monthly = Number(r.monthly_amount || 0);
      if (!monthly) continue;
      // 1 linha por mês do range -> repetimos o mesmo monthly_amount
      for (const m of meses) {
        out.push({
          year, month: m, type: "despesa",
          category: String(r.category || r.cost_type || "impostos"),
          description: r.description || ct,
          amount: monthly,
          _source_table: "finance_cost_entries",
        });
      }
    }
  } catch (e) {
    console.log("[V16 carregarImpostosCostEntries] erro:", String((e as any)?.message || e).slice(0,160));
  }
  return out;
}

async function formatarFallback({ ctx, prompt, agentes, askPeriod, cashflowAsked, dreAsked, extras }: {
  ctx: any; prompt: string; agentes: string[]; askPeriod: { year: number; month: number };
  cashflowAsked: any; dreAsked: any; extras: any;
}): Promise<string> {
  const BRL = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const L: string[] = [];
  const now = ctx.now || {};
  const isAsked = !!cashflowAsked;
  const periodLabel = isAsked ? cashflowAsked.period : `${now.periodo || (askPeriod.year + "-" + String(askPeriod.month).padStart(2,"0"))}`;

  const catReceita = detectarCategoriaReceita(prompt);
  if (catReceita) {
    if (isAsked) {
      const filtered = (cashflowAsked.raw || []).filter((r: any) =>
        String(r.type || "").toLowerCase() === "receita" &&
        String(r.category || "").toLowerCase() === catReceita
      );
      const total = filtered.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      L.push(`\n**${RECEITA_LABELS[catReceita] || catReceita} em ${periodLabel}: R$ ${BRL(total)}**`);
      L.push(`Fonte: finance_cash_flow_entries (${filtered.length} lancamento(s) com type='receita', category='${catReceita}').`);
      if (filtered.length) {
        L.push(`Itens:`);
        for (const f of filtered.slice(0, 8)) {
          L.push(`  • ${f.description || "(sem descricao)"}: R$ ${BRL(Number(f.amount || 0))}`);
        }
        if (filtered.length > 8) L.push(`  • (+${filtered.length - 8} outros)`);
      } else {
        L.push(`(sem lancamentos de '${catReceita}' em ${periodLabel})`);
      }
    } else {
      const c = now.cashflow || {};
      const tot = Number((c.by_category && c.by_category[catReceita]) || 0);
      L.push(`\n**${RECEITA_LABELS[catReceita] || catReceita} em ${periodLabel}: R$ ${BRL(tot)}**`);
      L.push(`Fonte: cashflow agregado do mes base (${periodLabel}).`);
    }
    L.push("");
  }

  // === CHAT-V9.2-EARLY-DRE ===
  try {
    if ((ctx as any).__dreAnual && ehPerguntaDreAnual(prompt)) {
      // === CHAT-V9.5-EARLY-RETURN ===
  (ctx as any).__noFrag = true;
      return formatarDreMarkdown(ehPerguntaDreAnual(prompt)!.year, (ctx as any).__dreAnual);
    }
  } catch (e: any) { /* cai no fluxo natural */ }

// === CHAT-V9.3-EARLY-METAS ===
  try {
    const __m = ehPerguntaMetasAnual(prompt);
    if (__m && (ctx as any).__metasRecorrentes !== undefined) {
      (ctx as any).__noFrag = true;
      return formatarMetasMarkdown(__m.year, (ctx as any).__metasRecorrentes);
    }
  } catch (e: any) { /* fluxo natural */ }

// === CHAT-V8.9-EARLY-RETURN ===
  // Se a pergunta for pontual (catReceita / focusOnly / impostos) e ja
  // populamos o bloco acima, retorna IMEDIATAMENTE sem despejar
  // [FALLBACK], [DRE DO MES INTERROGADO], [PAINEL DO PERIODO BASE] e
  // projecoes futuras. Resposta OBJETIVA.
  try {
    const __pfxR = focusOnly(prompt);
    const __impR = ehImpostos(prompt);
    const __catR = detectarCategoriaReceita(prompt);
    if (__catR) {
      return L.join("\n").trim() + "\n";
    }
    if (__pfxR && !__impR && !__catR) {
      return L.concat([
        `Mes interrogado: ${periodLabel}.`,
        `Pergunta pontual sem categoria-receita especifica.`,
        `Para detalhamento, ver cashflow_asked_month.raw (${(cashflowAsked?.raw || []).length} lancamentos) e dre_asked_month.items (${(dreAsked?.items || []).length} entradas).`,
      ]).join("\n").trim() + "\n";
    }
    if (__impR && !__catR) {
      // V10: detecta range no prompt (ex.: "janeiro a agosto") e agrega por mes
      const MESES_MAP: Array<[number, string]> = [
        [1, "janeiro|jan"], [2, "fevereiro|fev"], [3, "mar[cç]o|mar"], [4, "abril|abr"],
        [5, "maio|mai"], [6, "junho|jun"], [7, "julho|jul"], [8, "agosto|ago"],
        [9, "setembro|set"], [10, "outubro|out"], [11, "novembro|nov"], [12, "dezembro|dez"],
      ];
      const __pl = String(prompt || "").toLowerCase();
      const __msM = MESES_MAP.filter(([_, re]) => new RegExp(re, "i").test(__pl)).map(([m]) => m);
      const __isAno = /(ano|anual|todos\s+os\s+meses|inteiro)/i.test(__pl);
      // === CHAT-V16-FALLBACK-COST-ENTRIES-MONTHLY-AMOUNT ===
      // 1a fonte: cashflowAsked (finance_cash_flow_entries) -- mais comum ter dados preenchidos
      const __rowsFromCashflow = (cashflowAsked?.raw || []).filter((r: any) =>
        String(r.type || "").toLowerCase() === "despesa" &&
        /imposto|simples|das|iss|icms|irpj|csll|pis|cofins|tributo/i.test(String(r.category || "") + " " + String(r.description || ""))
      );
      // 2a fonte: se vazio, busca em finance_cost_entries (monthly_amount * meses)
      let __rowsFromCosts: any[] = [];
      if (__rowsFromCashflow.length === 0) {
        const __mesesParaFallback: number[] = (__msM.length >= 2 || __isAno)
          ? (__isAno ? Array.from({ length: 12 }, (_, i) => i + 1) : __msM)
          : [askPeriod.month];
        __rowsFromCosts = await carregarImpostosCostEntriesPorRange(askPeriod.year, __mesesParaFallback, supabaseAdmin);
      }
      const __rowsAll = __rowsFromCashflow.length ? __rowsFromCashflow : __rowsFromCosts;
      let __rows: any[], __titulo: string;
      if (__msM.length >= 2 || __isAno) {
        const usar: number[] = __isAno ? Array.from({ length: 12 }, (_, i) => i + 1) : __msM;
        __rows = __rowsAll.filter((r: any) => usar.includes(Number(r.month)));
        const total = __rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        const label = __isAno ? ("ano de " + askPeriod.year) : usar.map((m: number) => String(m).padStart(2, "0") + "/" + askPeriod.year).join(", ");
        __titulo = "**Impostos de " + label + ": R$ " + BRL(total) + "**";
      } else {
        __rows = __rowsAll.filter((r: any) => Number(r.month) === askPeriod.month && Number(r.year || askPeriod.year) === askPeriod.year);
        const total = __rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        __titulo = "**Impostos em " + periodLabel + ": R$ " + BRL(total) + "**";
      }
      return L.concat([
        "\n" + __titulo,
        "Fonte: " + (__rows.length > 0 && __rows[0]?._source_table === 'finance_cost_entries' ? 'finance_cost_entries (monthly_amount * meses)' : 'finance_cash_flow_entries') + " (" + __rows.length + " lancamentos com type='despesa').",
        ...(__rows.slice(0, 12).map((r: any) =>
          "  • " + String(r.month).padStart(2, "0") + "/" + askPeriod.year + " - " + (r.description || "(sem descricao)") + ": R$ " + BRL(Number(r.amount || 0))
        )),
      ]).join("\n").trim() + "\n";
    }
  } catch { /* fluxo verboso abaixo */ }


  L.push(`[FALLBACK] OPENAI indisponivel — resposta direta do banco.`);
  L.push(`Periodo base (body): ${now.label || (askPeriod.year + "-" + String(askPeriod.month).padStart(2,"0"))}`);
  if (isAsked) L.push(`Mes interrogado: **${periodLabel}** (janela atual: ${cashflowAsked.janela_atual_body}).`);
  L.push(`Modulos ativos: ${agentes.join(", ")}.`);
  L.push(`Prompt: "${prompt}"`);
  L.push("");

  if (isAsked && cashflowAsked.data && Object.keys(cashflowAsked.data).length) {
    L.push(`[DRE DO MES INTERROGADO — ${periodLabel}]`);
    let receita_bruta = 0, despesas = 0;
    for (const k of Object.keys(cashflowAsked.data)) {
      const it = cashflowAsked.data[k];
      if (it.type === "receita") receita_bruta += Number(it.total || 0);
      if (it.type === "despesa")  despesas    += Number(it.total || 0);
    }
    L.push(`  Receita bruta do mes: R$ ${BRL(receita_bruta)}`);
    L.push(`  Despesas do mes:       R$ ${BRL(despesas)}`);
    L.push(`  Saldo do mes:          R$ ${BRL(receita_bruta - despesas)}`);
    L.push(`  Detalhamento type/category:`);
    Object.keys(cashflowAsked.data).sort().forEach(k => {
      const it = cashflowAsked.data[k];
      L.push(`    ${k.padEnd(35)} R$ ${BRL(it.total)}  (${it.count}x | ${it.manual} manual | ${it.auto} auto)`);
    });
    L.push("");
  }
  const dreItems = dreAsked?.items || [];
  if (dreItems.length) {
    L.push(`[DRE MANUAL do MES INTERROGADO — ${periodLabel}]`);
    for (const it of dreItems) {
      const sign = String(it.operator || "add").toLowerCase() === "subtract" ? "-" : "+";
      L.push(`  ${sign} ${it.section}/${it.line_key} R$ ${BRL(it.amount)} — ${it.description || ""}`);
    }
    L.push("");
  }

  L.push(`[PAINEL DO PERIODO BASE — ${now.label || ""}]`);
  if (agentes.includes("dre")) {
    const d = now.dre;
    if (d) L.push(`DRE: receita_bruta R$ ${BRL(d.receita_bruta)} | impostos R$ ${BRL(d.impostos)} | lucro_bruto R$ ${BRL(d.lucro_bruto)} | EBIT R$ ${BRL(d.ebit)} | lucro_liquido R$ ${BRL(d.lucro_liquido)}.`);
  }
  if (agentes.includes("fluxo_caixa")) {
    const c = now.cashflow;
    if (c) L.push(`Fluxo caixa: saldo R$ ${BRL(c.saldo)} | receitas R$ ${BRL(c.receita)} | despesas R$ ${BRL(c.despesa)} (manual R$ ${BRL(c.despesa_manual)} | auto R$ ${BRL(c.despesa_auto)}).`);
  }
  if (agentes.includes("custos")) {
    const c = now.costs || {};
    L.push(`Custos: total R$ ${BRL(c.total_mensal_estimado)} (fixos R$ ${BRL(c.fixos)} | variaveis R$ ${BRL(c.variaveis)}).`);
  }
  if (agentes.includes("planejamento")) L.push(`Planejamento: meta R$ ${BRL(now.planning?.meta_total)} | realizado R$ ${BRL(now.planning?.realizado_total)} | gap R$ ${BRL(now.planning?.gap)}.`);
  if (agentes.includes("emprestimos")) L.push(`Emprestimos: ${now.loans?.ativos} ativos | parcela R$ ${BRL(now.loans?.parcela_mes)} | saldo R$ ${BRL(now.loans?.saldo_devedor_total)}.`);

  const dm = extras?.dre_manual_year || [];
  const lf = extras?.loans_future    || [];
  const py = extras?.planning_year   || [];
  const fp = extras?.future_proj     || [];
  if (dm.length) L.push(`DRE manual do ANO (${Array.from(new Set(dm.map((x:any)=>x.section))).join(", ")}): ${dm.length} entradas.`);
  if (lf.length) L.push(`Emprestimos a pagar (futuras): ${lf.length} parcelas a partir de ${now?.label || ""}.`);
  if (py.length) L.push(`Planejamento anual: ${py.length} meses com meta/realizado.`);
  if (fp.length) for (const f of fp) L.push(`Projecao futura ${f.projection_year}: receita R$ ${BRL(f.revenue_amount)}/ano | lucro liquido R$ ${BRL(f.net_profit_amount)}/ano | custo fixo mensal R$ ${BRL(f.monthly_fixed_cost)} | colaboradores ${f.employee_count ?? "-"}.`);

  return L.join("\n");
}

// === CHAT-V8.8-COMPUTE-DRE-LOCAL-FIM ===
// === CHAT-V9.5-SEM-FRAG-FIM ===
// === CHAT-V8.9-FIM -- FOCO-RAPIDO/FALLBACK-OBJETIVO ===
// === CHAT-V9.2-DRE-ANUAL-FIM ===
// === CHAT-V9.3-METAS-FIM ===
// === CHAT-V11-RESOLVE-CONFLITS-FIM ===
