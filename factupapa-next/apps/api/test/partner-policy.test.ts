import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampFrom,
  evaluatePartnerRequest,
  isIsoDate,
  visibleMonths,
  type PartnerDecision,
} from "../src/authz/partner-policy.js";

const context = { historyFrom: "2026-11-01", today: "2026-11-20" };
const id = "3f2b8c1e-5d4a-4b7e-9c11-0a1b2c3d4e5f";
const evaluate = (method: string, path: string, query = ""): PartnerDecision =>
  evaluatePartnerRequest(method, path, new URLSearchParams(query), context);

test("el socio puede usar lo necesario para el día a día", () => {
  const allowed: Array<[string, string]> = [
    ["GET", "/me"],
    ["GET", "/team/welcome"],
    ["GET", "/stock/potato"],
    ["POST", `/notes/${id}/attachments`],
    ["GET", `/notes/${id}/attachments/${id}`],
    ["DELETE", `/notes/${id}/attachments/${id}`],
    ["GET", "/orders/delivery-day"],
    ["GET", `/contacts/${id}/people`],
    ["POST", `/contacts/${id}/people`],
    ["PATCH", `/contacts/${id}/people/${id}`],
    ["DELETE", `/contacts/${id}/people/${id}`],
    ["POST", "/stock/potato/level"],
    ["POST", "/stock/potato/fridge"],
    ["GET", "/finance/summary"],
    ["GET", "/finance/monthly"],
    ["GET", "/invoices"],
    ["GET", "/invoices/number-preview"],
    ["GET", `/invoices/${id}`],
    ["GET", `/invoices/${id}/pdf`],
    ["POST", "/invoices"],
    ["POST", `/invoices/${id}/lines`],
    ["PATCH", `/invoices/${id}/lines/${id}`],
    ["DELETE", `/invoices/${id}/lines/${id}`],
    ["PATCH", `/invoices/${id}`],
    ["POST", `/invoices/${id}/issue`],
    ["POST", "/invoices/from-delivery-notes"],
    ["GET", "/delivery-notes"],
    ["GET", `/delivery-notes/${id}`],
    ["GET", `/delivery-notes/${id}/pdf`],
    ["POST", "/delivery-notes"],
    ["PATCH", `/delivery-notes/${id}`],
    ["POST", `/delivery-notes/${id}/issue`],
    ["POST", `/delivery-notes/${id}/lines`],
    ["GET", "/contacts"],
    ["GET", `/contacts/${id}`],
    ["GET", `/contacts/${id}/products`],
    ["GET", "/products"],
    ["POST", "/contacts"],
    ["POST", "/products"],
    ["GET", `/products/${id}`],
    ["GET", "/sales-preferences"],
    // espacio compartido
    ["GET", "/notes"],
    ["POST", "/notes"],
    ["PATCH", `/notes/${id}`],
    ["DELETE", `/notes/${id}`],
    ["GET", "/tasks"],
    ["POST", "/tasks"],
    ["PATCH", `/tasks/${id}`],
    ["POST", `/tasks/${id}/done`],
    ["POST", `/tasks/${id}/reopen`],
    ["GET", "/orders"],
    ["POST", "/orders"],
    ["GET", `/orders/${id}`],
    ["PATCH", `/orders/${id}`],
    ["POST", `/orders/${id}/cancel`],
    ["POST", `/orders/${id}/lines`],
    ["DELETE", `/orders/${id}/lines/${id}`],
    ["POST", `/orders/${id}/lines/${id}/progress`],
    ["GET", "/ledger/summary"],
    ["GET", "/ledger/entries"],
    ["GET", "/ledger/settings"],
    ["POST", "/ledger/entries"],
    ["POST", "/ledger/settle"],
    ["PATCH", `/ledger/entries/${id}`],
    ["DELETE", `/ledger/entries/${id}`],
  ];
  for (const [method, path] of allowed) {
    assert.equal(evaluate(method, path).allowed, true, `${method} ${path}`);
  }
});

test("el espacio compartido no abre nada más de la cuenta ni los nombres de los núcleos", () => {
  const denied: Array<[string, string]> = [
    ["PUT", "/ledger/settings"],
    ["DELETE", "/ledger/summary"],
    ["PUT", "/notes"],
    ["DELETE", "/orders"],
    ["GET", `/ledger/entries/${id}/extra`],
    ["POST", `/orders/${id}/lines/no-uuid/progress`],
  ];
  for (const [method, path] of denied) {
    assert.equal(evaluate(method, path).allowed, false, `${method} ${path}`);
  }
});

test("el socio NO puede tocar precios, clientes, proveedores, compras, gastos ni ajustes", () => {
  const denied: Array<[string, string]> = [
    ["PATCH", `/contacts/${id}`],
    ["DELETE", `/contacts/${id}`],
    ["GET", `/contacts/${id}/account`],
    ["PUT", `/contacts/${id}/products/${id}/price`],
    ["DELETE", `/contacts/${id}/products/${id}/price`],
    ["PATCH", `/products/${id}`],
    ["DELETE", `/products/${id}`],
    ["PATCH", "/sales-preferences"],
    ["POST", "/sales-preferences/activate-numbering"],
    ["GET", "/purchases"],
    ["POST", "/purchases"],
    ["GET", "/purchases/export"],
    ["POST", "/purchases/registry-sync"],
    ["GET", "/purchase-documents"],
    ["GET", "/recurring-expenses"],
    ["POST", "/recurring-expenses"],
    ["GET", "/stock"],
    ["POST", "/stock/adjustments"],
    ["GET", "/production-runs"],
    ["GET", "/imports"],
    ["POST", "/imports/validate"],
    ["GET", "/import-mappings"],
    ["GET", "/integrations/gmail"],
    ["POST", "/integrations/gmail/connect"],
    ["POST", `/invoices/${id}/send-gmail`],
    ["POST", "/integrations/google/export/purchases/backfill"],
    ["GET", "/team/members"],
    ["POST", "/team/members"],
    ["DELETE", `/team/members/${id}`],
    ["GET", "/tax/forecast"],
    ["GET", "/gestoria"],
  ];
  for (const [method, path] of denied) {
    assert.deepEqual(evaluate(method, path), { allowed: false, code: "forbidden" }, `${method} ${path}`);
  }
});

test("el socio NO puede anular, borrar ni cobrar documentos", () => {
  const denied: Array<[string, string]> = [
    ["POST", `/invoices/${id}/cancel`],
    ["POST", `/invoices/${id}/payments`],
    ["DELETE", `/payments/${id}`],
    ["POST", `/delivery-notes/${id}/cancel`],
    ["DELETE", `/delivery-notes/${id}`],
    ["POST", "/delivery-notes/from-last"],
    ["DELETE", `/invoices/${id}`],
  ];
  for (const [method, path] of denied) {
    assert.equal(evaluate(method, path).allowed, false, `${method} ${path}`);
  }
});

test("lo que no está en la lista se deniega (fail-closed), también rutas futuras", () => {
  assert.equal(evaluate("GET", "/ruta-nueva-que-nadie-ha-revisado").allowed, false);
  assert.equal(evaluate("GET", "/invoices/no-es-uuid").allowed, false);
  assert.equal(evaluate("GET", `/invoices/${id}/../purchases`).allowed, false);
  assert.equal(evaluate("OPTIONS", "/invoices").allowed, false);
});

test("las listas se recortan al periodo visible, también con fechas trampa", () => {
  const cases: Array<[string, string]> = [
    ["", "2026-11-01"],
    ["from=2026-10-01", "2026-11-01"],
    ["from=2026-10-31", "2026-11-01"],
    ["from=2025-01-01", "2026-11-01"],
    ["from=2026-9-1", "2026-11-01"], // formato no válido que como texto parecería "posterior"
    ["from=2026-09-01T00:00:00Z", "2026-11-01"],
    ["from=2026-13-45", "2026-11-01"],
    ["from=abc", "2026-11-01"],
    ["from=", "2026-11-01"],
    ["from=2026-11-05", "2026-11-05"],
    ["from=2027-01-01", "2027-01-01"],
  ];
  for (const [query, expected] of cases) {
    for (const path of ["/invoices", "/delivery-notes", "/finance/summary"]) {
      const decision = evaluate("GET", path, query);
      assert.equal(decision.allowed, true);
      assert.equal(decision.allowed && decision.query?.from, expected, `${path}?${query}`);
    }
  }
});

test("un resumen que acaba antes del corte se deniega", () => {
  const decision = evaluate("GET", "/finance/summary", "from=2026-10-01&to=2026-10-31");
  assert.equal(decision.allowed && decision.periodDenied, true);
  const ok = evaluate("GET", "/finance/summary", "from=2026-11-01&to=2026-11-30");
  assert.equal(ok.allowed && ok.periodDenied, false);
});

test("la gráfica mensual solo muestra meses desde el corte", () => {
  assert.equal(visibleMonths("2026-11-01", "2026-11-20"), 1);
  assert.equal(visibleMonths("2026-11-01", "2027-01-05"), 3);
  const decision = evaluate("GET", "/finance/monthly", "months=24");
  assert.equal(decision.allowed && decision.query?.months, "1");
  const defaults = evaluate("GET", "/finance/monthly");
  assert.equal(defaults.allowed && defaults.query?.months, "1");
});

test("las ediciones y la creación piden comprobación de documento o de cuerpo", () => {
  const edit = evaluate("PATCH", `/invoices/${id}`);
  assert.deepEqual(edit.allowed && edit.document, { kind: "invoice", id, mode: "edit" });
  const read = evaluate("GET", `/delivery-notes/${id}/pdf`);
  assert.deepEqual(read.allowed && read.document, { kind: "delivery_note", id, mode: "read" });
  const create = evaluate("POST", "/invoices");
  assert.equal(create.allowed && create.body, "invoice_create");
  const fromNotes = evaluate("POST", "/invoices/from-delivery-notes");
  assert.equal(fromNotes.allowed && fromNotes.body, "invoice_from_delivery_notes");
});

test("utilidades de fecha", () => {
  assert.equal(isIsoDate("2026-11-01"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-9-1"), false);
  assert.equal(clampFrom(null, "2026-11-01"), "2026-11-01");
});
