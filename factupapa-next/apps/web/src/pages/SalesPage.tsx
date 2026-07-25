import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, ScrollText } from "lucide-react";
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

export function SalesPage() {
  const [tab, setTab] = useState<SalesTab>("invoice");
  const [period, setPeriod] = useState(currentPeriod("all"));
  const [contactId, setContactId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [search, setSearch] = useState("");

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

      <section className="sales-summary-card" aria-label="Resumen visible">
        <div>
          <span>{tab === "invoice" ? "Importe visible" : "Total pendiente"}</span>
          <strong>{formatMoney(String(visibleTotal))}</strong>
        </div>
        <div>
          <span>Documentos</span>
          <strong>{items?.length ?? 0}</strong>
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

          return (
            <Link
              className="entity-card"
              key={item.id}
              to={`/ventas/${tab === "delivery" ? "albaranes" : "facturas"}/${item.id}`}
            >
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
            </Link>
          );
        })}
      </div>

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
