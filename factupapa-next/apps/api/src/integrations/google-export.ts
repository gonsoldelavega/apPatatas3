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
  salesFolderId?: string;
  purchasesFolderId?: string;
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

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function asPercent(value: unknown): number | null {
  const n = asNumber(value);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

async function ensureDrivePath(token: string, rootId: string | undefined, issueDate: string | null): Promise<string | undefined> {
  if (!rootId || !issueDate) return rootId;
  const date = new Date(`${issueDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return rootId;
  const year = String(date.getUTCFullYear());
  const quarter = `T${Math.floor(date.getUTCMonth() / 3) + 1}`;
  const month = `${String(date.getUTCMonth() + 1).padStart(2, "0")}_${monthNames[date.getUTCMonth()]}`;
  let parent = rootId;
  for (const name of [year, quarter, month]) {
    const query = `'${parent}' in parents and name='${name.replaceAll("'", "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const found = await googleFetch<{ files?: Array<{ id: string }> }>(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    if (found.files?.[0]?.id) { parent = found.files[0].id; continue; }
    const created = await googleFetch<{ id?: string }>(token, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }) });
    if (!created.id) throw new Error("drive_folder_id_missing");
    parent = created.id;
  }
  return parent;
}

async function moveDriveFile(token: string, fileId: string, destinationId: string | undefined): Promise<boolean> {
  if (!destinationId) return true;
  const current = await googleFetch<{ parents?: string[] }>(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`);
  const oldParents = (current.parents ?? []).filter((id) => id !== destinationId);
  const params = new URLSearchParams({ addParents: destinationId, fields: "id,parents", supportsAllDrives: "true" });
  if (oldParents.length) params.set("removeParents", oldParents.join(","));
  try {
    await googleFetch<Json>(token, `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" });
    return true;
  } catch (error) {
    // drive.file tokens cannot move legacy files into folders they did not
    // create. Keep the stable file and let the controlled recovery report it
    // as existing-but-misplaced instead of losing the accounting projection.
    if (error instanceof Error && error.message === "google_403") return false;
    throw error;
  }
}

function retryAtSql() {
  return "now()+least(interval '1 hour', interval '1 minute' * power(2,least(greatest(attempt_count-1,0),10)))";
}

async function writeSheetRow(token: string, base: string, sheet: string, rowNumber: number | null, values: unknown[]) {
  const range = rowNumber ? `${sheet}!A${rowNumber}:V${rowNumber}` : `${sheet}!A:V`;
  const url = rowNumber
    ? `${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
    : `${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await googleFetch<Json>(token, url, {
    method: rowNumber ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rowNumber ? { range, majorDimension: "ROWS", values: [values] } : { majorDimension: "ROWS", values: [values] }),
  });
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
    // Claim functions are security-definer and intentionally immutable. Do not
    // issue tenant-scoped updates through the pool directly: RLS requires an
    // explicit tenant context and would turn a harmless stale-row recovery
    // attempt into an invalid UUID crash. Failed attempts are reopened by the
    // normal retry path; an operator can safely reset an interrupted claim in
    // a tenant-scoped maintenance transaction.
    const claimed = await this.pool.query<{ id: string; companyId: string; invoiceId: string }>(`select id,company_id "companyId",invoice_id "invoiceId" from public.claim_sales_invoice_export_events($1)`, [limit]);
    const events = claimed.rows;
    for (const event of events) {
      try { const driveId = await this.exportOne(event.companyId, event.invoiceId); await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update sales_invoice_export_events set status='completed',drive_file_id=$2,completed_at=now(),last_error=null,updated_at=now() where id=$1`, [event.id, driveId])); }
      catch (error) { const message = error instanceof Error ? error.message.slice(0, 500) : "export_failed"; await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update sales_invoice_export_events set status='failed',last_error=$2,next_attempt_at=${retryAtSql()},updated_at=now() where id=$1`, [event.id, message])); }
    }
    const purchases = await this.pool.query<{ id: string; companyId: string; purchaseInvoiceId: string }>(`select id,company_id "companyId",purchase_invoice_id "purchaseInvoiceId" from public.claim_purchase_invoice_export_events($1)`, [limit]);
    for (const event of purchases.rows) {
      try { const hasDocument = await this.exportPurchaseOne(event.companyId, event.purchaseInvoiceId); await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update purchase_invoice_export_events set status=$2,completed_at=now(),last_error=null,exported_without_document=not $3,updated_at=now() where id=$1`, [event.id, hasDocument ? "completed" : "completed_without_document", hasDocument])); }
      catch (error) { const message = error instanceof Error ? error.message.slice(0, 500) : "export_failed"; await withTenantTransaction(this.pool, { companyId: event.companyId, userId: event.companyId }, (client) => client.query(`update purchase_invoice_export_events set status='failed',last_error=$2,next_attempt_at=${retryAtSql()},updated_at=now() where id=$1`, [event.id, message])); }
    }
    return events.length + purchases.rows.length;
  }

  private async exportPurchaseOne(companyId: string, purchaseId: string): Promise<boolean> {
    const identity = { companyId, userId: companyId };
    const data = await withTenantTransaction(this.pool, identity, async (client) => {
      const purchase = (await client.query<any>(`select p.id,p.issue_date::text "issueDate",p.supplier_legal_name "supplierName",p.supplier_tax_id "supplierTaxId",p.supplier_invoice_number "invoiceNumber",p.category,p.subtotal,p.tax_total "taxTotal",p.total,p.status,p.document_id "documentId",d.storage_key "storageKey",d.mime_type "mimeType",d.original_filename "filename" from purchase_invoices p left join documents d on d.id=p.document_id where p.id=$1 and p.company_id=$2`, [purchaseId, companyId])).rows[0];
      if (!purchase || purchase.status !== "confirmed") throw new HttpError("conflict", 409);
      const lines = (await client.query<any[]>(`select id,product_id "productId",description,quantity::text,unit,unit_cost::text "unitCost",tax_rate::text "taxRate",line_subtotal::text "lineSubtotal",line_tax::text "lineTax",line_total::text "lineTotal",'' "deliveryDate" from purchase_invoice_lines where purchase_invoice_id=$1 order by position,id`, [purchaseId])).rows;
      return { purchase, lines };
    });
    const google = await this.gmail.googleAccess(identity);
    if (!google.scopes.includes(GOOGLE_DRIVE_SCOPE) || !google.scopes.includes(GOOGLE_SHEETS_SCOPE)) throw new HttpError("gmail_reauthorization_required", 409);
    let driveId: string | null = null;
    const purchaseFolder = await ensureDrivePath(google.token, this.config.purchasesFolderId ?? this.config.folderId, data.purchase.issueDate);
    if (data.purchase.documentId && data.purchase.storageKey && this.s3 && this.config.storage) {
      const object = await this.s3.send(new GetObjectCommand({ Bucket: this.config.storage.bucket, Key: data.purchase.storageKey }));
      if (!object.Body) throw new HttpError("not_found", 404);
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      const metadata = { name: data.purchase.filename || `${data.purchase.invoiceNumber || purchaseId}`, mimeType: data.purchase.mimeType || "application/pdf", appProperties: { factupapa_company_id: companyId, factupapa_purchase_invoice_id: purchaseId, factupapa_document_id: data.purchase.documentId }, ...(purchaseFolder ? { parents: [purchaseFolder] } : {}) };
      const query = `appProperties has { key='factupapa_purchase_invoice_id' and value='${purchaseId}' } and trashed=false`;
      const list = await googleFetch<{ files?: Array<{ id: string }> }>(google.token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
      const boundary = `factupapa-purchase-${Date.now()}`;
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      const file = list.files?.[0];
      const uploaded = await googleFetch<{ id?: string }>(google.token, file ? `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart&supportsAllDrives=true` : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", { method: file ? "PATCH" : "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body });
      driveId = file?.id ?? uploaded.id ?? null;
      if (!driveId) {
        const confirmed = await googleFetch<{ files?: Array<{ id: string }> }>(google.token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
        driveId = confirmed.files?.[0]?.id ?? null;
      }
      if (driveId) await moveDriveFile(google.token, driveId, purchaseFolder);
    }
    await this.upsertPurchaseSheets(google.token, data.purchase, data.lines, driveId);
    if (driveId) await this.pool.query(`update purchase_invoice_export_events set drive_file_id=$1 where company_id=$2 and purchase_invoice_id=$3`, [driveId, companyId, purchaseId]);
    return Boolean(driveId);
  }

  private async upsertPurchaseSheets(token: string, purchase: any, lines: any[], driveId: string | null) {
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}`;
    const meta = await googleFetch<{ sheets?: Array<{ properties?: { title?: string } }> }>(token, `${base}?fields=sheets.properties.title`);
    const titles = new Set((meta.sheets ?? []).map((s) => s.properties?.title));
    const missing = [this.config.registrySheet, this.config.linesSheet].filter((t) => !titles.has(t));
    if (missing.length) await googleFetch<Json>(token, `${base}:batchUpdate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) });
    const read = await googleFetch<{ values?: unknown[][] }>(token, `${base}/values/${encodeURIComponent(this.config.registrySheet)}!A:Z?valueRenderOption=UNFORMATTED_VALUE`);
    const values = read.values ?? [];
    const rowIndex = values.findIndex((row) => row[21] === purchase.id || row[4] === purchase.invoiceNumber);
    const row = [purchase.issueDate, new Date().toISOString().slice(0,10), "Compra", "Factura", purchase.invoiceNumber ?? "", purchase.supplierName ?? "", purchase.supplierTaxId ?? "", lines.map((l) => l.description).join("; "), purchase.category ?? "", asNumber(purchase.subtotal), asPercent(lines[0]?.taxRate), asNumber(purchase.taxTotal), asNumber(purchase.total), "Pendiente de pago", "", "", "", "", "", driveId ?? "", "Generado automáticamente desde FactuPapa Next", purchase.id];
    await writeSheetRow(token, base, this.config.registrySheet, rowIndex >= 0 ? rowIndex + 1 : null, row);
    const lineRead = await googleFetch<{ values?: string[][] }>(token, `${base}/values/${encodeURIComponent(this.config.linesSheet)}!A:P`);
    const existing = lineRead.values ?? [];
    for (const line of lines) {
      const lineRow = [purchase.id, line.id, purchase.invoiceNumber ?? "", purchase.issueDate, purchase.supplierName ?? "", purchase.supplierTaxId ?? "", line.productId ?? "", line.description, asNumber(line.quantity), line.unit, asNumber(line.unitCost), asPercent(line.taxRate), asNumber(line.lineSubtotal), asNumber(line.lineTax), asNumber(line.lineTotal), line.deliveryDate ?? ""];
      const idx = existing.findIndex((r) => r[0] === purchase.id && r[1] === line.id);
      const range = idx >= 0 ? `${this.config.linesSheet}!A${idx + 1}:P${idx + 1}` : `${this.config.linesSheet}!A:P`;
      await googleFetch<Json>(token, `${base}/values/${encodeURIComponent(range)}${idx >= 0 ? "?valueInputOption=RAW" : ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"}`, { method: idx >= 0 ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idx >= 0 ? { range, majorDimension: "ROWS", values: [lineRow] } : { majorDimension: "ROWS", values: [lineRow] }) });
    }
  }

  private async exportOne(companyId: string, invoiceId: string): Promise<string | null> {
    const identity = { companyId, userId: companyId };
    const invoice = await withTenantTransaction(this.pool, identity, (client) => this.invoices.get(client, invoiceId));
    if (!invoice || invoice.status !== "issued") return null;
    const google = await this.gmail.googleAccess(identity);
    if (!google.scopes.includes(GOOGLE_DRIVE_SCOPE) || !google.scopes.includes(GOOGLE_SHEETS_SCOPE)) throw new HttpError("gmail_reauthorization_required", 409);
    const company = await this.pool.query<{ name: string; taxId: string | null; address: Record<string,string> }>(`select name,tax_id "taxId",address from companies where id=$1`, [companyId]);
    const pdf = await createInvoicePdf(invoice, { name: company.rows[0]?.name ?? "FactuPapa", taxId: company.rows[0]?.taxId ?? null, address: company.rows[0]?.address ?? {} });
    const label = invoiceLabel(invoice);
    const salesFolder = await ensureDrivePath(google.token, this.config.salesFolderId ?? this.config.folderId, invoice.issueDate);
    const metadata = { name: `${label}.pdf`, mimeType: "application/pdf", appProperties: { factupapa_company_id: companyId, factupapa_invoice_id: invoiceId }, ...(salesFolder ? { parents: [salesFolder] } : {}) };
    const list = await googleFetch<{ files?: Array<{ id: string }> }>(google.token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`appProperties has { key='factupapa_invoice_id' and value='${invoiceId}' } and trashed=false`)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    const boundary = `factupapa-${Date.now()}`;
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const file = list.files?.[0];
    const uploaded = await googleFetch<{ id?: string }>(google.token, file ? `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart&supportsAllDrives=true` : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", { method: file ? "PATCH" : "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body });
    const driveId = file?.id ?? uploaded.id ?? null;
    if (!driveId) throw new Error("drive_file_id_missing");
    await moveDriveFile(google.token, driveId, salesFolder);
    await this.upsertSheets(google.token, invoice, label, driveId);
    return driveId;
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
    const rowIndex = values.findIndex((row) => row[21] === invoice.id || row[4] === label);
    const row = [invoice.issueDate, new Date().toISOString().slice(0, 10), "Venta", "Factura", label, invoice.contactLegalName, invoice.contactTaxId ?? "", invoice.lines.map((l) => l.description).join("; "), "", asNumber(invoice.subtotal), asPercent(invoice.lines[0]?.taxRate), asNumber(invoice.taxTotal), asNumber(invoice.total), invoice.paymentStatus, "", "", "", "", "", driveId, "Generado automáticamente desde FactuPapa Next", invoice.id];
    await writeSheetRow(token, base, this.config.registrySheet, rowIndex >= 0 ? rowIndex + 1 : null, row);
    const lineRead = await googleFetch<{ values?: string[][] }>(token, `${base}/values/${encodeURIComponent(this.config.linesSheet)}!A:P`);
    const lineValues = lineRead.values ?? [];
    const lines = invoice.lines.map((line) => [invoice.id, line.id, label, invoice.issueDate, invoice.contactLegalName, invoice.contactTaxId ?? "", line.productId ?? "", line.description, line.quantity, line.unit, line.unitPrice, line.taxRate, line.lineSubtotal, line.lineTax, line.lineTotal, line.deliveryDate ?? ""]);
    for (const row of lines) {
      const index = lineValues.findIndex((existing) => existing[0] === invoice.id && existing[1] === row[1]);
      const targetRange = index >= 0 ? `${this.config.linesSheet}!A${index + 1}:P${index + 1}` : `${this.config.linesSheet}!A:P`;
      const normalized = [...row.slice(0, 8), asNumber(row[8]), row[9], asNumber(row[10]), asPercent(row[11]), asNumber(row[12]), asNumber(row[13]), asNumber(row[14]), row[15]];
      await googleFetch<Json>(token, `${base}/values/${encodeURIComponent(targetRange)}${index >= 0 ? "?valueInputOption=RAW" : ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"}`, { method: index >= 0 ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(index >= 0 ? { range: targetRange, majorDimension: "ROWS", values: [normalized] } : { majorDimension: "ROWS", values: [normalized] }) });
    }
  }
}
