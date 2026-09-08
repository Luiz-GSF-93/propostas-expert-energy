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
    const { data, error } = await supabase.from("contract_licenses").select("*").eq("contrato_id", id).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const pontos = Array.isArray(data?.pontos_medicao) ? data.pontos_medicao : [];
    return NextResponse.json({
      ok: true,
      data: {
        tipo_licenca: data?.tipo_licenca || "starter",
        licencas_ativas: pontos.filter((p: any) => p.ativo !== false).length,
        limite: data?.limite_medicoes || 10,
        usuarios_permitidos: data?.usuarios_permitidos || 5,
        pontos: pontos
      }
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
