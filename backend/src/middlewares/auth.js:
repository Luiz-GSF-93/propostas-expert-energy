const { authSupabase } = require("../config/supabase");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Token de autenticação não informado."
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const { data, error } = await authSupabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        message: "Token inválido ou expirado."
      });
    }

    req.user = data.user;
    req.accessToken = token;

    next();
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao validar autenticação.",
      error: error.message
    });
  }
}

module.exports = authMiddleware;
