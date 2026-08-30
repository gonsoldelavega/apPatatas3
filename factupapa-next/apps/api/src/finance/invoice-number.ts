/** Canonical identity for fiscal invoice numbers. */
export function canonicalInvoiceNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.toUpperCase().replace(/[ØO]/g, "0").replace(/\s+/g, "").trim();
  if (!text) return null;
  // Spanish series/sequence forms: FV006-000001861 and 006/0001.861
  const structured = text.match(/^(?:[A-Z]{1,8})?(\d{1,6})[./_-]([0-9./_-]+)$/);
  if (structured) {
    const sequence = structured[2]!.replace(/[./_-]/g, "");
    if (sequence) return `S${String(Number(structured[1]))}:N${String(Number(sequence))}`;
  }
  const prefixed = text.match(/^[A-Z]{1,8}(\d{3,})(?:[./_-])?(\d{1,12})$/);
  if (prefixed) return `S${String(Number(prefixed[1]))}:N${String(Number(prefixed[2]))}`;
  const digits = text.match(/^(\d{3,})$/);
  if (digits) return `N${String(Number(digits[1]))}`;
  return text.replace(/[./_-]+/g, "-");
}

export function canonicalSupplierTaxId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}
