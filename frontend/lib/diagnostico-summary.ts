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

export type DiagnosticApiRecord = {
  id: string;
  code: string | null;
  title: string;
  companyName: string;
  cnpj: string | null;
  segment: string | null;
  market: string | null;
  versionLabel: string;
  status: string;
  currentRevision: number;
  createdBy: string | null;
  updatedBy: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  payload: any;
  result: any;
  summary: DiagnosticSummary;
};

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

export function summarizeEnergiaPayload(payload: any, fallback?: Partial<{
  companyName: string | null;
}>) : DiagnosticSummary {
  const input = payload?.input || {};
  const result = payload?.result || {};
  const meta = payload?.meta || {};

  const companyName = String(
    input?.razao ||
    input?.companyName ||
    input?.empresa ||
    fallback?.companyName ||
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
      ? toNumber(result?.E_mes) * 1000
      : toNumber(result?.monthlyConsumptionKwh);

  const gains = calcPotentialAnnual(result);

  const estimatedSavingsValue =
    gains.potentialGainAnnual > 0 ? gains.potentialGainAnnual / 12 : 0;

  const estimatedSavingsPercent = calcPotentialPercent(result, gains.potentialGainAnnual);

  const paybackMonths =
    toNumber(result?.payback) > 0
      ? toNumber(result?.payback) * 12
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
    loadProfileGainText: safeString(meta?.recGain || meta?.loadLineMetrics),
  };
}

export function mapDiagnosticDbRow(row: any): DiagnosticApiRecord {
  const payload = row?.payload_json || {};
  const result = row?.result_json || payload?.result || {};

  const mergedPayload = {
    ...payload,
    result,
    meta: payload?.meta || {},
  };

  const summary = summarizeEnergiaPayload(mergedPayload, {
    companyName: row?.company_name ?? null,
  });

  return {
    id: row.id,
    code: row.code ?? null,
    title: row.title,
    companyName: row.company_name,
    cnpj: row.cnpj ?? null,
    segment: row.segment ?? null,
    market: row.market ?? null,
    versionLabel: row.version_label,
    status: row.status,
    currentRevision: row.current_revision,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    reviewedBy: row.reviewed_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload: mergedPayload,
    result,
    summary,
  };
}
