// Prueba del lector de facturas sin Apps Script: node --test apps-script/gonsol-drive-organizer/test/organizer.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(dir, "Code.gs"), "utf8");
const pad = (n) => String(n).padStart(2, "0");
const context = vm.createContext({
  console: { log() {}, error() {} },
  MimeType: {},
  SpreadsheetApp: { openById() { throw new Error("sin hoja"); } },
  DriveApp: {},
  GmailApp: {},
  ContentService: {},
  Logger: { log() {} },
  Utilities: { formatDate: (d, tz, f) => (f === "yyyy-MM-dd" ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`) },
});
vm.runInContext(code + "\nthis.api = { extractPurchaseInvoiceData_, solveAmounts_, validNif_, isOwnNif_ };", context);
const api = context.api;
const read = (text, name) => api.extractPurchaseInvoiceData_(text, name);

const SALCEDO_1 = `PATATAS SALCEDO, S.L.\n\nCAMINO DE LA GOLETA 63 04007 ALMERAERIA) C.1.F.: 804365285\n\nORIGINAL\n\nFACTURA\n\n02/060891\n\nCLIENTE\n\n01847\n\nPATATAS 15K\n\nGONZALEZ CABRERA IRENE\n\n018470453139730\n\nFECHA\n\n04-11-2026\n\n10,00\n\n150,00\n\n250,00\n\n0,7000\n\n5,00\n\nVTA\n\nBASE\n\n100,96\n\nIVA REC 4,00\n\nDTO\n\nTARJETA\n\n4,04\n\nTOTAL\n\n105,00\n\n105,00`;
const SALCEDO_2 = `PATATAS SALCEDO, S. L. CAMINO DE LA GOLETA 63 04007 ALMERIA (ALMERIA) C.T.F.: B04368288\n\nGONZALEZ CABRERA IRENE\n\n01847- 045313973U\n\nORIGINAL\n\nFACTURA\n\n02/065075\n\nFECHA\n\n25-11-2026\n\nPATATAS 15K\n\n450,00\n\n0,6800\n\n306,00\n\nBASE\n\n294,23\n\n8 IVA REC 4,00\n\n11,77\n\nTOTAL\n\n306,00\n\n306,00`;

test("Salcedo: proveedor, NIF, numero, fecha e importes aunque el OCR lea mal el NIF", () => {
  const first = read(SALCEDO_1, "scan.pdf");
  assert.deepEqual([first.provider, first.nif, first.invoiceNumber, first.dateText, first.base, first.ivaPercent, first.ivaAmount, first.total],
    ["PATATAS SALCEDO, S.L.", "B04368288", "02/060891", "2026-11-04", 100.96, 4, 4.04, 105]);
  const second = read(SALCEDO_2, "scan.pdf");
  assert.deepEqual([second.invoiceNumber, second.dateText, second.base, second.ivaAmount, second.total], ["02/065075", "2026-11-25", 294.23, 11.77, 306]);
  assert.ok(first.supplierKnown && first.amountsCoherent && !first.isCredit);
});

test("GAYCA sigue leyendose igual", () => {
  const d = read("FRUTAS Y PATATAS GAYCA, S.A.\nA04037677\nFACTURA FV006-000002619\nFecha 28/10/2026\nBase 90,00\nIVA 4% 3,60\nTOTAL FACTURA 93,60", "FV.pdf");
  assert.deepEqual([d.provider, d.invoiceNumber, d.total, d.ivaAmount], ["FRUTAS Y PATATAS GAYCA, S.A.", "FV006-000002619", 93.6, 3.6]);
});

test("una devolucion o un proveedor desconocido no se dan por buenos", () => {
  const credit = read("FACTURA DE DEVOLUCIÓN FD0018-003-14-03/0000163\nOriginal\nOBRAMAT\nBRICOLAJE BRICOMAN, S.L.U. C.I.F. B-84406289\n11 Noviembre 2026\n9.36\n1.97\n-11.33", "x.pdf");
  assert.equal(credit.isCredit, true);
  assert.equal(credit.supplierKnown, false);
  const unknown = read("TALLERES PEPE S.L.\nFactura 123\nFecha 01/11/2026\nBase 100,00 IVA 21% 21,00 Total 121,00", "x.pdf");
  assert.equal(unknown.supplierKnown, false);
  assert.equal(unknown.nif, "", "una fecha no es un NIF");
});

test("validacion de NIF/CIF: acepta los reales y rechaza lecturas del OCR", () => {
  for (const nif of ["B04368288", "A04037677", "B04854154", "B42743211", "B85049435", "B84406289", "45313973V"]) assert.equal(api.validNif_(nif), true, nif);
  for (const nif of ["A6304007A", "D00180031", "A01112026"]) assert.equal(api.validNif_(nif), false, nif);
  assert.equal(api.isOwnNif_("045313973U"), true, "el NIF propio mal leido sigue siendo el propio");
});

test("solveAmounts: base + IVA = total con el IVA impreso", () => {
  assert.deepEqual({ ...api.solveAmounts_("Base 52,25 IVA 10,97 Total 63,22", "") }, { base: 52.25, ivaPercent: 21, ivaAmount: 10.97, total: 63.22 });
  assert.equal(api.solveAmounts_("Total 105,00 y 2,50", ""), null);
});

test("un proveedor conocido manda sobre las palabras sueltas del texto", () => {
  const solred = read("SOLRED, S.A.\nFactura 260528837\nFecha 01/10/2026\nGasoleo bolsa de hielo\nBase 25,71 IVA 21% 5,40 Total 31,11", "x.pdf");
  assert.equal(solred.category, "Combustible");
  assert.equal(solred.concept, "Combustible");
  const salcedo = read(SALCEDO_2, "x.pdf");
  assert.equal(salcedo.category, "Materia prima");
});
