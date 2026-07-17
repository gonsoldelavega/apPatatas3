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
  type ExtractedPurchaseFields,
} from "./extraction.js";
import { recognizeWithTimeout } from "./ocr.js";
import type { PurchaseInput, RecurringExpenseInput } from "./validation.js";
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
const select = `select p.id,p.supplier_id "supplierId",p.document_id "documentId",coalesce(p.supplier_legal_name,c.legal_name) "supplierName",p.supplier_invoice_number "supplierInvoiceNumber",p.issue_date::text "issueDate",p.due_date::text "dueDate",p.status,p.category,p.subtotal::text,p.tax_total::text "taxTotal",p.total::text,p.notes from purchase_invoices p left join contacts c on c.id=p.supplier_id`;
const stockCtes = `purchase_quantities as(select l.product_id,sum(case when l.unit=p.unit then l.quantity when l.unit='g' and p.unit='kg' then l.quantity/1000 when l.unit='kg' and p.unit='g' then l.quantity*1000 else 0 end)qty from purchase_invoice_lines l join purchase_invoices i on i.id=l.purchase_invoice_id and i.status='confirmed' join products p on p.id=l.product_id group by l.product_id),sold_entries as(select l.product_id,l.quantity,l.unit from invoice_lines l join invoices i on i.id=l.invoice_id and i.status='issued' and i.source_type='manual' union all select l.product_id,l.quantity,l.unit from delivery_note_lines l join delivery_notes d on d.id=l.delivery_note_id and d.status in('issued','invoiced')),sold_quantities as(select l.product_id,sum(case when l.unit=p.unit then l.quantity when l.unit='g' and p.unit='kg' then l.quantity/1000 when l.unit='kg' and p.unit='g' then l.quantity*1000 else 0 end)qty from sold_entries l join products p on p.id=l.product_id group by l.product_id),adjustment_quantities as(select product_id,sum(quantity_delta)qty from stock_adjustments group by product_id),stock_rows as(select p.id,p.name,p.unit,p.sale_price,p.estimated_cost,(coalesce(b.qty,0)-coalesce(s.qty,0)+coalesce(a.qty,0))current_quantity from products p left join purchase_quantities b on b.product_id=p.id left join sold_quantities s on s.product_id=p.id left join adjustment_quantities a on a.product_id=p.id where p.is_active)`;
export class FinanceService {
  private readonly s3?: S3Client;
  constructor(
    private pool: Pool,
    private storage?: {
      endpoint: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
    },
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
  }
  async uploadDocument(
    i: SessionIdentity,
    input: { filename: unknown; mimeType: unknown; contentBase64: unknown },
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
      !/^[-A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)
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
    let extracted: ExtractedPurchaseFields = {};
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
        const textFields = extractPurchaseFields(parsed.text, input.filename);
        if (
          parsed.text.replace(/\s/g, "").length >= 80 &&
          (textFields.total || textFields.supplierTaxId)
        ) {
          extracted = { ...textFields, ocrConfidence: 100, source: "pdf_text" };
        } else {
          const screenshots = await parser.getScreenshot({
            first: 2,
            desiredWidth: 2200,
            imageBuffer: true,
            imageDataUrl: false,
          });
          const pages = [];
          for (const page of screenshots.pages.slice(0, 2))
            pages.push(await bestOcr(Buffer.from(page.data), input.filename));
          const fields = extractPurchaseFields(pages.map((x) => x.page.text).join("\n"), input.filename);
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
        const candidate = await bestOcr(body, input.filename),
          page = candidate.page;
        extracted = {
          ...candidate.fields,
          ocrConfidence: page.confidence,
          source: "ocr",
        };
      } catch {
        extracted = { warnings: ["ocr_failed"], ocrConfidence: 0, source: "ocr" };
      }
    }
    const id = randomUUID(),
      ext =
        mime === "application/pdf"
          ? "pdf"
          : mime === "image/png"
            ? "png"
            : "jpg",
      key = `${i.companyId}/purchases/${id}.${ext}`,
      sha = createHash("sha256").update(body).digest("hex");
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
                      `select 1 from purchase_invoices where supplier_id=$1 and lower(btrim(supplier_invoice_number))=lower(btrim($2)) and status<>'cancelled' limit 1`,
                      [supplier.id, extracted.supplierInvoiceNumber],
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
                normalized.source === "ocr" ? "tesseract-spa-eng" : "local-pdf-text",
                normalized.ocrConfidence == null ? null : normalized.ocrConfidence / 100,
                normalized,
              ],
            )
          ).rows[0];
        },
      );
    } catch (e) {
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
            `${select} where p.issue_date between $1 and $2 order by p.issue_date desc,p.id desc limit 500`,
            [r.from, r.to],
          )
        ).rows,
    );
  }
  private async getIn(c: PoolClient, id: string) {
    const row = (await c.query(`${select} where p.id=$1`, [id])).rows[0];
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
            `insert into purchase_invoices(company_id,supplier_id,supplier_legal_name,supplier_tax_id,supplier_address,document_id,supplier_invoice_number,issue_date,due_date,category,notes,subtotal,tax_total,total,created_by_user_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)returning id`,
            [
              i.companyId,
              input.supplierId,
              supplier.legal_name,
              supplier.tax_id,
              supplier.address,
              input.documentId,
              input.supplierInvoiceNumber,
              input.issueDate,
              input.dueDate,
              input.category,
              input.notes,
              totals.subtotal,
              totals.taxTotal,
              totals.total,
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
          after: { status: "draft", total: totals.total },
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
      await c.query(
        `update purchase_invoices set status=$2,confirmed_at=case when $2='confirmed' then now() end,cancelled_at=case when $2='cancelled' then now() end where id=$1`,
        [id, status],
      );
      return this.getIn(c, id);
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
            `with ${stockCtes} select id "productId",name,unit,current_quantity::text quantity,sale_price::text "salePrice",estimated_cost::text "estimatedCost",(current_quantity*sale_price)::text "potentialRevenue",case when estimated_cost is null then null else(current_quantity*estimated_cost)::text end "stockValue" from stock_rows order by name`,
          )
        ).rows,
    );
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
            `with period_sales as(select coalesce(sum(total),0)total from invoices where status='issued' and issue_date between $1 and $2),period_purchases as(select coalesce(sum(total),0)total from purchase_invoices where status='confirmed' and issue_date between $1 and $2),months as(select generate_series(date_trunc('month',$1::date::timestamp),date_trunc('month',$2::date::timestamp),interval'1 month')::date as month_start),period_recurring as(select coalesce(sum(r.amount),0)total from recurring_expenses r join months m on r.starts_on<=m.month_start+interval'1 month - 1 day' and(r.ends_on is null or r.ends_on>=m.month_start)),${stockCtes},stock_totals as(select coalesce(sum(case when unit='kg'then greatest(0,current_quantity)when unit='g'then greatest(0,current_quantity)/1000 else 0 end),0)kg,coalesce(sum(greatest(0,current_quantity)*sale_price),0)potential from stock_rows)select period_sales.total::text sales,period_purchases.total::text purchases,period_recurring.total::text recurring,(period_sales.total-period_purchases.total-period_recurring.total)::text balance,stock_totals.kg::text "stockKg",stock_totals.potential::text "potentialRevenue" from period_sales,period_purchases,period_recurring,stock_totals`,
            [r.from, r.to],
          )
        ).rows[0],
    );
  }
}
