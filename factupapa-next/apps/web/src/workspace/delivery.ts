import type { DeliveryStop } from "../api/workspace";
import type { PotatoOverview } from "../api/services";

/** Dirección en una línea para mostrar y para buscar en el mapa. */
export function stopAddress(address: Record<string, string>): string {
  const order = ["street", "line1", "line2", "postalCode", "zip", "city", "province", "region"];
  const known = order.filter((key) => address[key]);
  const others = Object.keys(address).filter((key) => !order.includes(key) && address[key] && key !== "country");
  return [...known, ...others].map((key) => address[key]).join(", ");
}

export function mapsUrl(address: string): string | null {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

export interface FridgeHint {
  /** Texto: «En nevera: 30 bolsas». */
  text: string;
  /** Falta nevera para esta línea (hay que hacer una tirada). */
  short: boolean;
}

/**
 * Disponibilidad en nevera de una línea del pedido (solo si tiene producto y se ha contado la nevera).
 * Las líneas en «bolsa» comparan bolsas; las de «kg», kilos.
 */
export function fridgeHint(
  line: DeliveryStop["lines"][number],
  items: PotatoOverview["items"],
): FridgeHint | null {
  if (!line.productId || Number(line.quantityPending) <= 0) return null;
  const item = items.find((candidate) => candidate.productId === line.productId);
  if (!item || item.fridgeQuantity == null) return null;
  const kg = Number(item.fridgeQuantity);
  const per = Number(item.unitsPerPackage ?? 0);
  const pending = Number(line.quantityPending);
  if (line.unit === "bolsa" && per > 0) {
    const bags = Math.floor((kg / per) * 100) / 100;
    return { text: `En nevera: ${bags} bolsas`, short: bags + 1e-9 < pending };
  }
  if (line.unit === "kg") return { text: `En nevera: ${kg} kg`, short: kg + 1e-9 < pending };
  return { text: `En nevera: ${kg} kg`, short: false };
}
