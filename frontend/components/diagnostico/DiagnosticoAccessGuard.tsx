"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import {
  canAccessDiagnostics,
  formatNormalizedRoleLabel,
  normalizeUserRole,
  type RoleLikeProfile,
} from "@/lib/roles";

type UserProfile = RoleLikeProfile & {
  id?: string;
  full_name?: string;
  name?: string;
  email?: string;
  company_name?: string | null;
};

type ApiEnvelope<T> = {
  data?: T;
  user?: T;
  profile?: T;
};

async function waitForBrowserSession(timeoutMs = 2500): Promise<Session | null> {
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

async function fetchProfileWithRetry(session: Session): Promise<Response> {
  let response = await apiFetch("/api/auth/me", session.access_token);

  if (response.status !== 401) {
    return response;
  }

  const restoredSession = await waitForBrowserSession(1500);

  if (!restoredSession?.access_token) {
    return response;
  }

  response = await apiFetch("/api/auth/me", restoredSession.access_token);
  return response;
}

export default function DiagnosticoAccessGuard({
  children,
}: {
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        setError("");

        const session = await waitForBrowserSession();

        if (!active) return;

        if (!session?.access_token) {
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        setIsAuthenticated(true);

        const response = await fetchProfileWithRetry(session);

        if (!active) return;

        if (!response.ok) {
          if (response.status === 401) {
            setIsAuthenticated(false);
            setError("Sua sessão expirou. Faça login novamente.");
            setLoading(false);
            return;
          }

          setError("Não foi possível carregar o perfil autenticado.");
          setLoading(false);
          return;
        }

        const profileJson = (await response.json()) as
          | ApiEnvelope<UserProfile>
          | UserProfile
          | null;

        const normalizedProfile =
          (profileJson as ApiEnvelope<UserProfile>)?.data ??
          (profileJson as ApiEnvelope<UserProfile>)?.user ??
          (profileJson as ApiEnvelope<UserProfile>)?.profile ??
          (profileJson as UserProfile) ??
          null;

        setProfile(normalizedProfile);
      } catch (err) {
        console.error(err);
        if (active) {
          setError("Erro ao validar acesso ao módulo Diagnóstico.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    checkAccess();

    return () => {
      active = false;
    };
  }, []);

  const normalizedRole = useMemo(() => normalizeUserRole(profile), [profile]);
  const allowed = useMemo(() => canAccessDiagnostics(profile), [profile]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto flex max-w-3xl items-center justify-center rounded-[28px] border border-slate-200 bg-white p-10 shadow-sm">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Diagnóstico
            </p>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Verificando permissões
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Aguarde enquanto validamos seu acesso ao módulo.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-10 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Acesso necessário
          </p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            Faça login para acessar o Diagnóstico
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {error || "Esta área exige autenticação. Entre com um usuário válido e tente novamente."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Ir para login
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-red-200 bg-white p-10 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">
            Erro de validação
          </p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            Não foi possível validar o acesso
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-amber-200 bg-white p-10 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-600">
            Acesso restrito
          </p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            Seu perfil não possui permissão para acessar o Diagnóstico
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Este módulo está disponível apenas para perfis <strong>Administrador</strong> e{" "}
            <strong>Comercial</strong>.
          </p>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              <strong>Perfil identificado:</strong> {formatNormalizedRoleLabel(normalizedRole)}
            </p>
            {profile?.email ? (
              <p className="mt-1 text-sm text-slate-500">{profile.email}</p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
