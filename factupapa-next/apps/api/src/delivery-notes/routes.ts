import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { assertPdfSize } from "../invoices/routes.js";
import { createDeliveryNotePdf } from "./pdf.js";
import { DeliveryNoteService } from "./service.js";
import {
  validateDeliveryCreate,
  validateDeliveryFromLast,
  validateDeliveryLine,
  validateDeliveryNumberPreview,
  validateDeliveryPatch,
  validateDeliveryPdfOptions,
} from "./validation.js";
export function createDeliveryNoteRoutes(
  auth: AuthApplication,
  service: DeliveryNoteService,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/delivery-notes") {
      const identity = await auth.authenticate(bearerToken(request));
      if (request.method === "GET") {
        json(response, 200, await service.list(identity, url));
        return true;
      }
      if (request.method === "POST") {
        json(
          response,
          201,
          await service.create(
            identity,
            validateDeliveryCreate(await readJson(request)),
          ),
        );
        return true;
      }
    }
    if (url.pathname === "/delivery-notes/number-preview" && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      json(
        response,
        200,
        await service.numberPreview(
          identity,
          validateDeliveryNumberPreview(url.searchParams.get("series")),
        ),
      );
      return true;
    }
    if (url.pathname === "/delivery-notes/from-last" && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      json(
        response,
        201,
        await service.createFromLast(
          identity,
          validateDeliveryFromLast(await readJson(request)),
        ),
      );
      return true;
    }
    const pdf = url.pathname.match(/^\/delivery-notes\/([^/]+)\/pdf$/);
    if (pdf && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      const options = validateDeliveryPdfOptions(url.searchParams);
      const data = await service.pdfData(identity, requireUuid(pdf[1]));
      const buffer = await createDeliveryNotePdf(data, options);
      assertPdfSize(buffer);
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="albaran-${data.note.series}-${data.note.number}.pdf"`,
        "content-length": String(buffer.length),
        "cache-control": "private, no-store",
      });
      response.end(buffer);
      return true;
    }
    const action = url.pathname.match(
      /^\/delivery-notes\/([^/]+)\/(issue|cancel)$/,
    );
    if (action && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      json(
        response,
        200,
        await service[action[2] as "issue" | "cancel"](
          identity,
          requireUuid(action[1]),
        ),
      );
      return true;
    }
    const line = url.pathname.match(
      /^\/delivery-notes\/([^/]+)\/lines(?:\/([^/]+))?$/,
    );
    if (line) {
      const identity = await auth.authenticate(bearerToken(request));
      const id = requireUuid(line[1]);
      if (request.method === "POST" && !line[2]) {
        json(
          response,
          201,
          await service.addLine(
            identity,
            id,
            validateDeliveryLine(await readJson(request)),
          ),
        );
        return true;
      }
      if (request.method === "PATCH" && line[2]) {
        json(
          response,
          200,
          await service.updateLine(
            identity,
            id,
            requireUuid(line[2]),
            validateDeliveryLine(await readJson(request)),
          ),
        );
        return true;
      }
      if (request.method === "DELETE" && line[2]) {
        await service.deleteLine(identity, id, requireUuid(line[2]));
        noContent(response);
        return true;
      }
    }
    const match = url.pathname.match(/^\/delivery-notes\/([^/]+)$/);
    if (!match) return false;
    const identity = await auth.authenticate(bearerToken(request));
    const id = requireUuid(match[1]);
    if (request.method === "GET") {
      json(response, 200, await service.get(identity, id));
      return true;
    }
    if (request.method === "DELETE") {
      await service.delete(identity, id);
      noContent(response);
      return true;
    }
    if (request.method === "PATCH") {
      json(
        response,
        200,
        await service.update(
          identity,
          id,
          validateDeliveryPatch(await readJson(request)),
        ),
      );
      return true;
    }
    return false;
  };
}
