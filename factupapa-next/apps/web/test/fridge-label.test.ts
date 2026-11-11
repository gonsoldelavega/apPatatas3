import { describe, expect, it } from "vitest";
import { fridgeLabel } from "../src/stock/FridgeRow";

describe("etiqueta del stock en nevera", () => {
  it("muestra bolsas y kilos cuando el producto tiene envase", () => {
    expect(fridgeLabel({ fridgeQuantity: "75", unitsPerPackage: "2.5", packageLabel: "Bolsa 2,5 kg", unit: "kg" })).toBe("30 bolsas · 75 kg");
  });
  it("muestra solo kilos si no hay envase", () => {
    expect(fridgeLabel({ fridgeQuantity: "20", unitsPerPackage: null, packageLabel: null, unit: "kg" })).toBe("20 kg");
  });
});
