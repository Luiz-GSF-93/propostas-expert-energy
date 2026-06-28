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

    let query = adminSupabase
      .from("proposals")
      .select(
        "id, proposal_code, title, client_name, status, current_version, created_at, updated_at",
        { count: "exact" }
      )
      .eq("created_by", req.user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

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

    const { data, error } = await adminSupabase
      .from("proposals")
      .select("*")
      .eq("id", id)
      .eq("created_by", req.user.id)
      .single();

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

    const { data: existingProposal, error: existingError } = await adminSupabase
      .from("proposals")
      .select("id, created_by, status")
      .eq("id", id)
      .eq("created_by", req.user.id)
      .maybeSingle();

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

    const { data, error } = await adminSupabase
      .from("proposals")
      .update(updatePayload)
      .eq("id", id)
      .eq("created_by", req.user.id)
      .select("id, proposal_code, client_name, status, updated_at, updated_by")
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

    const { data, error } = await adminSupabase
      .from("proposals")
      .update(updatePayload)
      .eq("id", id)
      .eq("created_by", req.user.id)
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
