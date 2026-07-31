(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get("modo") === "cliente") {
    return;
  }

  const API_BASE_URL = "https://propostas-expert-energy-api.onrender.com";

  let contacts = [];

  function getAccessToken() {
    const directKeys = [
      "supabase.access_token",
      "access_token",
      "sb-access-token"
    ];

    for (const key of directKeys) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }

    for (const key of Object.keys(localStorage)) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) return parsed.access_token;
        if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
      } catch (error) {
        const match = raw.match(/"access_token":"([^"]+)"/);
        if (match) return match[1];
      }
    }

    return "";
  }

  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;

    el.value = value == null ? "" : String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function updateInfo(message, isError) {
    const info = document.getElementById("contact-autofill-info");
    if (!info) return;
    info.textContent = message || "";
    info.style.color = isError ? "#8b3030" : "#475569";
  }

  function updateSelectedContactId(value) {
    const hidden = document.getElementById("selected_contact_id");
    if (!hidden) return;
    hidden.value = value || "";
  }

  function fillContact(contact) {
    if (!contact) return;

    setInputValue("cliente_empresa", contact.company_name || "");
    setInputValue("cliente_cnpj", contact.cnpj || "");
    setInputValue("cliente_contato", contact.main_contact || "");
    setInputValue("cliente_cargo", contact.role_area || "");
    setInputValue("cliente_email", contact.email || "");
    setInputValue("cliente_telefone", contact.phone || "");
    setInputValue("cliente_endereco", contact.address_unit || "");
    setInputValue("cliente_segmento", contact.segment_operation || "");

    updateSelectedContactId(contact.id || "");
    updateInfo(
      "Contato aplicado com sucesso. Você ainda pode editar os campos normalmente antes de salvar a proposta.",
      false
    );
  }

  function buildOptionLabel(contact) {
    const company = contact.company_name || "Empresa sem nome";
    const person = contact.main_contact ? ` • ${contact.main_contact}` : "";
    const email = contact.email ? ` • ${contact.email}` : "";
    return `${company}${person}${email}`;
  }

  function renderOptions() {
    const select = document.getElementById("contact_registry_select");
    if (!select) return;

    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Selecione um contato cadastrado";
    select.appendChild(defaultOption);

    contacts.forEach((contact) => {
      const option = document.createElement("option");
      option.value = contact.id || "";
      option.textContent = buildOptionLabel(contact);
      select.appendChild(option);
    });
  }

  async function loadContacts() {
    const token = getAccessToken();

    if (!token) {
      updateInfo(
        "Token não encontrado. Abra a nova proposta a partir do dashboard para carregar os contatos.",
        true
      );
      return;
    }

    updateInfo("Carregando contatos cadastrados...", false);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/contacts?page=1&limit=100&status=active`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.error || "Não foi possível carregar os contatos.");
      }

      contacts = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
        ? json.data
        : [];

      renderOptions();

      updateInfo(
        contacts.length
          ? `${contacts.length} contato(s) ativo(s) carregado(s).`
          : "Nenhum contato ativo encontrado.",
        false
      );
    } catch (error) {
      console.error("Erro ao carregar contatos:", error);
      updateInfo(
        error instanceof Error ? error.message : "Erro ao carregar contatos.",
        true
      );
    }
  }

  function ensurePanel() {
    if (document.getElementById("contact-registry-panel")) {
      return;
    }

    const targetSection = document.getElementById("cliente-section");
    if (!targetSection || !targetSection.parentNode) {
      console.warn("Seção cliente-section não encontrada.");
      return;
    }

    const panel = document.createElement("section");
    panel.id = "contact-registry-panel";
    panel.className = "editor-only";
    panel.style.background = "#ffffff";
    panel.style.border = "1px solid #c7d3da";
    panel.style.padding = "18px 20px";
    panel.style.marginBottom = "16px";
    panel.style.borderRadius = "22px";
    panel.style.boxShadow = "0 18px 40px rgba(13, 44, 61, .06)";

    panel.innerHTML = `
      <h2 style="margin-top:0;">Contato cadastrado</h2>
      <p style="margin:0 0 12px 0;color:#55656f;font-size:14px;line-height:1.55;">
        Selecione um contato da base global para preencher automaticamente os dados do cliente na proposta.
        Depois, se necessário, ajuste manualmente os campos antes de salvar.
      </p>

      <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end;">
        <div class="field" style="margin:0;">
          <label for="contact_registry_select" style="display:block;font-size:13px;font-weight:700;margin-bottom:5px;color:#123d56;">
            Contato da base
          </label>
          <select
            id="contact_registry_select"
            style="width:100%;border:1px solid #c7d3da;padding:9px 10px;font-size:14px;font-family:Arial, Helvetica, sans-serif;color:#1f2b33;background:#fff;min-height:38px;border-radius:14px;"
          >
            <option value="">Selecione um contato cadastrado</option>
          </select>
        </div>

        <button
          type="button"
          id="refresh_contacts_registry"
          style="background:#123d56;color:#fff;border:1px solid #123d56;padding:10px 14px;font-size:13px;border-radius:999px;cursor:pointer;font-weight:700;height:40px;"
        >
          Atualizar lista
        </button>
      </div>

      <input type="hidden" id="selected_contact_id" value="" />

      <p id="contact-autofill-info" style="margin:12px 0 0 0;font-size:13px;color:#55656f;">
        Aguardando carregamento dos contatos...
      </p>
    `;

    targetSection.parentNode.insertBefore(panel, targetSection);

    const select = document.getElementById("contact_registry_select");
    const refresh = document.getElementById("refresh_contacts_registry");

    if (select) {
      select.addEventListener("change", function (event) {
        const selectedId = event.target.value;
        const contact = contacts.find((item) => item.id === selectedId);
        if (!contact) {
          updateSelectedContactId("");
          updateInfo("Selecione um contato para preencher os dados.", false);
          return;
        }
        fillContact(contact);
      });
    }

    if (refresh) {
      refresh.addEventListener("click", loadContacts);
    }
  }

  function init() {
    ensurePanel();
    loadContacts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
