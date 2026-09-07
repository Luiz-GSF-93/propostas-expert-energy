"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import FinanceModuleShell from "@/components/finance/FinanceModuleShell";
import FinanceAISection from "@/components/finance/FinanceAISection";

export default function FinanceiroPage() {
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: sessData } = await supabase.auth.getSession();
        const user = sessData?.session?.user;

        if (!sessData?.session?.access_token || !user) {
          if (!alive) return;
          setForbidden(true);
          setReady(true);
          return;
        }

        // 1. Emails administradores mestres conhecidos (acesso garantido)
        const userEmail = (user.email || "").toLowerCase().trim();
        const masterAdmins = ["luizdigi@gmail.com", "admin@expertenergy.com.br", "contato@expertenergy.com.br"];
        if (masterAdmins.includes(userEmail)) {
          if (!alive) return;
          setForbidden(false);
          setReady(true);
          return;
        }

        // 2. Checar metadados do Supabase Auth
        const metaRole = String(user.user_metadata?.role || user.app_metadata?.role || "").toLowerCase();
        if (["admin", "administrator", "administrador", "superadmin"].includes(metaRole)) {
          if (!alive) return;
          setForbidden(false);
          setReady(true);
          return;
        }

        // 3. Consultar perfil específico pelo ID do usuário
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

          if (!alive) return;
          const role = String(prof?.role || "").toLowerCase().trim();
          const isAdmin = ["admin", "administrator", "administrador", "superadmin"].includes(role);
          setForbidden(!isAdmin);
        } catch {
          if (!alive) return;
          setForbidden(true);
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <FinanceModuleShell title="Visão Geral Financeira" subtitle="Carregando módulo financeiro...">
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-600">Carregando módulo financeiro...</p>
        </section>
      </FinanceModuleShell>
    );
  }

  if (forbidden) {
    return (
      <FinanceModuleShell title="Visão Geral Financeira" subtitle="Módulo restrito ao administrador.">
        <section className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
          <p className="text-red-600">Acesso restrito ao administrador.</p>
        </section>
      </FinanceModuleShell>
    );
  }

  return (
    <FinanceModuleShell
      title="Visão Geral Financeira"
      subtitle="Módulo financeiro executivo com inteligência analítica"
    >
      <FinanceAISection />
    </FinanceModuleShell>
  );
}
