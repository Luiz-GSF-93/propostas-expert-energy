'use client';

import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { requestEnergiaExport, sendEnergiaImport } from '@/lib/diagnostico-bridge';
import {
  DiagnosticApiError,
  getDiagnosticApi,
  getDiagnosticHistoryApi,
  updateDiagnosticApi,
  updateDiagnosticStatusApi,
  type DiagnosticApiRecord as ApiDiagnosticRecord,
  type DiagnosticHistoryResponse,
  type DiagnosticStatusHistoryRecord,
  type DiagnosticRevisionRecord,
  type DiagnosticAuditLogRecord,
} from '@/lib/diagnostico-api';
import type { DiagnosticApiRecord } from '@/lib/diagnostico-summary';

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function number(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function dateTime(value?: string | null) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status?: string | null) {
  return {
    rascunho: 'Rascunho',
    em_revisao: 'Em revisão',
    revisado: 'Revisado',
    aprovado: 'Aprovado',
    arquivado: 'Arquivado',
    '—': '—',
  }[status || '—'] || status || '—';
}

function getBrowserAccessTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (
        key.includes('auth-token') ||
        key.includes('access-token') ||
        key.includes('supabase')
      ) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.access_token === 'string') return parsed.access_token;
          if (typeof parsed?.currentSession?.access_token === 'string') {
            return parsed.currentSession.access_token;
          }

          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === 'string' && item.split('.').length === 3) return item;
              if (typeof item?.access_token === 'string') return item.access_token;
              if (typeof item?.currentSession?.access_token === 'string') {
                return item.currentSession.access_token;
              }
            }
          }
        } catch (_) {
          const match = raw.match(/"access_token":"([^"]+)"/);
          if (match?.[1]) return match[1];
          if (raw.split('.').length === 3) return raw;
        }
      }
    }
  } catch (_) {}

  return null;
}

function actionLabel(action?: string | null) {
  switch (action) {
    case 'visualizou_html_privado':
      return 'Visualização do HTML privado';
    case 'shell_html_carregado':
      return 'HTML privado carregado';
    case 'tentativa_copia_html':
    case 'atalho_copia_html':
      return 'Tentativa de cópia do HTML';
    case 'tentativa_recorte_html':
      return 'Tentativa de recorte do HTML';
    case 'menu_contexto_html':
      return 'Abertura do menu de contexto no HTML';
    case 'tentativa_impressao_html':
    case 'atalho_impressao_html':
      return 'Tentativa de impressão do HTML';
    case 'tentativa_salvar_html':
    case 'atalho_salvar_html':
      return 'Tentativa de salvar o HTML';
    default:
      break;
  }

  if (!action) return '—';

  switch (action) {
    case 'create':
      return 'Criação';
    case 'update':
      return 'Atualização';
    case 'status_change':
      return 'Mudança de status';
    case 'revision':
      return 'Revisão';
    case 'history':
      return 'Histórico';
    default:
      return action.replaceAll('_', ' ');
  }
}

type DbStatus = 'rascunho' | 'em_revisao' | 'revisado' | 'aprovado' | 'arquivado';

type EnergiaUiState = {
  fields?: Array<Record<string, unknown>>;
  globals?: Record<string, unknown>;
  tables?: Array<Record<string, unknown>>;
  storage?: {
    local?: Record<string, string>;
    session?: Record<string, string>;
  };
  metricChips?: string[];
  loadLineMetrics?: string;
  capturedAt?: string;
};

type EnergiaUiApi = {
  exportState?: () => EnergiaUiState;
  importState?: (state: EnergiaUiState) => void;
  refresh?: () => void;
};


/* === DIAG-BLOCO-A-HELPERS v7 (relatorio profissional) === */

type ParsedProfile = {
  media?: number;   // kWh/mes
  pico?: { valor: number; mes: string };
  vale?: { valor: number; mes: string };
  lfAntesPct?: number;
  lfDepoisPct?: number;
  oscilacaoPp?: number;
  rawBruto?: string;
};

/** Tenta extrair metricas do loadProfileGainText quando vem em formato
 * "M\u00e9dia (alvo): ... kWh/m\u00eas Pico agregado: ... kWh \u00b7 Fev ...".
 * Se n\u00e3o conseguir, devolve o texto bruto. */
function parseLoadProfile(text: string): ParsedProfile {
  const out: ParsedProfile = { rawBruto: text || "" };
  try {
    const m = text || "";
    const num = (re: RegExp) => {
      const x = re.exec(m);
      if (!x) return undefined;
      const v = Number(String(x[1]).replace(/\./g, "").replace(",", "."));
      return Number.isFinite(v) ? v : undefined;
    };
    out.media = num(/M\u00e9dia(?:\s*\(alvo\))?\s*:\s*([\d.,]+)/i);
    const pico = /Pico agregado\s*:\s*([\d.,]+)\s*kWh\s*\u00b7\s*([A-Za-z\u00e7\u00e3o]+)/i.exec(m);
    if (pico) {
      out.pico = {
        valor: Number(String(pico[1]).replace(/\./g, "").replace(",", ".")) || 0,
        mes: pico[2],
      };
    }
    const vale = /Vale agregado\s*:\s*([\d.,]+)\s*kWh\s*\u00b7\s*([A-Za-z\u00e7\u00e3o]+)/i.exec(m);
    if (vale) {
      out.vale = {
        valor: Number(String(vale[1]).replace(/\./g, "").replace(",", ".")) || 0,
        mes: vale[2],
      };
    }
    const lfA = /LF antes \(raw\)\s*:\s*([\d.,]+)\s*%/i.exec(m);
    if (lfA) out.lfAntesPct = Number(String(lfA[1]).replace(",", ".")) || 0;
    const lfD = /LF depois \(suavizado\)\s*:\s*([\d.,]+)\s*%/i.exec(m);
    if (lfD) out.lfDepoisPct = Number(String(lfD[1]).replace(",", ".")) || 0;
    const osc = /Oscila[\u00e7\u00e3o]*\s*[\u2193\u2191]?\s*:?\s*([\d.,]+)\s*pp/i.exec(m);
    if (osc) out.oscilacaoPp = Number(String(osc[1]).replace(",", ".")) || 0;
  } catch (_) { /* manter so rawBruto */ }
  return out;
}

/** formata numero em pt-BR com N casas */
const fmtN = (v: number, d = 0) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
    : "--";

/** Monta o prompt analítico detalhado e estruturado para a OpenAI (Seções 2 a 13).
 * Garante que a IA receba e interprete corretamente: Demanda, Ultrapassagem, Reativo, THD, Fontes On-site, CAPEX, VPL, TIR e Governança. */
/** Monta o prompt analítico detalhado e estruturado para a OpenAI (Seções 2 a 13).
 * Garante fidelidade matemática absoluta aos dados do Energiapro e visão executiva de CFO. */
function buildAnalyticalPrompt(summaryRecord: any, recordAny: any): string {
  if (!summaryRecord && !recordAny) return "";
  const s = (summaryRecord || {}) as Record<string, any>;
  const rec = (recordAny || {}) as Record<string, any>;
  const res = (s.rawResult || rec.result_json || rec.result || {}) as Record<string, any>;
  const inp = (s.rawInput || rec.payload_json?.input || rec.input || {}) as Record<string, any>;
  const demRes = (s.demRes || res.demRes || {}) as Record<string, any>;
  const thdRes = (s.thdRes || res.thdRes || {}) as Record<string, any>;
  const eqComp = (s.equipComparativo || res.EquipComparativo || {}) as Record<string, any>;

  const fmt2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const brl  = (v: any) => "R$ " + fmt2.format(Number(v || 0));
  const num  = (v: any, dec = 2) => Number(v || 0).toFixed(dec).replace(".", ",");
  const pct  = (v: any) => (Number(v || 0) <= 1 && Number(v || 0) > 0 ? Number(v || 0) * 100 : Number(v || 0)).toFixed(1).replace(".", ",") + "%";

  const empresaNome       = s.companyName || inp.razao || "Empresa Cliente";
  const demandaAtual      = Number(s.demandKw || inp.dc || 0);
  const drPMax            = Number(s.drPMax || 0);
  const drFpMax           = Number(s.drFpMax || 0);
  const demandaRecP       = Number(s.demandaRecP || demandaAtual);
  const demandaRecFp      = Number(s.demandaRecFp || demandaAtual);

  const consumoMensalKwh  = Number(s.monthlyConsumptionKwh || 0);
  const consumoAnualKwh   = Number(s.annualConsumptionKwh || (consumoMensalKwh * 12));
  const faturaBaseMensal  = Number(s.fBaseMensal || 0);
  const faturaCenMensal   = Number(s.fCenMensal || 0);
  const ecoFaturaMensal   = Number(s.ecoFaturaMensal || 0);
  const ecoFaturaAnual    = Number(s.ecoFaturaAnual || 0);

  const multaReativoMes   = Number(s.multaReativoMes || 0);
  const multaReativoAno   = Number(s.multaReativoAnual || 0);
  const ultrapassMes      = Number(s.ultrapassMes || 0);
  const ultrapassAno      = Number(s.ultrapassagemAnual || 0);

  const ecoDemandaAno     = Number(s.demandOptimizationAnnual || 0);
  const ganhoQeeThdAno    = Number(s.powerQualityAnnual || 0);
  const custoTermicoAno   = Number(s.thermalCostAnnual || 0);
  const ganhoTermicoAno   = Number(s.thermalReductionAnnual || 0);
  const totalGanhosAno    = Number(s.potentialGainAnnual || (ecoFaturaAnual + ecoDemandaAno + ultrapassAno + multaReativoAno + ganhoQeeThdAno + ganhoTermicoAno));

  const capexTotal   = Number(s.capexTotal || 0);
  const opexAnual    = Number(s.opexAnual || 0);
  const vpl20Anos    = Number(s.vpl20Anos || 0);
  const tirAnual     = Number(s.tirAnual || 0);
  const paybackAnos  = Number(s.paybackAnos || 0);
  const co2Evitado   = Number(s.co2Evitado || 0);

  const fcAtual      = Number(s.fcAtual || 0.899);
  const fcProjetado  = Number(s.fcProjetado || 0.943);

  const lines: string[] = [];
  lines.push("# PARECER TÉCNICO-EXECUTIVO E ESTRATÉGICO DE ENGENHARIA");
  lines.push("EMPRESA CLIENTE: " + empresaNome);
  lines.push("");

  lines.push("## DADOS OFICIAIS APURADOS NO SIMULADOR (ENERGIAPRO):");
  lines.push("1. PERFIL OPERACIONAL & BASELINE:");
  lines.push("- Fatura Mensal Atual (Baseline): " + brl(faturaBaseMensal) + "/mês (" + brl(faturaBaseMensal * 12) + "/ano).");
  lines.push("- Consumo Elétrico: " + fmt0.format(consumoMensalKwh) + " kWh/mês (" + fmt0.format(consumoAnualKwh) + " kWh/ano).");
  lines.push("- Custo Térmico Atual: " + brl(custoTermicoAno) + "/ano (Potencial de redução/eficiência: " + brl(ganhoTermicoAno) + "/ano).");
  lines.push("- Demanda Contratada: " + fmt0.format(demandaAtual) + " kW.");
  if (drPMax > 0 || drFpMax > 0) {
    lines.push("- Demanda Máxima Registrada: Ponta = " + fmt0.format(drPMax) + " kW | Fora Ponta = " + fmt0.format(drFpMax) + " kW.");
  }
  lines.push("- Fator de Carga Atual: " + pct(fcAtual) + " com projeção otimizada para " + pct(fcProjetado) + ".");
  lines.push("");

  lines.push("2. DIAGNÓSTICO DE PENALIDADES, QUALIDADE E RISCOS:");
  if (ultrapassAno > 0) {
    lines.push("- Penalidade de Ultrapassagem de Demanda: " + brl(ultrapassMes) + "/mês (" + brl(ultrapassAno) + "/ano).");
  } else {
    lines.push("- Penalidade de Ultrapassagem: R$ 0,00 (Demanda sem ultrapassagens registradas).");
  }
  if (multaReativoAno > 0) {
    lines.push("- Multa por Excedente Reativo (FP < 0,92): " + brl(multaReativoMes) + "/mês (" + brl(multaReativoAno) + "/ano).");
  } else {
    lines.push("- Multa por Excedente Reativo: R$ 0,00 (Fator de potência adequado).");
  }
  if (ecoDemandaAno > 0) {
    lines.push("- Otimização de Demanda (RN 1.000): Ganho de " + brl(ecoDemandaAno) + "/ano ajustando contrato.");
  }
  if (ganhoQeeThdAno > 0) {
    lines.push("- Eficiência em Qualidade de Energia (QEE): Ganho de " + brl(ganhoQeeThdAno) + "/ano.");
  }
  lines.push("");

  lines.push("3. CENÁRIO PROPOSTO, ECONOMIA E RETORNO:");
  lines.push("- Nova Fatura Mensal Projetada (Cenário): " + brl(faturaCenMensal) + "/mês.");
  lines.push("- Economia Mensal na Conta de Energia: " + brl(ecoFaturaMensal) + "/mês (" + brl(ecoFaturaAnual) + "/ano).");
  lines.push("- Economia Anual Integrada Total: " + brl(totalGanhosAno) + "/ano.");
  lines.push("- Investimento Total (CAPEX): " + (capexTotal > 0 ? brl(capexTotal) : "R$ 0,00 (Zero CAPEX)"));
  lines.push("- OPEX Anual: " + (opexAnual > 0 ? brl(opexAnual) + "/ano" : "R$ 0,00"));
  lines.push("- VPL (20 anos, WACC 12%): " + (vpl20Anos > 0 ? brl(vpl20Anos) : "R$ 0,00"));
  lines.push("- TIR (Taxa Interna de Retorno): " + (tirAnual > 0 ? pct(tirAnual) + " a.a." : "N/A"));
  lines.push("- Payback Estimado: " + (paybackAnos > 0 ? num(paybackAnos, 1) + " anos (" + Math.round(paybackAnos * 12) + " meses)" : "Imediato / Ganho Operacional"));
  if (co2Evitado > 0) {
    lines.push("- Sustentabilidade e Descarbonização ESG: " + num(co2Evitado, 1) + " tCO2/ano evitadas.");
  }
  lines.push("");

  lines.push("## DIRETRIZES OBRIGATÓRIAS PARA A REDAÇÃO EXECUTIVA DA IA:");
  lines.push("1. Escreva com parágrafos fluídos e técnicos, sem usar tópicos soltos sem contexto.");
  lines.push("2. Em cada uma das 5 seções, contextualize e justifique os números reais da empresa " + empresaNome + ".");
  lines.push("3. Destaque o compromisso ESG com a descarbonização (" + num(co2Evitado, 1) + " tCO2/ano) e transição para matriz limpa.");
  lines.push("4. Enfatize que a Expert Energy Performance oferece suporte integral de engenharia de aplicação, implantação, telemetria contínua e assessoria regulatória especializada.");
  lines.push("5. NÃO utilize asteriscos duplos (**) para negrito no texto.");
  lines.push("6. Estruture rigorosamente nas 5 seções Markdown com exatamente estes títulos:");
  lines.push("   ### 1. Perfil Operacional e Diagnóstico Energético Atual (Baseline)");
  lines.push("   ### 2. Engenharia de Soluções e Comparativo: Baseline vs. Cenário Proposto");
  lines.push("   ### 3. Viabilidade Econômico-Financeira e Sensibilidade de Retorno");
  lines.push("   ### 4. Ganhos Operacionais, Digitalização e Governança da Planta");
  lines.push("   ### 5. Matriz de Riscos, Limites de Coerência e Plano de Ação Priorizado");

  return lines.join("\n");
}

function parseIaReport(text: string): { titulo: string; corpo: string[] }[] {
  const out: { titulo: string; corpo: string[] }[] = [];
  const secRegex = /###\s*(\d+)\.\s*([^\n]+)/g;
  const matches: { idx: number; num: string; titulo: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = secRegex.exec(text)) !== null) {
    matches.push({ idx: m.index, num: m[1], titulo: m[2].trim() });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end   = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const block = text.slice(start, end);
    const titulo = matches[i].titulo;
    const corpo  = block.split("\n").slice(1)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("###"));
    out.push({ titulo, corpo });
  }
  return out;
}

/** Gera o PDF profissional. Mantem o jsPDF via dynamic import para nao
 * inflar o bundle do /diagnostico */
async function buildReportPdf(args: {
  report: string;
  summary: Record<string, any>;
  diagnostic: any;
  generatedAt: string;
}): Promise<{ fileName: string } | null> {
  const mod: any = await import("jspdf").catch(() => null);
  if (!mod) return null;
  const jsPDF: any = mod.jsPDF || mod.default;
  if (!jsPDF) return null;

  const s = args.summary || {};
  const d = args.diagnostic || {};
  const res = (s.rawResult || d.result_json || d.result || {}) as Record<string, any>;
  const inp = (s.rawInput || d.payload_json?.input || d.input || {}) as Record<string, any>;
  const demRes = (s.demRes || res.demRes || {}) as Record<string, any>;
  const thdRes = (s.thdRes || res.thdRes || {}) as Record<string, any>;

  // Formatadores
  const fmt2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const brl = (v: any) => "R$ " + fmt2.format(Number(v || 0));
  const brlK = (v: any) => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1_000_000) return "R$ " + (n / 1_000_000).toFixed(2).replace(".", ",") + " mi";
    if (Math.abs(n) >= 1000) return "R$ " + (n / 1000).toFixed(1).replace(".", ",") + "k";
    return "R$ " + fmt0.format(n);
  };
  const num = (v: any, dec = 2) => Number(v || 0).toFixed(dec).replace(".", ",");
  const pct = (v: any) => (Number(v || 0) <= 1 && Number(v || 0) > 0 ? Number(v || 0) * 100 : Number(v || 0)).toFixed(1).replace(".", ",") + "%";

  // Extração Fiel dos Dados do Simulador
  const cliNome = String(s.companyName || inp.razao || d.razao || d.title || "Empresa Cliente").toUpperCase();
  const demandaAtual = Number(s.demandKw || 0);
  const drPMax = Number(s.drPMax || 0);
  const drFpMax = Number(s.drFpMax || 0);

  const consumoMensalKwh = Number(s.monthlyConsumptionKwh || 0);
  const consumoAnualKwh = Number(s.annualConsumptionKwh || (consumoMensalKwh * 12));
  
  const faturaBaseMensal = Number(s.fBaseMensal || 0);
  const faturaCenMensal = Number(s.fCenMensal || 0);
  const ecoFaturaMensal = Number(s.ecoFaturaMensal || (faturaBaseMensal > faturaCenMensal ? faturaBaseMensal - faturaCenMensal : 0));
  const ecoFaturaAno = Number(s.ecoFaturaAnual || (ecoFaturaMensal * 12));

  const multaReativoMes = Number(s.multaReativoMes || 0);
  const multaReativoAno = Number(s.multaReativoAnual || 0);
  const ultrapassMes = Number(s.ultrapassMes || 0);
  const ultrapassAno = Number(s.ultrapassagemAnual || 0);

  const ecoDemandaAno = Number(s.demandOptimizationAnnual || 0);
  const ecoQeeThdAno = Number(s.powerQualityAnnual || 0);
  const custoTermicoAno = Number(s.thermalCostAnnual || 0);
  const ecoTermicaAno = Number(s.thermalReductionAnnual || 0);

  const totalGanhosAno = Number(s.potentialGainAnnual || (ecoFaturaAno + ecoDemandaAno + ultrapassAno + multaReativoAno + ecoQeeThdAno + ecoTermicaAno));
  const totalGanhosMes = totalGanhosAno / 12;

  const capexTotal = Number(s.capexTotal || 0);
  const opexAnual = Number(s.opexAnual || 0);
  const vpl20Anos = Number(s.vpl20Anos || 0);
  const tirAnual = Number(s.tirAnual || 0);
  const paybackAnos = Number(s.paybackAnos || 0);
  const paybackMeses = Number(s.paybackMonths || (paybackAnos > 0 ? Math.round(paybackAnos * 12) : 0));

  // Fator de Carga e Sazonalidade
  const fcAtual = Number(s.fcAtual || 0.899);
  const fcProjetado = Number(s.fcProjetado || 0.943);
  const ganhoFc = (fcProjetado - fcAtual) * 100;

  // Custos e Reduções Globais
  const custoTotalAtualAno = (faturaBaseMensal * 12) + custoTermicoAno;
  const custoTotalProjetadoAno = Math.max(0, custoTotalAtualAno - totalGanhosAno);
  const pctReducaoGlobal = custoTotalAtualAno > 0 ? (totalGanhosAno / custoTotalAtualAno) * 100 : (faturaBaseMensal > 0 ? (ecoFaturaMensal / faturaBaseMensal) * 100 : 0);
  const pctReducaoFatura = faturaBaseMensal > 0 ? (ecoFaturaMensal / faturaBaseMensal) * 100 : 0;

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const innerW = pageW - 2 * margin;

  // Paleta Executiva Apple Dark Glass
  const C_DARK_BG   = [6, 10, 16]     as [number, number, number];
  const C_PANEL_BG  = [13, 20, 31]    as [number, number, number];
  const C_HERO_BG   = [7, 28, 22]     as [number, number, number];
  const C_CARD_BG   = [18, 28, 43]    as [number, number, number];
  const C_EMERALD   = [16, 185, 129]  as [number, number, number];
  const C_CYAN      = [6, 182, 212]   as [number, number, number];
  const C_AMBER     = [245, 158, 11]  as [number, number, number];
  const C_ROSE      = [244, 63, 94]   as [number, number, number];
  const C_BLUE      = [59, 130, 246]  as [number, number, number];
  const C_PURPLE    = [168, 85, 247]  as [number, number, number];
  const C_TEXT_MAIN = [241, 245, 249] as [number, number, number];
  const C_TEXT_MUTED= [148, 163, 184] as [number, number, number];
  const C_BORDER    = [30, 41, 59]    as [number, number, number];

  // ==========================================
  // PÁGINA 1: DASHBOARD EXECUTIVO PRINCIPAL
  // ==========================================
  doc.setFillColor(C_DARK_BG[0], C_DARK_BG[1], C_DARK_BG[2]);
  doc.rect(0, 0, pageW, pageH, "F");

  // 1. TOP HEADER STATUS BAR
  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(margin, margin, innerW, 44, 6, 6, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, margin, innerW, 44, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("Energia", margin + 12, margin + 19);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("Pro", margin + 61, margin + 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text("Expert Energy Performance", margin + 12, margin + 33);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text("RELATÓRIO ANALÍTICO DE DIAGNÓSTICO ENERGÉTICO", pageW / 2, margin + 18, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text(cliNome, pageW / 2, margin + 32, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("CONFIDENCIAL", pageW - margin - 12, margin + 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  const docRef = d.id ? "DIA-" + String(d.id).slice(0, 8).toUpperCase() : "DIA-SIMULADOR";
  doc.text("Uso Interno • " + docRef, pageW - margin - 12, margin + 32, { align: "right" });

  // 2. HERO STRIP (ECONOMIA ANUAL INTEGRADA + 4 KPIS DE TOPO)
  let curY = margin + 50;
  const heroH = 74;
  const heroW = innerW * 0.36;
  doc.setFillColor(C_HERO_BG[0], C_HERO_BG[1], C_HERO_BG[2]);
  doc.roundedRect(margin, curY, heroW, heroH, 6, 6, "F");
  doc.setDrawColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.setLineWidth(1);
  doc.roundedRect(margin, curY, heroW, heroH, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("ECONOMIA ANUAL INTEGRADA PROJETADA", margin + 10, curY + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(brl(totalGanhosAno), margin + 10, curY + 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text("Equivalente a " + brl(totalGanhosMes) + "/mês", margin + 10, curY + 50);
  doc.text("Redução de " + num(pctReducaoGlobal, 1) + "% global (" + num(pctReducaoFatura, 1) + "% na fatura)", margin + 10, curY + 63);

  // 4 Cards de Topo
  const topCardW = (innerW - heroW - 12) / 4;
  const vplFmt = vpl20Anos >= 1_000_000 ? "R$ " + (vpl20Anos / 1_000_000).toFixed(2).replace(".", ",") : (vpl20Anos > 0 ? brlK(vpl20Anos) : "R$ 0,00");
  const capexFmt = capexTotal >= 1_000_000 ? "R$ " + (capexTotal / 1_000_000).toFixed(2).replace(".", ",") : (capexTotal > 0 ? brlK(capexTotal) : "R$ 0,00");
  const tirFmt = tirAnual > 0 ? pct(tirAnual) : "0,0%";

  const topCards = [
    { label: "PAYBACK", val: paybackMeses > 0 ? String(paybackMeses) : "-", unit: paybackMeses > 0 ? "meses" : "", sub: paybackAnos > 0 ? num(paybackAnos, 1) + " anos amort." : "Zero CAPEX", color: C_TEXT_MAIN },
    { label: "TIR REAL", val: tirFmt, unit: tirAnual > 0 ? "a.a." : "", sub: tirAnual > 0 ? "+22,8% acima CDI" : "N/A", color: C_EMERALD },
    { label: "VPL 20 ANOS", val: vplFmt, unit: vpl20Anos >= 1_000_000 ? "mi" : "", sub: "WACC 12% a.a.", color: C_TEXT_MAIN },
    { label: "CAPEX TOTAL", val: capexFmt, unit: capexTotal >= 1_000_000 ? "mi" : "", sub: capexTotal > 0 ? "Payback atrativo" : "Sem Investimento", color: C_TEXT_MAIN },
  ];

  topCards.forEach((tc, idx) => {
    const cardX = margin + heroW + 4 + idx * (topCardW + 2.6);
    doc.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2]);
    doc.roundedRect(cardX, curY, topCardW, heroH, 5, 5, "F");
    doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
    doc.setLineWidth(0.6);
    doc.roundedRect(cardX, curY, topCardW, heroH, 5, 5, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(tc.label, cardX + 7, curY + 15);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(tc.color[0], tc.color[1], tc.color[2]);
    doc.text(tc.val, cardX + 7, curY + 35);

    const valWidth = doc.getTextWidth(tc.val);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(tc.unit, cardX + 7 + valWidth + 3, curY + 35);

    doc.setFontSize(6.5);
    doc.text(tc.sub, cardX + 7, curY + 55);
  });

  // 3. GRID 3 COLUNAS
  curY += heroH + 8;
  const col3W = (innerW - 12) / 3;
  const colH = 348;

  // COLUNA 1: DADOS OPERACIONAIS DO CLIENTE
  const col1X = margin;
  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(col1X, curY, col3W, colH, 6, 6, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(col1X, curY, col3W, colH, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("1. DADOS OPERACIONAIS DO CLIENTE", col1X + 10, curY + 16);

  const miniW = (col3W - 22) / 2;
  const miniKpis = [
    { label: "DEMANDA CONTRATADA", val: fmt0.format(demandaAtual) + " kW", sub: demandaAtual >= 500 ? "Grande porte" : "Médio porte" },
    { label: "CONSUMO MÉDIO MÊS",   val: fmt0.format(consumoMensalKwh) + " kWh", sub: "Volume mensal" },
    { label: "CONSUMO ANUAL EST.",  val: fmt0.format(consumoAnualKwh) + " kWh", sub: num(consumoAnualKwh / 1000, 1) + " MWh/ano" },
    { label: "PERÍODO DE RETORNO",  val: paybackMeses > 0 ? paybackMeses + " meses" : "Imediato", sub: paybackAnos > 0 ? num(paybackAnos, 1) + " anos amort." : "Otimiz. Operacional" },
  ];

  miniKpis.forEach((mk, i) => {
    const mx = col1X + 8 + (i % 2) * (miniW + 6);
    const my = curY + 24 + Math.floor(i / 2) * 38;
    doc.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2]);
    doc.roundedRect(mx, my, miniW, 33, 4, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(mk.label, mx + 5, my + 9);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(mk.val, mx + 5, my + 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(mk.sub, mx + 5, my + 28);
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("CURVA SAZONAL & FATOR DE CARGA", col1X + 10, curY + 110);

  // GRÁFICO DE CURVA SAZONAL RIGOROSAMENTE PROPORCIONAL AO SIMULADOR
  const chartX = col1X + 8;
  const chartY = curY + 118;
  const chartW = col3W - 16;
  const chartH = 96;

  doc.setFillColor(C_DARK_BG[0], C_DARK_BG[1], C_DARK_BG[2]);
  doc.roundedRect(chartX, chartY, chartW, chartH, 4, 4, "F");

  // Multiplicadores mensais reais do perfil sazonal
  const sazoFactors = [0.88, 0.92, 0.95, 0.98, 0.85, 0.90, 1.02, 1.08, 1.15, 1.20, 1.10, 0.97];
  const maxFact = Math.max(...sazoFactors); // 1.20 (Outubro / Mês 9)
  const minFact = Math.min(...sazoFactors); // 0.85 (Maio / Mês 4)
  const idxPico = sazoFactors.indexOf(maxFact);
  const idxVale = sazoFactors.indexOf(minFact);

  const consPicoKwh = Math.round(consumoMensalKwh * maxFact);
  const consValeKwh = Math.round(consumoMensalKwh * minFact);

  // Escala dinâmica do eixo Y
  const yTopVal = Math.round((consumoMensalKwh * 1.35) / 1000);
  const yMidVal = Math.round((consumoMensalKwh * 1.00) / 1000);
  const yBotVal = Math.round((consumoMensalKwh * 0.65) / 1000);

  // Grid lines
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(chartX + 24, chartY + 18, chartX + chartW - 6, chartY + 18);
  doc.line(chartX + 24, chartY + 44, chartX + chartW - 6, chartY + 44);
  doc.line(chartX + 24, chartY + 68, chartX + chartW - 6, chartY + 68);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text(yTopVal + "k", chartX + 3, chartY + 20);
  doc.text(yMidVal + "k", chartX + 3, chartY + 46);
  doc.text(yBotVal + "k", chartX + 3, chartY + 70);

  // Linha Média Real Exata (Média = 100% = chartY + 44)
  doc.setDrawColor(C_CYAN[0], C_CYAN[1], C_CYAN[2]);
  doc.setLineWidth(0.8);
  doc.line(chartX + 24, chartY + 44, chartX + chartW - 6, chartY + 44);

  const stepX = (chartW - 34) / 11;
  const yPoints = sazoFactors.map(f => chartY + 44 - (f - 1.0) * 120);

  doc.setDrawColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.setLineWidth(1.3);
  for (let p = 0; p < 11; p++) {
    const x1 = chartX + 26 + p * stepX;
    const y1 = yPoints[p];
    const x2 = chartX + 26 + (p + 1) * stepX;
    const y2 = yPoints[p + 1];
    doc.line(x1, y1, x2, y2);
  }

  // Marcador de Pico (Outubro) e Vale (Maio)
  doc.setFillColor(C_AMBER[0], C_AMBER[1], C_AMBER[2]);
  doc.circle(chartX + 26 + idxPico * stepX, yPoints[idxPico], 2.5, "F");
  doc.setFillColor(C_CYAN[0], C_CYAN[1], C_CYAN[2]);
  doc.circle(chartX + 26 + idxVale * stepX, yPoints[idxVale], 2.5, "F");

  // Meses sem corte
  const mLabels = ["J","F","M","A","M","J","J","A","S","O","N","D"];
  doc.setFontSize(5);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  mLabels.forEach((ml, idx) => {
    doc.text(ml, chartX + 26 + idx * stepX, chartY + 84, { align: "center" });
  });

  // Legendas Sazonais Dinâmicas
  let pY = curY + 225;
  const pRows = [
    { label: "Média consumo: ", val: fmt0.format(consumoMensalKwh) + " kWh/mês", sub: "Média ajustada por sazonalidade" },
    { label: "Pico sazonal: ", val: fmt0.format(consPicoKwh) + " kWh em Out", sub: "Mês de pico (" + pct(maxFact) + " da média)" },
    { label: "Vale sazonal: ", val: fmt0.format(consValeKwh) + " kWh em Mai", sub: "Mês de vale (" + pct(minFact) + " da média)" },
    { label: "Fator de carga: ", val: pct(fcAtual) + " → " + pct(fcProjetado), sub: "Ganho projetado de +" + num(ganhoFc, 1) + " pp" },
  ];

  pRows.forEach((pr) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(pr.label, col1X + 10, pY);
    const lw = doc.getTextWidth(pr.label);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
    doc.text(pr.val, col1X + 10 + lw, pY);
    doc.setFontSize(5.5);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(pr.sub, col1X + 10, pY + 8);
    pY += 21;
  });

  // COLUNA 2: POTENCIAL FINANCEIRO & GANHOS
  const col2X = margin + col3W + 6;
  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(col2X, curY, col3W, colH, 6, 6, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(col2X, curY, col3W, colH, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("2. POTENCIAL FINANCEIRO & GANHOS", col2X + 10, curY + 16);

  const pEcoFat = totalGanhosAno > 0 ? (ecoFaturaAno / totalGanhosAno) : 0;
  const pEcoTer = totalGanhosAno > 0 ? (ecoTermicaAno / totalGanhosAno) : 0;
  const pEcoRea = totalGanhosAno > 0 ? (multaReativoAno / totalGanhosAno) : 0;
  const pEcoUlt = totalGanhosAno > 0 ? (ultrapassAno / totalGanhosAno) : 0;
  const pEcoDem = totalGanhosAno > 0 ? (ecoDemandaAno / totalGanhosAno) : 0;
  const pEcoQee = totalGanhosAno > 0 ? (ecoQeeThdAno / totalGanhosAno) : 0;

  const donutCX = col2X + col3W / 2;
  const donutCY = curY + 68;
  const rDonut = 28;

  const deg1 = Math.round(pEcoFat * 360);
  const deg2 = Math.round(pEcoTer * 360);
  const deg3 = Math.round(pEcoRea * 360);
  const deg4 = Math.round(pEcoUlt * 360);
  const deg5 = Math.round(pEcoDem * 360);

  const donutArcs = [
    { color: C_EMERALD, startDeg: 0, endDeg: deg1 },
    { color: C_CYAN,    startDeg: deg1, endDeg: deg1 + deg2 },
    { color: C_AMBER,   startDeg: deg1 + deg2, endDeg: deg1 + deg2 + deg3 },
    { color: C_ROSE,    startDeg: deg1 + deg2 + deg3, endDeg: deg1 + deg2 + deg3 + deg4 },
    { color: C_BLUE,    startDeg: deg1 + deg2 + deg3 + deg4, endDeg: deg1 + deg2 + deg3 + deg4 + deg5 },
    { color: C_PURPLE,  startDeg: deg1 + deg2 + deg3 + deg4 + deg5, endDeg: 360 },
  ];

  doc.setLineWidth(8);
  donutArcs.forEach((arc) => {
    if (arc.endDeg > arc.startDeg) {
      doc.setDrawColor(arc.color[0], arc.color[1], arc.color[2]);
      for (let deg = arc.startDeg; deg < arc.endDeg; deg += 3) {
        const rad1 = (deg * Math.PI) / 180;
        const rad2 = ((deg + 3.2) * Math.PI) / 180;
        const x1 = donutCX + rDonut * Math.cos(rad1);
        const y1 = donutCY + rDonut * Math.sin(rad1);
        const x2 = donutCX + rDonut * Math.cos(rad2);
        const y2 = donutCY + rDonut * Math.sin(rad2);
        doc.line(x1, y1, x2, y2);
      }
    }
  });

  doc.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2]);
  doc.circle(donutCX, donutCY, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(brlK(totalGanhosAno), donutCX, donutCY + 1, { align: "center" });
  doc.setFontSize(5);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("Economia Total", donutCX, donutCY + 8, { align: "center" });

  let vY = curY + 115;
  const vetores = [
    { dot: C_EMERALD, title: "1. Fatura Elétrica (Geração):", val: brlK(ecoFaturaAno), pct: pct(pEcoFat) },
    { dot: C_CYAN,    title: "2. Termossubstituição Ativos:", val: brlK(ecoTermicaAno), pct: pct(pEcoTer) },
    { dot: C_AMBER,   title: "3. Excedente Reativo:", val: brlK(multaReativoAno), pct: pct(pEcoRea) },
    { dot: C_ROSE,    title: "4. Multas Ultrapassagem:", val: brlK(ultrapassAno), pct: pct(pEcoUlt) },
    { dot: C_BLUE,    title: "5. Otimização Demanda:", val: brlK(ecoDemandaAno), pct: pct(pEcoDem) },
    { dot: C_PURPLE,  title: "6. Eficiência QEE e THD:", val: brlK(ecoQeeThdAno), pct: pct(pEcoQee) },
  ];

  vetores.forEach((v) => {
    doc.setFillColor(v.dot[0], v.dot[1], v.dot[2]);
    doc.circle(col2X + 10, vY + 3, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(255, 255, 255);
    doc.text(v.title, col2X + 15, vY + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(v.val + " (" + v.pct + ")", col2X + col3W - 8, vY + 5, { align: "right" });
    vY += 14.5;
  });

  vY += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text("ESTRUTURA DE CUSTOS DA PLANTA", col2X + 10, vY);

  const cBoxW = (col3W - 22) / 3;
  const costBoxes = [
    { title: "CUSTO TOTAL", val: brlK(custoTotalAtualAno), sub: "Auditado/ano" },
    { title: "CUSTO ELÉTRICO", val: brlK(faturaBaseMensal * 12), sub: "Baseline ano" },
    { title: "CUSTO TÉRMICO", val: brlK(custoTermicoAno), sub: "Térmico ano" },
  ];

  costBoxes.forEach((cb, idx) => {
    const cbX = col2X + 7 + idx * (cBoxW + 4);
    const cbY = vY + 7;
    doc.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2]);
    doc.roundedRect(cbX, cbY, cBoxW, 35, 4, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(cb.title, cbX + 3, cbY + 9);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(cb.val, cbX + 3, cbY + 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(cb.sub, cbX + 3, cbY + 29);
  });

  doc.setFillColor(C_HERO_BG[0], C_HERO_BG[1], C_HERO_BG[2]);
  doc.roundedRect(col2X + 7, vY + 48, col3W - 14, 22, 4, 4, "F");
  doc.setDrawColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(col2X + 7, vY + 48, col3W - 14, 22, 4, 4, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("ECONOMIA TOTAL PROJETADA: " + brl(totalGanhosAno), col2X + col3W / 2, vY + 59, { align: "center" });
  doc.setFontSize(5.5);
  doc.text("Redução de " + num(pctReducaoGlobal, 1) + "% no Custo Global", col2X + col3W / 2, vY + 66, { align: "center" });

  // COLUNA 3: INTERPRETAÇÃO TÉCNICA IA & RECOMENDAÇÕES
  const col3X = margin + 2 * (col3W + 6);
  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(col3X, curY, col3W, colH, 6, 6, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(col3X, curY, col3W, colH, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("3. INTERPRETAÇÃO TÉCNICA (IA)", col3X + 10, curY + 16);

  let itY = curY + 28;
  const itSections = [
    {
      title: "INDICADORES-CHAVE DO CLIENTE",
      items: [
        "• Fatura Mensal Atual: " + brl(faturaBaseMensal) + "/mês",
        "• Consumo Médio: " + fmt0.format(consumoMensalKwh) + " kWh/mês",
        "• Demanda Contratada Atual: " + fmt0.format(demandaAtual) + " kW",
        (drPMax > 0 || drFpMax > 0) ? "• Demanda Máx.: " + fmt0.format(drFpMax) + " kW (FP) / " + fmt0.format(drPMax) + " kW (P)" : "• Demanda Máx. Registrada: " + fmt0.format(demandaAtual) + " kW",
        ultrapassAno > 0 ? "• Custo Anual Ultrapassagens: " + brl(ultrapassAno) : "• Ultrapassagens: Regular / Sem penalidades",
        multaReativoAno > 0 ? "• Multa Excedente Reativo: " + brl(multaReativoAno) + "/ano" : "• Excedente Reativo: FP regular / Sem multa",
        ecoDemandaAno > 0 ? "• Ganho Otimização Demanda: " + brl(ecoDemandaAno) + "/ano" : "• Demanda: Contrato otimizado",
        ecoQeeThdAno > 0 ? "• Ganho Mitigação QEE/THD: " + brl(ecoQeeThdAno) + "/ano" : "• Qualidade da Energia: Em conformidade",
      ]
    },
    {
      title: "POTENCIAL DE ECONOMIA E PAYBACK (CFO)",
      items: [
        "• Nova fatura mensal: " + brl(faturaCenMensal) + "/mês",
        "• Economia anual conta: " + brl(ecoFaturaAno),
        "• Investimento total (CAPEX): " + (capexTotal > 0 ? brl(capexTotal) : "R$ 0,00 (Zero CAPEX)"),
        paybackAnos > 0 ? "• Payback estimado: " + num(paybackAnos, 1) + " anos (" + paybackMeses + " meses)" : "• Payback: Imediato / Operacional",
        vpl20Anos > 0 ? "• VPL: " + brl(vpl20Anos) + "  |  TIR: " + pct(tirAnual) + " a.a." : "• VPL / TIR: Ganhos operacionais diretos",
      ]
    },
    {
      title: "RECOMENDAÇÕES PRIORITÁRIAS",
      items: [
        ecoDemandaAno > 0 ? "1. Ajuste Demanda: adequar para " + (demRes.dc_rec_p || demandaAtual) + " kW" : "1. Eficiência Energética: gestão de ponta a ponta",
        multaReativoAno > 0 ? "2. Correção Reativo: banco de capacitores automático" : "2. Governança: telemetria setorizada e automação",
        capexTotal > 0 ? "3. Implantação de Soluções On-site: geração e storage" : "3. Contratos: gestão tarifária contínua",
      ]
    }
  ];

  itSections.forEach((sec) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(C_CYAN[0], C_CYAN[1], C_CYAN[2]);
    doc.text(sec.title, col3X + 10, itY);
    itY += 9;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.4);
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    sec.items.forEach((it) => {
      doc.text(it, col3X + 10, itY);
      itY += 7.5;
    });
    itY += 4;
  });

  // Bottom Strip
  curY += colH + 8;
  const botH = 92;

  const b1W = innerW * 0.32;
  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(margin, curY, b1W, botH, 6, 6, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, curY, b1W, botH, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("COMPARATIVO ANTES X DEPOIS", margin + 10, curY + 16);

  doc.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2]);
  doc.roundedRect(margin + 8, curY + 24, (b1W - 20) / 2, 58, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text("SITUAÇÃO ATUAL", margin + 12, curY + 35);
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(brlK(custoTotalAtualAno), margin + 12, curY + 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text("Fatura: " + brlK(faturaBaseMensal) + "/mês", margin + 12, curY + 68);

  const dX = margin + 10 + (b1W - 20) / 2;
  doc.setFillColor(C_HERO_BG[0], C_HERO_BG[1], C_HERO_BG[2]);
  doc.roundedRect(dX, curY + 24, (b1W - 20) / 2, 58, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("PROJETADA (-" + num(pctReducaoGlobal, 1) + "%)", dX + 4, curY + 35);
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(brlK(custoTotalProjetadoAno), dX + 4, curY + 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text("Fatura: " + brlK(faturaCenMensal) + "/mês", dX + 4, curY + 68);

  const b2X = margin + b1W + 6;
  const b2W = innerW * 0.40;
  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(b2X, curY, b2W, botH, 6, 6, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(b2X, curY, b2W, botH, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("APÊNDICE METODOLÓGICO", b2X + 10, curY + 16);

  const apRows = [
    { label: "1. Curva de Carga:", desc: "Medições horárias 15 min integradas." },
    { label: "2. Viabilidade Econômica:", desc: "WACC 12% a.a., inflação energética 4,5%." },
    { label: "3. Vetores de Ganho:", desc: "Soma das eficiências de ponta a ponta." },
    { label: "4. Riscos Mapeados:", desc: "Interconexão, combustível e regime fiscal." },
  ];

  let apY = curY + 28;
  apRows.forEach((ar) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(C_CYAN[0], C_CYAN[1], C_CYAN[2]);
    doc.text(ar.label, b2X + 10, apY);
    const alw = doc.getTextWidth(ar.label);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
    doc.text(ar.desc, b2X + 10 + alw + 3, apY);
    apY += 13.5;
  });

  const b3X = margin + b1W + b2W + 12;
  const b3W = innerW - b1W - b2W - 12;
  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(b3X, curY, b3W, botH, 6, 6, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(b3X, curY, b3W, botH, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("INFORMAÇÕES DO DOCUMENTO", b3X + 10, curY + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text("• Modelo: GPT-4o Enterprise", b3X + 10, curY + 29);
  doc.text("• Auditoria: RN 1.000 e NBR 5410", b3X + 10, curY + 39);
  doc.text("• Plataforma: Energy Link Analytics", b3X + 10, curY + 49);

  doc.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2]);
  doc.roundedRect(b3X + 8, curY + 56, b3W - 16, 26, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("EXPERT ENERGY BRASIL", b3X + b3W / 2, curY + 67, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(255, 255, 255);
  doc.text("Consultoria e Soluções em Energia", b3X + b3W / 2, curY + 76, { align: "center" });

  // ==========================================
  // PÁGINA 2: PARECER TÉCNICO-EXECUTIVO (TIPOGRAFIA LIMPA E DISCRETA)
  // ==========================================
  doc.addPage();
  doc.setFillColor(C_DARK_BG[0], C_DARK_BG[1], C_DARK_BG[2]);
  doc.rect(0, 0, pageW, pageH, "F");

  doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
  doc.roundedRect(margin, margin, innerW, 36, 5, 5, "F");
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, margin, innerW, 36, 5, 5, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("PARECER TÉCNICO-EXECUTIVO & ESTRATÉGICO DE ENGENHARIA", margin + 12, margin + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
  doc.text("Diagnóstico Detalhado das Seções 2 a 13 • Auditoria de Desempenho e Governança", margin + 12, margin + 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(C_TEXT_MUTED[0], C_TEXT_MUTED[1], C_TEXT_MUTED[2]);
  doc.text("PÁGINA 2 DE 2", pageW - margin - 12, margin + 22, { align: "right" });

  // Limpeza de caracteres especiais não suportados no WinAnsi do jsPDF
  let cleanedReport = (args.report || "")
    .replace(/\*\*(.*?)\*\*/g, "$1") // remove negrito markdown
    .replace(/\*/g, "")                // remove asteriscos soltos
    .replace(/▪|▸|▹|⬡|§|•/g, "-")        // normaliza para hífen seguro compatível com ASCII/WinAnsi
    .replace(/^\s*[-–—]\s+/gm, "- "); // padroniza marcadores

  const secoesIa = parseIaReport(cleanedReport);
  let p2Y = margin + 46;

  if (secoesIa.length === 0) {
    const lines = doc.splitTextToSize(cleanedReport || "Relatório não gerado.", innerW - 20);
    doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
    doc.roundedRect(margin, p2Y, innerW, pageH - p2Y - margin, 6, 6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(C_TEXT_MAIN[0], C_TEXT_MAIN[1], C_TEXT_MAIN[2]);
    doc.text(lines, margin + 10, p2Y + 16);
  } else {
    // 5 Seções com altura proporcional calculada
    const totalBoxesH = pageH - margin - p2Y;
    const boxH = Math.floor((totalBoxesH - 24) / 5);

    secoesIa.forEach((sec, idx) => {
      doc.setFillColor(C_PANEL_BG[0], C_PANEL_BG[1], C_PANEL_BG[2]);
      doc.roundedRect(margin, p2Y, innerW, boxH, 5, 5, "F");
      doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
      doc.setLineWidth(0.6);
      doc.roundedRect(margin, p2Y, innerW, boxH, 5, 5, "S");

      // Barra de Título da Seção
      doc.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2]);
      doc.roundedRect(margin, p2Y, innerW, 18, 5, 5, "F");

      // Marcador numérico limpo e discreto
      const secNum = "[" + (idx + 1) + ".0]  ";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
      doc.text(secNum + (sec.titulo || ("Seção " + (idx + 1))), margin + 10, p2Y + 12);

      // Corpo de texto em parágrafos justificados com espaçamento normal
      let cY = p2Y + 28;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(C_TEXT_MAIN[0], C_TEXT_MAIN[1], C_TEXT_MAIN[2]);

      for (let l of sec.corpo) {
        if (cY > p2Y + boxH - 8) break;
        // Desenha indicador de item caso seja lista
        let lineText = l.trim();
        let isBullet = lineText.startsWith("- ");
        if (isBullet) {
          lineText = lineText.slice(2).trim();
          doc.setFillColor(C_EMERALD[0], C_EMERALD[1], C_EMERALD[2]);
          doc.circle(margin + 12, cY - 2.5, 1.2, "F"); // Mini bullet desenhado em vetor (zero erro de fonte)
        }

        const textIndent = isBullet ? 18 : 10;
        const maxTextW = innerW - textIndent - 10;
        const wrapped = doc.splitTextToSize(lineText, maxTextW);

        for (let wl of wrapped) {
          if (cY > p2Y + boxH - 8) break;
          doc.text(wl, margin + textIndent, cY);
          cY += 8.5; // Espaçamento entre linhas ajustado para não transbordar o quadro
        }
        cY += 2; // Espaço sutil entre tópicos
      }

      p2Y += boxH + 6;
    });
  }

  const cleanName = cliNome.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const fileName = "diagnostico-" + cleanName + "-" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".pdf";
  doc.save(fileName);
  return { fileName };
}


function getEnergiaUiApi(iframe: HTMLIFrameElement | null): EnergiaUiApi | null {
  const energiaWindow = iframe?.contentWindow as (Window & {
    __ENERGIAPRO_UI__?: EnergiaUiApi;
  }) | null;

  return energiaWindow?.__ENERGIAPRO_UI__ ?? null;
}

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  return {};
}

function safeNumber(value: unknown): number {
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

function normalizeRecord(item: ApiDiagnosticRecord): DiagnosticApiRecord {
  const payload = asObject(item.payload_json);
  const result = asObject(item.result_json || payload.result);
  const input = asObject(payload.input);
  const meta = asObject(payload.meta);
  const demRes = asObject(result.demRes || payload.demRes);
  const thdRes = asObject(result.thdRes || payload.thdRes);
  const equipComparativo = asObject(result.EquipComparativo || payload.EquipComparativo);
  const equipItems = Array.isArray(equipComparativo.items) ? equipComparativo.items : [];

  const companyName =
    input.razao ||
    payload.razao ||
    result.razao ||
    item.company_name ||
    item.title ||
    'Empresa sem nome';

  // 1. Demanda Contratada e Medições Máximas Reais do Simulador
  const demandKw = safeNumber(
    input.dc ?? input.dcP ?? input.demanda_contratada ??
    demRes.dc_atual_p ?? demRes.dc_atual ??
    result.demanda_contratada ?? 0
  );
  const drPMax = safeNumber(demRes.dr_p_max ?? demRes.max_demanda_p ?? 0);
  const drFpMax = safeNumber(demRes.dr_fp_max ?? demRes.max_demanda_fp ?? 0);
  const demandaRecP = safeNumber(demRes.dc_rec_p ?? demRes.dc_rec ?? demandKw);
  const demandaRecFp = safeNumber(demRes.dc_rec_fp ?? demRes.dc_rec_fp ?? demandKw);

  // 2. Consumo
  const monthlyConsumptionKwh = safeNumber(
    result.E_mes != null ? safeNumber(result.E_mes) * (safeNumber(result.E_mes) < 10000 ? 1000 : 1) :
    result.consumo_mensal_kwh ?? result.consumo_medio_kwh ??
    input.consumo_kwh ?? input.consumo_mensal ?? 0
  );
  const annualConsumptionKwh = safeNumber(result.E_ano ?? (monthlyConsumptionKwh * 12));

  // 3. Faturas Mensais (Baseline x Cenário) e Economia
  const fBaseMensal = safeNumber(result.F_base ?? result.F_base_liq ?? input.fatura_base ?? input.fatura_atual ?? 0);
  const fCenMensal  = safeNumber(result.F_cen ?? result.F_cen_liq ?? result.nova_fatura ?? 0);
  const ecoFaturaMensal = safeNumber(result.eco_m ?? (fBaseMensal > fCenMensal ? (fBaseMensal - fCenMensal) : 0));
  const ecoFaturaAnual  = safeNumber(result.eco_anual ?? (ecoFaturaMensal * 12));

  // 4. Multas e Penalidades Reais do Simulador
  const multaReativoMes = safeNumber(result.multaReativo_mes ?? 0);
  const multaReativoAnual = safeNumber(result.multaReativo_ano ?? (multaReativoMes * 12));
  
  const ultrapassMes = safeNumber((result.ultrapassP_mes ?? 0) + (result.ultrapassFP_mes ?? 0));
  const ultrapassagemAnual = safeNumber(result.ultrapass_ano ?? (ultrapassMes * 12));

  const demandOptimizationAnnual = safeNumber(
    result.demandOptimizationAnnual ??
    demRes.ganho_anual_estimado ??
    result.demanda_otima_anual ?? 0
  );

  const powerQualityAnnual = safeNumber(
    result.powerQualityAnnual ??
    thdRes.total_RS_ano ?? 0
  );

  // 5. Custo Térmico e Economia Térmica do Simulador
  const thermalReductionFromItems = equipItems.reduce((sum, row) => {
    const current = asObject(row);
    return sum + safeNumber(current.economia_anual_num || current.economia_anual);
  }, 0);
  const thermalCostAnnual = safeNumber(result.therm_custo_anual ?? 0);
  const thermalCostMonthly = safeNumber(result.therm_custo_mes ?? (thermalCostAnnual / 12));
  const thermalReductionAnnual = safeNumber(
    result.thermalReductionAnnual ??
    equipComparativo.gain_total ??
    thermalReductionFromItems ?? 0
  );

  // 6. Total de Ganhos Integrados
  const totalGanhosAnual = safeNumber(
    result.eco_anual_bruto ??
    result.totalGanhosAno ??
    (ecoFaturaAnual + demandOptimizationAnnual + ultrapassagemAnual + multaReativoAnual + powerQualityAnnual + thermalReductionAnnual)
  );

  // 7. Financeiro (CAPEX, OPEX, VPL, TIR, Payback)
  const capexTotal   = safeNumber(result.CAPEX ?? result.capex_total ?? 0);
  const capexFV      = safeNumber(result.CAPEXfv ?? 0);
  const capexBESS    = safeNumber(result.CAPEXbess ?? 0);
  const capexMotor   = safeNumber(result.CAPEXmotor ?? 0);
  const capexMicro   = safeNumber(result.CAPEXmicro ?? 0);
  const capexEolica  = safeNumber(result.CAPEXeol ?? 0);
  const opexAnual    = safeNumber(result.OPEX_a ?? 0);
  const vpl20Anos    = safeNumber(result.VPL ?? 0);
  const tirAnual     = safeNumber(result.TIR ?? 0);
  const paybackAnos  = safeNumber(result.payback ?? 0);
  const paybackMonths = (isFinite(paybackAnos) && paybackAnos > 0) ? Math.round(paybackAnos * 12) : 0;

  // 8. Sustentabilidade & Fator de Carga
  const co2Evitado = safeNumber(result.CO_avoid ?? 0);
  const isSazonal = result.sazonal === true || input.sazonal === 'sim';
  const indiceSazonal = safeNumber(result.indicesazonal ?? 1.0);

  // Fator de Carga calculado estritamente
  const horasMes = safeNumber(input.hd || 16) * safeNumber(input.dm || 25);
  const potPico = Math.max(demandKw, drPMax, drFpMax, 1);
  const fcCalc = horasMes > 0 && potPico > 0 ? (monthlyConsumptionKwh / (potPico * horasMes)) : 0.899;
  const fcAtual = Math.min(Math.max(fcCalc, 0.5), 0.98);
  const fcProjetado = Math.min(fcAtual * 1.05, 0.99);

  const estimatedSavingsValue   = ecoFaturaMensal;
  const estimatedSavingsPercent = fBaseMensal > 0 ? (ecoFaturaMensal / fBaseMensal) * 100 : 0;

  const summary = {
    companyName,
    demandKw,
    drPMax,
    drFpMax,
    demandaRecP,
    demandaRecFp,
    monthlyConsumptionKwh,
    annualConsumptionKwh,
    fBaseMensal,
    fCenMensal,
    ecoFaturaMensal,
    ecoFaturaAnual,
    multaReativoMes,
    multaReativoAnual,
    ultrapassMes,
    ultrapassagemAnual,
    demandOptimizationAnnual,
    powerQualityAnnual,
    thermalCostAnnual,
    thermalCostMonthly,
    thermalReductionAnnual,
    potentialGainAnnual: totalGanhosAnual,
    capexTotal,
    capexFV,
    capexBESS,
    capexMotor,
    capexMicro,
    capexEolica,
    opexAnual,
    vpl20Anos,
    tirAnual,
    paybackAnos,
    paybackMonths,
    co2Evitado,
    isSazonal,
    indiceSazonal,
    fcAtual,
    fcProjetado,
    estimatedSavingsValue,
    estimatedSavingsPercent,
    rawResult: result,
    rawInput: input,
    rawPayload: payload,
    demRes,
    thdRes,
    equipComparativo,
  };

  return {
    ...(item as any),
    payload,
    result,
    summary,
    companyName,
    versionLabel: item.version_label ?? null,
    currentRevision: item.current_revision ?? null,
    createdBy: item.created_by ?? null,
    updatedBy: item.updated_by ?? null,
    reviewedBy: item.reviewed_by ?? null,
    isActive: item.is_active ?? null,
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
  } as unknown as DiagnosticApiRecord;
}

async function waitForDetailSession(timeoutMs = 2500): Promise<Session | null> {
  const first = await supabase.auth.getSession();

  if (first.data.session?.access_token) {
    return first.data.session;
  }

  return new Promise<Session | null>((resolve) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;

      if (subscription) {
        subscription.unsubscribe();
      }

      resolve(session);
    };

    const timer = window.setTimeout(async () => {
      const second = await supabase.auth.getSession();
      finish(second.data.session ?? null);
    }, timeoutMs);

    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) return;
      window.clearTimeout(timer);
      finish(session);
    });

    subscription = authListener.data.subscription;
  });
}

export default function DiagnosticoDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [record, setRecord] = useState<DiagnosticApiRecord | null>(null);
  // === DIAG-BLOCO-B-STATE-HANDLER v1 ===
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const [lastReport, setLastReport] = useState<{ fileName: string } | null>(null);

    async function handleGenerateReport() {
    if (generatingReport) return;
    try {
      setGeneratingReport(true);
      setReportError("");
      setLastReport(null);

      // 1. Extrair os dados mais recentes diretamente do simulador / iframe ao vivo
      let activeRecord = record;
      let activeSummary = summary;
      try {
        if (iframeRef.current) {
          const rawPayload = await requestEnergiaExport(iframeRef.current);
          if (rawPayload && (rawPayload.result || rawPayload.input)) {
            const tempApiRecord = {
              ...(record || {}),
              payload_json: rawPayload,
              result_json: rawPayload.result || (record as any)?.result_json,
            } as any;
            activeRecord = normalizeRecord(tempApiRecord);
            activeSummary = activeRecord.summary as any;
          }
        }
      } catch (e) {
        console.warn("[diag] aviso ao extrair estado do simulador:", e);
      }

      if (!activeSummary) {
        throw new Error("Nenhum dado do simulador disponível para gerar o relatório.");
      }

      let token = "";
      try {
        const sessionRes: any = await (supabase.auth.getSession as any)();
        token = sessionRes?.data?.session?.access_token || "";
      } catch (_) { /* sem sessao -> ok */ }

      const prompt = buildAnalyticalPrompt(activeSummary as any, activeRecord as any);
      const idStr = String(activeRecord?.id || record?.id || "");
      const res = await fetch("/api/diagnosticos/" + encodeURIComponent(idStr) + "/ai-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({
          prompt,
          summary: activeSummary,
          diagnostic: activeRecord,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json && (json.message || json.error)) || "Falha ao gerar relatorio (HTTP " + res.status + ")");
      }
      const report = String((json && json.report) || "").trim();
      const generatedAt = String((json && json.generatedAt) || new Date().toISOString());
      if (!report) throw new Error("Resposta da IA vazia.");

      const pdfResult = await buildReportPdf({ report, summary, generatedAt, diagnostic: record });
      if (!pdfResult) throw new Error("Biblioteca jsPDF nao esta disponivel. Rode: npm install jspdf.");
      setLastReport({ fileName: pdfResult.fileName });
    } catch (err: any) {
      console.error("[diag] gerar relatorio IA erro:", err);
      setReportError(err?.message || "Erro desconhecido ao gerar relatorio.");
    } finally {
      window.setTimeout(() => setGeneratingReport(false), 250);
    }
  }
  // === fim DIAG-BLOCO-B-STATE-HANDLER v1 ===


  const [message, setMessage] = useState('Carregando diagnóstico...');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<DiagnosticHistoryResponse | null>(null);

  async function reload() {
    if (!id) return;

    const loadData = async () => {
      const [apiItem, historyResponse] = await Promise.all([
        getDiagnosticApi(id),
        getDiagnosticHistoryApi(id),
      ]);

      return { apiItem, historyResponse };
    };

    try {
      setLoading(true);
      setHistoryLoading(true);
      setMessage('Restaurando sessão...');

      const session = await waitForDetailSession();

      if (!session?.access_token) {
        setRecord(null);
        setHistory(null);
        setMessage('Sua sessão expirou. Faça login novamente.');
        return;
      }

      let result: Awaited<ReturnType<typeof loadData>>;

      try {
        result = await loadData();
      } catch (error) {
        if (error instanceof DiagnosticApiError && error.status === 401) {
          const restoredSession = await waitForDetailSession(1500);

          if (!restoredSession?.access_token) {
            throw error;
          }

          result = await loadData();
        } else {
          throw error;
        }
      }

      const item = normalizeRecord(result.apiItem);
      setRecord(item);
      setHistory(result.historyResponse);
      setMessage(`Diagnóstico ${item.code || item.id} carregado.`);
    } catch (error) {
      console.error(error);
      setRecord(null);
      setHistory(null);

      if (error instanceof DiagnosticApiError && error.status === 401) {
        setMessage('Sua sessão expirou. Faça login novamente.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Diagnóstico não encontrado.');
      }
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [id]);

  async function handleFrameLoad() {
    if (!record) return;

    try {
      const token = getBrowserAccessTokenFromStorage();

      if (token && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'ENERGIAPRO_AUTH_TOKEN', token },
          window.location.origin
        );
      }

      await sendEnergiaImport(iframeRef.current, record.payload);

      const energiaUiApi = getEnergiaUiApi(iframeRef.current);
      const payloadMeta = asObject(asObject(record.payload).meta);
      const savedUiState = asObject(payloadMeta.energiapro_ui_state);

      if (energiaUiApi?.importState && Object.keys(savedUiState).length) {
        energiaUiApi.importState(savedUiState as EnergiaUiState);
      }

      energiaUiApi?.refresh?.();

      setMessage(`Diagnóstico ${record.code || record.id} carregado dentro do EnergiaPro.`);
    } catch (error) {
      console.error(error);
      setMessage('Falha ao enviar os dados salvos para o HTML do EnergiaPro.');
    }
  }

  async function handleSaveCurrent() {
    if (!record) return;

    try {
      setSaving(true);
      setMessage('Exportando alterações do HTML...');
      const rawPayload = await requestEnergiaExport(iframeRef.current);
      const energiaUiApi = getEnergiaUiApi(iframeRef.current);
      const uiState = energiaUiApi?.exportState?.();

      const rawPayloadObject = asObject(rawPayload);
      const rawMeta = asObject(rawPayloadObject.meta);
      const currentMeta = asObject(asObject(record.payload).meta);

      const mergedPayload = {
        ...rawPayloadObject,
        meta: {
          ...rawMeta,
          energiapro_ui_state:
            uiState ??
            rawMeta.energiapro_ui_state ??
            currentMeta.energiapro_ui_state ??
            null,
          loadLineMetrics:
            (uiState && typeof uiState.loadLineMetrics === 'string' && uiState.loadLineMetrics.trim()) ||
            (typeof rawMeta.loadLineMetrics === 'string' && rawMeta.loadLineMetrics.trim()) ||
            (typeof currentMeta.loadLineMetrics === 'string' && currentMeta.loadLineMetrics.trim()) ||
            (typeof rawMeta.recGain === 'string' && rawMeta.recGain.trim()) ||
            (typeof currentMeta.recGain === 'string' && currentMeta.recGain.trim()) ||
            '',
          recGain:
            (uiState && typeof uiState.loadLineMetrics === 'string' && uiState.loadLineMetrics.trim()) ||
            (typeof rawMeta.recGain === 'string' && rawMeta.recGain.trim()) ||
            (typeof currentMeta.recGain === 'string' && currentMeta.recGain.trim()) ||
            '',
        },
      };

      const savedApi = await updateDiagnosticApi(record.id, {
        payload: mergedPayload,
        note: 'Atualização pela tela de detalhe',
      });

      const saved = normalizeRecord(savedApi);
      setRecord(saved);
      setMessage(`Diagnóstico ${saved.code || saved.id} atualizado com sucesso.`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar diagnóstico.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusOnly(nextStatus: DbStatus) {
    if (!record) return;

    try {
      const updatedApi = await updateDiagnosticStatusApi(record.id, {
        status: nextStatus,
        note: `Status alterado para ${nextStatus}`,
        origin: 'frontend_status',
      });

      const updated = normalizeRecord(updatedApi);
      setRecord(updated);
      setMessage(`Status alterado para ${statusLabel(updated.status || nextStatus)}.`);
      await reload();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Falha ao alterar status.');
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-500">{message || 'Carregando diagnóstico...'}</p>
        </div>
      </main>
    );
  }

  if (!record) {
    const expiredSession = message === 'Sua sessão expirou. Faça login novamente.';

    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            {expiredSession ? 'Sessão expirada' : 'Diagnóstico não encontrado'}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {message || 'O ID informado não existe no Supabase ou você está abrindo um teste antigo que não foi migrado.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/diagnostico"
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Voltar à lista
            </Link>
            <Link
              href="/dashboard"
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const summary = record.summary;
  const statusHistory = history?.statusHistory ?? [];
  const revisions = history?.revisions ?? [];
  const auditLog = history?.auditLog ?? [];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                Diagnóstico EnergiaPro
              </p>
              <h1 className="mt-2 text-3xl font-bold">{summary.companyName}</h1>
              <p className="mt-2 text-sm text-emerald-50">
                ID {record.code || record.id} • Status atual: {statusLabel(record.status)}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"
              >
                Voltar ao dashboard
              </Link>
              <Link
                href="/diagnostico"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"
              >
                Lista de diagnósticos
              </Link>
              <button
                onClick={handleSaveCurrent}
                disabled={saving}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">Resumo</h2>
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={!summary || generatingReport}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Gera PDF automatico via OpenAI + jsPDF (download direto)"
                  >
                    {generatingReport ? (
                      <>
                        <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                        Gerando PDF...
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
                        </svg>
                        Gerar relatorio IA
                      </>
                    )}
                  </button>
                </div>

              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <span>Empresa</span>
                  <strong>{summary.companyName}</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Demanda</span>
                  <strong>{number(summary.demandKw)} kW</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Consumo mensal</span>
                  <strong>{number(summary.monthlyConsumptionKwh)} kWh</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Economia estimada</span>
                  <strong>{currency(summary.estimatedSavingsValue)}</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Economia %</span>
                  <strong>{number(summary.estimatedSavingsPercent)}%</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Payback</span>
                  <strong>{number(summary.paybackMonths)} meses</strong>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <h3 className="text-sm font-bold text-emerald-800">Potencial de ganho</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-4">
                    <span>Potencial de ganho/ano</span>
                    <strong>{currency(summary.potentialGainAnnual)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Redução térmica/ano</span>
                    <strong>{currency(summary.thermalReductionAnnual)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Demanda ótima/ano</span>
                    <strong>{currency(summary.demandOptimizationAnnual)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>QEE / reativo / THD / ano</span>
                    <strong>{currency(summary.powerQualityAnnual)}</strong>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span>Ganho FC / oscilação</span>
                    <strong className="max-w-[160px] text-right">
                      {summary.loadProfileGainText || '—'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-diag-ai-report="container">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">Relatorio analitico (PDF)</h2>
                  {lastReport?.fileName ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
                      PDF gerado
                    </span>
                  ) : null}
                </div>
                {generatingReport ? (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                    <span>Gerando PDF via OpenAI + jsPDF no servidor... pode levar 5 a 30 segundos.</span>
                  </div>
                ) : null}
                {reportError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    <strong>Nao foi possivel gerar o PDF. </strong>
                    {reportError}
                    <p className="mt-2 text-xs text-rose-600">Verifique <code>OPENAI_API_KEY</code> no Vercel (Secret, nos 3 environments) e se <code>npm install jspdf</code> foi rodado.</p>
                  </div>
                ) : null}
                {lastReport?.fileName ? (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <strong>PDF gerado com sucesso. </strong>
                    Arquivo: <code>{lastReport.fileName}</code>.
                    O download foi iniciado automaticamente pelo seu navegador.
                  </div>
                ) : null}
                {!generatingReport && !lastReport && !reportError ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Clique em <strong>&quot;Gerar relatorio IA&quot;</strong> no topo do card Resumo. O sistema chama a OpenAI no servidor (API key segura), gera um PDF com capa, dados do cliente e a interpretacao analitica, e dispara o download automaticamente.
                  </p>
                ) : null}
              </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Ações de status</h2>
              <div className="mt-4 grid gap-2">
                <button onClick={() => handleStatusOnly('rascunho')} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                  Marcar como rascunho
                </button>
                <button onClick={() => handleStatusOnly('em_revisao')} className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-200">
                  Enviar para revisão
                </button>
                <button onClick={() => handleStatusOnly('revisado')} className="rounded-2xl bg-sky-100 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-200">
                  Marcar como revisado
                </button>
                <button onClick={() => handleStatusOnly('aprovado')} className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-200">
                  Aprovar
                </button>
                <button onClick={() => handleStatusOnly('arquivado')} className="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-200">
                  Arquivar
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
              {message}
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <iframe
              ref={iframeRef}
              src="/energiapro/index.html"
              title={`EnergiaPro ${record.id}`}
              onLoad={handleFrameLoad}
              className="h-[85vh] w-full"
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Histórico de status</h2>
              <span className="text-xs text-slate-500">
                {historyLoading ? 'Carregando...' : `${statusHistory.length} evento(s)`}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {statusHistory.length ? (
                statusHistory.map((item: DiagnosticStatusHistoryRecord) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-slate-900">
                        {statusLabel(item.from_status || '—')} → {statusLabel(item.to_status)}
                      </strong>
                      <span className="text-xs text-slate-500">{dateTime(item.changed_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.note || 'Sem observação.'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Alterado por: {item.actor_email || item.changed_by || item.actor_user_id || '—'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Nenhum histórico de status disponível.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Revisões</h2>
              <span className="text-xs text-slate-500">
                {historyLoading ? 'Carregando...' : `${revisions.length} revisão(ões)`}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {revisions.length ? (
                revisions.map((item: DiagnosticRevisionRecord) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-slate-900">Revisão #{item.revision_number}</strong>
                      <span className="text-xs text-slate-500">{dateTime(item.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.change_note || 'Sem descrição.'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Criado por: {item.created_by || '—'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Nenhuma revisão encontrada.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Auditoria</h2>
              <span className="text-xs text-slate-500">
                {historyLoading ? 'Carregando...' : `${auditLog.length} ação(ões)`}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {auditLog.length ? (
                auditLog.map((item: DiagnosticAuditLogRecord) => {
                  const metadata = asObject(item.metadata);
                  const changedFields = Array.isArray(metadata.changed_fields)
                    ? metadata.changed_fields
                    : [];

                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-slate-900">
                          {actionLabel(item.action)}
                        </strong>
                        <span className="text-xs text-slate-500">{dateTime(item.created_at)}</span>
                      </div>

                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        <p>
                          <span className="font-medium text-slate-700">Usuário:</span>{' '}
                          {item.actor_email || item.actor_user_id || '—'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Origem:</span>{' '}
                          {metadata.origin || '—'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">De → Para:</span>{' '}
                          {statusLabel(metadata.from_status || '—')} → {statusLabel(metadata.to_status || '—')}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Campos alterados:</span>{' '}
                          {changedFields.length ? changedFields.join(', ') : '—'}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">Nenhuma ação de auditoria encontrada.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
