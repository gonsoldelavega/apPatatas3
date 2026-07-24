import type { Pool, QueryResultRow } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";

export interface PaymentInput {
  amount: string;
  paidAt: string;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
}

const paymentProjection = `id,invoice_id "invoiceId",purchase_invoice_id "purchaseInvoiceId",
  contact_id "contactId",direction,amount::text,paid_at "paidAt",method,reference,notes,created_at "createdAt"`;

export class AccountsService {
  constructor(private readonly pool: Pool) {}

  async invoicePayments(i: SessionIdentity, invoiceId: string) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const invoice = await c.query(`select 1 from invoices where id=$1`, [invoiceId]);
      if (!invoice.rowCount) throw new HttpError("not_found", 404);
      return (await c.query(`select ${paymentProjection} from payments where invoice_id=$1 order by paid_at desc,id desc`, [invoiceId])).rows;
    });
  }

  async purchasePayments(i: SessionIdentity, purchaseId: string) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const purchase = await c.query(`select 1 from purchase_invoices where id=$1`, [purchaseId]);
      if (!purchase.rowCount) throw new HttpError("not_found", 404);
      return (await c.query(`select ${paymentProjection} from payments where purchase_invoice_id=$1 order by paid_at desc,id desc`, [purchaseId])).rows;
    });
  }

  async addInvoicePayment(i: SessionIdentity, invoiceId: string, input: PaymentInput) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const invoice = (await c.query<{ contactId: string; total: string; paid: string; status: string } & QueryResultRow>(
        `select contact_id "contactId",total::text,status,
           coalesce((select sum(amount) from payments where invoice_id=i.id),0)::text paid
         from invoices i where id=$1 for update`, [invoiceId])).rows[0];
      if (!invoice) throw new HttpError("not_found", 404);
      if (invoice.status !== "issued") throw new HttpError("conflict", 409);
      if (Number(input.amount) > Number(invoice.total) - Number(invoice.paid) + 0.005)
        throw new HttpError("conflict", 409);
      const payment = (await c.query(
        `insert into payments(company_id,invoice_id,contact_id,direction,amount,paid_at,method,reference,notes,created_by_user_id)
         values($1,$2,$3,'incoming',$4,$5,$6,$7,$8,$9) returning ${paymentProjection}`,
        [i.companyId,invoiceId,invoice.contactId,input.amount,input.paidAt,input.method ?? null,
          input.reference ?? null,input.notes ?? null,i.userId])).rows[0];
      await recordAudit(c,{ companyId:i.companyId,actorUserId:i.userId,entityType:"payment",
        entityId:payment.id,action:"payment.received",after:payment });
      return payment;
    });
  }

  async addPurchasePayment(i: SessionIdentity, purchaseId: string, input: PaymentInput) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const purchase = (await c.query<{ supplierId: string | null; total: string; paid: string; status: string } & QueryResultRow>(
        `select supplier_id "supplierId",total::text,status,
           coalesce((select sum(amount) from payments where purchase_invoice_id=p.id),0)::text paid
         from purchase_invoices p where id=$1 for update`, [purchaseId])).rows[0];
      if (!purchase) throw new HttpError("not_found", 404);
      if (purchase.status !== "confirmed") throw new HttpError("conflict", 409);
      if (Number(input.amount) > Number(purchase.total) - Number(purchase.paid) + 0.005)
        throw new HttpError("conflict", 409);
      const payment = (await c.query(
        `insert into payments(company_id,purchase_invoice_id,contact_id,direction,amount,paid_at,method,reference,notes,created_by_user_id)
         values($1,$2,$3,'outgoing',$4,$5,$6,$7,$8,$9) returning ${paymentProjection}`,
        [i.companyId,purchaseId,purchase.supplierId,input.amount,input.paidAt,input.method ?? null,
          input.reference ?? null,input.notes ?? null,i.userId])).rows[0];
      await recordAudit(c,{ companyId:i.companyId,actorUserId:i.userId,entityType:"payment",
        entityId:payment.id,action:"payment.sent",after:payment });
      return payment;
    });
  }

  async delete(i: SessionIdentity, paymentId: string) {
    return withTenantTransaction(this.pool, i, async (c) => {
      const before = (await c.query(`select ${paymentProjection} from payments where id=$1`, [paymentId])).rows[0];
      if (!before) throw new HttpError("not_found", 404);
      await c.query(`delete from payments where id=$1`, [paymentId]);
      await recordAudit(c,{ companyId:i.companyId,actorUserId:i.userId,entityType:"payment",
        entityId:paymentId,action:"payment.deleted",before });
    });
  }

  async customerAccount(i: SessionIdentity, contactId: string) {
    return withTenantTransaction(this.pool, i, async (c) => {
      if (!(await c.query(`select 1 from contacts where id=$1 and kind in('customer','both')`,[contactId])).rowCount)
        throw new HttpError("not_found",404);
      const totals = (await c.query(
        `select coalesce(sum(i.total) filter(where i.status='issued'),0)::text "invoicedTotal",
           coalesce(sum(coalesce(pay.paid,0)) filter(where i.status='issued'),0)::text "paidTotal",
           coalesce(sum(greatest(i.total-coalesce(pay.paid,0),0))
             filter(where i.status='issued'),0)::text "outstandingTotal",
           coalesce(sum(greatest(i.total-coalesce(pay.paid,0),0))
             filter(where i.status='issued' and i.due_date<current_date),0)::text "overdueTotal",
           count(*) filter(where status='issued')::int "invoiceCount",max(issue_date)::text "lastInvoiceDate"
         from invoices i left join (
           select invoice_id,sum(amount) paid from payments where invoice_id is not null group by invoice_id
         ) pay on pay.invoice_id=i.id where i.contact_id=$1`,[contactId])).rows[0];
      const invoices = (await c.query(
        `select id,number,series,issue_date::text "issueDate",due_date::text "dueDate",status,total::text,
           coalesce((select sum(amount) from payments p where p.invoice_id=i.id),0)::text "paidTotal",
           greatest(total-coalesce((select sum(amount) from payments p where p.invoice_id=i.id),0),0)::text "balanceDue",
           case when coalesce((select sum(amount) from payments p where p.invoice_id=i.id),0)>=total then 'paid'
             when coalesce((select sum(amount) from payments p where p.invoice_id=i.id),0)>0 then 'partial'
             when status='issued' and due_date<current_date then 'overdue' else 'unpaid' end "paymentStatus"
         from invoices i where contact_id=$1 order by issue_date desc,id desc limit 100`,[contactId])).rows;
      const payments = (await c.query(
        `select ${paymentProjection} from payments where contact_id=$1 and direction='incoming' order by paid_at desc,id desc limit 100`,[contactId])).rows;
      const topProducts = (await c.query(
        `select l.product_id "productId",l.description name,sum(l.quantity)::text quantity,sum(l.line_total)::text total
         from invoice_lines l join invoices i on i.id=l.invoice_id
         where i.contact_id=$1 and i.status='issued' group by l.product_id,l.description order by sum(l.line_total) desc limit 5`,[contactId])).rows;
      return { contactId, ...totals, invoices, payments, topProducts };
    });
  }
}
