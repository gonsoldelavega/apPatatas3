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

const RAPID_TAP_LOCK_MS = 700;

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
  const unlockTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!busy) clickLocked.current = false;
  }, [busy]);

  useEffect(
    () => () => {
      if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current);
    },
    [],
  );

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy || disabled || clickLocked.current) {
      event.preventDefault();
      return;
    }

    clickLocked.current = true;
    onClick?.(event);

    if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => {
      if (!busy) clickLocked.current = false;
      unlockTimer.current = null;
    }, RAPID_TAP_LOCK_MS);
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
