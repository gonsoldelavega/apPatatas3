import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import type { RegistrySyncResult } from "./service.js";

export interface RegistrySyncTarget {
  companyId: string;
  userId: string;
  email: string;
  displayName: string;
  companyName: string;
}

/** Una pasada por empresa (la primera persona propietaria de cada una). */
export async function loadRegistrySyncTargets(pool: Pool): Promise<RegistrySyncTarget[]> {
  const result = await pool.query<{ company_id: string; user_id: string; email: string; display_name: string; company_name: string }>(
    "select * from registry_sync_targets()",
  );
  const seen = new Set<string>();
  const targets: RegistrySyncTarget[] = [];
  for (const row of result.rows) {
    if (seen.has(row.company_id)) continue;
    seen.add(row.company_id);
    targets.push({ companyId: row.company_id, userId: row.user_id, email: row.email, displayName: row.display_name, companyName: row.company_name });
  }
  return targets;
}

export interface AutoSyncDeps {
  targets(): Promise<RegistrySyncTarget[]>;
  sync(identity: SessionIdentity): Promise<RegistrySyncResult>;
  record(result: RegistrySyncResult | { error: string }): void;
  log(level: "info" | "warn" | "error", fields: Record<string, unknown>): void;
}

/**
 * Importa el Registro Maestro con la misma regla que el botón de Gastos (idempotente y sin duplicados), sin
 * que nadie tenga que pulsarlo. Nunca se solapan dos pasadas.
 */
export function createRegistryAutoSync(deps: AutoSyncDeps): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      for (const target of await deps.targets()) {
        const identity: SessionIdentity = {
          userId: target.userId,
          companyId: target.companyId,
          email: target.email,
          displayName: target.displayName,
          companyName: target.companyName,
          role: "owner",
          familyId: "00000000-0000-4000-8000-000000000000",
        };
        try {
          const result = await deps.sync(identity);
          deps.record(result);
          deps.log("info", {
            event: "purchase_registry.auto_sync",
            imported: result.imported,
            drafts: result.drafts,
            skipped: result.skipped,
            incomplete: result.incomplete.length,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "error";
          deps.record({ error: message });
          deps.log("warn", { event: "purchase_registry.auto_sync_failed", error: message });
        }
      }
    } catch (error) {
      deps.log("warn", { event: "purchase_registry.auto_sync_failed", error: error instanceof Error ? error.message : "error" });
    } finally {
      running = false;
    }
  };
}
