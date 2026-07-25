import { readSheet } from "read-excel-file/browser";

type SpreadsheetCell = string | number | boolean | Date | null;

const csvCell = (value: SpreadsheetCell): string => {
  const normalized =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value == null
        ? ""
        : String(value);
  return /[",\n\r]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
};

export function spreadsheetRowsToCsv(rows: SpreadsheetCell[][]): string {
  return rows
    .filter((row) => row.some((cell) => cell != null && String(cell).trim()))
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export async function spreadsheetFileToCsv(file: File): Promise<string> {
  const rows = (await readSheet(file, 1)) as SpreadsheetCell[][];
  if (rows.length < 2)
    throw new Error("La hoja debe contener cabeceras y al menos una fila.");
  return spreadsheetRowsToCsv(rows);
}
