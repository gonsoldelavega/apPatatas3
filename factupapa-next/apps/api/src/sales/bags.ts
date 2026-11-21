/** Kilos de una bolsa de patata cuando el producto no indica otro envase. */
const DEFAULT_BAG_KG = 2.5;
const POTATO = /patata|agria|bast[oó]n|brava|panadera|gajo/i;

const kg = (value: number) => String(Math.round(value * 1000) / 1000).replace(".", ",");

/**
 * Desglose en bolsas para mostrarlo (si se quiere) en albaranes y facturas, p. ej.
 * 34,5 kg → «13 bolsas de 2,5 kg + 1 de 2 kg». Null si no aplica (otra unidad, producto que no es
 * patata sin envase propio, o una cantidad que no es positiva).
 */
export function bagDetail(line: { quantity: string; unit: string; description: string; unitsPerPackage?: string | null }): string | null {
  if (line.unit !== "kg") return null;
  const total = Number(line.quantity);
  if (!Number.isFinite(total) || total <= 0) return null;
  const declared = Number(line.unitsPerPackage ?? 0);
  const perBag = declared > 0 ? declared : POTATO.test(line.description) ? DEFAULT_BAG_KG : 0;
  if (perBag <= 0) return null;
  const bags = Math.floor((total + 1e-9) / perBag);
  const rest = Math.round((total - bags * perBag) * 10_000) / 10_000;
  if (bags === 0) return rest > 0 ? `1 bolsa de ${kg(rest)} kg` : null;
  const main = `${bags} ${bags === 1 ? "bolsa" : "bolsas"} de ${kg(perBag)} kg`;
  return rest > 0 ? `${main} + 1 de ${kg(rest)} kg` : main;
}
