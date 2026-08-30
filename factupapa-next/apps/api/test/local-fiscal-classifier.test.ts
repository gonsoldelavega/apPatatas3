import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocalFiscalDocument, extractPurchaseFields } from "../src/finance/extraction.js";

const own = ["45313973V"];
const gayca = `FACTURA\nFRUTAS Y PATATAS GAYCA, S.A.\nCIF A04037677\nCliente: GONZALEZ CABRERA, IRENE NIF 45313973V\nNúmero factura: 006/0002.060\nFecha de emisión: 21/08/2026\nPATATAS AGRIA 120 kg 0,55 66,00 €\nBase imponible 66,00 4% 2,64 68,64\nTotal factura 68,64`;

test("clasifica Gayca como factura recibida aunque el NIF propio aparezca primero", () => {
  const result = classifyLocalFiscalDocument(gayca, extractPurchaseFields(gayca), own);
  assert.equal(result.documentType, "supplier_invoice");
  assert.equal(result.issuerTaxId, "A04037677");
  assert.equal(result.recipientTaxId, "45313973V");
  assert.equal(result.supplierTaxId, "A04037677");
  assert.equal(result.purchaseEligible, true);
});

test("bloquea documentos bancarios, abonos y desconocidos", () => {
  assert.equal(classifyLocalFiscalDocument("BBVA Informe autoservicios transferencia", {}, own).purchaseEligible, false);
  assert.equal(classifyLocalFiscalDocument("Abono factura rectificativa proveedor", {}, own).documentType, "supplier_credit_note");
  assert.equal(classifyLocalFiscalDocument("Documento personal sin datos fiscales", {}, own).documentType, "unknown");
});
