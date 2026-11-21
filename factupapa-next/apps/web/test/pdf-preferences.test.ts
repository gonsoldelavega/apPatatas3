import { afterEach, describe, expect, it } from "vitest";
import { bagDetailEnabled, setBagDetailEnabled } from "../src/utils/pdf-preferences";

afterEach(() => localStorage.clear());

describe("desglose de bolsas en el PDF", () => {
  it("por defecto no se imprime", () => {
    expect(bagDetailEnabled()).toBe(false);
  });
  it("se recuerda al activarlo y se olvida al quitarlo", () => {
    setBagDetailEnabled(true);
    expect(bagDetailEnabled()).toBe(true);
    setBagDetailEnabled(false);
    expect(bagDetailEnabled()).toBe(false);
  });
});
