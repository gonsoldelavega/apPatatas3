import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, ScrollText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { deliveryNotesApi, invoicesApi } from "../api/services";
import { EmptyState } from "../ui/EmptyState";
import { formatDocumentNumber, formatMoney } from "../utils/format";

const statuses: Record<string, string> = {
  draft: "Borrador",
  issued: "Emitido",
  invoiced: "Facturado",
  cancelled: "Cancelado",
};
export function SalesPage() {
  const [tab, setTab] = useState<"delivery" | "invoice">("invoice");
  const notes = useQuery({
    queryKey: ["delivery-notes"],
    queryFn: () => deliveryNotesApi.list({ pageSize: 100 }),
  });
  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesApi.list({ pageSize: 100 }),
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
              <strong>
                {formatDocumentNumber(item.series, item.number)}
              </strong>
              <small>{item.issueDate}</small>
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
