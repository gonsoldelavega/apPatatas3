import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Store, X } from "lucide-react";
import { useState } from "react";
import { ApiError } from "../api/client";
import { ordersApi, type Order, type OrderLine } from "../api/workspace";
import { todayLocal } from "../utils/format";
import { doneOfText, formatShortDate, isOverdue, progressPercent, remainingText, unitName } from "./helpers";

const errorText = (error: unknown): string =>
  error instanceof ApiError && error.code === "invalid_request"
    ? "Esa cantidad no es válida: no puede pasar de lo pedido ni quedar por debajo de cero."
    : "No se pudo guardar. Inténtalo de nuevo.";

function LineProgress({ order, line, readOnly, compact }: { order: Order; line: OrderLine; readOnly: boolean; compact: boolean }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  // En el Resumen los controles van plegados: se abren al pulsar «Anotar avance».
  const [expanded, setExpanded] = useState(!compact);
  const progress = useMutation({
    mutationFn: (body: { delta: string } | { done: string }) => ordersApi.progress(order.id, line.id, body),
    onSuccess: async () => {
      setAmount("");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
  const percent = progressPercent(line);
  const complete = Number(line.quantityPending) <= 0;
  const typed = amount.trim().replace(",", ".");
  const valid = /^\d{1,9}(\.\d{1,3})?$/.test(typed) && Number(typed) > 0;

  return (
    <li className={`order-line${complete ? " order-line--done" : ""}`}>
      <div className="order-line__head">
        <strong>{line.description}</strong>
        <span>{doneOfText(line)}</span>
      </div>
      <div
        className="order-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${line.description}: ${percent} % hecho`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className={`order-line__left${complete ? " is-done" : ""}`}>{remainingText(line)}</p>
      {!readOnly && compact && !expanded && !complete && (
        <button type="button" className="order-btn" onClick={() => setExpanded(true)}>
          Anotar avance
        </button>
      )}
      {!readOnly && expanded && (
        <div className="order-line__actions">
          {!complete && (
            <>
              <label className="order-line__input">
                <span className="sr-only">Cantidad hecha de {line.description}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={`Hechas hoy (${unitName(line.unit, "2")})`}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="order-btn order-btn--primary"
                disabled={!valid || progress.isPending}
                onClick={() => progress.mutate({ delta: typed })}
              >
                <Check aria-hidden="true" /> Apuntar
              </button>
              <button
                type="button"
                className="order-btn"
                disabled={progress.isPending}
                onClick={() => progress.mutate({ done: line.quantityOrdered })}
              >
                Todo hecho
              </button>
            </>
          )}
          {Number(line.quantityDone) > 0 && (
            <button
              type="button"
              className="order-btn order-btn--quiet"
              disabled={progress.isPending}
              onClick={() => progress.mutate({ done: "0" })}
              title="Volver a empezar esta línea"
            >
              Quitar avance
            </button>
          )}
        </div>
      )}
      {progress.isError && (
        <p className="action-feedback action-feedback--error" role="alert">
          {errorText(progress.error)}
        </p>
      )}
    </li>
  );
}

export function OrderCard({ order, compact = false }: { order: Order; compact?: boolean }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => ordersApi.cancel(order.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
  const open = order.status === "open";
  const overdue = open && isOverdue(order.dueDate, todayLocal());
  const pendingLines = order.lines.filter((line) => Number(line.quantityPending) > 0).length;

  return (
    <article className={`order-card${compact ? " order-card--compact" : ""}${overdue ? " order-card--overdue" : ""}`}>
      <header className="order-card__head">
        <div>
          <h3>
            <Store aria-hidden="true" /> {order.contactName}
          </h3>
          <p>
            {order.dueDate ? (
              <span className={overdue ? "is-overdue" : ""}>
                <CalendarClock aria-hidden="true" /> {overdue ? "Vencido · " : "Para el "}
                {formatShortDate(order.dueDate)}
              </span>
            ) : (
              <span>Sin fecha</span>
            )}
            {open && <span> · {pendingLines === 1 ? "1 línea pendiente" : `${pendingLines} líneas pendientes`}</span>}
            {order.status === "completed" && <span className="order-badge order-badge--done"> · Completado</span>}
            {order.status === "cancelled" && <span className="order-badge"> · Cancelado</span>}
          </p>
        </div>
      </header>
      {order.notes && !compact && <p className="order-card__notes">{order.notes}</p>}
      <ul className="order-lines">
        {order.lines.map((line) => (
          <LineProgress key={line.id} order={order} line={line} readOnly={!open} compact={compact} />
        ))}
      </ul>
      {open && !compact && (
        <footer className="order-card__foot">
          <button
            type="button"
            className="order-btn order-btn--quiet"
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm(`¿Cancelar el pedido de ${order.contactName}?`)) cancel.mutate();
            }}
          >
            <X aria-hidden="true" /> Cancelar pedido
          </button>
        </footer>
      )}
      {order.history && order.history.length > 0 && !compact && (
        <details className="order-history">
          <summary>Historial de avances</summary>
          <ul>
            {order.history.slice(0, 10).map((event, index) => (
              <li key={`${event.createdAt}-${index}`}>
                {event.createdByName}: {Number(event.delta) > 0 ? "+" : ""}
                {event.delta} {event.description}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
