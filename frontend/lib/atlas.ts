// lib/atlas.ts
// v17plus-E-fix: listagem robusta + nearest neighbor real (sem grid aliasing)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'atlas-eolico';
const REGIONS = ['Norte','Nordeste','CentroOeste','Sudeste','Sul'] as const;
const COL_DIR = ['N','NNE','NE','NEE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'] as const;

// whitelist por regiao — aceita nome com ou sem underscore entre
// "dados_gerais" e "R{Regiao}" (Nordeste foi upado sem "_R" no bucket).
const ALL_REGION_FILES: Record<typeof REGIONS[number], string[]> = {
  Norte:       ['dados_gerais_RNorte.csv',       'dados_geraisRNorte.csv'],
  Nordeste:    ['dados_gerais_RNordeste.csv',    'dados_geraisRNordeste.csv'],
  CentroOeste: ['dados_gerais_RCentroOeste.csv', 'dados_geraisRCentroOeste.csv'],
  Sudeste:     ['dados_gerais_RSudeste.csv',     'dados_geraisRSudeste.csv'],
  Sul:         ['dados_gerais_RSul.csv',         'dados_geraisRSul.csv'],
};

export type AtlasPoint = {
  lat: number;
  lon: number;
  v_30: number; v_50: number; v_80: number; v_100: number;
  v_120: number; v_150: number; v_200: number;
  k: number; c: number;
  direcoes: Record<string, number>;
  direcao_predominante: string;
};

let supabaseAdmin: SupabaseClient | null = null;
const INDEX: Record<string, AtlasPoint[]> = {};
let LOADED = false;

function getAdmin(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;
  supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false } }
  );
  return supabaseAdmin;
}

function parseCsvLine(line: string): string[] {
  return line.split(',');
}

async function loadRegion(region: string): Promise<AtlasPoint[]> {
  const arr: AtlasPoint[] = [];
  INDEX[region] = arr;
  const sb = getAdmin();

  // FIX 1: lista TUDO no bucket root e filtra em JS (sem search param do supabase)
  const { data: list, error: lerr } = await sb.storage
    .from(BUCKET).list('', { limit: 1000 });
  if (lerr) {
    console.error('[atlas] list error', lerr.message);
    return arr;
  }
  // aceita nomes com OU sem "_R" antes da regiao (whitelist tolerante)
  const accepted = new Set<string>(ALL_REGION_FILES[(region as typeof REGIONS[number])].map((s: string) => s.toLowerCase()));
  const names = (list ?? [])
    .map(o => o.name)
    .filter(n => typeof n === 'string' && accepted.has(n.toLowerCase()));
  if (!names.length) {
    console.error('[atlas] nenhum CSV encontrado pra', region, '(esperado um dos:', ALL_REGION_FILES[(region as typeof REGIONS[number])].join('|') + ')');
    return arr;
  }

  for (const name of names) {
    const { data: blob, error: derr } = await sb.storage.from(BUCKET).download(name);
    if (derr || !blob) {
      console.error('[atlas] download erro', name, derr?.message);
      continue;
    }
    const text = await blob.text();
    const linhas = text.split('\n');
    for (let i = 1; i < linhas.length; i++) {
      const ln = linhas[i].trim();
      if (!ln) continue;
      const c = parseCsvLine(ln);
      if (c.length < 46) continue;
      const lat = parseFloat(c[2]);
      const lon = parseFloat(c[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const dirMap: Record<string, number> = {};
      COL_DIR.forEach((d, j) => { dirMap[d] = parseFloat(c[4 + j]) || 0; });
      arr.push({
        lat, lon,
        v_30:  parseFloat(c[50]) || 0,
        v_50:  parseFloat(c[51]) || 0,
        v_80:  parseFloat(c[46]) || 0,
        v_100: parseFloat(c[47]) || 0,
        v_120: parseFloat(c[52]) || 0,
        v_150: parseFloat(c[48]) || 0,
        v_200: parseFloat(c[49]) || 0,
        k:     parseFloat(c[44]) || 2.0,
        c:     parseFloat(c[45]) || 7.0,
        direcoes: dirMap,
        direcao_predominante:
          COL_DIR.reduce((best, d) => dirMap[d] > (dirMap[best] ?? -1) ? d : best, 'N'),
      });
    }
  }
  console.log('[atlas] regiao', region, 'carregada:', arr.length, 'pontos,', names.length, 'arquivos');
  return arr;
}

export async function loadAllRegions(): Promise<void> {
  if (LOADED) return;
  LOADED = true;
  await Promise.all(REGIONS.map(r => loadRegion(r)));
}

export type AtlasResult =
  | {
      ok: true;
      distance_m: number;
      lat_grid: number;
      lon_grid: number;
      v_30: number; v_50: number; v_80: number; v_100: number;
      v_120: number; v_150: number; v_200: number;
      k: number; c: number;
      direcao_predominante: string;
      top_5_direcoes: Array<{ dir: string; pct: number }>;
      fonte: string;
      fonte_regiao: string;
    }
  | { ok: false; message: string };

export async function nearestGridPoint(lat: number, lon: number): Promise<AtlasResult> {
  await loadAllRegions();

  // FIX 2: scan REAL de TODOS os pontos (350k) com distancia euclidiana exata.
  // ~30ms em JS single-thread. Aceitavel e correto.
  let best: AtlasPoint | null = null;
  let bestDist = Infinity;
  let bestReg = '';
  for (const region of REGIONS) {
    const pts = INDEX[region];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const d = Math.hypot(p.lat - lat, p.lon - lon);
      if (d < bestDist) { bestDist = d; best = p; bestReg = region; }
    }
  }
  // distancia maxima aceitavel: 2 graus (~220 km). Acima disso, sem cobertura.
  if (!best || bestDist > 2.0) {
    return {
      ok: false,
      message: 'Fora da cobertura do Atlas (dist > 220 km do ponto mais próximo em ' + bestReg + ')',
    };
  }
  const top5 = (Object.entries(best.direcoes) as Array<[string, number]>)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([dir, pct]) => ({ dir, pct: Number(pct.toFixed(1)) }));
  return {
    ok: true,
    distance_m: Math.round(bestDist * 111_000),
    lat_grid: best.lat,
    lon_grid: best.lon,
    v_30: best.v_30, v_50: best.v_50, v_80: best.v_80, v_100: best.v_100,
    v_120: best.v_120, v_150: best.v_150, v_200: best.v_200,
    k: best.k, c: best.c,
    direcao_predominante: best.direcao_predominante,
    top_5_direcoes: top5,
    fonte: 'Atlas Eolico Brasileiro — CEPEL/INPE (grade 1 km, CSV servido via Supabase Storage)',
    fonte_regiao: bestReg,
  };
}
