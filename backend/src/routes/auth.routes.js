const express = require("express");
const authMiddleware = require("../middlewares/auth");
const { adminSupabase } = require("../config/supabase");

const router = express.Router();

function mapRoleLabel(role) {
  const normalized = String(role || "").trim().toLowerCase();

  if (normalized === "admin" || normalized === "administrator") return "Administrador";
  if (normalized === "manager" || normalized === "gestor") return "Gestor";
  if (normalized === "seller" || normalized === "sales" || normalized === "comercial") return "Comercial";

  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Comercial";
}

function buildProfileFromSources(profileRow, authUser, tokenUser) {
  const email =
    profileRow?.email ||
    authUser?.email ||
    tokenUser?.email ||
    tokenUser?.user_metadata?.email ||
    null;

  const fullName =
    profileRow?.full_name ||
    profileRow?.name ||
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    tokenUser?.user_metadata?.full_name ||
    tokenUser?.user_metadata?.name ||
    email ||
    "Usuário";

  const rawRole =
    profileRow?.role ||
    profileRow?.profile ||
    authUser?.user_metadata?.role ||
    tokenUser?.user_metadata?.role ||
    "seller";

  const companyName =
    profileRow?.company_name ||
    authUser?.user_metadata?.company_name ||
    tokenUser?.user_metadata?.company_name ||
    null;

  const roleLabel = mapRoleLabel(rawRole);

  return {
    id: profileRow?.id || authUser?.id || tokenUser?.id || null,

    full_name: fullName,
    name: fullName,

    email: email,

    role: rawRole,
    role_label: roleLabel,
    profile: roleLabel,

    company_name: companyName
  };
}

router.get("/me", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Usuário não autenticado."
      });
    }

    let profileRow = null;
    let authUser = null;

    const profileResult = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .maybeSingle();

    if (profileResult.error) {
      console.error("Erro ao buscar perfil em profiles:", profileResult.error);
    } else {
      profileRow = profileResult.data || null;
    }

    try {
      const authResult = await adminSupabase.auth.admin.getUserById(req.user.id);
      authUser = authResult?.data?.user || null;

      if (authResult?.error) {
        console.error("Erro ao buscar usuário no auth admin:", authResult.error);
      }
    } catch (authError) {
      console.error("Erro inesperado ao buscar usuário no auth admin:", authError);
    }

    const data = buildProfileFromSources(profileRow, authUser, req.user);

    return res.json({ data });
  } catch (error) {
    console.error("Erro interno ao buscar perfil:", error);

    const fallbackData = buildProfileFromSources(null, null, req.user || {});

    return res.json({
      data: fallbackData
    });
  }
});

module.exports = router;
