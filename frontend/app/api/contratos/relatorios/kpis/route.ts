import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase indisponivel" }, { status: 500 });
    const { data: contracts, error } = await supabase.from("contracts").select("*, clients(razao_social, cnpj)");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const all = contracts || [];
    const ativos = all.filter(c => c.status === "ativo");
    const cancelados = all.filter(c => c.status === "cancelado");
    const mrr = ativos.reduce((acc, c) => acc + Number(c.valor_mensal || 0), 0);
    const arr = mrr * 12;
    const churn = all.length > 0 ? (cancelados.length / all.length) * 100 : 0;
    const taxaRenovacao = ativos.length > 0 ? ((ativos.filter(c => c.renovacao_automatica).length / ativos.length) * 100) : 100;
    const hoje = new Date();
    const em90 = new Date();
    em90.setDate(hoje.getDate() + 90);
    const vencer90 = ativos.filter(c => c.data_fim && new Date(c.data_fim) >= hoje && new Date(c.data_fim) <= em90);

    return NextResponse.json({
      ok: true,
      data: {
        mrr: Number(mrr.toFixed(2)),
        arr: Number(arr.toFixed(2)),
        total_ativos: ativos.length,
        total_cancelados: cancelados.length,
        churn_rate_pct: Number(churn.toFixed(1)),
        taxa_renovacao_pct: Number(taxaRenovacao.toFixed(1)),
        contratos_a_vencer_90d: vencer90.length,
        lista_a_vencer: vencer90.map(c => ({
          id: c.id,
          cliente: c.clients?.razao_social || "Nao informado",
          data_fim: c.data_fim,
          valor_mensal: c.valor_mensal
        }))
      }
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
