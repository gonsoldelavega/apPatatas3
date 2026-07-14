export function formatMoney(value: string): string {
  const [integerPart, decimalPart = ""] = value.replace(",", ".").split(".");
  if (!/^\d+$/.test(integerPart) || !/^\d*$/.test(decimalPart)) return value;
  const integer = BigInt(integerPart).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = decimalPart.slice(0, 4).padEnd(2, "0");
  return `${integer},${fraction} €`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}

export function todayLocal(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function unitLabel(unit: string): string {
  return ({ kg: "kg", g: "g", unit: "ud.", box: "caja", custom: "personalizada" } as Record<string, string>)[unit] ?? unit;
}
