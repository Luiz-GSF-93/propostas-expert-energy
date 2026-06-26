const app = require("./app");
const env = require("./config/env");

app.listen(env.port, "0.0.0.0", () => {
  console.log(`Backend rodando na porta ${env.port}`);
  console.log(`Ambiente: ${env.nodeEnv}`);
});
