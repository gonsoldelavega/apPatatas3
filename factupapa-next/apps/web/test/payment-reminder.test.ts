import { describe, expect, it } from "vitest";
import { paymentReminderMessage } from "../src/utils/payment-reminder";

const base = { series: "FAC_2026", number: 100, total: "145.00", balanceDue: "145.00", today: "2026-11-12" };

describe("recordatorio de cobro", () => {
  it("factura vencida: dice cuándo venció", () => {
    const text = paymentReminderMessage({ ...base, dueDate: "2026-11-05", recipientName: "Manolo García" });
    expect(text).toContain("Hola Manolo,");
    expect(text).toContain("FAC-100/2026");
    expect(text).toContain("venció el 05/11/2026");
    expect(text).toContain("145,00");
  });
  it("factura no vencida: dice cuándo vence", () => {
    expect(paymentReminderMessage({ ...base, dueDate: "2026-11-30" })).toContain("vence el 30/11/2026");
  });
  it("pago parcial: indica lo que queda", () => {
    const text = paymentReminderMessage({ ...base, balanceDue: "45.00", dueDate: null });
    expect(text).toContain("quedan");
    expect(text).toContain("45,00");
    expect(text.startsWith("Hola,")).toBe(true);
  });
});
