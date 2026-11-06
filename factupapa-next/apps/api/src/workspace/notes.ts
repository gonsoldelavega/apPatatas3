import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { actorName, limitValue, optionalTextValue, optionalUuid, textValue, uuidValue } from "./common.js";

export interface Note {
  id: string;
  contactId: string | null;
  contactName: string | null;
  title: string;
  body: string;
  pinned: boolean;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

const projection = `n.id, n.contact_id "contactId", coalesce(c.trade_name, c.legal_name) "contactName", n.title, n.body,
  n.pinned, n.created_by_name "createdByName", n.updated_by_name "updatedByName",
  n.created_at::text "createdAt", n.updated_at::text "updatedAt"`;
const source = `shared_notes n left join contacts c on c.company_id = n.company_id and c.id = n.contact_id`;

export interface NoteInput {
  contactId?: string | null | undefined;
  title?: string;
  body?: string | null | undefined;
  pinned?: boolean;
}

export function validateNote(body: Record<string, unknown>, partial: boolean): NoteInput {
  assertAllowedKeys(body, ["contactId", "title", "body", "pinned"], partial);
  const result: NoteInput = {};
  if (body.title !== undefined || !partial) result.title = textValue(body.title, 200);
  const contactId = optionalUuid(body.contactId);
  if (contactId !== undefined) result.contactId = contactId;
  const text = optionalTextValue(body.body, 8000);
  if (text !== undefined) result.body = text;
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") throw new HttpError("invalid_request", 400);
    result.pinned = body.pinned;
  }
  return result;
}

export class NotesService {
  constructor(private readonly pool: Pool) {}

  async list(identity: SessionIdentity, url: URL): Promise<{ items: Note[] }> {
    const contactId = url.searchParams.get("contactId");
    const search = url.searchParams.get("search")?.trim();
    const values: unknown[] = [];
    const where = ["n.archived_at is null"];
    if (contactId) {
      values.push(uuidValue(contactId));
      where.push(`n.contact_id = $${values.length}`);
    }
    if (search) {
      values.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
      where.push(`concat_ws(' ', n.title, n.body, c.legal_name, c.trade_name) ilike $${values.length}`);
    }
    values.push(limitValue(url, 200, 500));
    return withTenantTransaction(this.pool, identity, async (client) => ({
      items: (
        await client.query<Note>(
          `select ${projection} from ${source} where ${where.join(" and ")}
           order by n.pinned desc, n.updated_at desc limit $${values.length}`,
          values,
        )
      ).rows,
    }));
  }

  async create(identity: SessionIdentity, input: NoteInput): Promise<Note> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const name = actorName(identity);
      const created = await client.query<{ id: string }>(
        `insert into shared_notes (company_id, contact_id, title, body, pinned, created_by_user_id, created_by_name, updated_by_name)
         values ($1, $2, $3, $4, $5, $6, $7, $7) returning id`,
        [identity.companyId, input.contactId ?? null, input.title, input.body ?? "", input.pinned ?? false, identity.userId, name],
      );
      return this.one(client, created.rows[0]!.id);
    });
  }

  async update(identity: SessionIdentity, id: string, input: NoteInput): Promise<Note> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const sets: string[] = ["updated_by_name = $2"];
      const values: unknown[] = [id, actorName(identity)];
      const add = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (input.title !== undefined) add("title", input.title);
      if (input.body !== undefined) add("body", input.body ?? "");
      if (input.pinned !== undefined) add("pinned", input.pinned);
      if (input.contactId !== undefined) add("contact_id", input.contactId);
      const result = await client.query(
        `update shared_notes set ${sets.join(", ")} where id = $1 and archived_at is null`,
        values,
      );
      if (!result.rowCount) throw new HttpError("not_found", 404);
      return this.one(client, id);
    });
  }

  async archive(identity: SessionIdentity, id: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query(
        "update shared_notes set archived_at = now(), updated_by_name = $2 where id = $1 and archived_at is null",
        [id, actorName(identity)],
      );
      if (!result.rowCount) throw new HttpError("not_found", 404);
    });
  }

  private async one(client: import("pg").PoolClient, id: string): Promise<Note> {
    const row = (await client.query<Note>(`select ${projection} from ${source} where n.id = $1`, [id])).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    return row;
  }
}
