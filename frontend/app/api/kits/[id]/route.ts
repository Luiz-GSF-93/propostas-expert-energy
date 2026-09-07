import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Variáveis do Supabase não configuradas.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// PUT /api/kits/[id] - Compatível 100% com o padrão Next.js 16 do projeto
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'ID do kit ausente na requisição.' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const body = await request.json().catch(() => ({}));

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };
    if (body.name) updateData.name = String(body.name).trim();
    if (body.description !== undefined) updateData.description = String(body.description).trim();
    if (body.items) updateData.items = body.items;
    if (body.pdf_attachment_url !== undefined) updateData.pdf_attachment_url = String(body.pdf_attachment_url).trim();
    if (body.pdf_attachment_name !== undefined) updateData.pdf_attachment_name = String(body.pdf_attachment_name).trim();

    const { data, error } = await supabase
      .from('commercial_kits')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/kits/[id] - Compatível 100% com o padrão Next.js 16 do projeto
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'ID do kit ausente na requisição.' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('commercial_kits')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Kit excluído com sucesso' }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
