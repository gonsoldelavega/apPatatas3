import { describe, expect, it } from "vitest";
import { parseInvoiceVoiceCommand, voiceMatchKey } from "./commandParser";

describe("parseInvoiceVoiceCommand", () => {
  it("parses the requested multi-product invoice phrase", () => {
    expect(
      parseInvoiceVoiceCommand(
        "Haz una factura para Bar Pepito con 100 kilos de patata y 10 lechugas",
      ),
    ).toEqual({
      kind: "create_invoice",
      customerQuery: "Bar Pepito",
      lines: [
        { quantity: 100, unitHint: "kg", productQuery: "patata" },
        { quantity: 10, unitHint: null, productQuery: "lechugas" },
      ],
    });
  });

  it("accepts simple spoken quantities", () => {
    const parsed = parseInvoiceVoiceCommand(
      "Prepárame una factura para Casa Ana con cien kilos de patata y diez unidades de lechuga",
    );
    expect(parsed.lines[0].quantity).toBe(100);
    expect(parsed.lines[1]).toMatchObject({ quantity: 10, unitHint: "unit" });
  });

  it("rejects commands without an explicit invoice structure", () => {
    expect(() => parseInvoiceVoiceCommand("ponle patatas a Pepito")).toThrow();
  });
});

describe("voiceMatchKey", () => {
  it("softens basic Spanish plurals for product matching", () => {
    expect(voiceMatchKey("Lechugas")).toBe(voiceMatchKey("Lechuga"));
    expect(voiceMatchKey("Patatas")).toBe(voiceMatchKey("Patata"));
  });
});
