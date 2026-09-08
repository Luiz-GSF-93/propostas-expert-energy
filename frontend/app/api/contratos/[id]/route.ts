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

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase indisponivel" }, { status: 500 });
    const { id } = await context.params;
    const { data, error } = await supabase.from("contracts").select("*, clients (*), contract_services (*, recurring_services (*)), contract_licenses (*), contract_acl_units (*), contract_workflow_events (*)").eq("id", id).single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase indisponivel" }, { status: 500 });
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    if (body.cliente) {
      const { data: contractCur } = await supabase.from("contracts").select("cliente_id").eq("id", id).single();
      if (contractCur?.cliente_id) {
        await supabase.from("clients").update({
          razao_social: body.cliente.razao_social,
          cnpj: body.cliente.cnpj || null,
          email: body.cliente.email || "",
          telefone: body.cliente.telefone || "",
          updated_at: new Date().toISOString()
        }).eq("id", contractCur.cliente_id);
      }
    }

    const updatePayload: any = {};
    if (body.data_inicio !== undefined) updatePayload.data_inicio = body.data_inicio;
    if (body.data_fim !== undefined) updatePayload.data_fim = body.data_fim;
    if (body.vigencia_meses !== undefined) updatePayload.vigencia_meses = Number(body.vigencia_meses);
    if (body.valor_mensal !== undefined) updatePayload.valor_mensal = Number(body.valor_mensal);
    if (body.dia_vencimento !== undefined) updatePayload.dia_vencimento = Number(body.dia_vencimento);
    if (body.renovacao_automatica !== undefined) updatePayload.renovacao_automatica = Boolean(body.renovacao_automatica);
    if (body.indice_reajuste !== undefined) updatePayload.indice_reajuste = body.indice_reajuste;
    if (body.sla_horas !== undefined) updatePayload.sla_horas = Number(body.sla_horas);
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.observacoes !== undefined) updatePayload.observacoes = body.observacoes;
    updatePayload.updated_at = new Date().toISOString();

    const { data: contractData, error: contractErr } = await supabase.from("contracts").update(updatePayload).eq("id", id).select().single();
    if (contractErr) return NextResponse.json({ ok: false, error: contractErr.message }, { status: 500 });

    if (body.licenca_energy_link) {
      const { tipo_licenca, limite_medicoes, usuarios_permitidos, pontos_medicao } = body.licenca_energy_link;
      const { data: licExist } = await supabase.from("contract_licenses").select("id").eq("contrato_id", id).maybeSingle();
      if (licExist) {
        await supabase.from("contract_licenses").update({
          tipo_licenca: tipo_licenca || "starter",
          limite_medicoes: Number(limite_medicoes || 10),
          usuarios_permitidos: Number(usuarios_permitidos || 5),
          pontos_medicao: pontos_medicao || [],
          updated_at: new Date().toISOString()
        }).eq("id", licExist.id);
      } else {
        await supabase.from("contract_licenses").insert({
          contrato_id: id,
          tipo_licenca: tipo_licenca || "starter",
          limite_medicoes: Number(limite_medicoes || 10),
          usuarios_permitidos: Number(usuarios_permitidos || 5),
          pontos_medicao: pontos_medicao || [],
          ativo: true
        });
      }
    }
    return NextResponse.json({ ok: true, data: contractData }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase indisponivel" }, { status: 500 });
    const { id } = await context.params;
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: "Contrato removido com sucesso" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
