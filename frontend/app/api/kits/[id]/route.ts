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

// PUT /api/kits/[id] - Atualiza um kit existente
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase ausente" }, { status: 500 });

    const id = params?.id;
    const body = await req.json().catch(() => ({}));

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };
    if (body.name) updateData.name = String(body.name).trim();
    if (body.description !== undefined) updateData.description = String(body.description).trim();
    if (body.items) updateData.items = body.items;
    if (body.pdf_attachment_url !== undefined) updateData.pdf_attachment_url = String(body.pdf_attachment_url).trim();
    if (body.pdf_attachment_name !== undefined) updateData.pdf_attachment_name = String(body.pdf_attachment_name).trim();

    const { data, error } = await supabase
      .from("commercial_kits")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/kits/[id] - Exclui um kit
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase ausente" }, { status: 500 });

    const id = params?.id;
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
