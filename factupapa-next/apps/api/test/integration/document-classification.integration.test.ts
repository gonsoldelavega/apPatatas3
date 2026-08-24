import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { createDatabaseProbe, type Database } from "../../src/database/client.js";

const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
let database: Database;
let companyId: string;
let userId: string;
let supplierId: string;

async function createDocument(extractedData: Record<string, unknown>) {
  const result = await database.pool.query<{ id: string }>(
    `insert into documents(
       company_id,kind,status,original_filename,storage_key,mime_type,byte_size,sha256,
       uploaded_by,extracted_data
     ) values($1,'purchase_invoice','needs_review',$2,$3,'application/pdf',100,$4,$5,$6::jsonb)
     returning id`,
    [
      companyId,
      `document-${crypto.randomUUID()}.pdf`,
      `integration/${crypto.randomUUID()}.pdf`,
      crypto.randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      userId,
      JSON.stringify(extractedData),
    ],
  );
  return result.rows[0]!.id;
}

async function insertPurchase(documentId: string | null) {
  return database.pool.query(
    `insert into purchase_invoices(
       company_id,supplier_id,supplier_legal_name,supplier_tax_id,document_id,
       supplier_invoice_number,issue_date,category,subtotal,tax_total,total,created_by_user_id
     ) values($1,$2,'Proveedor integración','B04854154',$3,$4,'2026-08-24','mercancia',100,4,104,$5)
     returning id`,
    [companyId, supplierId, documentId, `TEST-${crypto.randomUUID()}`, userId],
  );
}

before(async () => {
  assert.ok(databaseAdminUrl, "DATABASE_ADMIN_URL es obligatoria");
  database = createDatabaseProbe(databaseAdminUrl);
  await database.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(database.pool, {
    companyName: "Document classification integration",
    email: "classification@example.test",
    displayName: "Classification Owner",
    password: "document-classification-integration-password",
  });
  const identity = await database.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId",m.user_id "userId"
     from memberships m join users u on u.id=m.user_id
     where u.email='classification@example.test'`,
  );
  companyId = identity.rows[0]!.companyId;
  userId = identity.rows[0]!.userId;
  supplierId = (
    await database.pool.query<{ id: string }>(
      `insert into contacts(company_id,kind,legal_name,tax_id,address)
       values($1,'supplier','Proveedor integración','B04854154','{}'::jsonb)
       returning id`,
      [companyId],
    )
  ).rows[0]!.id;
});

after(async () => {
  if (database) {
    await database.pool.query("truncate table audit_events, users, companies cascade");
    await database.close();
  }
});

test("el trigger permite únicamente un documento supplier_invoice elegible", async () => {
  const documentId = await createDocument({
    documentType: "supplier_invoice",
    classificationConfidence: 0.97,
    purchaseEligible: true,
  });
  const created = await insertPurchase(documentId);
  assert.equal(created.rowCount, 1);
});

test("el trigger bloquea transferencia, venta propia, desconocido y abono aunque lleven importes", async () => {
  for (const documentType of [
    "bank_transfer_receipt",
    "bank_deposit_receipt",
    "issued_sales_invoice",
    "payment_confirmation",
    "account_statement",
    "supplier_credit_note",
    "unknown",
  ]) {
    const documentId = await createDocument({
      documentType,
      classificationConfidence: 0.99,
      purchaseEligible: true,
      total: "104.00",
    });
    await assert.rejects(insertPurchase(documentId), /not an eligible supplier invoice/i, documentType);
  }
});

test("el trigger bloquea supplier_invoice si falta elegibilidad o confianza suficiente", async () => {
  for (const extractedData of [
    { documentType: "supplier_invoice", classificationConfidence: 0.99 },
    { documentType: "supplier_invoice", classificationConfidence: 0.79, purchaseEligible: true },
    { documentType: "supplier_invoice", classificationConfidence: 0.99, purchaseEligible: false },
    { documentType: "supplier_invoice", classificationConfidence: "invalid", purchaseEligible: true },
  ]) {
    const documentId = await createDocument(extractedData);
    await assert.rejects(insertPurchase(documentId), /not an eligible supplier invoice/i);
  }
});

test("las compras manuales sin documento siguen permitidas", async () => {
  const created = await insertPurchase(null);
  assert.equal(created.rowCount, 1);
});

test("una compra borrador anterior no puede confirmarse si su documento deja de ser elegible", async () => {
  const documentId = await createDocument({
    documentType: "supplier_invoice",
    classificationConfidence: 0.95,
    purchaseEligible: true,
  });
  const purchaseId = (await insertPurchase(documentId)).rows[0]!.id as string;
  await database.pool.query(
    `update documents
     set extracted_data='{"documentType":"bank_transfer_receipt","classificationConfidence":0.99,"purchaseEligible":false}'::jsonb
     where id=$1`,
    [documentId],
  );
  await assert.rejects(
    database.pool.query(
      `update purchase_invoices set status='confirmed',confirmed_at=now() where id=$1`,
      [purchaseId],
    ),
    /not an eligible supplier invoice/i,
  );
});
