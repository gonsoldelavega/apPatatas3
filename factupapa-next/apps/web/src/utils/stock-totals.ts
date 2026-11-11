import type { StockItem } from "../api/types";

export interface StockTotals {
  kg: number;
  stockValue: number;
  potentialRevenue: number;
  margin: number;
}

/**
 * Totales del inventario. Los productos con «patata», «patatas» o «agria» en el nombre comparten
 * la misma existencia de kilos: ese grupo se cuenta UNA sola vez (no una por variante).
 */
export function stockTotals(items: StockItem[]): StockTotals {
  const totals: StockTotals = { kg: 0, stockValue: 0, potentialRevenue: 0, margin: 0 };
  const shared = items.filter((item) => item.sharedStock && item.unit === "kg");
  for (const item of items.filter((candidate) => !shared.includes(candidate))) {
    if (item.unit === "kg") totals.kg += Number(item.quantity);
    totals.potentialRevenue += Number(item.potentialRevenue);
    if (item.stockValue) totals.stockValue += Number(item.stockValue);
    if (item.potentialGrossMargin) totals.margin += Number(item.potentialGrossMargin);
  }
  if (shared.length > 0) {
    const quantity = Number(shared[0]!.quantity);
    const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
    totals.kg += quantity;
    totals.potentialRevenue += Math.max(0, quantity) * average(shared.map((item) => Number(item.salePrice)));
    const values = shared.filter((item) => item.stockValue).map((item) => Number(item.stockValue));
    const value = average(values);
    totals.stockValue += value;
    totals.margin += Math.max(0, quantity) * average(shared.map((item) => Number(item.salePrice))) - value;
  }
  return totals;
}
