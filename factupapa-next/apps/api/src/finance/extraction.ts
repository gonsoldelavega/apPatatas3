export interface ExtractedPurchaseFields {
  supplierInvoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  subtotal?: string;
  taxTotal?: string;
  total?: string;
  supplierTaxId?: string;
  supplierName?: string;
  concept?: string;
  ocrConfidence?: number;
  source?: "pdf_text" | "ocr";
  warnings?: string[];
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
  const dueDate = clean.match(
    /(?:fecha\s+de\s+vencimiento|vencimiento)[\s:]*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i,
  );
  if (dueDate)
    out.dueDate = `${dueDate[3]}-${dueDate[2]!.padStart(2, "0")}-${dueDate[1]!.padStart(2, "0")}`;
  const total = [
    ...clean.matchAll(
      /(?:total(?:\s+factura)?)[\s:€]*([0-9]{1,12}(?:[.,][0-9]{2,4}))/gi,
    ),
  ].at(-1);
  if (total) out.total = decimal(total[1]!);
  const subtotal = clean.match(/(?:base\s+imponible|subtotal)[\s:€]*([0-9]{1,12}(?:[.,][0-9]{2,4}))/i);
  if (subtotal) out.subtotal = decimal(subtotal[1]!);
  const taxTotal = clean.match(
    /(?:cuota\s+(?:de\s+)?iva|total\s+iva|iva)(?:\s+\d{1,2}(?:[.,]\d+)?\s*%)?[\s:€]*([0-9]{1,12}(?:[.,][0-9]{2,4}))/i,
  );
  if (taxTotal) out.taxTotal = decimal(taxTotal[1]!);
  const tax = clean.match(/\b(?:CIF|NIF|VAT)[\s:]*([A-Z][0-9A-Z-]{7,14})\b/i);
  if (tax) out.supplierTaxId = tax[1]!.toUpperCase();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = lines.find((line) => /[A-ZÁÉÍÓÚÑ]{3}/.test(line) && !/factura|fecha|total|cif|nif/i.test(line));
  if (name) out.supplierName = name.replace(/\s+/g, " ").slice(0, 200);
  const concept = lines.find((line) => /patat|envase|transporte|gestor|servicio|producto/i.test(line));
  if (concept) out.concept = concept.replace(/\s+/g, " ").slice(0, 500);
  const warnings: string[] = [];
  if (
    out.subtotal &&
    out.taxTotal &&
    out.total &&
    Math.abs(Number(out.subtotal) + Number(out.taxTotal) - Number(out.total)) > 0.02
  )
    warnings.push("totals_mismatch");
  if (!out.supplierTaxId) warnings.push("supplier_tax_id_missing");
  if (!out.total) warnings.push("total_missing");
  if (!out.issueDate) warnings.push("issue_date_missing");
  out.warnings = warnings;
  return out;
}
