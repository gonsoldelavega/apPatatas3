import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, ScrollText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { contactsApi, deliveryNotesApi, invoicesApi } from "../api/services";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { formatDocumentNumber, formatMoney } from "../utils/format";

const statuses: Record<string, string> = {
  draft: "Borrador",
  issued: "Emitido",
  invoiced: "Facturado",
  cancelled: "Cancelado",
};
export function SalesPage() {
  const [tab, setTab] = useState<"delivery" | "invoice">("invoice");
  const [month, setMonth] = useState(""),
    [contactId, setContactId] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState("");
  const dateRange = month
      ? {
          from: `${month}-01`,
          to: new Date(
            Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
          )
            .toISOString()
            .slice(0, 10),
        }
      : {},
    filters = { pageSize: 100, contactId, status, search, ...dateRange };
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
        <Field
          label="Mes"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
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
      <Link
        className="compact-action"
        to={
          tab === "delivery" ? "/ventas/nuevo/albaran" : "/ventas/nuevo/factura"
        }
      >
        <Plus />
        Crear {tab === "delivery" ? "albarán" : "factura"}
      </Link>
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
            <strong>{formatMoney(item.total)}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
