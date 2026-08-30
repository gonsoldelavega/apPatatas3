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

test("extrae el formato real de Gayca con fecha textual y total entregado", () => {
  const text = `GONZALEZ CABRERA, IRENE\nNumero:\n21 agosto 2026\nFRUTAS Y PATATAS GAYCA, S.A.\nN.I.F.: A04037677\nFACTURA\n45313973V 006/0002.060\n33/008/329 008 PATATAS AGRIA 120,00 0,55 66,00\nBase Imponible % I.V.A. Cuota IVA\n66,00 2,64 4\nTOTAL\nEntregado: 68,64`;
  const fields = extractPurchaseFields(text, "FV006-000002060-21082026.pdf");
  const result = classifyLocalFiscalDocument(text, fields, own);
  assert.equal(fields.supplierInvoiceNumber, "006/0002.060");
  assert.equal(fields.issueDate, "2026-08-21");
  assert.equal(fields.subtotal, "66.00");
  assert.equal(fields.taxTotal, "2.64");
  assert.equal(fields.total, "68.64");
  assert.equal(fields.lines?.length, 1);
  assert.equal(result.documentType, "supplier_invoice");
  assert.equal(result.purchaseEligible, true);
});
