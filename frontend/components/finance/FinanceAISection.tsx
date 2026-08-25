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
        const { data: sess } = await supabase.auth.getSession();
        if (!sessData?.session?.access_token) { setAllowed(false); return; }
        const { data: prof } = await supabase.from("profiles").select("role").maybeSingle();
        setAllowed(String(prof?.role || "").toLowerCase() === "admin");
      } catch { setAllowed(false); }
    })();
  }, []);

  async function callOverview() {
    setLoadingInsight(true); setErro(null);
    try {
      const [year, month] = periodo.split("-").map(Number);
      const r = await postJson("/api/financeiro/ai/overview", { year, month });
      if (!r.ok) { setErro(typeof r.json?.error === "string" ? r.json?.error : `HTTP ${r.status}`); setData(null); return; }
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
      if (!r.ok) { setErro(typeof r.json?.error === "string" ? r.json?.error : `HTTP ${r.status}`); return; }
      setChatResposta({
        resposta: r.json?.resposta || "",
        ctx: r.json?.contexto_resumido,
        intencao: r.json?.intencao_detectada
      });
    } catch (e: any) { setErro(String(e?.message || e)); }
    finally { setLoadingChat(false); }
  }

  if (allowed !== true) return null;

  // --- organizar insights por módulo ---
  const insightsPorModulo: Record<string, Insight[]> = {};
  (data?.insights as Insight[] | undefined)?.forEach((i) => {
    if (!insightsPorModulo[i.modulo]) insightsPorModulo[i.modulo] = [];
    insightsPorModulo[i.modulo].push(i);
  });

  const ordemModulos = ["fluxo_caixa", "dre", "custos", "planejamento", "emprestimos"];

  return (
    <section
      className="mt-6 rounded-[28px] border border-slate-200/80 p-6 shadow-sm backdrop-blur"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)", color: "#f8fafc" }}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">
          🤖 IA Financeira · Visão Geral <span className="text-xs font-normal opacity-70">(admin)</span>
        </h2>
        <div className="flex items-center gap-2">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          <button onClick={callOverview} disabled={loadingInsight}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
            {loadingInsight ? "Analisando 5 módulos..." : "Gerar visão geral"}
          </button>
        </div>
      </header>

      {erro && (
        <div className="mb-4 rounded-md border border-red-400 bg-red-900/40 p-3 text-sm text-red-100">
          ⚠️ {erro}
        </div>
      )}

      {/* ====== 5 MÓDULOS ====== */}
      {data && (
        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {ordemModulos.map((mk) => {
            const m = data.modulos?.[mk];
            const resumo = (() => {
              if (!m) return null;
              if (mk === "fluxo_caixa")   return { valor: fmtBRL(m.totais?.saldo ?? 0), label: "Saldo do mês" };
              if (mk === "dre")           return { valor: fmtBRL(m.totais?.resultado ?? 0), label: `Margem EBITDA ${m.margens?.ebitda_pct != null ? m.margens.ebitda_pct.toFixed(1) + "%" : "n/d"}` };
              if (mk === "custos")        return { valor: fmtBRL(m.totais?.total ?? 0),     label: `${m.totais?.count ?? 0} contrato(s)` };
              if (mk === "planejamento")  return { valor: fmtBRL(m.totais?.realizado_total ?? 0), label: `Metas ${fmtBRL(m.totais?.metas_total ?? 0)}` };
              if (mk === "emprestimos")   return { valor: fmtBRL(m.totais?.parcela_mes ?? 0), label: `Saldo devedor ${fmtBRL(m.totais?.saldo_total ?? 0)}` };
              return null;
            })();
            const insights = insightsPorModulo[mk] || [];
            const severidade = insights.some(i => i.severidade === "alta") ? "alta" :
                               insights.some(i => i.severidade === "media") ? "media" : "baixa";
            return (
              <div key={mk}
                className="rounded-xl border border-slate-700 bg-slate-800/80 p-4"
                style={{ borderTop: `3px solid ${sevColor[severidade]}` }}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{moduloIcon[mk]}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{moduloLabel[mk]}</span>
                </div>
                <div className="mt-2 text-xl font-bold text-white">{resumo?.valor ?? "—"}</div>
                <div className="text-xs text-slate-400">{resumo?.label}</div>
                <div className="mt-3 space-y-2">
                  {insights.length === 0 && <div className="text-xs text-slate-400">Sem alertas automáticos.</div>}
                  {insights.map((i, idx) => (
                    <div key={idx} className="rounded-md p-2"
                         style={{ borderLeft: `3px solid ${sevColor[i.severidade]}` }}>
                      <div className="text-xs font-semibold" style={{ color: sevColor[i.severidade] }}>{i.titulo}</div>
                      <div className="text-xs text-slate-200 mt-1">{i.detalhe}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ====== SUGESTÕES ====== */}
      {data?.sugestoes?.length > 0 && (
        <div className="mb-4 rounded-xl bg-slate-800/60 p-4">
          <h3 className="text-sm font-bold text-white mb-2">💡 Sugestões de gestão</h3>
          <ul className="list-disc pl-5 text-sm text-slate-100 space-y-1">
            {data.sugestoes.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* ====== OPORTUNIDADES ====== */}
      {data?.oportunidades?.length > 0 && (
        <div className="mb-4 rounded-xl bg-emerald-900/40 p-4">
          <h3 className="text-sm font-bold text-white mb-2">🚀 Oportunidades identificadas</h3>
          <ul className="list-disc pl-5 text-sm text-emerald-100 space-y-1">
            {data.oportunidades.map((o: string, i: number) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}

      {/* ====== CENÁRIOS ====== */}
      {data?.cenarios && (
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {[
            { k: "otimista",   cor: "#10b981", rotulo: "Otimista (+10%/-2%)" },
            { k: "realista",   cor: "#0ea5e9", rotulo: "Realista (+2%/+2%)" },
            { k: "pessimista", cor: "#ef4444", rotulo: "Pessimista (-10%/+8%)" }
          ].map((c) => {
            const ev = data.cenarios[c.k];
            return (
              <div key={c.k} className="rounded-xl border border-slate-700 bg-slate-800/60 p-4"
                   style={{ borderLeft: `3px solid ${c.cor}` }}>
                <div className="text-xs uppercase text-slate-400">{c.rotulo}</div>
                <div className="text-lg font-bold text-white mt-1">Receita: {fmtBRL(ev.receita)}</div>
                <div className="text-sm text-slate-200">Custos: {fmtBRL(ev.custos)}</div>
                <div className="text-lg font-bold mt-1" style={{ color: ev.lucro >= 0 ? "#86efac" : "#fca5a5" }}>
                  Lucro: {fmtBRL(ev.lucro)}
                </div>
                <div className="text-xs text-slate-400">
                  Δ vs atual: {fmtBRL(ev.delta_lucro)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ====== CHAT ====== */}
      <div className="rounded-xl bg-slate-800/70 p-4">
        <h3 className="text-sm font-bold text-white">💬 Pergunte à IA Financeira (linguagem natural)</h3>
        <p className="text-xs text-slate-400 mt-1 mb-2">
          Ex: "Por que o lucro caiu em 2026-08?", "Como ficará o caixa em 90 dias?",
          "Vale a pena antecipar o empréstimo?", "Tenho risco de insolvência?",
          "Qual cliente gera mais caixa?", "Qual unidade tem maior custo energético?",
          "Gere um plano para aumentar o EBITDA em 15%."
        </p>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          placeholder="Faça sua pergunta em linguagem natural..."
          className="w-full rounded-md border border-slate-600 bg-slate-900 p-2 text-sm text-white placeholder:text-slate-400" />
        <button onClick={callChat} disabled={loadingChat || !prompt.trim()}
          className="mt-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
          {loadingChat ? "Investigando os 5 módulos..." : "Enviar pergunta"}
        </button>

        {chatResposta && (
          <div className="mt-4 space-y-3">
            {chatResposta.intencao && (
              <div className="inline-block rounded bg-blue-900/60 px-2 py-1 text-xs text-blue-100">
                Intenção detectada: <strong>{chatResposta.intencao}</strong>
              </div>
            )}
            {chatResposta.ctx && (
              <div className="rounded-md bg-slate-900/80 p-3 text-xs text-slate-200 grid gap-1 sm:grid-cols-3">
                <div>📅 Período: <strong>{chatResposta.ctx.periodo}</strong></div>
                <div>💵 Caixa: <strong>{fmtBRL(chatResposta.ctx.cf_saldo)}</strong></div>
                <div>📊 Resultado: <strong>{fmtBRL(chatResposta.ctx.dre_resultado)}</strong></div>
                <div>🏦 Parcela: <strong>{fmtBRL(chatResposta.ctx.emprestimos_parcela)}</strong></div>
                <div>📈 DSCR: <strong>{chatResposta.ctx.DSCR != null ? chatResposta.ctx.DSCR.toFixed(2) : "n/d"}</strong></div>
                <div>🔮 90d: <strong>{fmtBRL(chatResposta.ctx.projecao_90d)}</strong></div>
              </div>
            )}
            <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 text-sm text-slate-100">
              {chatResposta.resposta}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
