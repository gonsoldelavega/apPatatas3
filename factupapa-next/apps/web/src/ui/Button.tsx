import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: ReactNode;
  busy?: boolean;
}

export function Button({
  variant = "primary",
  icon,
  busy = false,
  children,
  disabled,
  className = "",
  onClick,
  ...props
}: ButtonProps) {
  const clickLocked = useRef(false);

  useEffect(() => {
    if (!busy) clickLocked.current = false;
  }, [busy]);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy || disabled || clickLocked.current) {
      event.preventDefault();
      return;
    }

    clickLocked.current = true;
    onClick?.(event);

    // Las acciones síncronas pueden volver a usarse en el siguiente ciclo.
    // Las mutaciones mantienen el bloqueo mediante la propiedad `busy`.
    queueMicrotask(() => {
      if (!busy) clickLocked.current = false;
    });
  };

  return (
    <button
      className={`button button--${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...props}
    >
      {busy ? <span className="spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}
