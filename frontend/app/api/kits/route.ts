import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// GET /api/kits - Lista todos os kits comerciais
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Configuração do Supabase ausente" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("commercial_kits")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[GET /api/kits] Erro no Supabase:", error.message);
      return NextResponse.json({ ok: false, error: error.message, data: [] }, { status: 200 });
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err: any) {
    console.error("[GET /api/kits] Erro fatal:", err);
    return NextResponse.json({ ok: false, error: err.message, data: [] }, { status: 500 });
  }
}

// POST /api/kits - Cria novo kit com itens ilimitados
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Configuração do Supabase ausente" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "Nome do kit é obrigatório" }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const description = body.description ? String(body.description).trim() : null;
    const pdf_attachment_url = body.pdf_attachment_url ? String(body.pdf_attachment_url).trim() : null;
    const pdf_attachment_name = body.pdf_attachment_name ? String(body.pdf_attachment_name).trim() : null;

    const insertData: any = {
      name,
      description,
      items,
      status: "active",
      pdf_attachment_url,
      pdf_attachment_name,
      created_at: new Date().toISOString(),
    };

    if (body.id && typeof body.id === "string" && !body.id.startsWith("kit-")) {
      insertData.id = body.id;
    }

    const { data, error } = await supabase
      .from("commercial_kits")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[POST /api/kits] Erro Supabase:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/kits] Erro fatal:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
