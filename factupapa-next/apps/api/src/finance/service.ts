import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Pool, PoolClient } from "pg";
import { PDFParse } from "pdf-parse";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError, isPostgresUniqueViolation } from "../http/errors.js";
import { lineAmounts, sumAmounts } from "../sales/money.js";
import {
  extractPurchaseFields,
  classifyLocalFiscalDocument,
  type ExtractedPurchaseFields,
} from "./extraction.js";
import {
  DEFAULT_VISION_MODEL,
  extractPurchaseFieldsWithVision,
  prepareVisionImage,
  stripOwnTaxId,
  type VisionDocument,
} from "./extraction-vision.js";
import { recognizeWithTimeout } from "./ocr.js";
import {
  OcrBudget,
  OcrBudgetExceededError,
  type OcrBudgetLimits,
} from "./ocr-budget.js";
import type { PurchaseInput, RecurringExpenseInput } from "./validation.js";
import { canonicalInvoiceNumber, canonicalSupplierTaxId } from "./invoice-number.js";
const extractionScore = (x: ExtractedPurchaseFields) =>
  (x.supplierTaxId ? 4 : 0) +
  (x.issueDate ? 3 : 0) +
  (x.total ? 4 : 0) +
  (x.subtotal ? 2 : 0) +
  (x.taxTotal ? 2 : 0) +
  (x.supplierInvoiceNumber ? 2 : 0) +
  (x.supplierName ? 1 : 0);
async function bestOcr(input: Buffer, filename: string) {
  const candidates = [];
  for (const [rotation, singleColumn] of [[0, false], [0, true]] as const) {
    const page = await recognizeWithTimeout(input, 45_000, rotation, singleColumn);
    const fields = extractPurchaseFields(page.text, filename);
    candidates.push({ page, fields });
    if (extractionScore(fields) >= 14 && fields.supplierInvoiceNumber) break;
  }
  if (Math.max(...candidates.map((x) => extractionScore(x.fields))) < 10) {
    for (const rotation of [90, 270]) {
      const page = await recognizeWithTimeout(input, 45_000, rotation);
      candidates.push({ page, fields: extractPurchaseFields(page.text, filename) });
    }
  }
  return candidates.sort(
    (a, b) =>
      extractionScore(b.fields) - extractionScore(a.fields) ||
      b.page.confidence - a.page.confidence,
  )[0]!;
}
const select = `select p.id,p.supplier_id "supplierId",p.document_id "documentId",coalesce(p.supplier_legal_name,c.legal_name) "supplierName",p.supplier_tax_id "supplierTaxId",p.supplier_invoice_number "supplierInvoiceNumber",p.issue_date::text "issueDate",p.due_date::text "dueDate",p.status,p.category,p.subtotal::text,p.tax_total::text "taxTotal",p.total::text,p.notes,p.source_registry_url "sourceRegistryUrl",p.source_registry_filename "sourceRegistryFilename",
  coalesce((select sum(amount) from payments pay where pay.purchase_invoice_id=p.id),0)::text "paidTotal",
  case when abs(p.total-coalesce((select sum(amount) from payments pay where pay.purchase_invoice_id=p.id),0))<=0.01
    then 0 else greatest(p.total-coalesce((select sum(amount) from payments pay where pay.purchase_invoice_id=p.id),0),0) end::text "balanceDue",
  case when coalesce((select sum(amount) from payments pay where pay.purchase_invoice_id=p.id),0)+0.01>=p.total and p.total>0 then 'paid'
    when coalesce((select sum(amount) from payments pay where pay.purchase_invoice_id=p.id),0)>0 then 'partial'
    when p.status='confirmed' and p.due_date<current_date then 'overdue' else 'unpaid' end "paymentStatus"
  from purchase_invoices p left join contacts c on c.id=p.supplier_id`;

function parseRegistryCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const source = value.replace(/\r\n?/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows.slice(1);
}

const registryText = (value: unknown) => String(value ?? "").trim();
const registryMoney = (value: unknown) => {
  const normalized = registryText(value)
    .replace(/\s|€|%/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(4) : null;
};
const registryDate = (value: unknown) => {
  const text = registryText(value);
  const spanish = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (spanish)
    return `${spanish[3]}-${spanish[2]!.padStart(2, "0")}-${spanish[1]!.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};
const normalizedTaxId = (value: unknown) =>
  registryText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const registryUrl = (value: unknown) => {
  const text = registryText(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};
const registryCategory = (value: unknown) => {
  const category = registryText(value).toUpperCase();
  if (/AUT[ÓO]NOM/.test(category)) return "autonomo";
  if (/GESTOR/.test(category)) return "gestoria";
  if (/TRANSPORTE/.test(category)) return "transporte";
  if (/SUMINISTRO/.test(category)) return "suministros";
  if (/ALQUILER/.test(category)) return "alquiler";
  if (/IMPUEST/.test(category)) return "impuestos";
  return "mercancia";
};
const registryKey = (row: string[]) => {
  const link = registryText(row[18]);
  const driveId =
    link.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1] ??
    link.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1];
  return driveId ?? createHash("sha256").update(row.join("\u001f")).digest("hex");
};
const stockCtes = `purchase_entries as(
  select l.product_id,l.line_subtotal,
    case when l.unit=p.unit then l.quantity when l.unit='g' and p.unit='kg' then l.quantity/1000 when l.unit='kg' and p.unit='g' then l.quantity*1000 else 0 end qty
  from purchase_invoice_lines l join purchase_invoices i on i.id=l.purchase_invoice_id and i.status='confirmed' and i.deleted_at is null join products p on p.id=l.product_id
),purchase_quantities as(
  select product_id,sum(qty)qty,sum(line_subtotal)/nullif(sum(qty),0) average_cost from purchase_entries where qty>0 group by product_id
),sold_entries as(
  select l.product_id,l.quantity,l.unit from invoice_lines l join invoices i on i.id=l.invoice_id and i.status='issued' and i.source_type='manual'
  union all select l.product_id,l.quantity,l.unit from delivery_note_lines l join delivery_notes d on d.id=l.delivery_note_id and d.status in('issued','invoiced')
),sold_quantities as(
  select l.product_id,sum(case when l.unit=p.unit then l.quantity when l.unit='g' and p.unit='kg' then l.quantity/1000 when l.unit='kg' and p.unit='g' then l.quantity*1000 else 0 end)qty from sold_entries l join products p on p.id=l.product_id group by l.product_id
),adjustment_quantities as(
  select product_id,sum(quantity_delta)qty from stock_adjustments group by product_id
),production_quantities as(
  select product_id,sum(qty)qty from(
    select input_product_id product_id,-input_quantity qty from production_runs
    union all select output_product_id,output_quantity from production_runs
  )q group by product_id
),stock_rows as(
  select p.id,p.name,p.unit,p.sale_price,p.estimated_cost,b.average_cost,coalesce(b.average_cost,p.estimated_cost)current_cost,
    (coalesce(b.qty,0)-coalesce(s.qty,0)+coalesce(a.qty,0)+coalesce(pr.qty,0))current_quantity
  from products p left join purchase_quantities b on b.product_id=p.id left join sold_quantities s on s.product_id=p.id
    left join adjustment_quantities a on a.product_id=p.id left join production_quantities pr on pr.product_id=p.id where p.is_active
)`;
export class FinanceService {
  private readonly s3?: S3Client;
  private readonly ocrBudget?: OcrBudget;
  constructor(
    private pool: Pool,
    private storage?: {
      endpoint: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
    },
    private extraction?: {
      ownTaxIds: string[];
      anthropicApiKey?: string;
      visionModel?: string;
      budget?: OcrBudgetLimits;
    },
    private registry?: { url: string; token?: string },
  ) {
    if (storage)
      this.s3 = new S3Client({
        region: "us-east-1",
        endpoint: storage.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: storage.accessKey,
          secretAccessKey: storage.secretKey,
        },
      });
    if (extraction?.budget)
      this.ocrBudget = new OcrBudget(pool, extraction.budget);
  }

  async syncPurchaseRegistry(i: SessionIdentity) {
    if (!this.registry) throw new HttpError("purchase_registry_not_configured", 503);
    const endpoint = new URL(this.registry.url);
    if (this.registry.token) endpoint.searchParams.set("key", this.registry.token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let rows: string[][];
    try {
      const response = await fetch(endpoint, {
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "application/json,text/csv" },
      });
      const body = await response.text();
      if (!response.ok) throw new HttpError("purchase_registry_unavailable", 502);
      if (/^\s*[\[{]/.test(body)) {
        const payload = JSON.parse(body) as { ok?: boolean; rows?: unknown[] };
        if (payload.ok !== true || !Array.isArray(payload.rows))
          throw new HttpError("purchase_registry_invalid", 502);
        rows = payload.rows
          .filter((row): row is unknown[] => Array.isArray(row))
          .map((row) => row.map(registryText));
      } else rows = parseRegistryCsv(body);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError("purchase_registry_unavailable", 502);
    } finally {
      clearTimeout(timeout);
    }

    const purchases = rows.filter(
      (row) => registryText(row[2]).toUpperCase() === "COMPRA",
    );
    return withTenantTransaction(this.pool, i, async (client) => {
      let imported = 0, skipped = 0, drafts = 0, paid = 0;
      for (const row of purchases) {
        const key = registryKey(row);
        const exists = await client.query(
          "select 1 from purchase_invoices where source_registry_key=$1",
          [key],
        );
        if (exists.rowCount) {
          skipped += 1;
          continue;
        }
        const issueDate = registryDate(row[0]),
          supplierName = registryText(row[5]) || "Proveedor sin identificar",
          taxId = normalizedTaxId(row[6]) || null,
          invoiceNumber = registryText(row[4]) || null,
          subtotal = registryMoney(row[9]),
          taxTotal = registryMoney(row[11]),
          total = registryMoney(row[12]),
          taxRate = registryMoney(row[10]) ?? "0.0000";
        if (!issueDate || !subtotal || !taxTotal || !total) {
          skipped += 1;
          continue;
        }
        let supplier = (
          await client.query(
            `select id,legal_name,tax_id,address from contacts
             where is_active and kind in('supplier','both')
               and (($1::text is not null and regexp_replace(upper(coalesce(tax_id,'')),'[^A-Z0-9]','','g')=$1)
                 or lower(btrim(legal_name))=lower(btrim($2)))
             order by case when $1::text is not null and regexp_replace(upper(coalesce(tax_id,'')),'[^A-Z0-9]','','g')=$1 then 0 else 1 end
             limit 1`,
            [taxId, supplierName],
          )
        ).rows[0];
        if (!supplier) {
          supplier = (
            await client.query(
              `insert into contacts(company_id,kind,legal_name,tax_id,address)
               values($1,'supplier',$2,$3,'{}'::jsonb)
               returning id,legal_name,tax_id,address`,
              [i.companyId, supplierName, taxId],
            )
          ).rows[0];
        }
        if (invoiceNumber) {
          const duplicate = await client.query(
            `select 1 from purchase_invoices
             where company_id=$1 and supplier_tax_identity_key=$2
               and supplier_invoice_number_key=$3
               and extract(year from issue_date)=extract(year from $4::date)
               and status<>'cancelled'`,
            [i.companyId, canonicalSupplierTaxId(supplier.tax_id) ?? supplier.id, canonicalInvoiceNumber(invoiceNumber), issueDate],
          );
          if (duplicate.rowCount) {
            skipped += 1;
            continue;
          }
        }
        const reviewed = /^S[IÍ]$/i.test(registryText(row[20]));
        const canConfirm = reviewed && Boolean(invoiceNumber);
        const purchaseId = (
          await client.query(
            `insert into purchase_invoices(
               company_id,supplier_id,supplier_legal_name,supplier_tax_id,supplier_tax_identity_key,supplier_address,
               supplier_invoice_number,supplier_invoice_number_key,issue_date,category,notes,subtotal,tax_total,total,
               created_by_user_id,source_registry_key,source_registry_url,source_registry_filename)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             returning id`,
            [
              i.companyId, supplier.id, supplier.legal_name, supplier.tax_id,
              canonicalSupplierTaxId(supplier.tax_id) ?? supplier.id, supplier.address,
              invoiceNumber, canonicalInvoiceNumber(invoiceNumber), issueDate, registryCategory(row[8]),
              [registryText(row[21]), "Importada del registro maestro"].filter(Boolean).join(" · "),
              subtotal, taxTotal, total, i.userId, key, registryUrl(row[18]),
              registryText(row[19]) || null,
            ],
          )
        ).rows[0].id as string;
        await client.query(
          `insert into purchase_invoice_lines(
             company_id,purchase_invoice_id,description,quantity,unit,unit_cost,tax_rate,
             line_subtotal,line_tax,line_total,position)
           values($1,$2,$3,1,'custom',$4,$5,$4,$6,$7,1)`,
          [
            i.companyId, purchaseId, registryText(row[7]) || "Compra",
            subtotal, taxRate, taxTotal, total,
          ],
        );
        if (canConfirm)
          await client.query(
            "update purchase_invoices set status='confirmed',confirmed_at=now() where id=$1",
            [purchaseId],
          );
        else drafts += 1;
        if (
          canConfirm &&
          /PAGAD|COBRAD|ABONAD/i.test(registryText(row[13]))
        ) {
          await client.query(
            `insert into payments(company_id,purchase_invoice_id,contact_id,direction,amount,paid_at,method,reference,created_by_user_id)
             values($1,$2,$3,'outgoing',$4,$5::date + time '12:00',$6,'Registro maestro',$7)`,
            [
              i.companyId, purchaseId, supplier.id, total, issueDate,
              registryText(row[14]) || null, i.userId,
            ],
          );
          paid += 1;
        }
        await recordAudit(client, {
          companyId: i.companyId,
          actorUserId: i.userId,
          entityType: "purchase_invoice",
          entityId: purchaseId,
          action: "purchase_invoice.registry_imported",
          after: { sourceRegistryKey: key, confirmed: canConfirm },
        });
        imported += 1;
      }
      return { fetched: purchases.length, imported, skipped, drafts, paid };
    });
  }

  purchaseRegistryStatus() {
    return {
      configured: Boolean(this.registry),
      label: "Registro maestro de compras",
    };
  }

  async ocrBudgetStatus(i: SessionIdentity) {
    if (!this.ocrBudget) throw new HttpError("not_found", 404);
    return this.ocrBudget.status(i);
  }

  async findPurchaseDocumentBySha(i: SessionIdentity, sha256: string) {
    return withTenantTransaction(this.pool, i, async (client) =>
      (
        await client.query<{ id: string; status: string }>(
          `select id,status from documents
           where kind='purchase_invoice' and sha256=$1
           order by case when status='needs_review' then 0 when status='validated' then 1 else 2 end, created_at desc limit 1`,
          [sha256],
        )
      ).rows[0] ?? null,
    );
  }

  async findPurchaseByInvoiceIdentity(
    i: SessionIdentity,
    supplierTaxId: string,
    invoiceNumber: string,
    issueDate: string,
  ) {
    return withTenantTransaction(this.pool, i, async (client) =>
      (
        await client.query<{ id: string }>(
          `select id from purchase_invoices
             where company_id=$1
               and supplier_tax_identity_key=$2
               and supplier_invoice_number_key=$3
               and extract(year from issue_date)=extract(year from $4::date)
               and status<>'cancelled' and deleted_at is null
             limit 1`,
          [i.companyId, canonicalSupplierTaxId(supplierTaxId), canonicalInvoiceNumber(invoiceNumber), issueDate],
        )
      ).rows[0] ?? null,
    );
  }

  async listPendingDocuments(i: SessionIdentity) {
    return withTenantTransaction(this.pool, i, async (client) =>
      (
        await client.query(
          `select d.id,d.original_filename filename,d.mime_type "mimeType",
             d.byte_size::text "byteSize",d.status,d.extracted_data "extractedData",
             d.created_at::text "createdAt",g.sender_email "senderEmail",
             g.subject,g.received_at::text "receivedAt"
           from documents d
           left join lateral (
             select sender_email,subject,received_at
             from gmail_purchase_imports
             where document_id=d.id
             order by updated_at desc, id desc
             limit 1
           ) g on true
           where d.kind='purchase_invoice' and d.status='needs_review'
             and not exists(select 1 from purchase_invoices p where p.document_id=d.id)
           order by coalesce(g.received_at,d.created_at) desc
           limit 100`,
        )
      ).rows,
    );
  }

  async listRejectedDocuments(i: SessionIdentity) {
    return withTenantTransaction(this.pool, i, async (client) =>
      (
        await client.query(
          `select d.id,d.original_filename filename,d.mime_type "mimeType",
             d.byte_size::text "byteSize",d.status,d.extracted_data "extractedData",
             d.created_at::text "createdAt",d.updated_at::text "updatedAt",
             g.sender_email "senderEmail",g.subject,g.received_at::text "receivedAt"
           from documents d
           left join gmail_purchase_imports g on g.document_id=d.id
           where d.kind='purchase_invoice' and d.status='rejected'
             and not exists(select 1 from purchase_invoices p where p.document_id=d.id)
           order by d.updated_at desc
           limit 50`,
        )
      ).rows,
    );
  }

  async getPendingDocument(i: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, i, async (client) => {
      const row = (
        await client.query(
          `select d.id,d.original_filename filename,d.mime_type "mimeType",
             d.byte_size::text "byteSize",d.status,d.extracted_data "extractedData",
             d.created_at::text "createdAt",g.sender_email "senderEmail",
             g.subject,g.received_at::text "receivedAt"
           from documents d
           left join gmail_purchase_imports g on g.document_id=d.id
           where d.id=$1 and d.kind='purchase_invoice' and d.status='needs_review'
             and not exists(select 1 from purchase_invoices p where p.document_id=d.id)`,
          [id],
        )
      ).rows[0];
      if (!row) throw new HttpError("not_found", 404);
      return row;
    });
  }
  async rejectPendingDocument(i: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, i, async (client) => {
      const row = (
        await client.query<{ id: string; filename: string }>(
          `update documents d
           set status='rejected',updated_at=now()
           where d.id=$1 and d.kind='purchase_invoice' and d.status='needs_review'
             and not exists(select 1 from purchase_invoices p where p.document_id=d.id)
           returning d.id,d.original_filename filename`,
          [id],
        )
      ).rows[0];
      if (!row) throw new HttpError("not_found", 404);
      await recordAudit(client, {
        companyId: i.companyId,
        actorUserId: i.userId,
        entityType: "document",
        entityId: id,
        action: "document.rejected",
        before: { status: "needs_review" },
        after: { status: "rejected", filename: row.filename },
      });
    });
  }
  async restoreRejectedDocument(i: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, i, async (client) => {
      const row = (
        await client.query<{ id: string; filename: string }>(
          `update documents d
           set status='needs_review',updated_at=now()
           where d.id=$1 and d.kind='purchase_invoice' and d.status='rejected'
             and not exists(select 1 from purchase_invoices p where p.document_id=d.id)
           returning d.id,d.original_filename filename`,
          [id],
        )
      ).rows[0];
      if (!row) throw new HttpError("not_found", 404);
      await recordAudit(client, {
        companyId: i.companyId,
        actorUserId: i.userId,
        entityType: "document",
        entityId: id,
        action: "document.restored",
        before: { status: "rejected" },
        after: { status: "needs_review", filename: row.filename },
      });
    });
  }
  async archiveDocument(
    i: SessionIdentity,
    input: {
      filename: unknown;
      mimeType: unknown;
      contentBase64: unknown;
    },
  ) {
    if ((!this.s3 || !this.storage) && input.documentId == null) throw new HttpError("conflict", 409);
    if (
      typeof input.filename !== "string" ||
      !input.filename.trim() ||
      input.filename.length > 255 ||
      typeof input.mimeType !== "string" ||
      !new Set([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/heif",
      ]).has(input.mimeType) ||
      typeof input.contentBase64 !== "string" ||
      !/^[-A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)
    )
      throw new HttpError("invalid_request", 400);
    const filename = input.filename.trim();
    const body = Buffer.from(input.contentBase64, "base64");
    if (!body.length || body.length > 10_000_000)
      throw new HttpError("payload_too_large", 413);
    const mime = input.mimeType;
    const heifBrand = body.subarray(4, 12).toString("ascii");
    const validSignature =
      mime === "application/pdf"
        ? body.subarray(0, 5).toString("ascii") === "%PDF-"
        : mime === "image/png"
          ? body
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : mime === "image/jpeg"
            ? body.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : /^ftyp(?:heic|heix|hevc|hevx|mif1|msf1)$/.test(heifBrand);
    if (!validSignature) throw new HttpError("invalid_request", 400);

    const id = randomUUID();
    const extension =
      mime === "application/pdf"
        ? "pdf"
        : mime === "image/png"
          ? "png"
          : mime === "image/jpeg"
            ? "jpg"
            : "heic";
    const key = `${i.companyId}/purchases/${id}.${extension}`;
    const sha = createHash("sha256").update(body).digest("hex");
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.storage.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
        Metadata: { sha256: sha },
      }),
    );
    try {
      return await withTenantTransaction(this.pool, i, async (client) => {
        const row = (
          await client.query(
            `insert into documents(
               id,company_id,kind,status,original_filename,storage_key,
               mime_type,byte_size,sha256,uploaded_by,extracted_data)
             values($1,$2,'purchase_invoice','uploaded',$3,$4,$5,$6,$7,$8,'{}'::jsonb)
             returning id,original_filename filename,mime_type "mimeType",
               byte_size::text "byteSize",status`,
            [
              id,
              i.companyId,
              filename,
              key,
              mime,
              body.length,
              sha,
              i.userId,
            ],
          )
        ).rows[0];
        await recordAudit(client, {
          companyId: i.companyId,
          actorUserId: i.userId,
          entityType: "document",
          entityId: id,
          action: "document.archived",
          after: { kind: "purchase_invoice", mimeType: mime },
        });
        return row;
      });
    } catch (error) {
      await this.s3
        .send(
          new DeleteObjectCommand({
            Bucket: this.storage.bucket,
            Key: key,
          }),
        )
        .catch(() => undefined);
      throw error;
    }
  }
  async uploadDocument(
    i: SessionIdentity,
    input: {
      filename: unknown;
      mimeType: unknown;
      contentBase64: unknown;
      documentId?: unknown;
      persist?: unknown;
    },
  ) {
    if (!this.s3 || !this.storage) throw new HttpError("conflict", 409);
    if (
      typeof input.filename !== "string" ||
      !input.filename.trim() ||
      input.filename.length > 255 ||
      typeof input.mimeType !== "string" ||
      !new Set(["application/pdf", "image/jpeg", "image/png"]).has(
        input.mimeType,
      ) ||
      typeof input.contentBase64 !== "string" ||
      !/^[-A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64) ||
      (input.documentId != null &&
        (typeof input.documentId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            input.documentId,
          ))) || (input.persist != null && typeof input.persist !== "boolean")
    )
      throw new HttpError("invalid_request", 400);
    const body = Buffer.from(input.contentBase64, "base64"),
      mime = input.mimeType;
    if (!body.length || body.length > 10_000_000)
      throw new HttpError("payload_too_large", 413);
    const ok =
      mime === "application/pdf"
        ? body.subarray(0, 5).toString("ascii") === "%PDF-"
        : mime === "image/png"
          ? body
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : body.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    if (!ok) throw new HttpError("invalid_request", 400);
    const id = (input.documentId as string | undefined) ?? randomUUID(),
      ext =
        mime === "application/pdf"
          ? "pdf"
          : mime === "image/png"
            ? "png"
            : "jpg",
      key = `${i.companyId}/purchases/${id}.${ext}`,
      sha = createHash("sha256").update(body).digest("hex"),
      isRetry = Boolean(input.documentId);
    let extracted: ExtractedPurchaseFields = {};
    const visionEnabled = Boolean(this.extraction?.anthropicApiKey);
    let visionFailed = false;
    let visionBudgetExhausted = false;
    const tryVision = async (document: VisionDocument) => {
      if (!this.extraction?.anthropicApiKey) return undefined;
      const model = this.extraction.visionModel ?? DEFAULT_VISION_MODEL;
      try {
        return await extractPurchaseFieldsWithVision(document, {
          apiKey: this.extraction.anthropicApiKey,
          ownTaxIds: this.extraction.ownTaxIds,
          model,
          ...(this.ocrBudget
            ? {
                beforeAttempt: () => this.ocrBudget!.reserve(i, model),
                onAttemptSuccess: (reservationId, usage) =>
                  this.ocrBudget!
                    .complete(i, reservationId, usage)
                    .catch(() => undefined),
                onAttemptFailure: (reservationId) =>
                  this.ocrBudget!.fail(i, reservationId),
              }
            : {}),
        });
      } catch (error) {
        if (error instanceof OcrBudgetExceededError)
          visionBudgetExhausted = true;
        visionFailed = true;
        return undefined;
      }
    };
    if (mime === "application/pdf") {
      let parser: PDFParse | undefined;
      try {
        parser = new PDFParse({ data: new Uint8Array(body) });
        const parsed = await Promise.race([
          parser.getText({ first: 5 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 5000),
          ),
        ]);
        const hasTextLayer = parsed.text.replace(/\s/g, "").length >= 80;
        if (hasTextLayer) {
          const vision = await tryVision({ kind: "text", text: parsed.text });
          if (vision)
            extracted = { ...vision, ocrConfidence: 100, source: "pdf_text" };
        }
        const textFields = !extracted.source
          ? extractPurchaseFields(parsed.text, input.filename)
          : undefined;
        if (
          !extracted.source &&
          hasTextLayer &&
          textFields &&
          (textFields.total || textFields.supplierTaxId)
        ) {
          extracted = classifyLocalFiscalDocument(parsed.text, { ...textFields, ocrConfidence: 100, source: "pdf_text" }, this.extraction?.ownTaxIds ?? []);
        } else if (!extracted.source) {
          const screenshots = await parser.getScreenshot({
            first: 2,
            desiredWidth: 2200,
            imageBuffer: true,
            imageDataUrl: false,
          });
          const pageBuffers = screenshots.pages
            .slice(0, 2)
            .map((page) => Buffer.from(page.data));
          if (visionEnabled && pageBuffers.length) {
            const images = [];
            for (const buffer of pageBuffers)
              images.push(await prepareVisionImage(buffer));
            const vision = await tryVision({
              kind: "images",
              images,
              mediaType: "image/jpeg",
            });
            if (vision) extracted = { ...vision, source: "vision" };
          }
          if (!extracted.source) {
            const pages = [];
            for (const buffer of pageBuffers)
              pages.push(await bestOcr(buffer, input.filename));
            const ocrText = pages.map((x) => x.page.text).join("\n");
            const fields = classifyLocalFiscalDocument(ocrText, extractPurchaseFields(ocrText, input.filename), this.extraction?.ownTaxIds ?? []);
            extracted = {
              ...fields,
              ocrConfidence: pages.length
                ? Math.round(
                    pages.reduce((sum, page) => sum + page.page.confidence, 0) /
                      pages.length,
                  )
                : 0,
              source: "ocr",
            };
          }
        }
      } catch {
        extracted = {
          warnings: ["ocr_failed"],
          ocrConfidence: 0,
          source: "ocr",
        };
      } finally {
        await parser?.destroy().catch(() => undefined);
      }
    } else {
      try {
        if (visionEnabled) {
          const vision = await tryVision({
            kind: "images",
            images: [await prepareVisionImage(body)],
            mediaType: "image/jpeg",
          });
          if (vision) extracted = { ...vision, source: "vision" };
        }
        if (!extracted.source) {
          const candidate = await bestOcr(body, input.filename),
            page = candidate.page;
          extracted = {
            ...classifyLocalFiscalDocument(candidate.page.text, candidate.fields, this.extraction?.ownTaxIds ?? []),
            ocrConfidence: page.confidence,
            source: "ocr",
          };
        }
      } catch {
        extracted = { warnings: ["ocr_failed"], ocrConfidence: 0, source: "ocr" };
      }
    }
    extracted = stripOwnTaxId(extracted, this.extraction?.ownTaxIds ?? []);
    if (visionFailed && extracted.source !== "vision")
      extracted = {
        ...extracted,
        warnings: [
          ...new Set([
            ...(extracted.warnings ?? []),
            visionBudgetExhausted
              ? "vision_budget_exhausted"
              : "vision_unavailable",
          ]),
        ],
      };
    if (!isRetry && input.persist !== false) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.storage.bucket,
          Key: key,
          Body: body,
          ContentType: mime,
          Metadata: { sha256: sha },
        }),
      );
    }
    try {
      return await withTenantTransaction(
        this.pool,
        i,
        async (c) => {
          const supplier = extracted.supplierTaxId
            ? (
                await c.query(
                  `select id,legal_name from contacts where is_active and kind in ('supplier','both') and upper(regexp_replace(coalesce(tax_id,''),'[^A-Z0-9]','','g'))=upper(regexp_replace($1,'[^A-Z0-9]','','g')) limit 1`,
                  [extracted.supplierTaxId],
                )
              ).rows[0]
            : undefined;
          const duplicate =
            extracted.supplierInvoiceNumber && supplier
              ? Boolean(
                  (
                    await c.query(
                      `select 1 from purchase_invoices where company_id=$1 and supplier_tax_identity_key=$2 and supplier_invoice_number_key=$3 and extract(year from issue_date)=extract(year from $4::date) and status<>'cancelled' and deleted_at is null limit 1`,
                      [i.companyId, canonicalSupplierTaxId(extracted.supplierTaxId) ?? supplier.id, canonicalInvoiceNumber(extracted.supplierInvoiceNumber), extracted.issueDate],
                    )
                  ).rowCount,
                )
              : false;
          const normalized = {
            ...extracted,
            ...(supplier ? { supplierId: supplier.id, supplierName: supplier.legal_name } : {}),
            warnings: [
              ...new Set([
                ...(extracted.warnings ?? []),
                ...(duplicate ? ["possible_duplicate"] : []),
                ...(extracted.source === "ocr" &&
                (extracted.ocrConfidence ?? 0) < 70
                  ? ["low_confidence"]
                  : []),
              ]),
            ],
          };
          const provider =
              normalized.source === "vision" || normalized.fieldConfidence
                ? `anthropic-${this.extraction?.visionModel ?? DEFAULT_VISION_MODEL}`
                : normalized.source === "ocr"
                  ? "tesseract-spa-eng"
                  : "local-pdf-text",
            confidence =
              normalized.ocrConfidence == null
                ? null
                : normalized.ocrConfidence / 100;
          if (input.persist === false) {
            return {
              id,
              filename: (input.filename as string).trim(),
              mimeType: mime,
              byteSize: String(body.length),
              status: "preview",
              extractedData: normalized,
            };
          }
          if (isRetry) {
            const retried = (
              await c.query(
                `update documents
                 set sha256=$5,ocr_provider=$2,ocr_confidence=$3,extracted_data=$4,updated_at=now()
                 where id=$1 and kind='purchase_invoice'
                   and not exists(
                     select 1 from purchase_invoices p where p.document_id=documents.id
                   )
                 returning id,original_filename filename,mime_type "mimeType",byte_size::text "byteSize",status,extracted_data "extractedData"`,
                [id, provider, confidence, normalized, sha],
              )
            ).rows[0];
            if (!retried) throw new HttpError("conflict", 409);
            return retried;
          }
          return (
            await c.query(
              `insert into documents(id,company_id,kind,status,original_filename,storage_key,mime_type,byte_size,sha256,uploaded_by,ocr_provider,ocr_confidence,extracted_data)values($1,$2,'purchase_invoice','needs_review',$3,$4,$5,$6,$7,$8,$9,$10,$11)returning id,original_filename filename,mime_type "mimeType",byte_size::text "byteSize",status,extracted_data "extractedData"`,
              [
                id,
                i.companyId,
                (input.filename as string).trim(),
                key,
                mime,
                body.length,
                sha,
                i.userId,
                provider,
                confidence,
                normalized,
              ],
            )
          ).rows[0];
        },
      );
    } catch (e) {
      if (!isRetry && input.persist !== false)
        await this.s3
          .send(
            new DeleteObjectCommand({ Bucket: this.storage.bucket, Key: key }),
          )
          .catch(() => undefined);
      throw e;
    }
  }
  async downloadDocument(i: SessionIdentity, id: string) {
    if (!this.s3 || !this.storage) throw new HttpError("not_found", 404);
    return withTenantTransaction(this.pool, i, async (c) => {
      const row = (
        await c.query(
          `select storage_key,mime_type,original_filename from documents where id=$1 and kind='purchase_invoice'`,
          [id],
        )
      ).rows[0];
      if (!row) throw new HttpError("not_found", 404);
      const o = await this.s3!.send(
        new GetObjectCommand({
          Bucket: this.storage!.bucket,
          Key: row.storage_key,
        }),
      );
      if (!o.Body) throw new HttpError("not_found", 404);
      return {
        body: Buffer.from(await o.Body.transformToByteArray()),
        mimeType: row.mime_type as string,
        filename: row.original_filename as string,
      };
    });
  }
  async listPurchases(i: SessionIdentity, r: { from: string; to: string }) {
    return withTenantTransaction(
      this.pool,
      i,
      async (c) =>
        (
          await c.query(
            `${select} where p.deleted_at is null and p.issue_date between $1 and $2 order by p.issue_date desc,p.id desc limit 500`,
            [r.from, r.to],
          )
        ).rows,
    );
  }
  async exportConfirmedPurchases(
    i: SessionIdentity,
    r: { from: string; to: string },
  ) {
    return withTenantTransaction(
      this.pool,
      i,
      async (c) =>
        (
          await c.query(
            `${select} where p.deleted_at is null and p.issue_date between $1 and $2 and p.status='confirmed' order by p.issue_date,p.id`,
            [r.from, r.to],
          )
        ).rows,
    );
  }
  private async getIn(c: PoolClient, id: string) {
    const row = (await c.query(`${select} where p.id=$1 and p.deleted_at is null`, [id])).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    return {
      ...row,
      lines: (
        await c.query(
          `select id,product_id "productId",description,quantity::text,unit,unit_cost::text "unitCost",tax_rate::text "taxRate",line_subtotal::text "lineSubtotal",line_tax::text "lineTax",line_total::text "lineTotal",position from purchase_invoice_lines where purchase_invoice_id=$1 order by position`,
          [id],
        )
      ).rows,
    };
  }
  async getPurchase(i: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, i, (c) => this.getIn(c, id));
  }
  async createPurchase(i: SessionIdentity, input: PurchaseInput) {
    try {
      return await withTenantTransaction(this.pool, i, async (c) => {
        const supplier = (
          await c.query(
            `select legal_name,tax_id,address from contacts where id=$1 and is_active and kind in('supplier','both')`,
            [input.supplierId],
          )
        ).rows[0];
        if (!supplier) throw new HttpError("not_found", 404);
        const amounts = input.lines.map((l) =>
            lineAmounts(l.quantity, l.unitCost, l.taxRate),
          ),
          totals = sumAmounts(
            amounts.map((a) => ({
              lineSubtotal: a.subtotal,
              lineTax: a.tax,
              lineTotal: a.total,
            })),
          );
        const id = (
          await c.query(
            `insert into purchase_invoices(company_id,supplier_id,supplier_legal_name,supplier_tax_id,supplier_tax_identity_key,supplier_invoice_number,supplier_invoice_number_key,supplier_address,document_id,issue_date,due_date,category,notes,subtotal,tax_total,total,status,confirmed_at,created_by_user_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)returning id`,
            [
              i.companyId,
              input.supplierId,
              supplier.legal_name,
              supplier.tax_id,
              canonicalSupplierTaxId(supplier.tax_id) ?? input.supplierId,
              input.supplierInvoiceNumber,
              canonicalInvoiceNumber(input.supplierInvoiceNumber),
              supplier.address,
              input.documentId,
              input.issueDate,
              input.dueDate,
              input.category,
              input.notes,
              totals.subtotal,
              totals.taxTotal,
              totals.total,
              input.status ?? "draft",
              input.status === "confirmed" ? new Date() : null,
              i.userId,
            ],
          )
        ).rows[0].id;
        for (const [position, l] of input.lines.entries()) {
          const a = amounts[position]!;
          await c.query(
            `insert into purchase_invoice_lines(company_id,purchase_invoice_id,product_id,description,quantity,unit,unit_cost,tax_rate,line_subtotal,line_tax,line_total,position)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              i.companyId,
              id,
              l.productId,
              l.description,
              l.quantity,
              l.unit,
              l.unitCost,
              l.taxRate,
              a.subtotal,
              a.tax,
              a.total,
              position + 1,
            ],
          );
        }
        await recordAudit(c, {
          companyId: i.companyId,
          actorUserId: i.userId,
          entityType: "purchase_invoice",
          entityId: id,
          action: "purchase_invoice.created",
          after: { status: input.status ?? "draft", total: totals.total },
        });
        return this.getIn(c, id);
      });
    } catch (e) {
      if (isPostgresUniqueViolation(e)) throw new HttpError("conflict", 409);
      throw e;
    }
  }
  async transitionPurchase(
    i: SessionIdentity,
    id: string,
    status: "confirmed" | "cancelled",
  ) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const before = (
        await c.query(
          `select status,supplier_id,supplier_invoice_number from purchase_invoices where id=$1 for update`,
          [id],
        )
      ).rows[0];
      if (!before) throw new HttpError("not_found", 404);
      if (before.status !== "draft") throw new HttpError("conflict", 409);
      // Avoid reusing a parameter in enum and text comparison contexts. That
      // makes PostgreSQL reject the statement with 42P08 before triggers run.
      await c.query(
        status === "confirmed"
          ? `update purchase_invoices
             set status='confirmed',confirmed_at=now(),cancelled_at=null
             where id=$1`
          : `update purchase_invoices
             set status='cancelled',cancelled_at=now(),confirmed_at=null
             where id=$1`,
        [id],
      );
      return this.getIn(c, id);
    });
  }
  async deletePurchase(i: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const before = (
        await c.query(
          `select id,status,document_id "documentId",supplier_invoice_number "supplierInvoiceNumber",total::text
           from purchase_invoices where id=$1 and deleted_at is null for update`,
          [id],
        )
      ).rows[0];
      if (!before) throw new HttpError("not_found", 404);
      await c.query(
        `update purchase_invoices
         set deleted_at=now(),deleted_by_user_id=$2,delete_reason='Eliminada desde la app'
         where id=$1 and deleted_at is null`,
        [id, i.userId],
      );
      await recordAudit(c, {
        companyId: i.companyId,
        actorUserId: i.userId,
        entityType: "purchase_invoice",
        entityId: id,
        action: "purchase_invoice.deleted",
        before,
        after: { deleted: true, reason: "Eliminada desde la app" },
      });
    });
  }
  async listRecurring(i: SessionIdentity) {
    return withTenantTransaction(
      this.pool,
      i,
      async (c) =>
        (
          await c.query(
            `select r.id,r.supplier_id "supplierId",c.legal_name "supplierName",r.name,r.category,r.amount::text,r.tax_rate::text "taxRate",r.charge_day "chargeDay",r.starts_on::text "startsOn",r.ends_on::text "endsOn",r.is_active "isActive",r.notes from recurring_expenses r left join contacts c on c.id=r.supplier_id order by r.is_active desc,r.name`,
          )
        ).rows,
    );
  }
  async createRecurring(i: SessionIdentity, x: RecurringExpenseInput) {
    return withTenantTransaction(
      this.pool,
      i,
      async (c) =>
        (
          await c.query(
            `insert into recurring_expenses(company_id,supplier_id,name,category,amount,tax_rate,charge_day,starts_on,ends_on,notes,created_by_user_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)returning id,supplier_id "supplierId",name,category,amount::text,tax_rate::text "taxRate",charge_day "chargeDay",starts_on::text "startsOn",ends_on::text "endsOn",is_active "isActive",notes`,
            [
              i.companyId,
              x.supplierId,
              x.name,
              x.category,
              x.amount,
              x.taxRate,
              x.chargeDay,
              x.startsOn,
              x.endsOn,
              x.notes,
              i.userId,
            ],
          )
        ).rows[0],
    );
  }
  async deactivateRecurring(i: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const r = await c.query(
        `update recurring_expenses set is_active=false,ends_on=least(coalesce(ends_on,current_date),current_date)where id=$1 and is_active returning id`,
        [id],
      );
      if (!r.rowCount) throw new HttpError("not_found", 404);
    });
  }
  async addStockAdjustment(
    i: SessionIdentity,
    x: {
      productId: string;
      occurredOn: string;
      quantityDelta: string;
      reason: string;
      note: string | null;
    },
  ) {
    return withTenantTransaction(
      this.pool,
      i,
      async (c) =>
        (
          await c.query(
            `insert into stock_adjustments(company_id,product_id,occurred_on,quantity_delta,reason,note,created_by_user_id)values($1,$2,$3,$4,$5,$6,$7)returning id`,
            [
              i.companyId,
              x.productId,
              x.occurredOn,
              x.quantityDelta,
              x.reason,
              x.note,
              i.userId,
            ],
          )
        ).rows[0],
    );
  }
  async stock(i: SessionIdentity) {
    return withTenantTransaction(
      this.pool,
      i,
      async (c) =>
        (
          await c.query(
            `with ${stockCtes} select id "productId",name,unit,current_quantity::text quantity,sale_price::text "salePrice",estimated_cost::text "estimatedCost",average_cost::text "averagePurchaseCost",(current_quantity*sale_price)::text "potentialRevenue",case when current_cost is null then null else(current_quantity*current_cost)::text end "stockValue",case when current_cost is null then null else(current_quantity*(sale_price-current_cost))::text end "potentialGrossMargin" from stock_rows order by name`,
          )
        ).rows,
    );
  }
  async stockMovements(i: SessionIdentity, productId?: string) {
    return withTenantTransaction(this.pool, i, async (c) =>
      (
        await c.query(
          `with movements as(
            select l.id,l.product_id,i.issue_date occurred_on,'purchase' kind,
              case when l.unit=p.unit then l.quantity when l.unit='g' and p.unit='kg' then l.quantity/1000 when l.unit='kg' and p.unit='g' then l.quantity*1000 else 0 end quantity_delta,
              coalesce(i.supplier_invoice_number,'Compra confirmada') reference
            from purchase_invoice_lines l join purchase_invoices i on i.id=l.purchase_invoice_id and i.status='confirmed' and i.deleted_at is null join products p on p.id=l.product_id
            union all
            select l.id,l.product_id,i.issue_date,'sale',
              -(case when l.unit=p.unit then l.quantity when l.unit='g' and p.unit='kg' then l.quantity/1000 when l.unit='kg' and p.unit='g' then l.quantity*1000 else 0 end),
              coalesce(i.series||'-'||i.number::text,'Factura emitida')
            from invoice_lines l join invoices i on i.id=l.invoice_id and i.status='issued' and i.source_type='manual' join products p on p.id=l.product_id
            union all
            select l.id,l.product_id,d.issue_date,'sale',
              -(case when l.unit=p.unit then l.quantity when l.unit='g' and p.unit='kg' then l.quantity/1000 when l.unit='kg' and p.unit='g' then l.quantity*1000 else 0 end),
              coalesce(d.series||'-'||d.number::text,'Albarán emitido')
            from delivery_note_lines l join delivery_notes d on d.id=l.delivery_note_id and d.status in('issued','invoiced') join products p on p.id=l.product_id
            union all
            select a.id,a.product_id,a.occurred_on,'adjustment',a.quantity_delta,
              coalesce(a.note,case a.reason when 'loss' then 'Merma' when 'initial' then 'Stock inicial' when 'correction' then 'Recuento físico' else 'Ajuste' end)
            from stock_adjustments a
            union all
            select r.id,r.input_product_id,r.occurred_on,'production',-r.input_quantity,
              'Materia prima usada en producción'
            from production_runs r
            union all
            select r.id,r.output_product_id,r.occurred_on,'production',r.output_quantity,
              coalesce(r.package_quantity::text||' envases producidos','Producción terminada')
            from production_runs r
          )
          select m.id,m.product_id "productId",p.name "productName",p.unit,m.occurred_on::text "occurredOn",m.kind,m.quantity_delta::text "quantityDelta",m.reference
          from movements m join products p on p.id=m.product_id
          where ($1::uuid is null or m.product_id=$1) and m.quantity_delta<>0
          order by m.occurred_on desc,m.id desc limit 250`,
          [productId ?? null],
        )
      ).rows,
    );
  }
  async productionRuns(i: SessionIdentity) {
    return withTenantTransaction(this.pool,i,async(c)=>(await c.query(
      `select r.id,r.input_product_id "inputProductId",ip.name "inputProductName",
        r.output_product_id "outputProductId",op.name "outputProductName",r.occurred_on::text "occurredOn",
        r.input_quantity::text "inputQuantity",r.output_quantity::text "outputQuantity",
        r.loss_quantity::text "lossQuantity",r.package_quantity::text "packageQuantity",r.notes
       from production_runs r join products ip on ip.id=r.input_product_id join products op on op.id=r.output_product_id
       order by r.occurred_on desc,r.id desc limit 100`)).rows);
  }
  async createProductionRun(i: SessionIdentity,x: import("./validation.js").ProductionRunInput) {
    return withTenantTransaction(this.pool,i,async(c)=>{
      const products=await c.query(`select id from products where id=any($1::uuid[]) and is_active`,[[x.inputProductId,x.outputProductId]]);
      if(products.rowCount!==2) throw new HttpError("not_found",404);
      const current=(await c.query(`with ${stockCtes} select current_quantity from stock_rows where id=$1`,[x.inputProductId])).rows[0];
      if(!current || Number(current.current_quantity)<Number(x.inputQuantity)) throw new HttpError("conflict",409);
      const row=(await c.query(
        `insert into production_runs(company_id,input_product_id,output_product_id,occurred_on,input_quantity,output_quantity,package_quantity,notes,created_by_user_id)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [i.companyId,x.inputProductId,x.outputProductId,x.occurredOn,x.inputQuantity,x.outputQuantity,x.packageQuantity,x.notes,i.userId])).rows[0];
      await recordAudit(c,{companyId:i.companyId,actorUserId:i.userId,entityType:"production_run",entityId:row.id,
        action:"production_run.created",after:x});
      return row;
    });
  }
  async setStockLevel(
    i: SessionIdentity,
    x: {
      productId: string;
      occurredOn: string;
      targetQuantity: string;
      note: string | null;
    },
  ) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const product = await c.query(
        `select id from products where id=$1 and is_active for update`,
        [x.productId],
      );
      if (!product.rowCount) throw new HttpError("not_found", 404);
      const current = (
        await c.query(
          `with ${stockCtes} select current_quantity::text quantity from stock_rows where id=$1`,
          [x.productId],
        )
      ).rows[0];
      const adjustment = await c.query(
        `insert into stock_adjustments(company_id,product_id,occurred_on,quantity_delta,reason,note,created_by_user_id)
         select $1,$2,$3,$4::numeric-$5::numeric,'correction',$6,$7 where $4::numeric<>$5::numeric returning id`,
        [
          i.companyId,
          x.productId,
          x.occurredOn,
          x.targetQuantity,
          current.quantity,
          x.note ?? "Recuento físico de existencias",
          i.userId,
        ],
      );
      return { adjusted: Boolean(adjustment.rowCount), quantity: x.targetQuantity };
    });
  }
  async summary(i: SessionIdentity, r: { from: string; to: string }) {
    return withTenantTransaction(
      this.pool,
      i,
      async (c) =>
        (
          await c.query(
            `with period_sales as(select coalesce(sum(total),0)total from invoices where status='issued' and issue_date between $1 and $2),
             period_purchases as(select coalesce(sum(total),0)total from purchase_invoices where status='confirmed' and deleted_at is null and issue_date between $1 and $2),
             months as(select generate_series(date_trunc('month',$1::date::timestamp),date_trunc('month',$2::date::timestamp),interval'1 month')::date as month_start),
             period_recurring as(select coalesce(sum(r.amount),0)total from recurring_expenses r join months m on r.starts_on<=m.month_start+interval'1 month - 1 day' and(r.ends_on is null or r.ends_on>=m.month_start)),
             receivables as(select coalesce(sum(case when abs(i.total-coalesce(p.paid,0))<=0.01 then 0 else greatest(i.total-coalesce(p.paid,0),0) end),0) total,
               coalesce(sum(case when abs(i.total-coalesce(p.paid,0))<=0.01 then 0 else greatest(i.total-coalesce(p.paid,0),0) end) filter(where i.due_date<current_date),0) overdue
               from invoices i left join(select invoice_id,sum(amount)paid from payments where invoice_id is not null group by invoice_id)p on p.invoice_id=i.id where i.status='issued'),
             payables as(select coalesce(sum(case when abs(i.total-coalesce(p.paid,0))<=0.01 then 0 else greatest(i.total-coalesce(p.paid,0),0) end),0) total
               from purchase_invoices i left join(select purchase_invoice_id,sum(amount)paid from payments where purchase_invoice_id is not null group by purchase_invoice_id)p on p.purchase_invoice_id=i.id where i.status='confirmed' and i.deleted_at is null),
             ${stockCtes},
             stock_totals as(select coalesce(sum(case when unit='kg'then greatest(0,current_quantity)when unit='g'then greatest(0,current_quantity)/1000 else 0 end),0)kg,
               coalesce(sum(greatest(0,current_quantity)*sale_price),0)potential,
               count(*) filter(where current_quantity<=0)::int critical from stock_rows)
             select period_sales.total::text sales,period_purchases.total::text purchases,period_recurring.total::text recurring,
               (period_sales.total-period_purchases.total-period_recurring.total)::text balance,
               stock_totals.kg::text "stockKg",stock_totals.potential::text "potentialRevenue",
               stock_totals.critical "criticalStockProducts",
               receivables.total::text receivables,receivables.overdue::text "overdueReceivables",payables.total::text payables
             from period_sales,period_purchases,period_recurring,stock_totals,receivables,payables`,
            [r.from, r.to],
          )
        ).rows[0],
    );
  }
  async monthlySummary(i: SessionIdentity, months: number) {
    return withTenantTransaction(this.pool, i, async (c) =>
      (
        await c.query(
          `with month_rows as(
            select (
              date_trunc('month', current_date)::date
              - month_offset * interval '1 month'
            )::date as month_start
            from generate_series($1::int - 1, 0, -1) as offsets(month_offset)
          )
          select to_char(m.month_start, 'YYYY-MM') as month,
            coalesce(s.total, 0)::text as sales,
            coalesce(p.total, 0)::text as purchases,
            coalesce(r.total, 0)::text as recurring,
            (coalesce(s.total, 0) - coalesce(p.total, 0) - coalesce(r.total, 0))::text as balance
          from month_rows m
          left join lateral (select sum(total) as total from invoices where status = 'issued' and issue_date >= m.month_start and issue_date < m.month_start + interval '1 month') s on true
          left join lateral (select sum(total) as total from purchase_invoices where status = 'confirmed' and deleted_at is null and issue_date >= m.month_start and issue_date < m.month_start + interval '1 month') p on true
          left join lateral (select sum(amount) as total from recurring_expenses where is_active and starts_on < m.month_start + interval '1 month' and (ends_on is null or ends_on >= m.month_start)) r on true
          order by m.month_start`,
          [months],
        )
      ).rows,
    );
  }
}
