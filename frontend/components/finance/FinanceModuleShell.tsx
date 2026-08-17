"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type FinanceModuleShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  enabled: boolean;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
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
    href: "/financeiro/custos",
    enabled: true,
  },
  {
    label: "Planejamento",
    href: "/financeiro/planejamento",
    enabled: true,
    adminOnly: true,
  },
  {
    label: "Empréstimos",
    href: "/financeiro/emprestimos",
    enabled: true,
  },
];

export default function FinanceModuleShell({
  title,
  subtitle,
  children,
}: FinanceModuleShellProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProfileRole() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user;

        if (!user) {
          if (mounted) setIsAdmin(false);
          return;
        }

        let profileRow: {
          id?: string;
          email?: string;
          role?: string;
          is_active?: boolean;
          full_name?: string | null;
        } | null = null;

        const { data: byId, error: byIdError } = await supabase
          .from("profiles")
          .select("id, email, role, is_active, full_name")
          .eq("id", user.id)
          .maybeSingle();

        if (!byIdError && byId) {
          profileRow = byId;
        }

        if (!profileRow && user.email) {
          const { data: byEmail, error: byEmailError } = await supabase
            .from("profiles")
            .select("id, email, role, is_active, full_name")
            .eq("email", user.email)
            .maybeSingle();

          if (!byEmailError && byEmail) {
            profileRow = byEmail;
          }
        }

        const admin =
          Boolean(profileRow) &&
          profileRow?.is_active !== false &&
          String(profileRow?.role || "").toLowerCase() === "admin";

        if (mounted) {
          setIsAdmin(admin);
        }
      } catch (error) {
        console.error("finance.shell.profile.error", error);
        if (mounted) {
          setIsAdmin(false);
        }
      }
    }

    loadProfileRole();

    return () => {
      mounted = false;
    };
  }, []);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-white lg:min-h-screen lg:w-80 lg:border-b-0 lg:border-r">
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">
              Expert Energy
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
            ) : null}

            <div className="mt-5">
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                ← Voltar para Dashboard
              </Link>
            </div>
          </div>

          <nav className="px-4 pb-6">
            <div className="space-y-2">
              {visibleNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/financeiro" && pathname?.startsWith(item.href));

                const baseClass =
                  "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition";

                if (!item.enabled) {
                  return (
                    <span
                      key={item.label}
                      className={`${baseClass} cursor-not-allowed bg-slate-100 text-slate-400`}
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] uppercase tracking-[0.2em]">Em breve</span>
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={
                      isActive
                        ? `${baseClass} bg-slate-900 text-white shadow-sm`
                        : `${baseClass} bg-white text-slate-700 hover:bg-slate-100`
                    }
                  >
                    <span>{item.label}</span>
                    {isActive ? (
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">
                        Atual
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
