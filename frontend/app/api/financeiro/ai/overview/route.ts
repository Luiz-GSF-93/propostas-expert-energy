
  // === FIX-V4-CONSOME-FLUXO-CAIXA ===
  try {
    const cf: any = (ctx.now as any).cashflow || {};
    const dre: any = (ctx.now as any).dre || {};
    const yr = year, mo = month;
    const NUM = (v: any) => Number(v ?? 0);
    const log = (...x: any[]) => console.log("[IA-DRE-V4]", JSON.stringify(x.length===1?x[0]:x));

    // (1) BUSCA LANÇAMENTOS DETALHADOS DO FLUXO DE CAIXA DO MÊS
    //    (categoria tipo: custos_fixos, investimentos_capex, custos_variavel, emprestimo, vendas_recorrentes, vendas_vista/prazo, receitas_financeiras)
    let cfCustosFixos = 0, cfInvestCapex = 0, cfCustosVariavel = 0, cfEmprestimo = 0;
    let cfReceita = 0, cfReceitasFinanceiras = 0;
    let cfReceitasDespesas = { receita: 0, despesa: 0 };

    if (supabaseAdmin) try {
      const { data: cfe } = await supabaseAdmin
        .from("finance_cash_flow_entries").select("*").eq("year", yr).eq("month", mo);
      for (const r of (cfe ?? [])) {
        const cat = String(r.category ?? "").toLowerCase();
        const tipo = String(r.type ?? "").toLowerCase();
        const v = NUM(r.amount);
        if (tipo === "receita") {
          cfReceitasDespesas.receita += v;
          if (cat.includes("venda") || cat.includes("fatur") || cat.includes("cliente")) cfReceita += v;
          if (cat.includes("financ") || cat.includes("rendiment") || cat.includes("invest")) cfReceitasFinanceiras += v;
        } else if (tipo === "despesa") {
          cfReceitasDespesas.despesa += v;
          if (cat.includes("custo") && cat.includes("fix")) cfCustosFixos += v;
          if (cat.includes("invest") && cat.includes("capex")) cfInvestCapex += v;
          if (cat.includes("varia")) cfCustosVariavel += v;
          if (cat.includes("emprest") || cat.includes("parcela") || cat.includes("loan")) cfEmprestimo += v;
        }
      }
    } catch (e) { console.warn("[IA-DRE-V4] cf err:", (e as any)?.message); }

    // (2) Backup: receita_financeira_manual do dre_manual
    let recFinManual = 0;
    if (supabaseAdmin) try {
      const { data: dm } = await supabaseAdmin
        .from("finance_dre_manual_entries").select("*").eq("year", yr).eq("month", mo);
      for (const r of (dm ?? [])) {
        const sec = String(r.section ?? "").toLowerCase();
        const key = String(r.line_key ?? "").toLowerCase();
        const op  = String(r.operator ?? "add").toLowerCase();
        const isRecFin = (sec.includes("receita") || sec.includes("financ") ||
                          key.includes("financ") || key.includes("rendiment") || key.includes("invest"));
        const isAdd = !op.includes("sub") && r.active !== false;
        if (isRecFin && isAdd) recFinManual += NUM(r.amount);
      }
    } catch (e) {}

    // (3) Receita Bruta = vendas do CF (somente vendas, nao receitas financeiras)
    const recBruta = cfReceita;
    if (recBruta <= 0) {
      log({ WARN: "cf.receita=0, usando fallback cfReceitasDespesas.receita" });
    }
    const recBrutaFinal = recBruta > 0 ? recBruta : cfReceitasDespesas.receita;

    // (4) Imposto = 16% presumido (bate com tabela "Estrutura Anual do DRE")
    const impostos = +(recBrutaFinal * 0.16).toFixed(2);
    const recLiquida = +(recBrutaFinal - impostos).toFixed(2);
    const cmv = 0;
    const lucroBruto = recLiquida;

    // (5) DES PESAS OPERACIONAIS = SOMENTE o que esta lancado no Fluxo de Caixa do mes
    //     (custos_fixos + investimentos_capex + custos_variavel)
    const despesasOps = {
      despesas_administrativas: cfCustosFixos,   // mapeia fixos como adm nesta organizacao
      despesas_pessoal: 0,
      despesas_vendas: 0,
      despesas_marketing: 0,
      despesas_infraestrutura: cfInvestCapex       // capex como infra
    };
    const despOpTotal = cfCustosFixos + cfInvestCapex + cfCustosVariavel;
    despesasOps.despesas_operacionais_total_somado_cf = despOpTotal;

    // (6) DESPESAS FINANCEIRAS = EMPRESTIMOS lancados no CF do mes
    const despFin = cfEmprestimo;

    // (7) RECEITAS FINANCEIRAS = receitas_financeiras (CF) + dre_manual
    const recFinTotal = cfReceitasFinanceiras + recFinManual;

    // (8) Depreciacao + IRPJ = finance_dre_manual_entries
    let depreciacao = 0, irpj = 0;
    if (supabaseAdmin) try {
      const { data: dm2 } = await supabaseAdmin
        .from("finance_dre_manual_entries").select("*").eq("year", yr).eq("month", mo);
      for (const r of (dm2 ?? [])) {
        const sec = String(r.section ?? "").toLowerCase();
        const key = String(r.line_key ?? "").toLowerCase();
        const op = String(r.operator ?? "add").toLowerCase();
        const sinal = op.includes("sub") ? -1 : 1;
        if (sec.includes("despesa") && key.includes("depreciac")) depreciacao += sinal * NUM(r.amount);
        if (sec.includes("tribut") && (key.includes("irpj") || key.includes("csll"))) irpj += sinal * NUM(r.amount);
      }
    } catch (e) {}

    // (9) EBIT / LAJIR / Margem
    const ebit = +(lucroBruto - despOpTotal - despFin + recFinTotal - depreciacao).toFixed(2);
    const ebitda = +(ebit + depreciacao).toFixed(2);
    const lucroLiquido = +(ebit - irpj).toFixed(2);
    const margem = recBrutaFinal > 0 ? +((lucroLiquido / recBrutaFinal) * 100).toFixed(2) : 0;

    // (10) ATUALIZA NOW.DRE
    now.dre = {
      ...dre,
      receita_bruta: recBrutaFinal,
      receita_bruta_cf_vendas: cfReceita,
      receita_financeira_cf: cfReceitasFinanceiras,
      receita_financeira_manual: recFinManual,
      receita_financeira_auto: 0,
      receita_financeira: recFinTotal,
      impostos: impostos,
      aliquota_impostos_pct: 16,
      receita_liquida: recLiquida,
      cmv: cmv,
      lucro_bruto: lucroBruto,
      ...despesasOps,
      despesas_operacionais: despOpTotal,
      despesas_financeiras: despFin,
      despesas_financeiras_cf_emprestimo: cfEmprestimo,
      despesas_financeiras_loans: cfEmprestimo,
      depreciacao: depreciacao,
      ebit: ebit,
      lajir: ebit,
      ebitda: ebitda,
      irpj_csll: irpj,
      lucro_liquido: lucroLiquido,
      margem_liquida_percent: margem,
      _formula: "FONTE UNICA = finance_cash_flow_entries | RecBruta=vendas | Impostos=16%presumido | RecFin=cf.receitas_financeiras+dre_manual | DespOp=cf.custos_fixos+invest_capex+variavel | DespFin=cf.emprestimo | Margem = LL/RecBruta"
    };

    // (11) ATUALIZA NOW.CASHFLOW para o card fluxo de caixa bater tambem
    cf.despesa_cf_custos_fixos = cfCustosFixos;
    cf.despesa_cf_invest_capex  = cfInvestCapex;
    cf.despesa_cf_variavel      = cfCustosVariavel;
    cf.despesa_cf_emprestimo    = cfEmprestimo;
    cf.despesa = +(
      cfCustosFixos + cfInvestCapex + cfCustosVariavel + cfEmprestimo
    ).toFixed(2);
    cf.receita = +cfReceita.toFixed(2);
    cf.saldo = +((cfReceita - cf.despesa).toFixed(2));

    log({
      yr, mo,
      cf_custos_fixos: cfCustosFixos,
      cf_invest_capex: cfInvestCapex,
      cf_variavel: cfCustosVariavel,
      cf_emprestimo: cfEmprestimo,
      cf_receita_total_vendas: cfReceita,
      cf_receitas_financeiras: cfReceitasFinanceiras,
      rec_bruta_vendas: recBrutaFinal,
      impostos, rec_liquida: recLiquida,
      cmv,
      desp_op: despOpTotal,
      desp_fin: despFin,
      rec_fin: recFinTotal,
      depreciacao, ebit, ebitda,
      irpj, lucro_liquido: lucroLiquido,
      margem_pct: margem,
      cf_despesa_total: cf.despesa,
      cf_saldo_final: cf.saldo
    });
  } catch (e) { console.warn("[IA-DRE-V4] erro:", (e as any)?.message); }


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
