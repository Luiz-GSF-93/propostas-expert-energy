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
};

type Contact = {
  id: string;
  company_name: string;
  cnpj?: string | null;
  main_contact: string;
  role_area?: string | null;
  email?: string | null;
  phone?: string | null;
  address_unit?: string | null;
  segment_operation?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ContactsResponse = {
  items?: Contact[];
  data?: Contact[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
};

const EMPTY_FORM = {
  company_name: "",
  cnpj: "",
  main_contact: "",
  role_area: "",
  email: "",
  phone: "",
  address_unit: "",
  segment_operation: "",
  notes: "",
  is_active: true,
};

export default function ContactsPage() {
  const [accessToken, setAccessToken] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [form, setForm] = useState({
    ...EMPTY_FORM,
  });

  function persistAccessToken(token: string) {
    if (!token || typeof window === "undefined") return;

    try {
      localStorage.setItem("access_token", token);
      localStorage.setItem("supabase.access_token", token);
    } catch {
      // silencioso
    }
  }

  function formatDate(value?: string) {
    if (!value) return "Não informado";
    try {
      return new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return value;
    }
  }

  async function loadContacts(token: string, searchValue: string, statusValue: string) {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", "100");

    if (searchValue.trim()) {
      params.set("q", searchValue.trim());
    }

    if (statusValue !== "all") {
      params.set("status", statusValue);
    }

    const response = await apiFetch(`/api/contacts?${params.toString()}`, token);

    if (!response.ok) {
      throw new Error("Não foi possível carregar os contatos.");
    }

    const json = (await response.json()) as ContactsResponse;
    const items = Array.isArray(json?.items)
      ? json.items
      : Array.isArray(json?.data)
      ? json.data
      : [];

    setContacts(items);
  }

  useEffect(() => {
    async function initialize() {
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

        const meResponse = await apiFetch("/api/auth/me", session.access_token);

        if (meResponse.ok) {
          const meJson = await meResponse.json();
          const normalizedProfile =
            meJson?.data || meJson?.user || meJson?.profile || meJson || null;
          setProfile(normalizedProfile);
        }

        await loadContacts(session.access_token, "", "all");
      } catch (error) {
        console.error(error);
        setMessage("Erro ao carregar a tela de contatos.");
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, []);

  async function handleSearch() {
    if (!accessToken) return;
    setLoading(true);
    setMessage("");

    try {
      await loadContacts(accessToken, search, statusFilter);
    } catch (error) {
      console.error(error);
      setMessage("Não foi possível carregar os contatos.");
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(
    field:
      | "company_name"
      | "cnpj"
      | "main_contact"
      | "role_area"
      | "email"
      | "phone"
      | "address_unit"
      | "segment_operation"
      | "notes",
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  }

  function handleEdit(contact: Contact) {
    setEditingId(contact.id);
    setForm({
      company_name: contact.company_name || "",
      cnpj: contact.cnpj || "",
      main_contact: contact.main_contact || "",
      role_area: contact.role_area || "",
      email: contact.email || "",
      phone: contact.phone || "",
      address_unit: contact.address_unit || "",
      segment_operation: contact.segment_operation || "",
      notes: contact.notes || "",
      is_active: !!contact.is_active,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!accessToken) return;

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        company_name: form.company_name,
        cnpj: form.cnpj,
        main_contact: form.main_contact,
        role_area: form.role_area,
        email: form.email,
        phone: form.phone,
        address_unit: form.address_unit,
        segment_operation: form.segment_operation,
        notes: form.notes,
        is_active: form.is_active,
      };

      const endpoint = editingId ? `/api/contacts/${editingId}` : "/api/contacts";
      const method = editingId ? "PUT" : "POST";

      const response = await apiFetch(endpoint, accessToken, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.error || "Não foi possível salvar o contato.");
      }

      await loadContacts(accessToken, search, statusFilter);
      resetForm();
      setMessage(editingId ? "Contato atualizado com sucesso." : "Contato criado com sucesso.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? error.message : "Erro ao salvar o contato."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(contact: Contact) {
    if (!accessToken) return;

    setStatusUpdatingId(contact.id);
    setMessage("");

    try {
      const response = await apiFetch(`/api/contacts/${contact.id}/status`, accessToken, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          is_active: !contact.is_active,
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.error || "Não foi possível alterar o status do contato.");
      }

      await loadContacts(accessToken, search, statusFilter);
      setMessage("Status do contato atualizado com sucesso.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Erro ao alterar o status do contato."
      );
    } finally {
      setStatusUpdatingId(null);
    }
  }

  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) =>
      String(a.company_name || "").localeCompare(String(b.company_name || ""), "pt-BR")
    );
  }, [contacts]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl rounded-2xl bg-white p-8 shadow">
          <p className="text-slate-700">Carregando contatos...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Cadastro de contatos
              </h1>
              <p className="text-sm text-slate-600">
                Base global de contatos para reutilização nas novas propostas.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => window.location.href = "/dashboard"}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Voltar ao dashboard
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Novo cadastro
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Usuário
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {profile?.full_name || profile?.name || "Não informado"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                E-mail
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {profile?.email || "Não informado"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Escopo
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                Base global compartilhada
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Editar contato" : "Novo contato"}
            </h2>
            <p className="text-sm text-slate-600">
              Preencha os campos para cadastrar um contato reutilizável nas propostas.
            </p>
          </div>

          {message ? (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {message}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Empresa *
              </label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => handleFormChange("company_name", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                CNPJ
              </label>
              <input
                type="text"
                value={form.cnpj}
                onChange={(e) => handleFormChange("cnpj", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Contato principal *
              </label>
              <input
                type="text"
                value={form.main_contact}
                onChange={(e) => handleFormChange("main_contact", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Cargo / área
              </label>
              <input
                type="text"
                value={form.role_area}
                onChange={(e) => handleFormChange("role_area", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                E-mail
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleFormChange("email", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Telefone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => handleFormChange("phone", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Endereço / unidade
              </label>
              <input
                type="text"
                value={form.address_unit}
                onChange={(e) => handleFormChange("address_unit", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Segmento / operação
              </label>
              <input
                type="text"
                value={form.segment_operation}
                onChange={(e) => handleFormChange("segment_operation", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-7">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    is_active: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
                Contato ativo
              </label>
            </div>

            <div className="md:col-span-2 xl:col-span-3">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Observações
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => handleFormChange("notes", e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar contato"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Limpar formulário
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Contatos cadastrados</h2>
              <p className="text-sm text-slate-600">
                Utilize a busca para localizar contatos já cadastrados.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar empresa, contato, e-mail..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | "active" | "inactive")
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>

              <button
                type="button"
                onClick={handleSearch}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Pesquisar
              </button>
            </div>
          </div>

          {sortedContacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
              Nenhum contato encontrado.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {contact.company_name}
                        </h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            contact.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {contact.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>

                      <p className="text-sm text-slate-700">
                        <strong>Contato principal:</strong> {contact.main_contact || "Não informado"}
                      </p>
                      <p className="text-sm text-slate-700">
                        <strong>CNPJ:</strong> {contact.cnpj || "Não informado"}
                      </p>
                      <p className="text-sm text-slate-700">
                        <strong>Cargo / área:</strong> {contact.role_area || "Não informado"}
                      </p>
                      <p className="text-sm text-slate-700">
                        <strong>E-mail:</strong> {contact.email || "Não informado"}
                      </p>
                      <p className="text-sm text-slate-700">
                        <strong>Telefone:</strong> {contact.phone || "Não informado"}
                      </p>
                      <p className="text-sm text-slate-700">
                        <strong>Endereço / unidade:</strong> {contact.address_unit || "Não informado"}
                      </p>
                      <p className="text-sm text-slate-700">
                        <strong>Segmento / operação:</strong> {contact.segment_operation || "Não informado"}
                      </p>
                      <p className="text-sm text-slate-700">
                        <strong>Observações:</strong> {contact.notes || "Não informado"}
                      </p>
                      <p className="text-xs text-slate-500">
                        <strong>Criado em:</strong> {formatDate(contact.created_at)}
                      </p>
                      <p className="text-xs text-slate-500">
                        <strong>Atualizado em:</strong> {formatDate(contact.updated_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(contact)}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(contact)}
                        disabled={statusUpdatingId === contact.id}
                        className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          contact.is_active
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {statusUpdatingId === contact.id
                          ? "Salvando..."
                          : contact.is_active
                          ? "Inativar"
                          : "Ativar"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
