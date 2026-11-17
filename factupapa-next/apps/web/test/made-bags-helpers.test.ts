import { describe, expect, it } from "vitest";
import { BAG_VARIETIES, lineKg, productForVariety } from "../src/stock/made-bags-helpers";

const items = [
  { productId: "a", name: "Patata agria" },
  { productId: "b", name: "Patata bastón 12 mm con piel" },
  { productId: "c", name: "Patata Bastón 12mm SIN piel" },
  { productId: "d", name: "Patata brava" },
];

describe("tipos de patata hecha", () => {
  it("incluye los cinco tipos habituales", () => {
    expect(BAG_VARIETIES).toEqual(["Bastón 12 mm con piel", "Bastón 12 mm sin piel", "Brava", "Panadera", "Gajo"]);
  });
  it("busca el producto por nombre sin fijarse en tildes ni mayúsculas", () => {
    expect(productForVariety("Bastón 12 mm con piel", items)?.productId).toBe("b");
    expect(productForVariety("Bastón 12 mm sin piel", items)?.productId).toBe("c");
    expect(productForVariety("Brava", items)?.productId).toBe("d");
  });
  it("si ningún producto coincide usa el primero y con la lista vacía no hay producto", () => {
    expect(productForVariety("Gajo", items)?.productId).toBe("a");
    expect(productForVariety("Lo que sea", items)?.productId).toBe("a");
    expect(productForVariety("Gajo", [])).toBeUndefined();
  });
  it("calcula los kilos de la tirada y rechaza datos no válidos", () => {
    expect(lineKg("10", "2,5")).toBe(25);
    expect(lineKg("3", "2.5")).toBe(7.5);
    expect(lineKg("", "2.5")).toBeNull();
    expect(lineKg("0", "2.5")).toBeNull();
    expect(lineKg("4", "abc")).toBeNull();
  });
});
