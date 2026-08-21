import { pathToFileURL } from "node:url";
import { createDatabaseProbe } from "../database/client.js";

const seededIds = {
  customer: "00000000-0000-4000-8000-000000000103",
  supplier: "00000000-0000-4000-8000-000000000104",
  product: "00000000-0000-4000-8000-000000000105",
};

type CountRow = {
  demo_invoices: string;
  demo_delivery_notes: string;
  demo_contacts: string;
  demo_products: string;
};

const isApply = process.argv.includes("--apply");

async function main() {
  const databaseUrl = process.env.DATABASE_ADMIN_URL;
  const companyId = process.env.CLEANUP_COMPANY_ID;
  if (!databaseUrl || !companyId)
    throw new Error("DATABASE_ADMIN_URL y CLEANUP_COMPANY_ID son obligatorias");
  if (isApply && process.env.CLEANUP_CONFIRMATION !== "ELIMINAR SOLO DATOS DEMO")
    throw new Error("Falta CLEANUP_CONFIRMATION=ELIMINAR SOLO DATOS DEMO");

  const database = createDatabaseProbe(databaseUrl);
  const client = await database.pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `cleanup-demo:${companyId}`,
    ]);
    const counts = (
      await client.query<CountRow>(
        `select
          (select count(*) from invoices where company_id=$1 and series='DEMO')::text demo_invoices,
          (select count(*) from delivery_notes where company_id=$1 and series='DEMO')::text demo_delivery_notes,
          (select count(*) from contacts where company_id=$1 and
            (id=any($2::uuid[]) or tax_id in ('TEST-C-0001','TEST-PROV-0001') or
             lower(legal_name) in ('cliente demo ficticio','proveedor demo ficticio')))::text demo_contacts,
          (select count(*) from products where company_id=$1 and
            (id=$3 or sku='TEST-SKU-0001' or lower(name)='producto demo ficticio'))::text demo_products`,
        [companyId, [seededIds.customer, seededIds.supplier], seededIds.product],
      )
    ).rows[0]!;

    if (!isApply) {
      await client.query("rollback");
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", ...counts })}\n`);
      return;
    }

    await client.query(
      `create temporary table demo_invoices on commit drop as
       select id from invoices where company_id=$1 and series='DEMO';
       create temporary table demo_notes on commit drop as
       select id from delivery_notes where company_id=$1 and series='DEMO';
       create temporary table demo_contacts on commit drop as
       select id from contacts where company_id=$1 and
         (id=any($2::uuid[]) or tax_id in ('TEST-C-0001','TEST-PROV-0001') or
          lower(legal_name) in ('cliente demo ficticio','proveedor demo ficticio'));
       create temporary table demo_products on commit drop as
       select id from products where company_id=$1 and
         (id=$3 or sku='TEST-SKU-0001' or lower(name)='producto demo ficticio')`,
      [companyId, [seededIds.customer, seededIds.supplier], seededIds.product],
    );

    const blockers = await client.query<{ kind: string; count: string }>(
      `select 'facturas no demo con contacto demo',count(*)::text from invoices
         where company_id=$1 and series<>'DEMO' and contact_id in(select id from demo_contacts)
       union all select 'compras con proveedor demo',count(*)::text from purchase_invoices
         where company_id=$1 and supplier_id in(select id from demo_contacts)
       union all select 'líneas de compras con producto demo',count(*)::text from purchase_invoice_lines
         where company_id=$1 and product_id in(select id from demo_products)`,
      [companyId],
    );
    const unsafe = blockers.rows.filter((row) => Number(row.count) > 0);
    if (unsafe.length)
      throw new Error(`Limpieza bloqueada: ${JSON.stringify(unsafe)}`);

    await client.query(
      `delete from payments where company_id=$1 and invoice_id in(select id from demo_invoices);
       update documents set invoice_id=null where company_id=$1 and invoice_id in(select id from demo_invoices);
       delete from invoice_delivery_notes where company_id=$1 and
         (invoice_id in(select id from demo_invoices) or delivery_note_id in(select id from demo_notes));
       alter table invoice_lines disable trigger invoice_lines_enforce_immutability;
       alter table invoices disable trigger invoices_enforce_immutability;
       alter table delivery_note_lines disable trigger delivery_note_lines_enforce_immutability;
       alter table delivery_notes disable trigger delivery_notes_enforce_immutability;
       delete from invoice_lines where company_id=$1 and invoice_id in(select id from demo_invoices);
       delete from invoices where company_id=$1 and id in(select id from demo_invoices);
       delete from delivery_note_lines where company_id=$1 and delivery_note_id in(select id from demo_notes);
       delete from delivery_notes where company_id=$1 and id in(select id from demo_notes);
       alter table invoice_lines enable trigger invoice_lines_enforce_immutability;
       alter table invoices enable trigger invoices_enforce_immutability;
       alter table delivery_note_lines enable trigger delivery_note_lines_enforce_immutability;
       alter table delivery_notes enable trigger delivery_notes_enforce_immutability;
       delete from document_sequences where company_id=$1 and series='DEMO';
       delete from stock_adjustments where company_id=$1 and product_id in(select id from demo_products);
       delete from contact_product_prices where company_id=$1 and
         (contact_id in(select id from demo_contacts) or product_id in(select id from demo_products));
       update payments set contact_id=null where company_id=$1 and contact_id in(select id from demo_contacts);
       delete from products where company_id=$1 and id in(select id from demo_products);
       delete from contacts where company_id=$1 and id in(select id from demo_contacts)`,
      [companyId],
    );
    await client.query("commit");
    process.stdout.write(`${JSON.stringify({ mode: "applied", ...counts })}\n`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "cleanup_demo_failed"}\n`);
    process.exitCode = 1;
  });
