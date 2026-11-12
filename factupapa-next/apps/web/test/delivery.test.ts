import { describe, expect, it } from "vitest";
import { fridgeHint, mapsUrl, stopAddress } from "../src/workspace/delivery";

const line = (overrides: Record<string, unknown>) => ({
  id: "l", productId: "p", description: "Pelada", unit: "bolsa", quantityOrdered: "50", quantityDone: "0", quantityPending: "50", ...overrides,
}) as never;
const items = [{ productId: "p", name: "Pelada", unit: "kg", fridgeQuantity: "75", packageLabel: "Bolsa", unitsPerPackage: "2.5" }];

describe("reparto del día", () => {
  it("dirección ordenada y enlace al mapa", () => {
    expect(stopAddress({ city: "Roquetas", street: "Calle Mayor 1", postalCode: "04740" })).toBe("Calle Mayor 1, 04740, Roquetas");
    expect(mapsUrl("Calle Mayor 1, Roquetas")).toContain("query=Calle%20Mayor%201%2C%20Roquetas");
    expect(mapsUrl("")).toBeNull();
  });
  it("nevera en bolsas: avisa si no llega", () => {
    expect(fridgeHint(line({}), items)).toEqual({ text: "En nevera: 30 bolsas", short: true });
    expect(fridgeHint(line({ quantityPending: "20" }), items)).toEqual({ text: "En nevera: 30 bolsas", short: false });
  });
  it("nevera en kg y sin datos", () => {
    expect(fridgeHint(line({ unit: "kg", quantityPending: "100" }), items)).toEqual({ text: "En nevera: 75 kg", short: true });
    expect(fridgeHint(line({ productId: null }), items)).toBeNull();
    expect(fridgeHint(line({ quantityPending: "0" }), items)).toBeNull();
    expect(fridgeHint(line({}), [{ ...items[0]!, fridgeQuantity: null }])).toBeNull();
  });
});
