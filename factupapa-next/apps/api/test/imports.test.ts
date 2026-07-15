import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../src/http/errors.js";
import { parseImport } from "../src/imports/parser.js";
import {
  normalizeRows,
  safePreview,
  validateImportRequest,
} from "../src/imports/validation.js";
import { applyMapping, detectColumns, normalizeMapping } from "../src/imports/mapping.js";

const limits = { maximumBytes: 512, maximumRows: 2, previewRows: 1 };

test("CSV UTF-8 se parsea y detecta duplicados internos normalizados", () => {
  const parsed = parseImport(
    {
      entityType: "contacts",
      sourceFormat: "csv",
      content:
        "type,legal_name,tax_id,email\ncustomer,Cliente Uno,test-001,UNO@EXAMPLE.TEST\ncustomer,Cliente Dos,TEST-001,dos@example.test\n",
    },
    limits,
  );
  const rows = normalizeRows("contacts", "csv", parsed.rows);
  assert.equal(rows[0]?.classification, "new");
  assert.equal(rows[0]?.normalizedData.taxId, "TEST-001");
  assert.equal(rows[0]?.normalizedData.email, "uno@example.test");
  assert.equal(rows[1]?.classification, "duplicate");
  assert.deepEqual(rows[1]?.errors, ["duplicate_in_file"]);
});

test("JSON estructurado conserva decimales como strings y rechaza float binario", () => {
  const valid = parseImport(
    {
      entityType: "products",
      sourceFormat: "json",
      content: JSON.stringify([
        {
          name: "Producto",
          sku: "SKU-1",
          unit: "kg",
          salePrice: "12.3456",
          taxRate: "4",
        },
      ]),
    },
    limits,
  );
  assert.equal(
    normalizeRows("products", "json", valid.rows)[0]?.normalizedData.salePrice,
    "12.3456",
  );
  const invalid = parseImport(
    {
      entityType: "products",
      sourceFormat: "json",
      content: JSON.stringify([
        { name: "Producto", unit: "kg", salePrice: 12.34, taxRate: "4" },
      ]),
    },
    limits,
  );
  assert.equal(
    normalizeRows("products", "json", invalid.rows)[0]?.classification,
    "error",
  );
});

test("rechaza cabeceras desconocidas e inyección de company_id", () => {
  const unknown = parseImport(
    {
      entityType: "contacts",
      sourceFormat: "csv",
      content: "type,legal_name,unknown\ncustomer,Cliente,x\n",
    },
    limits,
  );
  assert.throws(
    () => normalizeRows("contacts", "csv", unknown.rows),
    HttpError,
  );
  assert.throws(
    () =>
      validateImportRequest({
        entityType: "products",
        sourceFormat: "json",
        content: "[]",
        companyId: crypto.randomUUID(),
      }),
    HttpError,
  );
  const injected = parseImport(
    {
      entityType: "products",
      sourceFormat: "json",
      content: JSON.stringify([
        {
          name: "X",
          unit: "unit",
          salePrice: "1",
          taxRate: "21",
          company_id: crypto.randomUUID(),
        },
      ]),
    },
    limits,
  );
  assert.throws(
    () => normalizeRows("products", "json", injected.rows),
    HttpError,
  );
});

test("rechaza UTF-8 inválido, binarios, tamaño y número de filas excesivos", () => {
  const invalidUtf8 = Buffer.from([0xc3, 0x28]).toString("base64");
  assert.throws(
    () =>
      parseImport(
        {
          entityType: "contacts",
          sourceFormat: "csv",
          contentBase64: invalidUtf8,
        },
        limits,
      ),
    HttpError,
  );
  assert.throws(
    () =>
      parseImport(
        {
          entityType: "contacts",
          sourceFormat: "csv",
          contentBase64: Buffer.from("a\0b").toString("base64"),
        },
        limits,
      ),
    HttpError,
  );
  assert.throws(
    () =>
      parseImport(
        {
          entityType: "contacts",
          sourceFormat: "csv",
          content: "x".repeat(513),
        },
        limits,
      ),
    (error) => error instanceof HttpError && error.status === 413,
  );
  assert.throws(
    () =>
      parseImport(
        {
          entityType: "contacts",
          sourceFormat: "json",
          content: JSON.stringify([{}, {}, {}]),
        },
        limits,
      ),
    (error) => error instanceof HttpError && error.status === 413,
  );
});

test("la previsualización neutraliza fórmulas sin alterar el dato normalizado", () => {
  const value = { legalName: "=CMD()", nested: ["+SUM(1,1)"] };
  assert.deepEqual(safePreview(value), {
    legalName: "'=CMD()",
    nested: ["'+SUM(1,1)"],
  });
  assert.equal(value.legalName, "=CMD()");
});

test("detecta cabeceras y propone mapeo automático sin conservar el archivo", () => {
  const result = detectColumns({ entityType: "products", sourceFormat: "csv", content: "Producto,Unidad,Precio,IVA\nPatata,kg,1.2500,4\n" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.proposedMapping, { name: "Producto", unit: "Unidad", salePrice: "Precio", taxRate: "IVA" });
});

test("el mapeo manual rechaza obligatorios y columnas duplicadas", () => {
  assert.throws(() => normalizeMapping("products", ["Nombre"], { name: "Nombre" }), (error) => error instanceof HttpError && error.code === "missing_required_mapping");
  assert.throws(() => normalizeMapping("products", ["Nombre", "Unidad", "Precio", "IVA"], { name: "Nombre", unit: "Unidad", salePrice: "Precio", taxRate: "Precio" }), (error) => error instanceof HttpError && error.code === "invalid_mapping");
  assert.deepEqual(applyMapping([{ Nombre: "Patata", Precio: "1.2000" }], { name: "Nombre", salePrice: "Precio" }), [{ name: "Patata", salePrice: "1.2000" }]);
});

test("la detección informa cabeceras duplicadas y ambigüedades", () => {
  const result = detectColumns({ entityType: "contacts", sourceFormat: "csv", content: "tipo,nombre,nombre\ncustomer,A,B\n" });
  assert.deepEqual(result.duplicateColumns, ["nombre"]);
  assert.equal(result.valid, false);
});
