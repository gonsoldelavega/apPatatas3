/** Tipos de patata hecha más habituales. El usuario puede escribir otro con «Otro». */
export const BAG_VARIETIES = [
  "Bastón 12 mm con piel",
  "Bastón 12 mm sin piel",
  "Brava",
  "Panadera",
  "Gajo",
] as const;

/** Kilos por bolsa cuando el producto no lo indica. */
export const DEFAULT_BAG_KG = 2.5;

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras que debe contener el nombre de un producto para considerarlo de ese tipo. */
function keywords(variety: string): string[] {
  const text = normalize(variety);
  const words: string[] = [];
  if (text.includes("baston")) words.push("baston");
  if (text.includes("con piel")) words.push("con piel");
  if (text.includes("sin piel")) words.push("sin piel");
  for (const name of ["brava", "panadera", "gajo"]) if (text.includes(name)) words.push(name);
  return words;
}

/**
 * Producto de patata cuya nevera se mueve con ese tipo: el que mejor coincide por nombre y, si ninguno,
 * el primero (toda la patata comparte los mismos kilos, así que el total no cambia).
 */
export function productForVariety<T extends { productId: string; name: string }>(variety: string, items: T[]): T | undefined {
  const words = keywords(variety);
  if (words.length) {
    const match = items.find((item) => {
      const name = normalize(item.name);
      return words.every((word) => name.includes(word));
    });
    if (match) return match;
  }
  return items[0];
}

/** Kilos de una tirada a partir de las bolsas y los kg por bolsa; null si algún dato no es válido. */
export function lineKg(bags: string, perBag: string): number | null {
  const count = Number(bags.replace(",", "."));
  const each = Number(perBag.replace(",", "."));
  if (!Number.isFinite(count) || !Number.isFinite(each) || count <= 0 || each <= 0) return null;
  return Math.round(count * each * 10_000) / 10_000;
}
