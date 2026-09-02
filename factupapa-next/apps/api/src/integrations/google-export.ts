import type { Pool } from "pg";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { withTenantTransaction, type TenantContext } from "../database/client.js";
import { InvoiceRepository } from "../invoices/repository.js";
import { createInvoicePdf } from "../invoices/pdf.js";
import { HttpError } from "../http/errors.js";
import type { GmailIntegrationService } from "./gmail.js";
import { GOOGLE_DRIVE_SCOPE, GOOGLE_SHEETS_SCOPE } from "./gmail.js";

export interface GoogleExportConfig {
  spreadsheetId: string;
  registrySheet: string;
  linesSheet: string;
  folderId?: string;
  storage?: { endpoint: string; bucket: string; accessKey: string; secretKey: string };
}

type Json = Record<string, unknown>;

async function googleFetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`google_${response.status}`);
  return (await response.json()) as T;
}

function invoiceLabel(invoice: { series: string; number: number | null }) {
  const match = invoice.series.match(/^(.+)_([0-9]{4})$/u);
  return match ? `${match[1]}-${invoice.number}/${match[2]}` : `${invoice.series}-${invoice.number}`;
}

export class GoogleInvoiceExporter {
  private readonly invoices = new InvoiceRepository();
  private readonly s3?: S3Client;
  constructor(private readonly pool: Pool, private readonly gmail: GmailIntegrationService, private readonly config: GoogleExportConfig) {
    if (config.storage) this.s3 = new S3Client({ region: "us-east-1", endpoint: config.storage.endpoint, forcePathStyle: true, credentials: { accessKeyId: config.storage.accessKey, secretAccessKey: config.storage.secretKey } });
  }

  async enqueue(identity: TenantContext, invoiceId: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(`insert into sales_invoice_export_events(company_id,invoice_id,event_type) values($1,$2,'sales_invoice_export_requested') on conflict(company_id,invoice_id,event_type) do update set status=case when sales_invoice_export_events.status='completed' then sales_invoice_export_events.status else 'pending' end, next_attempt_at=now(), updated_at=now()`, [identity.companyId, invoiceId]);
    });
  }

  async backfill(identity: TenantContext, numbers: number[]): Promise<number> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const rows = await client.query<{ id: string }>(`select id from invoices where company_id=$1 and status='issued' and number = any($2::int[])`, [identity.companyId, numbers]);
      for (const row of rows.rows) await client.query(`insert into sales_invoice_export_events(company_id,invoice_id,event_type) values($1,$2,'sales_invoice_export_requested') on conflict do nothing`, [identity.companyId, row.id]);
      return rows.rowCount ?? 0;
    });
  }

  async backfillPurchases(identity: TenantContext): Promise<number> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const rows = await client.query<{ id: string }>(`select id from purchase_invoices where company_id=$1 and status='confirmed' and deleted_at is null`, [identity.companyId]);
      for (const row of rows.rows) await client.query(`insert into purchase_invoice_export_events(company_id,purchase_invoice_id,event_type) values($1,$2,'purchase_invoice_export_requested') on conflict(company_id,purchase_invoice_id,event_type) do update set status=case when purchase_invoice_export_events.status='completed' then purchase_invoice_export_events.status else 'pending' end,next_attempt_at=now(),updated_at=now()`, [identity.companyId, row.id]);
      return rows.rowCount ?? 0;
    });
  }

  async processDue(limit = 10): Promise<number> {
    const claimed = await this.pool.query<{ id: string; companyId: string; invoiceId: string }>(`select id,company_id "companyId",invoice_id "invoiceId" from public.claim_sales_invoice_export_events($1)`, [limit]);
    const events = claimed.rows;
    for (const event of events) {
      try { await this.exportOne(event.companyId, event.invoiceId); await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update sales_invoice_export_events set status='completed',completed_at=now(),last_error=null,updated_at=now() where id=$1`, [event.id])); }
      catch (error) { const message = error instanceof Error ? error.message.slice(0, 500) : "export_failed"; await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update sales_invoice_export_events set status='failed',last_error=$2,next_attempt_at=now()+least(interval '1 hour', interval '1 minute' * power(2,greatest(attempt_count-1,0))),updated_at=now() where id=$1`, [event.id, message])); }
    }
    const purchases = await this.pool.query<{ id: string; companyId: string; purchaseInvoiceId: string }>(`select id,company_id "companyId",purchase_invoice_id "purchaseInvoiceId" from public.claim_purchase_invoice_export_events($1)`, [limit]);
    for (const event of purchases.rows) {
      try { await this.exportPurchaseOne(event.companyId, event.purchaseInvoiceId); await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update purchase_invoice_export_events set status='completed',completed_at=now(),last_error=null,updated_at=now() where id=$1`, [event.id])); }
      catch (error) { const message = error instanceof Error ? error.message.slice(0, 500) : "export_failed"; await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update purchase_invoice_export_events set status='failed',last_error=$2,next_attempt_at=now()+least(interval '1 hour', interval '1 minute' * power(2,greatest(attempt_count-1,0))),updated_at=now() where id=$1`, [event.id, message])); }
    }
    return events.length + purchases.rows.length;
  }

  private async exportPurchaseOne(companyId: string, purchaseId: string): Promise<void> {
    if (!this.s3 || !this.config.storage) throw new HttpError("conflict", 409);
    const identity = { companyId, userId: companyId };
    const data = await withTenantTransaction(this.pool, identity, async (client) => {
      const purchase = (await client.query<any>(`select p.id,p.issue_date::text "issueDate",p.supplier_legal_name "supplierName",p.supplier_tax_id "supplierTaxId",p.supplier_invoice_number "invoiceNumber",p.category,p.subtotal,p.tax_total "taxTotal",p.total,p.status,p.document_id "documentId",d.storage_key "storageKey",d.mime_type "mimeType",d.original_filename "filename" from purchase_invoices p left join documents d on d.id=p.document_id where p.id=$1 and p.company_id=$2`, [purchaseId, companyId])).rows[0];
      if (!purchase || purchase.status !== "confirmed" || !purchase.documentId) throw new HttpError("conflict", 409);
      const lines = (await client.query<any[]>(`select id,product_id "productId",description,quantity::text,unit,unit_cost::text "unitCost",tax_rate::text "taxRate",line_subtotal::text "lineSubtotal",line_tax::text "lineTax",line_total::text "lineTotal",'' "deliveryDate" from purchase_invoice_lines where purchase_invoice_id=$1 order by position,id`, [purchaseId])).rows;
      return { purchase, lines };
    });
    const google = await this.gmail.googleAccess(identity);
    if (!google.scopes.includes(GOOGLE_DRIVE_SCOPE) || !google.scopes.includes(GOOGLE_SHEETS_SCOPE)) throw new HttpError("gmail_reauthorization_required", 409);
    const object = await this.s3.send(new GetObjectCommand({ Bucket: this.config.storage.bucket, Key: data.purchase.storageKey }));
    if (!object.Body) throw new HttpError("not_found", 404);
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    const metadata = { name: data.purchase.filename || `${data.purchase.invoiceNumber || purchaseId}`, mimeType: data.purchase.mimeType || "application/pdf", appProperties: { factupapa_company_id: companyId, factupapa_purchase_invoice_id: purchaseId, factupapa_document_id: data.purchase.documentId }, ...(this.config.folderId ? { parents: [this.config.folderId] } : {}) };
    const query = `appProperties has { key='factupapa_purchase_invoice_id' and value='${purchaseId}' } and trashed=false`;
    const list = await googleFetch<{ files?: Array<{ id: string }> }>(google.token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`);
    const boundary = `factupapa-purchase-${Date.now()}`;
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const file = list.files?.[0];
    const uploaded = await googleFetch<{ id?: string }>(google.token, file ? `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart` : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: file ? "PATCH" : "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body });
    const driveId = file?.id ?? uploaded.id ?? null;
    await this.upsertPurchaseSheets(google.token, data.purchase, data.lines, driveId);
    if (driveId) await this.pool.query(`update purchase_invoice_export_events set drive_file_id=$1 where company_id=$2 and purchase_invoice_id=$3`, [driveId, companyId, purchaseId]);
  }

  private async upsertPurchaseSheets(token: string, purchase: any, lines: any[], driveId: string | null) {
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}`;
    const meta = await googleFetch<{ sheets?: Array<{ properties?: { title?: string } }> }>(token, `${base}?fields=sheets.properties.title`);
    const titles = new Set((meta.sheets ?? []).map((s) => s.properties?.title));
    const missing = [this.config.registrySheet, this.config.linesSheet].filter((t) => !titles.has(t));
    if (missing.length) await googleFetch<Json>(token, `${base}:batchUpdate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) });
    const read = await googleFetch<{ values?: string[][] }>(token, `${base}/values/${encodeURIComponent(this.config.registrySheet)}!A:Z`);
    const values = read.values ?? [], headers = values[0] ?? [];
    const idColumn = headers.findIndex((h) => /factupapa.*id/i.test(h));
    const numberColumn = headers.findIndex((h) => /serie|nº|numero|número/i.test(h));
    const rowIndex = values.findIndex((row, i) => i > 0 && ((idColumn >= 0 && row[idColumn] === purchase.id) || (numberColumn >= 0 && row[numberColumn] === purchase.invoiceNumber)));
    const row = [purchase.issueDate, new Date().toISOString().slice(0,10), "Compra", "Factura", purchase.invoiceNumber ?? "", purchase.supplierName ?? "", purchase.supplierTaxId ?? "", lines.map((l) => l.description).join("; "), purchase.category ?? "", purchase.subtotal, lines[0]?.taxRate ?? "", purchase.taxTotal, purchase.total, "Pendiente de pago", "", "", "", "", "", driveId ?? "", "Generado automáticamente desde FactuPapa Next", purchase.id];
    const target = rowIndex >= 0 ? `${this.config.registrySheet}!A${rowIndex + 1}:V${rowIndex + 1}` : `${this.config.registrySheet}!A:V`;
    await googleFetch<Json>(token, `${base}/values/${encodeURIComponent(target)}${rowIndex >= 0 ? "?valueInputOption=USER_ENTERED" : ":append?valueInputOption=USER_ENTERED"}`, { method: rowIndex >= 0 ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rowIndex >= 0 ? { range: target, majorDimension: "ROWS", values: [row] } : { values: [row] }) });
    const lineRead = await googleFetch<{ values?: string[][] }>(token, `${base}/values/${encodeURIComponent(this.config.linesSheet)}!A:P`);
    const existing = lineRead.values ?? [];
    for (const line of lines) {
      const lineRow = [purchase.id, line.id, purchase.invoiceNumber ?? "", purchase.issueDate, purchase.supplierName ?? "", purchase.supplierTaxId ?? "", line.productId ?? "", line.description, line.quantity, line.unit, line.unitCost, line.taxRate, line.lineSubtotal, line.lineTax, line.lineTotal, line.deliveryDate ?? ""];
      const idx = existing.findIndex((r, i) => i > 0 && r[0] === purchase.id && r[1] === line.id);
      const range = idx >= 0 ? `${this.config.linesSheet}!A${idx + 1}:P${idx + 1}` : `${this.config.linesSheet}!A:P`;
      await googleFetch<Json>(token, `${base}/values/${encodeURIComponent(range)}${idx >= 0 ? "?valueInputOption=USER_ENTERED" : ":append?valueInputOption=USER_ENTERED"}`, { method: idx >= 0 ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idx >= 0 ? { range, majorDimension: "ROWS", values: [lineRow] } : { values: [lineRow] }) });
    }
  }

  private async exportOne(companyId: string, invoiceId: string): Promise<void> {
    const identity = { companyId, userId: companyId };
    const invoice = await withTenantTransaction(this.pool, identity, (client) => this.invoices.get(client, invoiceId));
    if (!invoice || invoice.status !== "issued") return;
    const google = await this.gmail.googleAccess(identity);
    if (!google.scopes.includes(GOOGLE_DRIVE_SCOPE) || !google.scopes.includes(GOOGLE_SHEETS_SCOPE)) throw new HttpError("gmail_reauthorization_required", 409);
    const company = await this.pool.query<{ name: string; taxId: string | null; address: Record<string,string> }>(`select name,tax_id "taxId",address from companies where id=$1`, [companyId]);
    const pdf = await createInvoicePdf(invoice, { name: company.rows[0]?.name ?? "FactuPapa", taxId: company.rows[0]?.taxId ?? null, address: company.rows[0]?.address ?? {} });
    const label = invoiceLabel(invoice);
    const metadata = { name: `${label}.pdf`, mimeType: "application/pdf", appProperties: { factupapa_company_id: companyId, factupapa_invoice_id: invoiceId }, ...(this.config.folderId ? { parents: [this.config.folderId] } : {}) };
    const list = await googleFetch<{ files?: Array<{ id: string }> }>(google.token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`appProperties has { key='factupapa_invoice_id' and value='${invoiceId}' } and trashed=false`)}&fields=files(id)`);
    const boundary = `factupapa-${Date.now()}`;
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const file = list.files?.[0];
    await googleFetch<Json>(google.token, file ? `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart` : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: file ? "PATCH" : "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body });
    await this.upsertSheets(google.token, invoice, label, file?.id ?? null);
  }

  private async upsertSheets(token: string, invoice: Awaited<ReturnType<InvoiceRepository["get"]>>, label: string, driveId: string | null) {
    if (!invoice) return;
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}`;
    const meta = await googleFetch<{ sheets?: Array<{ properties?: { title?: string } }> }>(token, `${base}?fields=sheets.properties.title`);
    const titles = new Set((meta.sheets ?? []).map((sheet) => sheet.properties?.title));
    if (!titles.has(this.config.registrySheet) || !titles.has(this.config.linesSheet)) {
      const requests = [this.config.registrySheet, this.config.linesSheet].filter((title) => !titles.has(title)).map((title) => ({ addSheet: { properties: { title } } }));
      if (requests.length) await googleFetch<Json>(token, `${base}:batchUpdate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests }) });
    }
    const read = await googleFetch<{ values?: string[][] }>(token, `${base}/values/${encodeURIComponent(this.config.registrySheet)}!A:Z`);
    const values = read.values ?? [];
    const headers = values[0] ?? [];
    const idColumn = headers.findIndex((h) => h.trim().toLowerCase() === "factupapa next id");
    const numberColumn = headers.findIndex((h) => /serie|nº|numero|número/i.test(h));
    const rowIndex = values.findIndex((row, i) => i > 0 && ((idColumn >= 0 && row[idColumn] === invoice.id) || row[21] === invoice.id || (numberColumn >= 0 && row[numberColumn] === label) || row[4] === label));
    const row = [invoice.issueDate, new Date().toISOString().slice(0, 10), "Venta", "Factura", label, invoice.contactLegalName, invoice.contactTaxId ?? "", invoice.lines.map((l) => l.description).join("; "), "", invoice.subtotal, invoice.lines[0]?.taxRate ?? "", invoice.taxTotal, invoice.total, invoice.paymentStatus, "", "", "", "", "", driveId ?? "", "Generado automáticamente desde FactuPapa Next", invoice.id];
    const target = rowIndex >= 0 ? `${this.config.registrySheet}!A${rowIndex + 1}:V${rowIndex + 1}` : `${this.config.registrySheet}!A:V`;
    await googleFetch<Json>(token, `${base}/values/${encodeURIComponent(target)}${rowIndex >= 0 ? "?valueInputOption=USER_ENTERED" : ":append?valueInputOption=USER_ENTERED"}`, { method: rowIndex >= 0 ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rowIndex >= 0 ? { range: target, majorDimension: "ROWS", values: [row] } : { values: [row] }) });
    const lineRead = await googleFetch<{ values?: string[][] }>(token, `${base}/values/${encodeURIComponent(this.config.linesSheet)}!A:P`);
    const lineValues = lineRead.values ?? [];
    const lines = invoice.lines.map((line) => [invoice.id, line.id, label, invoice.issueDate, invoice.contactLegalName, invoice.contactTaxId ?? "", line.productId ?? "", line.description, line.quantity, line.unit, line.unitPrice, line.taxRate, line.lineSubtotal, line.lineTax, line.lineTotal, line.deliveryDate ?? ""]);
    for (const row of lines) {
      const index = lineValues.findIndex((existing, i) => i > 0 && existing[0] === invoice.id && existing[1] === row[1]);
      const targetRange = index >= 0 ? `${this.config.linesSheet}!A${index + 1}:P${index + 1}` : `${this.config.linesSheet}!A:P`;
      await googleFetch<Json>(token, `${base}/values/${encodeURIComponent(targetRange)}${index >= 0 ? "?valueInputOption=USER_ENTERED" : ":append?valueInputOption=USER_ENTERED"}`, { method: index >= 0 ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(index >= 0 ? { range: targetRange, majorDimension: "ROWS", values: [row] } : { values: [row] }) });
    }
  }
}
