import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { OWNER_ROLE, PARTNER_ROLE } from "../authz/partner-policy.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";

export interface ContactPerson {
  id: string;
  contactId: string;
  name: string;
  role: string | null;
  phone: string | null;
}

export interface ContactPersonInput {
  name?: string;
  role?: string | null;
  phone?: string | null;
}

const PHONE = /^[+\d][\d\s().-]{4,29}$/;

function optional(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maximum) throw new HttpError("invalid_request", 400);
  const text = value.trim();
  return text ? text : null;
}

export function validateContactPerson(body: Record<string, unknown>, partial = false): ContactPersonInput {
  assertAllowedKeys(body, ["name", "role", "phone"], true);
  const result: ContactPersonInput = {};
  if ("name" in body || !partial) {
    const name = optional(body.name, 120);
    if (!name) throw new HttpError("invalid_request", 400);
    result.name = name;
  }
  if ("role" in body) result.role = optional(body.role, 60);
  if ("phone" in body) {
    const phone = optional(body.phone, 30);
    if (phone && !PHONE.test(phone)) throw new HttpError("invalid_request", 400);
    result.phone = phone;
  }
  return result;
}

const columns = `id, contact_id "contactId", name, role, phone`;

/** Pueden ver y editar las personas de contacto el maestro y los socios. */
function requireTeam(identity: SessionIdentity): void {
  if (identity.role !== OWNER_ROLE && identity.role !== PARTNER_ROLE) throw new HttpError("forbidden", 403);
}

/** Personas de contacto de un cliente o proveedor. Maestro y socios. */
export class ContactPeopleService {
  constructor(private readonly pool: Pool) {}

  async list(identity: SessionIdentity, contactId: string): Promise<{ items: ContactPerson[] }> {
    requireTeam(identity);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const exists = await client.query("select 1 from contacts where id = $1", [contactId]);
      if (!exists.rowCount) throw new HttpError("not_found", 404);
      const result = await client.query<ContactPerson>(
        `select ${columns} from contact_people where contact_id = $1 order by position, created_at, id`,
        [contactId],
      );
      return { items: result.rows };
    });
  }

  async create(identity: SessionIdentity, contactId: string, input: ContactPersonInput): Promise<ContactPerson> {
    requireTeam(identity);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const exists = await client.query("select 1 from contacts where id = $1", [contactId]);
      if (!exists.rowCount) throw new HttpError("not_found", 404);
      const count = await client.query<{ n: number }>("select count(*)::int n from contact_people where contact_id = $1", [contactId]);
      if ((count.rows[0]?.n ?? 0) >= 20) throw new HttpError("conflict", 409);
      const result = await client.query<ContactPerson>(
        `insert into contact_people (company_id, contact_id, name, role, phone, position)
         values ($1, $2, $3, $4, $5, $6) returning ${columns}`,
        [identity.companyId, contactId, input.name, input.role ?? null, input.phone ?? null, count.rows[0]?.n ?? 0],
      );
      const person = result.rows[0]!;
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "contact_person",
        entityId: person.id,
        action: "contact_person.created",
        after: { contactId, name: person.name, role: person.role },
      });
      return person;
    });
  }

  async update(identity: SessionIdentity, contactId: string, personId: string, input: ContactPersonInput): Promise<ContactPerson> {
    requireTeam(identity);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, column] of [["name", "name"], ["role", "role"], ["phone", "phone"]] as const) {
        if (key in input) {
          values.push(input[key] ?? null);
          sets.push(`${column} = $${values.length}`);
        }
      }
      if (!sets.length) throw new HttpError("invalid_request", 400);
      values.push(personId, contactId);
      const result = await client.query<ContactPerson>(
        `update contact_people set ${sets.join(", ")} where id = $${values.length - 1} and contact_id = $${values.length} returning ${columns}`,
        values,
      );
      const person = result.rows[0];
      if (!person) throw new HttpError("not_found", 404);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "contact_person",
        entityId: person.id,
        action: "contact_person.updated",
        after: { contactId, name: person.name, role: person.role },
      });
      return person;
    });
  }

  async remove(identity: SessionIdentity, contactId: string, personId: string): Promise<void> {
    requireTeam(identity);
    await withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query("delete from contact_people where id = $1 and contact_id = $2", [personId, contactId]);
      if (!result.rowCount) throw new HttpError("not_found", 404);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "contact_person",
        entityId: personId,
        action: "contact_person.deleted",
        after: { contactId },
      });
    });
  }
}
