import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { PricingService } from "./service.js";
import { validateEffectiveProducts, validatePrice } from "./validation.js";

export function createPricingRoutes(auth: AuthApplication, pricing: PricingService): RouteHandler {
  return async ({ request, response, url }) => {
    const priceMatch = url.pathname.match(/^\/contacts\/([^/]+)\/products\/([^/]+)\/price$/);
    if (priceMatch) {
      const contactId = requireUuid(priceMatch[1]);
      const productId = requireUuid(priceMatch[2]);
      const identity = await auth.authenticate(bearerToken(request));
      if (request.method === "PUT") {
        json(response, 200, await pricing.upsert(identity, contactId, productId, validatePrice(await readJson(request))));
        return true;
      }
      if (request.method === "DELETE") {
        await pricing.deactivate(identity, contactId, productId);
        noContent(response);
        return true;
      }
      return false;
    }
    const listMatch = url.pathname.match(/^\/contacts\/([^/]+)\/products$/);
    if (listMatch && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      json(response, 200, await pricing.listEffective(identity, requireUuid(listMatch[1]), validateEffectiveProducts(url)));
      return true;
    }
    return false;
  };
}
