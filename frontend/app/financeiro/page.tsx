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
        if (!sessData?.session?.access_token) {
          if (!alive) return;
          setForbidden(true);
          setReady(true);
          return;
        }
        try {
          const { data: prof } = await supabase
            .from("profiles").select("role").maybeSingle();
          if (!alive) return;
          setForbidden(String(prof?.role || "").toLowerCase() !== "admin");
        } catch {
          if (!alive) return;
          setForbidden(true);
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
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
      subtitle="Módulo financeiro integrado com IA — leitura dos módulos instalados."
    >
      <FinanceAISection />
    </FinanceModuleShell>
  );
}
