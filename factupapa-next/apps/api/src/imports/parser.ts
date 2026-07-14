import { HttpError } from "../http/errors.js";
import type { ImportLimits, ImportSourceFormat, ParsedImport, ValidateImportInput } from "./types.js";

function decodeBase64(value: string): Buffer {
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new HttpError("invalid_request", 400);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new HttpError("invalid_request", 400);
  return bytes;
}

function sourceBytes(input: ValidateImportInput): Buffer {
  if ((input.content === undefined) === (input.contentBase64 === undefined)) {
    throw new HttpError("invalid_request", 400);
  }
  return input.content !== undefined ? Buffer.from(input.content, "utf8") : decodeBase64(input.contentBase64!);
}

function decodeUtf8(bytes: Buffer): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0") || /[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
      throw new Error("binary content");
    }
    return text.replace(/^\uFEFF/, "");
  } catch {
    throw new HttpError("invalid_request", 400);
  }
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') {
      if (field.length !== 0) throw new HttpError("invalid_request", 400);
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new HttpError("invalid_request", 400);
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const records = parseCsvRecords(text);
  const headers = records.shift()?.map((header) => header.trim());
  if (!headers?.length || headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new HttpError("invalid_request", 400);
  }
  return records.map((values) => {
    if (values.length !== headers.length) throw new HttpError("invalid_request", 400);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseJson(text: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError("invalid_request", 400);
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 1
      ? (parsed as { rows?: unknown }).rows
      : undefined;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new HttpError("invalid_request", 400);
  }
  return rows as Record<string, unknown>[];
}

export function parseImport(input: ValidateImportInput, limits: ImportLimits): ParsedImport {
  const bytes = sourceBytes(input);
  if (bytes.length === 0) throw new HttpError("invalid_request", 400);
  if (bytes.length > limits.maximumBytes) throw new HttpError("payload_too_large", 413);
  const text = decodeUtf8(bytes);
  const rows = input.sourceFormat === "csv" ? parseCsv(text) : parseJson(text);
  if (rows.length === 0 || rows.length > limits.maximumRows) {
    throw new HttpError(rows.length > limits.maximumRows ? "payload_too_large" : "invalid_request", rows.length > limits.maximumRows ? 413 : 400);
  }
  return { bytes, rows };
}

export function sourceFormat(value: unknown): ImportSourceFormat {
  if (value !== "csv" && value !== "json") throw new HttpError("invalid_request", 400);
  return value;
}
