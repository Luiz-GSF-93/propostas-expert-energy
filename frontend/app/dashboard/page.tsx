"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

type Proposal = {
  id: string;
  client_name?: string;
  title?: string;
  status?: string;
  proposal_code?: string;
  public_slug?: string;
  created_at?: string;
  updated_at?: string;
};

export default function DashboardPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Carregando...");
  const [profile, setProfile] = useState<UserProfile | null>(null);

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

        const [profileResponse, proposalsResponse] = await Promise.all([
          apiFetch("/api/auth/me", session.access_token),
          apiFetch("/api/proposals", session.access_token),
        ]);

        if (!profileResponse.ok) {
          setMessage("Não foi possível carregar o usuário autenticado.");
          setLoading(false);
          return;
        }

        const profileData = await profileResponse.json();
        setProfile(profileData);

        if (proposalsResponse.ok) {
          const proposalsData = await proposalsResponse.json();

          const normalizedProposals = Array.isArray(proposalsData)
            ? proposalsData
            : Array.isArray(proposalsData?.items)
            ? proposalsData.items
            : Array.isArray(proposalsData?.data)
            ? proposalsData.data
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

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function formatStatus(status?: string) {
    switch (status) {
      case "draft":
        return "Rascunho";
      case "pending":
        return "Pendente";
      case "approved":
        return "Aprovada";
      case "rejected":
        return "Rejeitada";
      case "published":
        return "Publicada";
      case "archived":
        return "Arquivada";
      default:
        return status || "Sem status";
    }
  }

  function getStatusClasses(status?: string) {
    switch (status) {
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
                onClick={() => (window.location.href = "/propostas/nova")}
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
            <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nome
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {profile.full_name || "Não informado"}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  E-mail
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {profile.email}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Perfil
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {profile.role}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-600">Perfil não encontrado.</p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Propostas salvas
              </h2>
              <p className="text-sm text-slate-600">
                Lista das propostas já registradas no sistema.
              </p>
            </div>
          </div>

          {proposals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-slate-600">
                Nenhuma proposta salva ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {proposals.map((proposal) => (
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

                      <p className="text-sm text-slate-500">
                        <strong>Atualizado em:</strong>{" "}
                        {formatDate(proposal.updated_at || proposal.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          alert(
                            "A rota de edição individual será criada na próxima etapa. Por enquanto, a lista já confirma que a proposta foi salva no sistema."
                          )
                        }
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Abrir / editar
                      </button>

                      {proposal.public_slug ? (
                        <button
                          type="button"
                          onClick={() =>
                            window.open(`/public/${proposal.public_slug}`, "_blank")
                          }
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                          Ver versão pública
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
