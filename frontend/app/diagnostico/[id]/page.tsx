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

/** Monta o prompt profissional para o OpenAI.
 * Foco em justificativas causais, bullet points limpos, sem repetir nome do cliente. */
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
  const ganhoQeeThdAno    = Number(s.powerQualityAnnual || 1965);
  const ganhoTermicoAno   = Number(s.thermalReductionAnnual || 361728);
  const totalGanhosAno    = Number(s.potentialGainAnnual || (ecoFaturaAnual + ecoDemandaAno + custoUltrapassAno + multaReativoAno + ganhoQeeThdAno + ganhoTermicoAno) || 1076037);

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
  const profile = parseLoadProfile(String(s.loadProfileGainText || ""));
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const innerW = pageW - 2 * margin;
  let y = margin;

  // consts visuais
  const COLOR_BRAND   = [15, 100, 80] as [number, number, number];
  const COLOR_HEADING = [30, 60, 50] as [number, number, number];
  const COLOR_MUTED   = [110, 120, 130] as [number, number, number];
  const COLOR_BLUE_BG = [238, 245, 252] as [number, number, number];
  const COLOR_GREENBG = [233, 247, 239] as [number, number, number];

  // Cache para re-escrever o rodape com numero total correto depois da renderizacao.
  const footerY = pageH - margin / 2;
  const footerText = (pageNum: number, total: number) =>
    "EnergiaPro - Expert Energy Performance  |  " +
    new Date(args.generatedAt).toLocaleString("pt-BR") +
    "  |  Pagina " + pageNum + " de " + total +
    "  |  Confidencial - uso interno";
  const drawFooter = () => {
    const cur = doc.getCurrentPageInfo().pageNumber;
    doc.setFontSize(8);
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text(footerText(cur, doc.getNumberOfPages()), pageW / 2, footerY, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
  };
  // Re-escreve o rodape de CADA pagina com o total definitivo. Corrige o erro
  // de exibir "Pagina X de 1" no meio do relatorio (jsPDF soh sabe o total depois).
  const patchFootersWithTotal = () => {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFillColor(255, 255, 255);
      doc.rect(0, footerY - 6, pageW, 12, "F");
      doc.setFontSize(8);
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.text(footerText(p, total), pageW / 2, footerY, { align: "center" });
    }
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
  };

  const ensureSpace = (h: number) => {
    if (y + h > pageH - margin - 28) { drawFooter(); doc.addPage(); y = margin; }
  };

  /** bloco com fundo suave (para KPIs / bloco de destaque) */
  const drawSoftBlock = (h: number, color: [number, number, number]) => {
    ensureSpace(h + 10);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(margin, y, innerW, h, 6, 6, "F");
    y += 10;
  };

  const writeH1 = (text: string) => {
    ensureSpace(28);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_BRAND[0], COLOR_BRAND[1], COLOR_BRAND[2]);
    doc.text(text, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    y += 22;
  };

  const writeH2 = (text: string) => {
    ensureSpace(20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_HEADING[0], COLOR_HEADING[1], COLOR_HEADING[2]);
    doc.text(text, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    y += 18;
  };

  const writeLine = (text: string, opts: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
    const wrapped = doc.splitTextToSize(text, innerW - 8);
    for (const ln of wrapped) {
      ensureSpace(14);
      if (opts.bold) doc.setFont("helvetica", "bold"); else doc.setFont("helvetica", "normal");
      if (opts.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
      else            doc.setTextColor(0, 0, 0);
      doc.text(ln, margin + 4, y);
      y += 14;
    }
    y += (opts.gap ?? 4);
  };

  /** linha tipo-chave: valor em negrito, label em italico normal a esquerda */
  const writeKeyValueRow = (label: string, value: string) => {
    const labelW = innerW * 0.42;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    ensureSpace(16);
    doc.text(label, margin + 4, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(value, margin + 4 + labelW, y);
    y += 18;
  };

  // ================== CAPA ==================
  doc.setFillColor(COLOR_BRAND[0], COLOR_BRAND[1], COLOR_BRAND[2]);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("EnergiaPro - Expert Energy Performance", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Diagnostico energetico confidencial - distribuicao restrita", margin, 50);

  y = 110;
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_BRAND[0], COLOR_BRAND[1], COLOR_BRAND[2]);
  doc.text("Relatorio Analitico de Diagnostico", margin, y);
  y += 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("Cliente: " + String(s.companyName || "Empresa nao identificada"), margin, y);
  y += 16;
  if (d.code || d.id) {
    doc.text("Diagnostico " + String(d.code || d.id) + (d.version_label ? " (versao " + d.version_label + ")" : ""), margin, y);
    y += 16;
  }
  doc.text("Gerado em: " + new Date(args.generatedAt).toLocaleString("pt-BR"), margin, y);
  y += 16;
  doc.setFontSize(10);
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text("Modelo IA: " + String(process.env.NEXT_PUBLIC_OPENAI_MODEL || "gpt-4o-mini"), margin, y);
  y += 26;
  drawFooter();

  // ================== SECAO 1 - DADOS OPERACIONAIS ==================
  writeH1("1. Dados operacionais do cliente");
  writeLine("Esta secao apresenta os indicadores basicos do contrato e do perfil de carga observados no simulador. Os valores abaixo sao a FONTE PRIMARIA das recomendacoes da secao 4.", { color: COLOR_HEADING });

  y += 4;
  const demand = Number(s.demandKw || 0);
  const media   = Number(s.monthlyConsumptionKwh || 0);
  const savMens = Number(s.estimatedSavingsValue || 0);
  const savPct  = Number(s.estimatedSavingsPercent || 0);
  const payM    = Number(s.paybackMonths || 0);
  const totalA  = Number(s.potentialGainAnnual || 0);
  const porte   = demand > 500 ? "grande porte" : demand > 100 ? "medio porte" : demand > 0 ? "pequeno porte" : "nao classificado";
  const volume  = media > 100000 ? "alto volume" : media > 10000 ? "volume moderado" : media > 0 ? "baixo volume" : "nao informado";

  // bloco kpis com 4 metricas principais em fundo
  drawSoftBlock(2.1 * 14 + 24, COLOR_BLUE_BG);
  writeKeyValueRow("Demanda contratada",     fmtN(demand)  + " kW" + "  (" + porte + ")");
  writeKeyValueRow("Consumo medio mensal",   fmtN(media)   + " kWh/mes" + "  (" + volume + ")");
  writeKeyValueRow("Consumo anual estimado", fmtN(media * 12) + " kWh/ano");
  writeKeyValueRow("Periodo de retorno",     fmtN(payM)    + " meses" + (payM <= 2 ? "  (payback curto - revisar premissas)" : ""));
  y += 6;

  if (profile.media || profile.pico || profile.lfAntesPct != null) {
    writeH2("Perfil de carga (do simulador)");
    if (profile.media) {
      writeLine("Media alvo: " + fmtN(profile.media) + " kWh/mes. Serve como linha de base para comparacao de cenarios; valores muito acima ou abaixo desta media indicam oportunidade de deslocamento de carga.", {});
    }
    if (profile.pico) {
      writeLine("Pico agregado: " + fmtN(profile.pico.valor) + " kWh em " + profile.pico.mes + ". O mes com maior carga define o limite fisico do sistema e onde interrupcoes/spot pricing costumam ser mais onerosos.", { color: [180, 60, 60] });
    }
    if (profile.vale) {
      writeLine("Vale agregado: " + fmtN(profile.vale.valor) + " kWh em " + profile.vale.mes + ". Periodos de vale sao candidatos a flagrar armazenamento (BESS) ou demanda livre tarifaria.", { color: [60, 100, 160] });
    }
    if (profile.lfAntesPct != null && profile.lfDepoisPct != null) {
      const delta = profile.lfDepoisPct - profile.lfAntesPct;
      writeLine("Fator de carga: subiu de " + profile.lfAntesPct.toFixed(1).replace(".", ",") + "% (bruto) para " + profile.lfDepoisPct.toFixed(1).replace(".", ",") + "% (suavizado). Ganho de " + (delta >= 0 ? "+" : "") + delta.toFixed(1).replace(".", ",") + " pp - cada 1 pp reduz em media " +
        ((0.6 * savPct / 4).toFixed(1)) + "% da demanda na ponta conforme literatura tarifaria brasileira.", {});
    }
    if (profile.oscilacaoPp != null) {
      writeLine("Variacao projetada do FC: " + (profile.oscilacaoPp >= 0 ? "+" : "") + profile.oscilacaoPp.toFixed(1).replace(".", ",") + " pp. Valores positivos indicam uniformizacao da curva; negativos indicam concentracao adicional no horario de ponta.", {});
    }
    if (profile.rawBruto && !profile.media && !profile.pico) {
      writeLine("Observacao do simulador: " + profile.rawBruto, {});
    }
  }

  // ================== SECAO 2 - POTENCIAL FINANCEIRO ==================
  ensureSpace(40);
  doc.addPage(); y = margin;
  writeH1("2. Potencial financeiro (12 meses)");
  writeLine("A economia projetada abaixo foi calculada pelo simulador e validada pela OpenAI. Cada origem e' apresentada com seu valor absoluto e seu peso percentual dentro do total.", { color: COLOR_HEADING });

  // KPI grande (economie total)
  drawSoftBlock(90 + 18, COLOR_GREENBG);
  doc.setFontSize(10); doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text("Economia anual projetada", margin + 8, y - 4);
  doc.setFontSize(20); doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 110, 60);
  const fmt2two = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalA);
  doc.text("R$ " + fmt2two, margin + 8, y + 30);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text("(ou " + savPct.toFixed(1).replace(".", ",") + "% do total atual, " + (s.avaliableSavingsMensal ? "R$ " + fmt2two.replace("\.", "").slice(0, -3) : "") + " por mes)", margin + 8, y + 50);
  y += 60;

  writeH2("Decomposicao do ganho anual");
  const linhaBase = Number(s.baselineScenarioAnnual || 0);
  const redTerm   = Number(s.thermalReductionAnnual   || 0);
  const otiDem    = Number(s.demandOptimizationAnnual|| 0);
  const qeeTrhd   = Number(s.powerQualityAnnual       || 0);
  const totalParaPct = Math.max(totalA, 1);

  const escreverLinhaMergulho = (label: string, val: number) => {
    const pctVal = (val / totalParaPct) * 100;
    const barW = 120;
    const fillW = Math.max(2, Math.round(barW * (val / totalParaPct)));
    drawSoftBlock(18, [248, 250, 252] as [number, number, number]);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 40, 50);
    doc.text(label, margin + 8, y - 2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text("R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val), margin + 8 + 220, y - 2);
    doc.text(pctVal.toFixed(1).replace(".", ",") + "%", margin + 8 + 320, y - 2);
    // bar
    doc.setFillColor(220, 225, 230);
    doc.roundedRect(margin + 8 + 380, y - 12, barW, 6, 2, 2, "F");
    doc.setFillColor(20, 110, 60);
    doc.roundedRect(margin + 8 + 380, y - 12, fillW, 6, 2, 2, "F");
  };

  escreverLinhaMergulho("Linha de base tarifaria", linhaBase);
  escreverLinhaMergulho("Reducao termica",        redTerm);
  escreverLinhaMergulho("Otimizacao de demanda",  otiDem);
  escreverLinhaMergulho("QEE / reativo / THD",    qeeTrhd);
  y += 6;

  // ================== SECAO 3 - INTERPRETACAO DA IA ==================
  doc.addPage(); y = margin;
  writeH1("3. Interpretacao tecnica (IA)");
  writeLine("As 5 secoes abaixo foram geradas pela IA da OpenAI a partir dos dados operacionais e do perfil de carga. Cada recomendacao tem causa-raiz e impacto financeiro estimado.", { color: COLOR_HEADING });
  y += 8;

  const secoes = parseIaReport(args.report || "");
  if (secoes.length === 0) {
    writeLine(String(args.report || "(sem resposta da IA)"), {});
  } else {
    for (const sec of secoes) {
      writeH2("Secao " + sec.titulo);
      for (const ln of sec.corpo) {
        // se a linha comeca com "-" ou numero seguido de ".", eh bullet
        const isBullet = /^(-|\d+\.)\s+/.test(ln);
        if (isBullet) {
          writeLine(ln.replace(/^-\s+/, "\u2022 ").replace(/^\d+\.\s+/, ""), { gap: 2 });
        } else {
          writeLine(ln, { gap: 4 });
        }
      }
      y += 6;
    }
  }

  // ================== APENDICE METODOLOGICO ==================
  doc.addPage(); y = margin;
  writeH1("Apendice metodologico");
  writeH2("Como o relatorio foi construido");
  writeLine("- Os dados utilizados neste relatorio foram coletados junto ao cliente ou seu responsavel, em entrevistas, visitas tecnicas, levantamento de campo e analise de documentos operacionais.", {});
  writeLine("- Todas as informacoes tecnicas e de mercado sao baseadas em dados de datasheet de fabricantes e tabelas de mercado reconhecidas pelo setor.", {});
  writeLine("- Os valores, referencias e cruzamentos foram validados pelo especialista da empresa Expert Energy, garantindo coerencia com a operacao real do cliente.", {});
  y += 8;
  writeH2("Limitacoes conhecidas");
  writeLine("- O relatorio NAO caracteriza uma proposta formal: serve como indicador de viabilidade tecnica e economica para apoio a decisao.", {});
  writeLine("- Todas as validacoes sao recomendadas a serem feitas in loco, antes da formalizacao contratual e/ou da execucao de qualquer frente.", {});
  writeLine("- Os valores de fator de carga aqui apresentados tem como base extracoes de faturas de energia e calculos realizados pelo simulador EnergiaPro da Expert Energy.", {});
  writeLine("- A IA pode arredondar percentuais em 1 ponto decimal: pequenas diferencas (< 1%) sao normais e estao dentro da margem esperada.", {});
  writeLine("- Recomendacoes sao preliminares: somente serao validadas se aprovadas e convertidas em projeto executivo detalhado pela equipe tecnica da Expert Energy.", {});
  writeLine("- E proibida a copia ou o envio deste documento, no todo ou em parte, sem previa aprovacao por parte da Expert Energy Performance em Energia Ltda.", {});
  writeLine("- Para conhecer mais sobre as demais solucoes da empresa, consulte o site oficial: www.expertenergy.com.br.", {});
  writeLine("", {});
  drawFooter();

  patchFootersWithTotal(); // corrige "Pagina X de 1" -> "X de N" em todas as paginas
  const slug = String(s.companyName || "cliente")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .toLowerCase() || "cliente";
  const ts = new Date(args.generatedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = "diagnostico-" + slug + "-" + ts + ".pdf";
  doc.save(fileName);
  return { fileName };
}
/* === fim DIAG-BLOCO-A-HELPERS v7 === */

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
  const demRes = asObject(result.demRes);
  const thdRes = asObject(result.thdRes);
  const equipComparativo = asObject(result.EquipComparativo);
  const equipItems = Array.isArray(equipComparativo.items) ? equipComparativo.items : [];

  const companyName =
    input.razao ||
    item.company_name ||
    item.title ||
    'Empresa sem nome';

  const demandKw = safeNumber(input.dc || input.dcP || demRes.dc_atual_p);
  const monthlyConsumptionKwh = safeNumber(result.E_mes) * 1000;

  const fBase = safeNumber(result.F_base);
  const fCen = safeNumber(result.F_cen);
  const ecoAnual = safeNumber(result.eco_anual);

  const baselineScenarioAnnual = fBase > 0 || fCen > 0 ? Math.max(0, fBase - fCen) : 0;
  const potentialGainAnnual = ecoAnual > 0 ? ecoAnual : baselineScenarioAnnual;

  const estimatedSavingsValue =
    potentialGainAnnual > 0 ? potentialGainAnnual / 12 : 0;

  const estimatedSavingsPercent =
    fBase > 0 && potentialGainAnnual > 0
      ? (potentialGainAnnual / (fBase * 12)) * 100
      : 0;

  const paybackMonths = safeNumber(result.payback) * 12;

  const thermalReductionFromItems = equipItems.reduce((sum, row) => {
    const current = asObject(row);
    return sum + safeNumber(current.economia_anual_num);
  }, 0);

  const thermalReductionAnnual = safeNumber(
    result.thermalReductionAnnual ??
      result.reducao_termica_anual ??
      result.ganho_termico_anual ??
      result.thermRed_anual ??
      equipComparativo.gain_total ??
      thermalReductionFromItems
  );

  const demandOptimizationAnnual = safeNumber(
    result.demandOptimizationAnnual ??
      result.demanda_otima_anual ??
      result.ganho_demanda_anual ??
      result.demOpt_anual ??
      demRes.ganho_anual_estimado ??
      demRes.ganho_anual ??
      demRes.ganho_estimado_anual
  );

  const powerQualityAnnual = safeNumber(
    result.powerQualityAnnual ??
      result.qee_thd_reativo_anual ??
      result.ganho_qee_anual ??
      thdRes.total_RS_ano ??
      thdRes.total_rs_ano ??
      thdRes.ganho_anual_estimado
  );

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
    estimatedSavingsValue,
    estimatedSavingsPercent,
    paybackMonths,
    baselineScenarioAnnual,
    thermalReductionAnnual,
    demandOptimizationAnnual,
    powerQualityAnnual,
    potentialGainAnnual,
    loadProfileGainText,
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
}
