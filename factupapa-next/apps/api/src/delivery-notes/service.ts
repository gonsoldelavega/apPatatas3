import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";
import { lineAmounts, sumAmounts } from "../sales/money.js";
import { DeliveryNoteRepository } from "./repository.js";
import type {
  DeliveryCreate,
  DeliveryLineInput,
  DeliveryPatch,
} from "./types.js";
export class DeliveryNoteService {
  constructor(
    private pool: Pool,
    private repository = new DeliveryNoteRepository(),
  ) {}
  private async requireCustomer(client: PoolClient, id: string) {
    const r = await client.query(
      `select id from contacts where id=$1 and is_active and kind in ('customer','both')`,
      [id],
    );
    if (!r.rowCount) throw new HttpError("not_found", 404);
  }
  private async recalculate(client: PoolClient, id: string) {
    const r = await client.query<
      {
        lineSubtotal: string;
        lineTax: string;
        lineTotal: string;
      } & QueryResultRow
    >(
      `select line_subtotal "lineSubtotal",line_tax "lineTax",line_total "lineTotal" from delivery_note_lines where delivery_note_id=$1`,
      [id],
    );
    const totals = sumAmounts(r.rows);
    await client.query(
      `update delivery_notes set subtotal=$2,tax_total=$3,total=$4 where id=$1`,
      [id, totals.subtotal, totals.taxTotal, totals.total],
    );
  }
  async create(identity: SessionIdentity, input: DeliveryCreate) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await this.requireCustomer(client, input.contactId);
      const note = await this.repository.create(
        client,
        identity.companyId,
        identity.userId,
        input,
      );
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "delivery_note",
        entityId: note!.id,
        action: "delivery_note.created",
        after: note,
      });
      return note;
    });
  }
  async get(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const note = await this.repository.get(client, id);
      if (!note) throw new HttpError("not_found", 404);
      return note;
    });
  }
  async list(identity: SessionIdentity, url: URL) {
    return withTenantTransaction(this.pool, identity, (client) =>
      this.repository.list(client, url),
    );
  }
  async update(identity: SessionIdentity, id: string, input: DeliveryPatch) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const before = await this.repository.get(client, id, true);
      if (!before) throw new HttpError("not_found", 404);
      if (before.status !== "draft") throw new HttpError("conflict", 409);
      if (input.contactId) await this.requireCustomer(client, input.contactId);
      const after = await this.repository.update(client, id, input);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "delivery_note",
        entityId: id,
        action: "delivery_note.updated",
        before,
        after,
      });
      return after;
    });
  }
  async addLine(
    identity: SessionIdentity,
    id: string,
    input: DeliveryLineInput,
  ) {
    return this.lineMutation(identity, id, undefined, input);
  }
  async updateLine(
    identity: SessionIdentity,
    id: string,
    lineId: string,
    input: DeliveryLineInput,
  ) {
    return this.lineMutation(identity, id, lineId, input);
  }
  private async lineMutation(
    identity: SessionIdentity,
    id: string,
    lineId: string | undefined,
    input: DeliveryLineInput,
  ) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const note = await this.repository.get(client, id, true);
      if (!note) throw new HttpError("not_found", 404);
      if (note.status !== "draft") throw new HttpError("conflict", 409);
      let description = input.description,
        unit = input.unit,
        price = input.unitPrice,
        rate = input.taxRate,
        productId = input.productId ?? null;
      if (productId) {
        const p = await client.query<
          {
            name: string;
            unit: string;
            salePrice: string;
            taxRate: string;
            effectivePrice: string;
          } & QueryResultRow
        >(
          `select p.name,p.unit,p.sale_price "salePrice",p.tax_rate "taxRate",case when cp.is_active and cp.valid_from<=current_date then cp.price else p.sale_price end "effectivePrice" from products p left join contact_product_prices cp on cp.company_id=p.company_id and cp.product_id=p.id and cp.contact_id=$2 where p.id=$1 and p.is_active`,
          [productId, note.contactId],
        );
        const product = p.rows[0];
        if (!product) throw new HttpError("not_found", 404);
        description ??= product.name;
        unit ??= product.unit as never;
        price ??= product.effectivePrice;
        rate ??= product.taxRate;
      }
      if (!description || !unit || price === undefined || rate === undefined)
        throw new HttpError("invalid_request", 400);
      const amounts = lineAmounts(input.quantity, price, rate);
      const position = input.position ?? note.lines.length + 1;
      if (lineId) {
        const updated = await client.query(
          `update delivery_note_lines set product_id=$3,description=$4,quantity=$5,unit=$6,unit_price=$7,tax_rate=$8,line_subtotal=$9,line_tax=$10,line_total=$11,position=$12 where id=$1 and delivery_note_id=$2`,
          [
            lineId,
            id,
            productId,
            description,
            input.quantity,
            unit,
            price,
            rate,
            amounts.subtotal,
            amounts.tax,
            amounts.total,
            position,
          ],
        );
        if (!updated.rowCount) throw new HttpError("not_found", 404);
      } else
        await client.query(
          `insert into delivery_note_lines(company_id,delivery_note_id,product_id,description,quantity,unit,unit_price,tax_rate,line_subtotal,line_tax,line_total,position) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            identity.companyId,
            id,
            productId,
            description,
            input.quantity,
            unit,
            price,
            rate,
            amounts.subtotal,
            amounts.tax,
            amounts.total,
            position,
          ],
        );
      await this.recalculate(client, id);
      const after = await this.repository.get(client, id);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "delivery_note",
        entityId: id,
        action: lineId
          ? "delivery_note.line_updated"
          : "delivery_note.line_created",
        after,
      });
      return after;
    });
  }
  async deleteLine(identity: SessionIdentity, id: string, lineId: string) {
    await withTenantTransaction(this.pool, identity, async (client) => {
      const note = await this.repository.get(client, id, true);
      if (!note) throw new HttpError("not_found", 404);
      if (note.status !== "draft") throw new HttpError("conflict", 409);
      const r = await client.query(
        `delete from delivery_note_lines where id=$1 and delivery_note_id=$2`,
        [lineId, id],
      );
      if (!r.rowCount) throw new HttpError("not_found", 404);
      await this.recalculate(client, id);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "delivery_note",
        entityId: id,
        action: "delivery_note.line_deleted",
      });
    });
  }
  async issue(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const note = await this.repository.get(client, id, true);
      if (!note) throw new HttpError("not_found", 404);
      if (note.status !== "draft" || !note.lines.length)
        throw new HttpError("conflict", 409);
      const seq = await client.query<{ number: number } & QueryResultRow>(
        `insert into document_sequences(company_id,document_type,series,next_number) values($1,'delivery_note',$2,2) on conflict(company_id,document_type,series) do update set next_number=document_sequences.next_number+1 returning next_number-1 number`,
        [identity.companyId, note.series],
      );
      await client.query(
        `update delivery_notes set number=$2,status='issued',issued_at=now() where id=$1`,
        [id, seq.rows[0]!.number],
      );
      const after = await this.repository.get(client, id);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "delivery_note",
        entityId: id,
        action: "delivery_note.issued",
        before: note,
        after,
      });
      return after;
    });
  }
  async cancel(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const before = await this.repository.get(client, id, true);
      if (!before) throw new HttpError("not_found", 404);
      if (before.status !== "issued") throw new HttpError("conflict", 409);
      await client.query(
        `update delivery_notes set status='cancelled',cancelled_at=now() where id=$1`,
        [id],
      );
      const after = await this.repository.get(client, id);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "delivery_note",
        entityId: id,
        action: "delivery_note.cancelled",
        before,
        after,
      });
      return after;
    });
  }
}
