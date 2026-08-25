import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  projecaoCaixa, simularCenario, anomalia, mean, dscr,
  supabaseAdmin,
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Insight = { modulo:string; titulo:string; severidade:"baixa"|"media"|"alta"; detalhe:string };
type Sug     = { modulo:string; acao:string; impacto:string };
type Cen     = { nome:string; receita:number; custos:number; lucro:number; delta_vs_atual_pct:number };

const BRL = (n: number, frac=2) =>
  Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: frac, maximumFractionDigits: frac });
const PCT = (n: number|null, frac=1) => n == null ? "—" : `${Number(n).toFixed(frac)}%`;
const sev = (txt: string): "baixa"|"media"|"alta" => {
  const t = txt.toLowerCase();
  if (/(negativ|crit|alta|mais de |deficit|risco)/.test(t)) return "alta";
  if (/(abaixo|atencao|media)/.test(t)) return "media";
  return "baixa";
};


/* ============================================================
   deriveDreFromCashflow - robusto por REGEX.
   Quando os lançamentos manuais de DRE estão esparsos (1-2 linhas/mes),
   recompõe Receita, CMV, Despesas a partir do cashflow por categoria.
   Manual > Cashflow quando manual > 0.
   ============================================================ */
function deriveDreFromCashflow(cf: any, manualDre: any): any {
  const catMap: Record<string, {receita: number; despesa: number}> = (cf?.por_category ?? {}) as any;
  const entries: [string, number, number][] = Object.entries(catMap).map(([k, v]: any) => [
    String(k ?? "").toLowerCase(),
    Number(v?.receita ?? 0),
    Number(v?.despesa ?? 0)
  ]);
  const sumBy = (rx: RegExp, kind: "receita" | "despesa"): number =>
    entries.reduce((s, [k, r, d]) => rx.test(k) ? s + (kind === "receita" ? r : d) : s, 0);

  const cfReceitaOp  = sumBy(/venda|fatur|cliente|adiant|receita_op/, "receita");
  const cfReceitaFin = sumBy(/financ|rendiment|aplic|invest|juro|resgate/, "receita");
  const cfCmv        = sumBy(/custo|cmv|cpv|insumo|material|mercadoria/, "despesa");
  const cfDespesaOp  = sumBy(/despesa[_ ]?(oper|pesso|comerc|market|admin|infra|vend)/, "despesa");
  const cfDespesaFin = sumBy(/despesa[_ ]?(financ|juros)|iof|tarifa/, "despesa");
  const cfTributos   = sumBy(/tribut|impost|irpj|csll|pis|cofins|iss|icms/, "despesa");

  const manualReceita = Math.max(
    Number(manualDre?.receitas ?? 0),
    Number(manualDre?.receita_bruta ?? 0),
    Number(manualDre?.receita_operacional ?? 0)
  );
  const manualDespOp = Math.max(
    Number(manualDre?.despesas_operacionais ?? 0),
    Number(manualDre?.despesa_op ?? 0)
  );
  const manualDespFin = Math.max(
    Number(manualDre?.despesas_financeiras ?? 0),
    Number(manualDre?.despesa_fin ?? 0)
  );
  const manualTributos = Math.max(
    Number(manualDre?.tributos ?? 0),
    Number(manualDre?.outros_tributos ?? 0),
    Number(manualDre?.irpj_csll ?? 0)
  );
  const manualDepreciacao = Number(manualDre?.depreciacao_amortizacao ?? 0);

  const receitaLiquida = cfReceitaOp + cfReceitaFin + manualReceita;
  const cmv = cfCmv;
  const despesasOp = cfDespesaOp + manualDespOp;
  const despesasFin = cfDespesaFin + manualDespFin;
  const tributos = cfTributos + manualTributos;
  const depreciacao = manualDepreciacao;

  const lucroBruto = receitaLiquida - cmv;
  const ebit = lucroBruto - despesasOp;
  const ebitda = ebit + depreciacao;
  const lucroAntesIr = ebitda - despesasFin;
  const lucroLiquido = lucroAntesIr - tributos;
  const pct = (v: number) => receitaLiquida > 0 ? (v / receitaLiquida) * 100 : null;

  return {
    receita_bruta: receitaLiquida,
    receita_liquida: receitaLiquida,
    receita_operacional: cfReceitaOp,
    receita_financeira: cfReceitaFin + manualReceita,
    cmv,
    lucro_bruto: lucroBruto,
    despesas_operacionais: despesasOp,
    despesas_pessoal: Number(manualDre?.despesas_pessoal ?? 0),
    despesas_administrativas: Number(manualDre?.despesas_administrativas ?? 0),
    despesas_vendas: Number(manualDre?.despesas_vendas ?? 0),
    despesas_marketing: Number(manualDre?.despesas_marketing ?? 0),
    despesas_infraestrutura: Number(manualDre?.despesas_infraestrutura ?? 0),
    ebit,
    ebitda,
    depreciacao_amortizacao: depreciacao,
    despesas_financeiras: despesasFin,
    irpj_csll: 0,
    outros_tributos: manualTributos,
    tributos,
    lucro_antes_ir: lucroAntesIr,
    lucro_liquido: lucroLiquido,
    margem_bruta_val: lucroBruto,
    margem_bruta_pct: pct(lucroBruto),
    margem_ebitda_val: ebitda,
    margem_ebitda_pct: pct(ebitda),
    margem_liquida_val: lucroLiquido,
    margem_liquida_pct: pct(lucroLiquido),
    receitas: receitaLiquida,
    receita_operacional_alias: receitaLiquida,
    custo_operacional: cmv,
    custo_total: cmv,
    despesa_op: despesasOp,
    despesa_fin: despesasFin,
    receita: receitaLiquida,
  };
}


export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const year  = Number(body?.year ?? new Date().getFullYear());
  const month = Number(body?.month ?? new Date().getMonth() + 1);
  const ctx = await loadFinanceContextFull(year, month);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: 500 });

  const now  = ctx.now;

  // === OVERRIDE: DRE derivada do Cash Flow (8 receita_financeira_manual anual é insuficiente) ===
  (ctx.now as any).dre = deriveDreFromCashflow(
    (ctx.now as any).cashflow,
    (ctx.now as any).dre
  ) as any;

  // IA: somar parcelas loans (dtect coluna automatica) + variaveis auto-rateados
  if (supabaseAdmin && (ctx.now as any)?.cashflow) {
    try {
      const LOANS_T = process.env.FINANCE_AI_LOANS_TABLE || 'finance_loan_contracts';
      const COSTS_T = process.env.FINANCE_AI_COSTS_TABLE || 'finance_cost_entries';
      const cf: any = (ctx.now as any).cashflow;

      // ===== EMPRESTIMOS =====
      const { data: loans } = await supabaseAdmin.from(LOANS_T).select('*');
      const isAtivo = (l: any) => {
        const s = String(l.status ?? '').toLowerCase().trim();
        if (!s) return true;
        if (/inativ|cancel|encerr|final|expir|quited|pago/.test(s)) return false;
        return /ativ|atv|active|em_curso|andamento|corrente|vigente|vig/.test(s);
      };
      const activeLoans = (loans ?? []).filter((l: any) => l.active !== false && isAtivo(l));

      // Detectar dinamicamente qual coluna tem a parcela mensal
      const parcelaCols = ['installment_amount','parcela_mes','monthly_payment','parcela','monthly_amount','installment_value','valor_parcela','parcela_mensal','valor'];
      let parcelaCol: string | null = null;
      let parcelaTest = 0;
      for (const c of parcelaCols) {
        const testSum = activeLoans.reduce((s, l) => s + (Number(l?.[c]) || 0), 0);
        if (testSum > 0 && testSum > parcelaTest) { parcelaTest = testSum; parcelaCol = c; }
      }
      const emprestimosMes = parcelaCol
        ? activeLoans.reduce((s, l) => s + Number(l?.[parcelaCol as string] ?? 0), 0)
        : 0;

      // ===== CUSTOS VARIAVEIS AUTO =====
      const { data: costs } = await supabaseAdmin.from(COSTS_T).select('*');
      const variaveisAuto = ((costs ?? []).filter((c: any) =>
        String(c.category ?? '').toLowerCase().match(/vari/))
        .reduce((s: number, c: any) => {
          const mAmt = Number(c.monthly_amount ?? 0);
          if (mAmt > 0) return s + mAmt;
          return s + (Number(cf.receita ?? 0) * Number(c.percentage_rate ?? 0)) / 100;
        }, 0));

      // ===== ATUALIZAR CASHFLOW =====
      cf.emprestimos_auto      = Number(emprestimosMes.toFixed(2));
      cf.parcela_col_usada     = String(parcelaCol ?? 'nenhum');
      cf.custos_variaveis_auto = Number(variaveisAuto.toFixed(2));
      cf.despesa_auto          = Number((Number(cf.despesa_auto ?? 0) + emprestimosMes + variaveisAuto).toFixed(2));
      cf.despesa               = Number((Number(cf.despesa ?? 0) + emprestimosMes + variaveisAuto).toFixed(2));
      cf.saldo                 = Number((Number(cf.receita ?? 0) - cf.despesa).toFixed(2));

      if (emprestimosMes === 0) {
        console.warn('[IA-DEBUGLOAN] emprestimos=0 | loans ativos=' + activeLoans.length + ' | total loans=' + (loans ?? []).length + ' | colunas=' + Object.keys((loans ?? [])[0] ?? {}).join(','));
      }
    } catch (e) { console.warn('[IA-DEBUGLOAN] erro:', (e as any)?.message); }
  }

  
  // === ENRIQUECIMENTO DRE V2 — formula do modulo DRE (regime 16%) ===
  try {
    const cf: any = (ctx.now as any).cashflow;
    const dre: any = (ctx.now as any).dre || {};
    const yr = year, mo = month;

    // Receita Bruta = APENAS vendas (cf.receita), NAO soma recFin (bate com a tabela)
    const receitaBrutaVendas = Number(cf.receita ?? 0);

    // Impostos = 16% sobre Receita Bruta (regime presumido, conforme tabela)
    const impostosCalculados = +(receitaBrutaVendas * 0.16).toFixed(2);
    const receitaLiquida = +(receitaBrutaVendas - impostosCalculados).toFixed(2);

    const cmv = Number(dre.cmv ?? dre.custo_operacional ?? 0);
    const lucroBruto = +(receitaLiquida - cmv).toFixed(2);

    const despOp = Number(
      (dre.despesas_administrativas ?? 0) + (dre.despesas_pessoal ?? 0) +
      (dre.despesas_vendas ?? 0) + (dre.despesas_marketing ?? 0) +
      (dre.despesas_infraestrutura ?? 0)
    );

    // RecFin = soma do DRE manual onde section/key indica receita financeira
    let recFinManual = 0;
    if (supabaseAdmin) try {
      const { data: dreMan } = await supabaseAdmin
        .from("finance_dre_manual_entries").select("*").eq("year", yr).eq("month", mo);
      for (const r of (dreMan ?? [])) {
        const sec = String(r.section ?? "").toLowerCase();
        const key = String(r.line_key ?? "").toLowerCase();
        const sob = String(r.operator ?? "add").toLowerCase();
        const isReceita = sec.includes("receita") || sec.includes("financ") || key.includes("financ") || key.includes("rendiment");
        const isAdd = !sob.includes("sub");
        if (isReceita && isAdd) recFinManual += Number(r.amount ?? 0);
      }
    } catch (e) {}
    const recFinAuto = 0; // diag: nenhuma tabela automatica existe

    const despFinParcelas = Number(cf.emprestimos_auto ?? 0);
    const depreciacao = Number(dre.depreciacao ?? dre.depreciacao_amortizacao ?? 0);

    // LAJIR / EBIT
    const ebit = +(lucroBruto - despOp - despFinParcelas + recFinManual + recFinAuto - depreciacao).toFixed(2);
    const ebitda = +(ebit + depreciacao).toFixed(2);
    const irpj = Number(dre.irpj_csll ?? 0);
    const lucroLiquido = +(ebit - irpj).toFixed(2);
    const margem = receitaBrutaVendas > 0 ? +((lucroLiquido / receitaBrutaVendas) * 100).toFixed(2) : 0;

    now.dre = {
      ...dre,
      receita_bruta: receitaBrutaVendas,
      receita_bruta_total: receitaBrutaVendas,
      receita_financeira_manual: recFinManual,
      receita_financeira_auto: recFinAuto,
      receita_financeira: recFinManual + recFinAuto,
      impostos: impostosCalculados,
      aliquota_impostos_pct: 16,
      receita_liquida: receitaLiquida,
      cmv: cmv,
      lucro_bruto: lucroBruto,
      despesas_operacionais: despOp,
      despesas_financeiras: despFinParcelas,
      despesas_financeiras_auto: despFinParcelas,
      despesas_financeiras_manual: Number(dre.despesas_financeiras ?? 0),
      depreciacao: depreciacao,
      ebit: ebit,
      lajir: ebit,
      ebitda: ebitda,
      irpj_csll: irpj,
      lucro_liquido: lucroLiquido,
      margem_liquida_percent: margem,
      _formula: "Receita Bruta=cf.receita(vendas); impostos 16% presumido; RecFin=manual dre; DespFin=parcelas loans; margem%/Receita Bruta"
    };

    console.log("[IA-DRE-V2]", JSON.stringify({
      yr, mo,
      rec_bruta_vendas: receitaBrutaVendas,
      impostos: impostosCalculados,
      receita_liquida: receitaLiquida,
      cmv, lucro_bruto: lucroBruto,
      desp_op: despOp,
      desp_fin_parcelas: despFinParcelas,
      rec_fin_manual: recFinManual, rec_fin_auto: recFinAuto,
      depreciacao, ebit, ebitda,
      irpj, lucro_liquido: lucroLiquido,
      margem_pct: margem
    }));
  } catch (e) { console.warn("[IA-DRE-V2] erro:", (e as any)?.message); }

  const insights: Insight[] = [];
  const suggestions: Sug[]  = [];

  // ===== FLUXO DE CAIXA =====
  insights.push({
    modulo: "fluxo_caixa",
    titulo: now.cashflow.saldo >= 0 ? "Saldo do mes positivo" : "Saldo do mes negativo",
    severidade: sev(now.cashflow.saldo < 0 ? "negativo" : "positivo"),
    detalhe:
      `Saldo ${now.label}: R$ ${BRL(now.cashflow.saldo)} ` +
      `| Entradas R$ ${BRL(now.cashflow.receita)} (manual R$ ${BRL(now.cashflow.receita_manual)} / auto R$ ${BRL(now.cashflow.receita_auto)}) ` +
      `| Saidas R$ ${BRL(now.cashflow.despesa)} (manual R$ ${BRL(now.cashflow.despesa_manual)} / auto R$ ${BRL(now.cashflow.despesa_auto)})`,
  });

  // ===== DRE =====
  if (now.dre.receita_bruta > 0) {
    const totalDespOp = now.dre.despesas_administrativas + now.dre.despesas_pessoal +
                        now.dre.despesas_vendas + now.dre.despesas_marketing +
                        now.dre.despesas_infraestrutura;
    insights.push({
      modulo: "dre",
      titulo: "Resultado DRE (mes corrente)",
      severidade: (now.dre.margem_liquida_percent ?? 0) < 10 ? "media" : "baixa",
      detalhe:
        `Receita Liquida R$ ${BRL(now.dre.receita_liquida)} ` +
        `| CMV R$ ${BRL(now.dre.cmv)} ` +
        `| Lucro Bruto R$ ${BRL(now.dre.lucro_bruto)} ` +
        `| Desp. Operacionais R$ ${BRL(totalDespOp)} ` +
        `| Desp. Financeiras R$ ${BRL(now.dre.despesas_financeiras)} ` +
        `| EBIT R$ ${BRL(now.dre.ebit)} ` +
        `| EBITDA R$ ${BRL(now.dre.ebitda)} ` +
        `| IRPJ/CSLL R$ ${BRL(now.dre.irpj_csll)} ` +
        `| Lucro Liquido R$ ${BRL(now.dre.lucro_liquido)} ` +
        `(Margem ${PCT(now.dre.margem_liquida_percent)})`,
    });
  } else {
    insights.push({
      modulo: "dre",
      titulo: "DRE sem receita cadastrada para o mes",
      severidade: "media",
      detalhe: `Apenas IRPJ/CSLL R$ ${BRL(now.dre.irpj_csll)} e Despesas Financeiras R$ ${BRL(now.dre.despesas_financeiras)} identificados. Cadastre receita/CMV/despesas em /api/finance/dre/manual.`,
    });
  }

  // ===== CUSTOS =====
  insights.push({
    modulo: "custos",
    titulo: "Custos fixos e variaveis",
    severidade: now.costs.variaveis === 0 && now.costs.fixos > 0 ? "media" : "baixa",
    detalhe:
      `${now.costs.count} contratos cadastrados ` +
      `| Fixos R$ ${BRL(now.costs.fixos)} ` +
      `| Variaveis R$ ${BRL(now.costs.variaveis)} (estimado por receita) ` +
      `| Total mensal R$ ${BRL(now.costs.total_mensal_estimado)}` +
      (now.costs.estimated_revenue_usado > 0 ? ` | Base receita R$ ${BRL(now.costs.estimated_revenue_usado)}` : ""),
  });
  if (now.costs.variaveis === 0 && now.costs.fixos > 0) {
    suggestions.push({
      modulo: "custos",
      acao: "Cadastrar custos variaveis (comissoes, energia por uso) com category=variavel e percentage_rate.",
      impacto: "Permite analise ABC dos custos sensiveis ao volume vendido.",
    });
  }

  // ===== PLANEJAMENTO =====
  if (now.planning.meta_total > 0) {
    const tip = now.planning.atingimento_pct ?? 0;
    const porTipoList = Object.entries(now.planning.por_tipo)
      .map(([k,v]) => `${k}: meta R$ ${BRL(v.meta)} / realizado R$ ${BRL(v.realizado)} (${v.atingimento_pct != null ? v.atingimento_pct.toFixed(1)+"%" : "—"})`)
      .join(" | ");
    insights.push({
      modulo: "planejamento",
      titulo: tip >= 90 ? "Meta proxima/atingida" : tip >= 50 ? "Atingimento parcial" : "Atingimento baixo",
      severidade: tip >= 90 ? "baixa" : tip >= 50 ? "media" : "alta",
      detalhe: `Meta R$ ${BRL(now.planning.meta_total)} | Realizado R$ ${BRL(now.planning.realizado_total)} | Atingimento ${PCT(tip)} | ${porTipoList}`,
    });
    if (now.planning.gap > 0) {
      suggestions.push({
        modulo: "planejamento",
        acao: `Fechar gap de R$ ${BRL(now.planning.gap)} focando em Contrato Avulso + renegociacao de inadimplencia.`,
        impacto: `Potencial de +${((now.planning.gap / Math.max(now.planning.meta_total,1)) * 100).toFixed(1)}% no atingimento da meta mensal.`,
      });
    }
  } else {
    insights.push({
      modulo: "planejamento",
      titulo: "Metas mensais nao cadastradas para este mes",
      severidade: "media",
      detalhe: "Cadastre em /api/finance/planejamento/meta com goal_type em {Contrato Recorrente, Contrato Avulso}.",
    });
  }

  // ===== EMPRESTIMOS =====
  if (now.loans.count > 0) {
    const cetEfetivo = now.loans.cet_efetivo_anual_pct != null ? now.loans.cet_efetivo_anual_pct.toFixed(2)+"%" : "—";
    const cetMedio   = now.loans.cet_medio_anual_pct != null   ? now.loans.cet_medio_anual_pct.toFixed(2)+"%"   : "—";
    const ds = dscr(now.cashflow.receita, now.loans.parcela_mes);
    insights.push({
      modulo: "emprestimos",
      titulo: `${now.loans.ativos} de ${now.loans.count} contrato(s) ativos`,
      severidade: ds != null && ds < 1.2 ? "alta" : "media",
      detalhe:
        `Parcela mensal R$ ${BRL(now.loans.parcela_mes)} ` +
        `| Saldo devedor R$ ${BRL(now.loans.saldo_devedor_total)} ` +
        `| CET medio ${cetMedio} / efetivo ${cetEfetivo}/ano ` +
        `| IOF+fees R$ ${BRL(now.loans.iof_total + now.loans.fees_total)} ` +
        `| ${now.loans.grace_meses_ativos} em carencia ` +
        `| DSCR ${ds ?? "—"}`,
    });
    if (now.loans.cet_medio_anual_pct != null && now.loans.cet_medio_anual_pct > 1.5) {
      suggestions.push({
        modulo: "emprestimos",
        acao: "Renegociar contratos com taxa mensal > 1,5% (1o quartil de mercado).",
        impacto: "Reduz custo financeiro recorrente e melhora o DSCR.",
      });
    }
  } else {
    insights.push({
      modulo: "emprestimos",
      titulo: "Sem emprestimos cadastrados",
      severidade: "baixa",
      detalhe: "Cadastre em /api/finance/emprestimos/contratos com campos: installment_amount, monthly_rate, annual_rate, iof, fees, grace_months, amortization_system, status.",
    });
  }

  // ===== ANOMALIAS =====
  const hist = ctx.historico_12m.map(h => h.receita || 0);
  const a = anomalia(now.cashflow.receita, hist);
  if (a && a.is_anomalia) {
    insights.push({
      modulo: "anomalias",
      titulo: "Anomalia nas entradas",
      severidade: a.desvio > 2.5 ? "alta" : "media",
      detalhe: `Receita R$ ${BRL(now.cashflow.receita)} ultrapassa limite superior R$ ${BRL(a.limite_sup)} (media R$ ${BRL(a.media)}, desvio ${a.desvio.toFixed(2)}σ)`,
    });
  }

  // ===== PROJECOES 60/90 =====
  const recHist = ctx.historico_12m.slice(-3).map(h => h.receita || 0);
  const saiHist = ctx.historico_12m.slice(-3).map(h => h.despesa || 0);
  const medEnt = mean(recHist);
  const medSai = mean(saiHist);
  const proj60 = projecaoCaixa(Number(now.cashflow.saldo), medEnt, medSai, 2);
  const proj90 = projecaoCaixa(Number(now.cashflow.saldo), medEnt, medSai, 3);
  insights.push({
    modulo: "projecoes",
    titulo: "Projecao 60/90 dias",
    severidade: (proj60.saldo_futuro < 0 || proj90.saldo_futuro < 0) ? "alta" : "baixa",
    detalhe:
      `60d: R$ ${BRL(proj60.saldo_futuro)} | 90d: R$ ${BRL(proj90.saldo_futuro)} | Base: media 3 meses (entradas R$ ${BRL(medEnt)} / saidas R$ ${BRL(medSai)})`,
  });

  // ===== CENARIOS — desconta TODOS os custos =====
    // FIX: total_mensal_estimado ja tem variaveis; cmv ja virou custos_fixos no CF
  const custosTotais = (now.costs.fixos || 0)
    + (now.dre.despesas_administrativas || 0) + (now.dre.despesas_pessoal || 0)
    + (now.dre.despesas_vendas || 0) + (now.dre.despesas_marketing || 0)
    + (now.dre.despesas_infraestrutura || 0)
    + (now.dre.despesas_financeiras || 0) + (now.dre.irpj_csll || 0);
  const receitaBase = (now.dre as any).receitas || (now.dre as any).receita_bruta || now.cashflow.receita || 0;
  const otim = simularCenario(receitaBase, custosTotais,  10, -2);
  const real = simularCenario(receitaBase, custosTotais,   2,  2);
  const pess = simularCenario(receitaBase, custosTotais, -10,  8);
  const lucroAtual = (now.dre.lucro_liquido || 0) > 0 ? now.dre.lucro_liquido : (now.cashflow.saldo || 0);
  const cenarios: Cen[] = [
    { nome:"OTIMISTA (+10%/-2%)",   receita: otim.receita, custos: otim.custos, lucro: otim.lucro, delta_vs_atual_pct: delta(otim.lucro,  lucroAtual) },
    { nome:"REALISTA (+2%/+2%)",    receita: real.receita, custos: real.custos, lucro: real.lucro, delta_vs_atual_pct: delta(real.lucro,  lucroAtual) },
    { nome:"PESSIMISTA (-10%/+8%)", receita: pess.receita, custos: pess.custos, lucro: pess.lucro, delta_vs_atual_pct: delta(pess.lucro,  lucroAtual) },
  ];

  // ===== SUGESTAO GLOBAL =====
  if (suggestions.length === 0) {
    suggestions.push({
      modulo: "geral",
      acao: "Manter rotinas atuais de controle (DRE mensal, fluxo diario, simulacao trimestral).",
      impacto: "Sustenta previsibilidade e protege DSCR.",
    });
  }

  await logFinanceAiEvent({
    user_email: guard.user.email, user_id: guard.user.id,
    action: "overview", period_ref: `${year}-${String(month).padStart(2,"0")}`,
    prompt: "overview v2.1", response: `${insights.length} insights`,
  });

  return NextResponse.json({
    periodo: { year, month, label: now.label },
    insights, suggestions, cenarios,
    bruto: {
      dre: now.dre, cashflow: now.cashflow, costs: now.costs,
      planning: now.planning, loans: now.loans,
      projecoes: { sessenta_dias: proj60, noventa_dias: proj90 },
      historico_12m: ctx.historico_12m,
    },
  });
}

function delta(v: number, base: number): number {
  if (!Number.isFinite(base) || Math.abs(base) < 1) return 0;
  return Number((((v - base) / Math.abs(base)) * 100).toFixed(1));
}
