import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Eye,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  FileCheck2,
  ReceiptText,
  XCircle,
  Trash2,
  Banknote,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deliveryNotesApi,
  invoicesApi,
  productsApi,
  salesPreferencesApi,
  accountsApi,
  gmailApi,
} from "../api/services";
import { ApiError } from "../api/client";
import { Button } from "../ui/Button";
import type { Invoice } from "../api/types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingScreen } from "../ui/LoadingScreen";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import {
  annualInvoiceSeries,
  formatDocumentNumber,
  formatMoney,
  formatQuantity,
  formatTaxRate,
  formatUnitPrice,
  todayLocal,
  unitLabel,
} from "../utils/format";
import { bagLabel } from "../utils/packaging";

const statusLabel = (status: string, invoice: boolean) =>
  ({
    draft: "Borrador",
    issued: invoice ? "Emitida" : "Emitido",
    invoiced: "Facturado",
    cancelled: invoice ? "Cancelada" : "Cancelado",
  })[status] ?? status;

export function SalesDetailPage() {
  const { type, id = "" } = useParams();
  const invoice = type === "facturas";
  const navigate = useNavigate();
  const api = invoice ? invoicesApi : deliveryNotesApi;
  const queryClient = useQueryClient();
  const [newProductId, setNewProductId] = useState(""),
    [newQuantity, setNewQuantity] = useState("1"),
    [newDeliveryDate, setNewDeliveryDate] = useState(todayLocal()),
    [draftIssueDate, setDraftIssueDate] = useState(todayLocal()),
    [draftDueDate, setDraftDueDate] = useState(""),
    [draftStartDate, setDraftStartDate] = useState(""),
    [draftEndDate, setDraftEndDate] = useState(""),
    [draftDeliveryDates, setDraftDeliveryDates] = useState<string[]>([]),
    [draftDeliveryInput, setDraftDeliveryInput] = useState(""),
    [draftPaymentTerms, setDraftPaymentTerms] = useState(""),
    [draftGeneralInfo, setDraftGeneralInfo] = useState(""),
    [editingLineId, setEditingLineId] = useState<string | null>(null),
    [editProductId, setEditProductId] = useState(""),
    [editQuantity, setEditQuantity] = useState(""),
    [editUnitPrice, setEditUnitPrice] = useState(""),
    [editDeliveryDate, setEditDeliveryDate] = useState(""),
    [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false),
    [paymentAmount, setPaymentAmount] = useState(""),
    [paymentDate, setPaymentDate] = useState(todayLocal()),
    [paymentMethod, setPaymentMethod] = useState("transfer");
  const documentQuery = useQuery({
    queryKey: [type, id],
    queryFn: () => api.get(id),
  });
  const preferences = useQuery({
    queryKey: ["sales-preferences"],
    queryFn: salesPreferencesApi.get,
    enabled: !invoice,
  });
  const products = useQuery({
    queryKey: ["sales-products"],
    queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
  });
  const payments = useQuery({
    queryKey: ["invoice-payments", id],
    queryFn: () => accountsApi.invoicePayments(id),
    enabled: invoice && documentQuery.data?.status === "issued",
  });
  const addPayment = useMutation({
    mutationFn: () => accountsApi.addInvoicePayment(id, {
      amount: paymentAmount.replace(",", "."),
      paidAt: `${paymentDate}T12:00:00`,
      method: paymentMethod,
      reference: null,
      notes: null,
    }),
    onSuccess: async () => {
      setShowPayment(false); setPaymentAmount("");
      await Promise.all([
        queryClient.invalidateQueries({queryKey:[type,id]}),
        queryClient.invalidateQueries({queryKey:["invoice-payments",id]}),
        queryClient.invalidateQueries({queryKey:["invoices"]}),
      ]);
    },
  });
  useEffect(() => {
    if (!invoice || !documentQuery.data) return;
    const current = documentQuery.data as Invoice;
    setDraftIssueDate(current.issueDate);
    setDraftDueDate(current.dueDate ?? "");
    setDraftStartDate(current.operationStartDate ?? "");
    setDraftEndDate(current.operationEndDate ?? "");
    setDraftDeliveryDates(current.deliveryDates);
    setDraftPaymentTerms(current.paymentTerms ?? "");
    setDraftGeneralInfo(current.generalInformation ?? "");
  }, [documentQuery.data, invoice]);
  const editLine = useMutation({
    mutationFn: async (input: { action: "add"; productId: string; quantity: string; deliveryDate?: string } | { action: "delete"; lineId: string } | { action: "update"; line: NonNullable<Invoice["lines"]>[number]; quantity: string; unitPrice: string; deliveryDate: string }) => {
      if (input.action === "add" && invoice)
        await invoicesApi.addLine(id, {
          productId: input.productId,
          quantity: input.quantity,
          deliveryDate: input.deliveryDate || null,
        });
      else if (input.action === "add")
        await deliveryNotesApi.addLine(id, { productId: input.productId, quantity: input.quantity });
      else if (input.action === "delete") await api.deleteLine(id, input.lineId);
      else {
        const selectedProduct = products.data?.items.find((product) => product.id === editProductId);
        await invoicesApi.updateLine(id, input.line.id, {
        productId: editProductId || input.line.productId,
        description: selectedProduct?.name ?? input.line.description,
        quantity: input.quantity.replace(",", "."),
        unit: selectedProduct?.unit ?? input.line.unit,
        unitPrice: input.unitPrice.replace(",", "."),
        taxRate: selectedProduct?.taxRate ?? input.line.taxRate,
        position: input.line.position,
        deliveryDate: input.deliveryDate || null,
      });
      }
    },
    onSuccess: async () => {
      setNewProductId("");
      setNewQuantity("1");
      setNewDeliveryDate(todayLocal());
      setEditingLineId(null);
      setEditProductId("");
      await queryClient.invalidateQueries({ queryKey: [type, id] });
    },
  });
  const action = useMutation({
    mutationFn: (name: "issue" | "cancel") => api[name](id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [type, id] }),
  });
  const updateInvoiceDraft = useMutation({
    mutationFn: () =>
      invoicesApi.update(id, {
        issueDate: draftIssueDate,
        dueDate: draftDueDate || null,
        operationStartDate: draftStartDate || null,
        operationEndDate: draftEndDate || null,
        deliveryDates: draftDeliveryDates,
        paymentTerms: draftPaymentTerms || null,
        generalInformation: draftGeneralInfo || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [type, id] }),
  });
  const pdf = useMutation({
    mutationFn: async (target: Window | null) => ({
      blob: await invoicesApi.downloadPdf(id),
      target,
    }),
    onSuccess: ({ blob, target }) => {
      const url = URL.createObjectURL(blob);
      if (target) target.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (_error, target) => target?.close(),
  });
  const shareWhatsApp = useMutation({
      mutationFn: () => invoicesApi.downloadPdf(id),
      onSuccess: async (b) => {
        const current = documentQuery.data as Invoice | undefined,
          subject = current?.number
            ? `Factura ${formatDocumentNumber(current.series, current.number)}`
            : "Factura",
          filename = `${subject.replace(/[^a-z0-9_-]+/gi, "_")}.pdf`,
          f = new File([b], filename, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [f] })) {
          await navigator.share({
            title: subject,
            text: `${subject} de FactuPapa`,
            files: [f],
          });
          return;
        }
        const u = URL.createObjectURL(b),
          a = document.createElement("a");
        a.href = u;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 60000);
        window.location.href = `https://wa.me/?text=${encodeURIComponent(`${subject}. He descargado el PDF para adjuntarlo.`)}`;
      },
    }),
    printPdf = useMutation({
      mutationFn: () => invoicesApi.downloadPdf(id),
      onSuccess: (b) => {
        const u = URL.createObjectURL(b),
          f = document.createElement("iframe");
        f.hidden = true;
        f.src = u;
        f.onload = () => f.contentWindow?.print();
        document.body.append(f);
        setTimeout(() => {
          f.remove();
          URL.revokeObjectURL(u);
        }, 60000);
      },
    });
  const sendEmail = useMutation({
    mutationFn: () => gmailApi.sendInvoice(id),
    onMutate: () => setActionMessage(null),
    onSuccess: ({ email }) =>
      setActionMessage(`Factura enviada correctamente a ${email}.`),
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : "gmail_send_failed";
      setActionMessage(({
        gmail_not_connected: "Conecta Gmail desde Otros para poder enviar facturas.",
        gmail_recipient_missing: "Este cliente no tiene un correo válido. Añádelo en Clientes y proveedores.",
        gmail_reauthorization_required: "La autorización de Gmail ha caducado. Vuelve a conectarlo desde Otros.",
        gmail_send_failed: "Gmail no pudo enviar la factura. Comprueba que la API de Gmail esté activa e inténtalo de nuevo.",
        conflict: "Sólo se pueden enviar facturas emitidas.",
      } as Record<string, string>)[code] ?? "No se pudo enviar la factura.");
    },
  });
  const convert = useMutation({
    mutationFn: () =>
      invoicesApi.fromDeliveryNotes({
        deliveryNoteIds: [id],
        series: annualInvoiceSeries(
          preferences.data?.numberingMode === "live"
            ? preferences.data.invoicePrefix
            : "TEST",
        ),
        issueDate: todayLocal(),
      }),
    onSuccess: (created) => navigate(`/ventas/facturas/${created.id}`),
  });
  if (documentQuery.isLoading) return <LoadingScreen />;
  if (!documentQuery.data)
    return (
      <div className="page">
        <EmptyState
          title="Documento no disponible"
          description="No existe o no pertenece a tu empresa."
        />
      </div>
    );
  const item = documentQuery.data;
  const invoiceItem = invoice ? (item as Invoice) : null;
  const editable = item.status === "draft" || (invoice && item.status === "issued");
  return (
    <div className="page detail-page sales-detail">
      <header className="detail-header">
        <Link className="icon-button" to="/ventas" aria-label="Volver">
          <ArrowLeft />
        </Link>
        <div className="detail-header__title">
          <p className="eyebrow">{invoice ? "Factura" : "Albarán"}</p>
          <h1>
            {item.number
              ? formatDocumentNumber(item.series, item.number)
              : "Borrador"}
          </h1>
          <span className={`status status--${item.status}`}>
            {statusLabel(item.status, invoice)}
          </span>
        </div>
      </header>
      <section className="detail-card">
        {invoiceItem && (
          <div className="invoice-facts">
            <p>
              <strong>Cliente:</strong> {invoiceItem.contactLegalName}
            </p>
            <p>
              <strong>Fecha de emisión:</strong> {invoiceItem.issueDate}
            </p>
            {invoiceItem.operationStartDate && (
              <p>
                <strong>Periodo:</strong> {invoiceItem.operationStartDate} —{" "}
                {invoiceItem.operationEndDate}
              </p>
            )}
            {invoiceItem.deliveryDates.length > 0 && (
              <p>
                <strong>Entregas:</strong>{" "}
                {invoiceItem.deliveryDates.join(", ")}
              </p>
            )}
            {invoiceItem.dueDate && (
              <p>
                <strong>Vencimiento:</strong> {invoiceItem.dueDate}
              </p>
            )}
            {invoiceItem.paymentTerms && (
              <p>
                <strong>Condiciones:</strong> {invoiceItem.paymentTerms}
              </p>
            )}
            {invoiceItem.generalInformation && (
              <p>
                <strong>Información:</strong> {invoiceItem.generalInformation}
              </p>
            )}
          </div>
        )}
        <h2>Líneas</h2>
        {item.lines?.map((line) => (
          <div className="sales-line" key={line.id}>
            <span>
              <strong>{line.description}</strong>
              <small>
                {formatQuantity(line.quantity)} {unitLabel(line.unit)} ×{" "}
                {formatUnitPrice(line.unitPrice)}
                {invoice ? ` · IVA ${formatTaxRate(line.taxRate)}` : ""}
              </small>
              {line.packageQuantity && line.unitsPerPackage ? (
                <small>{formatQuantity(line.packageQuantity)} {line.packageLabel ?? "envases"} · {formatQuantity(line.unitsPerPackage)} {unitLabel(line.unit)} por envase</small>
              ) : bagLabel(line.quantity, line.unit) ? (
                <small>{bagLabel(line.quantity, line.unit)}</small>
              ) : null}
              {line.deliveryDate && (
                <small>Entrega: {line.deliveryDate.split("-").reverse().join("/")}</small>
              )}
                {invoice && editingLineId === line.id && (
                <div className="form-grid invoice-line-editor">
                  <SelectField label="Producto" value={editProductId} onChange={(e) => {
                    const product = products.data?.items.find((candidate) => candidate.id === e.target.value);
                    if (product) {
                      setEditUnitPrice(formatQuantity(product.salePrice));
                    }
                    setEditProductId(e.target.value);
                  }}>
                    <option value="">Selecciona</option>
                    {products.data?.items.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
                  </SelectField>
                  <Field label="Cantidad" inputMode="decimal" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} />
                  <Field label="Precio unitario" inputMode="decimal" value={editUnitPrice} onChange={(e) => setEditUnitPrice(e.target.value)} />
                  <Field label="Fecha de entrega" type="date" value={editDeliveryDate} onChange={(e) => setEditDeliveryDate(e.target.value)} />
                  <Button variant="secondary" busy={editLine.isPending} disabled={Number(editQuantity.replace(",", ".")) <= 0 || Number(editUnitPrice.replace(",", ".")) < 0} onClick={() => editLine.mutate({ action: "update", line, quantity: editQuantity, unitPrice: editUnitPrice, deliveryDate: editDeliveryDate })}>Guardar línea</Button>
                </div>
              )}
            </span>
            <span className="sales-line__amount">
              <strong>{formatMoney(line.lineTotal)}</strong>
              {editable && (
                <>
                {invoice && <button type="button" aria-label={`Editar ${line.description}`} onClick={() => {
                  setEditingLineId(line.id);
                  setEditProductId(line.productId ?? "");
                  setEditQuantity(line.quantity);
                  setEditUnitPrice(line.unitPrice);
                  setEditDeliveryDate(line.deliveryDate ?? "");
                }}><Pencil /></button>}
                <button
                  type="button"
                  aria-label={`Eliminar ${line.description}`}
                  onClick={() => window.confirm("¿Quitar esta línea?") && editLine.mutate({ action: "delete", lineId: line.id })}
                >
                  <Trash2 />
                </button>
                </>
              )}
            </span>
          </div>
        ))}
        <div className="sales-totals">
          <div>
            <span>Base imponible</span>
            <strong>{formatMoney(item.subtotal)}</strong>
          </div>
          <div>
            <span>IVA</span>
            <strong>{formatMoney(item.taxTotal)}</strong>
          </div>
          <div className="sales-total">
            <span>Total</span>
            <strong>{formatMoney(item.total)}</strong>
          </div>
        </div>
      </section>
      {invoiceItem?.status === "issued" && (
        <section className="detail-card payment-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Cobros</p>
              <h2>{invoiceItem.paymentStatus === "paid" ? "Factura cobrada" : `${formatMoney(invoiceItem.balanceDue ?? invoiceItem.total)} pendientes`}</h2>
              <span className={`payment-state payment-state--${invoiceItem.paymentStatus}`}>
                {({ unpaid: "Pendiente", partial: "Parcial", overdue: "Vencida", paid: "Pagada" } as const)[invoiceItem.paymentStatus ?? "unpaid"]}
              </span>
            </div>
            {invoiceItem.paymentStatus !== "paid" && (
              <button className="compact-action" onClick={() => {
                setPaymentAmount(formatQuantity(invoiceItem.balanceDue ?? invoiceItem.total));
                setShowPayment((value) => !value);
              }}><Banknote /> Registrar cobro</button>
            )}
          </div>
          <div className="payment-progress" aria-label={`Cobrado ${formatMoney(invoiceItem.paidTotal ?? "0")}`}>
            <span style={{width:`${Math.min(100, Number(invoiceItem.paidTotal ?? 0) / Math.max(Number(invoiceItem.total),.01) * 100)}%`}} />
          </div>
          <p><strong>{formatMoney(invoiceItem.paidTotal ?? "0")}</strong> cobrados de {formatMoney(invoiceItem.total)}</p>
          {showPayment && (
            <div className="inline-payment-form">
              <Field label="Importe cobrado" inputMode="decimal" value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)} />
              <Field label="Fecha" type="date" value={paymentDate} onChange={(e)=>setPaymentDate(e.target.value)} />
              <SelectField label="Forma de pago" value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)}>
                <option value="transfer">Transferencia</option><option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option><option value="direct_debit">Domiciliación</option><option value="other">Otra</option>
              </SelectField>
              <Button busy={addPayment.isPending} disabled={!paymentAmount || Number(paymentAmount.replace(",","."))<=0} onClick={()=>addPayment.mutate()}>
                Guardar cobro
              </Button>
              {addPayment.isError && <p role="alert">No se pudo registrar. Comprueba que el importe no supera lo pendiente.</p>}
            </div>
          )}
          {!!payments.data?.length && (
            <div className="payment-list">
              {payments.data.map((payment)=><p key={payment.id}><span>{new Date(payment.paidAt).toLocaleDateString("es-ES")} · {payment.method ?? "Sin método"}</span><strong>{formatMoney(payment.amount)}</strong></p>)}
            </div>
          )}
        </section>
      )}
      {editable && (
        <>
          {invoiceItem && (
            <section className="form-card" id="invoice-edit">
              <h2>Datos de la factura</h2>
              <div className="form-grid">
                <Field
                  label="Fecha de emisión"
                  type="date"
                  value={draftIssueDate}
                  onChange={(e) => setDraftIssueDate(e.target.value)}
                />
                <Field
                  label="Fecha de vencimiento"
                  type="date"
                  value={draftDueDate}
                  onChange={(e) => setDraftDueDate(e.target.value)}
                />
              </div>
              <div className="form-grid">
                <Field
                  label="Operaciones desde"
                  type="date"
                  value={draftStartDate}
                  onChange={(e) => setDraftStartDate(e.target.value)}
                />
                <Field
                  label="Operaciones hasta"
                  type="date"
                  value={draftEndDate}
                  onChange={(e) => setDraftEndDate(e.target.value)}
                />
              </div>
              <div className="delivery-date-editor">
                <Field
                  label="Añadir fecha de entrega"
                  type="date"
                  value={draftDeliveryInput}
                  onChange={(e) => setDraftDeliveryInput(e.target.value)}
                />
                <button
                  type="button"
                  className="compact-action"
                  onClick={() => {
                    if (
                      draftDeliveryInput &&
                      !draftDeliveryDates.includes(draftDeliveryInput)
                    ) {
                      setDraftDeliveryDates((x) =>
                        [...x, draftDeliveryInput].sort(),
                      );
                      setDraftDeliveryInput("");
                    }
                  }}
                >
                  <Plus />
                  Añadir
                </button>
              </div>
              <div className="delivery-date-list">
                {draftDeliveryDates.map((date) => (
                  <span key={date}>
                    {date}
                    <button
                      type="button"
                      onClick={() =>
                        setDraftDeliveryDates((dates) =>
                          dates.filter((x) => x !== date),
                        )
                      }
                    >
                      <XCircle />
                    </button>
                  </span>
                ))}
              </div>
              <label className="field">
                <span>Condiciones de pago</span>
                <textarea
                  value={draftPaymentTerms}
                  onChange={(e) => setDraftPaymentTerms(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Información general</span>
                <textarea
                  value={draftGeneralInfo}
                  onChange={(e) => setDraftGeneralInfo(e.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                busy={updateInvoiceDraft.isPending}
                disabled={!draftIssueDate}
                onClick={() => updateInvoiceDraft.mutate()}
              >
                Guardar datos
              </Button>
            </section>
          )}
          <section className="form-card draft-line-add">
            <h2>Añadir producto</h2>
            <SelectField label="Producto" value={newProductId} onChange={(e) => setNewProductId(e.target.value)}>
              <option value="">Selecciona</option>
              {products.data?.items.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
            </SelectField>
            <Field label="Cantidad" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} />
            {invoice && (
              <Field
                label="Fecha de entrega"
                type="date"
                value={newDeliveryDate}
                onChange={(e) => setNewDeliveryDate(e.target.value)}
              />
            )}
            <Button
              variant="secondary"
              icon={<Plus />}
              busy={editLine.isPending}
              disabled={!newProductId || Number(newQuantity.replace(",", ".")) <= 0}
              onClick={() => editLine.mutate({
                action: "add",
                productId: newProductId,
                quantity: newQuantity.replace(",", "."),
                deliveryDate: newDeliveryDate,
              })}
            >
              Añadir línea
            </Button>
            {editLine.isError && (
              <p className="action-feedback action-feedback--error" role="alert">
                {editLine.error instanceof ApiError && editLine.error.code === "invoice_total_below_paid"
                  ? "El nuevo total no puede quedar por debajo del importe ya cobrado."
                  : "No se pudo guardar la línea. Revisa cantidad, precio y fecha de entrega."}
              </p>
            )}
          </section>
          {item.status === "draft" && <Button
            icon={<FileCheck2 />}
            busy={action.isPending}
            disabled={!item.lines?.length || editLine.isPending}
            onClick={() =>
              window.confirm(invoice
                ? "¿Emitir la factura? Podrás seguir añadiendo pedidos durante la quincena."
                : "¿Emitir el albarán?") &&
              action.mutate("issue")
            }
          >
            Emitir {invoice ? "factura" : "albarán"}
          </Button>}
        </>
      )}
      {invoice && (
        <section className="detail-card invoice-action-card" aria-labelledby="invoice-actions-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Acciones</p>
              <h2 id="invoice-actions-title">Gestionar factura</h2>
            </div>
          </div>
          <div className="document-actions document-actions--invoice">
            <Button
              variant="secondary"
              icon={<MessageCircle />}
              busy={shareWhatsApp.isPending}
              disabled={item.status !== "issued"}
              onClick={() => shareWhatsApp.mutate()}
            >
              WhatsApp
            </Button>
            <Button
              variant="secondary"
              icon={<Mail />}
              busy={sendEmail.isPending}
              disabled={item.status !== "issued"}
              onClick={() => {
                const recipient = invoiceItem?.contactEmail;
                const message = recipient
                  ? `¿Enviar ahora la factura por Gmail a ${recipient}?`
                  : "Este cliente no tiene correo. ¿Comprobarlo igualmente?";
                if (window.confirm(message)) sendEmail.mutate();
              }}
            >
              Correo
            </Button>
            <Button
              variant="secondary"
              icon={<Printer />}
              busy={printPdf.isPending}
              disabled={item.status !== "issued"}
              onClick={() => printPdf.mutate()}
            >
              Imprimir
            </Button>
            <Button
              variant="secondary"
              icon={<Eye />}
              busy={pdf.isPending}
              disabled={item.status !== "issued"}
              onClick={() => pdf.mutate(window.open("", "_blank"))}
            >
              Ver PDF
            </Button>
            <Button
              variant="secondary"
              icon={<Pencil />}
              onClick={() => {
                if (editable) {
                  document.getElementById("invoice-edit")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  return;
                }
                window.alert("Una factura cancelada no se puede modificar.");
              }}
            >
              Editar
            </Button>
          </div>
          {item.status === "draft" && (
            <p className="form-hint">Termina de editar y emite la factura para enviarla, imprimirla o ver su PDF.</p>
          )}
          {item.status === "cancelled" && (
            <p className="form-hint">Las acciones de envío y PDF sólo están disponibles en facturas emitidas.</p>
          )}
          {actionMessage && <p className="action-feedback" role="status">{actionMessage}</p>}
          {(pdf.isError || printPdf.isError || shareWhatsApp.isError) && (
            <p className="action-feedback action-feedback--error" role="alert">No se pudo preparar el PDF. Inténtalo de nuevo.</p>
          )}
        </section>
      )}
      {item.status === "issued" && (
        <>
          <Button
            variant="danger"
            icon={<XCircle />}
            busy={action.isPending}
            onClick={() =>
              window.confirm("¿Cancelar este documento emitido?") &&
              action.mutate("cancel")
            }
          >
            Cancelar
          </Button>
          {!invoice && (
            <Button
              variant="secondary"
              icon={<ReceiptText />}
              busy={convert.isPending}
              onClick={() =>
                window.confirm(
                  "Se creará una factura en borrador. ¿Continuar?",
                ) && convert.mutate()
              }
            >
              Convertir en factura
            </Button>
          )}
        </>
      )}
    </div>
  );
}
