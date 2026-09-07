import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// GET /api/kits - Lista todos os kits comerciais cadastrados no Supabase
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase não configurado no servidor" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("commercial_kits")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[/api/kits] Erro ao buscar kits no Supabase:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Normaliza para o formato esperado pelo frontend
    const kits = (data || []).map((k: any) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      pdf_attachment_url: k.pdf_attachment_url || "",
      pdf_attachment_name: k.pdf_attachment_name || "",
      items: Array.isArray(k.items) ? k.items : (typeof k.items === "string" ? JSON.parse(k.items) : []),
      created_at: k.created_at,
      updated_at: k.updated_at,
    }));

    return NextResponse.json(kits, { status: 200 });
  } catch (err: any) {
    console.error("[/api/kits] Erro interno:", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// POST /api/kits - Cadastra um novo kit comercial no Supabase
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase não configurado no servidor" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];
    const pdf_attachment_url = String(body.pdf_attachment_url || "").trim();
    const pdf_attachment_name = String(body.pdf_attachment_name || "").trim();

    if (!name) {
      return NextResponse.json({ ok: false, error: "Nome do Kit é obrigatório" }, { status: 400 });
    }

    const newKit = {
      name,
      description,
      items,
      pdf_attachment_url,
      pdf_attachment_name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("commercial_kits")
      .insert(newKit)
      .select()
      .single();

    if (error) {
      console.error("[/api/kits] Erro ao inserir kit no Supabase:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (err: any) {
    console.error("[/api/kits] Erro interno:", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
