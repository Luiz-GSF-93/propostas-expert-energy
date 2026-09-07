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

// PUT /api/kits/[id] - Atualiza kit e TODOS os seus itens (suporta texto/uuid e busca por nome como fallback)
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase ausente" }, { status: 500 });

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.description !== undefined) updateData.description = String(body.description).trim();
    if (body.items !== undefined) updateData.items = Array.isArray(body.items) ? body.items : [];
    if (body.pdf_attachment_url !== undefined) updateData.pdf_attachment_url = String(body.pdf_attachment_url).trim();
    if (body.pdf_attachment_name !== undefined) updateData.pdf_attachment_name = String(body.pdf_attachment_name).trim();
    updateData.status = "active";

    // 1. Tenta atualizar diretamente pelo ID
    let { data, error } = await supabase
      .from("commercial_kits")
      .update(updateData)
      .eq("id", id)
      .select()
      .maybeSingle();

    // 2. Se não encontrou por ID (ex: id local antigo 'kit-123'), tenta atualizar ou criar por nome
    if (!data && body.name) {
      const { data: byName } = await supabase
        .from("commercial_kits")
        .select("id")
        .eq("name", String(body.name).trim())
        .maybeSingle();

      if (byName?.id) {
        const res = await supabase
          .from("commercial_kits")
          .update(updateData)
          .eq("id", byName.id)
          .select()
          .single();
        data = res.data;
        error = res.error;
      } else {
        // Se ainda não existir no banco, insere o registro com todos os itens
        const res = await supabase
          .from("commercial_kits")
          .insert({
            name: updateData.name || body.name,
            description: updateData.description || null,
            items: updateData.items || [],
            status: "active",
            pdf_attachment_url: updateData.pdf_attachment_url || null,
            pdf_attachment_name: updateData.pdf_attachment_name || null,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        data = res.data;
        error = res.error;
      }
    }

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/kits/[id]
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase ausente" }, { status: 500 });

    const { id } = await context.params;
    
    const { error } = await supabase
      .from("commercial_kits")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: "Kit excluído com sucesso" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
