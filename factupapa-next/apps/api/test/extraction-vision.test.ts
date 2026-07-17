import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPurchaseFieldsWithVision,
  isValidSpanishTaxId,
  normalizeVisionFields,
  stripOwnTaxId,
  type VisionClient,
} from "../src/finance/extraction-vision.js";

const OWN_TAX_IDS = ["45313973V"];

const gaycaResponse = {
  supplierInvoiceNumber: "FVO06-00001684",
  issueDate: "2026-07-16",
  dueDate: null,
  subtotal: "126,00",
  taxTotal: "5,04",
  total: "131,04",
  supplierTaxId: "A04037677",
  supplierName: "FRUTAS Y PATATAS GAYCA, S.A.",
  concept: "PATATA LAVADA",
  lines: [
    {
      description: "PATATA LAVADA",
      quantity: "210",
      unit: "kg",
      unitCost: "0,61",
      discount: "2,10",
      lineTotal: "126,00",
      taxRate: "4",
    },
  ],
  fieldConfidence: {
    supplierInvoiceNumber: "high",
    issueDate: "high",
    subtotal: "high",
    taxTotal: "high",
    total: "high",
    supplierTaxId: "high",
    supplierName: "high",
    lines: "medium",
  },
};

function fakeClient(payload: unknown, failures = 0): VisionClient & { calls: number } {
  const state = {
    calls: 0,
    messages: {
      async create() {
        state.calls += 1;
        if (state.calls <= failures) throw new Error("api_down");
        return {
          content: [
            { type: "text", text: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`` },
          ],
          stop_reason: "end_turn",
        };
      },
    },
  };
  return state;
}

test("extrae la factura GAYCA con visión: campos normalizados y línea con descuento", async () => {
  const result = await extractPurchaseFieldsWithVision(
    { kind: "text", text: "FACTURA GAYCA ..." },
    { apiKey: "test", ownTaxIds: OWN_TAX_IDS, client: fakeClient(gaycaResponse) },
  );
  assert.equal(result.supplierInvoiceNumber, "FV006-00001684");
  assert.equal(result.issueDate, "2026-07-16");
  assert.equal(result.subtotal, "126.00");
  assert.equal(result.taxTotal, "5.04");
  assert.equal(result.total, "131.04");
  assert.equal(result.supplierName, "FRUTAS Y PATATAS GAYCA, S.A.");
  assert.equal(result.supplierTaxId, "A04037677");
  assert.notEqual(result.supplierTaxId, "45313973V");
  assert.deepEqual(result.lines, [
    {
      description: "PATATA LAVADA",
      quantity: "210",
      unit: "kg",
      unitCost: "0.61",
      taxRate: "4",
      discount: "2.10",
      lineTotal: "126.00",
    },
  ]);
  assert.equal(result.purchasedQuantityKg, "210");
  assert.equal(result.purchasedSacks, 14);
  assert.ok(!result.warnings?.includes("totals_mismatch"));
  assert.ok(!result.warnings?.includes("line_amount_mismatch"));
  assert.equal(result.fieldConfidence?.total, "high");
});

test("reintenta una vez si la API falla y luego devuelve el resultado", async () => {
  const client = fakeClient(gaycaResponse, 1);
  const result = await extractPurchaseFieldsWithVision(
    { kind: "text", text: "FACTURA" },
    { apiKey: "test", ownTaxIds: OWN_TAX_IDS, client },
  );
  assert.equal(client.calls, 2);
  assert.equal(result.supplierInvoiceNumber, "FV006-00001684");
});

test("propaga el error tras agotar el reintento único", async () => {
  const client = fakeClient(gaycaResponse, 2);
  await assert.rejects(
    extractPurchaseFieldsWithVision(
      { kind: "text", text: "FACTURA" },
      { apiKey: "test", ownTaxIds: OWN_TAX_IDS, client },
    ),
    /api_down/,
  );
  assert.equal(client.calls, 2);
});

test("nunca acepta el NIF del propio cliente como proveedor", () => {
  const result = normalizeVisionFields(
    { ...gaycaResponse, supplierTaxId: "45313973V" },
    OWN_TAX_IDS,
  );
  assert.equal(result.supplierTaxId, undefined);
  assert.ok(result.warnings?.includes("supplier_tax_id_own"));
  assert.ok(result.warnings?.includes("supplier_tax_id_missing"));
});

test("marca totals_mismatch cuando base + IVA no cuadra con el total", () => {
  const result = normalizeVisionFields(
    { ...gaycaResponse, total: "140,00" },
    OWN_TAX_IDS,
  );
  assert.ok(result.warnings?.includes("totals_mismatch"));
});

test("marca line_amount_mismatch cuando cantidad × precio − descuento no cuadra", () => {
  const result = normalizeVisionFields(
    {
      ...gaycaResponse,
      lines: [{ ...gaycaResponse.lines[0], lineTotal: "999,00" }],
    },
    OWN_TAX_IDS,
  );
  assert.ok(result.warnings?.includes("line_amount_mismatch"));
  assert.equal(result.fieldConfidence?.lines, "low");
  assert.equal(result.lines?.length, 1);
});

test("baja la confianza cuando el NIF no pasa la letra de control", () => {
  const result = normalizeVisionFields(
    { ...gaycaResponse, supplierTaxId: "A04037678" },
    OWN_TAX_IDS,
  );
  assert.equal(result.supplierTaxId, "A04037678");
  assert.equal(result.fieldConfidence?.supplierTaxId, "low");
});

test("descarta fechas y números inválidos sin romper", () => {
  const result = normalizeVisionFields(
    {
      issueDate: "16/07/2026",
      total: "no-lo-se",
      subtotal: 126,
      supplierTaxId: null,
    },
    OWN_TAX_IDS,
  );
  assert.equal(result.issueDate, undefined);
  assert.equal(result.total, undefined);
  assert.equal(result.subtotal, "126");
  assert.ok(result.warnings?.includes("total_missing"));
  assert.ok(result.warnings?.includes("issue_date_missing"));
  assert.ok(result.warnings?.includes("supplier_tax_id_missing"));
});

test("valida NIF, NIE y CIF españoles con letra de control", () => {
  for (const valid of ["45313973V", "A04037677", "B04854154", "B42743211", "X1234567L"])
    assert.ok(isValidSpanishTaxId(valid), valid);
  for (const invalid of ["45313973A", "A04037678", "B0485415", "12345", ""])
    assert.ok(!isValidSpanishTaxId(invalid), invalid);
});

test("stripOwnTaxId respeta los NIF de proveedores legítimos", () => {
  const fields = { supplierTaxId: "A04037677", warnings: [] };
  assert.deepEqual(stripOwnTaxId(fields, OWN_TAX_IDS), fields);
});
