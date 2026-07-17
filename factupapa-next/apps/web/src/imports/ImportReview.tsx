import { AlertTriangle, XCircle } from "lucide-react";
import type { ImportPreview, ImportStrategy } from "../api/types";
import { Button } from "../ui/Button";
import { SelectField } from "../ui/SelectField";
import { formatMoney, formatTaxRate } from "../utils/format";

const labels = {
  contacts: "Contactos",
  products: "Productos",
  contact_product_prices: "Precios por cliente",
};
const fieldLabels: Record<string, string> = {
  legalName: "Nombre fiscal",
  tradeName: "Nombre comercial",
  taxId: "NIF",
  email: "Email",
  phone: "Teléfono",
  name: "Producto",
  sku: "SKU",
  unit: "Unidad",
  salePrice: "Precio",
  estimatedCost: "Coste",
  taxRate: "IVA",
  price: "Precio específico",
};
function visibleValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (
    typeof value === "string" &&
    ["salePrice", "estimatedCost", "price"].includes(key)
  )
    return formatMoney(value);
  if (typeof value === "string" && key === "taxRate")
    return formatTaxRate(value);
  return typeof value === "object"
    ? (JSON.stringify(value) ?? "—")
    : String(value);
}

export function ImportReview({
  preview,
  strategy,
  setStrategy,
  confirm,
  cancel,
  busy,
  error,
}: {
  preview: ImportPreview;
  strategy: ImportStrategy | "";
  setStrategy(value: ImportStrategy): void;
  confirm(): void;
  cancel(): void;
  busy: boolean;
  error: boolean;
}) {
  const conflicts = Number(
    preview.validationSummary.conflicts ??
      preview.rows.filter((row) => row.classification === "conflict").length,
  );
  const warnings = preview.rows.reduce(
    (total, row) => total + row.warnings.length,
    0,
  );
  return (
    <section className="review-card">
      <header>
        <p className="eyebrow">Paso 3 · Revisar errores</p>
        <h2>{labels[preview.entityType]}</h2>
        <p>
          {preview.totalRows} filas revisadas. Comprueba cada aviso antes de
          continuar.
        </p>
      </header>
      <div className="review-summary">
        <div className="summary--valid">
          <strong>{preview.validRows}</strong>
          <span>Válidas</span>
        </div>
        <div className="summary--invalid">
          <strong>{preview.invalidRows}</strong>
          <span>Inválidas</span>
        </div>
        <div>
          <strong>{preview.duplicateRows}</strong>
          <span>Duplicadas</span>
        </div>
        <div>
          <strong>{conflicts}</strong>
          <span>Conflictos</span>
        </div>
        <div>
          <strong>{warnings}</strong>
          <span>Avisos</span>
        </div>
      </div>
      <div className="row-preview" aria-label="Filas previsualizadas">
        {preview.rows.map((row) => (
          <article key={row.rowNumber}>
            <header>
              <strong>Fila {row.rowNumber}</strong>
              <span>{row.classification}</span>
            </header>
            <dl>
              {Object.entries(row.normalizedData)
                .filter(([key]) => key !== "existingId")
                .slice(0, 8)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{fieldLabels[key] ?? key}</dt>
                    <dd>{visibleValue(key, value)}</dd>
                  </div>
                ))}
            </dl>
            {row.errors.map((message) => (
              <p className="row-error" key={message}>
                <XCircle />
                {message}
              </p>
            ))}
            {row.warnings.map((message) => (
              <p className="row-warning" key={message}>
                <AlertTriangle />
                {message}
              </p>
            ))}
          </article>
        ))}
      </div>
      <p className="eyebrow">Paso 4 · Seleccionar estrategia</p>
      <SelectField
        label="Estrategia de conflictos"
        value={strategy}
        onChange={(event) => setStrategy(event.target.value as ImportStrategy)}
      >
        <option value="">Selecciona una estrategia</option>
        <option value="skip_existing">Omitir existentes</option>
        <option value="update_existing">Actualizar existentes</option>
        <option value="fail_on_conflict">Detener ante conflicto</option>
      </SelectField>
      <p className="eyebrow confirm-label">Paso 5 · Confirmar</p>
      <p className="hint">La importación nunca se confirma automáticamente.</p>
      {error && (
        <div className="form-alert" role="alert">
          No se ha podido confirmar. Comprueba la red, los conflictos o el
          estado del lote.
        </div>
      )}
      <div className="review-actions">
        <Button variant="secondary" busy={busy} onClick={cancel}>
          Cancelar lote
        </Button>
        <Button
          busy={busy}
          disabled={!strategy || preview.invalidRows > 0}
          onClick={confirm}
        >
          Confirmar importación
        </Button>
      </div>
    </section>
  );
}
