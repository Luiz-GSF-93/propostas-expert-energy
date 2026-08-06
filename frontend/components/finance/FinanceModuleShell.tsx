"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

const navItems = [
  {
    label: "Visão Geral",
    href: "/financeiro",
    enabled: true,
  },
  {
    label: "Fluxo de Caixa",
    href: "/financeiro/fluxo-caixa",
    enabled: true,
  },
  {
    label: "DRE",
    href: "/financeiro/dre",
    enabled: true,
  },
  {
    label: "Custos",
    href: "#",
    enabled: false,
  },
  {
    label: "Planejamento",
    href: "#",
    enabled: false,
  },
  {
    label: "Empréstimos",
    href: "#",
    enabled: false,
  },
];

export default function FinanceModuleShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_#0f172a_0%,_#1e293b_45%,_#334155_100%)] px-5 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                Módulo Financeiro
              </p>
              <h2 className="mt-2 text-2xl font-bold">Gestão Financeira</h2>
              <p className="mt-2 text-sm text-slate-300">
                Navegação administrativa do ambiente financeiro.
              </p>
            </div>

            <div className="space-y-2 p-4">
              <Link
                href="/dashboard"
                className="mb-2 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                ← Voltar ao dashboard
              </Link>

              {navItems.map((item) => {
                const active =
                  item.enabled &&
                  (pathname === item.href ||
                    (item.href !== "/financeiro" && pathname.startsWith(item.href)));

                if (!item.enabled) {
                  return (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    >
                      <span className="font-medium text-slate-500">{item.label}</span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        Em breve
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition ${
                      active
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                        atual
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="bg-[linear-gradient(135deg,_#0f172a_0%,_#1e293b_45%,_#334155_100%)] px-6 py-6 text-white md:px-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                  {subtitle ? (
                    <p className="mt-2 max-w-3xl text-sm text-slate-300">{subtitle}</p>
                  ) : null}
                </div>

                <div className="lg:hidden">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                  >
                    ← Dashboard
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {children}
        </section>
      </div>
    </main>
  );
}
