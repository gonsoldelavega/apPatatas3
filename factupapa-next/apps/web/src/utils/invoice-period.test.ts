import { describe, expect, it } from "vitest";
import { addCalendarDays, fortnightFor } from "./invoice-period";

describe("fortnightFor", () => {
  it("calcula la primera quincena", () => {
    expect(fortnightFor("2026-07-10")).toEqual({
      start: "2026-07-01",
      end: "2026-07-15",
    });
  });

  it("calcula la segunda quincena y respeta febrero bisiesto", () => {
    expect(fortnightFor("2028-02-16")).toEqual({
      start: "2028-02-16",
      end: "2028-02-29",
    });
  });
});

describe("addCalendarDays", () => {
  it("suma días naturales sin depender del huso horario", () => {
    expect(addCalendarDays("2026-07-19", 3)).toBe("2026-07-22");
    expect(addCalendarDays("2028-02-28", 2)).toBe("2028-03-01");
  });
});
