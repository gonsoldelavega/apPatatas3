import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, ListChecks, Plus, Scale } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { teamApi } from "../api/services";
import { useAuth } from "../auth/AuthProvider";
import { ledgerApi, ordersApi, tasksApi } from "../api/workspace";
import { useSideNames } from "./hooks";
import { NewOrderForm } from "./NewOrderForm";
import { describeBalance } from "./helpers";
import { OrderCard } from "./OrderCard";
import { TaskRow } from "./TaskRow";

/** Saludo del socio: el mensaje que escribió el maestro o, si no hay, «Hola, Nombre». */
export function PartnerWelcome() {
  const auth = useAuth();
  const welcome = useQuery({ queryKey: ["team-welcome"], queryFn: teamApi.myWelcome, staleTime: 5 * 60_000 });
  const firstName = auth.user?.displayName.trim().split(/\s+/)[0] ?? "";
  const text = welcome.data?.message || (firstName ? `Hola, ${firstName}` : "Hola");
  return <p className="partner-welcome">{text}</p>;
}

function PendingOrders() {
  const [creating, setCreating] = useState(false);
  const orders = useQuery({ queryKey: ["orders", "open"], queryFn: () => ordersApi.list("open") });
  const items = orders.data?.items ?? [];
  return (
    <section className="dashboard-section workspace-block" aria-labelledby="dash-orders-title">
      <div className="dashboard-section__heading">
        <h2 id="dash-orders-title">
          <ClipboardList aria-hidden="true" /> Pedidos pendientes
          {items.length > 0 && <span className="workspace-count">{items.length}</span>}
        </h2>
        <div className="workspace-block__actions">
          {!creating && (
            <button type="button" className="compact-action" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> Nuevo pedido
            </button>
          )}
          <Link to="/pedidos">Ver todos</Link>
        </div>
      </div>
      {creating && <NewOrderForm onDone={() => setCreating(false)} />}
      {orders.isLoading ? (
        <p className="form-hint">Cargando…</p>
      ) : orders.isError ? (
        <p className="form-hint">No se pudieron cargar los pedidos.</p>
      ) : items.length === 0 ? (
        <p className="workspace-empty">No hay pedidos pendientes.</p>
      ) : (
        <div className="order-list">
          {items.slice(0, 5).map((order) => (
            <OrderCard key={order.id} order={order} compact />
          ))}
          {items.length > 5 && (
            <Link className="workspace-more" to="/pedidos">
              Y {items.length - 5} más <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function OpenTasks() {
  const queryClient = useQueryClient();
  const sideNames = useSideNames();
  const tasks = useQuery({ queryKey: ["tasks", "open"], queryFn: () => tasksApi.list("open") });
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => tasksApi.create({ title: title.trim() }),
    onSuccess: async () => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) create.mutate();
  };
  const items = tasks.data?.items ?? [];
  return (
    <section className="dashboard-section workspace-block" aria-labelledby="dash-tasks-title">
      <div className="dashboard-section__heading">
        <h2 id="dash-tasks-title">
          <ListChecks aria-hidden="true" /> Tareas
          {items.length > 0 && <span className="workspace-count">{items.length}</span>}
        </h2>
        <Link to="/tareas">Ver todas</Link>
      </div>
      <form className="task-quick" onSubmit={submit}>
        <input
          type="text"
          aria-label="Nueva tarea"
          placeholder="Nueva tarea… (ej.: llevar muestras al bar)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" aria-label="Añadir tarea" disabled={!title.trim() || create.isPending}>
          <Plus aria-hidden="true" />
        </button>
      </form>
      {tasks.isLoading ? (
        <p className="form-hint">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="workspace-empty">Nada pendiente. ¡Todo al día!</p>
      ) : (
        <ul className="task-list">
          {items.slice(0, 6).map((task) => (
            <TaskRow key={task.id} task={task} sideNames={sideNames} allowDelete={false} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LedgerCard() {
  const summary = useQuery({ queryKey: ["ledger-summary", ""], queryFn: () => ledgerApi.summary() });
  if (!summary.data) return null;
  const message = describeBalance(summary.data);
  return (
    <Link to="/cuentas" className={`ledger-card${message.tone === "owed" ? " ledger-card--owed" : ""}`}>
      <Scale aria-hidden="true" />
      <span>
        <small>Cuentas entre núcleos</small>
        <strong>{message.tone === "even" ? message.headline : message.detail}</strong>
      </span>
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

/** Pedidos pendientes, tareas y cuentas. Los socios los ven arriba del todo; el maestro, tras lo fiscal. */
export function WorkspaceBlocks({ afterOrders }: { afterOrders?: ReactNode } = {}) {
  return (
    <div className="workspace-blocks">
      <PendingOrders />
      {afterOrders}
      <OpenTasks />
      <LedgerCard />
    </div>
  );
}
