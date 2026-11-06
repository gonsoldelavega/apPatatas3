import type { Pool, PoolClient } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys, isoDate } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { OWNER_ROLE } from "../authz/partner-policy.js";
import { actorName, limitValue, optionalTextValue, positiveDecimal, sideValue, textValue, todayIso } from "./common.js";
import { computeBalance, emptyTotals, fromCents, toCents, type Side, type SideTotals } from "./ledger-math.js";

export type LedgerKind = "expense" | "income" | "settlement";
const KINDS: readonly LedgerKind[] = ["expense", "income", "settlement"];

export interface LedgerEntry {
  id: string;
  entryDate: string;
  kind: LedgerKind;
  side: Side;
  amount: string;
  concept: string;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  /** El propio creador o el usuario maestro pueden editarla o borrarla. */
  canEdit: boolean;
}

export interface LedgerSettings {
  sideAName: string;
  sideBName: string;
}

const DEFAULT_SETTINGS: LedgerSettings = { sideAName: "Irene y Nando", sideBName: "Roberto y Gemma" };

const entryProjection = `id, entry_date::text "entryDate", kind, side, amount::text amount, concept, notes,
  created_by_name "createdByName", created_at::text "createdAt", created_by_user_id "createdByUserId"`;

interface EntryRow extends Omit<LedgerEntry, "canEdit"> {
  createdByUserId: string;
}

const toEntry = (identity: SessionIdentity, row: EntryRow): LedgerEntry => {
  const { createdByUserId, ...rest } = row;
  return { ...rest, canEdit: identity.role === OWNER_ROLE || createdByUserId === identity.userId };
};

export interface EntryInput {
  entryDate?: string;
  kind?: LedgerKind;
  side?: Side;
  amount?: string;
  concept?: string;
  notes?: string | null | undefined;
}

export function validateEntry(body: Record<string, unknown>, partial: boolean): EntryInput {
  assertAllowedKeys(body, ["entryDate", "kind", "side", "amount", "concept", "notes"], partial);
  const result: EntryInput = {};
  const date = isoDate(body.entryDate);
  if (date !== undefined) result.entryDate = date;
  if (body.kind !== undefined || !partial) {
    if (typeof body.kind !== "string" || !KINDS.includes(body.kind as LedgerKind)) throw new HttpError("invalid_request", 400);
    result.kind = body.kind as LedgerKind;
  }
  if (body.side !== undefined || !partial) result.side = sideValue(body.side);
  if (body.amount !== undefined || !partial) result.amount = positiveDecimal(body.amount, 12, 2);
  if (body.concept !== undefined || !partial) result.concept = textValue(body.concept, 200);
  const notes = optionalTextValue(body.notes, 2000);
  if (notes !== undefined) result.notes = notes;
  return result;
}

function periodFilter(url: URL): { clause: string; values: string[] } {
  const from = isoDate(url.searchParams.get("from") ?? undefined);
  const to = isoDate(url.searchParams.get("to") ?? undefined);
  const parts: string[] = [];
  const values: string[] = [];
  if (from) {
    values.push(from);
    parts.push(`entry_date >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    parts.push(`entry_date <= $${values.length}`);
  }
  return { clause: parts.length ? ` and ${parts.join(" and ")}` : "", values };
}

export class LedgerService {
  constructor(private readonly pool: Pool) {}

  async settings(identity: SessionIdentity): Promise<LedgerSettings> {
    return withTenantTransaction(this.pool, identity, (client) => this.readSettings(client, identity));
  }

  async saveSettings(identity: SessionIdentity, input: LedgerSettings): Promise<LedgerSettings> {
    if (identity.role !== OWNER_ROLE) throw new HttpError("forbidden", 403);
    return withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(
        `insert into shared_ledger_settings (company_id, side_a_name, side_b_name, updated_by_user_id)
         values ($1, $2, $3, $4)
         on conflict (company_id) do update set side_a_name = excluded.side_a_name, side_b_name = excluded.side_b_name,
           updated_by_user_id = excluded.updated_by_user_id`,
        [identity.companyId, input.sideAName, input.sideBName, identity.userId],
      );
      return this.readSettings(client, identity);
    });
  }

  async list(identity: SessionIdentity, url: URL): Promise<{ items: LedgerEntry[] }> {
    const period = periodFilter(url);
    const values: unknown[] = [...period.values];
    const where = [`deleted_at is null${period.clause}`];
    const kind = url.searchParams.get("kind");
    if (kind) {
      if (!KINDS.includes(kind as LedgerKind)) throw new HttpError("invalid_request", 400);
      values.push(kind);
      where.push(`kind = $${values.length}`);
    }
    const side = url.searchParams.get("side");
    if (side) {
      values.push(sideValue(side));
      where.push(`side = $${values.length}`);
    }
    values.push(limitValue(url, 200, 1000));
    return withTenantTransaction(this.pool, identity, async (client) => ({
      items: (
        await client.query<EntryRow>(
          `select ${entryProjection} from shared_ledger_entries where ${where.join(" and ")}
           order by entry_date desc, created_at desc limit $${values.length}`,
          values,
        )
      ).rows.map((row) => toEntry(identity, row)),
    }));
  }

  /** Balance acumulado (quién debe a quién) y totales del periodo pedido (por defecto, todo). */
  async summary(identity: SessionIdentity, url: URL) {
    const period = periodFilter(url);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const settings = await this.readSettings(client, identity);
      const all = await this.totals(client, "", []);
      const scoped = period.clause ? await this.totals(client, period.clause, period.values) : all;
      const balance = computeBalance(all.side_a, all.side_b);
      const name = (side: Side | null) => (side === "side_a" ? settings.sideAName : side === "side_b" ? settings.sideBName : null);
      const render = (totals: SideTotals) => ({
        expenses: fromCents(totals.expenseCents),
        income: fromCents(totals.incomeCents),
        settlements: fromCents(totals.settlementCents),
      });
      const expensesCents = scoped.side_a.expenseCents + scoped.side_b.expenseCents;
      const incomeCents = scoped.side_a.incomeCents + scoped.side_b.incomeCents;
      return {
        sideNames: { side_a: settings.sideAName, side_b: settings.sideBName },
        balance: {
          debtorSide: balance.debtor,
          creditorSide: balance.creditor,
          debtorName: name(balance.debtor),
          creditorName: name(balance.creditor),
          amount: fromCents(balance.cents),
        },
        totals: { side_a: render(scoped.side_a), side_b: render(scoped.side_b) },
        result: {
          expenses: fromCents(expensesCents),
          income: fromCents(incomeCents),
          net: fromCents(incomeCents - expensesCents),
        },
      };
    });
  }

  async create(identity: SessionIdentity, input: EntryInput): Promise<LedgerEntry> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const created = await client.query<{ id: string }>(
        `insert into shared_ledger_entries (company_id, entry_date, kind, side, amount, concept, notes, created_by_user_id, created_by_name)
         values ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9) returning id`,
        [
          identity.companyId,
          input.entryDate ?? todayIso(),
          input.kind,
          input.side,
          input.amount,
          input.concept,
          input.notes ?? null,
          identity.userId,
          actorName(identity),
        ],
      );
      const id = created.rows[0]!.id;
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "shared_ledger_entry",
        entityId: id,
        action: "ledger.entry_created",
        after: input,
      });
      return this.one(client, identity, id);
    });
  }

  async update(identity: SessionIdentity, id: string, input: EntryInput): Promise<LedgerEntry> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const current = await this.requireEditable(client, identity, id);
      const sets: string[] = [];
      const values: unknown[] = [id];
      const add = (column: string, value: unknown, cast = "") => {
        values.push(value);
        sets.push(`${column} = $${values.length}${cast}`);
      };
      if (input.entryDate !== undefined) add("entry_date", input.entryDate);
      if (input.kind !== undefined) add("kind", input.kind);
      if (input.side !== undefined) add("side", input.side);
      if (input.amount !== undefined) add("amount", input.amount, "::numeric");
      if (input.concept !== undefined) add("concept", input.concept);
      if (input.notes !== undefined) add("notes", input.notes);
      if (!sets.length) throw new HttpError("invalid_request", 400);
      await client.query(`update shared_ledger_entries set ${sets.join(", ")} where id = $1`, values);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "shared_ledger_entry",
        entityId: id,
        action: "ledger.entry_updated",
        before: current,
        after: input,
      });
      return this.one(client, identity, id);
    });
  }

  async remove(identity: SessionIdentity, id: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      const current = await this.requireEditable(client, identity, id);
      await client.query("update shared_ledger_entries set deleted_at = now(), deleted_by_name = $2 where id = $1", [id, actorName(identity)]);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "shared_ledger_entry",
        entityId: id,
        action: "ledger.entry_deleted",
        before: current,
      });
    });
  }

  /** "Saldar cuentas": registra el pago exacto que deja el balance a cero. */
  async settle(identity: SessionIdentity, notes: string | null): Promise<LedgerEntry> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 7))", [`ledger:${identity.companyId}`]);
      const totals = await this.totals(client, "", []);
      const balance = computeBalance(totals.side_a, totals.side_b);
      if (!balance.debtor) throw new HttpError("conflict", 409);
      const created = await client.query<{ id: string }>(
        `insert into shared_ledger_entries (company_id, entry_date, kind, side, amount, concept, notes, created_by_user_id, created_by_name)
         values ($1, $2, 'settlement', $3, $4::numeric, 'Liquidación de cuentas', $5, $6, $7) returning id`,
        [identity.companyId, todayIso(), balance.debtor, fromCents(balance.cents), notes, identity.userId, actorName(identity)],
      );
      const id = created.rows[0]!.id;
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "shared_ledger_entry",
        entityId: id,
        action: "ledger.settled",
        after: { payer: balance.debtor, amount: fromCents(balance.cents) },
      });
      return this.one(client, identity, id);
    });
  }

  private async readSettings(client: PoolClient, identity: SessionIdentity): Promise<LedgerSettings> {
    const row = (
      await client.query<LedgerSettings>(
        `select side_a_name "sideAName", side_b_name "sideBName" from shared_ledger_settings where company_id = $1`,
        [identity.companyId],
      )
    ).rows[0];
    return row ?? DEFAULT_SETTINGS;
  }

  private async totals(client: PoolClient, clause: string, values: string[]): Promise<Record<Side, SideTotals>> {
    const rows = (
      await client.query<{ kind: LedgerKind; side: Side; total: string }>(
        `select kind, side, coalesce(sum(amount), 0)::text total from shared_ledger_entries
          where deleted_at is null${clause} group by kind, side`,
        values,
      )
    ).rows;
    const result: Record<Side, SideTotals> = { side_a: emptyTotals(), side_b: emptyTotals() };
    for (const row of rows) {
      const cents = toCents(row.total);
      const bucket = result[row.side];
      if (row.kind === "expense") bucket.expenseCents += cents;
      else if (row.kind === "income") bucket.incomeCents += cents;
      else bucket.settlementCents += cents;
    }
    return result;
  }

  private async requireEditable(client: PoolClient, identity: SessionIdentity, id: string): Promise<EntryRow> {
    const row = (
      await client.query<EntryRow>(`select ${entryProjection} from shared_ledger_entries where id = $1 and deleted_at is null for update`, [id])
    ).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    if (identity.role !== OWNER_ROLE && row.createdByUserId !== identity.userId) throw new HttpError("forbidden", 403);
    return row;
  }

  private async one(client: PoolClient, identity: SessionIdentity, id: string): Promise<LedgerEntry> {
    const row = (await client.query<EntryRow>(`select ${entryProjection} from shared_ledger_entries where id = $1`, [id])).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    return toEntry(identity, row);
  }
}
