import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson } from "../http/request.js";
import { json } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { HttpError } from "../http/errors.js";
import { SalesPreferencesService, type SalesPreferences } from "./service.js";

function validate(value: Record<string, unknown>): SalesPreferences {
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "invoicePrefix",
          "invoiceStartNumber",
          "defaultTaxRate",
          "primarySalesFlow",
          "numberingMode",
          "numberingActivatedAt",
        ].includes(key),
    )
  )
    throw new HttpError("invalid_request", 400);
  const prefix =
    typeof value.invoicePrefix === "string"
      ? value.invoicePrefix.trim().toUpperCase()
      : "";
  const start = Number(value.invoiceStartNumber);
  const rate =
    typeof value.defaultTaxRate === "string"
      ? value.defaultTaxRate.replace(",", ".")
      : "";
  const flow = value.primarySalesFlow;
  if (
    !/^[A-Z0-9_-]{1,12}$/u.test(prefix) ||
    !Number.isInteger(start) ||
    start < 1 ||
    start > 999_999_999 ||
    !/^\d{1,3}(?:\.\d{1,3})?$/u.test(rate) ||
    Number(rate) > 100 ||
    !["adaptive", "invoices", "delivery_notes"].includes(String(flow))
  )
    throw new HttpError("invalid_request", 400);
  return {
    invoicePrefix: prefix,
    invoiceStartNumber: start,
    defaultTaxRate: rate,
    primarySalesFlow: flow as SalesPreferences["primarySalesFlow"],
    numberingMode: "test",
    numberingActivatedAt: null,
  };
}

export function createSalesPreferencesRoutes(
  auth: AuthApplication,
  service: SalesPreferencesService,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (
      url.pathname === "/sales-preferences/activate-numbering" &&
      request.method === "POST"
    ) {
      const identity = await auth.authenticate(bearerToken(request));
      const body = await readJson(request),
        prefix =
          typeof body.prefix === "string"
            ? body.prefix.trim().toUpperCase()
            : "",
        nextNumber = Number(body.nextNumber),
        year = Number(body.year);
      if (
        body.confirmation !== "ACTIVAR NUMERACION REAL" ||
        !/^[A-Z0-9_-]{1,12}$/.test(prefix) ||
        !Number.isInteger(nextNumber) ||
        nextNumber < 1 ||
        nextNumber > 999999999 ||
        !Number.isInteger(year) ||
        year < 2020 ||
        year > 2100
      )
        throw new HttpError("invalid_request", 400);
      json(
        response,
        200,
        await service.activateNumbering(identity, { prefix, nextNumber, year }),
      );
      return true;
    }
    if (url.pathname !== "/sales-preferences") return false;
    const identity = await auth.authenticate(bearerToken(request));
    if (request.method === "GET") {
      json(response, 200, await service.get(identity));
      return true;
    }
    if (request.method === "PATCH") {
      json(
        response,
        200,
        await service.update(identity, validate(await readJson(request))),
      );
      return true;
    }
    return false;
  };
}
