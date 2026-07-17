import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Plus,
  Printer,
  Share2,
  FileCheck2,
  ReceiptText,
  XCircle,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deliveryNotesApi,
  invoicesApi,
  productsApi,
  salesPreferencesApi,
} from "../api/services";
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
    [draftIssueDate, setDraftIssueDate] = useState(todayLocal()),
    [draftDueDate, setDraftDueDate] = useState(""),
    [draftStartDate, setDraftStartDate] = useState(""),
    [draftEndDate, setDraftEndDate] = useState(""),
    [draftDeliveryDates, setDraftDeliveryDates] = useState<string[]>([]),
    [draftDeliveryInput, setDraftDeliveryInput] = useState(""),
    [draftPaymentTerms, setDraftPaymentTerms] = useState(""),
    [draftGeneralInfo, setDraftGeneralInfo] = useState("");
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
    mutationFn: async (input: { action: "add"; productId: string; quantity: string } | { action: "delete"; lineId: string }) => {
      if (input.action === "add")
        await api.addLine(id, { productId: input.productId, quantity: input.quantity });
      else await api.deleteLine(id, input.lineId);
    },
    onSuccess: async () => {
      setNewProductId("");
      setNewQuantity("1");
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
    mutationFn: () => invoicesApi.downloadPdf(id),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });
  const downloadPdf = useMutation({
      mutationFn: () => invoicesApi.downloadPdf(id),
      onSuccess: (b) => {
        const u = URL.createObjectURL(b),
          a = document.createElement("a");
        a.href = u;
        a.download = "factura.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 60000);
      },
    }),
    sharePdf = useMutation({
      mutationFn: () => invoicesApi.downloadPdf(id),
      onSuccess: async (b) => {
        const f = new File([b], "factura.pdf", { type: "application/pdf" });
        if (navigator.canShare?.({ files: [f] })) {
          await navigator.share({ title: "Factura", files: [f] });
          return;
        }
        const u = URL.createObjectURL(b),
          a = document.createElement("a"),
          current = documentQuery.data as Invoice | undefined,
          subject = current?.number
            ? `Factura ${formatDocumentNumber(current.series, current.number)}`
            : "Factura";
        a.href = u;
        a.download = `${subject.replace(/[^a-z0-9_-]+/gi, "_")}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 60000);
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent("Adjunto la factura en PDF. Si no se adjunta automáticamente, usa el archivo descargado.")}`;
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
              {bagLabel(line.quantity, line.unit) && (
                <small>{bagLabel(line.quantity, line.unit)}</small>
              )}
            </span>
            <span className="sales-line__amount">
              <strong>{formatMoney(line.lineTotal)}</strong>
              {item.status === "draft" && (
                <button
                  type="button"
                  aria-label={`Eliminar ${line.description}`}
                  onClick={() => window.confirm("¿Quitar esta línea?") && editLine.mutate({ action: "delete", lineId: line.id })}
                >
                  <Trash2 />
                </button>
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
      {item.status === "draft" && (
        <>
          {invoiceItem && (
            <section className="form-card">
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
            <Button
              variant="secondary"
              icon={<Plus />}
              busy={editLine.isPending}
              disabled={!newProductId || Number(newQuantity.replace(",", ".")) <= 0}
              onClick={() => editLine.mutate({ action: "add", productId: newProductId, quantity: newQuantity.replace(",", ".") })}
            >
              Añadir línea
            </Button>
          </section>
          <Button
            icon={<FileCheck2 />}
            busy={action.isPending}
            disabled={!item.lines?.length || editLine.isPending}
            onClick={() =>
              window.confirm("Emitir bloquea el documento. ¿Continuar?") &&
              action.mutate("issue")
            }
          >
            Emitir {invoice ? "factura" : "albarán"}
          </Button>
        </>
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
          {invoice ? (
            <div className="document-actions">
              <Button
                variant="secondary"
                icon={<Download />}
                onClick={() => pdf.mutate()}
              >
                Ver PDF
              </Button>
              <Button variant="secondary" onClick={() => downloadPdf.mutate()}>
                Descargar
              </Button>
              <Button
                variant="secondary"
                icon={<Share2 />}
                onClick={() => sharePdf.mutate()}
              >
                WhatsApp / email
              </Button>
              <Button
                variant="secondary"
                icon={<Printer />}
                onClick={() => printPdf.mutate()}
              >
                Imprimir
              </Button>
            </div>
          ) : (
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
