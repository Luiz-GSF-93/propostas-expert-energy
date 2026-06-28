"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

type UserProfile = {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  role?: string;
  role_label?: string;
  profile?: string;
  company_name?: string | null;
};

type ProposalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "archived";

type Proposal = {
  id: string;
  client_name?: string;
  title?: string;
  status?: ProposalStatus | string;
  proposal_code?: string;
  public_slug?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  editable_json?: Record<string, unknown> | null;
};

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Carregando...");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine">("all");

  const [filters, setFilters] = useState({
    status: "",
    client: "",
    code: "",
    date: "",
  });

  function persistAccessToken(token: string) {
    if (!token || typeof window === "undefined") return;

    try {
      localStorage.setItem("access_token", token);
      localStorage.setItem("supabase.access_token", token);
    } catch {
      // silencioso para não quebrar o fluxo
    }
  }

  useEffect(() => {
    async function loadDashboard() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/";
          return;
        }

        setAccessToken(session.access_token);
        persistAccessToken(session.access_token);

        const [profileResponse, proposalsResponse] = await Promise.all([
          apiFetch("/api/auth/me", session.access_token),
          apiFetch("/api/proposals", session.access_token),
        ]);

        if (!profileResponse.ok) {
          setMessage("Não foi possível carregar o usuário autenticado.");
          setLoading(false);
          return;
        }

        const profileJson = await profileResponse.json();
        const normalizedProfile =
          profileJson?.data ??
          profileJson?.user ??
          profileJson?.profile ??
          profileJson ??
          null;

        setProfile(normalizedProfile);

        if (proposalsResponse.ok) {
          const proposalsData = await proposalsResponse.json();

          const normalizedProposals = Array.isArray(proposalsData)
            ? proposalsData
            : Array.isArray(proposalsData?.items)
            ? proposalsData.items
            : Array.isArray(proposalsData?.data)
            ? proposalsData.data
            : Array.isArray(proposalsData?.proposals)
            ? proposalsData.proposals
            : Array.isArray(proposalsData?.rows)
            ? proposalsData.rows
            : [];

          setProposals(normalizedProposals);
        } else {
          setProposals([]);
        }

        setMessage("");
        setLoading(false);
      } catch (error) {
        console.error(error);
        setMessage("Erro ao carregar o dashboard.");
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.status, filters.client, filters.code, filters.date, scopeFilter]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function handleNewProposal() {
    if (accessToken) {
      persistAccessToken(accessToken);
    }
    window.location.href = "/proposta-base.html?new=1";
  }

  function handleEditProposal(proposalId: string) {
    if (accessToken) {
      persistAccessToken(accessToken);
    }
    window.location.href = `/proposta-base.html?proposalId=${proposalId}&mode=edit`;
  }

  function normalizeStatus(status?: string): ProposalStatus | string {
    if (!status) return "draft";

    const normalized = String(status).toLowerCase();

    switch (normalized) {
      case "draft":
      case "pending":
      case "approved":
      case "rejected":
      case "published":
      case "archived":
        return normalized;
      default:
        return normalized;
    }
  }

  function formatStatus(status?: string) {
    switch (normalizeStatus(status)) {
      case "draft":
        return "Rascunho";
      case "pending":
        return "Enviada";
      case "approved":
        return "Aprovada";
      case "rejected":
        return "Cancelada";
      case "published":
        return "Publicada";
      case "archived":
        return "Arquivada";
      default:
        return status || "Sem status";
    }
  }

  function getStatusClasses(status?: string) {
    switch (normalizeStatus(status)) {
      case "approved":
      case "published":
        return "bg-emerald-100 text-emerald-700";
      case "pending":
        return "bg-amber-100 text-amber-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      case "archived":
        return "bg-slate-200 text-slate-700";
      case "draft":
      default:
        return "bg-blue-100 text-blue-700";
    }
  }

  function formatDate(date?: string) {
    if (!date) return "Não informada";

    try {
      return new Date(date).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return date;
    }
  }

  function formatRole(role?: string) {
    switch ((role || "").toLowerCase()) {
      case "seller":
        return "Comercial";
      case "admin":
        return "Administrador";
      case "manager":
        return "Gestor";
      default:
        return role || "Não informado";
    }
  }

  function handleFilterChange(
    field: "status" | "client" | "code" | "date",
    value: string
  ) {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function clearFilters() {
    setFilters({
      status: "",
      client: "",
      code: "",
      date: "",
    });
    setScopeFilter("all");
    setCurrentPage(1);
  }

  const isAdmin = (profile?.role || "").toLowerCase() === "admin";

  function isOwnProposal(proposal: Proposal) {
    return !!profile?.id && proposal.created_by === profile.id;
  }

  function formatCreator(proposal: Proposal) {
    const creatorName = proposal.created_by_name?.trim();
    const creatorEmail = proposal.created_by_email?.trim();

    if (profile?.id && proposal.created_by === profile.id) {
      if (creatorName && creatorEmail) return `Você (${creatorName} - ${creatorEmail})`;
      if (creatorName) return `Você (${creatorName})`;
      if (creatorEmail) return `Você (${creatorEmail})`;
      return "Você";
    }

    if (creatorName && creatorEmail) return `${creatorName} (${creatorEmail})`;
    if (creatorName) return creatorName;
    if (creatorEmail) return creatorEmail;
    if (proposal.created_by) return proposal.created_by;

    return "Não informado";
  }

  const filteredProposals = useMemo(() => {
    return proposals.filter((proposal) => {
      if (isAdmin && scopeFilter === "mine" && !isOwnProposal(proposal)) {
        return false;
      }

      const proposalStatus = String(proposal.status || "").toLowerCase();
      const clientName = String(proposal.client_name || "").toLowerCase();
      const proposalCode = String(proposal.proposal_code || "").toLowerCase();
      const updatedDate = proposal.updated_at || proposal.created_at || "";

      const matchesStatus = filters.status
        ? proposalStatus === filters.status.toLowerCase()
        : true;

      const matchesClient = filters.client
        ? clientName.includes(filters.client.toLowerCase())
        : true;

      const matchesCode = filters.code
        ? proposalCode.includes(filters.code.toLowerCase())
        : true;

      const matchesDate = filters.date
        ? updatedDate
          ? new Date(updatedDate).toISOString().slice(0, 10) === filters.date
          : false
        : true;

      return matchesStatus && matchesClient && matchesCode && matchesDate;
    });
  }, [proposals, filters, isAdmin, scopeFilter, profile?.id]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProposals.length / PAGE_SIZE)
  );
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedProposals = filteredProposals.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  async function updateProposalStatus(
    proposalId: string,
    newStatus: "draft" | "pending" | "approved" | "rejected"
  ) {
    if (!proposalId || !accessToken) return;

    setUpdatingStatusId(proposalId);

    const previousProposals = proposals;

    setProposals((current) =>
      current.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              status: newStatus,
            }
          : proposal
      )
    );

    try {
      let response = await apiFetch(
        `/api/proposals/${proposalId}/status`,
        accessToken,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        response = await apiFetch(`/api/proposals/${proposalId}`, accessToken, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: newStatus }),
        });
      }

      if (!response.ok) {
        throw new Error("Não foi possível atualizar o status da proposta.");
      }

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      const updatedStatus =
        result?.status ||
        result?.data?.status ||
        result?.proposal?.status ||
        newStatus;

      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === proposalId
            ? {
                ...proposal,
                status: updatedStatus,
              }
            : proposal
        )
      );
    } catch (error) {
      console.error(error);
      setProposals(previousProposals);
      window.alert("Não foi possível atualizar o status da proposta.");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-700">{message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
              <p className="text-sm text-slate-600">
                Área interna do sistema de propostas.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleNewProposal}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
              >
                Nova proposta
              </button>

              <button
                onClick={handleLogout}
                className="rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
              >
                Sair
              </button>
            </div>
          </div>

          {profile ? (
            <>
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nome
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {profile.full_name || profile.name || "Não informado"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    E-mail
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {profile.email || "Não informado"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Perfil
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {profile.profile ||
                        profile.role_label ||
                        formatRole(profile.role) ||
                        "Não informado"}
                    </p>

                    {isAdmin && (
                      <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                        Administrador
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Você está em modo administrador e pode visualizar propostas de
                  todos os usuários.
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-red-600">Perfil não encontrado.</p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Propostas salvas
                </h2>
                <p className="text-sm text-slate-600">
                  Lista das propostas já registradas no sistema.
                </p>
              </div>

              <div className="text-sm text-slate-500">
                Total filtrado: <strong>{filteredProposals.length}</strong>
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
              {isAdmin && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Escopo
                  </label>
                  <select
                    value={scopeFilter}
                    onChange={(e) =>
                      setScopeFilter(e.target.value as "all" | "mine")
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="all">Todas as propostas</option>
                    <option value="mine">Somente minhas</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tag / status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="">Todos</option>
                  <option value="draft">Rascunho</option>
                  <option value="pending">Enviada</option>
                  <option value="approved">Aprovada</option>
                  <option value="rejected">Cancelada</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Cliente
                </label>
                <input
                  type="text"
                  value={filters.client}
                  onChange={(e) => handleFilterChange("client", e.target.value)}
                  placeholder="Pesquisar cliente"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Número / código
                </label>
                <input
                  type="text"
                  value={filters.code}
                  onChange={(e) => handleFilterChange("code", e.target.value)}
                  placeholder="Pesquisar código"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Data
                </label>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => handleFilterChange("date", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>

          {filteredProposals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-slate-600">
                Nenhuma proposta encontrada com os filtros aplicados.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {proposal.client_name || "Cliente não informado"}
                          </h3>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                              proposal.status
                            )}`}
                          >
                            {formatStatus(proposal.status)}
                          </span>
                        </div>

                        <p className="text-sm text-slate-700">
                          <strong>Título:</strong>{" "}
                          {proposal.title || "Sem título"}
                        </p>

                        <p className="text-sm text-slate-700">
                          <strong>Código:</strong>{" "}
                          {proposal.proposal_code || "Não informado"}
                        </p>

                        <p className="text-sm text-slate-700">
                          <strong>Criado por:</strong> {formatCreator(proposal)}
                        </p>

                        <p className="text-sm text-slate-500">
                          <strong>Atualizado em:</strong>{" "}
                          {formatDate(proposal.updated_at || proposal.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 md:items-end">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditProposal(proposal.id)}
                            disabled={!proposal.id}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Abrir / editar
                          </button>

                          {proposal.public_slug ? (
                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  `/public/${proposal.public_slug}`,
                                  "_blank"
                                )
                              }
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                            >
                              Ver versão pública
                            </button>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Alterar tag
                          </label>

                          <select
                            value={String(proposal.status || "draft")}
                            onChange={(e) =>
                              updateProposalStatus(
                                proposal.id,
                                e.target.value as
                                  | "draft"
                                  | "pending"
                                  | "approved"
                                  | "rejected"
                              )
                            }
                            disabled={
                              !proposal.id || updatingStatusId === proposal.id
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="draft">Rascunho</option>
                            <option value="pending">Enviada</option>
                            <option value="approved">Aprovada</option>
                            <option value="rejected">Cancelada</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-slate-500">
                  Exibindo{" "}
                  <strong>
                    {startIndex + 1}-
                    {Math.min(startIndex + PAGE_SIZE, filteredProposals.length)}
                  </strong>{" "}
                  de <strong>{filteredProposals.length}</strong> propostas
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={currentPage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <span className="text-sm text-slate-600">
                    Página <strong>{currentPage}</strong> de{" "}
                    <strong>{totalPages}</strong>
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
