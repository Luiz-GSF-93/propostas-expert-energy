"use client";

import { useEffect, useRef } from "react";

export default function NovaPropostaPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let resizeObserver: ResizeObserver | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const resizeIframe = () => {
      try {
        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        const body = doc.body;
        const html = doc.documentElement;

        const height = Math.max(
          body?.scrollHeight || 0,
          body?.offsetHeight || 0,
          html?.scrollHeight || 0,
          html?.offsetHeight || 0,
          html?.clientHeight || 0
        );

        iframe.style.height = `${height + 40}px`;
      } catch (error) {
        console.error("Erro ao redimensionar iframe:", error);
      }
    };

    const onLoad = () => {
      resizeIframe();

      try {
        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        resizeObserver = new ResizeObserver(() => {
          resizeIframe();
        });

        if (doc.body) resizeObserver.observe(doc.body);
        if (doc.documentElement) resizeObserver.observe(doc.documentElement);

        intervalId = setInterval(resizeIframe, 1000);
      } catch (error) {
        console.error("Erro ao observar altura do iframe:", error);
      }
    };

    iframe.addEventListener("load", onLoad);
    window.addEventListener("resize", resizeIframe);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("resize", resizeIframe);
      if (resizeObserver) resizeObserver.disconnect();
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Nova proposta</h1>
          <p className="text-sm text-slate-600">
            Visualização da proposta comercial base em HTML.
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
        ref={iframeRef}
        src="/proposta-base.html"
        title="Proposta base"
        className="block w-full border-0 bg-white"
        style={{ minHeight: "1400px" }}
      />
    </main>
  );
}
