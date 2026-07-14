import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { ProductService } from "./service.js";
import { validateProductCreate, validateProductList, validateProductPatch } from "./validation.js";

export function createProductRoutes(auth: AuthApplication, products: ProductService): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/products" && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      json(response, 201, await products.create(identity, validateProductCreate(await readJson(request))));
      return true;
    }
    if (url.pathname === "/products" && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      json(response, 200, await products.list(identity, validateProductList(url)));
      return true;
    }
    const match = url.pathname.match(/^\/products\/([^/]+)$/);
    if (!match) return false;
    const id = requireUuid(match[1]);
    const identity = await auth.authenticate(bearerToken(request));
    if (request.method === "GET") {
      json(response, 200, await products.get(identity, id));
      return true;
    }
    if (request.method === "PATCH") {
      json(response, 200, await products.update(identity, id, validateProductPatch(await readJson(request))));
      return true;
    }
    if (request.method === "DELETE") {
      await products.deactivate(identity, id);
      noContent(response);
      return true;
    }
    return false;
  };
}
