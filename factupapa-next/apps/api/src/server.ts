import { createApp } from "./app.js";
import { AuthRepository } from "./auth/repository.js";
import { AuthService } from "./auth/service.js";
import { loadConfig } from "./config.js";
import { createDatabaseProbe } from "./database/client.js";

const config = loadConfig();
const database = createDatabaseProbe(config.databaseUrl);
const auth = await AuthService.create({
  repository: new AuthRepository(database.pool),
  jwtSecret: config.jwtSecret,
  accessTokenTtlSeconds: config.accessTokenTtlSeconds,
  refreshTokenTtlDays: config.refreshTokenTtlDays,
  loginRateLimitMax: config.loginRateLimitMax,
  loginRateLimitWindowMs: config.loginRateLimitWindowMs,
});
const server = createApp({ database, auth, version: config.appVersion });

server.listen(config.port, config.host, () => {
  console.log(`FactuPapa Next API escuchando en http://${config.host}:${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`Cierre solicitado por ${signal}`);
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
