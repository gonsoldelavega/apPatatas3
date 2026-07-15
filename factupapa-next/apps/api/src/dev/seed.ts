import { pathToFileURL } from "node:url";
import { hashPassword } from "../auth/password.js";
import { createDatabaseProbe } from "../database/client.js";

const ids = {
  company: "00000000-0000-4000-8000-000000000101",
  user: "00000000-0000-4000-8000-000000000102",
  customer: "00000000-0000-4000-8000-000000000103",
  supplier: "00000000-0000-4000-8000-000000000104",
  product: "00000000-0000-4000-8000-000000000105",
  delivery: "00000000-0000-4000-8000-000000000106",
  deliveryLine: "00000000-0000-4000-8000-000000000107",
  invoice: "00000000-0000-4000-8000-000000000108",
  invoiceLine: "00000000-0000-4000-8000-000000000109",
};

async function main() {
  if (
    !new Set(["development", "integration", "test"]).has(
      process.env.APP_ENV ?? "",
    )
  )
    throw new Error(
      "Seed ficticio rechazado fuera de development/integration/test",
    );
  const databaseUrl = process.env.DATABASE_ADMIN_URL,
    email = process.env.DEMO_USER_EMAIL,
    password = process.env.DEMO_USER_PASSWORD;
  if (!databaseUrl || !email || !password)
    throw new Error(
      "DATABASE_ADMIN_URL, DEMO_USER_EMAIL y DEMO_USER_PASSWORD son obligatorias",
    );
  const database = createDatabaseProbe(databaseUrl),
    client = await database.pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [2_026_071_501]);
    const passwordHash = await hashPassword(password);
    await client.query(
      `insert into companies(id,name,tax_id,address) values($1,'Empresa Demo Ficticia','TEST-DEMO-000','{"city":"Ciudad Ficticia","country":"ES"}') on conflict(id) do update set name=excluded.name,tax_id=excluded.tax_id,address=excluded.address`,
      [ids.company],
    );
    await client.query(
      `insert into users(id,email,display_name,password_hash) values($1,$2,'Usuario Demo Ficticio',$3) on conflict(id) do update set email=excluded.email,password_hash=excluded.password_hash`,
      [ids.user, email.toLowerCase(), passwordHash],
    );
    await client.query(
      `insert into memberships(company_id,user_id,role) values($1,$2,'owner') on conflict do nothing`,
      [ids.company, ids.user],
    );
    await client.query(
      `insert into contacts(id,company_id,kind,legal_name,tax_id,email,address,notes) values($1,$2,'customer','Cliente Demo Ficticio','TEST-C-0001','cliente@example.test','{"city":"Ciudad Ficticia","country":"ES"}','Dato exclusivamente ficticio'),($3,$2,'supplier','Proveedor Demo Ficticio','TEST-PROV-0001','proveedor@example.test','{}','Dato exclusivamente ficticio') on conflict(id) do nothing`,
      [ids.customer, ids.company, ids.supplier],
    );
    await client.query(
      `insert into products(id,company_id,name,sku,unit,sale_price,estimated_cost,tax_rate,description) values($1,$2,'Producto Demo Ficticio','TEST-SKU-0001','kg',12.3456,8.1000,4,'Dato exclusivamente ficticio') on conflict(id) do nothing`,
      [ids.product, ids.company],
    );
    await client.query(
      `insert into contact_product_prices(company_id,contact_id,product_id,price,valid_from) values($1,$2,$3,9.8765,current_date) on conflict(company_id,contact_id,product_id) do update set price=excluded.price,is_active=true`,
      [ids.company, ids.customer, ids.product],
    );
    await client.query(
      `insert into delivery_notes(id,company_id,contact_id,number,series,issue_date,status,subtotal,tax_total,total,created_by_user_id,issued_at) values($1,$2,$3,1,'DEMO',current_date,'issued',19.7530,0.7901,20.5431,$4,now()) on conflict(id) do nothing`,
      [ids.delivery, ids.company, ids.customer, ids.user],
    );
    await client.query(
      `insert into delivery_note_lines(id,company_id,delivery_note_id,product_id,description,quantity,unit,unit_price,tax_rate,line_subtotal,line_tax,line_total,position) values($1,$2,$3,$4,'Producto Demo Ficticio',2,'kg',9.8765,4,19.7530,0.7901,20.5431,1) on conflict(id) do nothing`,
      [ids.deliveryLine, ids.company, ids.delivery, ids.product],
    );
    await client.query(
      `insert into invoices(id,company_id,contact_id,direction,series,number,issue_date,status,subtotal,tax_total,total,notes,source,source_type,created_by_user_id,issued_at,contact_legal_name,contact_tax_id,contact_address,issuer_legal_name,issuer_tax_id,issuer_address) values($1,$2,$3,'sale','DEMO',1,current_date,'issued',19.7530,0.7901,20.5431,'Factura ficticia','native','manual',$4,now(),'Cliente Demo Ficticio','TEST-C-0001','{"city":"Ciudad Ficticia","country":"ES"}','Empresa Demo Ficticia','TEST-DEMO-000','{"city":"Ciudad Ficticia","country":"ES"}') on conflict(id) do nothing`,
      [ids.invoice, ids.company, ids.customer, ids.user],
    );
    await client.query(
      `insert into invoice_lines(id,company_id,invoice_id,product_id,description,quantity,unit,unit_price,tax_rate,discount_rate,line_subtotal,line_tax,line_total,position) values($1,$2,$3,$4,'Producto Demo Ficticio',2,'kg',9.8765,4,0,19.7530,0.7901,20.5431,1) on conflict(id) do nothing`,
      [ids.invoiceLine, ids.company, ids.invoice, ids.product],
    );
    await client.query(
      `insert into document_sequences(company_id,document_type,series,next_number)
      values($1,'delivery_note','DEMO',2),($1,'invoice','DEMO',2)
      on conflict(company_id,document_type,series) do update
      set next_number=greatest(document_sequences.next_number,excluded.next_number)`,
      [ids.company],
    );
    await client.query("commit");
    console.log("Seed ficticio completado");
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
    console.error(error instanceof Error ? error.message : "Seed fallido");
    process.exitCode = 1;
  });
