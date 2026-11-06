/**
 * Cuentas entre los dos núcleos (reparto 50 % / 50 %). Cálculo exacto en céntimos, sin decimales flotantes.
 *
 *  - gasto pagado por X:      X adelantó el dinero → el otro núcleo le debe la mitad.
 *  - ingreso cobrado por X:   X tiene el dinero    → X debe la mitad al otro núcleo.
 *  - liquidación pagada por X: X entrega dinero al otro núcleo y reduce lo que le debe.
 */
export type Side = "side_a" | "side_b";

export interface SideTotals {
  expenseCents: bigint;
  incomeCents: bigint;
  settlementCents: bigint;
}

export interface Balance {
  /** Núcleo que debe dinero (null si están al día). */
  debtor: Side | null;
  /** Núcleo al que se le debe. */
  creditor: Side | null;
  cents: bigint;
}

export const emptyTotals = (): SideTotals => ({ expenseCents: 0n, incomeCents: 0n, settlementCents: 0n });

export function toCents(text: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?\d*$/.exec(text.trim());
  if (!match) throw new Error("invalid_amount");
  const cents = BigInt(match[2]!) * 100n + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return match[1] ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const euros = absolute / 100n;
  const rest = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${euros}.${rest}`;
}

export function computeBalance(a: SideTotals, b: SideTotals): Balance {
  // Medios céntimos: el reparto 50 % de una cantidad impar de céntimos no se pierde, se arrastra.
  const halves =
    a.expenseCents - b.expenseCents + (b.incomeCents - a.incomeCents) + 2n * (a.settlementCents - b.settlementCents);
  const absolute = halves < 0n ? -halves : halves;
  const cents = absolute / 2n;
  if (cents === 0n) return { debtor: null, creditor: null, cents: 0n };
  // halves > 0 → el núcleo B debe dinero al A.
  return halves > 0n
    ? { debtor: "side_b", creditor: "side_a", cents }
    : { debtor: "side_a", creditor: "side_b", cents };
}
