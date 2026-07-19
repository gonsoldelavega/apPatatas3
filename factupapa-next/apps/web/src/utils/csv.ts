export function safeCsvCell(value: string): string {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized;
}

export function csvBody(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => safeCsvCell(cell)).join(";"))
    .join("\r\n");
}
