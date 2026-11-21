import assert from "node:assert/strict";
import { test } from "node:test";
import { bagDetail } from "../src/sales/bags.js";

const line = (quantity: string, description = "Patata pelada", unit = "kg", unitsPerPackage: string | null = null) => ({ quantity, unit, description, unitsPerPackage });

test("detalle de bolsas: bolsas enteras y la sobrante", () => {
  assert.equal(bagDetail(line("34.5")), "13 bolsas de 2,5 kg + 1 de 2 kg");
  assert.equal(bagDetail(line("100")), "40 bolsas de 2,5 kg");
  assert.equal(bagDetail(line("2.5")), "1 bolsa de 2,5 kg");
  assert.equal(bagDetail(line("2")), "1 bolsa de 2 kg");
});

test("detalle de bolsas: usa el envase del producto y no inventa bolsas de otros productos", () => {
  assert.equal(bagDetail(line("30", "Patata agria", "kg", "5")), "6 bolsas de 5 kg");
  assert.equal(bagDetail(line("20", "Zanahoria")), null);
  assert.equal(bagDetail(line("20", "Zanahoria", "kg", "10")), "2 bolsas de 10 kg");
  assert.equal(bagDetail(line("10", "Patata pelada", "unit")), null);
  assert.equal(bagDetail(line("0")), null);
  assert.equal(bagDetail(line("abc")), null);
});
