import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson } from "../http/request.js";
import { json } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { TaxService, type TaxProfile } from "./service.js";
const year = (v: string|null) => { const n=Number(v); if (!Number.isInteger(n)||n<2000||n>2200) throw new Error("invalid tax year"); return n; };
const quarter = (v: string|null) => { const n=Number(v); if (!Number.isInteger(n)||n<1||n>4) throw new Error("invalid tax quarter"); return n; };
export function createTaxRoutes(auth: AuthApplication, tax: TaxService): RouteHandler { return async ({request,response,url}) => {
  const id = await auth.authenticate(bearerToken(request));
  if (url.pathname === "/tax/profile" && request.method === "GET") { json(response,200,await tax.profile(id)); return true; }
  if (url.pathname === "/tax/profile" && request.method === "PUT") { const body=await readJson(request); const profile: TaxProfile={ incomeTaxRegime: body.incomeTaxRegime === "objective" || body.incomeTaxRegime === "not_applicable" ? body.incomeTaxRegime : "direct", irpfRate: String(body.irpfRate ?? "20"), annualMinoration: String(body.annualMinoration ?? "0") }; json(response,200,await tax.saveProfile(id,profile)); return true; }
  if (url.pathname === "/tax/forecast" && request.method === "GET") { json(response,200,await tax.forecast(id,year(url.searchParams.get("year")),quarter(url.searchParams.get("quarter")))); return true; }
  if (url.pathname === "/tax/settlements" && request.method === "GET") { json(response,200,await tax.settlements(id)); return true; }
  if (url.pathname === "/tax/settlements" && request.method === "POST") { const body=await readJson(request); json(response,201,await tax.saveSettlement(id,{taxModel:body.taxModel === "130" ? "130" : "303",year:Number(body.year),quarter:Number(body.quarter),estimatedAmount:String(body.estimatedAmount ?? "0"),filedAmount:body.filedAmount == null ? null : String(body.filedAmount),filedAt:body.filedAt == null ? null : String(body.filedAt),status:typeof body.status === "string" ? body.status : "estimated",notes:body.notes == null ? null : String(body.notes)})); return true; }
  return false;
}; }
