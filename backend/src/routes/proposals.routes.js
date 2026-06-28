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
    .select("id, role, email, full_name")
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
      .select("id, role, email, full_name")
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

async function loadProfilesMapByIds(userIds) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];

  if (!uniqueIds.length) {
    return new Map();
  }

  const { data, error } = await adminSupabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", uniqueIds);

  if (error) {
    console.error("Erro ao carregar perfis dos criadores:", error);
    return new Map();
  }

  return new Map((data || []).map((profile) => [profile.id, profile]));
}

function attachCreatorInfoToProposal(proposal, profilesMap) {
  if (!proposal) {
    return proposal;
  }

  const creatorProfile = proposal.created_by
    ? profilesMap.get(proposal.created_by)
    : null;

  return {
    ...proposal,
    created_by_name: creatorProfile?.full_name || null,
    created_by_email: creatorProfile?.email || null
  };
}

async function enrichProposalsWithCreatorInfo(proposals) {
  const list = Array.isArray(proposals) ? proposals : [];
  const profilesMap = await loadProfilesMapByIds(
    list.map((proposal) => proposal?.created_by)
  );

  return list.map((proposal) =>
    attachCreatorInfoToProposal(proposal, profilesMap)
  );
}

async function enrichProposalWithCreatorInfo(proposal) {
  if (!proposal) {
    return proposal;
  }

  const profilesMap = await loadProfilesMapByIds([proposal.created_by]);
  return attachCreatorInfoToProposal(proposal, profilesMap);
}

router.post("/", authMiddleware, async (req, res) => {
  try {

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

    const enrichedData = await enrichProposalWithCreatorInfo(data);

    return res.status(201).json({
      message: "Proposta criada com sucesso.",
      data: enrichedData
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


    let query = adminSupabase
      .from("proposals")
      .select(
        "id, proposal_code, title, client_name, status, current_version, created_at, updated_at, created_by, updated_by",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!accessContext.isAdmin) {
      query = query.eq("created_by", req.user.id);
    } else {
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


    if (error) {
      console.error("Erro ao listar propostas:", error);
      return res.status(500).json({
        message: "Erro ao listar propostas.",
        error: error.message
      });
    }

    const enrichedData = await enrichProposalsWithCreatorInfo(data || []);

    return res.json({
      data: enrichedData,
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

    const enrichedData = await enrichProposalWithCreatorInfo(data);

    return res.json({ data: enrichedData });
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

    const enrichedData = await enrichProposalWithCreatorInfo(data);

    return res.json({
      message: "Status da proposta atualizado com sucesso.",
      data: enrichedData
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

    const enrichedData = await enrichProposalWithCreatorInfo(data);

    return res.json({
      message: "Proposta atualizada com sucesso.",
      data: enrichedData
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
