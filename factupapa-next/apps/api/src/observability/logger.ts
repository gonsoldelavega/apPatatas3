const maximumValueLength = 240;

function clean(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/[\r\n\u2028\u2029\x00-\x1f]/g, " ").slice(0, maximumValueLength);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

export function log(level: "info" | "warn" | "error", event: Record<string, unknown>): void {
  const safe = Object.fromEntries(Object.entries(event).flatMap(([key, value]) => {
    if (/password|secret|token|cookie|authorization|content|pdf|address|notes/i.test(key)) return [];
    const sanitized = clean(value);
    return sanitized === undefined ? [] : [[key, sanitized]];
  }));
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, ...safe })}\n`);
}

export function normalizePath(pathname: string): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:number")
    .slice(0, 240);
}
