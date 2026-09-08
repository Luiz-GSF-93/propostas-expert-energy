"use client";

import React, { useState, useEffect } from "react";

export default function ContratosPage() {
  const [contratos, setContratos] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLicencasOpen, setModalLicencasOpen] = useState(false);
  const [activeLicenca, setActiveLicenca] = useState<any>(null);

  const [formData, setFormData] = useState({
    razao_social: "",
    cnpj: "",
    email: "",
    telefone: "",
    data_inicio: new Date().toISOString().split("T")[0],
    vigencia_meses: 12,
    valor_mensal: 199.0,
    dia_vencimento: 10,
    renovacao_automatica: true,
    tipo_licenca: "starter",
    usuarios_permitidos: 5,
    ponto_nome: "Entrada Principal (Trafo 01)",
    ponto_setor: "Subestação Geral"
  });

  const fetchDados = async () => {
    setLoading(true);
    try {
      const [resC, resK] = await Promise.all([
        fetch("/api/contratos").then((r) => r.json()),
        fetch("/api/contratos/relatorios/kpis").then((r) => r.json())
      ]);
      if (resC.ok) setContratos(resC.data || []);
      if (resK.ok) setKpis(resK.data || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDados(); }, []);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const inicio = new Date(formData.data_inicio);
      const fim = new Date(inicio);
      fim.setMonth(fim.getMonth() + Number(formData.vigencia_meses));

      const payload = {
        cliente: {
          razao_social: formData.razao_social,
          cnpj: formData.cnpj,
          email: formData.email,
          telefone: formData.telefone
        },
        data_inicio: formData.data_inicio,
        data_fim: fim.toISOString().split("T")[0],
        vigencia_meses: Number(formData.vigencia_meses),
        valor_mensal: Number(formData.valor_mensal),
        dia_vencimento: Number(formData.dia_vencimento),
        renovacao_automatica: formData.renovacao_automatica,
        status: "ativo",
        licenca_energy_link: {
          tipo: formData.tipo_licenca,
          usuarios: formData.usuarios_permitidos,
          pontos: [{ id: "1", nome_ponto: formData.ponto_nome, setor_unidade: formData.ponto_setor, ativo: true }]
        }
      };

      const res = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert("Contrato e Licença Energy Link cadastrados com sucesso!");
        setModalOpen(false);
        fetchDados();
      } else {
        const d = await res.json();
        alert("Erro: " + (d.error || "Tente novamente"));
      }
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
  };

  const fmtBRL = (v: number) => (Number(v || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const filtered = contratos.filter((c) => filterStatus === "todos" ? true : c.status === filterStatus);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 font-sans">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <button onClick={() => (window.location.href = "/dashboard")} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition">
              ← Voltar ao Dashboard
            </button>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-semibold">
              Módulo Admin
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-3 flex items-center gap-3">
            <span>📑</span> Gestão de Contratos & Licenças Recorrentes
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Controle de receita recorrente (MRR/ARR), vigências, pontos de telemedição Energy Link e Mercado Livre (ACL).
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 transition cursor-pointer">
          + Novo Contrato / Licença
        </button>
      </div>

      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">MRR (Mensal)</span>
            <div className="text-2xl font-black text-cyan-400 mt-2">{fmtBRL(kpis.mrr)}</div>
            <span className="text-xs text-slate-500 mt-1 block">{kpis.total_ativos} contratos ativos</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ARR (Anual)</span>
            <div className="text-2xl font-black text-emerald-400 mt-2">{fmtBRL(kpis.arr)}</div>
            <span className="text-xs text-slate-500 mt-1 block">Projetado 12 meses</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taxa Renovação</span>
            <div className="text-2xl font-black text-blue-400 mt-2">{kpis.taxa_renovacao_pct}%</div>
            <span className="text-xs text-slate-500 mt-1 block">Renovação automática</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Churn</span>
            <div className="text-2xl font-black text-rose-400 mt-2">{kpis.churn_rate_pct}%</div>
            <span className="text-xs text-slate-500 mt-1 block">{kpis.total_cancelados} cancelado(s)</span>
          </div>
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 bg-gradient-to-br from-slate-900 to-amber-950/20">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">⏳ Vence em 90 dias</span>
            <div className="text-2xl font-black text-amber-300 mt-2">{kpis.contratos_a_vencer_90d}</div>
            <span className="text-xs text-amber-400/70 mt-1 block">Avisos de renovação</span>
          </div>
        </div>
      )}

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-white">Contratos e Licenças Vigentes ({filtered.length})</h2>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200">
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="cancelado">Cancelados</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">Carregando contratos...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">Nenhum contrato cadastrado. Clique em <strong>+ Novo Contrato</strong> para iniciar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Contrato</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Vigência</th>
                  <th className="py-3 px-4">Mensalidade</th>
                  <th className="py-3 px-4">Plano Energy Link</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {filtered.map((c) => {
                  const lic = c.contract_licenses?.[0];
                  const pts = (lic?.pontos_medicao || []).length;
                  const lim = lic?.limite_medicoes || 10;
                  const tipo = lic?.tipo_licenca || "starter";
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-4 px-4 font-bold text-cyan-400">#{String(c.numero_contrato).padStart(4, "0")}</td>
                      <td className="py-4 px-4 font-bold text-white">{c.clients?.razao_social || "Empresa"}</td>
                      <td className="py-4 px-4 text-xs text-slate-300">{new Date(c.data_inicio).toLocaleDateString("pt-BR")} a {new Date(c.data_fim).toLocaleDateString("pt-BR")}</td>
                      <td className="py-4 px-4 font-extrabold text-emerald-400">{fmtBRL(c.valor_mensal)}</td>
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-950/60 border border-cyan-800 text-cyan-300">
                          ⚡ {tipo.toUpperCase()} ({pts}/{lim} pts)
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${c.status === "ativo" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button onClick={() => { setActiveLicenca({ contrato: c, ...lic }); setModalLicencasOpen(true); }} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 transition">
                          ⚙️ Pontos & Licença
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl my-8">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-6">
              <h3 className="text-xl font-bold text-white">Novo Contrato & Gestão de Licenças</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSalvar} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Razão Social *</label>
                  <input type="text" required value={formData.razao_social} onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })} placeholder="Ex: Metalúrgica ABC Ltda" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">CNPJ</label>
                  <input type="text" value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} placeholder="00.000.000/0001-00" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Data Início</label>
                  <input type="date" required value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Vigência (Meses)</label>
                  <select value={formData.vigencia_meses} onChange={(e) => setFormData({ ...formData, vigencia_meses: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white">
                    <option value={12}>12 Meses</option>
                    <option value={24}>24 Meses</option>
                    <option value={36}>36 Meses</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Valor Mensal (R$)</label>
                  <input type="number" step="0.01" required value={formData.valor_mensal} onChange={(e) => setFormData({ ...formData, valor_mensal: parseFloat(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Plano Energy Link</label>
                  <select value={formData.tipo_licenca} onChange={(e) => setFormData({ ...formData, tipo_licenca: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white">
                    <option value="starter">Starter (até 10 medições)</option>
                    <option value="professional">Professional (11 a 30 medições)</option>
                    <option value="enterprise">Enterprise (31+ medições)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Primeiro Ponto de Medição</label>
                  <input type="text" value={formData.ponto_nome} onChange={(e) => setFormData({ ...formData, ponto_nome: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm">Cancelar</button>
                <button type="submit" className="px-6 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm">Salvar Contrato</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalLicencasOpen && activeLicenca && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-lg font-bold text-white">Pontos de Telemetria Energy Link</h3>
              <button onClick={() => setModalLicencasOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Plano Ativo:</span>
                <div className="text-sm font-bold text-cyan-400 uppercase">{activeLicenca.tipo_licenca} ({(activeLicenca.pontos_medicao || []).length} de {activeLicenca.limite_medicoes || 10} pontos)</div>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(activeLicenca.pontos_medicao || []).map((p: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-bold text-white">{p.nome_ponto || `Ponto ${idx+1}`}</div>
                      <div className="text-xs text-slate-400">{p.setor_unidade || "Geral"}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">Ativo</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
              <button onClick={() => setModalLicencasOpen(false)} className="px-5 py-2 rounded-xl bg-slate-800 text-white text-sm">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
