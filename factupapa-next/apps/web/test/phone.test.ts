import { describe, expect, it } from "vitest";
import { telUrl, whatsappUrl } from "../src/utils/phone";

describe("enlaces de teléfono", () => {
  it("WhatsApp: asume España cuando no hay prefijo", () => {
    expect(whatsappUrl("600 11 22 33")).toBe("https://wa.me/34600112233");
    expect(whatsappUrl("611-223-344")).toBe("https://wa.me/34611223344");
  });
  it("WhatsApp: respeta prefijos internacionales", () => {
    expect(whatsappUrl("+34 600 11 22 33")).toBe("https://wa.me/34600112233");
    expect(whatsappUrl("+351 912 345 678")).toBe("https://wa.me/351912345678");
    expect(whatsappUrl("0044 7700 900123")).toBe("https://wa.me/447700900123");
  });
  it("WhatsApp: null si no es un teléfono", () => {
    expect(whatsappUrl("")).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl("123")).toBeNull();
  });
  it("llamar: limpia espacios y conserva el +", () => {
    expect(telUrl("+34 600 11 22 33")).toBe("tel:+34600112233");
    expect(telUrl("950 12 34 56")).toBe("tel:950123456");
    expect(telUrl("")).toBeNull();
  });
});
