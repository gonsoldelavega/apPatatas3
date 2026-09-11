export type VoiceUnitHint = "kg" | "unit" | null;

export interface ParsedInvoiceLine {
  quantity: number;
  unitHint: VoiceUnitHint;
  productQuery: string;
}

export interface ParsedInvoiceCommand {
  kind: "create_invoice";
  customerQuery: string;
  lines: ParsedInvoiceLine[];
}

const SIMPLE_NUMBERS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function quantityFromToken(token: string): number | null {
  const normalized = normalize(token).replace(",", ".");
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return SIMPLE_NUMBERS[normalized] ?? null;
}

function parseLine(value: string): ParsedInvoiceLine {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    throw new Error(`No entiendo la línea «${value.trim()}».`);
  }

  const quantity = quantityFromToken(tokens[0]);
  if (!quantity) {
    throw new Error(`No encuentro una cantidad válida en «${value.trim()}».`);
  }

  let cursor = 1;
  let unitHint: VoiceUnitHint = null;
  const unit = normalize(tokens[cursor] ?? "");
  if (["kg", "kilo", "kilos", "kilogramo", "kilogramos"].includes(unit)) {
    unitHint = "kg";
    cursor += 1;
  } else if (["ud", "uds", "unidad", "unidades"].includes(unit)) {
    unitHint = "unit";
    cursor += 1;
  }

  if (normalize(tokens[cursor] ?? "") === "de") cursor += 1;
  const productQuery = tokens.slice(cursor).join(" ").trim();
  if (!productQuery) {
    throw new Error(`Falta el producto en «${value.trim()}».`);
  }

  return { quantity, unitHint, productQuery };
}

export function parseInvoiceVoiceCommand(raw: string): ParsedInvoiceCommand {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Di o escribe la factura que quieres preparar.");

  const match = text.match(
    /^(?:(?:genera(?:me)?|genérame|crea(?:me)?|créame|haz(?:me)?|prepara(?:me)?|prepárame)\s+)?(?:una?\s+)?factura\s+(?:para|a)\s+(.+?)\s+con\s+(.+)$/i,
  );
  if (!match) {
    throw new Error(
      "Prueba con: «Haz una factura para Bar Pepito con 100 kilos de patata y 10 lechugas».",
    );
  }

  const customerQuery = match[1].trim();
  const rawLines = match[2]
    .split(/\s*(?:,|\by\b)\s*/i)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!customerQuery || rawLines.length === 0) {
    throw new Error("Falta el cliente o algún producto de la factura.");
  }

  return {
    kind: "create_invoice",
    customerQuery,
    lines: rawLines.map(parseLine),
  };
}

export function voiceMatchKey(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token))
    .join(" ");
}
