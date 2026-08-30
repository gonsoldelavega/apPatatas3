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

test("extrae una factura de servicios con CIF del emisor y una línea única", () => {
  const text = `6483 GONZALEZ CABRERA IRENE\nCONCEPTO CÓDIGO UNID. % RET. % IVA IMPORTE\nASESORIA AUTONOMOS ONLINE SLU\nB55764229 C.I.F.\nNº DE FACTURA FECHA\n11719 / 26 28/08/2026\nGestión fiscal y contable del empresario individual 1,00 2 24,00 24,00 21,00\nTotal A Pagar 29,04`;
  const fields = extractPurchaseFields(text, "Facturas.pdf");
  const result = classifyLocalFiscalDocument(text, fields, own);
  assert.equal(fields.supplierName, "ASESORIA AUTONOMOS ONLINE SLU");
  assert.equal(fields.supplierTaxId, "B55764229");
  assert.equal(fields.supplierInvoiceNumber, "11719/26");
  assert.equal(fields.issueDate, "2026-08-28");
  assert.equal(fields.total, "29.04");
  assert.equal(fields.lines?.length, 1);
  assert.equal(result.documentType, "supplier_invoice");
  assert.equal(result.purchaseEligible, true);
});

test("reconoce facturas profesionales con resumen fiscal aunque no tengan tabla de líneas", () => {
  const solred = `Solred S.A. C.I.F. A 79707345\nNIF ES45313973V\nNúm. Factura BBV260354046\nLugar y Fecha MADRID - 31/07/2026\nTotal Factura en Euros 125,78 26,41 152,19`;
  const hetzner = `Hetzner Online GmbH\nVAT Reg. No.: DE812871812\nInvoice no.: 082001060516\nInvoice date: 03/08/2026\nTotal (excl. VAT) € 8.98 Tax Total € 1.88\nTotal € 8.98 € 1.88 € 10.86`;
  const solredResult = classifyLocalFiscalDocument(solred, extractPurchaseFields(solred, "9737047_213544885903_ES.pdf"), own);
  const hetznerResult = classifyLocalFiscalDocument(hetzner, extractPurchaseFields(hetzner, "Hetzner_2026-08-03_082001060516.pdf"), own);
  assert.equal(solredResult.documentType, "supplier_invoice");
  assert.equal(solredResult.supplierInvoiceNumber, "BBV260354046");
  assert.equal(solredResult.recipientTaxId, "45313973V");
  assert.equal(solredResult.purchaseEligible, true);
  assert.equal(hetznerResult.documentType, "supplier_invoice");
  assert.equal(hetznerResult.supplierTaxId, "DE812871812");
  assert.equal(hetznerResult.purchaseEligible, true);
});
