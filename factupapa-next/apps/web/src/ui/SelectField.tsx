import { forwardRef, useId, type SelectHTMLAttributes } from "react";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField({ label, error, id, children, ...props }, ref) {
    const generatedId = useId();
    const selectId = id ?? props.name ?? generatedId;
    const errorId = error ? `${selectId}-error` : undefined;
    return (
      <label className="field" htmlFor={selectId}>
        <span className="field__label">{label}</span>
        <span className="field__control">
          <select
            ref={ref}
            id={selectId}
            aria-label={props["aria-label"] ?? label}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            {...props}
          >
            {children}
          </select>
        </span>
        {error && (
          <span id={errorId} className="field__error" role="alert">
            {error}
          </span>
        )}
      </label>
    );
  },
);
