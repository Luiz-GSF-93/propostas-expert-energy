// app/api/atlas-wind/route.ts
// GET ?lat=X&lon=Y -> nearest grid point do Atlas Eolico CEPEL (1 km)
import { NextRequest, NextResponse } from 'next/server';
import { nearestGridPoint } from '@/lib/atlas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';   // precisa de Node para @supabase/supabase-js server-side

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { ok: false, message: 'lat/lon invalidos' },
      { status: 400 }
    );
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json(
      { ok: false, message: 'lat/lon fora da faixa valida' },
      { status: 400 }
    );
  }
  const result = await nearestGridPoint(lat, lon);
  if (!result.ok) {
    return NextResponse.json(result, { status: 200 }); // 200 sem dados > 500 do servico
  }
  return NextResponse.json(result);
}
