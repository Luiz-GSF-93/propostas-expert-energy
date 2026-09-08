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
    const { data, error } = await supabase
      .from("contracts")
      .select("*, clients (*), contract_services (*, recurring_services (*)), contract_licenses (*), contract_acl_units (*)")
      .eq("id", id).single();
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
    const updatePayload: any = {};
    if (body.valor_mensal !== undefined) updatePayload.valor_mensal = Number(body.valor_mensal);
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.renovacao_automatica !== undefined) updatePayload.renovacao_automatica = Boolean(body.renovacao_automatica);
    updatePayload.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("contracts").update(updatePayload).eq("id", id).select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 200 });
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
    return NextResponse.json({ ok: true, message: "Contrato removido" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
