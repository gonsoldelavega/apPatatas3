function scaled(value: string, scale = 4): bigint {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer!) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0").slice(0, scale));
}

function format(value: bigint, scale = 4): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const integer = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export interface Margin {
  amount: string;
  percentage: string | null;
}

export function calculateMargin(salePrice: string, estimatedCost: string | null): Margin | null {
  if (estimatedCost === null) return null;
  const sale = scaled(salePrice);
  const margin = sale - scaled(estimatedCost);
  if (sale === 0n) return { amount: format(margin), percentage: null };
  const percentageHundredths = (margin * 10_000n) / sale;
  return { amount: format(margin), percentage: format(percentageHundredths, 2) };
}
