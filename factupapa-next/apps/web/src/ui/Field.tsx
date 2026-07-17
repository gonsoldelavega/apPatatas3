import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  suffix?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, suffix, id, className = "", ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <label className={`field ${className}`} htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <span className="field__control">
        <input
          ref={ref}
          id={inputId}
          aria-label={props["aria-label"] ?? label}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          {...props}
        />
        {suffix}
      </span>
      {error && (
        <span id={errorId} className="field__error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
});
