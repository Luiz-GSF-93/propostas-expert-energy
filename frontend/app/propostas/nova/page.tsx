"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function NovaPropostaPage() {
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState(1400);

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams();

    const isNew = searchParams.get("new");
    const proposalId = searchParams.get("proposalId");
    const mode = searchParams.get("mode");

    if (isNew === "1") {
      params.set("new", "1");
    }

    if (proposalId) {
      params.set("proposalId", proposalId);
    }

    if (mode) {
      params.set("mode", mode);
    }

    const query = params.toString();
    return `/proposta-base.html${query ? `?${query}` : ""}`;
  }, [searchParams]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let intervalId: number | null = null;

    const updateIframeHeight = () => {
      try {
        const doc =
          iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        const bodyHeight = doc.body?.scrollHeight || 0;
        const htmlHeight = doc.documentElement?.scrollHeight || 0;
        const nextHeight = Math.max(bodyHeight, htmlHeight, 1400);

        if (nextHeight) {
          setIframeHeight(nextHeight + 40);
        }
      } catch (error) {
        console.error("Não foi possível ajustar altura do iframe:", error);
      }
    };

    const setupObservers = () => {
      try {
        const doc =
          iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        updateIframeHeight();

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            updateIframeHeight();
          });

          if (doc.body) resizeObserver.observe(doc.body);
          if (doc.documentElement) resizeObserver.observe(doc.documentElement);
        }

        mutationObserver = new MutationObserver(() => {
          updateIframeHeight();
        });

        if (doc.body) {
          mutationObserver.observe(doc.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });
        }

        intervalId = window.setInterval(() => {
          updateIframeHeight();
        }, 800);
      } catch (error) {
        console.error("Erro ao configurar observers do iframe:", error);
      }
    };

    const handleLoad = () => {
      setupObservers();
      updateIframeHeight();
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      iframe.removeEventListener("load", handleLoad);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [iframeSrc]);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Editor de proposta
          </h1>
          <p className="text-sm text-slate-600">
            Criação, edição e apresentação da proposta comercial.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Voltar ao dashboard
        </Link>
      </div>

      <div className="px-4 pb-6">
        <iframe
          ref={iframeRef}
          key={iframeSrc}
          src={iframeSrc}
          title="Editor de proposta"
          style={{ width: "100%", height: `${iframeHeight}px` }}
          className="rounded-xl border border-slate-200 bg-white shadow"
        />
      </div>
    </main>
  );
}
