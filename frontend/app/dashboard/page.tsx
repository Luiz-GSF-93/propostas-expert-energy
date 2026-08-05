"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import GoalsPanel from "./GoalsPanel";

type UserProfile = {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  role?: string;
  role_label?: string;
  profile?: string;
  company_name?: string | null;
};

type ProposalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "archived";

type Proposal = {
  id: string;
  client_name?: string;
  title?: string;
  status?: ProposalStatus | string;
  proposal_code?: string;
  public_slug?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  editable_json?: Record<string, unknown> | null;
};

type DashboardMetrics = {
  totalCount: number;
  totalValue: number;
  approvedCount: number;
  approvedValue: number;
  pendingCount: number;
  pendingValue: number;
  draftCount: number;
  draftValue: number;
  rejectedCount: number;
  rejectedValue: number;
  conversionRate: number;
  averageTicket: number;
};

type ScopeFilter = "all" | "mine";
type AgendaFilter = "all" | "scheduled" | "unscheduled" | "overdue";
type EditableStatus = "draft" | "pending" | "approved" | "rejected";

type ApiEnvelope<T> = {
  data?: T;
  items?: T;
  user?: T;
  profile?: T;
  proposal?: T;
  proposals?: T;
  rows?: T;
  status?: string;
};

const PAGE_SIZE = 10;

function MetricCard({
  title,
  value,
  subtitle,
  valueClassName = "text-slate-900",
}: {
  title: string;
  value: string;
  subtitle?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <p className={`mt-3 text-2xl font-bold ${valueClassName}`}>{value}</p>
      {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M7 16V10" strokeLinecap="round" />
      <path d="M12 16V6" strokeLinecap="round" />
      <path d="M17 16v-4" strokeLinecap="round" />
    </svg>
  );
}

function IconFinance() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10l9-6 9 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9" strokeLinecap="round" />
      <path d="M19 10v9" strokeLinecap="round" />
      <path d="M9 10v9" strokeLinecap="round" />
      <path d="M15 10v9" strokeLinecap="round" />
      <path d="M3 19h18" strokeLinecap="round" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" strokeLinecap="round" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" />
      <path d="M16 4.13a3 3 0 0 1 0 5.74" strokeLinecap="round" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
      <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" strokeLinecap="round" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function SidebarActionButton({
  icon,
  label,
  onClick,
  collapsed,
  className,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  collapsed: boolean;
  className: string;
  title?: string;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        title={title || label}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${collapsed ? "justify-center" : "justify-start"} ${className}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          {icon}
        </span>
        {!collapsed && <span className="truncate">{label}</span>}
      </button>

      {collapsed && (
        <div className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium whitespace-nowrap text-white shadow-xl group-hover:block">
          {label}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState(0);
  const [serverPageCount, setServerPageCount] = useState(1);
  const [serverMetricsRows, setServerMetricsRows] = useState<Array<Partial<Proposal>>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Carregando...");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [updatingNextContactId, setUpdatingNextContactId] = useState<string | null>(null);
  const [nextContactDrafts, setNextContactDrafts] = useState<Record<string, string>>({});
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [autoSortByAgenda, setAutoSortByAgenda] = useState(true);
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>("all");
  const [quickAccessCollapsed, setQuickAccessCollapsed] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [filters, setFilters] = useState({
    status: "",
    client: "",
    code: "",
    dateStart: "",
    dateEnd: "",
    user: "",
  });

  function persistAccessToken(token: string) {
    if (!token || typeof window === "undefined") return;

    try {
      localStorage.setItem("access_token", token);
      localStorage.setItem("supabase.access_token", token);
    } catch {
      // silencioso para não quebrar o fluxo
    }
  }

  function getDateOnly(value?: string) {
    if (!value) return "";

    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  useEffect(() => {
    async function loadDashboard() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/";
          return;
        }

        setAccessToken(session.access_token);
        persistAccessToken(session.access_token);

        const [profileResponse, proposalsResponse] = await Promise.all([
          apiFetch("/api/auth/me", session.access_token),
          (() => {
            const params = new URLSearchParams({
              page: String(currentPage),
              limit: String(PAGE_SIZE),
            });

            if (filters.status?.trim()) {
              params.set("status", filters.status.trim());
            }

            const backendSearch = [filters.client, filters.code]
              .map((value) => String(value || "").trim())
              .filter(Boolean)
              .join(" ");

            if (backendSearch) {
                params.set("search", backendSearch);
              }

              if (filters.user?.trim()) {
                params.set("user", filters.user.trim());
              }

              if (filters.dateStart?.trim()) {
                params.set("dateStart", filters.dateStart.trim());
              }

              if (filters.dateEnd?.trim()) {
                params.set("dateEnd", filters.dateEnd.trim());
              }

              return apiFetch(`/api/proposals?${params.toString()}`, session.access_token);
          })(),
        ]);

        if (!profileResponse.ok) {
          setMessage("Não foi possível carregar o usuário autenticado.");
          setLoading(false);
          return;
        }

        const profileJson = (await profileResponse.json()) as
          | ApiEnvelope<UserProfile>
          | UserProfile
          | null;

        const normalizedProfile =
          (profileJson as ApiEnvelope<UserProfile>)?.data ??
          (profileJson as ApiEnvelope<UserProfile>)?.user ??
          (profileJson as ApiEnvelope<UserProfile>)?.profile ??
          (profileJson as UserProfile) ??
          null;

        setProfile(normalizedProfile);

        if (proposalsResponse.ok) {
          const proposalsData = (await proposalsResponse.json()) as
            | ApiEnvelope<Proposal[]>
            | Proposal[]
            | null;

          const normalizedProposals = Array.isArray(proposalsData)
            ? proposalsData
            : Array.isArray((proposalsData as ApiEnvelope<Proposal[]>)?.items)
            ? ((proposalsData as ApiEnvelope<Proposal[]>)?.items as Proposal[])
            : Array.isArray((proposalsData as ApiEnvelope<Proposal[]>)?.data)
            ? ((proposalsData as ApiEnvelope<Proposal[]>)?.data as Proposal[])
            : Array.isArray((proposalsData as ApiEnvelope<Proposal[]>)?.proposals)
            ? ((proposalsData as ApiEnvelope<Proposal[]>)?.proposals as Proposal[])
            : Array.isArray((proposalsData as ApiEnvelope<Proposal[]>)?.rows)
            ? ((proposalsData as ApiEnvelope<Proposal[]>)?.rows as Proposal[])
            : [];

          const proposalsEnvelope = proposalsData as any;
          const totalFromApi =
            proposalsEnvelope?.pagination?.total ??
            proposalsEnvelope?.meta?.total ??
            normalizedProposals.length;
          const totalPagesFromApi =
            proposalsEnvelope?.pagination?.totalPages ??
            Math.max(1, Math.ceil((totalFromApi || normalizedProposals.length) / PAGE_SIZE));

          setServerTotalCount(totalFromApi || normalizedProposals.length);
          setServerPageCount(totalPagesFromApi || 1);
          setServerMetricsRows(
            Array.isArray(proposalsEnvelope?.metrics?.rows)
              ? (proposalsEnvelope.metrics.rows as Array<Partial<Proposal>>)
              : []
          );
          setProposals(normalizedProposals);
        } else {
          setServerMetricsRows([]);
          setProposals([]);
        }

        setMessage("");
        setLoading(false);
      } catch (error) {
        console.error(error);
        setMessage("Erro ao carregar o dashboard.");
        setLoading(false);
      }
    }

    loadDashboard();
  }, [currentPage, filters.status, filters.client, filters.code, filters.user, filters.dateStart, filters.dateEnd]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    filters.status,
    filters.client,
    filters.code,
    filters.dateStart,
    filters.dateEnd,
    filters.user,
    scopeFilter,
    agendaFilter,
  ]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function handleNewProposal() {
    if (accessToken) {
      persistAccessToken(accessToken);
    }
    window.location.href = "/proposta-base.html?new=1";
  }

  function handleOpenDicFicSimulator() {
    window.open(
      "https://luiz-gsf-93.github.io/Simulador-DIC-FIC-com-ROI/",
      "_blank",
      "noopener,noreferrer"
    );
  }

  function handleOpenEnergyLinkProposal() {
    window.open(
      "https://luiz-gsf-93.github.io/new-proposta-energy-link/",
      "_blank",
      "noopener,noreferrer"
    );
  }

  function handleOpenAjudaComercial() {
    window.open(
      "https://luiz-gsf-93.github.io/Ajuda-Comercial-E-Link/",
      "_blank",
      "noopener,noreferrer"
    );
  }

  function handleOpenContactsRegistry() {
    window.location.href = "/contatos";
  }

  function handleOpenFinancialManagement() {
    window.location.href = "/financeiro";
  }

  function handleEditProposal(proposalId: string) {
    if (accessToken) {
      persistAccessToken(accessToken);
    }
    window.location.href = `/proposta-base.html?proposalId=${proposalId}&mode=edit`;
  }

  function normalizeStatus(status?: string): ProposalStatus | string {
    if (!status) return "draft";

    const normalized = String(status).toLowerCase().trim();

    switch (normalized) {
      case "sent":
        return "pending";
      case "cancelled":
      case "canceled":
        return "rejected";
      case "draft":
      case "pending":
      case "approved":
      case "rejected":
      case "published":
      case "archived":
        return normalized;
      default:
        return normalized;
    }
  }

  function getEditableStatusValue(status?: string): EditableStatus {
    const normalized = normalizeStatus(status);

    switch (normalized) {
      case "pending":
        return "pending";
      case "approved":
      case "published":
        return "approved";
      case "rejected":
      case "archived":
        return "rejected";
      case "draft":
      default:
        return "draft";
    }
  }

  function formatStatus(status?: string) {
    switch (normalizeStatus(status)) {
      case "draft":
        return "Rascunho";
      case "pending":
        return "Enviada";
      case "approved":
        return "Aprovada";
      case "rejected":
        return "Cancelada";
      case "published":
        return "Publicada";
      case "archived":
        return "Arquivada";
      default:
        return status || "Sem status";
    }
  }

  function getStatusClasses(status?: string) {
    switch (normalizeStatus(status)) {
      case "approved":
      case "published":
        return "bg-emerald-100 text-emerald-700";
      case "pending":
        return "bg-amber-100 text-amber-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      case "archived":
        return "bg-slate-200 text-slate-700";
      case "draft":
      default:
        return "bg-blue-100 text-blue-700";
    }
  }

  function formatDate(date?: string) {
    if (!date) return "Não informada";

    try {
      return new Date(date).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return date;
    }
  }

  function formatRole(role?: string) {
    switch ((role || "").toLowerCase()) {
      case "seller":
        return "Comercial";
      case "admin":
        return "Administrador";
      case "manager":
        return "Gestor";
      default:
        return role || "Não informado";
    }
  }

  function canScheduleNextContact(proposal: Proposal) {
    const status = normalizeStatus(proposal.status);
    return status === "draft" || status === "pending";
  }

  function getNextContactDate(proposal: Proposal) {
    const editable =
      proposal.editable_json && typeof proposal.editable_json === "object"
        ? (proposal.editable_json as Record<string, unknown>)
        : null;

    const rootValue =
      editable && typeof editable.next_contact_date === "string"
        ? editable.next_contact_date
        : "";

    if (rootValue) {
      return String(rootValue).slice(0, 10);
    }

    const fields =
      editable?.fields && typeof editable.fields === "object"
        ? (editable.fields as Record<string, unknown>)
        : null;

    const fieldsValue =
      fields && typeof fields.next_contact_date === "string"
        ? fields.next_contact_date
        : "";

    return fieldsValue ? String(fieldsValue).slice(0, 10) : "";
  }

  function getNextContactInputValue(proposal: Proposal) {
    return nextContactDrafts[proposal.id] ?? getNextContactDate(proposal);
  }

  function handleNextContactDraftChange(proposalId: string, value: string) {
    setNextContactDrafts((current) => ({
      ...current,
      [proposalId]: value,
    }));
  }

  function formatNextContactDate(value?: string) {
    if (!value) return "Não agendado";

    try {
      return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
    } catch {
      return value;
    }
  }

  function getNextContactStatus(proposal: Proposal) {
    const rawDate = getNextContactInputValue(proposal) || getNextContactDate(proposal);

    if (!rawDate) {
      return {
        label: "Sem data agendada",
        containerClassName: "border-slate-200 bg-slate-50",
        badgeClassName: "bg-slate-200 text-slate-700",
        textClassName: "text-slate-600",
      };
    }

    const today = new Date();
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const nextContact = new Date(`${rawDate}T00:00:00`);
    const nextContactOnly = new Date(
      nextContact.getFullYear(),
      nextContact.getMonth(),
      nextContact.getDate()
    );

    if (nextContactOnly.getTime() < todayOnly.getTime()) {
      return {
        label: "Atrasado",
        containerClassName: "border-red-200 bg-red-50",
        badgeClassName: "bg-red-100 text-red-700",
        textClassName: "text-red-700",
      };
    }

    if (nextContactOnly.getTime() === todayOnly.getTime()) {
      return {
        label: "Vence hoje",
        containerClassName: "border-amber-200 bg-amber-50",
        badgeClassName: "bg-amber-100 text-amber-700",
        textClassName: "text-amber-700",
      };
    }

    return {
      label: "Agendado",
      containerClassName: "border-emerald-200 bg-emerald-50",
      badgeClassName: "bg-emerald-100 text-emerald-700",
      textClassName: "text-emerald-700",
    };
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  }

  function formatPercent(value: number) {
    return `${value.toFixed(1).replace(".", ",")}%`;
  }

  function parsePossibleNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== "string") {
      return null;
    }

    const raw = value.trim();
    if (!raw) return null;

    const cleaned = raw.replace(/[R$\s]/g, "");
    if (!cleaned) return null;

    let normalized = cleaned;

    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (/^\d+,\d{2}$/.test(cleaned)) {
      normalized = cleaned.replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getNestedValue(
    source: Record<string, unknown> | null | undefined,
    path: string[]
  ): unknown {
    let current: unknown = source;

    for (const key of path) {
      if (!current || typeof current !== "object" || !(key in current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  function sumPricingRows(pricingRows: unknown): number {
    if (!Array.isArray(pricingRows)) return 0;

    return pricingRows.reduce((total, row) => {
      if (!row || typeof row !== "object") return total;

      const rowData = row as Record<string, unknown>;
      const qty = parsePossibleNumber(rowData.qty) ?? 0;
      const unitValue = parsePossibleNumber(rowData.unitValue) ?? 0;

      return total + qty * unitValue;
    }, 0);
  }

  function extractProposalValue(proposal: Proposal) {
    const editable =
      proposal.editable_json && typeof proposal.editable_json === "object"
        ? proposal.editable_json
        : null;

    if (!editable) return 0;

    const candidatePaths = [
      ["total_value"],
      ["valor_total"],
      ["valor_total_proposta"],
      ["valorProposta"],
      ["proposal_total"],
      ["totalProposalValue"],
      ["investment_total"],
      ["total_investimento"],
      ["total"],
      ["pricing", "total"],
      ["pricing", "total_value"],
      ["pricing", "valor_total"],
      ["pricingSummary", "total"],
      ["pricing_summary", "total"],
      ["totals", "total"],
      ["totals", "valor_total"],
      ["summary", "total"],
      ["summary", "valor_total"],
      ["resumo_financeiro", "valor_total"],
      ["resumoFinanceiro", "valorTotal"],
      ["commercial", "total"],
      ["comercial", "total"],
    ];

    for (const path of candidatePaths) {
      const value = getNestedValue(editable, path);
      const parsed = parsePossibleNumber(value);
      if (parsed !== null) {
        return parsed;
      }
    }

    const pricingRowsTotal = sumPricingRows(getNestedValue(editable, ["pricingRows"]));
    const pricingTaxes =
      parsePossibleNumber(getNestedValue(editable, ["fields", "pricing_taxes"])) ?? 0;
    const pricingDiscount =
      parsePossibleNumber(getNestedValue(editable, ["fields", "pricing_discount"])) ?? 0;

    const calculatedTotal = pricingRowsTotal + pricingTaxes - pricingDiscount;
    return calculatedTotal > 0 ? calculatedTotal : 0;
  }

  function handleFilterChange(
    field: "status" | "client" | "code" | "dateStart" | "dateEnd" | "user",
    value: string
  ) {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function clearFilters() {
    setFilters({
      status: "",
      client: "",
      code: "",
      dateStart: "",
      dateEnd: "",
      user: "",
    });
    setScopeFilter("all");
    setAgendaFilter("all");
    setCurrentPage(1);
  }

  const isAdmin = (profile?.role || "").toLowerCase() === "admin";

  function isOwnProposal(proposal: Proposal) {
    return !!profile?.id && proposal.created_by === profile.id;
  }

  function formatCreator(proposal: Proposal) {
    const creatorName = proposal.created_by_name?.trim();
    const creatorEmail = proposal.created_by_email?.trim();

    if (profile?.id && proposal.created_by === profile.id) {
      return "Você";
    }

    if (creatorName && creatorEmail) return `${creatorName} (${creatorEmail})`;
    if (creatorName) return creatorName;
    if (creatorEmail) return creatorEmail;
    return "Não informado";
  }

  function formatCreatorDetails(proposal: Proposal) {
    const creatorName = proposal.created_by_name?.trim();
    const creatorEmail = proposal.created_by_email?.trim();

    if (profile?.id && proposal.created_by === profile.id) {
      if (creatorName && creatorEmail) return `${creatorName} • ${creatorEmail}`;
      return creatorName || creatorEmail || "";
    }

    if (creatorEmail) return creatorEmail;
    return "";
  }

  function getContactPriority(proposal: Proposal) {
    const status = normalizeStatus(proposal.status);

    if (!(status === "draft" || status === "pending")) {
      return 99;
    }

    const rawDate = getNextContactDate(proposal);

    if (!rawDate) {
      return 3;
    }

    const today = new Date();
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const nextContact = new Date(`${rawDate}T00:00:00`);
    const nextContactOnly = new Date(
      nextContact.getFullYear(),
      nextContact.getMonth(),
      nextContact.getDate()
    );

    if (nextContactOnly.getTime() < todayOnly.getTime()) {
      return 1;
    }

    if (nextContactOnly.getTime() === todayOnly.getTime()) {
      return 2;
    }

    return 4;
  }

  function getComparableNextContactDate(proposal: Proposal) {
    const rawDate = getNextContactDate(proposal);
    return rawDate || "9999-12-31";
  }

  const creatorOptions = useMemo(() => {
    if (!isAdmin) return [];

    const map = new Map<string, { value: string; label: string }>();

    for (const proposal of proposals) {
      const creatorId = proposal.created_by;
      if (!creatorId) continue;

      const creatorName = proposal.created_by_name?.trim();
      const creatorEmail = proposal.created_by_email?.trim();

      let label = "Usuário não identificado";

      if (creatorName && creatorEmail) {
        label = `${creatorName} (${creatorEmail})`;
      } else if (creatorName) {
        label = creatorName;
      } else if (creatorEmail) {
        label = creatorEmail;
      }

      if (profile?.id && creatorId === profile.id) {
        label = `Você — ${label}`;
      }

      if (!map.has(creatorId)) {
        map.set(creatorId, {
          value: creatorId,
          label,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR")
    );
  }, [isAdmin, proposals, profile?.id]);

  const consolidatedProposalRows = useMemo(
    () => (serverMetricsRows.length ? (serverMetricsRows as Proposal[]) : proposals),
    [serverMetricsRows, proposals]
  );

  const useConsolidatedLocalSource =
    agendaFilter !== "all" || scopeFilter !== "all";

  const localFilterSource = useMemo(
    () => (useConsolidatedLocalSource ? consolidatedProposalRows : proposals),
    [useConsolidatedLocalSource, consolidatedProposalRows, proposals]
  );

  const filteredProposals = useMemo(() => {
    const today = new Date();
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const filtered = localFilterSource.filter((proposal) => {
      if (isAdmin && scopeFilter === "mine" && !isOwnProposal(proposal)) {
        return false;
      }

      if (isAdmin && filters.user && proposal.created_by !== filters.user) {
        return false;
      }

      const proposalStatus = String(normalizeStatus(proposal.status) || "").toLowerCase();
      const isAgendaStatus =
        proposalStatus === "draft" || proposalStatus === "pending";

      const nextContactDate = getNextContactDate(proposal);

      let isOverdueAgenda = false;

      if (isAgendaStatus && nextContactDate) {
        const nextContact = new Date(`${nextContactDate}T00:00:00`);
        const nextContactOnly = new Date(
          nextContact.getFullYear(),
          nextContact.getMonth(),
          nextContact.getDate()
        );

        isOverdueAgenda = nextContactOnly.getTime() < todayOnly.getTime();
      }

      if (agendaFilter === "scheduled" && (!isAgendaStatus || !nextContactDate)) {
        return false;
      }

      if (agendaFilter === "unscheduled" && (!isAgendaStatus || !!nextContactDate)) {
        return false;
      }

      if (agendaFilter === "overdue" && (!isAgendaStatus || !isOverdueAgenda)) {
        return false;
      }
      const clientName = String(proposal.client_name || "").toLowerCase();
      const proposalCode = String(proposal.proposal_code || "").toLowerCase();

      const matchesStatus = filters.status
        ? proposalStatus === filters.status.toLowerCase()
        : true;

      const matchesClient = filters.client
        ? clientName.includes(filters.client.toLowerCase())
        : true;

      const matchesCode = filters.code
        ? proposalCode.includes(filters.code.toLowerCase())
        : true;

      return (
        matchesStatus &&
        matchesClient &&
        matchesCode
      );
    });

    if (!autoSortByAgenda) {
      return filtered.sort((a, b) => {
        const updatedA = a.updated_at || a.created_at || "";
        const updatedB = b.updated_at || b.created_at || "";
        return updatedB.localeCompare(updatedA);
      });
    }

    return filtered.sort((a, b) => {
      const priorityA = getContactPriority(a);
      const priorityB = getContactPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const nextDateA = getComparableNextContactDate(a);
      const nextDateB = getComparableNextContactDate(b);

      if (nextDateA !== nextDateB) {
        return nextDateA.localeCompare(nextDateB);
      }

      const updatedA = a.updated_at || a.created_at || "";
      const updatedB = b.updated_at || b.created_at || "";

      return updatedB.localeCompare(updatedA);
    });
  }, [
    localFilterSource,
    filters,
    isAdmin,
    scopeFilter,
    profile?.id,
    autoSortByAgenda,
    agendaFilter,
  ]);

  const metricsSource = useMemo(
    () => (serverMetricsRows.length ? (serverMetricsRows as Proposal[]) : filteredProposals),
    [serverMetricsRows, filteredProposals]
  );

  const metrics = useMemo<DashboardMetrics>(() => {
    const initial: DashboardMetrics = {
      totalCount: 0,
      totalValue: 0,
      approvedCount: 0,
      approvedValue: 0,
      pendingCount: 0,
      pendingValue: 0,
      draftCount: 0,
      draftValue: 0,
      rejectedCount: 0,
      rejectedValue: 0,
      conversionRate: 0,
      averageTicket: 0,
    };

    const calculated = metricsSource.reduce((acc, proposal) => {
      const status = normalizeStatus(proposal.status);
      const value = extractProposalValue(proposal);

      acc.totalCount += 1;
      acc.totalValue += value;

      switch (status) {
        case "approved":
        case "published":
          acc.approvedCount += 1;
          acc.approvedValue += value;
          break;
        case "pending":
          acc.pendingCount += 1;
          acc.pendingValue += value;
          break;
        case "rejected":
        case "archived":
          acc.rejectedCount += 1;
          acc.rejectedValue += value;
          break;
        case "draft":
        default:
          acc.draftCount += 1;
          acc.draftValue += value;
          break;
      }

      return acc;
    }, initial);

    calculated.conversionRate =
      calculated.totalCount > 0
        ? (calculated.approvedCount / calculated.totalCount) * 100
        : 0;

    calculated.averageTicket =
      calculated.approvedCount > 0
        ? calculated.approvedValue / calculated.approvedCount
        : 0;

    return calculated;
  }, [metricsSource]);

  const nextContactMetrics = useMemo(() => {
    const today = new Date();
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    return metricsSource.reduce(
      (acc, proposal) => {
        const status = normalizeStatus(proposal.status);

        if (!(status === "draft" || status === "pending")) {
          return acc;
        }

        const rawDate = getNextContactDate(proposal);

        if (!rawDate) {
          acc.withoutDate += 1;
          return acc;
        }

        const nextContact = new Date(`${rawDate}T00:00:00`);
        const nextContactOnly = new Date(
          nextContact.getFullYear(),
          nextContact.getMonth(),
          nextContact.getDate()
        );

        if (nextContactOnly.getTime() < todayOnly.getTime()) {
          acc.overdue += 1;
        } else if (nextContactOnly.getTime() === todayOnly.getTime()) {
          acc.today += 1;
        } else {
          acc.future += 1;
        }

        return acc;
      },
      {
        overdue: 0,
        today: 0,
        future: 0,
        withoutDate: 0,
      }
    );
  }, [metricsSource]);

  const totalPages = useConsolidatedLocalSource
    ? Math.max(1, Math.ceil(filteredProposals.length / PAGE_SIZE))
    : serverPageCount || Math.max(1, Math.ceil(filteredProposals.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [agendaFilter, scopeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedProposals = useConsolidatedLocalSource
    ? filteredProposals.slice(startIndex, startIndex + PAGE_SIZE)
    : filteredProposals;

  async function updateProposalStatus(proposalId: string, newStatus: EditableStatus) {
    if (!proposalId || !accessToken) return;

    setUpdatingStatusId(proposalId);

    const previousProposals = proposals;

    setProposals((current) =>
      current.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              status: newStatus,
            }
          : proposal
      )
    );

    try {
      let response = await apiFetch(`/api/proposals/${proposalId}/status`, accessToken, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        response = await apiFetch(`/api/proposals/${proposalId}`, accessToken, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: newStatus }),
        });
      }

      if (!response.ok) {
        throw new Error("Não foi possível atualizar o status da proposta.");
      }

      let result: ApiEnvelope<Proposal> | null = null;
      try {
        result = (await response.json()) as ApiEnvelope<Proposal>;
      } catch {
        result = null;
      }

      const updatedProposal = result?.data || result?.proposal || null;
      const updatedStatus = updatedProposal?.status || result?.status || newStatus;

      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === proposalId
            ? {
                ...proposal,
                ...(updatedProposal || {}),
                status: updatedStatus,
              }
            : proposal
        )
      );
    } catch (error) {
      console.error(error);
      setProposals(previousProposals);
      window.alert("Não foi possível atualizar o status da proposta.");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function saveNextContactDate(proposal: Proposal, forcedValue?: string) {
    if (!proposal.id || !accessToken) return;

    const nextContactDate =
      typeof forcedValue === "string" ? forcedValue : getNextContactInputValue(proposal);

    setUpdatingNextContactId(proposal.id);

    const editableJson =
      proposal.editable_json && typeof proposal.editable_json === "object"
        ? { ...(proposal.editable_json as Record<string, unknown>) }
        : {};

    const existingFields =
      editableJson.fields && typeof editableJson.fields === "object"
        ? { ...(editableJson.fields as Record<string, unknown>) }
        : {};

    if (nextContactDate) {
      editableJson.next_contact_date = nextContactDate;
      existingFields.next_contact_date = nextContactDate;
      editableJson.fields = existingFields;
    } else {
      delete editableJson.next_contact_date;
      delete existingFields.next_contact_date;
      editableJson.fields = existingFields;
    }

    try {
      const response = await apiFetch(`/api/proposals/${proposal.id}`, accessToken, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          editable_json: editableJson,
        }),
      });

      if (!response.ok) {
        throw new Error("Não foi possível salvar a data do próximo contato.");
      }

      let result: ApiEnvelope<Proposal> | null = null;
      try {
        result = (await response.json()) as ApiEnvelope<Proposal>;
      } catch {
        result = null;
      }

      const updatedProposal = result?.data || result?.proposal || null;

      setProposals((current) =>
        current.map((item) =>
          item.id === proposal.id
            ? {
                ...item,
                ...(updatedProposal || {}),
                editable_json: updatedProposal?.editable_json || editableJson,
              }
            : item
        )
      );

      setNextContactDrafts((current) => ({
        ...current,
        [proposal.id]: nextContactDate,
      }));
    } catch (error) {
      console.error(error);
      window.alert("Não foi possível salvar a data do próximo contato.");
    } finally {
      setUpdatingNextContactId(null);
    }
  }

  async function clearNextContactDate(proposal: Proposal) {
    handleNextContactDraftChange(proposal.id, "");
    await saveNextContactDate(proposal, "");
  }

  const quickActions = [
    {
      key: "new",
      label: "Nova proposta",
      icon: <IconPlus />,
      onClick: handleNewProposal,
      className: "bg-blue-600 hover:bg-blue-700",
    },
    {
      key: "dicfic",
      label: "Simulador DIC/FIC+ROI",
      icon: <IconChart />,
      onClick: handleOpenDicFicSimulator,
      className: "bg-emerald-600 hover:bg-emerald-700",
    },
    {
      key: "energylink",
      label: "Proposta Energy Link",
      icon: <IconBolt />,
      onClick: handleOpenEnergyLinkProposal,
      className: "bg-cyan-600 hover:bg-cyan-700",
    },
    {
      key: "ajuda",
      label: "Ajuda comercial",
      icon: <IconHelp />,
      onClick: handleOpenAjudaComercial,
      className: "bg-amber-600 hover:bg-amber-700",
    },
    {
      key: "contatos",
      label: "Cadastro de contatos",
      icon: <IconUsers />,
      onClick: handleOpenContactsRegistry,
      className: "bg-violet-600 hover:bg-violet-700",
    },
    ...(isAdmin
      ? [
          {
            key: "financeiro",
            label: "Gestão Financeira",
            icon: <IconFinance />,
            onClick: handleOpenFinancialManagement,
            className: "bg-slate-700 hover:bg-slate-800",
          },
        ]
      : []),
  ];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-700">{message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe_0%,_#f8fafc_32%,_#f1f5f9_100%)]">
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xl xl:hidden"
        aria-label="Abrir menu"
      >
        <IconMenu />
      </button>

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] xl:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-slate-800 bg-slate-950 text-white shadow-2xl transition-transform duration-300 xl:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <IconDashboard />
            </span>
            <div>
              <p className="text-sm font-bold">Dashboard</p>
              <p className="text-xs text-slate-400">Expert Energy</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="rounded-xl bg-white/10 p-2 transition hover:bg-white/20"
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Acessos rápidos
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ferramentas do time comercial
            </p>
          </div>

          {quickActions.map((item) => (
            <SidebarActionButton
              key={item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => {
                setMobileSidebarOpen(false);
                item.onClick();
              }}
              collapsed={false}
              className={item.className}
            />
          ))}
        </div>

        <div className="border-t border-slate-800 p-4">
          <SidebarActionButton
            icon={<IconLogout />}
            label="Sair"
            onClick={handleLogout}
            collapsed={false}
            className="bg-rose-600 hover:bg-rose-700"
          />
        </div>
      </aside>

      <aside
        className={`fixed bottom-4 left-4 top-4 z-30 hidden flex-col overflow-visible rounded-[30px] border border-slate-800/80 bg-slate-950/95 text-white shadow-2xl backdrop-blur xl:flex ${
          quickAccessCollapsed ? "w-24" : "w-72"
        } transition-all duration-300`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          {!quickAccessCollapsed ? (
            <>
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <IconDashboard />
                </span>
                <div>
                  <p className="text-sm font-bold">Dashboard</p>
                  <p className="text-xs text-slate-400">Expert Energy</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQuickAccessCollapsed(true)}
                className="rounded-xl bg-white/10 p-2 transition hover:bg-white/20"
                aria-label="Recolher menu"
                title="Recolher menu"
              >
                <IconChevronLeft />
              </button>
            </>
          ) : (
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <IconDashboard />
            </div>
          )}
        </div>

        {quickAccessCollapsed && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => setQuickAccessCollapsed(false)}
              className="flex w-full items-center justify-center rounded-2xl bg-white/10 px-3 py-3 text-white transition hover:bg-white/20"
              aria-label="Expandir menu"
              title="Expandir menu"
            >
              <IconMenu />
            </button>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {!quickAccessCollapsed && (
            <div className="px-1 pb-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Acessos rápidos
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Navegação comercial e utilidades
              </p>
            </div>
          )}

          {quickActions.map((item) => (
            <SidebarActionButton
              key={item.key}
              icon={item.icon}
              label={item.label}
              onClick={item.onClick}
              collapsed={quickAccessCollapsed}
              className={item.className}
            />
          ))}
        </div>

        <div className="border-t border-slate-800 p-3">
          <SidebarActionButton
            icon={<IconLogout />}
            label="Sair"
            onClick={handleLogout}
            collapsed={quickAccessCollapsed}
            className="bg-rose-600 hover:bg-rose-700"
          />
        </div>
      </aside>

      <div
        className={`transition-all duration-300 ${
          quickAccessCollapsed ? "xl:pl-28" : "xl:pl-80"
        }`}
      >
        <div className="mx-auto max-w-7xl space-y-6 px-4 pb-6 pt-20 xl:px-6 xl:pt-6">
          <div className="overflow-hidden rounded-[32px] border border-white/60 bg-white/80 shadow-sm backdrop-blur">
            <div className="bg-[linear-gradient(135deg,_#0f172a_0%,_#1e293b_45%,_#334155_100%)] px-8 py-8 text-white">
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Área interna
                  </div>

                  <h1 className="text-3xl font-bold tracking-tight">
                    Dashboard comercial
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    Gestão de propostas, metas, agenda comercial e produtividade do time.
                  </p>
                </div>

                <div className="xl:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileSidebarOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                  >
                    <IconMenu />
                    Menu
                  </button>
                </div>
              </div>

              {profile ? (
                <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 md:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Nome
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {profile.full_name || profile.name || "Não informado"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                      E-mail
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {profile.email || "Não informado"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Perfil
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">
                        {profile.profile ||
                          profile.role_label ||
                          formatRole(profile.role) ||
                          "Não informado"}
                      </p>

                      {isAdmin && (
                        <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900">
                          Administrador
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-200">Perfil não encontrado.</p>
              )}
            </div>

            {isAdmin && (
              <div className="border-t border-slate-200 bg-blue-50 px-8 py-3 text-sm text-blue-900">
                Você está em modo administrador e pode visualizar propostas de todos os usuários, inclusive as criadas por você.
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total de propostas geradas"
              value={String(serverTotalCount || metrics.totalCount)}
              subtitle="Quantidade no escopo e filtros atuais"
            />
            <MetricCard
              title="Valor total geral"
              value={formatCurrency(metrics.totalValue)}
              subtitle="Soma de todas as propostas filtradas"
            />
            <MetricCard
              title="Conversão"
              value={formatPercent(metrics.conversionRate)}
              subtitle={`${metrics.approvedCount} aprovada(s) de ${metrics.totalCount} proposta(s)`}
              valueClassName="text-emerald-700"
            />
            <MetricCard
              title="Ticket médio"
              value={formatCurrency(metrics.averageTicket)}
              subtitle="Média de valor das propostas aprovadas"
              valueClassName="text-violet-700"
            />
            <MetricCard
              title="Aprovadas"
              value={formatCurrency(metrics.approvedValue)}
              subtitle={`${metrics.approvedCount} proposta(s)`}
              valueClassName="text-emerald-700"
            />
            <MetricCard
              title="Enviadas"
              value={formatCurrency(metrics.pendingValue)}
              subtitle={`${metrics.pendingCount} proposta(s)`}
              valueClassName="text-amber-700"
            />
            <MetricCard
              title="Rascunho"
              value={formatCurrency(metrics.draftValue)}
              subtitle={`${metrics.draftCount} proposta(s)`}
              valueClassName="text-blue-700"
            />
            <MetricCard
              title="Canceladas"
              value={formatCurrency(metrics.rejectedValue)}
              subtitle={`${metrics.rejectedCount} proposta(s)`}
              valueClassName="text-red-700"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Contatos atrasados"
              value={String(nextContactMetrics.overdue)}
              subtitle="Propostas em rascunho ou enviada com contato vencido"
              valueClassName="text-red-700"
            />
            <MetricCard
              title="Contatos para hoje"
              value={String(nextContactMetrics.today)}
              subtitle="Propostas que precisam de contato hoje"
              valueClassName="text-amber-700"
            />
            <MetricCard
              title="Contatos futuros"
              value={String(nextContactMetrics.future)}
              subtitle="Próximos contatos já agendados"
              valueClassName="text-emerald-700"
            />
            <MetricCard
              title="Sem data de próximo contato"
              value={String(nextContactMetrics.withoutDate)}
              subtitle="Propostas em rascunho ou enviada sem agenda definida"
              valueClassName="text-slate-700"
            />
          </div>

          <GoalsPanel
            isAdmin={isAdmin}
            accessToken={accessToken}
            filteredProposals={metricsSource}
            extractProposalValue={extractProposalValue}
            normalizeStatus={normalizeStatus}
          />

          <div className="rounded-[32px] border border-slate-200/80 bg-white/90 p-8 shadow-sm backdrop-blur">
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Propostas salvas
                  </h2>
                  <p className="text-sm text-slate-600">
                    Lista das propostas já registradas no sistema.
                  </p>
                </div>

                <div className="flex flex-col items-start gap-2 text-sm text-slate-500 md:items-end">
                  <div>
                    Total filtrado: <strong>{useConsolidatedLocalSource ? filteredProposals.length : (serverTotalCount || filteredProposals.length)}</strong>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Seletor de agenda
                    </label>
                    <select
                      value={agendaFilter}
                      onChange={(e) => setAgendaFilter(e.target.value as AgendaFilter)}
                      className="min-w-[220px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                    >
                      <option value="all">Todos</option>
                      <option value="scheduled">Somente com agenda</option>
                      <option value="unscheduled">Somente sem agenda</option>
                      <option value="overdue">Somente atrasadas</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={autoSortByAgenda}
                      onChange={(e) => setAutoSortByAgenda(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Ordenação automática por agenda
                  </label>
                </div>
              </div>

              <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-7">
                {isAdmin && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Escopo
                    </label>
                    <select
                      value={scopeFilter}
                      onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                    >
                      <option value="all">Todas as propostas</option>
                      <option value="mine">Somente minhas</option>
                    </select>
                  </div>
                )}

                {isAdmin && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Usuário
                    </label>
                    <select
                      value={filters.user}
                      onChange={(e) => handleFilterChange("user", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                    >
                      <option value="">Todos os usuários</option>
                      {creatorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tag / status
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange("status", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="">Todos</option>
                    <option value="draft">Rascunho</option>
                    <option value="pending">Enviada</option>
                    <option value="approved">Aprovada</option>
                    <option value="rejected">Cancelada</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={filters.client}
                    onChange={(e) => handleFilterChange("client", e.target.value)}
                    placeholder="Pesquisar cliente"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Número / código
                  </label>
                  <input
                    type="text"
                    value={filters.code}
                    onChange={(e) => handleFilterChange("code", e.target.value)}
                    placeholder="Pesquisar código"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Data início
                  </label>
                  <input
                    type="date"
                    value={filters.dateStart}
                    onChange={(e) => handleFilterChange("dateStart", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Data fim
                  </label>
                  <input
                    type="date"
                    value={filters.dateEnd}
                    onChange={(e) => handleFilterChange("dateEnd", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-7">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>
            </div>

            {filteredProposals.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-slate-600">
                  Nenhuma proposta encontrada com os filtros aplicados.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedProposals.map((proposal) => (
                    <div
                      key={proposal.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {proposal.client_name || "Cliente não informado"}
                            </h3>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                proposal.status
                              )}`}
                            >
                              {formatStatus(proposal.status)}
                            </span>
                          </div>

                          <p className="text-sm text-slate-700">
                            <strong>Título:</strong> {proposal.title || "Sem título"}
                          </p>

                          <p className="text-sm text-slate-700">
                            <strong>Código:</strong> {proposal.proposal_code || "Não informado"}
                          </p>

                          <p className="text-sm text-slate-700">
                            <strong>Valor estimado:</strong> {formatCurrency(extractProposalValue(proposal))}
                          </p>

                          {canScheduleNextContact(proposal) && (() => {
                            const nextContactStatus = getNextContactStatus(proposal);
                            const nextContactValue = getNextContactInputValue(proposal);

                            return (
                              <div
                                className={`rounded-2xl border p-3 ${nextContactStatus.containerClassName}`}
                              >
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Agenda de contato
                                  </p>

                                  <span
                                    className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${nextContactStatus.badgeClassName}`}
                                  >
                                    {nextContactStatus.label}
                                  </span>
                                </div>

                                <p className={`mt-2 text-sm font-medium ${nextContactStatus.textClassName}`}>
                                  Próximo contato: {formatNextContactDate(nextContactValue)}
                                </p>

                                <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                                  <input
                                    type="date"
                                    value={nextContactValue}
                                    onChange={(e) =>
                                      handleNextContactDraftChange(proposal.id, e.target.value)
                                    }
                                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 md:max-w-[220px]"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => saveNextContactDate(proposal)}
                                    disabled={updatingNextContactId === proposal.id}
                                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {updatingNextContactId === proposal.id
                                      ? "Salvando..."
                                      : "Salvar próximo contato"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => clearNextContactDate(proposal)}
                                    disabled={updatingNextContactId === proposal.id}
                                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Limpar
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="text-sm text-slate-700">
                            <strong>Criado por:</strong> {formatCreator(proposal)}
                            {formatCreatorDetails(proposal) ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {formatCreatorDetails(proposal)}
                              </p>
                            ) : null}
                          </div>

                          <p className="text-sm text-slate-500">
                            <strong>Criada em:</strong> {formatDate(proposal.created_at)}
                          </p>

                          <p className="text-sm text-slate-500">
                            <strong>Atualizado em:</strong> {formatDate(
                              proposal.updated_at || proposal.created_at
                            )}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 md:items-end">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditProposal(proposal.id)}
                              disabled={!proposal.id}
                              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Abrir / editar
                            </button>

                            {proposal.public_slug ? (
                              <button
                                type="button"
                                onClick={() => window.open(`/public/${proposal.public_slug}`, "_blank")}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                              >
                                Ver versão pública
                              </button>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Alterar tag
                            </label>

                            <select
                              value={getEditableStatusValue(proposal.status)}
                              onChange={(e) =>
                                updateProposalStatus(
                                  proposal.id,
                                  e.target.value as EditableStatus
                                )
                              }
                              disabled={!proposal.id || updatingStatusId === proposal.id}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="draft">Rascunho</option>
                              <option value="pending">Enviada</option>
                              <option value="approved">Aprovada</option>
                              <option value="rejected">Cancelada</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-500">
                    Exibindo <strong>{paginatedProposals.length === 0 ? 0 : startIndex + 1}-{startIndex + paginatedProposals.length}</strong> de <strong>{serverTotalCount || filteredProposals.length}</strong> propostas
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>

                    <span className="text-sm text-slate-600">
                      Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
                    </span>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
