const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth");
const { adminSupabase: supabaseAdmin } = require("../config/supabase");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toTrimmedString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeNullableText(value) {
  const parsed = toTrimmedString(value);
  return parsed || null;
}

function normalizeRequiredText(value, fieldLabel) {
  const parsed = toTrimmedString(value);
  if (!parsed) {
    const error = new Error(`Campo obrigatório: ${fieldLabel}.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function normalizeEmail(value) {
  const parsed = toTrimmedString(value).toLowerCase();
  return parsed || null;
}

function normalizePhone(value) {
  return normalizeNullableText(value);
}

function normalizeCnpj(value) {
  const parsed = toTrimmedString(value).replace(/\D/g, "");
  return parsed || null;
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "yes"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || DEFAULT_PAGE, 1);
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

function buildContactPayload(body, userId, currentRow = null) {
  return {
    company_name: normalizeRequiredText(body.company_name, "empresa"),
    cnpj: normalizeCnpj(body.cnpj),
    main_contact: normalizeRequiredText(body.main_contact, "contato principal"),
    role_area: normalizeNullableText(body.role_area),
    email: normalizeEmail(body.email),
    phone: normalizePhone(body.phone),
    address_unit: normalizeNullableText(body.address_unit),
    segment_operation: normalizeNullableText(body.segment_operation),
    notes: normalizeNullableText(body.notes),
    is_active: normalizeBoolean(
      body.is_active,
      currentRow?.is_active !== undefined ? currentRow.is_active : true
    ),
    updated_by: userId || null,
    ...(currentRow
      ? {}
      : {
          created_by: userId || null,
        }),
  };
}

router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const payload = buildContactPayload(req.body || {}, userId);

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .insert(payload)
      .select(
        "id, company_name, cnpj, main_contact, role_area, email, phone, address_unit, segment_operation, notes, is_active, created_by, updated_by, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("Erro ao criar contato:", error);
      return res.status(500).json({
        error: "Erro ao criar contato.",
        details: error.message,
      });
    }

    return res.status(201).json({
      message: "Contato criado com sucesso.",
      data,
    });
  } catch (error) {
    console.error("Erro no POST /api/contacts:", error);
    return res.status(error.statusCode || 500).json({
      error: error.message || "Erro interno ao criar contato.",
    });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query || {});
    const q = toTrimmedString(req.query?.q).toLowerCase();
    const status = toTrimmedString(req.query?.status).toLowerCase();

    let query = supabaseAdmin
      .from("contacts")
      .select(
        "id, company_name, cnpj, main_contact, role_area, email, phone, address_unit, segment_operation, notes, is_active, created_by, updated_by, created_at, updated_at",
        { count: "exact" }
      )
      .order("company_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Erro ao listar contatos:", error);
      return res.status(500).json({
        error: "Erro ao listar contatos.",
        details: error.message,
      });
    }

    let items = Array.isArray(data) ? data : [];

    if (q) {
      items = items.filter((item) => {
        const haystack = [
          item.company_name,
          item.cnpj,
          item.main_contact,
          item.role_area,
          item.email,
          item.phone,
          item.address_unit,
          item.segment_operation,
          item.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      });
    }

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total: typeof count === "number" ? count : items.length,
      },
    });
  } catch (error) {
    console.error("Erro no GET /api/contacts:", error);
    return res.status(500).json({
      error: "Erro interno ao listar contatos.",
    });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select(
        "id, company_name, cnpj, main_contact, role_area, email, phone, address_unit, segment_operation, notes, is_active, created_by, updated_by, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar contato:", error);
      return res.status(500).json({
        error: "Erro ao buscar contato.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        error: "Contato não encontrado.",
      });
    }

    return res.json({ data });
  } catch (error) {
    console.error("Erro no GET /api/contacts/:id:", error);
    return res.status(500).json({
      error: "Erro interno ao buscar contato.",
    });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;

    const { data: currentRow, error: currentError } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      console.error("Erro ao carregar contato atual:", currentError);
      return res.status(500).json({
        error: "Erro ao carregar contato atual.",
        details: currentError.message,
      });
    }

    if (!currentRow) {
      return res.status(404).json({
        error: "Contato não encontrado.",
      });
    }

    const payload = buildContactPayload(req.body || {}, userId, currentRow);

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update(payload)
      .eq("id", id)
      .select(
        "id, company_name, cnpj, main_contact, role_area, email, phone, address_unit, segment_operation, notes, is_active, created_by, updated_by, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("Erro ao atualizar contato:", error);
      return res.status(500).json({
        error: "Erro ao atualizar contato.",
        details: error.message,
      });
    }

    return res.json({
      message: "Contato atualizado com sucesso.",
      data,
    });
  } catch (error) {
    console.error("Erro no PUT /api/contacts/:id:", error);
    return res.status(error.statusCode || 500).json({
      error: error.message || "Erro interno ao atualizar contato.",
    });
  }
});

router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const isActive = normalizeBoolean(req.body?.is_active, true);

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update({
        is_active: isActive,
        updated_by: userId,
      })
      .eq("id", id)
      .select(
        "id, company_name, cnpj, main_contact, role_area, email, phone, address_unit, segment_operation, notes, is_active, created_by, updated_by, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      console.error("Erro ao alterar status do contato:", error);
      return res.status(500).json({
        error: "Erro ao alterar status do contato.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        error: "Contato não encontrado.",
      });
    }

    return res.json({
      message: "Status do contato atualizado com sucesso.",
      data,
    });
  } catch (error) {
    console.error("Erro no PATCH /api/contacts/:id/status:", error);
    return res.status(500).json({
      error: "Erro interno ao alterar status do contato.",
    });
  }
});

module.exports = router;
