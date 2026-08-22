export type DbStatus =
  | 'rascunho'
  | 'em_revisao'
  | 'revisado'
  | 'aprovado'
  | 'arquivado';

export type DiagnosticDbRowLike = Partial<{
  id: string;
  code: string | null;
  title: string | null;
  company_name: string | null;
  cnpj: string | null;
  segment: string | null;
  market: string | null;
  version_label: string | null;
  status: string | null;
  payload_json: unknown;
  result_json: unknown;
  created_by: string | null;
  updated_by: string | null;
  reviewed_by: string | null;
  current_revision: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}>;

export function asRecord(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
}

export function safeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeStatus(value: unknown): DbStatus {
  const allowed: DbStatus[] = [
    'rascunho',
    'em_revisao',
    'revisado',
    'aprovado',
    'arquivado',
  ];

  if (typeof value !== 'string') return 'rascunho';
  return allowed.includes(value as DbStatus) ? (value as DbStatus) : 'rascunho';
}

export function extractCompanyName(payload: unknown, fallback?: string | null) {
  const root = asRecord(payload);
  const input = asRecord(root.input);

  return (
    input.razao ||
    input.empresa ||
    input.company_name ||
    fallback ||
    'Empresa sem nome'
  );
}

export function extractCnpj(payload: unknown, fallback?: string | null) {
  const root = asRecord(payload);
  const input = asRecord(root.input);

  return input.cnpj || fallback || null;
}

export function extractSegment(payload: unknown, fallback?: string | null) {
  const root = asRecord(payload);
  const input = asRecord(root.input);

  return input.segmento || input.segment || fallback || null;
}

export function extractMarket(payload: unknown, fallback?: string | null) {
  const root = asRecord(payload);
  const input = asRecord(root.input);

  return input.mercado || input.market || fallback || null;
}

export function extractVersionLabel(payload: unknown, fallback?: string | null) {
  const root = asRecord(payload);
  const schemaVersion = root.schemaVersion;

  if (typeof schemaVersion === 'string' && schemaVersion.trim()) {
    return `EnergiaPro v${schemaVersion.trim()}`;
  }

  return fallback || 'EnergiaPro';
}

export function buildTitle(companyName: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback;
  return `Diagnóstico - ${companyName}`;
}

export function buildSummarySnapshot(
  payloadJson: unknown,
  resultJson: unknown,
  row?: DiagnosticDbRowLike
) {
  const payload = asRecord(payloadJson);
  const result = asRecord(resultJson || payload.result);
  const input = asRecord(payload.input);
  const meta = asRecord(payload.meta);
  const demRes = asRecord(result.demRes);

  const companyName =
    input.razao ||
    row?.company_name ||
    row?.title ||
    'Empresa sem nome';

  const demandKw = safeNumber(input.dc || input.dcP || demRes.dc_atual_p);
  const monthlyConsumptionKwh = safeNumber(result.E_mes) * 1000;

  const fBase = safeNumber(result.F_base);
  const fCen = safeNumber(result.F_cen);
  const ecoAnual = safeNumber(result.eco_anual);

  const baselineScenarioAnnual =
    fBase > 0 || fCen > 0 ? Math.max(0, fBase - fCen) : 0;

  const potentialGainAnnual =
    ecoAnual > 0 ? ecoAnual : baselineScenarioAnnual;

  const estimatedSavingsValue =
    potentialGainAnnual > 0 ? potentialGainAnnual / 12 : 0;

  const estimatedSavingsPercent =
    fBase > 0 && potentialGainAnnual > 0
      ? (potentialGainAnnual / (fBase * 12)) * 100
      : 0;

  const paybackMonths = safeNumber(result.payback) * 12;

  const thermalReductionAnnual = safeNumber(
    result.thermalReductionAnnual ??
      result.reducao_termica_anual ??
      result.ganho_termico_anual ??
      result.thermRed_anual
  );

  const demandOptimizationAnnual = safeNumber(
    result.demandOptimizationAnnual ??
      result.demanda_otima_anual ??
      result.ganho_demanda_anual ??
      result.demOpt_anual
  );

  const powerQualityAnnual = safeNumber(
    result.powerQualityAnnual ??
      result.qee_thd_reativo_anual ??
      result.ganho_qee_anual
  );

  return {
    companyName,
    cnpj: input.cnpj || row?.cnpj || null,
    segment: input.segmento || input.segment || row?.segment || null,
    market: input.mercado || input.market || row?.market || null,
    demandKw,
    monthlyConsumptionKwh,
    estimatedSavingsValue,
    estimatedSavingsPercent,
    paybackMonths,
    baselineScenarioAnnual,
    thermalReductionAnnual,
    demandOptimizationAnnual,
    powerQualityAnnual,
    potentialGainAnnual,
    loadProfileGainText: String(meta.recGain || ''),
  };
}

type FlatMap = Record<string, string | number | boolean | null>;

function pushFlatValue(
  out: FlatMap,
  key: string,
  value: unknown
) {
  if (value === undefined) {
    out[key] = null;
    return;
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    out[key] = value;
    return;
  }

  if (Array.isArray(value)) {
    out[key] = `[${value.length}]`;
    return;
  }

  out[key] = String(value);
}

function flattenObject(
  value: unknown,
  prefix = '',
  out: FlatMap = {}
): FlatMap {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    pushFlatValue(out, prefix || 'value', value);
    return out;
  }

  if (Array.isArray(value)) {
    pushFlatValue(out, prefix || 'value', value);
    return out;
  }

  const obj = asRecord(value);
  const keys = Object.keys(obj).sort();

  if (!keys.length) {
    out[prefix || 'value'] = null;
    return out;
  }

  for (const key of keys) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    const current = obj[key];

    if (
      current !== null &&
      current !== undefined &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      flattenObject(current, nextPrefix, out);
    } else {
      pushFlatValue(out, nextPrefix, current);
    }
  }

  return out;
}

export function buildChangedFields(beforeValue: unknown, afterValue: unknown) {
  const beforeMap = flattenObject(beforeValue);
  const afterMap = flattenObject(afterValue);

  const keys = Array.from(
    new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])
  ).sort();

  return keys.filter((key) => {
    const before = beforeMap[key] ?? null;
    const after = afterMap[key] ?? null;
    return before !== after;
  });
}

export function buildAuditMetadata(params: {
  beforeRow?: DiagnosticDbRowLike | null;
  afterRow?: DiagnosticDbRowLike | null;
  origin: string;
  action: string;
  note?: string | null;
}) {
  const beforeRow = params.beforeRow ?? null;
  const afterRow = params.afterRow ?? null;

  const beforeSummary = beforeRow
    ? buildSummarySnapshot(beforeRow.payload_json, beforeRow.result_json, beforeRow)
    : null;

  const afterSummary = afterRow
    ? buildSummarySnapshot(afterRow.payload_json, afterRow.result_json, afterRow)
    : null;

  const beforeComparable = beforeRow
    ? {
        title: beforeRow.title ?? null,
        company_name: beforeRow.company_name ?? null,
        cnpj: beforeRow.cnpj ?? null,
        segment: beforeRow.segment ?? null,
        market: beforeRow.market ?? null,
        version_label: beforeRow.version_label ?? null,
        status: beforeRow.status ?? null,
        current_revision: beforeRow.current_revision ?? null,
        summary: beforeSummary,
      }
    : null;

  const afterComparable = afterRow
    ? {
        title: afterRow.title ?? null,
        company_name: afterRow.company_name ?? null,
        cnpj: afterRow.cnpj ?? null,
        segment: afterRow.segment ?? null,
        market: afterRow.market ?? null,
        version_label: afterRow.version_label ?? null,
        status: afterRow.status ?? null,
        current_revision: afterRow.current_revision ?? null,
        summary: afterSummary,
      }
    : null;

  const payload = asRecord(afterRow?.payload_json ?? beforeRow?.payload_json);

  return {
    origin: params.origin,
    action: params.action,
    note: params.note ?? null,
    record_id: afterRow?.id ?? beforeRow?.id ?? null,
    code: afterRow?.code ?? beforeRow?.code ?? null,
    from_status: beforeRow?.status ?? null,
    to_status: afterRow?.status ?? null,
    revision_before: beforeRow?.current_revision ?? null,
    revision_after: afterRow?.current_revision ?? null,
    changed_fields: buildChangedFields(beforeComparable, afterComparable),
    before_summary: beforeSummary,
    after_summary: afterSummary,
    schema_version:
      typeof payload.schemaVersion === 'string' ? payload.schemaVersion : null,
    generated_at:
      typeof payload.geradoEm === 'string' ? payload.geradoEm : null,
    captured_at: new Date().toISOString(),
  };
}

export function statusActionName(status: DbStatus) {
  return {
    rascunho: 'mark_draft',
    em_revisao: 'send_to_review',
    revisado: 'mark_reviewed',
    aprovado: 'approve',
    arquivado: 'archive',
  }[status];
}
