import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Ellipsis,
  FileText,
  MessageCircle,
  Plus,
  Printer,
  ScrollText,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { contactsApi, deliveryNotesApi, invoicesApi } from "../api/services";
import type { Invoice } from "../api/types";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { PeriodPicker } from "../ui/PeriodPicker";
import { SelectField } from "../ui/SelectField";
import { formatDocumentNumber, formatMoney } from "../utils/format";
import { currentPeriod, periodRange } from "../utils/period";

const statuses: Record<string, string> = {
  draft: "Borrador",
  issued: "Emitido",
  invoiced: "Facturado",
  cancelled: "Cancelado",
};

const paymentStatuses: Record<string, string> = {
  unpaid: "Pendiente",
  partial: "Parcial",
  overdue: "Vencida",
  paid: "Pagada",
};

type SalesTab = "invoice" | "delivery";
type InvoiceQuickAction = "whatsapp" | "print";

const invoiceFilename = (invoice: Invoice) =>
  `${formatDocumentNumber(invoice.series, invoice.number).replace(/[^a-z0-9_-]+/gi, "_")}.pdf`;

async function runInvoiceQuickAction(
  invoice: Invoice,
  action: InvoiceQuickAction,
): Promise<void> {
  const blob = await invoicesApi.downloadPdf(invoice.id);
  if (action === "whatsapp") {
    const title = `Factura ${formatDocumentNumber(invoice.series, invoice.number)}`;
    const file = new File([blob], invoiceFilename(invoice), {
      type: "application/pdf",
    });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, text: title, files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url;
    download.download = invoiceFilename(invoice);
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    window.location.href = `https://wa.me/?text=${encodeURIComponent(`${title}. He descargado el PDF para adjuntarlo.`)}`;
    return;
  }

  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = url;
  frame.onload = () => frame.contentWindow?.print();
  document.body.append(frame);
  window.setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function SalesPage() {
  const [tab, setTab] = useState<SalesTab>("invoice");
  const [period, setPeriod] = useState(currentPeriod("all"));
  const [contactId, setContactId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [search, setSearch] = useState("");
  const quickAction = useMutation({
    mutationFn: ({
      invoice,
      action,
    }: {
      invoice: Invoice;
      action: InvoiceQuickAction;
    }) => runInvoiceQuickAction(invoice, action),
  });

  const filters = {
    pageSize: 100,
    contactId,
    status,
    paymentStatus: tab === "invoice" ? paymentStatus : "",
    search,
    ...periodRange(period),
  };

  const contacts = useQuery({
    queryKey: ["sales-filter-contacts"],
    queryFn: () => contactsApi.list({ isActive: true, pageSize: 100 }),
  });
  const notes = useQuery({
    queryKey: ["delivery-notes", filters],
    queryFn: () => deliveryNotesApi.list(filters),
  });
  const invoices = useQuery({
    queryKey: ["invoices", filters],
    queryFn: () => invoicesApi.list(filters),
  });

  const activeQuery = tab === "delivery" ? notes : invoices;
  const items = activeQuery.data?.items;
  const visibleTotal = (items ?? []).reduce(
    (total, item) => total + Number(item.total),
    0,
  );

  return (
    <div className="page sales-page">
      <header className="page-heading page-heading--with-action">
        <div>
          <p className="eyebrow">Cobros y facturación</p>
          <h1>Facturas</h1>
          <p>Crea facturas directas, controla lo pendiente y registra los cobros.</p>
        </div>
        <Link className="compact-action" to="/ventas/nuevo/factura">
          <Plus aria-hidden="true" />
          Nueva factura
        </Link>
      </header>

      <div className="segmented" role="tablist" aria-label="Tipo de documento">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "invoice"}
          className={tab === "invoice" ? "active" : ""}
          onClick={() => setTab("invoice")}
        >
          Facturas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "delivery"}
          className={tab === "delivery" ? "active" : ""}
          onClick={() => setTab("delivery")}
        >
          Albaranes pendientes
        </button>
      </div>

      <section className="sales-summary-card sales-summary-card--compact" aria-label="Resumen visible">
        <div className="sales-summary-card__amount">
          <span>{tab === "invoice" ? "Importe visible" : "Total pendiente"}</span>
          <strong>{formatMoney(String(visibleTotal))}</strong>
        </div>
        <div className="sales-summary-card__documents">
          <strong>{items?.length ?? 0}</strong>
          <span>documentos</span>
        </div>
      </section>

      <section className="filter-card" aria-label="Filtros de facturas">
        <Field
          label="Buscar"
          value={search}
          placeholder="Número, cliente o concepto"
          onChange={(event) => setSearch(event.target.value)}
        />
        <PeriodPicker value={period} onChange={setPeriod} allowAll />
        <SelectField
          label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos</option>
          <option value="draft">Borrador</option>
          <option value="issued">Emitido</option>
          <option value="cancelled">Cancelado</option>
        </SelectField>
        {tab === "invoice" && (
          <SelectField
            label="Cobro"
            value={paymentStatus}
            onChange={(event) => setPaymentStatus(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="unpaid">Pendientes</option>
            <option value="partial">Cobro parcial</option>
            <option value="overdue">Vencidas</option>
            <option value="paid">Pagadas</option>
          </SelectField>
        )}
        <SelectField
          label="Cliente"
          value={contactId}
          onChange={(event) => setContactId(event.target.value)}
        >
          <option value="">Todos</option>
          {contacts.data?.items
            .filter((contact) => contact.type !== "supplier")
            .map((contact) => (
              <option value={contact.id} key={contact.id}>
                {contact.tradeName || contact.legalName}
              </option>
            ))}
        </SelectField>
      </section>

      {activeQuery.isLoading && (
        <div className="loading-card" role="status">Cargando documentos…</div>
      )}

      {activeQuery.isError && (
        <div className="inline-error" role="alert">
          <span>No se han podido cargar los documentos.</span>
          <button type="button" onClick={() => void activeQuery.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {!activeQuery.isLoading && !activeQuery.isError && !items?.length && (
        <EmptyState
          title={tab === "delivery" ? "No hay albaranes pendientes" : "No hay facturas"}
          description={
            tab === "delivery"
              ? "Los albaranes pendientes aparecerán aquí solo cuando existan."
              : "Crea una factura directa para empezar a registrar tus ventas y cobros."
          }
        />
      )}

      <div className="card-list sales-list" aria-busy={activeQuery.isLoading}>
        {items?.map((item) => {
          const invoice = tab === "invoice" ? (item as Invoice) : undefined;
          const statusLabel = invoice?.paymentStatus
            ? paymentStatuses[invoice.paymentStatus]
            : statuses[item.status];

          const detailUrl = `/ventas/${tab === "delivery" ? "albaranes" : "facturas"}/${item.id}`;
          const card = (
            <Link className="entity-card" to={detailUrl}>
              <span className="entity-card__icon">
                {tab === "delivery" ? <ScrollText /> : <FileText />}
              </span>
              <span className="entity-card__body">
                <strong>{formatDocumentNumber(item.series, item.number)}</strong>
                <small>
                  {invoice
                    ? `${invoice.contactLegalName} · ${item.issueDate}`
                    : item.issueDate}
                </small>
                <span className={`status status--${item.status}`}>
                  {statusLabel ?? item.status}
                </span>
              </span>
              <strong className="entity-card__amount">{formatMoney(item.total)}</strong>
              <ChevronRight className="entity-card__chevron" aria-hidden="true" />
            </Link>
          );

          if (!invoice) return <div key={item.id}>{card}</div>;

          const actionBusy =
            quickAction.isPending && quickAction.variables?.invoice.id === invoice.id;
          return (
            <article className="invoice-list-card" key={item.id}>
              {card}
              <div className="invoice-card-actions" aria-label={`Acciones de ${formatDocumentNumber(item.series, item.number)}`}>
                {item.status === "issued" && (
                  <>
                    <button
                      type="button"
                      aria-label="Enviar factura por WhatsApp"
                      title="WhatsApp"
                      disabled={actionBusy}
                      onClick={() => quickAction.mutate({ invoice, action: "whatsapp" })}
                    >
                      <MessageCircle aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Imprimir factura"
                      title="Imprimir"
                      disabled={actionBusy}
                      onClick={() => quickAction.mutate({ invoice, action: "print" })}
                    >
                      <Printer aria-hidden="true" />
                    </button>
                  </>
                )}
                <Link to={detailUrl} aria-label="Ver todas las opciones de la factura" title="Más opciones">
                  <Ellipsis aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {quickAction.isError && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo preparar el PDF. Inténtalo de nuevo.
        </p>
      )}

      {tab === "delivery" && (
        <div className="sales-toolbar">
          <Link className="secondary-action" to="/ventas/nuevo/albaran">
            Crear albarán
          </Link>
        </div>
      )}
    </div>
  );
}
