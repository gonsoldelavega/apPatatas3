import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { productsApi } from "../api/services";
import { ordersApi, type OrderUnit } from "../api/workspace";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { useCustomers } from "./hooks";

interface DraftLine {
  key: number;
  productId: string;
  description: string;
  unit: OrderUnit;
  quantity: string;
}

const newLine = (key: number): DraftLine => ({ key, productId: "", description: "", unit: "bolsa", quantity: "" });

/** Formulario para apuntar un pedido. Se usa en Pedidos y en la pantalla de inicio. */
export function NewOrderForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const customers = useCustomers();
  const products = useQuery({
    queryKey: ["workspace-products"],
    queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
    staleTime: 60_000,
  });
  const [contactId, setContactId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine(1)]);
  const create = useMutation({
    mutationFn: () =>
      ordersApi.create({
        contactId,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          ...(line.productId ? { productId: line.productId } : {}),
          ...(line.description.trim() ? { description: line.description.trim() } : {}),
          unit: line.unit,
          quantity: line.quantity.trim().replace(",", "."),
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      onDone();
    },
  });

  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const lineReady = (line: DraftLine) =>
    (line.productId || line.description.trim()) && /^\d{1,9}([.,]\d{1,3})?$/.test(line.quantity.trim()) && Number(line.quantity.replace(",", ".")) > 0;
  const ready = Boolean(contactId) && lines.every(lineReady);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) create.mutate();
  };

  return (
    <form className="detail-card workspace-form" onSubmit={submit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Nuevo pedido</p>
          <h2>¿Qué ha pedido el cliente?</h2>
        </div>
      </div>
      <SelectField label="Cliente" value={contactId} onChange={(event) => setContactId(event.target.value)} required>
        <option value="">Elige un cliente…</option>
        {(customers.data?.items ?? []).map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.tradeName || customer.legalName}
          </option>
        ))}
      </SelectField>
      <Field label="Para cuándo (opcional)" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />

      <div className="draft-lines">
        {lines.map((line, index) => (
          <fieldset key={line.key} className="draft-line">
            <legend>Línea {index + 1}</legend>
            <SelectField
              label="Producto"
              value={line.productId}
              onChange={(event) => {
                const product = products.data?.items.find((item) => item.id === event.target.value);
                update(line.key, {
                  productId: event.target.value,
                  ...(product && product.unit === "kg" ? { unit: "kg" as OrderUnit } : {}),
                });
              }}
            >
              <option value="">Otro (escribir abajo)</option>
              {(products.data?.items ?? []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </SelectField>
            {!line.productId && (
              <Field
                label="Descripción"
                placeholder="Ej.: Patata pelada 2,5 kg"
                value={line.description}
                onChange={(event) => update(line.key, { description: event.target.value })}
              />
            )}
            <div className="draft-line__row">
              <Field
                label="Cantidad"
                inputMode="decimal"
                placeholder="125"
                value={line.quantity}
                onChange={(event) => update(line.key, { quantity: event.target.value })}
              />
              <SelectField label="Unidad" value={line.unit} onChange={(event) => update(line.key, { unit: event.target.value as OrderUnit })}>
                <option value="kg">kg</option>
                <option value="bolsa">bolsas</option>
                <option value="unidad">unidades</option>
              </SelectField>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="draft-line__remove"
                  aria-label={`Quitar línea ${index + 1}`}
                  onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              )}
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          className="order-btn"
          onClick={() => setLines((current) => [...current, newLine(Math.max(...current.map((item) => item.key)) + 1)])}
        >
          <Plus aria-hidden="true" /> Añadir otra línea
        </button>
      </div>

      <Field label="Notas del pedido (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      {create.isError && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo crear el pedido. Revisa los datos e inténtalo de nuevo.
        </p>
      )}
      <div className="workspace-form__actions">
        <Button type="submit" busy={create.isPending} disabled={!ready}>
          Guardar pedido
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
