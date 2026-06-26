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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Carregando...");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/";
        return;
      }

      const response = await apiFetch("/api/auth/me", session.access_token);

      if (!response.ok) {
        setMessage("Não foi possível carregar o usuário autenticado.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      setProfile(data);
      setMessage("");
      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>{message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-4xl mx-auto rounded-2xl bg-white p-8 shadow">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-600">
              Área interna do sistema de propostas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => (window.location.href = "/propostas/nova")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Nova proposta
            </button>

            <button
              onClick={handleLogout}
              className="rounded-lg bg-slate-900 px-4 py-2 text-white"
            >
              Sair
            </button>
          </div>
        </div>

        {profile ? (
          <div className="space-y-2">
            <p><strong>Nome:</strong> {profile.full_name || "Não informado"}</p>
            <p><strong>E-mail:</strong> {profile.email}</p>
            <p><strong>Perfil:</strong> {profile.role}</p>
          </div>
        ) : (
          <p>Perfil não encontrado.</p>
        )}
      </div>
    </main>
  );
}
