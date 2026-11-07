import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ordersApi } from "../api/workspace";
import { EmptyState } from "../ui/EmptyState";
import { NewOrderForm } from "../workspace/NewOrderForm";
import { OrderCard } from "../workspace/OrderCard";

export function OrdersPage() {
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [creating, setCreating] = useState(false);
  const orders = useQuery({ queryKey: ["orders", tab], queryFn: () => ordersApi.list(tab) });
  const items = orders.data?.items ?? [];

  return (
    <div className="page workspace-page">
      <header className="page-heading page-heading--with-action">
        <div>
          <h1>Pedidos</h1>
          <p className="form-hint">Apunta lo que se ha hecho cada día: el pedido va quedando por partes.</p>
        </div>
        {!creating && (
          <button type="button" className="compact-action" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nuevo
          </button>
        )}
      </header>

      {creating && <NewOrderForm onDone={() => setCreating(false)} />}

      <div className="segmented" role="tablist" aria-label="Estado de los pedidos">
        <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>
          Pendientes
        </button>
        <button type="button" role="tab" aria-selected={tab === "completed"} className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}>
          Hechos
        </button>
      </div>

      {orders.isLoading ? (
        <p className="form-hint">Cargando pedidos…</p>
      ) : orders.isError ? (
        <div className="inline-error" role="alert">
          No se pudieron cargar los pedidos.
          <button type="button" onClick={() => void orders.refetch()}>
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={tab === "open" ? "No hay pedidos pendientes" : "Aún no hay pedidos hechos"}
          description={tab === "open" ? "Cuando un bar pida patatas, apúntalo aquí con «Nuevo»." : "Los pedidos completos aparecerán aquí."}
        />
      ) : (
        <div className="order-list">
          {items.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
