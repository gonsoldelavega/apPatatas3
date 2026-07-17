import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Printer,
  Share2,
  FileCheck2,
  ReceiptText,
  XCircle,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deliveryNotesApi,
  invoicesApi,
  salesPreferencesApi,
} from "../api/services";
import { Button } from "../ui/Button";
import type { Invoice } from "../api/types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingScreen } from "../ui/LoadingScreen";
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
  const documentQuery = useQuery({
    queryKey: [type, id],
    queryFn: () => api.get(id),
  });
  const preferences = useQuery({
    queryKey: ["sales-preferences"],
    queryFn: salesPreferencesApi.get,
    enabled: !invoice,
  });
  const action = useMutation({
    mutationFn: (name: "issue" | "cancel") => api[name](id),
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
        if (navigator.canShare?.({ files: [f] }))
          await navigator.share({ title: "Factura", files: [f] });
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
            </span>
            <strong>{formatMoney(line.lineTotal)}</strong>
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
        <Button
          icon={<FileCheck2 />}
          busy={action.isPending}
          onClick={() =>
            window.confirm("Emitir bloquea el documento. ¿Continuar?") &&
            action.mutate("issue")
          }
        >
          Emitir {invoice ? "factura" : "albarán"}
        </Button>
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
