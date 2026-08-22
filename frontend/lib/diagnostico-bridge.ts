type EnergiaWindow = Window & {
  EnergiaPro?: {
    populate?: (input: any) => boolean;
    calculate?: (input?: any) => any;
    export?: (input?: any) => string | any;
  };
};

function getInputValue(doc: Document, id: string) {
  const el = doc.getElementById(id) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null;

  if (!el) return undefined;
  return el.value;
}

function getTextValue(doc: Document, id: string) {
  const el = doc.getElementById(id);
  if (!el) return '';
  return (el.textContent || '').trim();
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function readEnergiaInputFromDom(doc: Document) {
  return {
    razao: getInputValue(doc, 'razao') || '',
    cnpj: getInputValue(doc, 'cnpj') || '',
    segmento: getInputValue(doc, 'segmento') || '',
    tensao: getInputValue(doc, 'tensao') || '',
    distribuidora: getInputValue(doc, 'distribuidora') || '',
    mercado: getInputValue(doc, 'mercado') || '',
    modalidade: getInputValue(doc, 'modalidade') || '',
    dc: toNumber(getInputValue(doc, 'dc')),
    dcP: toNumber(getInputValue(doc, 'dcP')),
    dcFP: toNumber(getInputValue(doc, 'dcFP')),
    fp: toNumber(getInputValue(doc, 'fp')),
    hd: toNumber(getInputValue(doc, 'hd')),
    dm: toNumber(getInputValue(doc, 'dm')),
    fu: toNumber(getInputValue(doc, 'fu')),
    sazonal: getInputValue(doc, 'sazonal') || '',
    fv_kwp: toNumber(getInputValue(doc, 'fv_kwp')),
    hsp: toNumber(getInputValue(doc, 'hsp')),
    pr: toNumber(getInputValue(doc, 'pr')),
    capex_fv_k: toNumber(getInputValue(doc, 'capex_fv_k')),
    opex_fv: toNumber(getInputValue(doc, 'opex_fv')),
    bess_kwh: toNumber(getInputValue(doc, 'bess_kwh')),
    chp: getInputValue(doc, 'chp') || '',
    wacc: toNumber(getInputValue(doc, 'wacc')),
    spread: toNumber(getInputValue(doc, 'spread')),
    horiz: toNumber(getInputValue(doc, 'horiz')),
    infl: toNumber(getInputValue(doc, 'infl')),
    f_emis: toNumber(getInputValue(doc, 'f_emis')),
    ultR_p: toNumber(getInputValue(doc, 'ultR_p')),
    ultR_fp: toNumber(getInputValue(doc, 'ultR_fp')),
    pReativo: toNumber(getInputValue(doc, 'pReativo')),
    tReativa: toNumber(getInputValue(doc, 'tReativa')),
  };
}

function readEnergiaMetaFromDom(doc: Document) {
  return {
    recPeak: getTextValue(doc, 'recPeak'),
    recValley: getTextValue(doc, 'recValley'),
    recGain: getTextValue(doc, 'recGain'),
    loadLineMetrics: getTextValue(doc, 'loadLineMetrics'),
  };
}

export async function requestEnergiaExport(
  iframe: HTMLIFrameElement | null,
  timeoutMs = 8000,
): Promise<any> {
  const targetWindow = iframe?.contentWindow as EnergiaWindow | null;
  const targetDocument = iframe?.contentDocument ?? targetWindow?.document ?? null;

  if (!targetWindow || !targetDocument) {
    throw new Error('Iframe do EnergiaPro não está disponível.');
  }

  const api = targetWindow.EnergiaPro;
  if (!api) {
    throw new Error('API window.EnergiaPro não encontrada no iframe.');
  }

  const input = readEnergiaInputFromDom(targetDocument);
  const meta = readEnergiaMetaFromDom(targetDocument);

  let result: any = {};
  try {
    if (typeof api.calculate === 'function') {
      result = api.calculate() || {};
    }
  } catch (error) {
    console.error('Erro ao calcular resultado do EnergiaPro:', error);
  }

  let exported: any = null;
  try {
    if (typeof api.export === 'function') {
      exported = api.export();
      if (typeof exported === 'string') {
        exported = JSON.parse(exported);
      }
    }
  } catch (error) {
    console.error('Erro ao exportar JSON do EnergiaPro:', error);
  }

  return {
    schemaVersion: exported?.schemaVersion || '1.6.1',
    geradoEm: new Date().toISOString(),
    input,
    result: exported?.result || result || {},
    equipCatalog: exported?.equipCatalog || null,
    meta,
  };
}

export async function sendEnergiaImport(
  iframe: HTMLIFrameElement | null,
  payload: any,
  timeoutMs = 8000,
): Promise<boolean> {
  const targetWindow = iframe?.contentWindow as EnergiaWindow | null;
  const api = targetWindow?.EnergiaPro;
  const populate = api?.populate;

  if (typeof populate !== 'function') {
    return false;
  }

  const input = payload?.input || payload?.form || payload;

  try {
    const ok = populate(input);

    if (typeof api?.calculate === 'function') {
      api.calculate();
    }

    return Boolean(ok);
  } catch (error) {
    console.error('Erro ao importar dados para o EnergiaPro:', error);
    return false;
  }
}
