"use client";

export default function NovaPropostaPage() {
  return (
    <main className="relative h-screen w-full bg-slate-100">
      <div className="absolute right-4 top-4 z-10">
        <button
          type="button"
          onClick={() => (window.location.href = "/dashboard")}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Voltar ao dashboard
        </button>
      </div>

      <iframe
        src="/proposta-base.html"
        className="h-full w-full border-0 bg-white"
        title="Proposta base"
      />
    </main>
  );
}
