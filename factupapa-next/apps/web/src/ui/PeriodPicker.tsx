import { Field } from "./Field";
import { SelectField } from "./SelectField";
import type { Period, PeriodKind } from "../utils/period";

interface PeriodPickerProps {
  value: Period;
  onChange: (period: Period) => void;
  allowAll?: boolean;
}

export function PeriodPicker({ value, onChange, allowAll }: PeriodPickerProps) {
  return (
    <>
      <SelectField
        label="Periodo"
        value={value.kind}
        onChange={(e) => onChange({ ...value, kind: e.target.value as PeriodKind })}
      >
        {allowAll && <option value="all">Todo</option>}
        <option value="month">Mes</option>
        <option value="quarter">Trimestre</option>
        <option value="year">Año</option>
      </SelectField>
      {value.kind === "month" && (
        <Field
          label="Mes"
          type="month"
          value={value.month}
          onChange={(e) => onChange({ ...value, month: e.target.value })}
        />
      )}
      {value.kind === "quarter" && (
        <>
          <SelectField
            label="Trimestre"
            value={value.quarter}
            onChange={(e) => onChange({ ...value, quarter: e.target.value })}
          >
            <option value="1">1º (ene–mar)</option>
            <option value="2">2º (abr–jun)</option>
            <option value="3">3º (jul–sep)</option>
            <option value="4">4º (oct–dic)</option>
          </SelectField>
          <Field
            label="Año"
            type="number"
            inputMode="numeric"
            min="2020"
            max="2100"
            value={value.year}
            onChange={(e) => onChange({ ...value, year: e.target.value })}
          />
        </>
      )}
      {value.kind === "year" && (
        <Field
          label="Año"
          type="number"
          inputMode="numeric"
          min="2020"
          max="2100"
          value={value.year}
          onChange={(e) => onChange({ ...value, year: e.target.value })}
        />
      )}
    </>
  );
}
