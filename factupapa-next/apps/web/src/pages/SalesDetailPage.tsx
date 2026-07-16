import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  FileCheck2,
  ReceiptText,
  XCircle,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deliveryNotesApi, invoicesApi, salesPreferencesApi } from "../api/services";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingScreen } from "../ui/LoadingScreen";
import { annualInvoiceSeries, formatDocumentNumber, formatMoney, formatQuantity, formatTaxRate, formatUnitPrice, todayLocal, unitLabel } from "../utils/format";

const statusLabel = (status: string, invoice: boolean) => ({
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
  const document = useQuery({
    queryKey: [type, id],
    queryFn: () => api.get(id),
  });
  const preferences = useQuery({ queryKey: ["sales-preferences"], queryFn: salesPreferencesApi.get, enabled: !invoice });
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
  const convert = useMutation({
    mutationFn: () =>
      invoicesApi.fromDeliveryNotes({
        deliveryNoteIds: [id],
        series: annualInvoiceSeries(preferences.data?.invoicePrefix ?? "FAC"),
        issueDate: todayLocal(),
      }),
    onSuccess: (created) => navigate(`/ventas/facturas/${created.id}`),
  });
  if (document.isLoading) return <LoadingScreen />;
  if (!document.data)
    return (
      <div className="page">
        <EmptyState
          title="Documento no disponible"
          description="No existe o no pertenece a tu empresa."
        />
      </div>
    );
  const item = document.data;
  return (
    <div className="page detail-page sales-detail">
      <header className="detail-header">
        <Link className="icon-button" to="/ventas" aria-label="Volver">
          <ArrowLeft />
        </Link>
        <div className="detail-header__title">
          <p className="eyebrow">{invoice ? "Factura" : "Albarán"}</p>
          <h1>
            {item.number ? formatDocumentNumber(item.series, item.number) : "Borrador"}
          </h1>
          <span className={`status status--${item.status}`}>{statusLabel(item.status, invoice)}</span>
        </div>
      </header>
      <section className="detail-card">
        <h2>Líneas</h2>
        {item.lines?.map((line) => (
          <div className="sales-line" key={line.id}>
            <span>
              <strong>{line.description}</strong>
              <small>
                {formatQuantity(line.quantity)} {unitLabel(line.unit)} × {formatUnitPrice(line.unitPrice)}
                {invoice ? ` · IVA ${formatTaxRate(line.taxRate)}` : ""}
              </small>
            </span>
            <strong>{formatMoney(line.lineTotal)}</strong>
          </div>
        ))}
        <div className="sales-totals">
          <div><span>Base imponible</span><strong>{formatMoney(item.subtotal)}</strong></div>
          <div><span>IVA</span><strong>{formatMoney(item.taxTotal)}</strong></div>
          <div className="sales-total"><span>Total</span><strong>{formatMoney(item.total)}</strong></div>
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
            <Button
              variant="secondary"
              icon={<Download />}
              busy={pdf.isPending}
              onClick={() => pdf.mutate()}
            >
              Ver PDF
            </Button>
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
