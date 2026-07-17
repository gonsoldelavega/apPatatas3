function decimalParts(
  value: string,
): { negative: boolean; integer: string; fraction: string } | null {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    negative: match[1] === "-",
    integer: match[2]!,
    fraction: match[3] ?? "",
  };
}

function groupedInteger(value: string): string {
  return BigInt(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fixed(value: string, decimals: number): string | null {
  const parts = decimalParts(value);
  if (!parts) return null;
  const padded = parts.fraction.padEnd(decimals + 1, "0");
  const factor = 10n ** BigInt(decimals);
  let scaled =
    BigInt(parts.integer) * factor + BigInt(padded.slice(0, decimals) || "0");
  if (Number(padded[decimals] ?? "0") >= 5) scaled += 1n;
  const integer = groupedInteger((scaled / factor).toString());
  const fraction = (scaled % factor).toString().padStart(decimals, "0");
  return `${parts.negative ? "-" : ""}${integer}${decimals ? `,${fraction}` : ""}`;
}

export function formatMoney(value: string): string {
  const result = fixed(value, 2);
  return result === null ? value : `${result} €`;
}

export function formatUnitPrice(value: string): string {
  const parts = decimalParts(value);
  if (!parts) return value;
  const fraction = parts.fraction
    .padEnd(2, "0")
    .replace(/0+$/u, "")
    .padEnd(2, "0");
  return `${parts.negative ? "-" : ""}${groupedInteger(parts.integer)},${fraction} €`;
}

export function formatQuantity(value: string): string {
  const parts = decimalParts(value);
  if (!parts) return value;
  const fraction = parts.fraction.replace(/0+$/u, "");
  return `${parts.negative ? "-" : ""}${groupedInteger(parts.integer)}${fraction ? `,${fraction}` : ""}`;
}

export function formatTaxRate(value: string): string {
  return `${formatQuantity(value)} %`;
}

export function formatDocumentNumber(
  series: string,
  number: number | null,
): string {
  if (number === null) return "Borrador sin numerar";
  const annual = series.match(/^(.+)_([0-9]{4})$/u);
  return annual ? `${annual[1]}-${number}/${annual[2]}` : `${series}-${number}`;
}

export function annualInvoiceSeries(
  prefix = "FAC",
  date = todayLocal(),
): string {
  return `${prefix.toUpperCase()}_${date.slice(0, 4)}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function todayLocal(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function unitLabel(unit: string): string {
  return (
    (
      {
        kg: "kg",
        g: "g",
        unit: "ud.",
        box: "caja",
        custom: "personalizada",
      } as Record<string, string>
    )[unit] ?? unit
  );
}
