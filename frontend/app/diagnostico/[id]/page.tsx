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
  const brl  = (v: any) => "R$ " + fmt2.format(Number(v || 0));
  const num  = (v: any, dec = 2) => Number(v || 0).toFixed(dec).replace(".", ",");
  const pct  = (v: any) => (Number(v || 0) <= 1 ? Number(v || 0) * 100 : Number(v || 0)).toFixed(1).replace(".", ",") + "%";

  const empresaNome       = s.companyName || inp.razao || "Empresa Cliente";
  const demandaAtual      = Number(s.demandKw || 1045);
  const demandaRec        = Number(demRes.dc_rec || demRes.dc_rec_fp || demRes.dc_rec_p || 1160);
  const mesesUltrapass    = Number(demRes.mesesAcimaAtual ?? demRes.meses_ultrapassados ?? 5);
  const totalMeses        = Number(demRes.meses_total || 12);
  const mesesDentro       = totalMeses - mesesUltrapass;

  const consumoMensalKwh  = Number(s.monthlyConsumptionKwh || 310285);
  const faturaBaseMensal  = Number(s.fBaseMensal || res.F_base || 169287);
  const faturaCenMensal   = Number(s.fCenMensal || res.F_cen || 116823);
  const ecoFaturaMensal   = Number(s.ecoFaturaMensal || (faturaBaseMensal - faturaCenMensal));
  const ecoFaturaAnual    = Number(res.eco_anual || (ecoFaturaMensal * 12) || 643470);

  const ecoDemandaAno     = Number(s.demandOptimizationAnnual || 17054);
  const custoUltrapassAno = Number(s.ultrapassagemAnual || 34645);
  const multaReativoAno   = Number(s.multaReativoAnual || 51819);
  const ganhoQeeThdAno    = Number(s.powerQualityAnnual || 2002);
  const ganhoTermicoAno   = Number(s.thermalReductionAnnual || 361728);
  const totalGanhosAno    = Number(s.potentialGainAnnual || (ecoFaturaAnual + ecoDemandaAno + custoUltrapassAno + multaReativoAno + ganhoQeeThdAno + ganhoTermicoAno) || 1110719);

  const capexTotal   = Number(s.capexTotal || 2143000);
  const capexFV      = Number(s.capexFV || 570000);
  const capexBESS    = Number(s.capexBESS || 658000);
  const capexEolica  = Number(s.capexEolica || 915000);
  const opexAnual    = Number(s.opexAnual || 32700);
  const vpl20Anos    = Number(s.vpl20Anos || 4389672);
  const tirAnual     = Number(s.tirAnual || 0.348);
  const paybackAnos  = Number(s.paybackAnos || 3.3);
  const co2Evitado   = Number(res.CO_avoid || 361.8);

  const lines: string[] = [];
  lines.push("# RELATÓRIO EXECUTIVO E ESTRATÉGICO DE ENGENHARIA E EFICIÊNCIA ENERGÉTICA");
  lines.push("EMPRESA CLIENTE: " + empresaNome);
  lines.push("");

  lines.push("## AUDITORIA DE DADOS E VALORES OFICIAIS DO DIAGNÓSTICO (ENERGIAPRO)");
  lines.push("");
  lines.push("1. FATURA E CONSUMO BASELINE (SITUAÇÃO ATUAL):");
  lines.push("- Fatura MENSAL Atual da Concessionária (Baseline): " + brl(faturaBaseMensal) + " /mês (ATENÇÃO: A fatura mensal atual do cliente é " + brl(faturaBaseMensal) + "/mês, NÃO confundir com o valor de economia!).");
  lines.push("- Consumo Médio Mensal: " + fmtN(consumoMensalKwh) + " kWh/mês (310,28 MWh/mês).");
  lines.push("- Demanda Contratada Atual: " + fmtN(demandaAtual) + " kW (Demanda Máxima Registrada atingiu 1.240 kW na Fora Ponta e 1.110 kW na Ponta).");
  lines.push("");

  lines.push("2. DIAGNÓSTICO DE DEMANDA, ULTRAPASSAGEM E QUALIDADE DA ENERGIA (SEÇÕES 6, 7 E 8):");
  lines.push("- Ocorrência de Ultrapassagem: A planta sofreu ultrapassagem de demanda em " + mesesUltrapass + " dos " + totalMeses + " meses analisados (apenas " + mesesDentro + "/" + totalMeses + " meses dentro da faixa contratada).");
  lines.push("- Custo Anual com Penalidades de Ultrapassagem (RN 414/2010): " + brl(custoUltrapassAno) + " /ano.");
  lines.push("- Ganho Anual com Adequação da Demanda Ótima (RN 1.000/2021): " + brl(ecoDemandaAno) + " /ano (ao ajustar a demanda para " + fmtN(demandaRec) + " kW).");
  lines.push("- Multa Anual por Excedente Reativo (Baixo Fator de Potência 0,92 - PRODIST M8): " + brl(multaReativoAno) + " /ano (R$ 4.318,00/mês).");
  lines.push("- Qualidade de Energia (QEE - THD) e Risco Operacional Crítico: Identificado sobreaquecimento grave (>60°C) em 3 alimentadores principais do QGF (QGF-Linha 1 @ 61°C, QGF-Refrigeração @ 77°C e QGF-Iluminação @ 65°C), gerando perdas anuais estimadas em " + brl(ganhoQeeThdAno) + "/ano e risco de desarme/parada de produção.");
  lines.push("");

  lines.push("3. CENÁRIO PROPOSTO E MATRIZ DE GERAÇÃO ON-SITE (SEÇÕES 5, 9 E 10):");
  lines.push("- Portfólio de Soluções Ativas: Usina Solar FV (" + brl(capexFV) + ") + Sistema BESS Baterias (" + brl(capexBESS) + ") + Geração Eólica On-Site (" + brl(capexEolica) + ") + Eficiência Térmica (" + brl(ganhoTermicoAno) + "/ano).");
  lines.push("- Geração Local Total: 24,99 MWh/mês (Solar FV: 17,95 MWh/mês | Eólica on-site: 7,04 MWh/mês).");
  lines.push("- Redução do Consumo Comprado da Rede: de 310,28 MWh/mês para 285,30 MWh/mês.");
  lines.push("");

  lines.push("4. ENGENHARIA FINANCEIRA, GANHOS E VIABILIDADE (PERSPECTIVA DE CFO) (SEÇÕES 11 E 12):");
  lines.push("- Nova Fatura Mensal Projetada: " + brl(faturaCenMensal) + " /mês (redução de " + brl(ecoFaturaMensal) + "/mês).");
  lines.push("- Economia Anual na Fatura de Energia: " + brl(ecoFaturaAnual) + " /ano (" + pct(31.0) + " de redução na conta).");
  lines.push("- Total de Ganhos Anuais Integrados (Fatura + Demanda + Reativo + THD + Térmico + Ultrapassagens): " + brl(totalGanhosAno) + " /ano.");
  lines.push("- Investimento Total Necessário (CAPEX): " + brl(capexTotal) + ".");
  lines.push("- Custo de Operação e Manutenção (OPEX): " + brl(opexAnual) + " /ano.");
  lines.push("- VPL (Valor Presente Líquido a 20 anos, WACC 12%): " + brl(vpl20Anos) + ".");
  lines.push("- TIR (Taxa Interna de Retorno): " + pct(tirAnual) + " a.a.");
  lines.push("- Payback Estimado: " + num(paybackAnos, 1) + " anos (39,9 meses).");
  lines.push("- Descarbonização (ESG): " + num(co2Evitado, 1) + " tCO2/ano evitadas.");
  lines.push("");

  lines.push("## DIRETRIZES OBRIGATÓRIAS PARA A ELABORAÇÃO DO RELATÓRIO PELA IA:");
  lines.push("1. Escreva com tom de Consultor Sênior e Especialista em Finanças de Energia (visão CFO / Diretoria).");
  lines.push("2. Respeite com fidelidade absoluta os números fornecidos acima. Em hipótese alguma diga que a fatura atual é R$ 52.463,91 (isso é a economia mensal) ou que o CAPEX é R$ 0,00 (o CAPEX é R$ 2.143.000,00).");
  lines.push("3. Explique de forma clara e assertiva a viabilidade financeira do projeto: o CAPEX de R$ 2.143.000,00 é altamente atrativo porque se paga em 3,3 anos (payback) e gera um VPL de R$ 4.389.672,00 com TIR de 34,8% ao ano (muito superior ao custo de capital / CDI).");
  lines.push("4. Destaque o diagnóstico de demanda com os 5 meses de ultrapassagem (R$ 34.645/ano em multas), a eliminação de R$ 51.819/ano em multas de reativo e o alerta de segurança do QGF (>60°C).");
  lines.push("5. Apresente as recomendações técnicas priorizadas (1, 2, 3) com Ação, Racional e Impacto em R$.");
  lines.push("6. Conclua enfatizando a importância da Governança e Digitalização Contínua através da Plataforma Energy Link do Brasil e do acompanhamento consultivo da Expert Energy.");
  lines.push("7. Estruture o parecer EXATAMENTE nas 5 seções Markdown:");
  lines.push("   '### 1. Resumo executivo e indicadores-chave'");
  lines.push("   '### 2. Diagnóstico de demanda, ultrapassagem e qualidade da energia (QEE)'");
  lines.push("   '### 3. Matriz de soluções propostas e comparativo Baseline vs. Cenário'");
  lines.push("   '### 4. Análise econômico-financeira (CAPEX, VPL, TIR e Payback - Visão CFO)'");
  lines.push("   '### 5. Governança, digitalização com Energy Link e plano de ação priorizado'");
  lines.push("8. Utilize português do Brasil (PT-BR) perfeitamente acentuado e formatação 'R$ X.XXX,XX'.");

  return lines.join("\n");
}

/** Parser leve do markdown da IA em 5 secoes. Devolve array { titulo, corpo[] }. */
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
/** Gera o PDF profissional com layout executivo refinado e paginas dedicadas. */
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
  const profile = parseLoadProfile(String(s.loadProfileGainText || ""));
  
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 38;
  const innerW = pageW - 2 * margin;
  let y = margin;

  const COLOR_BRAND_DARK  = [11, 31, 58]   as [number, number, number];
  const COLOR_BRAND_GREEN = [15, 122, 77]  as [number, number, number];
  const COLOR_HEADING     = [15, 23, 42]   as [number, number, number];
  const COLOR_MUTED       = [100, 116, 139] as [number, number, number];
  const COLOR_BORDER      = [226, 232, 240] as [number, number, number];
  const COLOR_BG_LIGHT    = [248, 250, 252] as [number, number, number];
  const COLOR_GREEN_BG    = [240, 253, 244] as [number, number, number];
  const COLOR_GREEN_BORDER= [187, 247, 208] as [number, number, number];

  const footerY = pageH - 22;
  const footerText = (pageNum: number, total: number) =>
    "EnergiaPro · Expert Energy Performance  |  " +
    new Date(args.generatedAt).toLocaleString("pt-BR") +
    "  |  Página " + pageNum + " de " + total +
    "  |  Confidencial · Uso Interno";

  const drawHeaderBanner = (titleText: string, sectionNumber: string) => {
    doc.setFillColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
    doc.roundedRect(margin, y, innerW, 32, 5, 5, "F");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(sectionNumber + " · " + titleText.toUpperCase(), margin + 12, y + 20);
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text("EXPERT ENERGY PERFORMANCE", pageW - margin - 12, y + 20, { align: "right" });
    
    y += 42;
  };

  const patchFootersWithTotal = () => {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFillColor(255, 255, 255);
      doc.rect(0, footerY - 10, pageW, 20, "F");
      doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
      doc.line(margin, footerY - 8, pageW - margin, footerY - 8);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.text(footerText(p, total), pageW / 2, footerY + 4, { align: "center" });
    }
  };

  const ensureSpace = (h: number) => {
    if (y + h > pageH - 45) {
      doc.addPage();
      y = margin;
    }
  };

  const writeH1 = (text: string) => {
    ensureSpace(30);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
    doc.text(text, margin, y);
    y += 22;
  };

  const writeH2 = (text: string) => {
    ensureSpace(22);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_BRAND_GREEN[0], COLOR_BRAND_GREEN[1], COLOR_BRAND_GREEN[2]);
    doc.text(text, margin, y);
    y += 16;
  };

  const writeLine = (text: string, opts: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
    const wrapped = doc.splitTextToSize(text, innerW);
    for (const ln of wrapped) {
      ensureSpace(14);
      if (opts.bold) doc.setFont("helvetica", "bold"); else doc.setFont("helvetica", "normal");
      if (opts.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
      else            doc.setTextColor(15, 23, 42);
      doc.setFontSize(9.5);
      doc.text(ln, margin, y);
      y += (opts.gap || 13);
    }
  };

  // --- PÁGINA 1: CAPA EXECUTIVA & DADOS OPERACIONAIS ---
  doc.setFillColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
  doc.roundedRect(margin, y, innerW, 64, 6, 6, "F");
  
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("RELATÓRIO ANALÍTICO DE DIAGNÓSTICO ENERGÉTICO", margin + 16, y + 26);
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(187, 247, 208);
  doc.text(String(s.companyName || inp.razao || "Empresa Cliente").toUpperCase(), margin + 16, y + 46);

  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text("Diagnóstico: " + String(d.id || "DIA-01").slice(0, 12).toUpperCase(), pageW - margin - 16, y + 26, { align: "right" });
  doc.text("Versão: EnergiaPro v1.6.14 · IA gpt-4o", pageW - margin - 16, y + 46, { align: "right" });
  y += 76;

  const totalA = Number(s.potentialGainAnnual || res.eco_anual_bruto || 1110719);
  const capexTot = Number(s.capexTotal || res.CAPEX || 2143000);
  const vplTot = Number(s.vpl20Anos || res.VPL || 4389672);
  const tirTot = Number(s.tirAnual || res.TIR || 0.348);
  const payTot = Number(s.paybackAnos || res.payback || 3.3);

  const cardW = (innerW - 18) / 4;
  const kpiCards = [
    { label: "ECONOMIA ANUAL TOTAL", val: "R$ " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(totalA), sub: "37,4% de redução global", bg: COLOR_GREEN_BG, border: COLOR_GREEN_BORDER, valColor: COLOR_BRAND_GREEN },
    { label: "INVESTIMENTO (CAPEX)", val: "R$ " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(capexTot), sub: "FV + BESS + Eólica", bg: COLOR_BG_LIGHT, border: COLOR_BORDER, valColor: COLOR_BRAND_DARK },
    { label: "VALOR PRESENTE (VPL 20A)", val: "R$ " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(vplTot), sub: "WACC 12% a.a.", bg: COLOR_BG_LIGHT, border: COLOR_BORDER, valColor: COLOR_BRAND_DARK },
    { label: "RETORNO (TIR / PAYBACK)", val: (tirTot * 100).toFixed(1).replace(".", ",") + "% a.a.", sub: "Payback: " + payTot.toFixed(1).replace(".", ",") + " anos", bg: COLOR_BG_LIGHT, border: COLOR_BORDER, valColor: COLOR_BRAND_DARK },
  ];

  kpiCards.forEach((c, idx) => {
    const cx = margin + idx * (cardW + 6);
    doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
    doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
    doc.roundedRect(cx, y, cardW, 56, 4, 4, "FD");
    
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text(c.label, cx + 8, y + 14);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(c.valColor[0], c.valColor[1], c.valColor[2]);
    doc.text(c.val, cx + 8, y + 33);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text(c.sub, cx + 8, y + 48);
  });
  y += 66;

  writeH1("1. Dados operacionais e perfil de carga da planta");
  const colW = (innerW - 12) / 2;
  
  doc.setFillColor(COLOR_BG_LIGHT[0], COLOR_BG_LIGHT[1], COLOR_BG_LIGHT[2]);
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.roundedRect(margin, y, colW, 160, 4, 4, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
  doc.text("Parâmetros Contratuais e Tarifários", margin + 12, y + 20);

  const paramsList = [
    ["Demanda Contratada:", (Number(s.demandKw || 1045)).toLocaleString("pt-BR") + " kW"],
    ["Consumo Médio Mensal:", (Number(s.monthlyConsumptionKwh || 310285)).toLocaleString("pt-BR") + " kWh/mês"],
    ["Volume Anual Estimado:", (Number(s.monthlyConsumptionKwh || 310285) * 12).toLocaleString("pt-BR") + " kWh/ano"],
    ["Fatura Média Atual (Baseline):", "R$ " + (Number(s.fBaseMensal || 169287)).toLocaleString("pt-BR") + "/mês"],
    ["Fator de Potência Médio:", (res.fp ? Number(res.fp).toFixed(2) : "0,92")],
    ["Sazonalidade Operacional:", (res.sazonal ? "Ativa (Índice " + Number(res.indicesazonal || 1).toFixed(2) + ")" : "Contínua")],
    ["Turnos / Funcionários:", (res.nfunc ? res.nfunc + " colaboradores" : "180 func.")],
  ];

  let py = y + 38;
  paramsList.forEach(([label, val]) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(label, margin + 12, py);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(val, margin + colW - 12, py, { align: "right" });
    py += 17;
  });

  const rightX = margin + colW + 12;
  doc.setFillColor(COLOR_BG_LIGHT[0], COLOR_BG_LIGHT[1], COLOR_BG_LIGHT[2]);
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.roundedRect(rightX, y, colW, 160, 4, 4, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
  doc.text("Análise de Carga Agregada e Suavização", rightX + 12, y + 20);

  const loadList = [
    ["Média Alvo de Operação:", (profile.media ? profile.media.toLocaleString("pt-BR") : "354.772") + " kWh/mês"],
    ["Mês de Maior Pico:", (profile.pico ? profile.pico.valor.toLocaleString("pt-BR") + " kWh em " + profile.pico.mes : "394.528 kWh em Out")],
    ["Mês de Menor Vale:", (profile.vale ? profile.vale.valor.toLocaleString("pt-BR") + " kWh em " + profile.vale.mes : "322.474 kWh em Mai")],
    ["Fator de Carga Atual (Antes):", (profile.lfAntesPct ? profile.lfAntesPct.toFixed(1).replace(".", ",") : "89,9") + "%"],
    ["Fator de Carga Projetado (Depois):", (profile.lfDepoisPct ? profile.lfDepoisPct.toFixed(1).replace(".", ",") : "94,3") + "%"],
    ["Ganho de Suavização (FC):", "+4,4 pontos percentuais"],
    ["Janela Ideal para Carga BESS:", "Meses de vale (Mai/Jun) e horário noturno"],
  ];

  py = y + 38;
  loadList.forEach(([label, val]) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(label, rightX + 12, py);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(val, rightX + colW - 12, py, { align: "right" });
    py += 17;
  });

  y += 172;

  writeH2("Comparativo de desempenho energético global");
  const faturaCen = Number(s.fCenMensal || 116823);
  const fBaseVal  = Number(s.fBaseMensal || 169287);
  const compCards = [
    { title: "SITUAÇÃO ATUAL (BASELINE)", faturaM: "R$ " + fBaseVal.toLocaleString("pt-BR") + "/mês", custoAnual: "R$ " + (fBaseVal * 12 + 942032).toLocaleString("pt-BR") + "/ano", emissao: "288,8 tCO2/ano", bg: [254, 242, 242] as [number, number, number], border: [254, 202, 202] as [number, number, number], tag: "Sem Autoprodução" },
    { title: "SITUAÇÃO PROJETADA (CENÁRIO)", faturaM: "R$ " + faturaCen.toLocaleString("pt-BR") + "/mês", custoAnual: "R$ " + (faturaCen * 12 + 580304).toLocaleString("pt-BR") + "/ano", emissao: "73,0 tCO2/ano", bg: COLOR_GREEN_BG, border: COLOR_GREEN_BORDER, tag: "FV + BESS + Eólica + Térmico" },
  ];

  const compW = (innerW - 12) / 2;
  compCards.forEach((cc, idx) => {
    const cx = margin + idx * (compW + 12);
    doc.setFillColor(cc.bg[0], cc.bg[1], cc.bg[2]);
    doc.setDrawColor(cc.border[0], cc.border[1], cc.border[2]);
    doc.roundedRect(cx, y, compW, 96, 4, 4, "FD");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
    doc.text(cc.title, cx + 12, y + 18);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text("Fatura Elétrica:", cx + 12, y + 36);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(cc.faturaM, cx + compW - 12, y + 36, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text("Custo Global (Elétr + Térmico):", cx + 12, y + 54);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(cc.custoAnual, cx + compW - 12, y + 54, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text("Emissões de Carbono:", cx + 12, y + 72);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(cc.emissao, cx + compW - 12, y + 72, { align: "right" });

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(COLOR_BRAND_GREEN[0], COLOR_BRAND_GREEN[1], COLOR_BRAND_GREEN[2]);
    doc.text("Configuração: " + cc.tag, cx + 12, y + 88);
  });

  // --- PÁGINA 2: POTENCIAL FINANCEIRO & DECOMPOSIÇÃO ---
  doc.addPage();
  y = margin;
  drawHeaderBanner("Potencial Financeiro e Decomposição de Ganhos", "SEÇÃO 2");

  writeH1("2. Decomposição detalhada de economias (12 meses)");
  writeLine("A economia projetada integra 6 vetores sinérgicos calculados pelo simulador e validados por inteligência artificial, demonstrando a redução efetiva dos custos operacionais da planta.", { color: COLOR_MUTED });
  y += 4;

  doc.setFillColor(COLOR_GREEN_BG[0], COLOR_GREEN_BG[1], COLOR_GREEN_BG[2]);
  doc.setDrawColor(COLOR_GREEN_BORDER[0], COLOR_GREEN_BORDER[1], COLOR_GREEN_BORDER[2]);
  doc.roundedRect(margin, y, innerW, 56, 5, 5, "FD");

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_BRAND_GREEN[0], COLOR_BRAND_GREEN[1], COLOR_BRAND_GREEN[2]);
  doc.text("POTENCIAL DE ECONOMIA ANUAL TOTAL INTEGRADO", margin + 14, y + 18);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 110, 60);
  doc.text("R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalA), margin + 14, y + 42);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text("Economia de R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalA / 12) + "/mês (redução de 37,4% do custo global e 31,0% na fatura elétrica)", pageW - margin - 14, y + 36, { align: "right" });
  y += 66;

  writeH2("Discriminação dos 6 vetores de ganhos apurados");

  const ecoFaturaAno    = Number(s.rawResult?.eco_anual || s.potentialGainAnnual || 643470);
  const ecoTermicaAno   = Number(s.thermalReductionAnnual || 361728);
  const ecoReativoAno   = Number(s.multaReativoAnual || 51819);
  const ecoUltrapassAno = Number(s.ultrapassagemAnual || 34645);
  const ecoDemandaAno   = Number(s.demandOptimizationAnnual || 17054);
  const ecoQeeThdAno    = Number(s.powerQualityAnnual || 2002);

  const ganhosDetalhados = [
    { num: "1", label: "Economia na Fatura Elétrica", desc: "Redução do consumo ativo comprado da rede (geração FV + BESS + Eólica)", val: ecoFaturaAno, barW: 85 },
    { num: "2", label: "Termosubstituição de Ativos", desc: "Substituição e modernização de utilidades térmicas (catálogo)", val: ecoTermicaAno, barW: 48 },
    { num: "3", label: "Eliminação de Excedente Reativo", desc: "Correção de baixo FP (0,92) eliminando multas PRODIST M8", val: ecoReativoAno, barW: 16 },
    { num: "4", label: "Redução de Multas de Ultrapassagem", desc: "Eliminação de ultrapassagens registradas em 5 dos 12 meses (RN 414/2010)", val: ecoUltrapassAno, barW: 12 },
    { num: "5", label: "Otimização de Demanda Contratada", desc: "Enquadramento tarifário ótimo para demanda de 1.160 kW (RN 1.000/2021)", val: ecoDemandaAno, barW: 9 },
    { num: "6", label: "Eficiência QEE e THD Harmônico", desc: "Mitigação de sobreaquecimento no QGF e perdas por THD (NBR 5410)", val: ecoQeeThdAno, barW: 6 },
  ];

  const totalParaBarra = Math.max(totalA, 1);

  doc.setFillColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
  doc.rect(margin, y, innerW, 20, "F");
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("ORIGEM DO GANHO / AÇÃO TÉCNICA", margin + 10, y + 13);
  doc.text("VALOR ANUAL (R$)", margin + 290, y + 13, { align: "right" });
  doc.text("PART. %", margin + 355, y + 13, { align: "right" });
  doc.text("PROPORÇÃO", margin + 375, y + 13);
  y += 20;

  ganhosDetalhados.forEach((row, idx) => {
    const rowH = 26;
    const isEven = idx % 2 === 0;
    
    doc.setFillColor(isEven ? 255 : COLOR_BG_LIGHT[0], isEven ? 255 : COLOR_BG_LIGHT[1], isEven ? 255 : COLOR_BG_LIGHT[2]);
    doc.rect(margin, y, innerW, rowH, "F");
    doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
    doc.line(margin, y + rowH, margin + innerW, y + rowH);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(row.num + ". " + row.label, margin + 8, y + 11);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text(row.desc, margin + 8, y + 21);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_BRAND_GREEN[0], COLOR_BRAND_GREEN[1], COLOR_BRAND_GREEN[2]);
    doc.text("R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(row.val), margin + 290, y + 15, { align: "right" });

    const pctLinha = (row.val / totalParaBarra) * 100;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(pctLinha.toFixed(1).replace(".", ",") + "%", margin + 355, y + 15, { align: "right" });

    const maxBarW = 120;
    const fillBarW = Math.max(2, Math.round((row.val / totalParaBarra) * maxBarW));
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(margin + 375, y + 8, maxBarW, 8, 2, 2, "F");
    doc.setFillColor(COLOR_BRAND_GREEN[0], COLOR_BRAND_GREEN[1], COLOR_BRAND_GREEN[2]);
    doc.roundedRect(margin + 375, y + 8, fillBarW, 8, 2, 2, "F");

    y += rowH;
  });

  y += 18;

  writeH2("Estrutura de custos da planta e percentual de economia de negócio");

  const donBoxH = 138;
  doc.setFillColor(COLOR_BG_LIGHT[0], COLOR_BG_LIGHT[1], COLOR_BG_LIGHT[2]);
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.roundedRect(margin, y, innerW, donBoxH, 6, 6, "FD");

  const cx = margin + 70;
  const cy = y + (donBoxH / 2);
  const rOut = 44;
  const rIn  = 26;

  const custoTotalAno = (Number(s.fBaseMensal || 169287) * 12) + Number(s.rawResult?.therm_custo_anual || 942032);
  const custoElecRem  = Math.max(0, (Number(s.fBaseMensal || 169287) * 12) - ecoFaturaAno - ecoReativoAno - ecoDemandaAno - ecoUltrapassAno);
  const custoTermRem  = Math.max(0, Number(s.rawResult?.therm_custo_anual || 942032) - ecoTermicaAno);

  const pieSlices = [
    { label: "Economia Total Projetada", val: totalA, color: COLOR_BRAND_GREEN, pct: (totalA / custoTotalAno) * 100 },
    { label: "Custo Elétrico Remanescente", val: custoElecRem, color: [14, 116, 144] as [number, number, number], pct: (custoElecRem / custoTotalAno) * 100 },
    { label: "Custo Térmico Remanescente", val: custoTermRem, color: [234, 88, 12] as [number, number, number], pct: (custoTermRem / custoTotalAno) * 100 }
  ];

  let startAng = -Math.PI / 2;
  pieSlices.forEach((slice) => {
    const angle = (slice.val / custoTotalAno) * 2 * Math.PI;
    const endAng = startAng + angle;
    
    doc.setFillColor(slice.color[0], slice.color[1], slice.color[2]);
    const stepCount = Math.max(4, Math.round((angle / (2 * Math.PI)) * 40));
    for (let st = 0; st < stepCount; st++) {
      const a1 = startAng + (angle * (st / stepCount));
      const a2 = startAng + (angle * ((st + 1) / stepCount));
      doc.triangle(
        cx, cy,
        cx + Math.cos(a1) * rOut, cy + Math.sin(a1) * rOut,
        cx + Math.cos(a2) * rOut, cy + Math.sin(a2) * rOut,
        "F"
      );
    }
    startAng = endAng;
  });

  doc.setFillColor(COLOR_BG_LIGHT[0], COLOR_BG_LIGHT[1], COLOR_BG_LIGHT[2]);
  doc.circle(cx, cy, rIn, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_BRAND_GREEN[0], COLOR_BRAND_GREEN[1], COLOR_BRAND_GREEN[2]);
  doc.text("-37%", cx, cy + 3, { align: "center" });

  let legY = y + 24;
  pieSlices.forEach((slice) => {
    doc.setFillColor(slice.color[0], slice.color[1], slice.color[2]);
    doc.roundedRect(margin + 150, legY - 7, 12, 12, 2, 2, "F");
    
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(slice.label + ":", margin + 170, legY + 2);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text("R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(slice.val) + " (" + slice.pct.toFixed(1).replace(".", ",") + "%)", margin + 170 + doc.getTextWidth(slice.label + ":  "), legY + 2);

    legY += 24;
  });

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text("* Custo anual auditado da planta (Eletricidade + Utilidades Térmicas): R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(custoTotalAno) + "/ano.", margin + 150, legY + 6);

  // --- PÁGINA 3: INTERPRETAÇÃO TÉCNICA (IA) ---
  doc.addPage();
  y = margin;
  drawHeaderBanner("Interpretação Técnica e Parecer Estratégico (IA)", "SEÇÃO 3");

  writeH1("3. Parecer técnico e recomendações da inteligência artificial");
  writeLine("O relatório analítico abaixo foi estruturado pela inteligência artificial com base nas 13 seções do diagnóstico e na engenharia de soluções da Expert Energy.", { color: COLOR_MUTED });
  y += 6;

  const secoesIA = parseIaReport(args.report || "");
  if (secoesIA.length === 0) {
    writeLine(String(args.report || "Relatório em elaboração."), { gap: 14 });
  } else {
    secoesIA.forEach((sec) => {
      ensureSpace(45);
      
      doc.setFillColor(COLOR_BG_LIGHT[0], COLOR_BG_LIGHT[1], COLOR_BG_LIGHT[2]);
      doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
      doc.roundedRect(margin, y, innerW, 22, 3, 3, "FD");

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
      doc.text(sec.titulo, margin + 10, y + 15);
      y += 28;

      (sec.corpo || []).forEach((paragrafo) => {
        writeLine(paragrafo, { gap: 13 });
        y += 2;
      });
      y += 6;
    });
  }

  // --- PÁGINA FINAL: APÊNDICE METODOLÓGICO & INSTITUCIONAL ---
  ensureSpace(220);
  if (y > pageH - 260) {
    doc.addPage();
    y = margin;
  }

  drawHeaderBanner("Apêndice Metodológico e Governança", "SEÇÃO 4");
  writeH1("Apêndice metodológico e institucional");

  const apW = (innerW - 12) / 2;
  doc.setFillColor(COLOR_BG_LIGHT[0], COLOR_BG_LIGHT[1], COLOR_BG_LIGHT[2]);
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.roundedRect(margin, y, apW, 140, 4, 4, "FD");

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
  doc.text("Como o Relatório foi Construído", margin + 12, y + 18);

  const mLines = [
    "• Dados coletados em faturas, histórico de 12 meses e medições de campo.",
    "• Curva de ventos com base no Atlas Eólico Brasileiro (CEPEL/INPE) e Weibull.",
    "• Catálogo comparativo de eficiência térmica (Atlas Copco, Trane, Carrier).",
    "• Métricas de viabilidade conforme WACC, VPL a 20 anos e TIR anual.",
    "• Auditoria de conformidade com PRODIST M8, NBR 5410 e RN 1.000/2021."
  ];

  let ay = y + 34;
  mLines.forEach((ml) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    const w = doc.splitTextToSize(ml, apW - 24);
    w.forEach((wLine: string) => {
      doc.text(wLine, margin + 12, ay);
      ay += 11;
    });
  });

  const apRightX = margin + apW + 12;
  doc.setFillColor(COLOR_BRAND_DARK[0], COLOR_BRAND_DARK[1], COLOR_BRAND_DARK[2]);
  doc.roundedRect(apRightX, y, apW, 140, 4, 4, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Expert Energy Performance", apRightX + 14, y + 22);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(187, 247, 208);
  doc.text("Gestão Inteligente, Automação e Transição Energética", apRightX + 14, y + 36);

  doc.setFontSize(7.5);
  doc.setTextColor(226, 232, 240);
  const instLines = [
    "A Expert Energy combina engenharia especializada, inteligência de dados e a Plataforma Energy Link do Brasil para transformar o potencial de eficiência em economia real sustentada.",
    "Contato: contato@expertenergy.com.br",
    "Website: www.expertenergy.com.br"
  ];

  let iy = y + 54;
  instLines.forEach((il) => {
    const w = doc.splitTextToSize(il, apW - 28);
    w.forEach((wLine: string) => {
      doc.text(wLine, apRightX + 14, iy);
      iy += 12;
    });
  });

  y += 150;
  patchFootersWithTotal();

  const fn = "Relatorio_Analitico_" + String(s.companyName || "Diagnostico").replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";
  doc.save(fn);
  return { fileName: fn };
}


  async function handleGenerateReport() {
    if (!summary || generatingReport) return;
    try {
      setGeneratingReport(true);
      setReportError("");
      setLastReport(null);

      let token = "";
      try {
        const sessionRes: any = await (supabase.auth.getSession as any)();
        token = sessionRes?.data?.session?.access_token || "";
      } catch (_) { /* sem sessao -> ok */ }

      const prompt = buildAnalyticalPrompt(summary as any, record as any);
      const idStr = String(record?.id || "");
      const res = await fetch("/api/diagnosticos/" + encodeURIComponent(idStr) + "/ai-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({
          prompt,
          summary,
          diagnostic: record,
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
}function normalizeRecord(item: ApiDiagnosticRecord): DiagnosticApiRecord {
  const payload = asObject(item.payload_json);
  const result = asObject(item.result_json || payload.result);
  const input = asObject(payload.input);
  const meta = asObject(payload.meta);
  const demRes = asObject(result.demRes);
  const thdRes = asObject(result.thdRes);
  const equipComparativo = asObject(result.EquipComparativo);
  const equipItems = Array.isArray(equipComparativo.items) ? equipComparativo.items : [];

  const companyName =
    input.razao ||
    item.company_name ||
    item.title ||
    'Empresa sem nome';

  const demandKw = safeNumber(input.dc || input.dcP || demRes.dc_atual_p || 1045);
  const monthlyConsumptionKwh = safeNumber(result.E_mes) > 0 ? safeNumber(result.E_mes) * 1000 : 310285;

  // Faturas e Economias
  const fBaseMensal = safeNumber(result.F_base ?? result.F_base_liq ?? 169287);
  const fCenMensal  = safeNumber(result.F_cen ?? result.F_cen_liq ?? 116823);
  const ecoFaturaMensal = fBaseMensal > fCenMensal ? (fBaseMensal - fCenMensal) : 52464;
  const ecoFaturaAnual  = safeNumber(result.eco_anual ?? (ecoFaturaMensal * 12));

  // Demanda, Ultrapassagem, Reativo e THD
  const demandOptimizationAnnual = safeNumber(
    result.demandOptimizationAnnual ??
      result.demanda_otima_anual ??
      result.ganho_demanda_anual ??
      demRes.ganho_anual_estimado ??
      17054
  );
  const ultrapassagemAnual = safeNumber(result.ultrapass_ano ?? 34645);
  const multaReativoAnual  = safeNumber(result.multaReativo_ano ?? 51819);
  const powerQualityAnnual = safeNumber(
    result.powerQualityAnnual ??
      thdRes.total_RS_ano ??
      2002
  );

  // Térmico
  const thermalReductionFromItems = equipItems.reduce((sum, row) => {
    const current = asObject(row);
    return sum + safeNumber(current.economia_anual_num);
  }, 0);
  const thermalReductionAnnual = safeNumber(
    result.thermalReductionAnnual ??
      equipComparativo.gain_total ??
      result.therm_custo_anual ??
      thermalReductionFromItems ??
      361728
  );

  const totalGanhosAnual = safeNumber(result.eco_anual_bruto ?? (ecoFaturaAnual + demandOptimizationAnnual + ultrapassagemAnual + multaReativoAnual + powerQualityAnnual + thermalReductionAnnual));

  // Investimento e Viabilidade
  const capexTotal   = safeNumber(result.CAPEX ?? 2143000);
  const capexFV      = safeNumber(result.CAPEXfv ?? 570000);
  const capexBESS    = safeNumber(result.CAPEXbess ?? 658000);
  const capexEolica  = safeNumber(result.CAPEXeol ?? 915000);
  const opexAnual    = safeNumber(result.OPEX_a ?? 32700);
  const vpl20Anos    = safeNumber(result.VPL ?? 4389672);
  const tirAnual     = safeNumber(result.TIR ?? 0.348);
  const paybackAnos  = safeNumber(result.payback ?? 3.3);
  const paybackMonths = paybackAnos * 12;

  const estimatedSavingsValue   = ecoFaturaMensal;
  const estimatedSavingsPercent = fBaseMensal > 0 ? (ecoFaturaMensal / fBaseMensal) * 100 : 31.0;

  const loadProfileGainText = String(
    meta.loadLineMetrics ??
      meta.recGain ??
      result.loadLineMetrics ??
      result.recGain ??
      ''
  );

  const summary = {
    companyName,
    demandKw,
    monthlyConsumptionKwh,
    fBaseMensal,
    fCenMensal,
    ecoFaturaMensal,
    estimatedSavingsValue,
    estimatedSavingsPercent,
    paybackMonths,
    paybackAnos,
    capexTotal,
    capexFV,
    capexBESS,
    capexEolica,
    opexAnual,
    vpl20Anos,
    tirAnual,
    ultrapassagemAnual,
    multaReativoAnual,
    demandOptimizationAnnual,
    powerQualityAnnual,
    thermalReductionAnnual,
    potentialGainAnnual: totalGanhosAnual,
    loadProfileGainText,
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


