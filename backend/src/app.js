const express = require("express");
const cors = require("cors");

const env = require("./config/env");
const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const proposalsRoutes = require("./routes/proposals.routes");

const app = express();

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API Expert Energy online",
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/proposals", proposalsRoutes);

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Rota não encontrada",
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error("Erro global da aplicação:", err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      status: "error",
      message: "Payload muito grande para o servidor.",
      detail: err.message,
    });
  }

  return res.status(500).json({
    status: "error",
    message: "Erro interno do servidor",
    detail: env.nodeEnv === "development" ? err.message : undefined,
  });
});

module.exports = app;
