/**
 * Enlace de WhatsApp para un teléfono escrito a mano. Sin prefijo se asume España (+34):
 * «600 11 22 33» → https://wa.me/34600112233 ; «+351 912 345 678» y «00351912345678» se respetan.
 * Devuelve null si no parece un teléfono.
 */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    // ya trae prefijo internacional
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length === 9) {
    digits = `34${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** Enlace para llamar: conserva el + y quita espacios y signos. */
export function telUrl(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const cleaned = `${raw.startsWith("+") ? "+" : ""}${raw.replace(/\D/g, "")}`;
  return cleaned.length >= 5 ? `tel:${cleaned}` : null;
}
