import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Ellipsis,
  Banknote,
  FileText,
  MessageCircle,
  Plus,
  Printer,
  ScrollText,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  accountsApi,
  contactsApi,
  deliveryNotesApi,
  invoicesApi,
  salesPreferencesApi,
} from "../api/services";
import type { DeliveryNote, Invoice } from "../api/types";
import { retryAfterSessionRenewal } from "../api/retry-renewed-write";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { PeriodPicker } from "../ui/PeriodPicker";
import { SelectField } from "../ui/SelectField";
import {
  annualInvoiceSeries,
  formatDocumentNumber,
  formatMoney,
  todayLocal,
} from "../utils/format";
import { currentPeriod, periodRange } from "../utils/period";
import { useToast } from "../ui/ToastProvider";

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
  printTarget?: Window | null,
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
  if (printTarget) printTarget.location.href = url;
  else window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

async function runNoteQuickAction(
  note: DeliveryNote,
  action: InvoiceQuickAction,
  printTarget?: Window | null,
): Promise<void> {
  const blob = await deliveryNotesApi.downloadPdf(note.id, { prices: true, copies: 1 });
  const title = `Albarán ${formatDocumentNumber(note.series, note.number)}`;
  const filename = `${title.replace(/[^a-z0-9_-]+/gi, "_")}.pdf`;
  if (action === "whatsapp") {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, text: title, files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url;
    download.download = filename;
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    window.location.href = `https://wa.me/?text=${encodeURIComponent(`${title}. He descargado el PDF para adjuntarlo.`)}`;
    return;
  }
  const url = URL.createObjectURL(blob);
  if (printTarget) printTarget.location.href = url;
  else window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function SalesPage() {
  const [tab, setTab] = useState<SalesTab>("invoice");
  const [period, setPeriod] = useState(currentPeriod("all"));
  const [contactId, setContactId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const noteQuickAction = useMutation({
    mutationFn: ({
      note,
      action,
      printTarget,
    }: {
      note: DeliveryNote;
      action: InvoiceQuickAction;
      printTarget?: Window | null;
    }) => runNoteQuickAction(note, action, printTarget),
    onError: (_error, variables) => variables.printTarget?.close(),
  });
  const preferences = useQuery({
    queryKey: ["sales-preferences"],
    queryFn: salesPreferencesApi.get,
  });
  const quickAction = useMutation({
    mutationFn: ({
      invoice,
      action,
      printTarget,
    }: {
      invoice: Invoice;
      action: InvoiceQuickAction;
      printTarget?: Window | null;
    }) => runInvoiceQuickAction(invoice, action, printTarget),
    onError: (_error, variables) => variables.printTarget?.close(),
  });
  const quickCollect = useMutation({
    mutationFn: async (invoice: Invoice) => {
      const amount = Math.max(0, Number(invoice.balanceDue ?? invoice.total)).toFixed(2);
      const input = {
        amount,
        paidAt: `${todayLocal()}T12:00:00`,
        method: null,
        reference: null,
        notes: null,
      };
      return retryAfterSessionRenewal(() =>
        accountsApi.addInvoicePayment(invoice.id, input),
      );
    },
    onSuccess: async (_payment, invoice) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] }),
        queryClient.invalidateQueries({ queryKey: ["finance-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      toast.show("Factura marcada como pagada.");
    },
    onError: () => {
      toast.show("No se pudo marcar la factura como pagada. Inténtalo de nuevo.");
    },
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

  const contactName = (contactId: string) => {
    const contact = contacts.data?.items.find((candidate) => candidate.id === contactId);
    return contact ? contact.tradeName || contact.legalName : "";
  };
  const monthOf = (note: DeliveryNote) => note.issueDate.slice(0, 7);
  const selectedNotes = (notes.data?.items ?? []).filter((note) =>
    selected.includes(note.id),
  );
  const selectionClient = selectedNotes[0]?.contactId;
  const selectionMonth = selectedNotes[0] ? monthOf(selectedNotes[0]) : undefined;
  const selectionTotal = selectedNotes.reduce((sum, note) => sum + Number(note.subtotal), 0);
  const toggleNote = (note: DeliveryNote) =>
    setSelected((current) =>
      current.includes(note.id)
        ? current.filter((value) => value !== note.id)
        : [...current, note.id],
    );
  const invoiceSelected = useMutation({
    mutationFn: () =>
      invoicesApi.fromDeliveryNotes({
        deliveryNoteIds: selected,
        series: annualInvoiceSeries(
          preferences.data?.numberingMode === "live"
            ? preferences.data.invoicePrefix
            : "TEST",
        ),
        issueDate: todayLocal(),
      }),
    onSuccess: async (created) => {
      setSelected([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["delivery-notes"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      ]);
      navigate(`/ventas/facturas/${created.id}`);
    },
    onError: () => toast.show("No se pudo crear la factura. Revisa que sean del mismo cliente."),
  });

  const activeQuery = tab === "delivery" ? notes : invoices;
  const items = activeQuery.data?.items;
  const visibleTotal = (items ?? []).reduce(
    (total, item) =>
      total + Number(tab === "delivery" ? (item as DeliveryNote).subtotal : item.total),
    0,
  );

  return (
    <div className="page sales-page">
      <header className="page-heading page-heading--with-action">
        <div>
          <h1>Facturas</h1>
        </div>
        <button
          type="button"
          className="compact-action"
          aria-haspopup="dialog"
          onClick={() => setNewOpen(true)}
        >
          <Plus aria-hidden="true" />
          Nuevo
        </button>
      </header>

      <div className="segmented" role="tablist" aria-label="Tipo de documento">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "invoice"}
          className={tab === "invoice" ? "active" : ""}
          onClick={() => { setTab("invoice"); setSelected([]); }}
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
          Albaranes
        </button>
      </div>

      <section className="sales-summary-card sales-summary-card--compact" aria-label="Resumen visible">
        <div className="sales-summary-card__amount">
          <span>Importe visible</span>
          <strong>{formatMoney(String(visibleTotal))}</strong>
          <small>
            {items?.length ?? 0} {tab === "invoice" ? "facturas" : "albaranes"} visibles
          </small>
        </div>
      </section>

      {tab === "invoice" && (
        <div className="sales-quick-filters" aria-label="Filtros rápidos de cobro">
          {[
            ["", "Todo"],
            ["unpaid", "Pendientes"],
            ["paid", "Pagadas"],
            ["partial", "Parciales"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value || "all"}
              className={paymentStatus === value ? "active" : ""}
              aria-pressed={paymentStatus === value}
              onClick={() => setPaymentStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "delivery" && (
        <div className="sales-quick-filters" aria-label="Filtros rápidos de albaranes">
          {[
            ["", "Todos"],
            ["issued", "Pendientes de facturar"],
            ["invoiced", "Facturados"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value || "all"}
              className={status === value ? "active" : ""}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <section className="sales-filter-shell" aria-label="Filtros de facturas">
        <Field
          label="Buscar"
          value={search}
          placeholder="Número, cliente o concepto"
          onChange={(event) => setSearch(event.target.value)}
        />
        <details className="form-options sales-advanced-filters">
          <summary>Más filtros</summary>
          <div className="filter-card">
            <PeriodPicker value={period} onChange={setPeriod} allowAll />
            <SelectField
              label="Estado"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="draft">Borrador</option>
              <option value="issued">Emitido</option>
              <option value="invoiced">Facturado</option>
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
          </div>
        </details>
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
          title={tab === "delivery" ? "No hay albaranes" : "No hay facturas"}
          description={
            tab === "delivery"
              ? "Crea un albarán para entregar la mercancía; después podrás imprimirlo y facturarlo."
              : "Crea una factura directa para empezar a registrar tus ventas y cobros."
          }
        />
      )}

      <div className="card-list sales-list" aria-busy={activeQuery.isLoading}>
        {items?.map((item) => {
          const invoice = tab === "invoice" ? (item as Invoice) : undefined;
          const statusLabel = invoice?.status === "issued" && invoice.paymentStatus
            ? paymentStatuses[invoice.paymentStatus]
            : statuses[item.status];

          const detailUrl = `/ventas/${tab === "delivery" ? "albaranes" : "facturas"}/${item.id}`;
          const card = (
            <Link className="entity-card" to={detailUrl}>
              <span className="entity-card__icon">
                {tab === "delivery" ? <ScrollText /> : <FileText />}
              </span>
              <span className="entity-card__body">
                <span className="entity-card__headline">
                  <strong>{formatDocumentNumber(item.series, item.number)}</strong>
                  <strong className="entity-card__amount">
                    {formatMoney(tab === "delivery" ? (item as DeliveryNote).subtotal : item.total)}
                  </strong>
                </span>
                {invoice && (
                  <small className="entity-card__customer">{invoice.contactLegalName}</small>
                )}
                {!invoice && contactName((item as DeliveryNote).contactId) && (
                  <small className="entity-card__customer">
                    {contactName((item as DeliveryNote).contactId)}
                  </small>
                )}
                <small className="entity-card__date">{item.issueDate}</small>
                <span className={`status ${invoice?.status === "issued" ? `payment-status payment-status--${invoice.paymentStatus}` : `status--${item.status}`}`}>
                  {statusLabel ?? item.status}
                </span>
              </span>
              <ChevronRight className="entity-card__chevron" aria-hidden="true" />
            </Link>
          );

          if (!invoice) {
            const note = item as DeliveryNote;
            const printable = note.status === "issued" || note.status === "invoiced";
            const selectable = note.status === "issued";
            const blocked =
              selectable &&
              !!selectionClient &&
              !selected.includes(note.id) &&
              (note.contactId !== selectionClient || monthOf(note) !== selectionMonth);
            const noteBusy =
              noteQuickAction.isPending && noteQuickAction.variables?.note.id === note.id;
            return (
              <article className="invoice-list-card" key={note.id}>
                {card}
                <div className="invoice-card-actions" aria-label={`Acciones de ${formatDocumentNumber(note.series, note.number)}`}>
                  {selectable && (
                    <label className="note-select" title={blocked ? "Sólo del mismo cliente y mes" : "Seleccionar para facturar"}>
                      <input
                        type="checkbox"
                        checked={selected.includes(note.id)}
                        disabled={blocked}
                        onChange={() => toggleNote(note)}
                        aria-label={`Seleccionar ${formatDocumentNumber(note.series, note.number)} para facturar`}
                      />
                      <span>Facturar</span>
                    </label>
                  )}
                  {printable && (
                    <>
                      <button
                        type="button"
                        aria-label="Enviar albarán por WhatsApp"
                        title="WhatsApp"
                        disabled={noteBusy}
                        onClick={() => noteQuickAction.mutate({ note, action: "whatsapp" })}
                      >
                        <MessageCircle aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Imprimir albarán"
                        title="Imprimir"
                        disabled={noteBusy}
                        onClick={() => noteQuickAction.mutate({
                          note,
                          action: "print",
                          printTarget: window.open("", "_blank"),
                        })}
                      >
                        <Printer aria-hidden="true" />
                      </button>
                    </>
                  )}
                  <Link to={detailUrl} aria-label="Ver todas las opciones del albarán" title="Más opciones">
                    <Ellipsis aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          }

          const actionBusy =
            quickAction.isPending && quickAction.variables?.invoice.id === invoice.id;
          const collectBusy = quickCollect.isPending && quickCollect.variables?.id === invoice.id;
          const canCollect = item.status === "issued" && invoice.paymentStatus !== "paid" && Number(invoice.balanceDue ?? invoice.total) > 0;
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
                      onClick={() => quickAction.mutate({
                        invoice,
                        action: "print",
                        printTarget: window.open("", "_blank"),
                      })}
                    >
                      <Printer aria-hidden="true" />
                    </button>
                    {canCollect && (
                      <button
                        type="button"
                        className="invoice-card-actions__pay"
                        aria-label="Marcar factura como pagada"
                        title="Marcar pagada"
                        disabled={actionBusy || collectBusy}
                        onClick={() => {
                          const amount = invoice.balanceDue ?? invoice.total;
                          if (window.confirm(`¿Marcar ${formatDocumentNumber(invoice.series, invoice.number)} como pagada por ${formatMoney(amount)}? Se registrará el cobro de hoy.`)) {
                            quickCollect.mutate(invoice);
                          }
                        }}
                      >
                        <Banknote aria-hidden="true" />
                        <span>Marcar pagada</span>
                      </button>
                    )}
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
      {noteQuickAction.isError && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo preparar el PDF del albarán. Inténtalo de nuevo.
        </p>
      )}
      {quickCollect.isError && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo marcar la factura como pagada. Inténtalo de nuevo.
        </p>
      )}

      {tab === "delivery" && selectedNotes.length > 0 && (
        <div className="note-invoice-bar" role="region" aria-label="Facturar albaranes seleccionados">
          <span>
            <strong>{selectedNotes.length}</strong> {selectedNotes.length === 1 ? "albarán" : "albaranes"} ·{" "}
            {contactName(selectionClient ?? "")} · {formatMoney(String(selectionTotal))}
          </span>
          <button
            type="button"
            className="primary-action"
            disabled={invoiceSelected.isPending}
            onClick={() => invoiceSelected.mutate()}
          >
            Crear factura
          </button>
        </div>
      )}

      {newOpen && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewOpen(false);
          }}
        >
          <section className="action-sheet" role="dialog" aria-modal="true" aria-labelledby="sales-new-title">
            <header>
              <div>
                <p className="eyebrow">Ventas</p>
                <h2 id="sales-new-title">¿Qué quieres crear?</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setNewOpen(false)} aria-label="Cerrar">
                <X />
              </button>
            </header>
            <button
              type="button"
              className="action-sheet__primary"
              onClick={() => { setNewOpen(false); navigate("/ventas/nuevo/factura"); }}
            >
              <FileText />
              <span><strong>Factura</strong><small>Venta directa con número de factura</small></span>
            </button>
            <button
              type="button"
              onClick={() => { setNewOpen(false); navigate("/ventas/nuevo/albaran"); }}
            >
              <ScrollText />
              <span><strong>Albarán</strong><small>Entrega para imprimir y facturar después</small></span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
