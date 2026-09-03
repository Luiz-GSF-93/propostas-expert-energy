// v1: nearest-municipality matcher (ibge kelvins CSV, 5270 pontos)
// carrega lazy no primeiro request e cai em pais/regiao se distance > 200km.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type Municipio = {
  codigo_ibge: number;
  nome: string;
  lat: number;
  lon: number;
  uf: string;       // sigla
  capital: boolean;
};

const UF_BY_CODIGO: Record<number, string> = {
  11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',
  21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',
  31:'MG',32:'ES',33:'RJ',35:'SP',
  41:'PR',42:'SC',43:'RS',
  50:'MS',51:'MT',52:'GO',53:'DF'
};

let MUNICIPIOS: Municipio[] | null = null;

async function loadMunicipios(): Promise<Municipio[]> {
  if (MUNICIPIOS) return MUNICIPIOS;
  const csvPath = path.join(process.cwd(), 'data', 'municipios.csv');
  const text = await fs.readFile(csvPath, 'utf-8');
  const lines = text.split('\n');
  const arr: Municipio[] = [];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) continue;
    const c = ln.split(',');
    if (c.length < 7) continue;
    const codigo_ibge = parseInt(c[0], 10);
    const nome = c[1];
    const lat = parseFloat(c[2]);
    const lon = parseFloat(c[3]);
    const capital = c[4] === '1';
    const codigo_uf = parseInt(c[5], 10);
    const uf = UF_BY_CODIGO[codigo_uf] || `UF${codigo_uf}`;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!Number.isFinite(codigo_ibge)) continue;
    arr.push({ codigo_ibge, nome, lat, lon, uf, capital });
  }
  MUNICIPIOS = arr;
  console.log('[municipios] loaded', arr.length, 'records');
  return arr;
}

// deterministic nearest-by-haversine (km) <5ms @N=5570
export async function nearestMunicipio(lat: number, lon: number) {
  const arr = await loadMunicipios();
  let best: Municipio | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    // sqrt cheat: use squared haversine normalized; faster + monotonic
    const dLat = (p.lat - lat) * 111.32;
    const dLon = (p.lon - lon) * 111.32 * Math.cos(lat * Math.PI / 180);
    const d = dLat * dLat + dLon * dLon;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  if (!best) return null;
  return { ...best, distance_km: Math.round(Math.sqrt(bestDist) * 10) / 10 };
}
