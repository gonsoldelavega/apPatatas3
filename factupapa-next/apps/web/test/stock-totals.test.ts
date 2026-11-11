import { describe, expect, it } from "vitest";
import type { StockItem } from "../src/api/types";
import { stockTotals } from "../src/utils/stock-totals";

const item = (overrides: Partial<StockItem>): StockItem => ({
  productId: "p",
  name: "x",
  unit: "kg",
  quantity: "0",
  salePrice: "1",
  estimatedCost: null,
  averagePurchaseCost: null,
  potentialRevenue: "0",
  stockValue: null,
  potentialGrossMargin: null,
  ...overrides,
});

describe("totales de stock con patata compartida", () => {
  it("cuenta una sola vez los kilos de todas las variantes de patata", () => {
    const totals = stockTotals([
      item({ productId: "a", name: "Agria", sharedStock: true, quantity: "100", salePrice: "1.2", potentialRevenue: "120", stockValue: "60", potentialGrossMargin: "60" }),
      item({ productId: "b", name: "Patata pelada", sharedStock: true, quantity: "100", salePrice: "1.6", potentialRevenue: "160", stockValue: "60", potentialGrossMargin: "100" }),
      item({ productId: "c", name: "Zanahoria", sharedStock: false, quantity: "20", salePrice: "1", potentialRevenue: "20", stockValue: "8", potentialGrossMargin: "12" }),
    ]);
    expect(totals.kg).toBe(120); // 100 compartidos (una vez) + 20
    expect(totals.stockValue).toBe(68); // 60 + 8
    expect(totals.potentialRevenue).toBeCloseTo(140 + 20); // 100 kg × precio medio 1,40 + 20
  });

  it("sin grupo compartido suma cada producto", () => {
    const totals = stockTotals([
      item({ quantity: "10", potentialRevenue: "10", stockValue: "5", potentialGrossMargin: "5" }),
      item({ quantity: "5", potentialRevenue: "5", stockValue: "2", potentialGrossMargin: "3" }),
    ]);
    expect(totals).toEqual({ kg: 15, stockValue: 7, potentialRevenue: 15, margin: 8 });
  });
});
