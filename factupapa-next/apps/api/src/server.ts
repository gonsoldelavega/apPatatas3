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
  routes: [
    createInvoiceRoutes(auth, invoices),
    createDeliveryNoteRoutes(auth, deliveryNotes),
    createImportRoutes(auth, imports),
    createPricingRoutes(auth, pricing),
    createContactRoutes(auth, contacts),
    createProductRoutes(auth, products),
  ],
});

server.listen(config.port, config.host, () => {
  console.log(
    `FactuPapa Next API escuchando en http://${config.host}:${config.port}`,
  );
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
