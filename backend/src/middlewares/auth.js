const { authSupabase, adminSupabase } = require("../config/supabase");

module.exports = async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Token de autenticação não informado."
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const { data, error } = await authSupabase.auth.getUser(token);

    if (error) {
      return res.status(401).json({
        message: "Token inválido ou expirado.",
        error: error.message
      });
    }

    if (!data?.user) {
      return res.status(401).json({
        message: "Usuário não encontrado para o token informado."
      });
    }

    const user = data.user;
    let profileRow = null;

    const { data: profileById, error: profileByIdError } = await adminSupabase
      .from("profiles")
      .select("id, email, role, is_active, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileByIdError) {
      console.error("Erro ao buscar perfil por id no auth middleware:", profileByIdError);
    } else {
      profileRow = profileById || null;
    }

    if (!profileRow && user?.email) {
      const { data: profileByEmail, error: profileByEmailError } = await adminSupabase
        .from("profiles")
        .select("id, email, role, is_active, full_name")
        .eq("email", user.email)
        .maybeSingle();

      if (profileByEmailError) {
        console.error("Erro ao buscar perfil por email no auth middleware:", profileByEmailError);
      } else {
        profileRow = profileByEmail || null;
      }
    }

    if (profileRow && profileRow.is_active === false) {
      return res.status(403).json({
        message: "Usuário inativo."
      });
    }

    req.user = user;
    req.profile = profileRow || null;

    next();
  } catch (error) {
    console.error("Erro interno no auth middleware:", error);
    return res.status(500).json({
      message: "Erro interno na autenticação.",
      error: error.message
    });
  }
};
