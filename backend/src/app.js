const express = require("express");
const env = require("./config/env");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const proposalsRoutes = require("./routes/proposals.routes");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://cuddly-parakeet-974r47g7v9r4h97xp-3000.app.github.dev"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  return res.json({
    message: "API Proposta Expert Energy online."
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/proposals", proposalsRoutes);

app.use((req, res) => {
  return res.status(404).json({
    message: "Rota não encontrada."
  });
});

module.exports = app;
