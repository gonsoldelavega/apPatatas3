import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";
import { parseImport } from "./parser.js";
import { ImportRepository } from "./repository.js";
import type { ImportBatchDetail, ImportLimits, ImportStrategy, ValidateImportInput } from "./types.js";
import { checksum, normalizeRows, safePreview } from "./validation.js";

function preview(detail: ImportBatchDetail, reused = false) {
  return {
    ...detail,
    reused,
    rows: detail.rows.map((row) => ({ ...row, normalizedData: safePreview(row.normalizedData) })),
  };
}

export class ImportService {
  constructor(
    private readonly pool: Pool,
    readonly limits: ImportLimits,
    private readonly repository = new ImportRepository(),
  ) {}

  async validate(identity: SessionIdentity, input: ValidateImportInput) {
    const parsed = parseImport(input, this.limits);
    const digest = checksum(input.entityType, input.sourceFormat, parsed.bytes);
    const normalized = normalizeRows(input.entityType, input.sourceFormat, parsed.rows);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const existing = await this.repository.findByChecksum(client, input.entityType, digest);
      if (existing && existing.status !== "cancelled" && existing.status !== "failed") {
        const detail = await this.repository.detail(client, existing.id, this.limits.previewRows);
        if (!detail) throw new HttpError("not_found", 404);
        return preview(detail, true);
      }
      await this.repository.classify(client, input.entityType, normalized);
      const batch = await this.repository.createBatch(client, {
        companyId: identity.companyId,
        userId: identity.userId,
        entityType: input.entityType,
        sourceFormat: input.sourceFormat,
        checksum: digest,
        rows: normalized,
      });
      await recordAudit(client, {
        companyId: identity.companyId, actorUserId: identity.userId, entityType: "import_batch", entityId: batch.id,
        action: "import.validated", after: { entityType: batch.entityType, sourceFormat: batch.sourceFormat, ...batch.validationSummary },
      });
      const detail = await this.repository.detail(client, batch.id, this.limits.previewRows);
      if (!detail) throw new HttpError("not_found", 404);
      return preview(detail);
    });
  }

  async list(identity: SessionIdentity, page: number, pageSize: number) {
    return withTenantTransaction(this.pool, identity, (client) => this.repository.list(client, page, pageSize));
  }

  async get(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const detail = await this.repository.detail(client, id, this.limits.previewRows);
      if (!detail) throw new HttpError("not_found", 404);
      return preview(detail);
    });
  }

  async confirm(identity: SessionIdentity, id: string, strategy: ImportStrategy) {
    try {
      return await withTenantTransaction(this.pool, identity, async (client) => {
        const batch = await this.repository.detail(client, id, 0, true);
        if (!batch) throw new HttpError("not_found", 404);
        if (batch.status !== "validated") throw new HttpError("conflict", 409);
        if (batch.invalidRows > 0) throw new HttpError("invalid_request", 400);
        const rows = await this.repository.allRows(client, id);
        if (strategy === "fail_on_conflict" && rows.some((row) => row.classification === "possible_update")) {
          throw new HttpError("conflict", 409);
        }
        await this.repository.markImporting(client, id);
        const result = await this.repository.apply(client, identity.companyId, batch.entityType, rows, strategy);
        await this.repository.complete(client, id, result);
        await recordAudit(client, {
          companyId: identity.companyId, actorUserId: identity.userId, entityType: "import_batch", entityId: id,
          action: "import.confirmed", before: { status: "validated" }, after: { status: "completed", strategy, ...result },
        });
        return { id, status: "completed", strategy, ...result };
      });
    } catch (error) {
      if (!(error instanceof HttpError)) {
        await withTenantTransaction(this.pool, identity, async (client) => {
          if (await this.repository.fail(client, id)) {
            await recordAudit(client, {
              companyId: identity.companyId, actorUserId: identity.userId, entityType: "import_batch", entityId: id,
              action: "import.failed", after: { status: "failed", reason: "transaction_rolled_back" },
            });
          }
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  async cancel(identity: SessionIdentity, id: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      const before = await this.repository.detail(client, id, 0, true);
      if (!before) throw new HttpError("not_found", 404);
      if (!(await this.repository.cancel(client, id))) throw new HttpError("conflict", 409);
      await recordAudit(client, {
        companyId: identity.companyId, actorUserId: identity.userId, entityType: "import_batch", entityId: id,
        action: "import.cancelled", before: { status: before.status }, after: { status: "cancelled" },
      });
    });
  }
}
