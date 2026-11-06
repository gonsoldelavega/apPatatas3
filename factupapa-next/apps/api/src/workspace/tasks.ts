import type { Pool, PoolClient } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import {
  actorName,
  limitValue,
  optionalDate,
  optionalTextValue,
  optionalUuid,
  sideValue,
  textValue,
} from "./common.js";

export interface Task {
  id: string;
  title: string;
  details: string | null;
  contactId: string | null;
  contactName: string | null;
  assignedSide: "side_a" | "side_b" | null;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
  doneByName: string | null;
  createdByName: string;
  createdAt: string;
}

const projection = `t.id, t.title, t.details, t.contact_id "contactId", coalesce(c.trade_name, c.legal_name) "contactName",
  t.assigned_side "assignedSide", t.due_date::text "dueDate", (t.done_at is not null) done,
  t.done_at::text "doneAt", t.done_by_name "doneByName", t.created_by_name "createdByName", t.created_at::text "createdAt"`;
const source = `shared_tasks t left join contacts c on c.company_id = t.company_id and c.id = t.contact_id`;

export interface TaskInput {
  title?: string;
  details?: string | null | undefined;
  contactId?: string | null | undefined;
  assignedSide?: "side_a" | "side_b" | null;
  dueDate?: string | null | undefined;
}

export function validateTask(body: Record<string, unknown>, partial: boolean): TaskInput {
  assertAllowedKeys(body, ["title", "details", "contactId", "assignedSide", "dueDate"], partial);
  const result: TaskInput = {};
  if (body.title !== undefined || !partial) result.title = textValue(body.title, 200);
  const details = optionalTextValue(body.details, 4000);
  if (details !== undefined) result.details = details;
  const contactId = optionalUuid(body.contactId);
  if (contactId !== undefined) result.contactId = contactId;
  if (body.assignedSide !== undefined) result.assignedSide = body.assignedSide === null ? null : sideValue(body.assignedSide);
  const dueDate = optionalDate(body.dueDate);
  if (dueDate !== undefined) result.dueDate = dueDate;
  return result;
}

export class TasksService {
  constructor(private readonly pool: Pool) {}

  async list(identity: SessionIdentity, url: URL): Promise<{ items: Task[] }> {
    const status = url.searchParams.get("status") ?? "open";
    if (!["open", "done", "all"].includes(status)) throw new HttpError("invalid_request", 400);
    const where = ["t.deleted_at is null"];
    if (status === "open") where.push("t.done_at is null");
    if (status === "done") where.push("t.done_at is not null");
    return withTenantTransaction(this.pool, identity, async (client) => ({
      items: (
        await client.query<Task>(
          `select ${projection} from ${source} where ${where.join(" and ")}
           order by (t.done_at is not null), t.due_date nulls last, t.created_at desc limit $1`,
          [limitValue(url, 200, 500)],
        )
      ).rows,
    }));
  }

  async create(identity: SessionIdentity, input: TaskInput): Promise<Task> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const created = await client.query<{ id: string }>(
        `insert into shared_tasks (company_id, title, details, contact_id, assigned_side, due_date, created_by_user_id, created_by_name)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [
          identity.companyId,
          input.title,
          input.details ?? null,
          input.contactId ?? null,
          input.assignedSide ?? null,
          input.dueDate ?? null,
          identity.userId,
          actorName(identity),
        ],
      );
      return this.one(client, created.rows[0]!.id);
    });
  }

  async update(identity: SessionIdentity, id: string, input: TaskInput): Promise<Task> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [id];
      const add = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (input.title !== undefined) add("title", input.title);
      if (input.details !== undefined) add("details", input.details);
      if (input.contactId !== undefined) add("contact_id", input.contactId);
      if (input.assignedSide !== undefined) add("assigned_side", input.assignedSide);
      if (input.dueDate !== undefined) add("due_date", input.dueDate);
      if (!sets.length) throw new HttpError("invalid_request", 400);
      const result = await client.query(
        `update shared_tasks set ${sets.join(", ")} where id = $1 and deleted_at is null`,
        values,
      );
      if (!result.rowCount) throw new HttpError("not_found", 404);
      return this.one(client, id);
    });
  }

  async setDone(identity: SessionIdentity, id: string, done: boolean): Promise<Task> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const result = done
        ? await client.query(
            "update shared_tasks set done_at = coalesce(done_at, now()), done_by_name = coalesce(done_by_name, $2) where id = $1 and deleted_at is null",
            [id, actorName(identity)],
          )
        : await client.query(
            "update shared_tasks set done_at = null, done_by_name = null where id = $1 and deleted_at is null",
            [id],
          );
      if (!result.rowCount) throw new HttpError("not_found", 404);
      return this.one(client, id);
    });
  }

  async remove(identity: SessionIdentity, id: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query("update shared_tasks set deleted_at = now() where id = $1 and deleted_at is null", [id]);
      if (!result.rowCount) throw new HttpError("not_found", 404);
    });
  }

  private async one(client: PoolClient, id: string): Promise<Task> {
    const row = (await client.query<Task>(`select ${projection} from ${source} where t.id = $1`, [id])).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    return row;
  }
}
