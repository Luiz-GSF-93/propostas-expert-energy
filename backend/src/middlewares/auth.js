const { createClient } = require("@supabase/supabase-js");
const env = require("../config/env");

const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

module.exports = async function authMiddleware(req, res, next) {
  try {
    console.log("=== AUTH MIDDLEWARE ===");
    console.log("Método:", req.method);
    console.log("URL:", req.originalUrl);

    const authHeader = req.headers.authorization;
    console.log("Authorization header existe?", !!authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Token de autenticação não informado."
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    console.log("Token extraído?", !!token);
    console.log("Tamanho do token:", token.length);

    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("Erro no Supabase auth.getUser:", error);
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

    console.log("Usuário autenticado:", data.user.id);

    req.user = data.user;
    next();
  } catch (error) {
    console.error("Erro interno no auth middleware:", error);
    return res.status(500).json({
      message: "Erro interno na autenticação.",
      error: error.message
    });
  }
};
