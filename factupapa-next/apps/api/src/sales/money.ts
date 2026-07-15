import { HttpError } from "../http/errors.js";

const SCALE = 10_000n;

export function decimalToScaled(value: string): bigint {
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(value))
    throw new HttpError("invalid_request", 400);
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer!) * SCALE + BigInt(fraction.padEnd(4, "0"));
}

export function scaledToDecimal(value: bigint): string {
  const integer = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(4, "0");
  return `${integer}.${fraction}`;
}

function roundedDivide(value: bigint, divisor: bigint): bigint {
  return (value + divisor / 2n) / divisor;
}

export function lineAmounts(
  quantity: string,
  unitPrice: string,
  taxRate: string,
) {
  const subtotal = roundedDivide(
    decimalToScaled(quantity) * decimalToScaled(unitPrice),
    SCALE,
  );
  const rate = decimalToScaled(taxRate);
  const tax = roundedDivide(subtotal * rate, 100n * SCALE);
  return {
    subtotal: scaledToDecimal(subtotal),
    tax: scaledToDecimal(tax),
    total: scaledToDecimal(subtotal + tax),
  };
}

export function sumAmounts(
  lines: Array<{ lineSubtotal: string; lineTax: string; lineTotal: string }>,
) {
  const sum = (key: "lineSubtotal" | "lineTax" | "lineTotal") =>
    scaledToDecimal(
      lines.reduce((total, line) => total + decimalToScaled(line[key]), 0n),
    );
  return {
    subtotal: sum("lineSubtotal"),
    taxTotal: sum("lineTax"),
    total: sum("lineTotal"),
  };
}
