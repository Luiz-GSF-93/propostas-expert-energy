export type DiagnosticStatus = 'draft' | 'review' | 'approved' | 'rejected';

export type DiagnosticAuditEntry = {
  at: string;
  action: string;
  status: DiagnosticStatus;
  note?: string;
};

export type DiagnosticSummary = {
  companyName: string;
  demandKw: number;
  monthlyConsumptionKwh: number;
  estimatedSavingsValue: number;
  estimatedSavingsPercent: number;
  paybackMonths: number;
  baselineScenarioAnnual: number;
  thermalReductionAnnual: number;
  demandOptimizationAnnual: number;
  powerQualityAnnual: number;
  potentialGainAnnual: number;
  loadProfileGainText: string;
};

export type SavedDiagnostic = {
  id: string;
  status: DiagnosticStatus;
  title: string;
  payload: any;
  summary: DiagnosticSummary;
  createdAt: string;
  updatedAt: string;
  audit: DiagnosticAuditEntry[];
};

const STORAGE_KEY = 'expert-energy:diagnosticos:v1';

function isBrowser() {
  return typeof window !== 'undefined';
}

function readAll(): SavedDiagnostic[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: SavedDiagnostic[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function toNumber(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function safeString(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function calcBaselineScenarioAnnual(result: any) {
  const fBase = toNumber(result?.F_base);
  const fCen = toNumber(result?.F_cen);

  if (fBase > 0 && fCen >= 0) {
    return Math.max(0, (fBase - fCen) * 12);
  }

  const ecoAnual = toNumber(result?.eco_anual);
  if (ecoAnual > 0) {
    return ecoAnual;
  }

  return 0;
}

function calcPotentialAnnual(result: any) {
  const baselineScenarioAnnual = calcBaselineScenarioAnnual(result);
  const demandOptimizationAnnual = Math.max(0, toNumber(result?.demRes?.ganho_anual_estimado));
  const powerQualityAnnual = Math.max(0, toNumber(result?.thdRes?.total_RS_ano));
  const thermalReductionAnnual = Math.max(0, toNumber(result?.EquipComparativo?.gain_total));

  const potentialGainAnnual =
    baselineScenarioAnnual +
    demandOptimizationAnnual +
    powerQualityAnnual +
    thermalReductionAnnual;

  return {
    baselineScenarioAnnual,
    demandOptimizationAnnual,
    powerQualityAnnual,
    thermalReductionAnnual,
    potentialGainAnnual,
  };
}

function calcPotentialPercent(result: any, potentialGainAnnual: number) {
  const annualBase = Math.max(0, toNumber(result?.F_base) * 12);

  if (annualBase > 0) {
    return (potentialGainAnnual / annualBase) * 100;
  }

  return 0;
}

export function summarizeEnergiaPayload(payload: any): DiagnosticSummary {
  const input = payload?.input || {};
  const result = payload?.result || {};
  const meta = payload?.meta || {};

  const companyName = String(
    input?.razao ||
      input?.companyName ||
      input?.empresa ||
      'Empresa sem nome',
  );

  const demandKw =
    toNumber(input?.dc) ||
    toNumber(input?.dcP) ||
    toNumber(result?.demRes?.dc) ||
    toNumber(result?.demRes?.dc_atual_p) ||
    0;

  const monthlyConsumptionKwh =
    toNumber(result?.E_mes) > 0
      ? toNumber(result.E_mes) * 1000
      : toNumber(result?.monthlyConsumptionKwh);

  const gains = calcPotentialAnnual(result);

  const estimatedSavingsValue = gains.potentialGainAnnual > 0
    ? gains.potentialGainAnnual / 12
    : 0;

  const estimatedSavingsPercent = calcPotentialPercent(result, gains.potentialGainAnnual);

  const paybackMonths =
    toNumber(result?.payback) > 0
      ? toNumber(result.payback) * 12
      : toNumber(result?.paybackMonths);

  return {
    companyName,
    demandKw,
    monthlyConsumptionKwh,
    estimatedSavingsValue,
    estimatedSavingsPercent,
    paybackMonths,
    baselineScenarioAnnual: gains.baselineScenarioAnnual,
    thermalReductionAnnual: gains.thermalReductionAnnual,
    demandOptimizationAnnual: gains.demandOptimizationAnnual,
    powerQualityAnnual: gains.powerQualityAnnual,
    potentialGainAnnual: gains.potentialGainAnnual,
    loadProfileGainText: safeString(meta?.recGain),
  };
}

export function buildDiagnosticId() {
  const now = new Date();
  const y = now.getFullYear();
  const seq = Math.floor(Math.random() * 9000) + 1000;
  return `dg-${y}-${seq}`;
}

export function listDiagnostics(): SavedDiagnostic[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDiagnosticById(id: string): SavedDiagnostic | null {
  return readAll().find((item) => item.id === id) || null;
}

export function upsertDiagnostic(input: {
  id?: string;
  status: DiagnosticStatus;
  payload: any;
  title?: string;
  note?: string;
}): SavedDiagnostic {
  const items = readAll();
  const now = new Date().toISOString();
  const id = input.id || buildDiagnosticId();
  const summary = summarizeEnergiaPayload(input.payload);

  const existingIndex = items.findIndex((item) => item.id === id);
  const existing = existingIndex >= 0 ? items[existingIndex] : null;

  const record: SavedDiagnostic = {
    id,
    status: input.status,
    title: input.title || summary.companyName || `Diagnóstico ${id}`,
    payload: input.payload,
    summary,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    audit: [
      ...(existing?.audit || []),
      {
        at: now,
        action: existing ? 'updated' : 'created',
        status: input.status,
        note: input.note,
      },
    ],
  };

  if (existingIndex >= 0) {
    items[existingIndex] = record;
  } else {
    items.push(record);
  }

  writeAll(items);
  return record;
}

export function updateDiagnosticStatus(id: string, status: DiagnosticStatus, note?: string) {
  const record = getDiagnosticById(id);
  if (!record) return null;

  return upsertDiagnostic({
    id: record.id,
    status,
    payload: record.payload,
    title: record.title,
    note,
  });
}

export function removeDiagnostic(id: string) {
  const items = readAll().filter((item) => item.id !== id);
  writeAll(items);
}
