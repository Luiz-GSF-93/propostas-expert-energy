const express = require("express");
const authMiddleware = require("../middlewares/auth");
const { adminSupabase } = require("../config/supabase");

const router = express.Router();

const ALLOWED_PROPOSAL_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected"
];

const STATUS_ALIAS_MAP = {
  sent: "pending",
  cancelled: "rejected",
  canceled: "rejected"
};

const ADMIN_ROLE_VALUES = [
  "admin",
  "administrator",
  "administrador"
];

function normalizeUserRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isAdminRole(role) {
  return ADMIN_ROLE_VALUES.includes(normalizeUserRole(role));
}

async function getAccessContext(user) {
  const fallbackRole =
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    "seller";

  if (!user?.id) {
    return {
      role: normalizeUserRole(fallbackRole) || "seller",
      isAdmin: isAdminRole(fallbackRole),
      profile: null
    };
  }

  let profileRow = null;

  const { data: profileById, error: profileByIdError } = await adminSupabase
    .from("profiles")
    .select("id, role, email, full_name, name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileByIdError) {
    console.error("Erro ao buscar perfil por id para autorização:", profileByIdError);
  } else {
    profileRow = profileById || null;
  }

  if (!profileRow && user?.email) {
    const { data: profileByEmail, error: profileByEmailError } = await adminSupabase
      .from("profiles")
      .select("id, role, email, full_name, name")
      .eq("email", user.email)
      .maybeSingle();

    if (profileByEmailError) {
      console.error("Erro ao buscar perfil por email para autorização:", profileByEmailError);
    } else {
      profileRow = profileByEmail || null;
    }
  }

  const rawRole =
    profileRow?.role ||
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    fallbackRole;

  return {
    role: normalizeUserRole(rawRole) || "seller",
    isAdmin: isAdminRole(rawRole),
    profile: profileRow || null
  };
}

function normalizeProposalStatus(status) {
  if (status === undefined || status === null || status === "") {
    return "draft";
  }

  const normalized = String(status).trim().toLowerCase();
  return STATUS_ALIAS_MAP[normalized] || normalized;
}

function normalizePagination(query) {
  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || "20", 10), 1), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return { page, limit, from, to };
}

function isValidProposalStatus(status) {
  return ALLOWED_PROPOSAL_STATUSES.includes(normalizeProposalStatus(status));
}

router.post("/", authMiddleware, async (req, res) => {
  try {
    console.log("BODY recebido em POST /api/proposals:", req.body);
    console.log("USER autenticado:", req.user);

    const {
      title,
      client_name,
      client_document,
      client_email,
      client_phone,
      editable_json,
      status
    } = req.body;

    if (!client_name || !String(client_name).trim()) {
      return res.status(400).json({
        message: "O campo client_name é obrigatório."
      });
    }

    const normalizedStatus = normalizeProposalStatus(status || "draft");

    if (!isValidProposalStatus(normalizedStatus)) {
      return res.status(400).json({
        message: "Status inválido.",
        allowed_statuses: ALLOWED_PROPOSAL_STATUSES
      });
    }

    const { data: proposalCodeData, error: proposalCodeError } =
      await adminSupabase.rpc("generate_proposal_code");

    if (proposalCodeError) {
      console.error("Erro ao gerar código da proposta:", proposalCodeError);
      return res.status(500).json({
        message: "Erro ao gerar código da proposta.",
        error: proposalCodeError.message
      });
    }

    const payload = {
      proposal_code: proposalCodeData,
      title: title || "Proposta Comercial Especializada",
      client_name: String(client_name).trim(),
      client_document: client_document || null,
      client_email: client_email || null,
      client_phone: client_phone || null,
      editable_json: editable_json || {},
      status: normalizedStatus,
      current_version: 1,
      public_enabled: false,
      created_by: req.user.id,
      updated_by: req.user.id
    };

    console.log("Payload enviado ao Supabase:", payload);

    const { data, error } = await adminSupabase
      .from("proposals")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      console.error("Erro ao criar proposta no Supabase:", error);
      return res.status(500).json({
        message: "Erro ao criar proposta.",
        error: error.message
      });
    }

    const { error: eventError } = await adminSupabase
      .from("proposal_events")
      .insert({
        proposal_id: data.id,
        event_type: "created",
        actor_id: req.user.id,
        payload: {
          proposal_code: data.proposal_code,
          status: data.status
        }
      });

    if (eventError) {
      console.error("Erro ao registrar evento da proposta:", eventError);
    }

    return res.status(201).json({
      message: "Proposta criada com sucesso.",
      data
    });
  } catch (error) {
    console.error("Erro interno ao criar proposta:", error);
    return res.status(500).json({
      message: "Erro interno ao criar proposta.",
      error: error.message
    });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, search } = req.query;
    const { page, limit, from, to } = normalizePagination(req.query);

    const accessContext = await getAccessContext(req.user);

    console.log("[GET /api/proposals] user_id:", req.user?.id);
    console.log("[GET /api/proposals] accessContext:", accessContext);

    let query = adminSupabase
      .from("proposals")
      .select(
        "id, proposal_code, title, client_name, status, current_version, created_at, updated_at, created_by, updated_by",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!accessContext.isAdmin) {
      console.log("[GET /api/proposals] aplicando filtro created_by =", req.user.id);
      query = query.eq("created_by", req.user.id);
    } else {
      console.log("[GET /api/proposals] admin detectado, sem filtro por created_by");
    }

    if (status) {
      const normalizedStatus = normalizeProposalStatus(status);

      if (!isValidProposalStatus(normalizedStatus)) {
        return res.status(400).json({
          message: "Status inválido.",
          allowed_statuses: ALLOWED_PROPOSAL_STATUSES
        });
      }

      query = query.eq("status", normalizedStatus);
    }

    if (search) {
      const term = String(search).trim();
      query = query.or(
        `client_name.ilike.%${term}%,proposal_code.ilike.%${term}%,title.ilike.%${term}%`
      );
    }

    const { data, error, count } = await query;

    console.log("[GET /api/proposals] count:", count);
    console.log("[GET /api/proposals] total retornado no array:", Array.isArray(data) ? data.length : "não-array");
    console.log("[GET /api/proposals] created_by retornados:", Array.isArray(data) ? data.map(item => item.created_by) : []);

    if (error) {
      console.error("Erro ao listar propostas:", error);
      return res.status(500).json({
        message: "Erro ao listar propostas.",
        error: error.message
      });
    }

    return res.json({
      data,
      meta: {
        page,
        limit,
        total: count || 0
      }
    });
  } catch (error) {
    console.error("Erro interno ao listar propostas:", error);
    return res.status(500).json({
      message: "Erro interno ao listar propostas.",
      error: error.message
    });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const accessContext = await getAccessContext(req.user);

    let proposalQuery = adminSupabase
      .from("proposals")
      .select("*")
      .eq("id", id);

    if (!accessContext.isAdmin) {
      proposalQuery = proposalQuery.eq("created_by", req.user.id);
    }

    const { data, error } = await proposalQuery.single();

    if (error || !data) {
      return res.status(404).json({
        message: "Proposta não encontrada.",
        error: error?.message
      });
    }

    return res.json({ data });
  } catch (error) {
    console.error("Erro interno ao buscar proposta:", error);
    return res.status(500).json({
      message: "Erro interno ao buscar proposta.",
      error: error.message
    });
  }
});

router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const rawStatus = req.body?.status;
    const normalizedStatus = normalizeProposalStatus(rawStatus);

    console.log("[PATCH /api/proposals/:id/status]");
    console.log("proposal_id:", id);
    console.log("rawStatus:", rawStatus);
    console.log("normalizedStatus:", normalizedStatus);
    console.log("user_id:", req.user?.id);

    if (!isValidProposalStatus(normalizedStatus)) {
      return res.status(400).json({
        message: "Status inválido.",
        received_status: rawStatus,
        normalized_status: normalizedStatus,
        allowed_statuses: ALLOWED_PROPOSAL_STATUSES
      });
    }

    const accessContext = await getAccessContext(req.user);

    let existingProposalQuery = adminSupabase
      .from("proposals")
      .select("id, created_by, status")
      .eq("id", id);

    if (!accessContext.isAdmin) {
      existingProposalQuery = existingProposalQuery.eq("created_by", req.user.id);
    }

    const { data: existingProposal, error: existingError } = await existingProposalQuery.maybeSingle();

    if (existingError) {
      console.error("Erro ao buscar proposta antes do update:", existingError);
      return res.status(500).json({
        message: "Erro ao localizar a proposta antes da atualização.",
        error: existingError.message,
        details: existingError
      });
    }

    if (!existingProposal) {
      return res.status(404).json({
        message: "Proposta não encontrada para este usuário."
      });
    }

    const updatePayload = {
      status: normalizedStatus
    };

    if (req.user?.id) {
      updatePayload.updated_by = req.user.id;
    }

    let updateStatusQuery = adminSupabase
      .from("proposals")
      .update(updatePayload)
      .eq("id", id);

    if (!accessContext.isAdmin) {
      updateStatusQuery = updateStatusQuery.eq("created_by", req.user.id);
    }

    const { data, error } = await updateStatusQuery
      .select("id, proposal_code, client_name, status, updated_at, updated_by, created_by")
      .maybeSingle();

    if (error) {
      console.error("Erro ao atualizar status da proposta:", error);
      return res.status(500).json({
        message: "Erro ao atualizar status da proposta.",
        error: error.message,
        code: error.code || null,
        hint: error.hint || null,
        details: error.details || null,
        normalized_status: normalizedStatus,
        updatePayload
      });
    }

    if (!data) {
      return res.status(404).json({
        message: "A proposta foi localizada, mas não retornou dados após o update."
      });
    }

    const { error: eventError } = await adminSupabase
      .from("proposal_events")
      .insert({
        proposal_id: data.id,
        event_type: "status_changed",
        actor_id: req.user.id,
        payload: {
          status: data.status
        }
      });

    if (eventError) {
      console.error("Erro ao registrar evento de mudança de status:", eventError);
    }

    return res.json({
      message: "Status da proposta atualizado com sucesso.",
      data
    });
  } catch (error) {
    console.error("Erro interno ao atualizar status da proposta:", error);
    return res.status(500).json({
      message: "Erro interno ao atualizar status da proposta.",
      error: error.message
    });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      client_name,
      client_document,
      client_email,
      client_phone,
      editable_json,
      status
    } = req.body;

    if (status !== undefined) {
      const normalizedStatus = normalizeProposalStatus(status);

      if (!isValidProposalStatus(normalizedStatus)) {
        return res.status(400).json({
          message: "Status inválido.",
          allowed_statuses: ALLOWED_PROPOSAL_STATUSES
        });
      }
    }

    const accessContext = await getAccessContext(req.user);

    const updatePayload = {
      updated_by: req.user.id
    };

    if (title !== undefined) updatePayload.title = title;
    if (client_name !== undefined) updatePayload.client_name = client_name;
    if (client_document !== undefined) updatePayload.client_document = client_document;
    if (client_email !== undefined) updatePayload.client_email = client_email;
    if (client_phone !== undefined) updatePayload.client_phone = client_phone;
    if (editable_json !== undefined) updatePayload.editable_json = editable_json;
    if (status !== undefined) updatePayload.status = normalizeProposalStatus(status);

    let updateProposalQuery = adminSupabase
      .from("proposals")
      .update(updatePayload)
      .eq("id", id);

    if (!accessContext.isAdmin) {
      updateProposalQuery = updateProposalQuery.eq("created_by", req.user.id);
    }

    const { data, error } = await updateProposalQuery
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Erro ao atualizar proposta:", error);
      return res.status(500).json({
        message: "Erro ao atualizar proposta.",
        error: error.message,
        code: error.code || null,
        hint: error.hint || null,
        details: error.details || null,
        updatePayload
      });
    }

    if (!data) {
      return res.status(404).json({
        message: "Proposta não encontrada."
      });
    }

    const { error: eventError } = await adminSupabase
      .from("proposal_events")
      .insert({
        proposal_id: data.id,
        event_type: "updated",
        actor_id: req.user.id,
        payload: {
          updated_fields: Object.keys(updatePayload)
        }
      });

    if (eventError) {
      console.error("Erro ao registrar evento de atualização:", eventError);
    }

    return res.json({
      message: "Proposta atualizada com sucesso.",
      data
    });
  } catch (error) {
    console.error("Erro interno ao atualizar proposta:", error);
    return res.status(500).json({
      message: "Erro interno ao atualizar proposta.",
      error: error.message
    });
  }
});

module.exports = router;
