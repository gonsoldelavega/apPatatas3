import { describe, expect, it } from "vitest";
import {
  describeBalance,
  doneOfText,
  isOverdue,
  monthRange,
  progressPercent,
  quantityText,
  remainingText,
} from "../src/workspace/helpers";
import type { OrderLine } from "../src/api/workspace";

const bags: OrderLine = {
  id: "l1",
  productId: null,
  description: "Patata pelada",
  unit: "bolsa",
  quantityOrdered: "50",
  quantityDone: "38",
  quantityPending: "12",
};

describe("pedidos: avance parcial", () => {
  it("38 de 50 bolsas hechas: quedan 12", () => {
    expect(doneOfText(bags)).toBe("38 de 50 bolsas");
    expect(remainingText(bags)).toBe("Quedan 12 bolsas");
    expect(progressPercent(bags)).toBe(76);
  });

  it("línea completada y línea sin empezar", () => {
    expect(remainingText({ ...bags, quantityDone: "50", quantityPending: "0" })).toBe("Completada");
    expect(progressPercent({ quantityDone: "0", quantityOrdered: "125" })).toBe(0);
    expect(progressPercent({ quantityDone: "125", quantityOrdered: "125" })).toBe(100);
  });

  it("singular y plural de las unidades", () => {
    expect(quantityText("1", "bolsa")).toBe("1 bolsa");
    expect(quantityText("2", "bolsa")).toBe("2 bolsas");
    expect(quantityText("125", "kg")).toBe("125 kg");
    expect(quantityText("12.5", "kg")).toBe("12,5 kg");
  });

  it("un pedido con fecha pasada está vencido", () => {
    expect(isOverdue("2026-11-01", "2026-11-05")).toBe(true);
    expect(isOverdue("2026-11-05", "2026-11-05")).toBe(false);
    expect(isOverdue(null, "2026-11-05")).toBe(false);
  });
});

describe("cuentas entre núcleos", () => {
  it("dice quién debe a quién", () => {
    const message = describeBalance({
      balance: {
        debtorSide: "side_b",
        creditorSide: "side_a",
        debtorName: "Roberto y Gemma",
        creditorName: "Irene y Nando",
        amount: "232.50",
      },
    });
    expect(message.tone).toBe("owed");
    expect(message.detail).toContain("Roberto y Gemma deben");
    expect(message.detail).toContain("232,50");
    expect(message.detail).toContain("a Irene y Nando");
  });

  it("cuentas al día cuando no hay deuda", () => {
    const message = describeBalance({
      balance: { debtorSide: null, creditorSide: null, debtorName: null, creditorName: null, amount: "0.00" },
    });
    expect(message.tone).toBe("even");
    expect(message.headline).toBe("Cuentas al día");
  });
});

describe("filtro por mes", () => {
  it("usa el último día real de cada mes", () => {
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2026-12").to).toBe("2026-12-31");
  });
});
