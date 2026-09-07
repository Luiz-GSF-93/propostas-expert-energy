"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Insight = { modulo: string; titulo: string; severidade: "baixa"|"media"|"alta"; detalhe: string };

const sevColor: Record<Insight["severidade"], string> = {
  baixa: "#16a34a",
  media: "#ca8a04",
  alta:  "#dc2626"
};

const moduloLabel: Record<string, string> = {
  fluxo_caixa:  "Fluxo de Caixa",
  dre:          "DRE (Receitas × Despesas)",
  custos:       "Custos",
  planejamento: "Planejamento / Orçamento",
  emprestimos:  "Empréstimos / Financiamentos"
};

const moduloIcon: Record<string, string> = {
  fluxo_caixa:  "💵",
  dre:          "📊",
  custos:       "🧾",
  planejamento: "🎯",
  emprestimos:  "🏦"
};

async function postJson(path: string, payload: Record<string, unknown>) {
  const { data: sessData } = await supabase.auth.getSession();
  const token = sessData?.session?.access_token || "";
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: r.ok, status: r.status, json };
}

function fmtBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function FinanceAISection() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [periodo, setPeriodo] = useState<string>(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<any>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [chatResposta, setChatResposta] = useState<{ resposta: string; ctx: any; intencao?: string } | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessData } = await supabase.auth.getSession();
        const user = sessData?.session?.user;
        if (!sessData?.session?.access_token || !user) { 
          setAllowed(false); 
          return; 
        }

        const userEmail = (user.email || "").toLowerCase().trim();
        const masterAdmins = ["luizdigi@gmail.com", "admin@expertenergy.com.br", "contato@expertenergy.com.br"];
        if (masterAdmins.includes(userEmail)) {
          setAllowed(true);
          return;
        }

        const metaRole = String(user.user_metadata?.role || user.app_metadata?.role || "").toLowerCase();
        if (["admin", "administrator", "administrador", "superadmin"].includes(metaRole)) {
          setAllowed(true);
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const role = String(prof?.role || "").toLowerCase().trim();
        setAllowed(["admin", "administrator", "administrador", "superadmin"].includes(role));
      } catch { 
        setAllowed(false); 
      }
    })();
  }, []);

  async function callOverview() {
    setLoadingInsight(true); setErro(null);
    try {
      const [year, month] = periodo.split("-").map(Number);
      const r = await postJson("/api/financeiro/ai/overview", { year, month, force_refresh: true });
      if (!r.ok) { setErro(r.json?.error || `Erro HTTP ${r.status}`); setData(null); return; }
      setData(r.json);
    } catch (e: any) { setErro(String(e?.message || e)); }
    finally { setLoadingInsight(false); }
  }

  async function callChat() {
    if (!prompt.trim()) return;
    setLoadingChat(true); setErro(null); setChatResposta(null);
    try {
      const [year, month] = periodo.split("-").map(Number);
      const r = await postJson("/api/financeiro/ai/chat", { year, month, prompt });
      if (!r.ok) { setErro(r.json?.error || `Erro HTTP ${r.status}`); return; }
      setChatResposta({
        resposta: r.json?.resposta || "",
        ctx: r.json?.contexto_resumido,
        intencao: r.json?.intencao_detectada
      });
    } catch (e: any) { setErro(String(e?.message || e)); }
    finally { setLoadingChat(false); }
  }

  // Carregar dados automaticamente ao liberar acesso
  useEffect(() => {
    if (allowed === true) {
      callOverview();
    }
  }, [allowed, periodo]);

  if (allowed === null) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 text-slate-300">
        <p>Carregando inteligência financeira...</p>
      </div>
    );
  }

  if (allowed !== true) return null;

  // --- organizar insights por módulo ---
  const insightsPorModulo: Record<string, Insight[]> = {};
  (data?.insights as Insight[] | undefined)?.forEach((i) => {
    if (!insightsPorModulo[i.modulo]) insightsPorModulo[i.modulo] = [];
    insightsPorModulo[i.modulo].push(i);
  });

  const modulosOrdem = ["fluxo_caixa", "dre", "custos", "planejamento", "emprestimos"];

  return (
    <section
      className="mt-6 rounded-[28px] border border-slate-200/80 p-6 shadow-sm backdrop-blur"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)", color: "#f8fafc" }}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>⚡</span> Inteligência Financeira Executiva (IA)
          </h2>
          <p className="text-xs text-slate-400">Visão consolidada multi-módulo com auditoria de coerência e cruzamento de dados</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-300 font-medium">Competência:</label>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-white shadow-sm focus:border-cyan-400 focus:outline-none"
          />
          <button
            onClick={callOverview}
            disabled={loadingInsight}
            className="rounded-lg bg-cyan-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-cyan-500 disabled:opacity-50 shadow-sm"
          >
            {loadingInsight ? "Analisando..." : "Atualizar Parecer"}
          </button>
        </div>
      </header>

      {erro && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
          <strong>Aviso:</strong> {erro}
        </div>
      )}

      {/* PARECER GERAL DO CFO */}
      {data?.parecer_geral && (
        <div className="mb-6 rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4 shadow-inner">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
            <span>📋</span> Parecer Síntese Executivo
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200 font-normal">
            {data.parecer_geral}
          </p>
        </div>
      )}

      {/* CARDS DOS 5 MÓDULOS */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {modulosOrdem.map((mk) => {
          const m = data?.modulos?.[mk];
          const kpi = (() => {
            if (!m) return null;
            if (mk === "fluxo_caixa") return { valor: fmtBRL(m.totais?.saldo ?? 0), label: "Saldo do mês" };
            if (mk === "dre") return { valor: fmtBRL(m.totais?.resultado ?? 0), label: `Margem EBITDA ${m.margens?.ebitda_pct != null ? m.margens.ebitda_pct.toFixed(1) + "%" : "n/d"}` };
            if (mk === "custos") return { valor: fmtBRL(m.totais?.total ?? 0), label: `${m.totais?.count ?? 0} contrato(s)` };
            if (mk === "planejamento") return { valor: fmtBRL(m.totais?.realizado_total ?? 0), label: `Metas ${fmtBRL(m.totais?.metas_total ?? 0)}` };
            if (mk === "emprestimos") return { valor: fmtBRL(m.totais?.parcela_mes ?? 0), label: `Saldo devedor ${fmtBRL(m.totais?.saldo_total ?? 0)}` };
            return null;
          })();
          const insights = insightsPorModulo[mk] || [];
          const severidade = insights.some(i => i.severidade === "alta") ? "alta" :
                             insights.some(i => i.severidade === "media") ? "media" : "baixa";
          return (
            <div key={mk}
              className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 shadow-sm"
              style={{ borderTop: `3px solid ${sevColor[severidade]}` }}>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <span>{moduloIcon[mk]}</span>
                <span>{moduloLabel[mk]}</span>
              </div>
              <div className="mt-2 text-lg font-bold text-white">
                {kpi ? kpi.valor : "—"}
              </div>
              <div className="text-[11px] text-slate-400">
                {kpi ? kpi.label : "Sem dados"}
              </div>
            </div>
          );
        })}
      </div>

      {/* SIMULAÇÃO DE CENÁRIOS */}
      {Array.isArray(data?.cenarios) && data.cenarios.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            🎯 Testes de Sensibilidade e Robustez (Cenários)
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {data.cenarios.map((c: any, idx: number) => {
              const rotulo = c.cenario || `Cenário ${idx + 1}`;
              const cor = rotulo.toLowerCase().includes("otim") ? "#16a34a" :
                          rotulo.toLowerCase().includes("pessim") ? "#dc2626" : "#0284c7";
              const r = c.resultado || {};
              return (
                <div key={`cen-${idx}`} className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 shadow-sm"
                     style={{ borderLeft: `3px solid ${cor}` }}>
                  <div className="text-xs uppercase font-bold text-slate-300">{rotulo}</div>
                  <div className="mt-1 text-sm font-bold text-white">
                    Saldo: {fmtBRL(r.saldo_final ?? r.saldo)}
                  </div>
                  <div className="text-xs text-slate-400">
                    EBITDA: {fmtBRL(r.ebitda)} {r.margem_ebitda_pct != null ? `(${r.margem_ebitda_pct.toFixed(1)}%)` : ""}
                  </div>
                  {c.premissas && <p className="mt-1 text-[11px] text-slate-400 italic leading-snug">{c.premissas}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CHAT / ASSISTENTE FINANCEIRO */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
          <span>💬</span> Consultor Financeiro Virtual
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ex: Qual a previsão de caixa para os próximos meses? Temos risco de liquidez?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && callChat()}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
          <button
            onClick={callChat}
            disabled={loadingChat || !prompt.trim()}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50 shadow-sm"
          >
            {loadingChat ? "Consultando..." : "Perguntar"}
          </button>
        </div>

        {chatResposta && (
          <div className="mt-3 rounded-xl border border-cyan-500/20 bg-slate-800/90 p-3 text-xs text-slate-200">
            <p className="whitespace-pre-line leading-relaxed">{chatResposta.resposta}</p>
          </div>
        )}
      </div>
    </section>
  );
}
