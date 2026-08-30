import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type {
  ExtractedPurchaseFields,
  ExtractedPurchaseLine,
} from "./extraction.js";

export type FieldConfidence = "high" | "medium" | "low";
export type DocumentType =
  | "supplier_invoice"
  | "issued_sales_invoice"
  | "supplier_credit_note"
  | "bank_transfer_receipt"
  | "bank_deposit_receipt"
  | "payment_confirmation"
  | "delivery_note"
  | "account_statement"
  | "non_fiscal_document"
  | "unknown";

export interface DocumentClassificationEvidence {
  page?: number;
  field?: string;
  quote: string;
}

declare module "./extraction.js" {
  interface ExtractedPurchaseFields {
    documentType?: DocumentType;
    classificationConfidence?: number;
    classificationEvidence?: DocumentClassificationEvidence[];
    classificationReasons?: string[];
    purchaseEligible?: boolean;
    blockingReasons?: string[];
    issuerName?: string;
    issuerTaxId?: string;
    recipientName?: string;
    recipientTaxId?: string;
    currency?: string;
  }
}

export type VisionDocument =
  | { kind: "text"; text: string }
  | { kind: "images"; images: Buffer[]; mediaType: "image/png" | "image/jpeg" };

export interface VisionClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: unknown }>;
    }): Promise<{
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string | null;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export interface VisionOptions {
  apiKey: string;
  ownTaxIds: string[];
  model?: string;
  timeoutMs?: number;
  client?: VisionClient;
  beforeAttempt?: () => Promise<string>;
  onAttemptSuccess?: (
    reservationId: string,
    usage: { inputTokens: number; outputTokens: number },
  ) => Promise<void>;
  onAttemptFailure?: (
    reservationId: string,
    error: unknown,
  ) => Promise<void>;
}

export const DEFAULT_VISION_MODEL = "claude-haiku-4-5";

const DOCUMENT_TYPES = new Set<DocumentType>([
  "supplier_invoice",
  "issued_sales_invoice",
  "supplier_credit_note",
  "bank_transfer_receipt",
  "bank_deposit_receipt",
  "payment_confirmation",
  "delivery_note",
  "account_statement",
  "non_fiscal_document",
  "unknown",
]);

const normalizeTaxId = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const nifLetters = "TRWAGMYFPDXBNJZSQVHLCKE";

export function isValidSpanishTaxId(raw: string): boolean {
  const value = normalizeTaxId(raw);
  if (/^\d{8}[A-Z]$/.test(value))
    return value[8] === nifLetters[Number(value.slice(0, 8)) % 23];
  if (/^[XYZ]\d{7}[A-Z]$/.test(value)) {
    const digits =
      { X: "0", Y: "1", Z: "2" }[value[0] as "X" | "Y" | "Z"] +
      value.slice(1, 8);
    return value[8] === nifLetters[Number(digits) % 23];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(value)) {
    let sum = 0;
    for (let position = 1; position <= 7; position++) {
      const digit = Number(value[position]);
      if (position % 2 === 1) {
        const doubled = digit * 2;
        sum += Math.floor(doubled / 10) + (doubled % 10);
      } else sum += digit;
    }
    const control = (10 - (sum % 10)) % 10;
    const expectedDigit = String(control),
      expectedLetter = "JABCDEFGHI"[control]!;
    if (/[NPQRSW]/.test(value[0]!)) return value[8] === expectedLetter;
    if (/[ABEH]/.test(value[0]!)) return value[8] === expectedDigit;
    return value[8] === expectedDigit || value[8] === expectedLetter;
  }
  return false;
}

const ownTaxIdSet = (ownTaxIds: string[]) =>
  new Set(ownTaxIds.map(normalizeTaxId).filter(Boolean));

const isOwnTaxId = (value: string | undefined, ownTaxIds: string[]) =>
  Boolean(value && ownTaxIdSet(ownTaxIds).has(normalizeTaxId(value)));

export function stripOwnTaxId(
  fields: ExtractedPurchaseFields,
  ownTaxIds: string[],
): ExtractedPurchaseFields {
  const issuerCandidate = (fields as ExtractedPurchaseFields & { issuerTaxId?: string }).issuerTaxId ?? fields.supplierTaxId;
  if (!issuerCandidate || !isOwnTaxId(issuerCandidate, ownTaxIds))
    return fields;
  const ownIssuerTaxId = normalizeTaxId(issuerCandidate);
  const { supplierTaxId: _dropped, issuerTaxId: _issuer, ...rest } = fields;
  const fieldConfidence = { ...rest.fieldConfidence };
  delete fieldConfidence.supplierTaxId;
  return {
    ...rest,
    issuerTaxId: (rest as ExtractedPurchaseFields & { issuerTaxId?: string }).issuerTaxId ?? ownIssuerTaxId,
    documentType: "issued_sales_invoice",
    classificationConfidence: Math.max(rest.classificationConfidence ?? 0, 0.99),
    purchaseEligible: false,
    classificationReasons: [
      ...new Set([
        ...(rest.classificationReasons ?? []),
        "own_tax_id_is_document_issuer",
      ]),
    ],
    blockingReasons: [
      ...new Set([
        ...(rest.blockingReasons ?? []),
        "own_company_is_issuer",
      ]),
    ],
    ...(rest.fieldConfidence ? { fieldConfidence } : {}),
    warnings: [
      ...new Set([
        ...(rest.warnings ?? []),
        "supplier_tax_id_own",
        "supplier_tax_id_missing",
        "document_not_purchase_eligible",
      ]),
    ],
  };
}

const decimal = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value))
    return String(Math.round(value * 10_000) / 10_000);
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/[€\s]/g, "");
  if (!cleaned) return undefined;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return /^-?\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized))
    ? normalized
    : undefined;
};

const isoDate = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim()))
    return undefined;
  const trimmed = value.trim(),
    parsed = new Date(`${trimmed}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== trimmed
    ? undefined
    : trimmed;
};

const cleanText = (value: unknown, maximum: number): string | undefined =>
  typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
    : undefined;

const cleanTaxId = (value: unknown): string | undefined => {
  const text = cleanText(value, 24);
  return text ? normalizeTaxId(text) : undefined;
};

const cleanConfidence = (value: unknown): number | undefined => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.min(1, Math.round(numeric * 1000) / 1000));
};

const normalizeInvoiceNumber = (value: string) =>
  value
    .toUpperCase()
    .replace(/Ø/g, "0")
    .replace(/(?<=\d)O|O(?=\d)/g, "0");

function normalizedDocumentType(value: unknown): DocumentType {
  return typeof value === "string" && DOCUMENT_TYPES.has(value as DocumentType)
    ? (value as DocumentType)
    : "unknown";
}

function classificationEvidence(value: unknown): DocumentClassificationEvidence[] {
  if (!Array.isArray(value)) return [];
  const result: DocumentClassificationEvidence[] = [];
  for (const item of value.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const quote = cleanText(row.quote, 500);
    if (!quote) continue;
    const pageValue = Number(row.page),
      page = Number.isInteger(pageValue) && pageValue > 0 && pageValue <= 200
        ? pageValue
        : undefined;
    const field = cleanText(row.field, 80);
    result.push({ ...(page ? { page } : {}), ...(field ? { field } : {}), quote });
  }
  return result;
}

function cleanReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => typeof item === "string" && item.trim() ? [item.replace(/\s+/g, " ").trim().slice(0, 240)] : [])
    .slice(0, 30);
}

export function normalizeVisionFields(
  raw: unknown,
  ownTaxIds: string[],
): ExtractedPurchaseFields {
  const data = (
    raw && typeof raw === "object" ? raw : {}
  ) as Record<string, unknown>;
  const confidence: Record<string, FieldConfidence> = {};
  if (data.fieldConfidence && typeof data.fieldConfidence === "object")
    for (const [key, value] of Object.entries(data.fieldConfidence))
      if (value === "high" || value === "medium" || value === "low")
        confidence[key] = value;
  const out: ExtractedPurchaseFields = {};
  const warnings = new Set<string>();

  out.documentType = normalizedDocumentType(data.documentType);
  out.classificationConfidence = cleanConfidence(data.classificationConfidence) ?? 0;
  out.classificationEvidence = classificationEvidence(data.evidence ?? data.classificationEvidence);
  out.classificationReasons = cleanReasons(data.reasons ?? data.classificationReasons);
  const issuerName = cleanText(data.issuerName, 200);
  if (issuerName) out.issuerName = issuerName;
  const issuerTaxId = cleanTaxId(data.issuerTaxId);
  if (issuerTaxId) out.issuerTaxId = issuerTaxId;
  const recipientName = cleanText(data.recipientName, 200);
  if (recipientName) out.recipientName = recipientName;
  const recipientTaxId = cleanTaxId(data.recipientTaxId);
  if (recipientTaxId) out.recipientTaxId = recipientTaxId;
  const currency = cleanText(data.currency, 3)?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) out.currency = currency;

  const invoiceNumber = cleanText(data.supplierInvoiceNumber, 50);
  if (invoiceNumber && /\d/.test(invoiceNumber))
    out.supplierInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
  const issueDate = isoDate(data.issueDate);
  if (issueDate) out.issueDate = issueDate;
  const dueDate = isoDate(data.dueDate);
  if (dueDate) out.dueDate = dueDate;
  const subtotal = decimal(data.subtotal);
  if (subtotal) out.subtotal = subtotal;
  const taxTotal = decimal(data.taxTotal);
  if (taxTotal !== undefined) out.taxTotal = taxTotal;
  const total = decimal(data.total);
  if (total) out.total = total;
  const supplierTaxId = cleanTaxId(data.supplierTaxId) ?? out.issuerTaxId;
  if (supplierTaxId) {
    out.supplierTaxId = supplierTaxId;
    if (!isValidSpanishTaxId(out.supplierTaxId))
      confidence.supplierTaxId = "low";
  }
  const supplierName = cleanText(data.supplierName, 200) ?? out.issuerName;
  if (supplierName) out.supplierName = supplierName;
  const concept = cleanText(data.concept, 500);
  if (concept) out.concept = concept;

  const inferredTaxRate =
    out.subtotal && out.taxTotal && Number(out.subtotal) > 0
      ? String(
          Math.round((Number(out.taxTotal) / Number(out.subtotal)) * 100 * 100) /
            100,
        )
      : "0";
  if (Array.isArray(data.lines)) {
    const lines: ExtractedPurchaseLine[] = [];
    for (const rawLine of data.lines.slice(0, 100)) {
      const line = (
        rawLine && typeof rawLine === "object" ? rawLine : {}
      ) as Record<string, unknown>;
      const description = cleanText(line.description, 500),
        quantity = decimal(line.quantity),
        unitCost = decimal(line.unitCost);
      if (!description || !quantity || Number(quantity) <= 0 || unitCost === undefined || Number(unitCost) < 0)
        continue;
      const rawUnit = cleanText(line.unit, 10)?.toLowerCase(),
        unit: ExtractedPurchaseLine["unit"] =
          rawUnit === "kg" || (!rawUnit && /patat/i.test(description))
            ? "kg"
            : rawUnit === "g"
              ? "g"
              : "unit";
      const discount = decimal(line.discount),
        lineTotal = decimal(line.lineTotal),
        taxRate = decimal(line.taxRate) ?? inferredTaxRate;
      if (lineTotal !== undefined) {
        const expected = Number(quantity) * Number(unitCost) - Number(discount ?? 0);
        if (
          Math.abs(expected - Number(lineTotal)) >
          Math.max(0.03, Number(lineTotal) * 0.015)
        ) {
          warnings.add("line_amount_mismatch");
          confidence.lines = "low";
        }
      }
      lines.push({
        description,
        quantity,
        unit,
        unitCost,
        taxRate,
        ...(discount !== undefined && Number(discount) !== 0 ? { discount } : {}),
        ...(lineTotal !== undefined ? { lineTotal } : {}),
      });
    }
    if (lines.length) {
      out.lines = lines;
      const stockKg = lines
        .filter((line) => line.unit === "kg" && /patat/i.test(line.description))
        .reduce((sum, line) => sum + Number(line.quantity), 0);
      if (stockKg > 0) {
        out.purchasedQuantityKg = String(Math.round(stockKg * 10_000) / 10_000);
        if (Number.isInteger(stockKg / 15)) out.purchasedSacks = stockKg / 15;
      }
    }
  }

  const totalsCoherent = !(
    out.subtotal &&
    out.taxTotal &&
    out.total &&
    Math.abs(Number(out.subtotal) + Number(out.taxTotal) - Number(out.total)) > 0.02
  );
  if (!totalsCoherent) warnings.add("totals_mismatch");
  if (!out.total) warnings.add("total_missing");
  if (!out.issueDate) warnings.add("issue_date_missing");

  const ownIssuer = isOwnTaxId(out.issuerTaxId ?? out.supplierTaxId, ownTaxIds);
  const ownRecipient = isOwnTaxId(out.recipientTaxId, ownTaxIds);
  const issuerExternal = Boolean((out.issuerTaxId ?? out.supplierTaxId) && !ownIssuer);

  if (ownIssuer) {
    out.documentType = "issued_sales_invoice";
    out.classificationConfidence = Math.max(out.classificationConfidence ?? 0, 0.99);
    out.classificationReasons = [
      ...new Set([...(out.classificationReasons ?? []), "own_tax_id_is_document_issuer"]),
    ];
  }

  const blockingReasons: string[] = [];
  if (out.documentType !== "supplier_invoice") blockingReasons.push("document_type_not_supplier_invoice");
  if (!issuerExternal) blockingReasons.push("external_issuer_not_proven");
  if (!ownRecipient) blockingReasons.push("own_company_recipient_not_proven");
  if (!out.supplierInvoiceNumber) blockingReasons.push("invoice_number_missing");
  if (!out.issueDate) blockingReasons.push("issue_date_missing");
  if (!out.total) blockingReasons.push("total_missing");
  if (!totalsCoherent) blockingReasons.push("totals_mismatch");
  if ((out.classificationConfidence ?? 0) < 0.8) blockingReasons.push("classification_confidence_low");

  out.purchaseEligible = blockingReasons.length === 0;
  out.blockingReasons = [...new Set(blockingReasons)];
  if (!out.purchaseEligible) warnings.add("document_not_purchase_eligible");

  const confidenceScore = { high: 95, medium: 70, low: 40 } as const;
  const scores = Object.values(confidence).map((value) => confidenceScore[value]);
  if (scores.length)
    out.ocrConfidence = Math.round(
      scores.reduce((sum, score) => sum + score, 0) / scores.length,
    );
  out.fieldConfidence = confidence;
  out.warnings = [...warnings];

  const filtered = stripOwnTaxId(out, ownTaxIds);
  if (!filtered.supplierTaxId)
    filtered.warnings = [
      ...new Set([...(filtered.warnings ?? []), "supplier_tax_id_missing"]),
    ];
  return filtered;
}

const systemPrompt = (ownTaxIds: string[]) =>
  `Eres un clasificador y extractor documental contable estricto. NO asumas que el documento es una factura de proveedor.
Los NIF/CIF propios del negocio son: ${ownTaxIds.join(", ") || "desconocidos"}.

Clasifica primero el documento en EXACTAMENTE uno de estos tipos:
- supplier_invoice: factura emitida por un proveedor externo y cuyo receptor/comprador es nuestro negocio.
- issued_sales_invoice: factura emitida por nuestro negocio a un cliente.
- supplier_credit_note: factura rectificativa/abono emitido por proveedor.
- bank_transfer_receipt: justificante de transferencia bancaria.
- bank_deposit_receipt: justificante de ingreso/abono bancario.
- payment_confirmation: confirmación o recibo de pago, no factura fiscal.
- delivery_note: albarán.
- account_statement: extracto/listado de movimientos bancarios.
- non_fiscal_document: documento sin naturaleza fiscal de compra.
- unknown: no hay evidencia suficiente o hay contradicciones.

Reglas de seguridad:
- Si uno de los NIF propios figura como EMISOR, documentType DEBE ser issued_sales_invoice y nunca supplier_invoice.
- Un banco, transferencia, ingreso, abono, comprobante de pago o extracto NUNCA es supplier_invoice aunque contenga importes, IVA o la palabra factura en referencias.
- supplier_invoice solo es válido si puedes identificar con evidencia al EMISOR externo y al RECEPTOR propio. Si no puedes distinguir ambos, usa unknown.
- supplier_credit_note nunca debe tratarse como factura de compra normal.
- No inventes NIF, número, fecha, total ni partes. Usa null si no aparece.
- La mera presencia de un importe, IVA, empresa o la palabra factura no demuestra supplier_invoice.

Responde EXCLUSIVAMENTE con JSON válido, sin markdown, con esta forma:
{
  "documentType": "supplier_invoice"|"issued_sales_invoice"|"supplier_credit_note"|"bank_transfer_receipt"|"bank_deposit_receipt"|"payment_confirmation"|"delivery_note"|"account_statement"|"non_fiscal_document"|"unknown",
  "classificationConfidence": number,
  "reasons": [string],
  "evidence": [{"page": number|null, "field": string|null, "quote": string}],
  "issuerName": string|null,
  "issuerTaxId": string|null,
  "recipientName": string|null,
  "recipientTaxId": string|null,
  "currency": string|null,
  "supplierInvoiceNumber": string|null,
  "issueDate": "YYYY-MM-DD"|null,
  "dueDate": "YYYY-MM-DD"|null,
  "subtotal": string|null,
  "taxTotal": string|null,
  "total": string|null,
  "supplierTaxId": string|null,
  "supplierName": string|null,
  "concept": string|null,
  "lines": [{"description": string, "quantity": string, "unit": "kg"|"g"|"unit", "unitCost": string, "discount": string|null, "lineTotal": string|null, "taxRate": string|null}],
  "fieldConfidence": {"<campo>": "high"|"medium"|"low"}
}

Detalles:
- classificationConfidence va de 0 a 1 y mide la certeza del TIPO documental, no la calidad OCR.
- evidence debe citar fragmentos breves visibles que justifiquen emisor, receptor y tipo documental; incluye página si se conoce.
- supplierTaxId/supplierName solo representan al emisor proveedor y deben coincidir con issuerTaxId/issuerName cuando documentType=supplier_invoice.
- subtotal es base imponible, taxTotal cuota de IVA y total total del documento.
- Normaliza números con punto decimal y sin separador de miles.
- Fechas siempre ISO YYYY-MM-DD.
- En códigos de factura corrige O por 0 solo cuando sea una confusión inequívoca entre dígitos.
- fieldConfidence debe reflejar la confianza por campo extraído.`;

function parseJsonResponse(text: string): unknown {
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start === -1 || end <= start)
    throw new Error("vision_response_not_json");
  return JSON.parse(text.slice(start, end + 1));
}

function retryableVisionError(error: unknown): boolean {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  return (
    typeof status !== "number" ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  );
}

export async function prepareVisionImage(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 })
    .autoOrient()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "white" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function extractPurchaseFieldsWithVision(
  document: VisionDocument,
  options: VisionOptions,
): Promise<ExtractedPurchaseFields> {
  const model = options.model ?? DEFAULT_VISION_MODEL;
  let client = options.client;
  if (!client) {
    const anthropic = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 30_000,
      maxRetries: 0,
    });
    client = {
      messages: {
        create: (params) =>
          anthropic.messages.create(
            params as Anthropic.MessageCreateParamsNonStreaming,
          ),
      },
    };
  }
  const content =
    document.kind === "text"
      ? [
          {
            type: "text",
            text: `Clasifica y extrae este documento sin asumir que sea una factura de proveedor:\n\n${document.text.slice(0, 50_000)}`,
          },
        ]
      : [
          ...document.images.slice(0, 2).map((image) => ({
            type: "image",
            source: {
              type: "base64",
              media_type: document.mediaType,
              data: image.toString("base64"),
            },
          })),
          { type: "text", text: "Clasifica y extrae el documento de las imágenes sin asumir que sea una factura de proveedor." },
        ];
  let lastError: unknown = new Error("vision_unavailable");
  for (let attempt = 0; attempt < 2; attempt++) {
    const reservationId = await options.beforeAttempt?.();
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2600,
        system: systemPrompt(options.ownTaxIds),
        messages: [{ role: "user", content }],
      });
      const text = response.content.find(
        (block) => block.type === "text" && block.text,
      )?.text;
      if (!text) throw new Error("vision_empty_response");
      if (reservationId && response.usage && options.onAttemptSuccess)
        await options.onAttemptSuccess(reservationId, {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });
      return normalizeVisionFields(parseJsonResponse(text), options.ownTaxIds);
    } catch (error) {
      lastError = error;
      if (reservationId && options.onAttemptFailure)
        await options.onAttemptFailure(reservationId, error).catch(
          () => undefined,
        );
      if (!retryableVisionError(error)) break;
    }
  }
  throw lastError;
}
