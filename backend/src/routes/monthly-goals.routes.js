const express = require("express");
const authMiddleware = require("../middlewares/auth");
const { adminSupabase } = require("../config/supabase");

const router = express.Router();

const ADMIN_ROLE_VALUES = ["admin", "administrator", "administrador"];

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
      profile: null,
    };
  }

  let profileRow = null;

  const { data: profileById } = await adminSupabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  profileRow = profileById || null;

  if (!profileRow && user?.email) {
    const { data: profileByEmail } = await adminSupabase
      .from("profiles")
      .select("id, role, email, full_name")
      .eq("email", user.email)
      .maybeSingle();

    profileRow = profileByEmail || null;
  }

  const rawRole =
    profileRow?.role ||
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    fallbackRole;

  return {
    role: normalizeUserRole(rawRole) || "seller",
    isAdmin: isAdminRole(rawRole),
    profile: profileRow || null,
  };
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const year = Math.max(parseInt(req.query.year || String(new Date().getFullYear()), 10), 2020);

    const { data, error } = await adminSupabase
      .from("monthly_goals")
      .select("id, year, month, target_value, created_at, updated_at")
      .eq("year", year)
      .order("month", { ascending: true });

    if (error) {
      return res.status(500).json({
        message: "Erro ao buscar metas mensais.",
        error: error.message,
      });
    }

    return res.json({
      data: data || [],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro interno ao buscar metas mensais.",
      error: error.message,
    });
  }
});

router.put("/:year", authMiddleware, async (req, res) => {
  try {
    const accessContext = await getAccessContext(req.user);

    if (!accessContext.isAdmin) {
      return res.status(403).json({
        message: "Somente administrador pode alterar metas mensais.",
      });
    }

    const year = Math.max(parseInt(req.params.year, 10), 2020);
    const goals = Array.isArray(req.body?.goals) ? req.body.goals : [];

    const normalizedGoals = goals
      .map((item) => ({
        year,
        month: Number(item.month),
        target_value: Number(item.target_value || 0),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.month) &&
          item.month >= 1 &&
          item.month <= 12 &&
          Number.isFinite(item.target_value)
      );

    if (!normalizedGoals.length) {
      return res.status(400).json({
        message: "Nenhuma meta válida enviada.",
      });
    }

    const { error } = await adminSupabase
      .from("monthly_goals")
      .upsert(normalizedGoals, {
        onConflict: "year,month",
      });

    if (error) {
      return res.status(500).json({
        message: "Erro ao salvar metas mensais.",
        error: error.message,
      });
    }

    const { data, error: fetchError } = await adminSupabase
      .from("monthly_goals")
      .select("id, year, month, target_value, created_at, updated_at")
      .eq("year", year)
      .order("month", { ascending: true });

    if (fetchError) {
      return res.status(500).json({
        message: "Erro ao buscar metas salvas.",
        error: fetchError.message,
      });
    }

    return res.json({
      message: "Metas mensais salvas com sucesso.",
      data: data || [],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro interno ao salvar metas mensais.",
      error: error.message,
    });
  }
});

module.exports = router;
