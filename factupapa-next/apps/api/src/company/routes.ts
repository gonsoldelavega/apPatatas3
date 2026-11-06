import type { AuthApplication } from "../auth/service.js";
import { OWNER_ROLE } from "../authz/partner-policy.js";
import { HttpError } from "../http/errors.js";
import { bearerToken, readJson } from "../http/request.js";
import type { RouteHandler } from "../http/router.js";
import { json } from "../http/response.js";
import { validateCompanyProfile, type CompanyService } from "./service.js";

/** Ficha de la empresa (emisor de facturas y albaranes). Solo el usuario maestro. */
export function createCompanyRoutes(auth: AuthApplication, company: CompanyService): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname !== "/company/profile") return false;
    const identity = await auth.authenticate(bearerToken(request));
    if (identity.role !== OWNER_ROLE) throw new HttpError("forbidden", 403);
    if (request.method === "GET") {
      json(response, 200, await company.get(identity));
      return true;
    }
    if (request.method === "PUT") {
      json(response, 200, await company.update(identity, validateCompanyProfile(await readJson(request))));
      return true;
    }
    return false;
  };
}
