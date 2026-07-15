import type { AuthApplication } from "../auth/service.js";
import { HttpError } from "../http/errors.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { createInvoicePdf } from "./pdf.js";
import { InvoiceService } from "./service.js";
import {
  validateFromDeliveryNotes,
  validateInvoiceCreate,
  validateInvoiceLine,
  validateInvoicePatch,
} from "./validation.js";
export function createInvoiceRoutes(
  auth: AuthApplication,
  service: InvoiceService,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (
      url.pathname === "/invoices/from-delivery-notes" &&
      request.method === "POST"
    ) {
      const i = await auth.authenticate(bearerToken(request));
      json(
        response,
        201,
        await service.fromDeliveryNotes(
          i,
          validateFromDeliveryNotes(await readJson(request)),
        ),
      );
      return true;
    }
    if (url.pathname === "/invoices") {
      const i = await auth.authenticate(bearerToken(request));
      if (request.method === "GET") {
        json(response, 200, await service.list(i, url));
        return true;
      }
      if (request.method === "POST") {
        json(
          response,
          201,
          await service.create(
            i,
            validateInvoiceCreate(await readJson(request)),
          ),
        );
        return true;
      }
    }
    const action = url.pathname.match(/^\/invoices\/([^/]+)\/(issue|cancel)$/);
    if (action && request.method === "POST") {
      const i = await auth.authenticate(bearerToken(request));
      json(
        response,
        200,
        await service[action[2] as "issue" | "cancel"](
          i,
          requireUuid(action[1]),
        ),
      );
      return true;
    }
    const pdf = url.pathname.match(/^\/invoices\/([^/]+)\/pdf$/);
    if (pdf && request.method === "GET") {
      const i = await auth.authenticate(bearerToken(request)),
        invoice = await service.get(i, requireUuid(pdf[1]));
      if (invoice.status !== "issued") throw new HttpError("conflict", 409);
      const buffer = await createInvoicePdf(invoice, {
        name: invoice.issuerLegalName,
        taxId: invoice.issuerTaxId,
        address: invoice.issuerAddress,
      });
      if (buffer.length > 5_000_000)
        throw new HttpError("payload_too_large", 413);
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="factura-${invoice.series}-${invoice.number}.pdf"`,
        "content-length": String(buffer.length),
        "cache-control": "private, no-store",
      });
      response.end(buffer);
      return true;
    }
    const line = url.pathname.match(
      /^\/invoices\/([^/]+)\/lines(?:\/([^/]+))?$/,
    );
    if (line) {
      const i = await auth.authenticate(bearerToken(request)),
        id = requireUuid(line[1]);
      if (request.method === "POST" && !line[2]) {
        json(
          response,
          201,
          await service.line(
            i,
            id,
            undefined,
            validateInvoiceLine(await readJson(request)),
          ),
        );
        return true;
      }
      if (request.method === "PATCH" && line[2]) {
        json(
          response,
          200,
          await service.line(
            i,
            id,
            requireUuid(line[2]),
            validateInvoiceLine(await readJson(request)),
          ),
        );
        return true;
      }
      if (request.method === "DELETE" && line[2]) {
        await service.deleteLine(i, id, requireUuid(line[2]));
        noContent(response);
        return true;
      }
    }
    const match = url.pathname.match(/^\/invoices\/([^/]+)$/);
    if (!match) return false;
    const i = await auth.authenticate(bearerToken(request)),
      id = requireUuid(match[1]);
    if (request.method === "GET") {
      json(response, 200, await service.get(i, id));
      return true;
    }
    if (request.method === "PATCH") {
      json(
        response,
        200,
        await service.update(
          i,
          id,
          validateInvoicePatch(await readJson(request)),
        ),
      );
      return true;
    }
    return false;
  };
}
