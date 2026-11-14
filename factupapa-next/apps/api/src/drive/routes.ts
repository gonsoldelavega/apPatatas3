import type { AuthApplication } from "../auth/service.js";
import { OWNER_ROLE } from "../authz/partner-policy.js";
import { HttpError } from "../http/errors.js";
import { bearerToken } from "../http/request.js";
import type { RouteHandler } from "../http/router.js";
import { json } from "../http/response.js";
import { DriveLibraryService, type DriveKind, type DriveStatus } from "./library.js";

const KINDS = new Set(["compra", "venta", "gasto", "revisar", "otro"]);
const STATUSES = new Set(["registrada", "sin_registrar", "duplicado", "revisar", "no_aplica"]);

/** Biblioteca de Drive (solo maestro). */
export function createDriveRoutes(auth: AuthApplication, drive: DriveLibraryService): RouteHandler {
  return async ({ request, response, url }) => {
    if (!url.pathname.startsWith("/drive/")) return false;
    const identity = await auth.authenticate(bearerToken(request));
    if (identity.role !== OWNER_ROLE) throw new HttpError("forbidden", 403);
    if (url.pathname === "/drive/status" && request.method === "GET") {
      json(response, 200, await drive.status(identity));
      return true;
    }
    if (url.pathname === "/drive/sync" && request.method === "POST") {
      json(response, 202, { started: drive.start(identity) });
      return true;
    }
    if (url.pathname === "/drive/files" && request.method === "GET") {
      const kind = url.searchParams.get("kind");
      const status = url.searchParams.get("status");
      const month = url.searchParams.get("month");
      const search = url.searchParams.get("q")?.trim().slice(0, 100);
      if ((kind && !KINDS.has(kind)) || (status && !STATUSES.has(status)) || (month && !/^\d{4}-\d{2}$/.test(month))) {
        throw new HttpError("invalid_request", 400);
      }
      json(
        response,
        200,
        await drive.list(identity, {
          ...(kind ? { kind: kind as DriveKind } : {}),
          ...(status ? { status: status as DriveStatus } : {}),
          ...(month ? { month } : {}),
          ...(search ? { search } : {}),
        }),
      );
      return true;
    }
    return false;
  };
}
