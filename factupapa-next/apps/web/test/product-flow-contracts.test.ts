import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) =>
  readFileSync(resolve(process.cwd(), "src", relative), "utf8");

describe("FactuPapa Next purchase architecture", () => {
  it("keeps the manual purchase form free from camera and OCR classification", () => {
    const purchase = source("pages/PurchaseFormPage.tsx");
    expect(purchase).toContain("/purchase-documents/archive");
    expect(purchase).toContain("Se archiva tal cual");
    expect(purchase).not.toMatch(/capture=|capture\s*=|Camera|Lectura automática|Anthropic Vision|ocrConfidence|classificationConfidence/);
  });

  it("uses REGISTRO as the supervised automated purchase entry point", () => {
    const expenses = source("pages/ExpensesPage.tsx");
    expect(expenses).toContain("syncPurchaseRegistry");
    expect(expenses).toContain("Registro Maestro");
    expect(expenses).not.toContain("pendingPurchaseDocuments");
    expect(expenses).not.toContain("gmailApi.sync");
    expect(expenses).not.toContain("recibidas-gmail");
  });

  it("does not expose legacy Gmail purchase-review states on the dashboard", () => {
    const dashboard = source("pages/DashboardPage.tsx");
    expect(dashboard).toContain('to="/gastos/nuevo"');
    expect(dashboard).not.toContain("?captura=1");
    expect(dashboard).not.toContain("pendingPurchaseDocuments");
    expect(dashboard).not.toContain("gmailSyncFailed");
    expect(dashboard).not.toContain("gmailApi");
  });

  it("explains Google permissions without claiming automatic Gmail purchase creation", () => {
    const more = source("pages/MorePage.tsx");
    expect(more).toContain("Las compras no se crean automáticamente desde adjuntos de Gmail");
    expect(more).not.toContain("Sincronización automática activa");
    expect(more).not.toContain("Se revisa automáticamente cada 6 horas");
    expect(more).not.toContain("lastInboxSync");
  });
});

describe("FactuPapa Next invoice numbering", () => {
  it("shows an authoritative suggestion while keeping the number editable", () => {
    const sales = source("pages/SalesFormPage.tsx");
    expect(sales).toContain("/invoices/number-preview");
    expect(sales).toContain('label="Número de factura"');
    expect(sales).toContain("invoiceNumberEdited");
    expect(sales).toContain("Sugerido por la secuencia actual");
  });
});

describe("FactuPapa Next dashboard balance layout", () => {
  it("keeps the mobile month selector above the amount and its label on one line", () => {
    const styles = source("visual-system.css");
    expect(styles).toContain(".result-card__heading > .dashboard-month-nav");
    expect(styles).toContain("grid-row: 1;");
    expect(styles).toContain('span[aria-hidden="true"]');
    expect(styles).toContain("white-space: nowrap;");
    expect(styles).not.toContain(".result-card__heading > div { grid-row: 2; }");
  });
});
