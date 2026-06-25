const express = require("express");
const authMiddleware = require("../middlewares/auth");
const { adminSupabase } = require("../config/supabase");

const router = express.Router();

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: profile, error } = await adminSupabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, created_at")
      .eq("id", userId)
      .single();

    if (error) {
      return res.status(404).json({
        message: "Perfil do usuário não encontrado.",
        error: error.message
      });
    }

    return res.json(profile);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar usuário autenticado.",
      error: error.message
    });
  }
});

module.exports = router;
