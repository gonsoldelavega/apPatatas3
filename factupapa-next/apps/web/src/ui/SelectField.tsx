import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField({ label, error, id, children, ...props }, ref) {
    const selectId = id ?? props.name;
    return (
      <label className="field" htmlFor={selectId}>
        <span className="field__label">{label}</span>
        <span className="field__control">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={Boolean(error)}
            {...props}
          >
            {children}
          </select>
        </span>
        {error && (
          <span className="field__error" role="alert">
            {error}
          </span>
        )}
      </label>
    );
  },
);
