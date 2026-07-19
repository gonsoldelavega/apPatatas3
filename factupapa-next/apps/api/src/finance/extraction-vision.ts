import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type {
  ExtractedPurchaseFields,
  ExtractedPurchaseLine,
} from "./extraction.js";

export type FieldConfidence = "high" | "medium" | "low";

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

export function stripOwnTaxId(
  fields: ExtractedPurchaseFields,
  ownTaxIds: string[],
): ExtractedPurchaseFields {
  if (
    !fields.supplierTaxId ||
    !ownTaxIds.some(
      (own) => normalizeTaxId(own) === normalizeTaxId(fields.supplierTaxId!),
    )
  )
    return fields;
  const { supplierTaxId: _dropped, ...rest } = fields;
  const fieldConfidence = { ...rest.fieldConfidence };
  delete fieldConfidence.supplierTaxId;
  return {
    ...rest,
    ...(rest.fieldConfidence ? { fieldConfidence } : {}),
    warnings: [
      ...new Set([
        ...(rest.warnings ?? []),
        "supplier_tax_id_own",
        "supplier_tax_id_missing",
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

const normalizeInvoiceNumber = (value: string) =>
  value
    .toUpperCase()
    .replace(/Ø/g, "0")
    .replace(/(?<=\d)O|O(?=\d)/g, "0");

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
  const supplierTaxId = cleanText(data.supplierTaxId, 20);
  if (supplierTaxId) {
    out.supplierTaxId = normalizeTaxId(supplierTaxId);
    if (!isValidSpanishTaxId(out.supplierTaxId))
      confidence.supplierTaxId = "low";
  }
  const supplierName = cleanText(data.supplierName, 200);
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
        const expected =
          Number(quantity) * Number(unitCost) - Number(discount ?? 0);
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
  if (
    out.subtotal &&
    out.taxTotal &&
    out.total &&
    Math.abs(Number(out.subtotal) + Number(out.taxTotal) - Number(out.total)) >
      0.02
  )
    warnings.add("totals_mismatch");
  if (!out.total) warnings.add("total_missing");
  if (!out.issueDate) warnings.add("issue_date_missing");
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
  `Eres un extractor de datos de facturas de proveedores españoles para un negocio de patatas y hortalizas.
Responde EXCLUSIVAMENTE con un objeto JSON válido, sin markdown ni texto adicional, con esta forma exacta (usa null cuando el dato no aparezca; nunca lo inventes):
{
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
Reglas:
- "subtotal" es la base imponible, "taxTotal" la cuota de IVA y "total" el total de la factura.
- El NIF del COMPRADOR (cliente) es: ${ownTaxIds.join(", ") || "desconocido"}. NUNCA lo devuelvas como "supplierTaxId"; el "supplierTaxId" es siempre el NIF/CIF del EMISOR de la factura.
- Normaliza los números al formato con punto decimal y sin separador de miles ("1.234,56" -> "1234.56").
- Fechas siempre en ISO YYYY-MM-DD.
- En los códigos de factura corrige confusiones del escaneo: letra O por cero cuando esté entre dígitos (p. ej. "FVO06" -> "FV006").
- Si la tabla de líneas tiene columna de descuento, devuélvelo en "discount" (importe) y en "lineTotal" el importe final de la línea.
- "fieldConfidence" debe tener una entrada por cada campo devuelto: "high" si es seguro, "medium" si conviene revisarlo, "low" si es dudoso.`;

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
            text: `Extrae los datos de esta factura:\n\n${document.text.slice(0, 50_000)}`,
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
          { type: "text", text: "Extrae los datos de la factura de las imágenes." },
        ];
  let lastError: unknown = new Error("vision_unavailable");
  for (let attempt = 0; attempt < 2; attempt++) {
    const reservationId = await options.beforeAttempt?.();
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
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
