import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContextFull, logFinanceAiEvent,
  simularCenario, supabaseAdmin,
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Insight = { modulo:string; titulo:string; severidade:"baixa"|"media"|"alta"; detalhe:string };
type Sug     = { modulo:string; acao:string; impacto:string };
type Cen     = { nome:string; receita:number; custos:number; lucro:number; delta_vs_atual_pct:number };

const BRL = (n: number, frac=2) =>
  Number(n||0).toLocaleString("pt-BR", { minimumFractionDigits: frac, maximumFractionDigits: frac });

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) return NextResponse.json({ error: guard.reason, auth_status: guard.status }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const year  = Number(body?.year ?? new Date().getFullYear());
  const month = Number(body?.month ?? new Date().getMonth() + 1);
  const ctx = await loadFinanceContextFull(year, month);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: 500 });

  const now = ctx.now;
  const insights: Insight[] = [];
  const suggestions: Sug[] = [];

  let contractsData = {
    mrr: 0,
    arr: 0,
    total_ativos: 0,
    total_cancelados: 0,
    contratos_a_vencer_90d: 0
  };

  if (supabaseAdmin) {
    try {
      const { data: dbContracts } = await supabaseAdmin
        .from("contracts")
        .select("*, clients(razao_social, cnpj)");
      
      const allC = dbContracts || [];
      const ativos = allC.filter((c: any) => c.status === "ativo");
      const cancelados = allC.filter((c: any) => c.status === "cancelado");
      const mrr = ativos.reduce((acc: number, c: any) => acc + Number(c.valor_mensal || 0), 0);
      
      const hoje = new Date();
      const em90 = new Date();
      em90.setDate(hoje.getDate() + 90);
      const vencer90 = ativos.filter((c: any) => c.data_fim && new Date(c.data_fim) >= hoje && new Date(c.data_fim) <= em90);

      contractsData = {
        mrr: Number(mrr.toFixed(2)),
        arr: Number((mrr * 12).toFixed(2)),
        total_ativos: ativos.length,
        total_cancelados: cancelados.length,
        contratos_a_vencer_90d: vencer90.length
      };

      if (contractsData.mrr > 0) {
        insights.push({
          modulo: "contratos",
          titulo: `MRR Contratado: ${BRL(contractsData.mrr)}/mês (${contractsData.total_ativos} contratos)`,
          severidade: "baixa",
          detalhe: `A carteira recorrente garante um ARR projetado de ${BRL(contractsData.arr)} como base de receita previsível.`
        });
      }

      if (contractsData.contratos_a_vencer_90d > 0) {
        insights.push({
          modulo: "contratos",
          titulo: `Alerta de Renovação: ${contractsData.contratos_a_vencer_90d} contrato(s) vencendo em 90 dias`,
          severidade: "media",
          detalhe: `Necessário ativar a régua de negociação com os clientes para garantir retenção e reajuste anual.`
        });
      }
    } catch (e) {
      console.warn("[IA-Overview] Erro ao carregar contratos:", e);
    }
  }

  const recMes = Number(now.cashflow.receita || 0) + contractsData.mrr;
  const despMes = Number(now.cashflow.despesa || 0);
  const saldoMes = recMes - despMes;

  const receitaBase = Math.max(recMes, contractsData.mrr, 1000);
  const custosTotais = Math.max(despMes, 500);

  const otim = simularCenario(receitaBase, custosTotais,  10, -2);
  const real = simularCenario(receitaBase, custosTotais,   2,  2);
  const pess = simularCenario(receitaBase, custosTotais, -10,  8);
  const lucroAtual = saldoMes;

  const cenarios: Cen[] = [
    { nome:"OTIMISTA (+10% Rec / -2% Custo)", receita: otim.receita, custos: otim.custos, lucro: otim.lucro, delta_vs_atual_pct: delta(otim.lucro, lucroAtual) },
    { nome:"REALISTA (+2% Rec / +2% Custo)",  receita: real.receita, custos: real.custos, lucro: real.lucro, delta_vs_atual_pct: delta(real.lucro, lucroAtual) },
    { nome:"PESSIMISTA (-10% Rec / +8% Custo)", receita: pess.receita, custos: pess.custos, lucro: pess.lucro, delta_vs_atual_pct: delta(pess.lucro, lucroAtual) },
  ];

  const parecerGeral = `Síntese Executiva Financeira (${now.label}):
• Receita Recorrente Contratada (MRR): ${BRL(contractsData.mrr)}/mês (${contractsData.total_ativos} contratos ativos | ARR: ${BRL(contractsData.arr)}).
• Resultado Operacional do Mês: Saldo consolidado de ${BRL(saldoMes)} (Receitas: ${BRL(recMes)} | Despesas: ${BRL(despMes)}).
• Governança e Retenção: ${contractsData.contratos_a_vencer_90d} contrato(s) a vencer nos próximos 90 dias.`;

  await logFinanceAiEvent({
    user_email: guard.user.email, user_id: guard.user.id,
    action: "overview", period_ref: `${year}-${String(month).padStart(2,"0")}`,
    prompt: "overview com contratos", response: `${insights.length} insights gerados`,
  });

  return NextResponse.json({
    periodo: { year, month, label: now.label },
    parecer_geral: parecerGeral,
    insights, suggestions, cenarios,
    bruto: {
      dre: now.dre,
      cashflow: { ...now.cashflow, receita: recMes, saldo: saldoMes },
      costs: now.costs,
      planning: now.planning,
      loans: now.loans,
      contracts: contractsData,
      historico_12m: ctx.historico_12m,
    },
  });
}

function delta(v: number, base: number): number {
  if (!Number.isFinite(base) || Math.abs(base) < 1) return 0;
  return Number((((v - base) / Math.abs(base)) * 100).toFixed(1));
}
