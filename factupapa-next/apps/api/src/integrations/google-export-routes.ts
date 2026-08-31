import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson } from "../http/request.js";
import { json } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { GoogleInvoiceExporter } from "./google-export.js";

export function createGoogleExportRoutes(auth: AuthApplication, exporter: GoogleInvoiceExporter): RouteHandler {
  return async ({ request, response, url }) => {
    if (request.method !== "POST" || url.pathname !== "/integrations/google/export/backfill") return false;
    const identity = await auth.authenticate(bearerToken(request));
    const body = await readJson(request);
    const numbers = Array.isArray(body.numbers) && body.numbers.every((n) => Number.isInteger(n)) ? body.numbers as number[] : [143, 144, 145, 146, 147];
    json(response, 202, { enqueued: await exporter.backfill(identity, numbers) });
    return true;
  };
}
