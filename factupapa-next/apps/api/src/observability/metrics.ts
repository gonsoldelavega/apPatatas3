import type { Pool } from "pg";

export class Metrics {
  private requests = 0;
  private durationTotalMs = 0;
  private readonly errors = new Map<string, number>();
  private backupFailures = 0;
  private restoreFailures = 0;
  private cleanupRows = 0;
  private activeSessions = 0;
  private readonly importStates = new Map<string, number>();
  private readonly documentStates = new Map<string, number>();

  recordRequest(durationMs: number, errorCode?: string) {
    this.requests += 1;
    this.durationTotalMs += durationMs;
    if (errorCode) this.errors.set(errorCode, (this.errors.get(errorCode) ?? 0) + 1);
  }
  observe(path: string, method: string | undefined, status: number) {
    if (method === "POST" && path === "/auth/login" && status === 200) this.activeSessions += 1;
    if (method === "POST" && path === "/auth/logout" && status === 204) this.activeSessions = Math.max(0, this.activeSessions - 1);
    const move = (states: Map<string, number>, from: string | undefined, to: string) => {
      if (from) states.set(from, Math.max(0, (states.get(from) ?? 0) - 1));
      states.set(to, (states.get(to) ?? 0) + 1);
    };
    if (status === 201 && method === "POST" && path === "/imports/validate") move(this.importStates, undefined, "validated");
    if (status === 200 && method === "POST" && path === "/imports/:id/confirm") move(this.importStates, "validated", "completed");
    if (status === 204 && method === "POST" && path === "/imports/:id/cancel") move(this.importStates, "validated", "cancelled");
    const document = path.startsWith("/invoices") ? "invoice" : path.startsWith("/delivery-notes") ? "delivery_note" : undefined;
    if (document && method === "POST" && status === 201 && !path.endsWith("/lines")) move(this.documentStates, undefined, `${document}.draft`);
    if (document && method === "POST" && status === 200 && path.endsWith("/issue")) move(this.documentStates, `${document}.draft`, `${document}.issued`);
    if (document && method === "POST" && status === 200 && path.endsWith("/cancel")) move(this.documentStates, `${document}.issued`, `${document}.cancelled`);
  }
  increment(name: "backupFailures" | "restoreFailures" | "cleanupRows", amount = 1) { this[name] += amount; }
  async snapshot(pool?: Pool) {
    let sessions = 0;
    let imports: Record<string, number> = {};
    let documents: Record<string, number> = {};
    if (pool) {
      const [sessionResult, importResult, invoiceResult, noteResult] = await Promise.all([
        pool.query<{ count: number }>("select count(*)::int as count from auth_sessions where revoked_at is null and expires_at > now()"),
        pool.query<{ status: string; count: number }>("select status, count(*)::int as count from import_batches group by status"),
        pool.query<{ status: string; count: number }>("select status, count(*)::int as count from invoices group by status"),
        pool.query<{ status: string; count: number }>("select status, count(*)::int as count from delivery_notes group by status"),
      ]);
      sessions = sessionResult.rows[0]?.count ?? 0;
      imports = Object.fromEntries(importResult.rows.map((row) => [row.status, row.count]));
      documents = Object.fromEntries([...invoiceResult.rows.map((row) => [`invoice.${row.status}`, row.count] as const), ...noteResult.rows.map((row) => [`delivery_note.${row.status}`, row.count] as const)]);
    }
    return {
      requestsTotal: this.requests,
      errorsByCode: Object.fromEntries(this.errors),
      durationMs: { total: Math.round(this.durationTotalMs), average: this.requests ? Math.round(this.durationTotalMs / this.requests) : 0 },
      approximateActiveSessions: sessions || this.activeSessions,
      importsByStatus: Object.keys(imports).length ? imports : Object.fromEntries(this.importStates),
      documentsByStatus: Object.keys(documents).length ? documents : Object.fromEntries(this.documentStates),
      backupFailures: this.backupFailures,
      restoreFailures: this.restoreFailures,
      importCleanupRows: this.cleanupRows,
    };
  }
}

export const metrics = new Metrics();
