import { describe, expect, it } from "vitest";
import {
  annualInvoiceSeries,
  formatDocumentNumber,
  formatMoney,
  formatQuantity,
  formatTaxRate,
  formatUnitPrice,
} from "../src/utils/format";
import { csvBody, safeCsvCell } from "../src/utils/csv";

describe("formato comercial español", () => {
  it("oculta precisión técnica sin perder el valor recibido", () => {
    expect(formatQuantity("10.0000")).toBe("10");
    expect(formatQuantity("10.2500")).toBe("10,25");
    expect(formatUnitPrice("1.6000")).toBe("1,60 €");
    expect(formatUnitPrice("1.6250")).toBe("1,625 €");
    expect(formatMoney("16.6400")).toBe("16,64 €");
    expect(formatTaxRate("4.000")).toBe("4 %");
  });

  it("representa la serie anual sin ceros de relleno", () => {
    expect(annualInvoiceSeries("fac", "2026-07-18")).toBe("FAC_2026");
    expect(formatDocumentNumber("FAC_2026", 100)).toBe("FAC-100/2026");
    expect(formatDocumentNumber("F", 1)).toBe("F-1");
  });
});

describe("CSV para gestoría", () => {
  it("escapa separadores y neutraliza fórmulas de Excel", () => {
    expect(safeCsvCell("Proveedor; Uno")).toBe('"Proveedor; Uno"');
    expect(safeCsvCell('="dato"')).toBe('"\'=\"\"dato\"\""');
    expect(csvBody([["Número", "Total"], ["FAC-1", "10,40"]])).toBe(
      "Número;Total\r\nFAC-1;10,40",
    );
  });
});
