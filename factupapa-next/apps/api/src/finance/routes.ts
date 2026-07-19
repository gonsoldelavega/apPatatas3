import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { FinanceService } from "./service.js";
import {
  financeRange,
  validatePurchase,
  validateRecurringExpense,
  validateStockAdjustment,
  validateStockLevel,
} from "./validation.js";
export function createFinanceRoutes(
  auth: AuthApplication,
  finance: FinanceService,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/purchase-documents" && request.method === "POST") {
      const id = await auth.authenticate(bearerToken(request)),
        body = await readJson(request, 14_000_000);
      json(
        response,
        201,
        await finance.uploadDocument(id, {
          filename: body.filename,
          mimeType: body.mimeType,
          contentBase64: body.contentBase64,
          documentId: body.documentId,
        }),
      );
      return true;
    }
    const doc = url.pathname.match(/^\/purchase-documents\/([^/]+)$/);
    if (doc && request.method === "GET") {
      const id = await auth.authenticate(bearerToken(request)),
        file = await finance.downloadDocument(id, requireUuid(doc[1]));
      response.setHeader("Content-Type", file.mimeType);
      response.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
      response.end(file.body);
      return true;
    }
    const id = await auth.authenticate(bearerToken(request));
    if (url.pathname === "/finance/ocr-budget" && request.method === "GET") {
      json(response, 200, await finance.ocrBudgetStatus(id));
      return true;
    }
    if (url.pathname === "/finance/summary" && request.method === "GET") {
      json(response, 200, await finance.summary(id, financeRange(url)));
      return true;
    }
    if (url.pathname === "/finance/monthly" && request.method === "GET") {
      const raw = Number(url.searchParams.get("months") ?? 6),
        months = Number.isInteger(raw) && raw >= 1 && raw <= 24 ? raw : 6;
      json(response, 200, await finance.monthlySummary(id, months));
      return true;
    }
    if (url.pathname === "/stock" && request.method === "GET") {
      json(response, 200, await finance.stock(id));
      return true;
    }
    if (url.pathname === "/stock/movements" && request.method === "GET") {
      const product = url.searchParams.get("productId");
      json(
        response,
        200,
        await finance.stockMovements(id, product ? requireUuid(product) : undefined),
      );
      return true;
    }
    if (url.pathname === "/stock/adjustments" && request.method === "POST") {
      json(
        response,
        201,
        await finance.addStockAdjustment(
          id,
          validateStockAdjustment(await readJson(request)),
        ),
      );
      return true;
    }
    if (url.pathname === "/stock/level" && request.method === "POST") {
      json(
        response,
        200,
        await finance.setStockLevel(id, validateStockLevel(await readJson(request))),
      );
      return true;
    }
    if (url.pathname === "/purchases/export" && request.method === "GET") {
      json(
        response,
        200,
        await finance.exportConfirmedPurchases(id, financeRange(url)),
      );
      return true;
    }
    if (url.pathname === "/purchases" && request.method === "GET") {
      json(response, 200, await finance.listPurchases(id, financeRange(url)));
      return true;
    }
    if (url.pathname === "/purchases" && request.method === "POST") {
      json(
        response,
        201,
        await finance.createPurchase(
          id,
          validatePurchase(await readJson(request)),
        ),
      );
      return true;
    }
    const p = url.pathname.match(
      /^\/purchases\/([^/]+)(?:\/(confirm|cancel))?$/,
    );
    if (p) {
      const pid = requireUuid(p[1]);
      if (request.method === "GET" && !p[2]) {
        json(response, 200, await finance.getPurchase(id, pid));
        return true;
      }
      if (request.method === "POST" && p[2]) {
        json(
          response,
          200,
          await finance.transitionPurchase(
            id,
            pid,
            p[2] === "confirm" ? "confirmed" : "cancelled",
          ),
        );
        return true;
      }
    }
    if (url.pathname === "/recurring-expenses" && request.method === "GET") {
      json(response, 200, await finance.listRecurring(id));
      return true;
    }
    if (url.pathname === "/recurring-expenses" && request.method === "POST") {
      json(
        response,
        201,
        await finance.createRecurring(
          id,
          validateRecurringExpense(await readJson(request)),
        ),
      );
      return true;
    }
    const rec = url.pathname.match(/^\/recurring-expenses\/([^/]+)$/);
    if (rec && request.method === "DELETE") {
      await finance.deactivateRecurring(id, requireUuid(rec[1]));
      noContent(response);
      return true;
    }
    return false;
  };
}
