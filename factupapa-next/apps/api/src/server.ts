import { createApp } from "./app.js";
import { AuthRepository } from "./auth/repository.js";
import { AuthService } from "./auth/service.js";
import { loadConfig } from "./config.js";
import { createDatabaseProbe } from "./database/client.js";
import { ContactService } from "./contacts/service.js";
import { createContactRoutes } from "./contacts/routes.js";
import { ProductService } from "./products/service.js";
import { createProductRoutes } from "./products/routes.js";
import { PricingService } from "./pricing/service.js";
import { createPricingRoutes } from "./pricing/routes.js";
import { ImportService } from "./imports/service.js";
import { createImportRoutes } from "./imports/routes.js";
import { DeliveryNoteService } from "./delivery-notes/service.js";
import { createDeliveryNoteRoutes } from "./delivery-notes/routes.js";
import { InvoiceService } from "./invoices/service.js";
import { createInvoiceRoutes } from "./invoices/routes.js";
import { ImportMappingService } from "./imports/mappings.js";
import { createImportMappingRoutes } from "./imports/mapping-routes.js";
import { createReadiness } from "./health/readiness.js";
import { log } from "./observability/logger.js";

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
const contacts = new ContactService(database.pool);
const products = new ProductService(database.pool);
const pricing = new PricingService(database.pool);
const imports = new ImportService(database.pool, {
  maximumBytes: config.importMaximumBytes,
  maximumRows: config.importMaximumRows,
  previewRows: config.importPreviewRows,
});
const importMappings = new ImportMappingService(database.pool);
const deliveryNotes = new DeliveryNoteService(database.pool);
const invoices = new InvoiceService(database.pool);
const server = createApp({
  database,
  auth,
  version: config.appVersion,
  corsAllowedOrigins: config.corsAllowedOrigins,
  authCookie: {
    name: config.authCookieName,
    secure: config.authCookieSecure,
    maxAgeSeconds: config.refreshTokenTtlDays * 86_400,
  },
  readiness: createReadiness({
    database,
    timeoutMs: config.dependencyTimeoutMs,
    ...(config.redisUrl ? { redisUrl: config.redisUrl } : {}),
    ...(config.s3Endpoint && config.s3AccessKey && config.s3SecretKey ? { s3: { endpoint: config.s3Endpoint, bucket: config.s3Bucket, accessKey: config.s3AccessKey, secretKey: config.s3SecretKey } } : {}),
  }),
  metrics: { allowRemote: config.internalMetricsAllowRemote, pool: database.pool, ...(config.internalMetricsToken ? { token: config.internalMetricsToken } : {}) },
  routes: [
    createInvoiceRoutes(auth, invoices),
    createDeliveryNoteRoutes(auth, deliveryNotes),
    createImportMappingRoutes(auth, importMappings),
    createImportRoutes(auth, imports),
    createPricingRoutes(auth, pricing),
    createContactRoutes(auth, contacts),
    createProductRoutes(auth, products),
  ],
});

server.listen(config.port, config.host, () => {
  log("info", { event: "service.started", host: config.host, port: config.port, serviceVersion: config.appVersion });
});

async function shutdown(signal: string) {
  log("info", { event: "service.stopping", signal, serviceVersion: config.appVersion });
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
