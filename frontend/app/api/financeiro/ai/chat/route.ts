import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// === CHAT-V4-DRE-V3-AWARE ===
const SYS = `Voce e o Copiloto Financeiro da Expert Energy. Recebe o CONTEXTO FINANCEIRO do mes selecionado em JSON.

REGRAS OBRIGATORIAS (NAO INVENTE VALORES, USE SOMENTE OS CAMPOS ABAIXO):

A) DRE (estado apos V3 dcc17a2 + 623532f):
  - receita_bruta = cashflow.receita (vendas do mes)
  - receita_financeira = dre.receita_financeira_manual + dre.receita_financeira_auto + dre.receita_financeira_cf
  - receita_financeira_manual vem de finance_dre_manual_entries (section=receitas || key=*financeira*; filter active=true; operator=add)
  - despesas_financeiras = dre.despesas_financeiras_cf_emprestimo (cf.emprestimo) + dre.despesas_financeiras_loans (current_installment_amount agregado)
  - despesas_financeiras_auto vem do agregado: cf.emprestimos_auto (= soma current_installment_amount de loans ativos)
  - impostos = receita_bruta * 16% (regime presumido)  -> CAMPO: dre.impostos
  - aliquota_impostos_pct = 16  -> CAMPO: dre.aliquota_impostos_pct
  - cmv = 0  -> CAMPO: dre.cmv
  - lucro_bruto = receita_liquida - cmv
  - despesas_operacionais = dre.despesas_administrativas + despesas_pessoal + despesas_vendas + despesas_marketing + despesas_infraestrutura (derivado de finance_cost_entries.committed by cost_type)
  - despesas_operacionais_detalhe.custos_fixos / investimentos_capex / custos_variavel (subtotais por categoria CF)
  - ebit = lucro_bruto - despesas_operacionais - despesas_financeiras + receitas_financeiras - depreciacao
  - ebitda = ebit + depreciacao
  - lucro_liquido = ebit - irpj_csll
  - margem_liquida_percent = lucro_liquido / receita_bruta * 100 (denominador receita_bruta, NAO receita_liquida)

B) CASHFLOW (estado apos 623532f):
  - receita = vendas_recorrentes + vendas_vista + vendas_prazo (de finance_cash_flow_entries)
  - despesa = manual (custos_fixos) + auto (custos_variavel + parcelas loans) -> CAMPO: cashflow.despesa
  - saldo = receita - despesa
  - separa manual vs auto_generated nos campos receita_manual/receita_auto/despesa_manual/despesa_auto

C) COSTS:
  - fixos = soma de finance_cost_entries.status='ativo' . monthly_amount
  - variaveis = receita * percentage_rate / 100 (de cost_type='variavel')
  - total_mensal_estimado = fixos + variaveis

D) PLANNING (uso planejamento_meta_comercial):
  - meta_total, realizado_total, gap = meta_total - realizado_total
  - atingimento_pct = realizado_total / meta_total * 100

E) LOANS (soma current_installment_amount de loans ativos):
  - ativos = count(status='active')
  - parcela_mes = soma current_installment_amount
  - saldo_devedor_total = soma balance_outstanding
  - cet_efetivo_anual_pct = media de annual_rate + iof/fees
  - ds_cr = cobertura do servico da divida
  - 5 em carencia = count(grace_months > 0)

F) PROJECOES (60/90 dias):
  - projecoes.sessenta_dias, projecoes.noventa_dias
  - historico_12m.anual tem receita/despesa/saldo de cada mes dos ultimos 12

G) FORMATO DA RESPOSTA:
  - PT-BR, tom executivo direto, sem enrolacao
  - Valores em R$ com 2 casas decimais
  - Percentuais com 1 casa + %
  - SEMPRE indique a fonte: "Com base em dre.lucro_liquido (R$ X)..."
  - Quando comparar, destaque variacao absoluta + delta %
  - Quando sugerir, conecte a 1 indicador concreto (DSCR/CET/margem/atingimento)
  - Para projetar 90 dias use projecoes.noventa_dias
  - Para comparar meses use historico_12m[mes]
  - Se faltarem dados, diga explicitamente "Dado X nao disponivel no contexto"
`;


function montarContextoResumido(ctx: any, agentes: string[]): string {
  const now = ctx.now || {};
  const secoes: string[] = [];
  const BRL = (n: number) => Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = (n: number|null) => n == null ? "n/d" : Number(n).toFixed(1) + "%";

  if (agentes.includes("dre") || agentes.length === 5) {
    const dre = now.dre || {};
    secoes.push("DRE (mes):
" + JSON.stringify({
      receita_bruta: dre.receita_bruta,
      receita_bruta_cf_vendas: dre.receita_bruta_cf_vendas,
      receita_financeira: dre.receita_financeira,
      receita_financeira_manual: dre.receita_financeira_manual,
      receita_financeira_cf: dre.receita_financeira_cf,
      impostos: dre.impostos,
      aliquota_impostos_pct: dre.aliquota_impostos_pct,
      receita_liquida: dre.receita_liquida,
      cmv: dre.cmv,
      lucro_bruto: dre.lucro_bruto,
      despesas_administrativas: dre.despesas_administrativas,
      despesas_pessoal: dre.despesas_pessoal,
      despesas_vendas: dre.despesas_vendas,
      despesas_marketing: dre.despesas_marketing,
      despesas_infraestrutura: dre.despesas_infraestrutura,
      despesas_operacionais: dre.despesas_operacionais,
      despesas_operacionais_detalhe: dre.despesas_operacionais_detalhe,
      despesas_financeiras: dre.despesas_financeiras,
      despesas_financeiras_cf_emprestimo: dre.despesas_financeiras_cf_emprestimo,
      despesas_financeiras_loans: dre.despesas_financeiras_loans,
      receita_minus_despesas: BRL((dre.receita_bruta || 0) - ((dre.despesas_operacionais || 0) + (dre.despesas_financeiras || 0))),
      depreciacao: dre.depreciacao,
      ebit: dre.ebit,
      ebitda: dre.ebitda,
      irpj_csll: dre.irpj_csll,
      lucro_liquido: dre.lucro_liquido,
      margem_liquida_percent: dre.margem_liquida_percent,
      formula_aplicada: dre._formula_v4
    }, null, 2));
  }
  if (agentes.includes("fluxo_caixa") || agentes.length === 5) {
    const cf = now.cashflow || {};
    secoes.push("FLUXO DE CAIXA (mes):
" + JSON.stringify({
      receita: cf.receita,
      receita_manual: cf.receita_manual,
      receita_auto: cf.receita_auto,
      despesa: cf.despesa,
      despesa_manual: cf.despesa_manual,
      despesa_auto: cf.despesa_auto,
      despesa_cf_custos_fixos: cf.despesa_cf_custos_fixos,
      despesa_cf_invest_capex: cf.despesa_cf_invest_capex,
      despesa_cf_variavel: cf.despesa_cf_variavel,
      despesa_cf_emprestimo: cf.despesa_cf_emprestimo,
      emprestimos_auto_total: cf.emprestimos_auto,
      coluna_parcela_usada: cf.parcela_col_usada,
      saldo: cf.saldo
    }, null, 2));
  }
  if (agentes.includes("custos") || agentes.length === 5) {
    secoes.push("CUSTOS:
" + JSON.stringify({
      fixos: now.costs?.fixos,
      variaveis: now.costs?.variaveis,
      pct_variavel: now.costs?.variavel_pct,
      total_mensal_estimado: now.costs?.total_mensal_estimado,
      estimated_revenue_usado: now.costs?.estimated_revenue_usado,
      contratos_ativos: now.costs?.contratos_ativos,
      por_cost_type: now.costs?.por_cost_type
    }, null, 2));
  }
  if (agentes.includes("planejamento") || agentes.length === 5) {
    secoes.push("PLANEJAMENTO:
" + JSON.stringify({
      meta_total: now.planning?.meta_total,
      realizado_total: now.planning?.realizado_total,
      gap: now.planning?.gap,
      atingimento_pct: now.planning?.atingimento_pct,
      por_tipo: now.planning?.por_tipo
    }, null, 2));
  }
  if (agentes.includes("emprestimos") || agentes.length === 5) {
    secoes.push("EMPRESTIMOS:
" + JSON.stringify({
      ativos: now.loans?.ativos,
      total_contratos: now.loans?.total_contratos,
      parcela_mes: now.loans?.parcela_mes,
      saldo_devedor_total: now.loans?.saldo_devedor_total,
      cet_efetivo_anual_pct: now.loans?.cet_efetivo_anual_pct,
      cet_medio_anual_pct: now.loans?.cet_medio_anual_pct,
      taxa_media_mensal: now.loans?.taxa_media_mensal,
      iof_total: now.loans?.iof_total,
      fees_total: now.loans?.fees_total,
      grace_meses_ativos: now.loans?.grace_meses_ativos,
      ds_cr: now.loans?.ds_cr,
      contratos: now.loans?.contratos?.slice?.(0, 5)?.map((c: any) => ({
        contract_number: c.contract_number,
        lender: c.lender,
        status: c.status,
        current_installment_amount: c.current_installment_amount,
        balance_outstanding: c.balance_outstanding,
        grace_months: c.grace_months
      }))
    }, null, 2));
  }
  if (agentes.includes("projecoes") || agentes.length === 5) {
    secoes.push("PROJECOES:
" + JSON.stringify({
      sessenta_dias: ctx.projecoes?.sessenta_dias,
      noventa_dias: ctx.projecoes?.noventa_dias,
      historico_12m: ctx.historico_12m?.anual?.slice(-3)
    }, null, 2));
  }
  return secoes.join("

");
}

const agenteRegex: Array<[string, RegExp]> = [
  ["dre",          /(lucro|receita|despesa|margem|ebitda|resultado|dre|demonstra|tributo|imposto|cmv|custo)/i],
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
  const contextoJSON = montarContextoResumido(ctx, agentes);

  const apiKey = (typeof process !== "undefined" ? process.env.OPENAI_API_KEY || "" : "");
  const model  = (typeof process !== "undefined" ? process.env.OPENAI_MODEL || "gpt-4o-mini" : "gpt-4o-mini");

  if (!apiKey) {
    return NextResponse.json({ resposta: formatarFallback({ ctx, prompt, agentes }), modulos_ativos: agentes, context: ctx, fallback: true });
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.3,
        messages: [
          { role: "system", content: SYS + "\n\nCONTEXTO FINANCEIRO:\n" + contextoJSON },
          { role: "user", content: `MODULOS DETECTADOS: ${agentes.join(", ")}\n\nPERGUNTA: ${prompt}` },
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

    return NextResponse.json({ resposta, modulos_ativos: agentes, context: ctx });
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
  L.push(`Sua pergunta: "${prompt}" | Modulos: ${agentes.join(", ")} | Periodo ${now.label}.`);
  if (agentes.includes("dre")) {
    L.push(`DRE: receita_bruta R$ ${BRL(now.dre.receita_bruta)} (= vendas CF) | impostos R$ ${BRL(now.dre.impostos)} (16% presumido) | receita_liquida R$ ${BRL(now.dre.receita_liquida)} | desp_op R$ ${BRL(now.dre.despesas_operacionais)} (adm ${BRL(now.dre.despesas_administrativas)} + pes ${BRL(now.dre.despesas_pessoal)} + vendas ${BRL(now.dre.despesas_vendas)} + mkt ${BRL(now.dre.despesas_marketing)} + infra ${BRL(now.dre.despesas_infraestrutura)}) | desp_fin R$ ${BRL(now.dre.despesas_financeiras)} (loans auto) | rec.fin R$ ${BRL(now.dre.receita_financeira)} | EBIT R$ ${BRL(now.dre.ebit)} | EBITDA R$ ${BRL(now.dre.ebitda)} | Lucro liquido R$ ${BRL(now.dre.lucro_liquido)} (Margem ${PCT(now.dre.margem_liquida_percent)}).`);
  }
  if (agentes.includes("fluxo_caixa")) {
    L.push(`Fluxo de caixa: saldo R$ ${BRL(now.cashflow.saldo)} | entradas R$ ${BRL(now.cashflow.receita)} | saidas R$ ${BRL(now.cashflow.despesa)} (manual R$ ${BRL(now.cashflow.despesa_manual)} / auto R$ ${BRL(now.cashflow.despesa_auto)}).`);
  }
  if (agentes.includes("custos")) {
    L.push(`Custos: total mensal estimado R$ ${BRL(now.costs.total_mensal_estimado)} (fixos R$ ${BRL(now.costs.fixos)} | variaveis R$ ${BRL(now.costs.variaveis)}, base receita R$ ${BRL(now.costs.estimated_revenue_usado)}).`);
  }
  if (agentes.includes("planejamento")) {
    L.push(`Planejamento: meta R$ ${BRL(now.planning.meta_total)} | realizado R$ ${BRL(now.planning.realizado_total)} | gap R$ ${BRL(now.planning.gap)} | atingimento ${PCT(now.planning.atingimento_pct)}.`);
  }
  if (agentes.includes("emprestimos")) {
    L.push(`Emprestimos: ${now.loans.ativos} ativos | parcela_mes R$ ${BRL(now.loans.parcela_mes)} | saldo devedor R$ ${BRL(now.loans.saldo_devedor_total)} | CET efetivo ${PCT(now.loans.cet_efetivo_anual_pct)}/ano | ${now.loans.grace_meses_ativos} em carencia.`);
  }
  return L.join("\n");
}
