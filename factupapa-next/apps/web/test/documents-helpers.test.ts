import { describe, expect, it } from "vitest";
import { createPurchaseLink, formatSize, monthsOf } from "../src/documents/helpers";

describe("documentos de Drive", () => {
  it("el enlace de «Crear compra» lleva fecha, concepto y la nota con el enlace", () => {
    const link = createPurchaseLink({
      date: "2026-10-30",
      total: "5.43",
      description: "HETZNER 083001189226",
      name: "2026-10-30_FACTURA_COMPRA_HETZNER_083001189226_5,43.pdf",
      webViewLink: "https://drive.google.com/file/d/abc/view",
    });
    const url = new URL(link, "https://app.test");
    expect(url.pathname).toBe("/gastos/nuevo");
    expect(url.searchParams.get("fecha")).toBe("2026-10-30");
    expect(url.searchParams.get("concepto")).toBe("HETZNER 083001189226");
    expect(url.searchParams.get("nota")).toContain("5,43 €");
    expect(url.searchParams.get("nota")).toContain("https://drive.google.com/file/d/abc/view");
  });
  it("sin datos en el nombre solo lleva la nota", () => {
    const url = new URL(createPurchaseLink({ date: null, total: null, description: null, name: "foto.jpg", webViewLink: null }), "https://app.test");
    expect(url.searchParams.has("fecha")).toBe(false);
    expect(url.searchParams.get("nota")).toBe("Archivo de Drive: foto.jpg");
  });
  it("meses disponibles, de más reciente a más antiguo, sin repetir", () => {
    expect(monthsOf([{ date: "2026-09-02" }, { date: "2026-10-30" }, { date: "2026-10-01" }, { date: null }])).toEqual(["2026-10", "2026-09"]);
  });
  it("tamaño legible", () => {
    expect(formatSize(null)).toBe("");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(2_097_152)).toBe("2,0 MB");
  });
});
