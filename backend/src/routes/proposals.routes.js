const express = require("express");
const authMiddleware = require("../middlewares/auth");
const { adminSupabase } = require("../config/supabase");

const router = express.Router();

function normalizePagination(query) {
  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || "20", 10), 1), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return { page, limit, from, to };
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
      editable_json
    } = req.body;

    if (!client_name || !String(client_name).trim()) {
      return res.status(400).json({
        message: "O campo client_name é obrigatório."
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
      status: "draft",
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
          proposal_code: data.proposal_code
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
        "id, proposal_code, title, client_name, status, current_version, html_url, pdf_url, public_slug, public_enabled, created_at, updated_at",
        { count: "exact" }
      )
      .eq("created_by", req.user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq("status", status);
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

    const updatePayload = {
      updated_by: req.user.id
    };

    if (title !== undefined) updatePayload.title = title;
    if (client_name !== undefined) updatePayload.client_name = client_name;
    if (client_document !== undefined) updatePayload.client_document = client_document;
    if (client_email !== undefined) updatePayload.client_email = client_email;
    if (client_phone !== undefined) updatePayload.client_phone = client_phone;
    if (editable_json !== undefined) updatePayload.editable_json = editable_json;
    if (status !== undefined) updatePayload.status = status;

    const { data, error } = await adminSupabase
      .from("proposals")
      .update(updatePayload)
      .eq("id", id)
      .eq("created_by", req.user.id)
      .select("*")
      .single();

    if (error) {
      console.error("Erro ao atualizar proposta:", error);
      return res.status(500).json({
        message: "Erro ao atualizar proposta.",
        error: error.message
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
