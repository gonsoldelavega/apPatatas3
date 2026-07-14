import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { hashPassword } from "./password.js";
import { createDatabaseProbe } from "../database/client.js";

interface BootstrapInput {
  companyName: string;
  email: string;
  displayName: string;
  password: string;
}

function validateInput(input: BootstrapInput): BootstrapInput {
  const normalized = {
    ...input,
    companyName: input.companyName.trim(),
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim(),
  };
  if (normalized.companyName.length < 2 || normalized.companyName.length > 120) {
    throw new Error("BOOTSTRAP_COMPANY_NAME debe tener entre 2 y 120 caracteres");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw new Error("BOOTSTRAP_USER_EMAIL no es válido");
  }
  if (normalized.displayName.length < 2 || normalized.displayName.length > 120) {
    throw new Error("BOOTSTRAP_USER_NAME debe tener entre 2 y 120 caracteres");
  }
  return normalized;
}

export async function bootstrapInitialAccount(pool: Pool, rawInput: BootstrapInput): Promise<void> {
  const input = validateInput(rawInput);
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [1_407_202_027]);
    const existing = await client.query<{ companies: string; users: string }>(
      "select (select count(*) from companies)::text as companies, (select count(*) from users)::text as users",
    );
    if (existing.rows[0]?.companies !== "0" || existing.rows[0]?.users !== "0") {
      throw new Error("Bootstrap rechazado: ya existe una empresa o un usuario");
    }
    const company = await client.query<{ id: string }>("insert into companies(name) values ($1) returning id", [
      input.companyName,
    ]);
    const user = await client.query<{ id: string }>(
      "insert into users(email, display_name, password_hash) values ($1, $2, $3) returning id",
      [input.email, input.displayName, passwordHash],
    );
    const companyId = company.rows[0]?.id;
    const userId = user.rows[0]?.id;
    if (!companyId || !userId) throw new Error("No se pudo crear la cuenta inicial");
    await client.query("insert into memberships(company_id, user_id, role) values ($1, $2, 'owner')", [
      companyId,
      userId,
    ]);
    await client.query(
      `insert into audit_events(company_id, actor_user_id, entity_type, entity_id, action)
       values ($1, $2::uuid, 'auth', $2::uuid::text, 'auth.bootstrap_completed')`,
      [companyId, userId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_ADMIN_URL;
  if (!databaseUrl) throw new Error("DATABASE_ADMIN_URL es obligatoria");
  const required = ["BOOTSTRAP_COMPANY_NAME", "BOOTSTRAP_USER_EMAIL", "BOOTSTRAP_USER_NAME", "BOOTSTRAP_USER_PASSWORD"] as const;
  for (const name of required) {
    if (!process.env[name]) throw new Error(`${name} es obligatoria`);
  }
  const database = createDatabaseProbe(databaseUrl);
  try {
    await bootstrapInitialAccount(database.pool, {
      companyName: process.env.BOOTSTRAP_COMPANY_NAME!,
      email: process.env.BOOTSTRAP_USER_EMAIL!,
      displayName: process.env.BOOTSTRAP_USER_NAME!,
      password: process.env.BOOTSTRAP_USER_PASSWORD!,
    });
    console.log("Bootstrap inicial completado");
  } finally {
    await database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Bootstrap fallido");
    process.exitCode = 1;
  });
}
