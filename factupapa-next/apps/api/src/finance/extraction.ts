export interface ExtractedPurchaseFields {
  supplierInvoiceNumber?: string;
  issueDate?: string;
  total?: string;
  supplierTaxId?: string;
}
const decimal = (value: string) => value.replace(/\./g, "").replace(",", ".");
export function extractPurchaseFields(text: string): ExtractedPurchaseFields {
  const clean = text
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 100_000),
    out: ExtractedPurchaseFields = {};
  const number = clean.match(
    /(?:factura\s*)?(?:n[uú]mero|n[º°]|num\.?)[\s:#-]*([A-Z0-9][A-Z0-9./_-]{1,49})/i,
  );
  if (number) out.supplierInvoiceNumber = number[1]!;
  const date = clean.match(
    /(?:fecha(?:\s+de\s+emisi[oó]n)?)[\s:]*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i,
  );
  if (date)
    out.issueDate = `${date[3]}-${date[2]!.padStart(2, "0")}-${date[1]!.padStart(2, "0")}`;
  const total = [
    ...clean.matchAll(
      /(?:total(?:\s+factura)?)[\s:€]*([0-9]{1,12}(?:[.,][0-9]{2,4}))/gi,
    ),
  ].at(-1);
  if (total) out.total = decimal(total[1]!);
  const tax = clean.match(/\b(?:CIF|NIF|VAT)[\s:]*([A-Z][0-9A-Z-]{7,14})\b/i);
  if (tax) out.supplierTaxId = tax[1]!.toUpperCase();
  return out;
}
