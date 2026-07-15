import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import type { SessionIdentity } from "../../src/auth/repository.js";
import {
  createDatabaseProbe,
  withTenantTransaction,
  type Database,
} from "../../src/database/client.js";
import { DeliveryNoteService } from "../../src/delivery-notes/service.js";
import { InvoiceService } from "../../src/invoices/service.js";
import { HttpError } from "../../src/http/errors.js";

const adminUrl = process.env.DATABASE_ADMIN_URL,
  apiUrl = process.env.DATABASE_URL;
let admin: Database,
  api: Database,
  identity: SessionIdentity,
  other: SessionIdentity,
  customerId: string,
  productId: string;
let delivery: DeliveryNoteService, invoices: InvoiceService;

async function createIssuedNote(series: string) {
  const note = await delivery.create(identity, {
    contactId: customerId,
    series,
    issueDate: "2026-07-15",
  });
  await delivery.addLine(identity, note!.id, { productId, quantity: "1" });
  return (await delivery.issue(identity, note!.id))!;
}

async function createIssuedInvoice(noteIds: string[], series: string) {
  const invoice = await invoices.fromDeliveryNotes(identity, {
    deliveryNoteIds: noteIds,
    series,
    issueDate: "2026-07-15",
  });
  return (await invoices.issue(identity, invoice!.id))!;
}

before(async () => {
  assert.ok(adminUrl && apiUrl);
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(apiUrl);
  await admin.pool.query(
    "truncate table audit_events, users, companies cascade",
  );
  await bootstrapInitialAccount(admin.pool, {
    companyName: "Sales Test A",
    email: "sales-a@example.test",
    displayName: "Sales A",
    password: "sales-integration-password-a",
  });
  const first = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId",m.user_id "userId" from memberships m join users u on u.id=m.user_id where u.email='sales-a@example.test'`,
  );
  const second = await admin.pool.query<{ companyId: string; userId: string }>(
    `with c as(insert into companies(name)values('Sales Test B')returning id),u as(insert into users(email,display_name,password_hash)values('sales-b@example.test','Sales B','$argon2id$v=19$m=19456,t=2,p=1$ZmFrZXNhbHQ$ZmFrZWhhc2hmaWxsZXI')returning id),m as(insert into memberships(company_id,user_id,role)select c.id,u.id,'owner' from c,u returning company_id,user_id)select company_id "companyId",user_id "userId" from m`,
  );
  identity = {
    ...first.rows[0]!,
    familyId: "00000000-0000-4000-8000-000000000001",
    email: "sales-a@example.test",
    displayName: "Sales A",
    companyName: "Sales Test A",
    role: "owner",
  };
  other = {
    ...second.rows[0]!,
    familyId: "00000000-0000-4000-8000-000000000002",
    email: "sales-b@example.test",
    displayName: "Sales B",
    companyName: "Sales Test B",
    role: "owner",
  };
  ({ customerId, productId } = await withTenantTransaction(
    api.pool,
    identity,
    async (client) => {
      const c = await client.query<{ id: string }>(
        `insert into contacts(company_id,kind,legal_name,tax_id,address)values($1,'customer','Cliente Ficticio','TEST-SALES-C','{"city":"Ficticia"}')returning id`,
        [identity.companyId],
      );
      const p = await client.query<{ id: string }>(
        `insert into products(company_id,name,sku,unit,sale_price,tax_rate)values($1,'Producto Ficticio','TEST-SALES-P','kg',12.3456,4)returning id`,
        [identity.companyId],
      );
      await client.query(
        `insert into contact_product_prices(company_id,contact_id,product_id,price,valid_from)values($1,$2,$3,9.8765,current_date)`,
        [identity.companyId, c.rows[0]!.id, p.rows[0]!.id],
      );
      return { customerId: c.rows[0]!.id, productId: p.rows[0]!.id };
    },
  ));
  delivery = new DeliveryNoteService(api.pool);
  invoices = new InvoiceService(api.pool);
});
after(async () => {
  if (admin)
    await admin.pool.query(
      "truncate table audit_events, users, companies cascade",
    );
  if (api) await api.close();
  if (admin) await admin.close();
});

test("albarán aplica precio específico, snapshot, numeración, bloqueo y aislamiento", async () => {
  const draft = await delivery.create(identity, {
    contactId: customerId,
    series: "A",
    issueDate: "2026-07-15",
  });
  const lined = await delivery.addLine(identity, draft!.id, {
    productId,
    quantity: "2",
  });
  assert.equal(lined?.lines[0]?.unitPrice, "9.8765");
  assert.equal(lined?.total, "20.5431");
  await withTenantTransaction(api.pool, identity, (client) =>
    client.query(
      "update products set name='Producto cambiado',sale_price=99 where id=$1",
      [productId],
    ),
  );
  const issued = await delivery.issue(identity, draft!.id);
  assert.equal(issued?.number, 1);
  assert.equal(issued?.lines[0]?.description, "Producto Ficticio");
  await assert.rejects(
    () => delivery.update(identity, draft!.id, { notes: "No permitido" }),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update delivery_notes set notes='Mutación SQL no permitida' where id=$1",
          [draft!.id],
        ),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update delivery_note_lines set quantity=99 where delivery_note_id=$1",
          [draft!.id],
        ),
    ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  const targetDraft = await delivery.create(identity, {
    contactId: customerId,
    series: "MOVE-DN",
    issueDate: "2026-07-15",
  });
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update delivery_note_lines set delivery_note_id=$2 where id=$1",
          [issued!.lines[0]!.id, targetDraft!.id],
        ),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update delivery_note_lines set company_id=$2 where id=$1",
          [issued!.lines[0]!.id, other.companyId],
        ),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () => delivery.get(other, draft!.id),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );
});

test("numeración concurrente no duplica y factura albaranes de forma atómica", async () => {
  const drafts = await Promise.all(
    [1, 2].map(async () => {
      const note = await delivery.create(identity, {
        contactId: customerId,
        series: "B",
        issueDate: "2026-07-15",
      });
      await delivery.addLine(identity, note!.id, { productId, quantity: "1" });
      return note!;
    }),
  );
  const numbered = await Promise.all(
    drafts.map((note) => delivery.issue(identity, note.id)),
  );
  assert.deepEqual(new Set(numbered.map((note) => note?.number)).size, 2);
  const invoice = await invoices.fromDeliveryNotes(identity, {
    deliveryNoteIds: numbered.map((note) => note!.id),
    series: "F",
    issueDate: "2026-07-15",
  });
  assert.equal(invoice?.lines.length, 2);
  assert.equal(invoice?.contactLegalName, "Cliente Ficticio");
  const invoicedTarget = await delivery.create(identity, {
    contactId: customerId,
    series: "MOVE-INVOICED",
    issueDate: "2026-07-15",
  });
  const invoicedSource = await delivery.get(identity, numbered[0]!.id);
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update delivery_note_lines set delivery_note_id=$2 where id=$1",
          [invoicedSource.lines[0]!.id, invoicedTarget!.id],
        ),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      invoices.fromDeliveryNotes(identity, {
        deliveryNoteIds: [numbered[0]!.id],
        series: "F",
        issueDate: "2026-07-15",
      }),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
  const issued = await invoices.issue(identity, invoice!.id);
  assert.equal(issued?.status, "issued");
  const targetInvoice = await invoices.create(identity, {
    contactId: customerId,
    series: "MOVE-INV",
    issueDate: "2026-07-15",
  });
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query("update invoice_lines set invoice_id=$2 where id=$1", [
          issued!.lines[0]!.id,
          targetInvoice.id,
        ]),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query("update invoices set notes='Mutación SQL' where id=$1", [
          invoice!.id,
        ]),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "delete from invoice_lines where invoice_id=$1",
          [invoice!.id],
        ),
    ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query("update invoice_lines set company_id=$2 where id=$1", [
          issued!.lines[0]!.id,
          other.companyId,
        ]),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update invoice_delivery_notes set released_at=now() where invoice_id=$1",
          [invoice!.id],
        ),
      ),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update delivery_notes set status='issued' where id=$1",
          [numbered[0]!.id],
        ),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query(
          "update invoices set status='cancelled',cancelled_at=now() where id=$1",
          [invoice!.id],
        ),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  const cancelled = await invoices.cancel(identity, invoice!.id);
  assert.equal(cancelled?.status, "cancelled");
  assert.deepEqual(
    await Promise.all(
      numbered.map(
        async (note) => (await delivery.get(identity, note!.id)).status,
      ),
    ),
    ["issued", "issued"],
  );
  const replacement = await invoices.fromDeliveryNotes(identity, {
    deliveryNoteIds: numbered.map((note) => note!.id),
    series: "F-REOPENED",
    issueDate: "2026-07-15",
  });
  assert.equal(replacement?.deliveryNoteIds.length, 2);
  const replacementIssued = await invoices.issue(identity, replacement!.id);
  assert.equal(replacementIssued?.status, "issued");
  assert.ok(replacementIssued?.number);
  await assert.rejects(
    () =>
      withTenantTransaction(api.pool, identity, (client) =>
        client.query("select public.cancel_sales_invoice($1::uuid)", [
          invoice!.id,
        ]),
      ),
    (error: unknown) => (error as { code?: string }).code === "55000",
  );
  const links = await withTenantTransaction(api.pool, identity, (client) =>
    client.query<{ invoice_id: string; released_at: Date | null }>(
      `select invoice_id,released_at from invoice_delivery_notes
       where delivery_note_id=any($1::uuid[]) order by created_at`,
      [numbered.map((note) => note!.id)],
    ),
  );
  assert.equal(
    links.rows.filter((link) => link.invoice_id === invoice!.id).every((link) => link.released_at),
    true,
  );
  assert.equal(
    links.rows.filter((link) => link.invoice_id === replacement!.id).every((link) => !link.released_at),
    true,
  );
  const events = await withTenantTransaction(api.pool, identity, (client) =>
    client.query(
      `select action from audit_events where entity_id=any($1::text[])`,
      [[...numbered.map((note) => note!.id), invoice!.id, replacement!.id]],
    ),
  );
  assert.ok(events.rows.length >= 9);
  assert.equal(
    events.rows.filter(
      (event) =>
        event.action ===
        "delivery_note.reopened_after_invoice_cancellation",
    ).length,
    2,
  );
});

test("transiciones SQL desde borrador exigen el ciclo de vida y no alteran importes", async () => {
  const draft = await invoices.create(identity, {
    contactId: customerId,
    series: "STATE",
    issueDate: "2026-07-15",
  });
  const reject = (query: string) =>
    assert.rejects(
      () =>
        withTenantTransaction(api.pool, identity, (client) =>
          client.query(query, [draft.id]),
        ),
      (error: unknown) => (error as { code?: string }).code === "55000",
    );

  await reject("update invoices set status='issued' where id=$1");
  await reject("update invoices set number=900001,status='issued' where id=$1");
  await reject(
    "update invoices set status='cancelled',cancelled_at=now() where id=$1",
  );
  await reject(
    "update invoices set number=900001,status='issued',issued_at=now(),total=99 where id=$1",
  );
  assert.equal((await invoices.get(identity, draft.id)).status, "draft");
});

test("dos cancelaciones concurrentes liberan una sola vez", async () => {
  const note = await createIssuedNote("RACE-CANCEL");
  const invoice = await createIssuedInvoice([note.id], "RACE-CANCEL");
  const results = await Promise.allSettled([
    invoices.cancel(identity, invoice.id),
    invoices.cancel(identity, invoice.id),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const links = await withTenantTransaction(api.pool, identity, (client) =>
    client.query<{ released_at: Date | null }>(
      "select released_at from invoice_delivery_notes where invoice_id=$1",
      [invoice.id],
    ),
  );
  assert.equal(links.rowCount, 1);
  assert.ok(links.rows[0]!.released_at);
  assert.equal((await delivery.get(identity, note.id)).status, "issued");
});

test("cancelación concurrente con refacturación mantiene un único vínculo activo", async () => {
  const note = await createIssuedNote("RACE-REINVOICE");
  const invoice = await createIssuedInvoice([note.id], "RACE-REINVOICE");
  const [cancelResult, conversionResult] = await Promise.allSettled([
    invoices.cancel(identity, invoice.id),
    invoices.fromDeliveryNotes(identity, {
      deliveryNoteIds: [note.id],
      series: "RACE-REPLACEMENT",
      issueDate: "2026-07-15",
    }),
  ]);
  assert.equal(cancelResult.status, "fulfilled");
  let replacement =
    conversionResult.status === "fulfilled"
      ? conversionResult.value
      : await invoices.fromDeliveryNotes(identity, {
          deliveryNoteIds: [note.id],
          series: "RACE-REPLACEMENT",
          issueDate: "2026-07-15",
        });
  replacement = await invoices.issue(identity, replacement!.id);
  assert.equal(replacement?.status, "issued");
  const active = await withTenantTransaction(api.pool, identity, (client) =>
    client.query<{ invoice_id: string }>(
      `select invoice_id from invoice_delivery_notes
       where delivery_note_id=$1 and released_at is null`,
      [note.id],
    ),
  );
  assert.equal(active.rowCount, 1);
  assert.equal(active.rows[0]!.invoice_id, replacement!.id);
});

test("un fallo tras liberar el primer albarán revierte toda la cancelación", async () => {
  const notes = await Promise.all([
    createIssuedNote("ROLLBACK-A"),
    createIssuedNote("ROLLBACK-B"),
  ]);
  const invoice = await createIssuedInvoice(
    notes.map((note) => note.id),
    "ROLLBACK",
  );
  const failOnId = notes.map((note) => note.id).sort()[1]!;
  await admin.pool.query(`
    create function public.integration_fail_second_reopen()
    returns trigger language plpgsql as $body$
    begin
      if new.id = '${failOnId}'::uuid
         and old.status = 'invoiced'
         and new.status = 'issued' then
        raise exception 'integration rollback injection';
      end if;
      return new;
    end
    $body$;
    create trigger zzz_integration_fail_second_reopen
    before update on public.delivery_notes
    for each row execute function public.integration_fail_second_reopen();
  `);
  try {
    await assert.rejects(() => invoices.cancel(identity, invoice.id));
  } finally {
    await admin.pool.query(`
      drop trigger if exists zzz_integration_fail_second_reopen on public.delivery_notes;
      drop function if exists public.integration_fail_second_reopen();
    `);
  }
  assert.equal((await invoices.get(identity, invoice.id)).status, "issued");
  assert.deepEqual(
    await Promise.all(notes.map(async (note) => (await delivery.get(identity, note.id)).status)),
    ["invoiced", "invoiced"],
  );
  const state = await withTenantTransaction(api.pool, identity, (client) =>
    client.query<{ active: number; audit_count: number }>(
      `select
         count(*) filter (where link.released_at is null)::int active,
         (select count(*)::int from audit_events as event
          where event.entity_id=any($2::text[])
            and event.action='delivery_note.reopened_after_invoice_cancellation') audit_count
       from invoice_delivery_notes as link
       where link.invoice_id=$1`,
      [invoice.id, notes.map((note) => note.id)],
    ),
  );
  assert.equal(state.rows[0]!.active, 2);
  assert.equal(state.rows[0]!.audit_count, 0);
});

test("cancelación, snapshots fiscales y rollback rechazan cruces inválidos", async () => {
  const related = await withTenantTransaction(
    api.pool,
    identity,
    async (client) => {
      const contacts = await client.query<{ id: string; kind: string }>(
        `insert into contacts(company_id,kind,legal_name,tax_id,address)
       values($1,'supplier','Proveedor Ficticio','TEST-SALES-S','{}'),
             ($1,'customer','Segundo Cliente Ficticio','TEST-SALES-C2','{}')
       returning id,kind`,
        [identity.companyId],
      );
      return {
        supplierId: contacts.rows.find((row) => row.kind === "supplier")!.id,
        customerId: contacts.rows.find((row) => row.kind === "customer")!.id,
      };
    },
  );
  await assert.rejects(
    () =>
      delivery.create(identity, {
        contactId: related.supplierId,
        series: "C",
        issueDate: "2026-07-15",
      }),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );

  const foreignProduct = await withTenantTransaction(
    api.pool,
    other,
    async (client) =>
      (
        await client.query<{ id: string }>(
          `insert into products(company_id,name,sku,unit,sale_price,tax_rate)
       values($1,'Producto Ajeno Ficticio','TEST-SALES-FOREIGN','unit',1,21) returning id`,
          [other.companyId],
        )
      ).rows[0]!.id,
  );
  const ownDraft = await delivery.create(identity, {
    contactId: customerId,
    series: "C",
    issueDate: "2026-07-15",
  });
  await assert.rejects(
    () =>
      delivery.addLine(identity, ownDraft!.id, {
        productId: foreignProduct,
        quantity: "1",
      }),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );
  await delivery.addLine(identity, ownDraft!.id, { productId, quantity: "1" });
  await delivery.issue(identity, ownDraft!.id);
  assert.equal(
    (await delivery.cancel(identity, ownDraft!.id))?.status,
    "cancelled",
  );

  const notes = await Promise.all(
    [customerId, related.customerId].map(async (contactId, index) => {
      const note = await delivery.create(identity, {
        contactId,
        series: `M${index + 1}`,
        issueDate: "2026-07-15",
      });
      await delivery.addLine(identity, note!.id, { productId, quantity: "1" });
      return delivery.issue(identity, note!.id);
    }),
  );
  await assert.rejects(
    () =>
      invoices.fromDeliveryNotes(identity, {
        deliveryNoteIds: notes.map((note) => note!.id),
        series: "F",
        issueDate: "2026-07-15",
      }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
  assert.deepEqual(
    await Promise.all(
      notes.map(
        async (note) => (await delivery.get(identity, note!.id)).status,
      ),
    ),
    ["issued", "issued"],
  );

  const manual = await invoices.create(identity, {
    contactId: customerId,
    series: "MAN",
    issueDate: "2026-07-15",
  });
  await invoices.line(identity, manual.id, undefined, {
    productId,
    quantity: "1",
  });
  const emitted = await invoices.issue(identity, manual.id);
  assert.ok(emitted);
  await admin.pool.query(
    "update companies set name='Empresa modificada después' where id=$1",
    [identity.companyId],
  );
  const immutable = await invoices.get(identity, emitted.id);
  assert.equal(immutable.issuerLegalName, "Sales Test A");
  const cancelled = await invoices.cancel(identity, emitted.id);
  assert.equal(cancelled?.status, "cancelled");
});
