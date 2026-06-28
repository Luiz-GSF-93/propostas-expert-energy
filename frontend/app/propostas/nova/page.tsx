"use client";

import { useEffect } from "react";

export default function NovaPropostaPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (!params.has("new")) {
      params.set("new", "1");
    }

    const queryString = params.toString();
    const targetUrl = `/proposta-base.html${queryString ? `?${queryString}` : ""}`;

    window.location.replace(targetUrl);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <h1 className="text-xl font-semibold text-slate-900">
          Abrindo editor de proposta
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Você está sendo redirecionado para o editor da proposta.
        </p>
      </div>
    </main>
  );
}
