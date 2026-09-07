import { describe, expect, it } from "vitest";
import { expensePeriodTotal, recurringMonthsApplied, recurringTotal } from "./expense-summary";

describe("resumen de gastos", () => {
  const item = { amount: "100", startsOn: "2026-01-15", endsOn: null, isActive: true };
  it("aplica los fijos al mes", () => expect(recurringTotal([item], "month", { from: "2026-03-01", to: "2026-03-31" })).toBe(100));
  it("aplica cada fijo una vez por mes del trimestre", () => expect(recurringTotal([item], "quarter", { from: "2026-04-01", to: "2026-06-30" })).toBe(300));
  it("aplica solo los meses activos del año", () => expect(recurringMonthsApplied({ ...item, endsOn: "2026-03-31" }, { from: "2026-01-01", to: "2026-12-31" })).toBe(3));
  it("no inventa acumulado recurrente para Todo", () => expect(expensePeriodTotal(250, 100, "all")).toBeNull());
  it("suma compras y fijos en periodos delimitados", () => expect(expensePeriodTotal(250, 100, "month")).toBe(350));
});
