import type { Pool, PoolClient } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { OWNER_ROLE } from "../authz/partner-policy.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";

export interface CompanyProfile {
  name: string;
  taxId: string | null;
  email: string | null;
  website: string | null;
  address: Record<string, string>;
}

export interface CompanyProfileInput {
  email?: string | null;
  website?: string | null;
  address?: { street: string; postalCode: string; city: string };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalLine(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maximum) throw new HttpError("invalid_request", 400);
  const text = value.trim();
  return text ? text : null;
}

function requiredLine(value: unknown, maximum: number): string {
  const text = optionalLine(value, maximum);
  if (!text) throw new HttpError("invalid_request", 400);
  return text;
}

export function validateCompanyProfile(body: Record<string, unknown>): CompanyProfileInput {
  assertAllowedKeys(body, ["email", "website", "address"], true);
  const result: CompanyProfileInput = {};
  if (body.email !== undefined) {
    const email = optionalLine(body.email, 320);
    if (email !== null && !EMAIL.test(email)) throw new HttpError("invalid_request", 400);
    result.email = email ? email.toLowerCase() : null;
  }
  if (body.website !== undefined) {
    const website = optionalLine(body.website, 200);
    if (website !== null && /\s/.test(website)) throw new HttpError("invalid_request", 400);
    result.website = website;
  }
  if (body.address !== undefined) {
    if (!body.address || typeof body.address !== "object" || Array.isArray(body.address)) {
      throw new HttpError("invalid_request", 400);
    }
    const address = body.address as Record<string, unknown>;
    assertAllowedKeys(address, ["street", "postalCode", "city"]);
    result.address = {
      street: requiredLine(address.street, 120),
      postalCode: requiredLine(address.postalCode, 10),
      city: requiredLine(address.city, 80),
    };
  }
  return result;
}

/** Ficha del emisor de las facturas. Solo la edita el usuario maestro. */
export class CompanyService {
  constructor(private readonly pool: Pool) {}

  async get(identity: SessionIdentity): Promise<CompanyProfile> {
    return withTenantTransaction(this.pool, identity, (client) => this.read(client, identity));
  }

  /** Lee la ficha con la conexión dada (así ve los cambios aún no confirmados de la misma transacción). */
  private async read(client: PoolClient, identity: SessionIdentity): Promise<CompanyProfile> {
    const row = (
      await client.query<CompanyProfile>(
        `select name, tax_id "taxId", email, website, address from companies where id = $1`,
        [identity.companyId],
      )
    ).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    return row;
  }

  async update(identity: SessionIdentity, input: CompanyProfileInput): Promise<CompanyProfile> {
    if (identity.role !== OWNER_ROLE) throw new HttpError("forbidden", 403);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [identity.companyId];
      if (input.email !== undefined) {
        values.push(input.email);
        sets.push(`email = $${values.length}`);
      }
      if (input.website !== undefined) {
        values.push(input.website);
        sets.push(`website = $${values.length}`);
      }
      if (input.address !== undefined) {
        // Se conservan otras claves que ya tuviera la dirección (p. ej. país o provincia).
        values.push(JSON.stringify(input.address));
        sets.push(`address = address || $${values.length}::jsonb`);
      }
      if (!sets.length) throw new HttpError("invalid_request", 400);
      await client.query(`update companies set ${sets.join(", ")} where id = $1`, values);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "company",
        entityId: identity.companyId,
        action: "company.profile_updated",
        after: input,
      });
      return this.read(client, identity);
    });
  }
}
