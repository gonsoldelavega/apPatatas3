import { describe, expect, it } from "vitest";
import { bagLabel } from "./packaging";

describe("desglose de bolsas", () => {
  it("convierte 100 kg en 40 bolsas de 2,5 kg", () => {
    expect(bagLabel("100", "kg")).toBe("40 bolsas de 2,5 kg");
  });

  it("no redondea los kilos que no completan una bolsa", () => {
    expect(bagLabel("101", "kg")).toBe("40 bolsas de 2,5 kg + 1 kg");
  });

  it("no aplica bolsas a productos vendidos por unidad", () => {
    expect(bagLabel("100", "unit")).toBeNull();
  });
});
