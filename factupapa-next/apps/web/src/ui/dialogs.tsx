import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Diálogos propios de la app (en lugar de window.confirm / prompt / alert, que el navegador
 * rotula con la dirección técnica del sitio). Se usan con `await` desde cualquier sitio:
 *   if (await askConfirm("¿Borrar?")) borrar();
 */

type Request =
  | { kind: "confirm"; message: string; confirmLabel: string; danger: boolean; resolve(value: boolean): void }
  | { kind: "text"; message: string; initial: string; resolve(value: string | null): void }
  | { kind: "notice"; message: string; resolve(): void }
  | { kind: "choice"; message: string; options: Array<{ value: string; label: string }>; resolve(value: string | null): void };

let current: Request | null = null;
const queue: Request[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function enqueue(request: Request): void {
  if (current) queue.push(request);
  else current = request;
  notify();
}

function finish(): void {
  current = queue.shift() ?? null;
  notify();
}

export function askConfirm(message: string, options: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) =>
    enqueue({
      kind: "confirm",
      message,
      confirmLabel: options.confirmLabel ?? "Aceptar",
      danger: options.danger ?? false,
      resolve,
    }),
  );
}

export function askText(message: string, initial = ""): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: "text", message, initial, resolve }));
}

/** Elegir una opción de una lista (p. ej. a qué teléfono escribir). null si se cancela. */
export function askChoice(message: string, options: Array<{ value: string; label: string }>): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: "choice", message, options, resolve }));
}

export function showNotice(message: string): Promise<void> {
  return new Promise((resolve) => enqueue({ kind: "notice", message, resolve }));
}

/** Se monta una sola vez en la raíz de la app. */
export function DialogHost() {
  const [, rerender] = useState(0);
  const [text, setText] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const request = current;
  useEffect(() => {
    if (!request) return;
    if (request.kind === "text") {
      setText(request.initial);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      window.setTimeout(() => confirmRef.current?.focus(), 0);
    }
  }, [request]);

  if (!request) return null;

  const cancel = () => {
    if (request.kind === "confirm") request.resolve(false);
    else if (request.kind === "text" || request.kind === "choice") request.resolve(null);
    else request.resolve();
    finish();
  };
  const accept = () => {
    if (request.kind === "confirm") request.resolve(true);
    else if (request.kind === "text") request.resolve(text);
    else if (request.kind === "choice") request.resolve(null);
    else request.resolve();
    finish();
  };
  const choose = (value: string) => {
    if (request.kind === "choice") request.resolve(value);
    finish();
  };

  return createPortal(
    <div
      className="app-dialog-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") cancel();
      }}
    >
      <div className="app-dialog" role="alertdialog" aria-modal="true" aria-label={request.message}>
        <p className="app-dialog__message">{request.message}</p>
        {request.kind === "text" && (
          <input
            ref={inputRef}
            className="app-dialog__input"
            value={text}
            maxLength={80}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") accept();
            }}
          />
        )}
        {request.kind === "choice" && (
          <div className="app-dialog__choices">
            {request.options.map((option) => (
              <button key={option.value} type="button" className="app-dialog__button" onClick={() => choose(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        )}
        <div className="app-dialog__actions">
          {request.kind !== "notice" && (
            <button type="button" className="app-dialog__button" onClick={cancel}>
              Cancelar
            </button>
          )}
          {request.kind !== "choice" && (
          <button
            ref={confirmRef}
            type="button"
            className={`app-dialog__button app-dialog__button--primary${
              request.kind === "confirm" && request.danger ? " app-dialog__button--danger" : ""
            }`}
            onClick={accept}
          >
            {request.kind === "confirm" ? request.confirmLabel : request.kind === "notice" ? "Entendido" : "Guardar"}
          </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
