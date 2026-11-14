import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDrivePath, driveFileStatus, parseDriveFilename, purchaseStatus } from "../src/drive/library.js";

test("el tipo de documento sale de la carpeta", () => {
  assert.equal(classifyDrivePath("02_COMPRAS/2026/T4/10_OCTUBRE/FACTURAS_RECIBIDAS"), "compra");
  assert.equal(classifyDrivePath("01_VENTAS/2026/T3/FACTURAS_EMITIDAS"), "venta");
  assert.equal(classifyDrivePath("03_GASTOS/2026"), "gasto");
  assert.equal(classifyDrivePath("99_PENDIENTE_DE_CLASIFICAR/REVISAR_MANUALMENTE"), "revisar");
  assert.equal(classifyDrivePath("99_PENDIENTE_DE_CLASIFICAR/REVISAR_MANUALMENTE/DUPLICADOS"), "revisar");
  assert.equal(classifyDrivePath("00_ADMINISTRACION"), "otro");
});

test("el nombre del archivo trae fecha, descripción e importe", () => {
  assert.deepEqual(parseDriveFilename("2026-10-28_FACTURA_COMPRA_GAYCA_006_0002.619_93,60.pdf"), {
    date: "2026-10-28",
    total: "93.60",
    description: "GAYCA 006 0002.619",
  });
  assert.deepEqual(parseDriveFilename("2026-09-30_FACTURA_COMPRA_SOLRED_BBV260469615_1.226,71.pdf"), {
    date: "2026-09-30",
    total: "1226.71",
    description: "SOLRED BBV260469615",
  });
  assert.deepEqual(parseDriveFilename("5ecbb6bf-b26d-4656-8537.jpg"), { date: null, total: null, description: null });
  assert.equal(parseDriveFilename("2026-11-06 foto.jpg").total, null);
});

const file = (name: string, path = "02_COMPRAS/2026") => ({ driveId: "drive123", webViewLink: "https://drive.google.com/file/d/drive123/view", name, path, mimeType: "application/pdf" });

test("una compra está registrada si hay otra con la misma fecha e importe o con el mismo enlace de Drive", () => {
  const purchases = [{ issueDate: "2026-10-28", total: "93.6000", sourceRegistryUrl: null }];
  assert.equal(purchaseStatus(file("2026-10-28_FACTURA_COMPRA_GAYCA_006_0002.619_93,60.pdf"), purchases), "registrada");
  assert.equal(purchaseStatus(file("2026-10-29_FACTURA_COMPRA_GAYCA_X_93,60.pdf"), purchases), "sin_registrar");
  assert.equal(purchaseStatus(file("2026-10-28_FACTURA_COMPRA_GAYCA_X_94,00.pdf"), purchases), "sin_registrar");
  assert.equal(
    purchaseStatus(file("foto.jpg"), [{ issueDate: "2026-01-01", total: "1", sourceRegistryUrl: "https://drive.google.com/file/d/drive123/view" }]),
    "registrada",
  );
  assert.equal(purchaseStatus(file("sin-formato.pdf"), []), "sin_registrar");
});

test("estado por carpeta: duplicados, a revisar y lo que no es compra", () => {
  assert.deepEqual(driveFileStatus(file("a.pdf", "99_PENDIENTE_DE_CLASIFICAR/REVISAR_MANUALMENTE/DUPLICADOS"), []), { kind: "revisar", status: "duplicado" });
  assert.deepEqual(driveFileStatus(file("a.jpg", "99_PENDIENTE_DE_CLASIFICAR/REVISAR_MANUALMENTE"), []), { kind: "revisar", status: "revisar" });
  assert.deepEqual(driveFileStatus(file("v.pdf", "01_VENTAS/2026"), []), { kind: "venta", status: "no_aplica" });
});
