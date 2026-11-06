import type { LedgerSummary, OrderLine, OrderUnit, Side } from "../api/workspace";
import { formatMoney, formatQuantity } from "../utils/format";

export function unitName(unit: OrderUnit, quantity: string): string {
  if (unit === "bolsa") return Number(quantity) === 1 ? "bolsa" : "bolsas";
  if (unit === "unidad") return Number(quantity) === 1 ? "ud." : "uds.";
  return "kg";
}

export function quantityText(quantity: string, unit: OrderUnit): string {
  return `${formatQuantity(quantity)} ${unitName(unit, quantity)}`;
}

/** Porcentaje hecho (0–100) de una línea de pedido. */
export function progressPercent(line: Pick<OrderLine, "quantityDone" | "quantityOrdered">): number {
  const ordered = Number(line.quantityOrdered);
  if (!(ordered > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(line.quantityDone) / ordered) * 100)));
}

/** "Quedan 12 bolsas" / "Completada". */
export function remainingText(line: OrderLine): string {
  return Number(line.quantityPending) > 0
    ? `Quedan ${quantityText(line.quantityPending, line.unit)}`
    : "Completada";
}

/** Una línea tipo "38 de 50 bolsas". */
export function doneOfText(line: OrderLine): string {
  return `${formatQuantity(line.quantityDone)} de ${quantityText(line.quantityOrdered, line.unit)}`;
}

export interface BalanceMessage {
  tone: "even" | "owed";
  headline: string;
  detail: string;
}

/** Frase clara de quién debe a quién. */
export function describeBalance(summary: Pick<LedgerSummary, "balance">): BalanceMessage {
  const { balance } = summary;
  if (!balance.debtorSide || !balance.debtorName || !balance.creditorName || Number(balance.amount) === 0) {
    return { tone: "even", headline: "Cuentas al día", detail: "Nadie debe nada a nadie." };
  }
  return {
    tone: "owed",
    headline: `${formatMoney(balance.amount)}`,
    detail: `${balance.debtorName} deben ${formatMoney(balance.amount)} a ${balance.creditorName}`,
  };
}

export function sideLabel(side: Side | null | undefined, names: Record<Side, string> | undefined): string {
  if (!side) return "Cualquiera";
  return names?.[side] ?? (side === "side_a" ? "Núcleo A" : "Núcleo B");
}

export const KIND_LABELS = {
  expense: "Gasto",
  income: "Ingreso",
  settlement: "Pago entre nosotros",
} as const;

export function formatShortDate(value: string | null): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/** Un pedido está vencido si tiene fecha pasada y sigue abierto. */
export function isOverdue(dueDate: string | null, today: string): boolean {
  return Boolean(dueDate) && (dueDate as string) < today;
}

/** Primer y último día reales de un mes "YYYY-MM" (el último puede ser 28, 29, 30 o 31). */
export function monthRange(month: string): { from: string; to: string } {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
