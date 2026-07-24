import type { AuthApplication } from "../auth/service.js";
import { decimalString, optionalText, assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { AccountsService, type PaymentInput } from "./service.js";

function payment(body: Record<string, unknown>): PaymentInput {
  assertAllowedKeys(body,["amount","paidAt","method","reference","notes"]);
  const paidAt = typeof body.paidAt === "string" && !Number.isNaN(Date.parse(body.paidAt))
    ? new Date(body.paidAt).toISOString() : null;
  if (!paidAt) throw new HttpError("invalid_request",400);
  const amount=decimalString(body.amount,12,2);
  if(Number(amount)<=0) throw new HttpError("invalid_request",400);
  return {
    amount,
    paidAt,
    method: optionalText(body.method,50) ?? null,
    reference: optionalText(body.reference,200) ?? null,
    notes: optionalText(body.notes,1000) ?? null,
  };
}

export function createAccountsRoutes(auth: AuthApplication, service: AccountsService): RouteHandler {
  return async ({request,response,url}) => {
    const customer = url.pathname.match(/^\/contacts\/([^/]+)\/account$/);
    if (customer && request.method==="GET") {
      const i=await auth.authenticate(bearerToken(request));
      json(response,200,await service.customerAccount(i,requireUuid(customer[1])));
      return true;
    }
    const invoice = url.pathname.match(/^\/invoices\/([^/]+)\/payments$/);
    if (invoice) {
      const i=await auth.authenticate(bearerToken(request)), id=requireUuid(invoice[1]);
      if(request.method==="GET") json(response,200,await service.invoicePayments(i,id));
      else if(request.method==="POST") json(response,201,await service.addInvoicePayment(i,id,payment(await readJson(request))));
      else return false;
      return true;
    }
    const purchase = url.pathname.match(/^\/purchases\/([^/]+)\/payments$/);
    if (purchase) {
      const i=await auth.authenticate(bearerToken(request)), id=requireUuid(purchase[1]);
      if(request.method==="GET") json(response,200,await service.purchasePayments(i,id));
      else if(request.method==="POST") json(response,201,await service.addPurchasePayment(i,id,payment(await readJson(request))));
      else return false;
      return true;
    }
    const remove=url.pathname.match(/^\/payments\/([^/]+)$/);
    if(remove && request.method==="DELETE"){
      const i=await auth.authenticate(bearerToken(request));
      await service.delete(i,requireUuid(remove[1])); noContent(response); return true;
    }
    return false;
  };
}
