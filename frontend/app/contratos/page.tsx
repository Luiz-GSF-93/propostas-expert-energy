"use client";

import React, { useState, useEffect, useMemo } from "react";

interface PontoMedicao {
  id: string;
  nome_ponto: string;
  setor_unidade: string;
  ativo: boolean;
}

interface Contrato {
  id: string;
  numero_contrato: number;
  cliente_id: string;
  data_inicio: string;
  data_fim: string;
  vigencia_meses: number;
  valor_mensal: number;
  dia_vencimento: number;
  renovacao_automatica: boolean;
  indice_reajuste: string;
  sla_horas: number;
  status: string;
  observacoes?: string;
  tipo_cobranca?: "fixa" | "hibrida";
  percentual_variavel_economia?: number;
  tipo_plano_servico?: string;
  taxa_reajuste_projetada?: number;
  clients?: {
    id: string;
    razao_social: string;
    cnpj?: string;
    email?: string;
    telefone?: string;
  };
  contract_licenses?: {
    id: string;
    tipo_licenca: string;
    limite_medicoes: number;
    usuarios_permitidos: number;
    pontos_medicao: PontoMedicao[];
  }[];
}

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterPlano, setFilterPlano] = useState("todos");
  const [filterCobranca, setFilterCobranca] = useState("todos");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    razao_social: "",
    cnpj: "",
    email: "",
    telefone: "",
    data_inicio: new Date().toISOString().split("T")[0],
    vigencia_meses: 12,
    valor_mensal: 6000.0,
    dia_vencimento: 10,
    renovacao_automatica: true,
    status: "ativo",
    tipo_plano_servico: "telemedicao_starter",
    tipo_cobranca: "fixa" as "fixa" | "hibrida",
    percentual_variavel_economia: 0,
    indice_reajuste: "IPCA",
    taxa_reajuste_projetada: 4.5,
    usuarios_permitidos: 5,
    pontos_medicao: [
      { id: "1", nome_ponto: "Entrada Principal (Trafo 01)", setor_unidade: "Subestação Geral", ativo: true }
    ] as PontoMedicao[],
    observacoes: ""
  });

  const planosDisponiveis = [
    { value: "telemedicao_starter", label: "⚡ Plataforma Energy Link: Starter (até 10 medições)" },
    { value: "telemedicao_professional", label: "⚡ Plataforma Energy Link: Professional (11 a 30 medições)" },
    { value: "telemedicao_enterprise", label: "⚡ Plataforma Energy Link: Enterprise (31+ medições)" },
    { value: "mercado_livre_representacao", label: "🏢 Gestão e Representação no Mercado Livre (ACL)" },
    { value: "consultoria_regulatoria", label: "📜 Consultoria & Assessoria Regulatória" },
    { value: "consultoria_tecnica", label: "🛠️ Consultoria Técnica & Eficiência Energética" },
    { value: "consultoria_engenharia", label: "📐 Consultoria de Engenharia & Projetos Especiais" }
  ];

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

  const handleNovoContrato = () => {
    setEditingContractId(null);
    setFormData({
      razao_social: "",
      cnpj: "",
      email: "",
      telefone: "",
      data_inicio: new Date().toISOString().split("T")[0],
      vigencia_meses: 12,
      valor_mensal: 6000.0,
      dia_vencimento: 10,
      renovacao_automatica: true,
      status: "ativo",
      tipo_plano_servico: "telemedicao_starter",
      tipo_cobranca: "fixa",
      percentual_variavel_economia: 0,
      indice_reajuste: "IPCA",
      taxa_reajuste_projetada: 4.5,
      usuarios_permitidos: 5,
      pontos_medicao: [
        { id: "1", nome_ponto: "Entrada Principal (Trafo 01)", setor_unidade: "Subestação Geral", ativo: true }
      ],
      observacoes: ""
    });
    setModalOpen(true);
  };

  const handleEditarContrato = (c: Contrato) => {
    setEditingContractId(c.id);
    const lic = c.contract_licenses?.[0];
    let obsObj: any = {};
    try { obsObj = JSON.parse(c.observacoes || "{}"); } catch {}

    let pontosCarregados: PontoMedicao[] = [];
    if (lic && Array.isArray(lic.pontos_medicao) && lic.pontos_medicao.length > 0) {
      pontosCarregados = lic.pontos_medicao;
    } else if (obsObj.pontos_medicao && Array.isArray(obsObj.pontos_medicao) && obsObj.pontos_medicao.length > 0) {
      pontosCarregados = obsObj.pontos_medicao;
    } else {
      pontosCarregados = [
        { id: "1", nome_ponto: "Entrada Principal (Trafo 01)", setor_unidade: "Subestação Geral", ativo: true }
      ];
    }

    setFormData({
      razao_social: c.clients?.razao_social || "",
      cnpj: c.clients?.cnpj || "",
      email: c.clients?.email || "",
      telefone: c.clients?.telefone || "",
      data_inicio: c.data_inicio,
      vigencia_meses: c.vigencia_meses,
      valor_mensal: c.valor_mensal,
      dia_vencimento: c.dia_vencimento,
      renovacao_automatica: c.renovacao_automatica,
      status: c.status,
      tipo_plano_servico: obsObj.tipo_plano_servico || lic?.tipo_licenca || "telemedicao_starter",
      tipo_cobranca: obsObj.tipo_cobranca || "fixa",
      percentual_variavel_economia: obsObj.percentual_variavel_economia || 0,
      indice_reajuste: c.indice_reajuste || "IPCA",
      taxa_reajuste_projetada: obsObj.taxa_reajuste_projetada || 4.5,
      usuarios_permitidos: lic?.usuarios_permitidos || 5,
      pontos_medicao: pontosCarregados,
      observacoes: obsObj.obs_texto || c.observacoes || ""
    });
    setModalOpen(true);
  };

  const handleAddPonto = () => {
    const novoPonto: PontoMedicao = {
      id: String(Date.now()),
      nome_ponto: `Ponto ${formData.pontos_medicao.length + 1}`,
      setor_unidade: "Setor / Quadro",
      ativo: true
    };
    setFormData({ ...formData, pontos_medicao: [...formData.pontos_medicao, novoPonto] });
  };

  const handleUpdatePonto = (index: number, field: keyof PontoMedicao, val: any) => {
    const list = [...formData.pontos_medicao];
    list[index] = { ...list[index], [field]: val };
    setFormData({ ...formData, pontos_medicao: list });
  };

  const handleRemovePonto = (index: number) => {
    if (formData.pontos_medicao.length <= 1) {
      alert("O contrato precisa de ao menos um ponto de medição.");
      return;
    }
    const list = formData.pontos_medicao.filter((_, i) => i !== index);
    setFormData({ ...formData, pontos_medicao: list });
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const inicio = new Date(formData.data_inicio);
      const fim = new Date(inicio);
      fim.setMonth(fim.getMonth() + Number(formData.vigencia_meses));

      const metaObservacoes = JSON.stringify({
        tipo_plano_servico: formData.tipo_plano_servico,
        tipo_cobranca: formData.tipo_cobranca,
        percentual_variavel_economia: Number(formData.percentual_variavel_economia),
        taxa_reajuste_projetada: Number(formData.taxa_reajuste_projetada),
        pontos_medicao: formData.pontos_medicao,
        obs_texto: formData.observacoes
      });

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
        indice_reajuste: formData.indice_reajuste,
        status: formData.status,
        observacoes: metaObservacoes,
        licenca_energy_link: {
          tipo_licenca: formData.tipo_plano_servico,
          limite_medicoes: formData.tipo_plano_servico === "telemedicao_starter" ? 10 :
                           formData.tipo_plano_servico === "telemedicao_professional" ? 30 :
                           Math.max(35, formData.pontos_medicao.length),
          usuarios_permitidos: formData.usuarios_permitidos,
          pontos_medicao: formData.pontos_medicao
        }
      };

      const url = editingContractId ? `/api/contratos/${editingContractId}` : "/api/contratos";
      const method = editingContractId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert(editingContractId ? `Contrato atualizado com sucesso (${formData.pontos_medicao.length} pontos salvos)!` : `Contrato cadastrado com sucesso (${formData.pontos_medicao.length} pontos salvos)!`);
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

  const valorProjetadoReajuste = Number(formData.valor_mensal || 0) * (1 + (Number(formData.taxa_reajuste_projetada || 0) / 100));

  const getPlanoKey = (c: Contrato) => {
    try {
      const obs = JSON.parse(c.observacoes || "{}");
      if (obs.tipo_plano_servico) return obs.tipo_plano_servico;
    } catch {}
    return c.contract_licenses?.[0]?.tipo_licenca || "telemedicao_starter";
  };

  const getNomePlano = (c: Contrato) => {
    const key = getPlanoKey(c);
    const p = planosDisponiveis.find(x => x.value === key);
    return p ? p.label : "Contrato Personalizado";
  };

  const getTipoCobranca = (c: Contrato) => {
    try {
      const obs = JSON.parse(c.observacoes || "{}");
      return obs.tipo_cobranca || "fixa";
    } catch {}
    return "fixa";
  };

  const filteredContratos = useMemo(() => {
    return contratos.filter((c) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const razao = (c.clients?.razao_social || "").toLowerCase();
        const cnpj = (c.clients?.cnpj || "").toLowerCase();
        const num = String(c.numero_contrato || "");
        if (!razao.includes(term) && !cnpj.includes(term) && !num.includes(term)) return false;
      }
      if (filterStatus !== "todos" && c.status !== filterStatus) return false;
      if (filterPlano !== "todos" && getPlanoKey(c) !== filterPlano) return false;
      if (filterCobranca !== "todos" && getTipoCobranca(c) !== filterCobranca) return false;
      return true;
    });
  }, [contratos, searchTerm, filterStatus, filterPlano, filterCobranca]);

  const handleLimparFiltros = () => {
    setSearchTerm("");
    setFilterStatus("todos");
    setFilterPlano("todos");
    setFilterCobranca("todos");
  };

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
            <span>📑</span> Gestão Estratégica de Contratos & Licenças
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Controle de receita recorrente (MRR/ARR), reajustes anuais, múltiplos pontos de telemedição e consultorias ACL.
          </p>
        </div>
        <button onClick={handleNovoContrato} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 transition cursor-pointer">
          + Novo Contrato / Licença
        </button>
      </div>

      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">MRR (Recorrente)</span>
            <div className="text-2xl font-black text-cyan-400 mt-2">{fmtBRL(kpis.mrr)}</div>
            <span className="text-xs text-slate-500 mt-1 block">{kpis.total_ativos} contratos ativos</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ARR (Anual Projetado)</span>
            <div className="text-2xl font-black text-emerald-400 mt-2">{fmtBRL(kpis.arr)}</div>
            <span className="text-xs text-slate-500 mt-1 block">Base anualizada</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taxa Renovação</span>
            <div className="text-2xl font-black text-blue-400 mt-2">{kpis.taxa_renovacao_pct}%</div>
            <span className="text-xs text-slate-500 mt-1 block">Renovação automática</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taxa de Churn</span>
            <div className="text-2xl font-black text-rose-400 mt-2">{kpis.churn_rate_pct}%</div>
            <span className="text-xs text-slate-500 mt-1 block">{kpis.total_cancelados} cancelado(s)</span>
          </div>
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 bg-gradient-to-br from-slate-900 to-amber-950/20">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">⏳ Vencendo em 90 dias</span>
            <div className="text-2xl font-black text-amber-300 mt-2">{kpis.contratos_a_vencer_90d}</div>
            <span className="text-xs text-amber-400/70 mt-1 block">Régua de renovação</span>
          </div>
        </div>
      )}

      {/* PAINEL DE FILTROS AVANÇADOS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 mb-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
            <span>🔍</span> Filtros Avançados de Pesquisa
          </div>
          {(searchTerm || filterStatus !== "todos" || filterPlano !== "todos" || filterCobranca !== "todos") && (
            <button onClick={handleLimparFiltros} className="text-xs text-rose-400 hover:text-rose-300 font-semibold underline transition cursor-pointer">
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Buscar Empresa / CNPJ / Contrato</label>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Ex: Savegnago, 00.000, #0001..." className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tipo de Plano & Escopo</label>
            <select value={filterPlano} onChange={(e) => setFilterPlano(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500">
              <option value="todos">Todos os Planos & Escopos</option>
              {planosDisponiveis.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Modelo de Cobrança</label>
            <select value={filterCobranca} onChange={(e) => setFilterCobranca(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500">
              <option value="todos">Todos os Modelos</option>
              <option value="fixa">Cobrança Fixa Mensal</option>
              <option value="hibrida">Cobrança Híbrida (Fixo + % Economia)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Status do Contrato</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500">
              <option value="todos">Todos os Status</option>
              <option value="ativo">Ativo</option>
              <option value="renovacao_pendente">Renovação Pendente</option>
              <option value="em_negociacao">Em Negociação</option>
              <option value="cancelado">Cancelado / Encerrado</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABELA DE CONTRATOS */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Contratos e Licenças Vigentes</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-bold">
              {filteredContratos.length} resultado(s)
            </span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">Carregando contratos...</div>
        ) : filteredContratos.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">Nenhum contrato encontrado para os filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Contrato</th>
                  <th className="py-3 px-4">Cliente / Razão Social</th>
                  <th className="py-3 px-4">Escopo do Plano</th>
                  <th className="py-3 px-4">Vigência & Reajuste</th>
                  <th className="py-3 px-4">Modelo de Cobrança</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {filteredContratos.map((c) => {
                  const lic = c.contract_licenses?.[0];
                  let obs: any = {};
                  try { obs = JSON.parse(c.observacoes || "{}"); } catch {}
                  const ptsQtd = (lic?.pontos_medicao || obs.pontos_medicao || []).length;

                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-4 px-4 font-bold text-cyan-400">#{String(c.numero_contrato).padStart(4, "0")}</td>
                      <td className="py-4 px-4">
                        <div className="font-bold text-white">{c.clients?.razao_social || "Empresa"}</div>
                        <div className="text-xs text-slate-400">{c.clients?.cnpj || "—"}</div>
                      </td>
                      <td className="py-4 px-4 text-xs">
                        <span className="font-semibold text-slate-200 block">{getNomePlano(c)}</span>
                        <span className="text-[11px] text-cyan-400 font-bold">{ptsQtd} ponto(s) de medição</span>
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-300">
                        <div>{new Date(c.data_inicio).toLocaleDateString("pt-BR")} a {new Date(c.data_fim).toLocaleDateString("pt-BR")}</div>
                        <span className="text-[11px] text-amber-400/90 font-medium">Reajuste: {c.indice_reajuste} (Dia {c.dia_vencimento})</span>
                      </td>
                      <td className="py-4 px-4 text-xs">
                        <div className="font-extrabold text-emerald-400 text-sm">{fmtBRL(c.valor_mensal)}/mês</div>
                        {obs.tipo_cobranca === "hibrida" ? (
                          <span className="text-[10px] text-cyan-300 font-semibold bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">
                            Híbrida (+{obs.percentual_variavel_economia}% economia)
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Mensalidade Fixa</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${c.status === "ativo" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : c.status === "cancelado" ? "bg-rose-950 text-rose-400 border border-rose-800" : "bg-amber-950 text-amber-400 border border-amber-800"}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button onClick={() => handleEditarContrato(c)} className="px-3 py-1.5 rounded-lg bg-cyan-900/60 hover:bg-cyan-800 text-xs font-semibold text-cyan-300 border border-cyan-700/60 transition">
                          ✏️ Editar Contrato
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-6 md:p-8 shadow-2xl my-8">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {editingContractId ? "✏️ Editar Contrato & Parâmetros" : "📑 Novo Contrato & Gestão de Licenças"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure plano, pontos de telemetria, cobrança híbrida e índices de reajuste.
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <form onSubmit={handleSalvar} className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">1. Dados do Cliente</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Razão Social *</label>
                    <input type="text" required value={formData.razao_social} onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })} placeholder="Ex: Savegnago Supermercados Ltda" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">CNPJ</label>
                    <input type="text" value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} placeholder="00.000.000/0001-00" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">2. Tipo de Plano & Escopo</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Plano ou Consultoria Contratada *</label>
                    <select value={formData.tipo_plano_servico} onChange={(e) => setFormData({ ...formData, tipo_plano_servico: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white">
                      {planosDisponiveis.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Status do Contrato</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white">
                      <option value="ativo">Ativo</option>
                      <option value="renovacao_pendente">Renovação Pendente</option>
                      <option value="em_negociacao">Em Negociação</option>
                      <option value="cancelado">Cancelado / Encerrado</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">3. Vigência & Modelo Financeiro (Fixo ou Híbrido)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Data Início</label>
                    <input type="date" required value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Vigência (Meses)</label>
                    <select value={formData.vigencia_meses} onChange={(e) => setFormData({ ...formData, vigencia_meses: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white">
                      <option value="12">12 Meses</option>
                      <option value="24">24 Meses</option>
                      <option value="36">36 Meses</option>
                      <option value="60">60 Meses</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Modelo de Cobrança</label>
                    <select value={formData.tipo_cobranca} onChange={(e) => setFormData({ ...formData, tipo_cobranca: e.target.value as any })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white">
                      <option value="fixa">Cobrança Fixa Mensal</option>
                      <option value="hibrida">Cobrança Híbrida (Fixo + % Economia ACL)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Valor Mensal Base (R$) *</label>
                    <input type="number" step="0.01" required value={formData.valor_mensal} onChange={(e) => setFormData({ ...formData, valor_mensal: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-bold" />
                  </div>
                  {formData.tipo_cobranca === "hibrida" && (
                    <div>
                      <label className="text-xs text-cyan-300 block mb-1">% Variável sobre Economia</label>
                      <input type="number" step="0.1" value={formData.percentual_variavel_economia} onChange={(e) => setFormData({ ...formData, percentual_variavel_economia: parseFloat(e.target.value) || 0 })} placeholder="Ex: 15%" className="w-full bg-slate-950 border border-cyan-800 rounded-xl px-3 py-2 text-sm text-cyan-300 font-bold" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Dia do Vencimento</label>
                    <input type="number" min="1" max="31" value={formData.dia_vencimento} onChange={(e) => setFormData({ ...formData, dia_vencimento: parseInt(e.target.value) || 10 })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>📈</span> Reajuste Anual & Calculadora Preditiva
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Índice Contratual</label>
                    <select value={formData.indice_reajuste} onChange={(e) => setFormData({ ...formData, indice_reajuste: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white">
                      <option value="IPCA">IPCA (IBGE)</option>
                      <option value="IGP-M">IGP-M (FGV)</option>
                      <option value="INPC">INPC (IBGE)</option>
                      <option value="FIXO">Reajuste Fixo Acordado</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">% Estimado de Reajuste Anual</label>
                    <input type="number" step="0.1" value={formData.taxa_reajuste_projetada} onChange={(e) => setFormData({ ...formData, taxa_reajuste_projetada: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white" />
                  </div>
                  <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-xl">
                    <span className="text-[11px] text-slate-400 block">Projeção após 12 meses:</span>
                    <span className="text-base font-extrabold text-amber-300">{fmtBRL(valorProjetadoReajuste)}/mês</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    4. Pontos de Medição / Setores Monitorados ({formData.pontos_medicao.length})
                  </h4>
                  <button type="button" onClick={handleAddPonto} className="px-3 py-1 rounded-lg bg-cyan-950 border border-cyan-800 text-xs font-semibold text-cyan-300 hover:bg-cyan-900 transition">
                    + Adicionar Outro Ponto
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {formData.pontos_medicao.map((p, idx) => (
                    <div key={p.id || idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 items-center">
                      <div className="md:col-span-1 text-xs font-bold text-slate-500 text-center">#{idx + 1}</div>
                      <div className="md:col-span-6">
                        <input type="text" value={p.nome_ponto} onChange={(e) => handleUpdatePonto(idx, "nome_ponto", e.target.value)} placeholder="Nome do ponto (Ex: Trafo 01 - Entrada)" className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white" />
                      </div>
                      <div className="md:col-span-4">
                        <input type="text" value={p.setor_unidade} onChange={(e) => handleUpdatePonto(idx, "setor_unidade", e.target.value)} placeholder="Setor/Local (Ex: Subestação)" className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white" />
                      </div>
                      <div className="md:col-span-1 text-center">
                        <button type="button" onClick={() => handleRemovePonto(idx)} className="text-rose-400 hover:text-rose-300 text-xs font-bold p-1">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold">
                  Cancelar
                </button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 transition">
                  {editingContractId ? "Atualizar Contrato" : "Salvar Contrato & Ativar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
