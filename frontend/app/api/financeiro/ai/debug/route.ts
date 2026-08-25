import { NextResponse } from "next/server";
import {
  checkAdminFromRequest, loadFinanceContext,
  normCashflowType, normDreSection
} from "@/lib/financeiro/ai/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await checkAdminFromRequest(req);
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const year  = Number(body?.year)  || now.getUTCFullYear();
  const month = Number(body?.month) || (now.getUTCMonth() + 1);

  const ctx = await loadFinanceContext(year, month);

  // Tipos e status únicos (cobre a descoberta de taxonomia)
  const cfTipos   = Array.from(new Set(ctx.now.data.cashflow.map((r: any) => String(r.type ?? r.tipo ?? "(vazio)"))));
  const dreSecs   = Array.from(new Set(ctx.now.data.dre.map((r: any) => String(r.section ?? r.secao ?? r.seção ?? "(vazio)"))));
  const loanStts  = Array.from(new Set(ctx.now.data.loans.map((r: any) => String(r.status ?? "(vazio)"))));
  const costStts  = Array.from(new Set(ctx.now.data.costs.map((r: any) => String(r.status ?? "(vazio)"))));

  return NextResponse.json({
    periodo: ctx.periodo,
    periodo_anterior: ctx.periodo_ant,
    counts: {
      cashflow_now: ctx.now.data.cashflow.length,
      cashflow_prev: ctx.anterior.data.cashflow.length,
      dre_now: ctx.now.data.dre.length,
      dre_prev: ctx.anterior.data.dre.length,
      costs: ctx.now.data.costs.length,
      loans: ctx.now.data.loans.length,
      planning: ctx.now.data.planning.length
    },
    taxonomia: {
      cashflow_types_unicos: cfTipos,
      dre_sections_unicas: dreSecs,
      loan_status_unicos: loanStts,
      cost_status_unicos: costStts
    },
    amostras: {
      cashflow_3_primeiros: ctx.now.data.cashflow.slice(0, 3),
      dre_3_primeiros: ctx.now.data.dre.slice(0, 3),
      loans_3_primeiros: ctx.now.data.loans.slice(0, 3),
      costs_3_primeiros: ctx.now.data.costs.slice(0, 3)
    },
    normalizacao_exemplo: {
      cf_normalizado: ctx.now.data.cashflow.slice(0, 5).map((r: any) => ({
        raw_type: r.type ?? r.tipo,
        tipo_norm: normCashflowType(r.type ?? r.tipo)
      })),
      dre_normalizado: ctx.now.data.dre.slice(0, 5).map((r: any) => ({
        raw_section: r.section ?? r.secao ?? r.seção,
        secao_norm: normDreSection(r.section ?? r.secao ?? r.seção)
      }))
    },
    tabelas_usadas: ctx.tables
  });
}
