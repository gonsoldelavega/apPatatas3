import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../src/http/errors.js";
import { parseImport } from "../src/imports/parser.js";
import { normalizeRows, safePreview, validateImportRequest } from "../src/imports/validation.js";

const limits = { maximumBytes: 512, maximumRows: 2, previewRows: 1 };

test("CSV UTF-8 se parsea y detecta duplicados internos normalizados", () => {
  const parsed = parseImport({
    entityType: "contacts", sourceFormat: "csv",
    content: "type,legal_name,tax_id,email\ncustomer,Cliente Uno,test-001,UNO@EXAMPLE.TEST\ncustomer,Cliente Dos,TEST-001,dos@example.test\n",
  }, limits);
  const rows = normalizeRows("contacts", "csv", parsed.rows);
  assert.equal(rows[0]?.classification, "new");
  assert.equal(rows[0]?.normalizedData.taxId, "TEST-001");
  assert.equal(rows[0]?.normalizedData.email, "uno@example.test");
  assert.equal(rows[1]?.classification, "duplicate");
  assert.deepEqual(rows[1]?.errors, ["duplicate_in_file"]);
});

test("JSON estructurado conserva decimales como strings y rechaza float binario", () => {
  const valid = parseImport({
    entityType: "products", sourceFormat: "json",
    content: JSON.stringify([{ name: "Producto", sku: "SKU-1", unit: "kg", salePrice: "12.3456", taxRate: "4" }]),
  }, limits);
  assert.equal(normalizeRows("products", "json", valid.rows)[0]?.normalizedData.salePrice, "12.3456");
  const invalid = parseImport({
    entityType: "products", sourceFormat: "json",
    content: JSON.stringify([{ name: "Producto", unit: "kg", salePrice: 12.34, taxRate: "4" }]),
  }, limits);
  assert.equal(normalizeRows("products", "json", invalid.rows)[0]?.classification, "error");
});

test("rechaza cabeceras desconocidas e inyección de company_id", () => {
  const unknown = parseImport({
    entityType: "contacts", sourceFormat: "csv", content: "type,legal_name,unknown\ncustomer,Cliente,x\n",
  }, limits);
  assert.throws(() => normalizeRows("contacts", "csv", unknown.rows), HttpError);
  assert.throws(() => validateImportRequest({
    entityType: "products", sourceFormat: "json", content: "[]", companyId: crypto.randomUUID(),
  }), HttpError);
  const injected = parseImport({
    entityType: "products", sourceFormat: "json",
    content: JSON.stringify([{ name: "X", unit: "unit", salePrice: "1", taxRate: "21", company_id: crypto.randomUUID() }]),
  }, limits);
  assert.throws(() => normalizeRows("products", "json", injected.rows), HttpError);
});

test("rechaza UTF-8 inválido, binarios, tamaño y número de filas excesivos", () => {
  const invalidUtf8 = Buffer.from([0xc3, 0x28]).toString("base64");
  assert.throws(() => parseImport({ entityType: "contacts", sourceFormat: "csv", contentBase64: invalidUtf8 }, limits), HttpError);
  assert.throws(() => parseImport({ entityType: "contacts", sourceFormat: "csv", contentBase64: Buffer.from("a\0b").toString("base64") }, limits), HttpError);
  assert.throws(() => parseImport({ entityType: "contacts", sourceFormat: "csv", content: "x".repeat(513) }, limits), (error) => error instanceof HttpError && error.status === 413);
  assert.throws(() => parseImport({ entityType: "contacts", sourceFormat: "json", content: JSON.stringify([{},{},{}]) }, limits), (error) => error instanceof HttpError && error.status === 413);
});

test("la previsualización neutraliza fórmulas sin alterar el dato normalizado", () => {
  const value = { legalName: "=CMD()", nested: ["+SUM(1,1)"] };
  assert.deepEqual(safePreview(value), { legalName: "'=CMD()", nested: ["'+SUM(1,1)"] });
  assert.equal(value.legalName, "=CMD()");
});
