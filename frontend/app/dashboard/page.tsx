"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className={`mt-2 text-2xl font-bold ${valueClassName}`}>{value}</p>
      {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Carregando...");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [updatingNextContactId, setUpdatingNextContactId] = useState<string | null>(null);
  const [nextContactDrafts, setNextContactDrafts] = useState<Record<string, string>>({});
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine">("all");

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
          apiFetch("/api/proposals", session.access_token),
        ]);

        if (!profileResponse.ok) {
          setMessage("Não foi possível carregar o usuário autenticado.");
          setLoading(false);
          return;
        }

        const profileJson = await profileResponse.json();
        const normalizedProfile =
          profileJson?.data ??
          profileJson?.user ??
          profileJson?.profile ??
          profileJson ??
          null;

        setProfile(normalizedProfile);

        if (proposalsResponse.ok) {
          const proposalsData = await proposalsResponse.json();

          const normalizedProposals = Array.isArray(proposalsData)
            ? proposalsData
            : Array.isArray(proposalsData?.items)
            ? proposalsData.items
            : Array.isArray(proposalsData?.data)
            ? proposalsData.data
            : Array.isArray(proposalsData?.proposals)
            ? proposalsData.proposals
            : Array.isArray(proposalsData?.rows)
            ? proposalsData.rows
            : [];

          setProposals(normalizedProposals);
        } else {
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
  }, []);

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

  function handleEditProposal(proposalId: string) {
    if (accessToken) {
      persistAccessToken(accessToken);
    }
    window.location.href = `/proposta-base.html?proposalId=${proposalId}&mode=edit`;
  }

  function normalizeStatus(status?: string): ProposalStatus | string {
    if (!status) return "draft";

    const normalized = String(status).toLowerCase();

    switch (normalized) {
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

    const pricingRowsTotal = sumPricingRows(
      getNestedValue(editable, ["pricingRows"])
    );

    const pricingTaxes =
      parsePossibleNumber(getNestedValue(editable, ["fields", "pricing_taxes"])) ??
      0;

    const pricingDiscount =
      parsePossibleNumber(
        getNestedValue(editable, ["fields", "pricing_discount"])
      ) ?? 0;

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

  const filteredProposals = useMemo(() => {
    return proposals.filter((proposal) => {
      if (isAdmin && scopeFilter === "mine" && !isOwnProposal(proposal)) {
        return false;
      }

      if (isAdmin && filters.user && proposal.created_by !== filters.user) {
        return false;
      }

      const proposalStatus = String(proposal.status || "").toLowerCase();
      const clientName = String(proposal.client_name || "").toLowerCase();
      const proposalCode = String(proposal.proposal_code || "").toLowerCase();
      const createdDate = proposal.created_at || "";
      const createdDateOnly = createdDate
        ? new Date(createdDate).toISOString().slice(0, 10)
        : "";

      const matchesStatus = filters.status
        ? proposalStatus === filters.status.toLowerCase()
        : true;

      const matchesClient = filters.client
        ? clientName.includes(filters.client.toLowerCase())
        : true;

      const matchesCode = filters.code
        ? proposalCode.includes(filters.code.toLowerCase())
        : true;

      const matchesDateStart = filters.dateStart
        ? createdDateOnly
          ? createdDateOnly >= filters.dateStart
          : false
        : true;

      const matchesDateEnd = filters.dateEnd
        ? createdDateOnly
          ? createdDateOnly <= filters.dateEnd
          : false
        : true;

      return (
        matchesStatus &&
        matchesClient &&
        matchesCode &&
        matchesDateStart &&
        matchesDateEnd
      );
    });
  }, [proposals, filters, isAdmin, scopeFilter, profile?.id]);

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

    const calculated = filteredProposals.reduce((acc, proposal) => {
      const status = normalizeStatus(proposal.status);
      const value = extractProposalValue(proposal);

      acc.totalCount += 1;
      acc.totalValue += value;

      switch (status) {
        case "approved":
          acc.approvedCount += 1;
          acc.approvedValue += value;
          break;
        case "pending":
          acc.pendingCount += 1;
          acc.pendingValue += value;
          break;
        case "rejected":
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
  }, [filteredProposals]);

  const nextContactMetrics = useMemo(() => {
    const today = new Date();
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    return filteredProposals.reduce(
      (acc, proposal) => {
        const status = normalizeStatus(proposal.status);

        if (!(status === "draft" || status === "pending")) {
          return acc;
        }

        const rawDate = getNextContactDate(proposal);

        if (!rawDate) {
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
      }
    );
  }, [filteredProposals]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProposals.length / PAGE_SIZE)
  );
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedProposals = filteredProposals.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  async function updateProposalStatus(
    proposalId: string,
    newStatus: "draft" | "pending" | "approved" | "rejected"
  ) {
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
      let response = await apiFetch(
        `/api/proposals/${proposalId}/status`,
        accessToken,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

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

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      const updatedStatus =
        result?.status ||
        result?.data?.status ||
        result?.proposal?.status ||
        newStatus;

      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === proposalId
            ? {
                ...proposal,
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
      typeof forcedValue === "string"
        ? forcedValue
        : getNextContactInputValue(proposal);

    setUpdatingNextContactId(proposal.id);

    const editableJson =
      proposal.editable_json && typeof proposal.editable_json === "object"
        ? { ...(proposal.editable_json as Record<string, unknown>) }
        : {};

    if (nextContactDate) {
      editableJson.next_contact_date = nextContactDate;
    } else {
      delete editableJson.next_contact_date;
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

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      const updatedProposal =
        result?.data ||
        result?.proposal ||
        null;

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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-700">{message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
              <p className="text-sm text-slate-600">
                Área interna do sistema de propostas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleNewProposal}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
              >
                Nova proposta
              </button>

              <button
                onClick={handleOpenDicFicSimulator}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700"
              >
                Abrir Simulador DIC/FIC+ROI
              </button>

              <button
                onClick={handleOpenEnergyLinkProposal}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-white transition hover:bg-cyan-700"
              >
                Proposta Energy Link
              </button>

              <button
                onClick={handleLogout}
                className="rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
              >
                Sair
              </button>
            </div>
          </div>

          {profile ? (
            <>
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nome
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {profile.full_name || profile.name || "Não informado"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    E-mail
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {profile.email || "Não informado"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Perfil
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {profile.profile ||
                        profile.role_label ||
                        formatRole(profile.role) ||
                        "Não informado"}
                    </p>

                    {isAdmin && (
                      <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                        Administrador
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Você está em modo administrador e pode visualizar propostas de
                  todos os usuários, inclusive as criadas por você.
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-red-600">Perfil não encontrado.</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total de propostas geradas"
            value={String(metrics.totalCount)}
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

        <div className="grid gap-4 md:grid-cols-3">
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
        </div>

        <div className="rounded-2xl bg-white p-8 shadow">
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

              <div className="text-sm text-slate-500">
                Total filtrado: <strong>{filteredProposals.length}</strong>
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-7">
              {isAdmin && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Escopo
                  </label>
                  <select
                    value={scopeFilter}
                    onChange={(e) =>
                      setScopeFilter(e.target.value as "all" | "mine")
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Data início
                </label>
                <input
                  type="date"
                  value={filters.dateStart}
                  onChange={(e) =>
                    handleFilterChange("dateStart", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Data fim
                </label>
                <input
                  type="date"
                  value={filters.dateEnd}
                  onChange={(e) =>
                    handleFilterChange("dateEnd", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2 xl:col-span-7 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>

          {filteredProposals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
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
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
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
                          <strong>Título:</strong>{" "}
                          {proposal.title || "Sem título"}
                        </p>

                        <p className="text-sm text-slate-700">
                          <strong>Código:</strong>{" "}
                          {proposal.proposal_code || "Não informado"}
                        </p>

                        <p className="text-sm text-slate-700">
                          <strong>Valor estimado:</strong>{" "}
                          {formatCurrency(extractProposalValue(proposal))}
                        </p>

                        {canScheduleNextContact(proposal) && (() => {
                          const nextContactStatus = getNextContactStatus(proposal);
                          const nextContactValue = getNextContactInputValue(proposal);

                          return (
                            <div
                              className={`rounded-xl border p-3 ${nextContactStatus.containerClassName}`}
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
                                    handleNextContactDraftChange(
                                      proposal.id,
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 md:max-w-[220px]"
                                />

                                <button
                                  type="button"
                                  onClick={() => saveNextContactDate(proposal)}
                                  disabled={updatingNextContactId === proposal.id}
                                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {updatingNextContactId === proposal.id
                                    ? "Salvando..."
                                    : "Salvar próximo contato"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => clearNextContactDate(proposal)}
                                  disabled={updatingNextContactId === proposal.id}
                                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
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
                          <strong>Criada em:</strong>{" "}
                          {formatDate(proposal.created_at)}
                        </p>

                        <p className="text-sm text-slate-500">
                          <strong>Atualizado em:</strong>{" "}
                          {formatDate(proposal.updated_at || proposal.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 md:items-end">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditProposal(proposal.id)}
                            disabled={!proposal.id}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Abrir / editar
                          </button>

                          {proposal.public_slug ? (
                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  `/public/${proposal.public_slug}`,
                                  "_blank"
                                )
                              }
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
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
                            value={String(proposal.status || "draft")}
                            onChange={(e) =>
                              updateProposalStatus(
                                proposal.id,
                                e.target.value as
                                  | "draft"
                                  | "pending"
                                  | "approved"
                                  | "rejected"
                              )
                            }
                            disabled={
                              !proposal.id || updatingStatusId === proposal.id
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
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
                  Exibindo{" "}
                  <strong>
                    {startIndex + 1}-
                    {Math.min(startIndex + PAGE_SIZE, filteredProposals.length)}
                  </strong>{" "}
                  de <strong>{filteredProposals.length}</strong> propostas
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={currentPage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <span className="text-sm text-slate-600">
                    Página <strong>{currentPage}</strong> de{" "}
                    <strong>{totalPages}</strong>
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
