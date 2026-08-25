"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Insight = { titulo: string; severidade: "baixa"|"media"|"alta"; detalhe: string };
const sevColor: Record<Insight["severidade"], string> = {
  baixa: "#16a34a", media: "#ca8a04", alta: "#dc2626"
};

async function postJson(path: string, payload: Record<string, unknown>) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token || "";
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
  return { ok: r.ok, status: r.status, json };
}

export default function FinanceAISection() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [periodo, setPeriodo] = useState<string>(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [resposta, setResposta] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session?.access_token) { setAllowed(false); return; }
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
      if (!r.ok) { setErro(r.json?.error || `HTTP ${r.status}`); setInsights([]); return; }
      setInsights(r.json?.insights || []);
    } catch (e: any) { setErro(String(e?.message || e)); }
    finally { setLoadingInsight(false); }
  }

  async function callChat() {
    if (!prompt.trim()) return;
    setLoadingChat(true); setErro(null); setResposta("");
    try {
      const [year, month] = periodo.split("-").map(Number);
      const r = await postJson("/api/financeiro/ai/chat", { year, month, prompt });
      if (!r.ok) { setErro(r.json?.error || `HTTP ${r.status}`); return; }
      setResposta(r.json?.resposta || "");
    } catch (e: any) { setErro(String(e?.message || e)); }
    finally { setLoadingChat(false); }
  }

  if (allowed !== true) return null;

  return (
    <section
      className="mt-6 rounded-[28px] border border-slate-200/80 p-6 shadow-sm backdrop-blur"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)", color: "#f8fafc" }}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">
          🤖 IA Financeira · Visão Geral <span className="text-xs font-normal opacity-70">(admin)</span>
        </h2>
        <div className="flex items-center gap-2">
          <input type="month" value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-white" />
          <button onClick={callOverview} disabled={loadingInsight}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
            {loadingInsight ? "Analisando..." : "Gerar insights"}
          </button>
        </div>
      </header>

      {erro && (
        <div className="mb-3 rounded-md border border-red-400 bg-red-900/40 p-3 text-sm text-red-100">
          Erro: {erro}
        </div>
      )}

      {insights.length > 0 && (
        <ul className="mb-4 grid gap-2">
          {insights.map((i, idx) => (
            <li key={idx} className="rounded-md border border-slate-700 bg-slate-800/80 p-3"
                style={{ borderLeft: `4px solid ${sevColor[i.severidade]}` }}>
              <strong style={{ color: sevColor[i.severidade] }}>[{i.severidade.toUpperCase()}] {i.titulo}</strong>
              <div className="mt-1 text-sm opacity-85">{i.detalhe}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg bg-slate-800/70 p-4">
        <label className="text-sm font-semibold text-white">Pergunte à IA Financeira</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          placeholder="Ex: como está o fluxo de caixa deste mês em relação aos empréstimos ativos?"
          className="mt-2 w-full resize-y rounded-md border border-slate-600 bg-slate-900 p-2 text-sm text-white placeholder:text-slate-400" />
        <button onClick={callChat} disabled={loadingChat || !prompt.trim()}
          className="mt-2 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
          {loadingChat ? "Enviando..." : "Enviar pergunta"}
        </button>
        {resposta && (
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 text-sm text-slate-100">
            {resposta}
          </pre>
        )}
      </div>
    </section>
  );
}
