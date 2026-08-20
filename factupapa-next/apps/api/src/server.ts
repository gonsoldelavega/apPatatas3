import { createApp } from "./app.js";
import { AuthRepository } from "./auth/repository.js";
import { AuthService } from "./auth/service.js";
import { GoogleOAuthService } from "./auth/google.js";
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
import { SalesPreferencesService } from "./sales-preferences/service.js";
import { createSalesPreferencesRoutes } from "./sales-preferences/routes.js";
import { FinanceService } from "./finance/service.js";
import { createFinanceRoutes } from "./finance/routes.js";
import { AccountsService } from "./accounts/service.js";
import { createAccountsRoutes } from "./accounts/routes.js";
import { GmailIntegrationService } from "./integrations/gmail.js";
import { createGmailRoutes } from "./integrations/gmail-routes.js";

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
const googleOAuth = config.googleOAuth
  ? new GoogleOAuthService(config.googleOAuth)
  : undefined;
const gmail = config.googleOAuth
  ? new GmailIntegrationService(database.pool, {
      ...config.googleOAuth,
      redirectUri: new URL(
        "/api/integrations/gmail/callback",
        config.googleOAuth.frontendUrl,
      ).toString(),
      encryptionSecret: config.jwtSecret,
    })
  : undefined;
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
const salesPreferences = new SalesPreferencesService(database.pool);
const finance = new FinanceService(
  database.pool,
  config.s3Endpoint && config.s3AccessKey && config.s3SecretKey
    ? {
        endpoint: config.s3Endpoint,
        bucket: config.s3Bucket,
        accessKey: config.s3AccessKey,
        secretKey: config.s3SecretKey,
      }
    : undefined,
  {
    ownTaxIds: config.ownTaxIds,
    visionModel: config.anthropicModel,
    budget: {
      dailyAttempts: config.ocrDailyAttemptLimit,
      monthlyAttempts: config.ocrMonthlyAttemptLimit,
      monthlyMicrousd: config.ocrMonthlyBudgetMicrousd,
    },
    ...(config.anthropicApiKey
      ? { anthropicApiKey: config.anthropicApiKey }
      : {}),
  },
  config.purchaseRegistryUrl
    ? {
        url: config.purchaseRegistryUrl,
        ...(config.purchaseRegistryToken
          ? { token: config.purchaseRegistryToken }
          : {}),
      }
    : undefined,
);
const accounts = new AccountsService(database.pool);
const server = createApp({
  database,
  auth,
  version: config.appVersion,
  corsAllowedOrigins: config.corsAllowedOrigins,
  authCookie: {
    name: config.authCookieName,
    secure: config.authCookieSecure,
    maxAgeSeconds: config.refreshTokenTtlDays * 86_400,
    path: config.authCookiePath,
  },
  ...(googleOAuth ? { googleOAuth } : {}),
  readiness: createReadiness({
    database,
    timeoutMs: config.dependencyTimeoutMs,
    ...(config.redisUrl ? { redisUrl: config.redisUrl } : {}),
    ...(config.s3Endpoint && config.s3AccessKey && config.s3SecretKey
      ? {
          s3: {
            endpoint: config.s3Endpoint,
            bucket: config.s3Bucket,
            accessKey: config.s3AccessKey,
            secretKey: config.s3SecretKey,
          },
        }
      : {}),
  }),
  metrics: {
    allowRemote: config.internalMetricsAllowRemote,
    pool: database.pool,
    ...(config.internalMetricsToken
      ? { token: config.internalMetricsToken }
      : {}),
  },
  routes: [
    createGmailRoutes(auth, gmail, finance, config.authCookieSecure),
    createAccountsRoutes(auth, accounts),
    createFinanceRoutes(auth, finance),
    createSalesPreferencesRoutes(auth, salesPreferences),
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
  log("info", {
    event: "service.started",
    host: config.host,
    port: config.port,
    serviceVersion: config.appVersion,
  });
});

const gmailInboxTimer = gmail
  ? setInterval(() => void gmail.syncDueInboxes(finance), 15 * 60_000)
  : undefined;
gmailInboxTimer?.unref();
if (gmail) setTimeout(() => void gmail.syncDueInboxes(finance), 30_000).unref();

async function shutdown(signal: string) {
  if (gmailInboxTimer) clearInterval(gmailInboxTimer);
  log("info", {
    event: "service.stopping",
    signal,
    serviceVersion: config.appVersion,
  });
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
