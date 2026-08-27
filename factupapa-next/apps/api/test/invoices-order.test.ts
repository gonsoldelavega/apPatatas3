import assert from "node:assert/strict";
import { test } from "node:test";
import { InvoiceRepository } from "../src/invoices/repository.js";

test("lista facturas por año y número fiscal descendentes", async () => {
  const queries: string[] = [];
  const client = {
    async query<T>(sql: string) {
      queries.push(sql);
      if (sql.includes("count(*)")) return { rows: [{ total: 2 }] } as never as { rows: T[] };
      return { rows: [] } as never as { rows: T[] };
    },
  } as never;
  const result = await new InvoiceRepository().list(client, new URL("https://staging.test/invoices?pageSize=25"));
  assert.equal(result.total, 2);
  const listing = queries.find((query) => query.includes("select id"));
  assert.ok(listing);
  assert.match(listing, /extract\(year from issue_date\) desc/);
  assert.match(listing, /number desc nulls last/);
  assert.match(listing, /issue_date desc, created_at desc, id desc/);
});
