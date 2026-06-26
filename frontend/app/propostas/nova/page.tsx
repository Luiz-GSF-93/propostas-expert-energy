"use client";

export default function NovaPropostaPage() {
  return (
    <main className="h-screen w-full bg-slate-100">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Nova proposta
            </h1>
            <p className="text-sm text-slate-600">
              Editor da proposta comercial base em HTML.
            </p>
          </div>

          <button
            type="button"
            onClick={() => (window.location.href = "/dashboard")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar ao dashboard
          </button>
        </div>

        <iframe
          src="/proposta-base.html"
          className="h-full w-full border-0"
          title="Proposta base"
        />
      </div>
    </main>
  );
}
