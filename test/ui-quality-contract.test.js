import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const nav = read("src/ui/render-nav.js");
const dashboard = read("src/ui/views/dashboard-view.js");
const invoiceForm = read("src/ui/forms/invoice-form.js");
const purchaseForm = read("src/ui/forms/purchase-form.js");
const billing = read("src/ui/views/billing-view.js");
const settings = read("src/ui/views/settings-view.js");
const modal = read("src/ui/components/modal.js");
const themes = read("src/styles/themes.css");
const index = read("index.html");
const sw = read("sw.js");

test("primary mobile navigation matches the product contract", () => {
  for (const label of ["Inicio", "Facturas", "Gastos", "Productos", "Otros"]) {
    assert.match(nav, new RegExp(`label:\\"${label}\\"`));
  }
  assert.doesNotMatch(nav, /label:\"Crear\"/);
  assert.doesNotMatch(nav, /injectNavStyles/);
  assert.match(themes, /@import '\.\/navigation\.css';/);
});

test("dashboard offers direct previous and next month controls", () => {
  assert.match(dashboard, /data-dashboard-month-step="1"/);
  assert.match(dashboard, /data-dashboard-month-step="-1"/);
  assert.match(dashboard, /class="month-navigator"/);
  assert.doesNotMatch(dashboard, /role="button" tabindex="0"/);
});

test("new invoice number remains editable and manual overrides are preserved", () => {
  assert.match(invoiceForm, /<input name="number"/);
  assert.doesNotMatch(invoiceForm, /name="number"[^>]*readonly/);
  assert.match(invoiceForm, /data\.number = String\(data\.number \|\| ""\)\.trim\(\) \|\| computePreviewInvoiceNumber\(\)/);
});

test("purchase form keeps derived totals out of the primary entry flow", () => {
  assert.match(purchaseForm, /name="totalAmount" type="hidden"/);
  assert.match(purchaseForm, /class="form-optional"/);
  assert.match(purchaseForm, /Proveedor, fecha, cantidades y precios/);
});

test("unfinished and stale product copy is not presented as final UI", () => {
  assert.doesNotMatch(billing, /Presupuestos · pronto/);
  assert.doesNotMatch(settings, /Operativa, escáner y documentos/);
  assert.doesNotMatch(settings, /Versión: 2026-06-02d/);
});

test("modal avoids forced mobile keyboard and restores interaction context", () => {
  assert.match(modal, /function isTouchLike/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /document\.body\.style\.overflow = previousBodyOverflow/);
  assert.match(modal, /focusElement\(titleNode\)/);
  assert.match(modal, /e\.key !== "Tab"/);
});

test("quality release bumps browser and service-worker asset versions together", () => {
  assert.match(index, /v=20260905a/);
  assert.match(sw, /2026-09-05a-quality/);
  assert.match(themes, /@import '\.\/quality-sweep\.css';/);
});
