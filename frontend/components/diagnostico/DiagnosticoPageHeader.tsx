import Link from "next/link";
import { type ReactNode } from "react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type HeaderAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  icon?: ReactNode;
};

type DiagnosticoPageHeaderProps = {
  badge?: string;
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: HeaderAction[];
};

function getActionClassName(variant: HeaderAction["variant"] = "secondary") {
  switch (variant) {
    case "primary":
      return "bg-slate-900 text-white hover:bg-slate-800 border-slate-900";
    case "ghost":
      return "bg-transparent text-slate-700 hover:bg-slate-100 border-transparent";
    case "secondary":
    default:
      return "bg-white text-slate-700 hover:bg-slate-100 border-slate-300";
  }
}

export default function DiagnosticoPageHeader({
  badge = "Diagnóstico",
  title,
  description,
  breadcrumbs = [],
  actions = [],
}: DiagnosticoPageHeaderProps) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      {breadcrumbs.length > 0 && (
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <div key={`${item.label}-${index}`} className="flex items-center gap-2">
                {item.href && !isLast ? (
                  <Link href={item.href} className="transition hover:text-slate-900">
                    {item.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-medium text-slate-900" : ""}>
                    {item.label}
                  </span>
                )}

                {!isLast && <span className="text-slate-400">/</span>}
              </div>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            {badge}
          </span>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>

          {description ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${getActionClassName(action.variant)}`}
              >
                {action.icon}
                <span>{action.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
