from pathlib import Path


def replace_exact(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"expected block not found in {path}: {old[:120]!r}")
    p.write_text(s.replace(old, new, count))


migration = Path("factupapa-next/packages/database/0024_purchase_soft_delete.sql")
migration.write_text(r'''alter table purchase_invoices
  add column deleted_at timestamptz,
  add column deleted_by_user_id uuid,
  add column delete_reason text;

alter table purchase_invoices
  add constraint purchase_invoices_deleted_by_fk
  foreign key (company_id, deleted_by_user_id)
  references memberships(company_id, user_id);

alter table purchase_invoices
  add constraint purchase_invoices_delete_metadata_check
  check (
    (deleted_at is null and deleted_by_user_id is null and delete_reason is null)
    or
    (deleted_at is not null and deleted_by_user_id is not null and char_length(btrim(delete_reason)) between 1 and 500)
  );

create index purchase_invoices_active_list_idx
  on purchase_invoices(company_id, issue_date desc, id desc)
  where deleted_at is null;

drop index purchase_invoices_supplier_number_unique_idx;
create unique index purchase_invoices_supplier_number_unique_idx
  on purchase_invoices(company_id, supplier_id, lower(btrim(supplier_invoice_number)))
  where supplier_id is not null
    and supplier_invoice_number is not null
    and btrim(supplier_invoice_number) <> ''
    and status <> 'cancelled'
    and deleted_at is null;

create or replace function enforce_purchase_invoice_state() returns trigger
language plpgsql set search_path = pg_catalog, public as $function$
declare calculated record;
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable' using errcode = '55000';
  end if;

  if old.deleted_at is not null then
    raise exception 'Deleted purchases are immutable' using errcode = '55000';
  end if;

  if new.deleted_at is not null then
    if new.deleted_by_user_id is null or new.delete_reason is null or btrim(new.delete_reason) = '' then
      raise exception 'Deleted purchase requires actor and reason' using errcode = '23514';
    end if;
    if (to_jsonb(new)-array['deleted_at','deleted_by_user_id','delete_reason','updated_at']) <>
       (to_jsonb(old)-array['deleted_at','deleted_by_user_id','delete_reason','updated_at']) then
      raise exception 'Purchase data cannot change during deletion' using errcode = '55000';
    end if;
    return new;
  end if;

  if old.status <> 'draft' then
    raise exception 'Confirmed or cancelled purchases are immutable' using errcode = '55000';
  end if;
  if new.status = 'draft' then return new; end if;
  if new.status = 'confirmed' then
    if new.supplier_id is null or new.supplier_invoice_number is null or btrim(new.supplier_invoice_number) = '' or new.confirmed_at is null or new.cancelled_at is not null then
      raise exception 'A confirmed purchase requires supplier, number and confirmation timestamp' using errcode = '23514';
    end if;
    select count(*) count,coalesce(sum(line_subtotal),0) subtotal,coalesce(sum(line_tax),0) tax_total,coalesce(sum(line_total),0) total
      into calculated from purchase_invoice_lines where company_id=old.company_id and purchase_invoice_id=old.id;
    if calculated.count=0 or new.subtotal<>calculated.subtotal or new.tax_total<>calculated.tax_total or new.total<>calculated.total then
      raise exception 'Purchase totals do not match its lines' using errcode = '23514';
    end if;
    if (to_jsonb(new)-array['status','confirmed_at','updated_at'])<>(to_jsonb(old)-array['status','confirmed_at','updated_at']) then
      raise exception 'Purchase data cannot change during confirmation' using errcode = '55000';
    end if;
    return new;
  end if;
  if new.status = 'cancelled' and new.cancelled_at is not null and new.confirmed_at is null and
     (to_jsonb(new)-array['status','cancelled_at','updated_at'])=(to_jsonb(old)-array['status','cancelled_at','updated_at']) then
    return new;
  end if;
  raise exception 'Invalid purchase transition' using errcode = '55000';
end $function$;

alter function enforce_purchase_invoice_state() owner to factupapa_migrator;
''')

svc = Path("factupapa-next/apps/api/src/finance/service.ts")
s = svc.read_text()
s = s.replace(
    "join purchase_invoices i on i.id=l.purchase_invoice_id and i.status='confirmed' join products p",
    "join purchase_invoices i on i.id=l.purchase_invoice_id and i.status='confirmed' and i.deleted_at is null join products p",
)
s = s.replace("and status<>'cancelled' limit 1`", "and status<>'cancelled' and deleted_at is null limit 1`")
s = s.replace(
    "`${select} where p.issue_date between $1 and $2 order by",
    "`${select} where p.deleted_at is null and p.issue_date between $1 and $2 order by",
)
s = s.replace(
    "`${select} where p.issue_date between $1 and $2 and p.status='confirmed' order by",
    "`${select} where p.deleted_at is null and p.issue_date between $1 and $2 and p.status='confirmed' order by",
)
s = s.replace(
    "const row = (await c.query(`${select} where p.id=$1`, [id])).rows[0];",
    "const row = (await c.query(`${select} where p.id=$1 and p.deleted_at is null`, [id])).rows[0];",
)
s = s.replace(
    "from purchase_invoices where status='confirmed' and issue_date between $1 and $2",
    "from purchase_invoices where status='confirmed' and deleted_at is null and issue_date between $1 and $2",
)
s = s.replace(
    "where i.status='confirmed'),",
    "where i.status='confirmed' and i.deleted_at is null),",
)
s = s.replace(
    "from purchase_invoices where status = 'confirmed' and issue_date >=",
    "from purchase_invoices where status = 'confirmed' and deleted_at is null and issue_date >=",
)
marker = "  async listRecurring(i: SessionIdentity) {"
method = '''  async deletePurchase(i: SessionIdentity, id: string) {
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
'''
if marker not in s:
    raise SystemExit("listRecurring marker missing")
s = s.replace(marker, method + marker, 1)
svc.write_text(s)

replace_exact(
    "factupapa-next/apps/api/src/finance/routes.ts",
    '''      if (request.method === "GET" && !p[2]) {
        json(response, 200, await finance.getPurchase(id, pid));
        return true;
      }
      if (request.method === "POST" && p[2]) {''',
    '''      if (request.method === "GET" && !p[2]) {
        json(response, 200, await finance.getPurchase(id, pid));
        return true;
      }
      if (request.method === "DELETE" && !p[2]) {
        await finance.deletePurchase(id, pid);
        noContent(response);
        return true;
      }
      if (request.method === "POST" && p[2]) {''',
)

replace_exact(
    "factupapa-next/apps/web/src/api/services.ts",
    '''  transitionPurchase: (id: string, action: "confirm" | "cancel") =>
    apiClient.request<PurchaseInvoice>(`/purchases/${id}/${action}`, {
      method: "POST",
      body: "{}",
    }),''',
    '''  transitionPurchase: (id: string, action: "confirm" | "cancel") =>
    apiClient.request<PurchaseInvoice>(`/purchases/${id}/${action}`, {
      method: "POST",
      body: "{}",
    }),
  deletePurchase: (id: string) =>
    apiClient.request<void>(`/purchases/${id}`, { method: "DELETE" }),''',
)

detail = Path("factupapa-next/apps/web/src/pages/PurchaseDetailPage.tsx")
d = detail.read_text()
d = d.replace("  RotateCcw,\n  XCircle,", "  RotateCcw,\n  Trash2,\n  XCircle,", 1)
d = d.replace(
    'import { Link, useParams } from "react-router-dom";',
    'import { Link, useNavigate, useParams } from "react-router-dom";',
    1,
)
d = d.replace(
    "  const queryClient = useQueryClient();\n  const toast = useToast();",
    "  const queryClient = useQueryClient();\n  const navigate = useNavigate();\n  const toast = useToast();",
    1,
)
anchor = "  const documentView = useMutation({"
delete_block = '''  const removePurchase = useMutation({
    mutationFn: () => financeApi.deletePurchase(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["stock"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
      ]);
      toast.show("Compra eliminada");
      navigate("/gastos", { replace: true });
    },
  });

'''
if anchor not in d:
    raise SystemExit("detail mutation marker missing")
d = d.replace(anchor, delete_block + anchor, 1)
anchor2 = '      {item.status === "draft" && (\n        <>'
delete_ui = '''      <section className="detail-card danger-zone">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Eliminar compra</p>
            <p>La compra dejará de afectar a totales, saldos y stock. El documento original se conservará como evidencia para evitar que Gmail lo importe otra vez.</p>
          </div>
          <Button
            type="button"
            variant="danger"
            icon={<Trash2 />}
            busy={removePurchase.isPending}
            onClick={() => {
              if (window.confirm("¿Eliminar esta compra? Desaparecerá de Compras y dejará de afectar al negocio.")) {
                removePurchase.mutate();
              }
            }}
          >
            Eliminar compra
          </Button>
        </div>
        {removePurchase.isError && (
          <p className="field-error" role="alert">No se pudo eliminar la compra.</p>
        )}
      </section>

'''
if anchor2 not in d:
    raise SystemExit("detail draft marker missing")
d = d.replace(anchor2, delete_ui + anchor2, 1)
detail.write_text(d)

page = Path("factupapa-next/apps/web/src/pages/ExpensesPage.tsx")
e = page.read_text()
e = e.replace(
    '''        <p className="eyebrow">Compras y costes</p>
        <h1>Gastos</h1>
        <p>Facturas recibidas y cargos fijos mensuales.</p>''',
    '''        <p className="eyebrow">Compras y gastos</p>
        <h1>Compras y gastos</h1>
        <p>Facturas de proveedores, documentos por revisar y gastos recurrentes, separados de las ventas.</p>''',
    1,
)
page.write_text(e)

test = Path("factupapa-next/apps/api/test/integration/document-classification.integration.test.ts")
t = test.read_text()
if 'una compra confirmada puede darse de baja sin destruir su documento' not in t:
    t += r'''

test("una compra confirmada puede darse de baja sin destruir su documento", async () => {
  const documentId = await createDocument({
    documentType: "supplier_invoice",
    classificationConfidence: 0.99,
    purchaseEligible: true,
  });
  const purchaseId = (await insertPurchase(documentId)).rows[0]!.id as string;
  await database.pool.query(
    `insert into purchase_invoice_lines(
       company_id,purchase_invoice_id,description,quantity,unit,unit_cost,tax_rate,
       line_subtotal,line_tax,line_total,position
     ) values($1,$2,'Compra integración',1,'unit',100,4,100,4,104,1)`,
    [companyId, purchaseId],
  );
  await database.pool.query(
    `update purchase_invoices set status='confirmed',confirmed_at=now() where id=$1`,
    [purchaseId],
  );
  await database.pool.query(
    `update purchase_invoices
     set deleted_at=now(),deleted_by_user_id=$2,delete_reason='Prueba de baja lógica'
     where id=$1`,
    [purchaseId, userId],
  );
  const result = await database.pool.query(
    `select deleted_at is not null deleted,
            exists(select 1 from documents where id=$2) "documentExists"
     from purchase_invoices where id=$1`,
    [purchaseId, documentId],
  );
  assert.equal(result.rows[0]!.deleted, true);
  assert.equal(result.rows[0]!.documentExists, true);
  await assert.rejects(
    database.pool.query(`update purchase_invoices set notes='no permitido' where id=$1`, [purchaseId]),
    /Deleted purchases are immutable/i,
  );
});
'''
test.write_text(t)
