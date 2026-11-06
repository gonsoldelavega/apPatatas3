import type { AuthApplication } from "../auth/service.js";
import { HttpError } from "../http/errors.js";
import { bearerToken, readJson } from "../http/request.js";
import { json } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { TaxService, type TaxProfile } from "./service.js";

const integerIn = (value: string | null, minimum: number, maximum: number): number => {
  const parsed = Number(value);
  if (value === null || !Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpError("invalid_request", 400);
  }
  return parsed;
};

const decimal = (value: unknown, fallback: string, minimum: number, maximum: number): string => {
  const text = value === undefined || value === null || value === "" ? fallback : String(value).replace(",", ".");
  const parsed = Number(text);
  if (!/^-?\d+(\.\d{1,4})?$/.test(text) || !Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpError("invalid_request", 400);
  }
  return text;
};

const isoDateOrNull = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T[\d:.+Z-]+)?$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError("invalid_request", 400);
  }
  return value;
};

const settlementStatuses = new Set(["estimated", "filed", "not_applicable"]);

/** Gestoría / previsión fiscal. Datos fiscales: solo el usuario maestro (rol owner). */
export function createTaxRoutes(auth: AuthApplication, tax: TaxService): RouteHandler {
  return async ({ request, response, url }) => {
    if (!url.pathname.startsWith("/tax/")) return false;
    const id = await auth.authenticate(bearerToken(request));
    if (id.role !== "owner") throw new HttpError("forbidden", 403);

    if (url.pathname === "/tax/profile" && request.method === "GET") {
      json(response, 200, await tax.profile(id));
      return true;
    }
    if (url.pathname === "/tax/profile" && request.method === "PUT") {
      const body = await readJson(request);
      const profile: TaxProfile = {
        incomeTaxRegime:
          body.incomeTaxRegime === "objective" || body.incomeTaxRegime === "not_applicable"
            ? body.incomeTaxRegime
            : "direct",
        irpfRate: decimal(body.irpfRate, "20", 0, 100),
        annualMinoration: decimal(body.annualMinoration, "0", 0, 1_000_000_000),
      };
      json(response, 200, await tax.saveProfile(id, profile));
      return true;
    }
    if (url.pathname === "/tax/forecast" && request.method === "GET") {
      json(
        response,
        200,
        await tax.forecast(
          id,
          integerIn(url.searchParams.get("year"), 2000, 2200),
          integerIn(url.searchParams.get("quarter"), 1, 4),
        ),
      );
      return true;
    }
    if (url.pathname === "/tax/settlements" && request.method === "GET") {
      json(response, 200, await tax.settlements(id));
      return true;
    }
    if (url.pathname === "/tax/settlements" && request.method === "POST") {
      const body = await readJson(request);
      const status = typeof body.status === "string" ? body.status : "estimated";
      if (!settlementStatuses.has(status)) throw new HttpError("invalid_request", 400);
      const notes = body.notes === undefined || body.notes === null ? null : String(body.notes);
      if (notes !== null && notes.length > 2000) throw new HttpError("invalid_request", 400);
      json(
        response,
        201,
        await tax.saveSettlement(id, {
          taxModel: body.taxModel === "130" ? "130" : "303",
          year: integerIn(String(body.year), 2000, 2200),
          quarter: integerIn(String(body.quarter), 1, 4),
          estimatedAmount: decimal(body.estimatedAmount, "0", -1_000_000_000, 1_000_000_000),
          filedAmount:
            body.filedAmount === undefined || body.filedAmount === null
              ? null
              : decimal(body.filedAmount, "0", -1_000_000_000, 1_000_000_000),
          filedAt: isoDateOrNull(body.filedAt),
          status,
          notes,
        }),
      );
      return true;
    }
    return false;
  };
}
