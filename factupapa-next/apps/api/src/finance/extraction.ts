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
  purchasedSacks?: number;
  purchasedQuantityKg?: string;
  lines?: ExtractedPurchaseLine[];
  ocrConfidence?: number;
  source?: "pdf_text" | "ocr" | "vision";
  fieldConfidence?: Record<string, "high" | "medium" | "low">;
  warnings?: string[];
}
export interface ExtractedPurchaseLine {
  description: string;
  quantity: string;
  unit: "kg" | "g" | "unit";
  unitCost: string;
  taxRate: string;
  discount?: string;
  lineTotal?: string;
}
const decimal = (value: string) =>
  value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
const rounded = (value: number) => String(Math.round(value * 10_000) / 10_000);
function extractLines(text: string, fallbackTaxRate: string): ExtractedPurchaseLine[] {
  const result: ExtractedPurchaseLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (
      line.length < 8 ||
      /(?:base\s+imponible|subtotal|total|cuota|forma\s+de\s+pago|vencimiento)/i.test(line)
    )
      continue;
    const match = line.match(
      /^(.{3,180}?\D)\s+(\d{1,8}(?:[.,]\d{1,4})?)\s*(kg|kgs?|g|gr|uds?\.?|unidades?)?\s+(\d{1,8}(?:[.,]\d{2,4}))\s+(?:(\d{1,2}(?:[.,]\d{1,2})?)\s*%?\s+)?(\d{1,12}(?:[.,]\d{2}))\s*€?$/i,
    );
    if (!match) continue;
    const quantity = Number(decimal(match[2]!)),
      unitCost = Number(decimal(match[4]!)),
      lineAmount = Number(decimal(match[6]!));
    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(unitCost) ||
      quantity <= 0 ||
      unitCost < 0 ||
      Math.abs(quantity * unitCost - lineAmount) > Math.max(0.03, lineAmount * 0.015)
    )
      continue;
    const description = match[1]!
      .replace(/^\s*(?=[A-Z0-9./_-]*\d)[A-Z0-9./_-]{2,20}\s+(?=[A-ZÁÉÍÓÚÑ])/i, "")
      .trim()
      .slice(0, 500);
    if (!description || /^(?:c[oó]digo|descripci[oó]n|art[ií]culo)$/i.test(description))
      continue;
    const rawUnit = match[3]?.toLowerCase(),
      unit = rawUnit?.startsWith("kg") || (!rawUnit && /patat/i.test(description))
        ? "kg"
        : rawUnit === "g" || rawUnit === "gr"
          ? "g"
          : "unit";
    result.push({
      description,
      quantity: rounded(quantity),
      unit,
      unitCost: rounded(unitCost),
      taxRate: match[5] ? decimal(match[5]) : fallbackTaxRate,
    });
    if (result.length === 100) break;
  }
  return result;
}
export function extractPurchaseFields(text: string, filename = ""): ExtractedPurchaseFields {
  const clean = text
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 100_000),
    out: ExtractedPurchaseFields = {};
  const explicitNumber = clean.match(
    /n[uú]mero\s+factura\s*[:#-]\s*([A-Z0-9][A-Z0-9./_-]{1,49})/i,
  );
  if (explicitNumber && /\d/.test(explicitNumber[1]!))
    out.supplierInvoiceNumber = explicitNumber[1]!.replace(/Ø/g, "0");
  const number = clean.match(
    /(?:factura\s*)?(?:n[uú]mero|n[º°]|num\.?)(?=[\s:#-])[\s:#-]+([A-Z0-9][A-Z0-9./_-]{1,49})/i,
  );
  if (
    !out.supplierInvoiceNumber &&
    number &&
    /\d/.test(number[1]!) &&
    !/^(?:factura|vendedor|cliente|fecha|c[oó]digo)$/i.test(number[1]!)
  )
    out.supplierInvoiceNumber = number[1]!.replace(/Ø/g, "0");
  if (!out.supplierInvoiceNumber) {
    const invoiceToken = text.match(/\b(?:FV|FA|FC)(?=[A-Z0-9Ø/-]*\d)[A-Z0-9Ø/-]{5,40}\b/i);
    if (invoiceToken)
      out.supplierInvoiceNumber = invoiceToken[0].toUpperCase().replace(/Ø/g, "0");
  }
  const date = clean.match(
    /(?:fecha(?:\s+de\s+emisi[oó]n)?)[\s:]*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i,
  );
  if (date)
    out.issueDate = `${date[3]}-${date[2]!.padStart(2, "0")}-${date[1]!.padStart(2, "0")}`;
  if (!out.issueDate) {
    const fallbackDate = `${text} ${filename}`.match(/(?:^|\D)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\D|$)|(?:^|\D)(20\d{2})-(\d{2})-(\d{2})(?:\D|$)/);
    if (fallbackDate)
      out.issueDate = fallbackDate[4]
        ? `${fallbackDate[4]}-${fallbackDate[5]}-${fallbackDate[6]}`
        : `${fallbackDate[3]}-${fallbackDate[2]!.padStart(2, "0")}-${fallbackDate[1]!.padStart(2, "0")}`;
  }
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
  if (!out.total) {
    const euroAmounts = [...text.matchAll(/\b([0-9]{1,12}(?:[.,][0-9]{2}))\s*€/g)];
    const filenameTotal = filename.match(/[_-]([0-9]{1,12},[0-9]{2})(?:\.[^.]+)?$/);
    const value = euroAmounts.at(-1)?.[1] ?? filenameTotal?.[1];
    if (value) out.total = decimal(value);
  }
  const subtotal = clean.match(/(?:b[ao]se\s+imponible|subtotal)[\s:€]*([0-9]{1,12}(?:[.,][0-9]{2,4}))/i);
  if (subtotal) out.subtotal = decimal(subtotal[1]!);
  if (!out.subtotal) {
    const tableSubtotal = clean.match(/b[ao]se\s+imponible.{0,100}?([0-9]{1,12}[.,][0-9]{2})/i);
    if (tableSubtotal) out.subtotal = decimal(tableSubtotal[1]!);
  }
  const taxTotal = clean.match(
    /(?:cuota\s+(?:de\s+)?iva|total\s+iva|iva)(?:\s+\d{1,2}(?:[.,]\d+)?\s*%)?[\s:€]*([0-9]{1,12}(?:[.,][0-9]{2,4}))/i,
  );
  if (taxTotal) out.taxTotal = decimal(taxTotal[1]!);
  if (!out.taxTotal) {
    const taxTable = clean.match(/b[ao]se\s+imponible.{0,100}?[0-9]{1,12}[.,][0-9]{2}\s+\d{1,2}(?:[.,]\d+)?\s+([0-9]{1,12}[.,][0-9]{2})/i);
    if (taxTable) out.taxTotal = decimal(taxTable[1]!);
  }
  const fiscalRow = clean.match(
    /b[ao]se\s+imponible.{0,100}?([0-9]{1,12}[.,][0-9]{2})\s+(\d{1,2}(?:[.,]\d+)?)\D{0,3}([0-9]{1,12}[.,][0-9]{2})\D{0,3}([0-9]{1,12}[.,][0-9]{2})/i,
  );
  if (fiscalRow) {
    out.subtotal = decimal(fiscalRow[1]!);
    out.taxTotal = decimal(fiscalRow[3]!);
  }
  const fiscalThree = clean.match(
    /b[ao]se\s+imponible.{0,120}?([0-9]{1,12}[.,][0-9]{2})\s+(\d{1,2}(?:[.,]\d+)?)\D{0,3}([0-9]{1,12}[.,][0-9]{2})/i,
  );
  if (fiscalThree) {
    out.subtotal = decimal(fiscalThree[1]!);
    out.taxTotal = decimal(fiscalThree[3]!);
  }
  if (out.total) {
    const fiscalText = clean.match(/b[ao]se\s+imponible.{0,220}/i)?.[0] ?? "";
    const amounts = [...fiscalText.matchAll(/\b\d{1,12}[.,]\d{2}\b/g)].map((x) => ({
      raw: x[0],
      value: Number(decimal(x[0])),
    }));
    const expected = Number(out.total);
    let reconciled:
      | { base: { raw: string; value: number }; tax: { raw: string; value: number }; total: { raw: string; value: number } }
      | undefined;
    for (const base of amounts)
      for (const taxAmount of amounts)
        for (const totalAmount of amounts)
          if (
            base !== taxAmount &&
            base !== totalAmount &&
            taxAmount !== totalAmount &&
            base.value > taxAmount.value &&
            Math.abs(base.value + taxAmount.value - totalAmount.value) <= 0.02 &&
            (!reconciled || totalAmount.value > reconciled.total.value)
          )
            reconciled = { base, tax: taxAmount, total: totalAmount };
    if (reconciled) {
      out.subtotal = decimal(reconciled.base.raw);
      out.taxTotal = decimal(reconciled.tax.raw);
      out.total = decimal(reconciled.total.raw);
    }
    outer: for (const base of amounts) {
      for (const taxAmount of amounts) {
        if (
          base !== taxAmount &&
          base.value > taxAmount.value &&
          Math.abs(base.value - expected) > 0.001 &&
          Math.abs(base.value + taxAmount.value - expected) <= 0.02
        ) {
          if (!reconciled) {
            out.subtotal = decimal(base.raw);
            out.taxTotal = decimal(taxAmount.raw);
          }
          break outer;
        }
      }
    }
  }
  const tax = clean.match(/\b(?:CIF|NIF|VAT)[\s:]*([A-Z][0-9A-Z-]{7,14})\b/i);
  if (tax) out.supplierTaxId = tax[1]!.toUpperCase();
  if (!out.supplierTaxId) {
    const bareTaxId = text.match(/\b(?:[A-Z]\d{7}[A-Z0-9]|\d{8}[A-Z])\b/i);
    if (bareTaxId) out.supplierTaxId = bareTaxId[0].toUpperCase();
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const legalName = text.match(/\b([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 .&-]{2,80}?\s+(?:S\.?L\.?|S\.?A\.?|S\.?C\.?A\.?))\b/i);
  const name = legalName?.[1] ?? lines.find((line) => /[A-ZÁÉÍÓÚÑ]{3}/.test(line) && !/factura|fecha|total|cif|nif/i.test(line));
  if (name) out.supplierName = name.replace(/\s+/g, " ").slice(0, 200);
  const concept = lines.find((line) => /patat|envase|transporte|gestor|servicio|producto/i.test(line));
  if (concept) out.concept = concept.replace(/\s+/g, " ").slice(0, 500);
  const sacks = clean.match(
    /\b(\d{1,5})\s*(?:sacos?|sacks?)(?:\s*(?:x|de)\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*kg)?\b/i,
  );
  if (sacks) {
    out.purchasedSacks = Number(sacks[1]);
    const kgPerSack = sacks[2] ? Number(decimal(sacks[2])) : 15;
    out.purchasedQuantityKg = String(out.purchasedSacks * kgPerSack);
  } else {
    const kg = clean.match(/\b(?:cantidad|peso|total)?\s*(\d{1,8}(?:[.,]\d{1,3})?)\s*kg\b/i);
    if (kg) out.purchasedQuantityKg = decimal(kg[1]!);
  }
  if (!out.purchasedQuantityKg) {
    const potatoRow = clean.match(
      /patatas?\s+[a-záéíóúñ .-]{0,60}?\s(\d{1,6}(?:[.,]\d{1,3})?)\D{1,8}\d{1,4}[.,]\d{1,4}\D{1,8}\d{1,12}[.,]\d{2}/i,
    );
    if (potatoRow) {
      out.purchasedQuantityKg = decimal(potatoRow[1]!);
      const kg = Number(out.purchasedQuantityKg);
      if (Number.isInteger(kg / 15)) out.purchasedSacks = kg / 15;
    }
  }
  const inferredTaxRate =
    out.subtotal && out.taxTotal && Number(out.subtotal) > 0
      ? rounded((Number(out.taxTotal) / Number(out.subtotal)) * 100)
      : "0";
  const extractedLines = extractLines(text, inferredTaxRate);
  if (extractedLines.length) {
    out.lines = extractedLines;
    const stockKg = extractedLines
      .filter((line) => line.unit === "kg" && /patat/i.test(line.description))
      .reduce((sum, line) => sum + Number(line.quantity), 0);
    if (stockKg > 0) {
      out.purchasedQuantityKg = rounded(stockKg);
      if (Number.isInteger(stockKg / 15)) out.purchasedSacks = stockKg / 15;
    }
  }
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
