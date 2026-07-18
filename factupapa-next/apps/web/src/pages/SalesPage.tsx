import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, ScrollText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { contactsApi, deliveryNotesApi, invoicesApi } from "../api/services";
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
export function SalesPage() {
  const [tab, setTab] = useState<"delivery" | "invoice">("invoice");
  const [period, setPeriod] = useState(currentPeriod("all")),
    [contactId, setContactId] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState("");
  const filters = {
    pageSize: 100,
    contactId,
    status,
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
  const items = tab === "delivery" ? notes.data?.items : invoices.data?.items;
  const visibleTotal = (items ?? []).reduce(
    (total, item) => total + Number(item.total),
    0,
  );
  return (
    <div className="page sales-page">
      <header className="page-heading">
        <p className="eyebrow">Operativa comercial</p>
        <h1>Ventas</h1>
        <p>Facturación directa y documentos de venta de tu empresa.</p>
      </header>
      <div className="segmented" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "invoice"}
          className={tab === "invoice" ? "active" : ""}
          onClick={() => setTab("invoice")}
        >
          Facturas
        </button>
        <button
          role="tab"
          aria-selected={tab === "delivery"}
          className={tab === "delivery" ? "active" : ""}
          onClick={() => setTab("delivery")}
        >
          Albaranes
        </button>
      </div>
      <section className="filter-card">
        <Field
          label="Buscar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <PeriodPicker value={period} onChange={setPeriod} allowAll />
        <SelectField
          label="Estado"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="draft">Borrador</option>
          <option value="issued">Emitido</option>
          <option value="cancelled">Cancelado</option>
        </SelectField>
        <SelectField
          label="Cliente"
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
        >
          <option value="">Todos</option>
          {contacts.data?.items
            .filter((x) => x.type !== "supplier")
            .map((x) => (
              <option value={x.id} key={x.id}>
                {x.tradeName || x.legalName}
              </option>
            ))}
        </SelectField>
      </section>
      <div className="sales-toolbar">
        <span>
          <small>{items?.length ?? 0} documentos</small>
          <strong>{formatMoney(String(visibleTotal))}</strong>
        </span>
        <Link
          className="compact-action"
          to={
            tab === "delivery"
              ? "/ventas/nuevo/albaran"
              : "/ventas/nuevo/factura"
          }
        >
          <Plus />
          Crear {tab === "delivery" ? "albarán" : "factura"}
        </Link>
      </div>
      {!items?.length && (
        <EmptyState
          title={`No hay ${tab === "delivery" ? "albaranes" : "facturas"}`}
          description="Crea un primer borrador con datos exclusivamente ficticios."
        />
      )}
      <div className="card-list sales-list">
        {items?.map((item) => (
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
                {tab === "invoice"
                  ? `${(item as import("../api/types").Invoice).contactLegalName} · ${item.issueDate}`
                  : item.issueDate}
              </small>
              <span className={`status status--${item.status}`}>
                {statuses[item.status]}
              </span>
            </span>
            <strong className="entity-card__amount">
              {formatMoney(item.total)}
            </strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
