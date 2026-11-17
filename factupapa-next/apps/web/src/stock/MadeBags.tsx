import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Refrigerator, Undo2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { fridgeLinesApi } from "../api/services";
import { Button } from "../ui/Button";
import { askConfirm } from "../ui/dialogs";
import { useCustomers } from "../workspace/hooks";
import { formatQuantity } from "../utils/format";
import { BAG_VARIETIES, DEFAULT_BAG_KG, lineKg, productForVariety } from "./made-bags-helpers";

interface Props {
  /** Variedades de patata (las que comparten stock). */
  items: Array<{ productId: string; name: string; unitsPerPackage?: string | null }>;
}

const OTHER = "__otro__";

/**
 * Bolsas hechas: se elige el tipo (bastón con/sin piel, brava, panadera, gajo…), cuántas bolsas y,
 * si se quiere, para qué cliente. Suma a la nevera; al entregarlas salen de la lista.
 */
export function MadeBags({ items }: Props) {
  const queryClient = useQueryClient();
  const customers = useCustomers();
  const lines = useQuery({ queryKey: ["fridge-lines"], queryFn: fridgeLinesApi.list });
  const [choice, setChoice] = useState<string>(BAG_VARIETIES[0]);
  const [custom, setCustom] = useState("");
  const [bags, setBags] = useState("");
  const [perBag, setPerBag] = useState("");
  const [contactId, setContactId] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const variety = choice === OTHER ? custom.trim() : choice;
  const product = productForVariety(variety, items);
  const defaultPerBag = Number(product?.unitsPerPackage ?? 0) > 0 ? String(Number(product!.unitsPerPackage)) : String(DEFAULT_BAG_KG);
  const effectivePerBag = perBag || defaultPerBag;
  const kg = lineKg(bags, effectivePerBag);
  const valid = Boolean(variety) && Boolean(product) && kg !== null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fridge-lines"] }),
      queryClient.invalidateQueries({ queryKey: ["potato-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["stock"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () =>
      fridgeLinesApi.create({
        variety,
        productId: product!.productId,
        quantity: String(kg),
        bags: bags.replace(",", "."),
        contactId: contactId || null,
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      setBags("");
      setNote("");
      setSaved(true);
      await refresh();
    },
  });
  const deliver = useMutation({ mutationFn: (id: string) => fridgeLinesApi.deliver(id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => fridgeLinesApi.remove(id), onSuccess: refresh });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    if (valid) create.mutate();
  };
  const all = lines.data?.items ?? [];
  const pending = all.filter((line) => !line.deliveredAt);
  const delivered = all.filter((line) => line.deliveredAt);
  const unit = (line: { bags: string | null; quantity: string }) =>
    line.bags ? `${formatQuantity(line.bags)} bolsas · ${formatQuantity(line.quantity)} kg` : `${formatQuantity(line.quantity)} kg`;

  return (
    <section className="made-bags" aria-labelledby="made-bags-title">
      <h3 id="made-bags-title">
        <Refrigerator aria-hidden="true" /> Bolsas hechas
      </h3>
      <form className="made-bags__form" onSubmit={submit}>
        <div className="made-bags__types" role="group" aria-label="Tipo de patata">
          {BAG_VARIETIES.map((name) => (
            <button type="button" key={name} aria-pressed={choice === name} onClick={() => setChoice(name)}>
              {name}
            </button>
          ))}
          <button type="button" aria-pressed={choice === OTHER} onClick={() => setChoice(OTHER)}>
            Otro
          </button>
        </div>
        {choice === OTHER && (
          <input aria-label="Tipo de patata" placeholder="Escribe el tipo" maxLength={60} value={custom} onChange={(event) => setCustom(event.target.value)} />
        )}
        <div className="made-bags__row">
          <label>
            <span>Bolsas</span>
            <input inputMode="decimal" placeholder="Nº" value={bags} onChange={(event) => setBags(event.target.value)} />
          </label>
          <label>
            <span>Kg por bolsa</span>
            <input inputMode="decimal" value={perBag || defaultPerBag} onChange={(event) => setPerBag(event.target.value)} />
          </label>
        </div>
        <label>
          <span>¿Para quién? (opcional)</span>
          <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Sin asignar</option>
            {customers.data?.items.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.legalName}
              </option>
            ))}
          </select>
        </label>
        <input aria-label="Nota" placeholder="Nota (opcional)" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
        <Button type="submit" busy={create.isPending} disabled={!valid}>
          {kg ? `Añadir a la nevera · ${formatQuantity(String(kg))} kg` : "Añadir a la nevera"}
        </Button>
      </form>
      {saved && !create.isError && (
        <p className="action-feedback" role="status">
          Añadido a la nevera
        </p>
      )}
      {(create.isError || deliver.isError || remove.isError) && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo guardar. Revisa los datos.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="made-bags__list" aria-label="Bolsas hechas pendientes de entregar">
          {pending.map((line) => (
            <li key={line.id}>
              <span>
                <strong>{line.variety}</strong>
                <small>
                  {unit(line)} · {line.contactName ?? "Sin cliente"}
                  {line.note ? ` · ${line.note}` : ""}
                </small>
              </span>
              <button type="button" className="compact-action" onClick={() => deliver.mutate(line.id)} disabled={deliver.isPending}>
                <Check aria-hidden="true" /> Entregada
              </button>
              <button
                type="button"
                className="made-bags__undo"
                aria-label={`Deshacer ${line.variety}`}
                onClick={async () => {
                  if (await askConfirm("¿Deshacer estas bolsas? Se restan de la nevera.", { confirmLabel: "Deshacer", danger: true })) remove.mutate(line.id);
                }}
              >
                <Undo2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {delivered.length > 0 && (
        <details className="made-bags__done">
          <summary>Entregadas esta semana ({delivered.length})</summary>
          <ul className="made-bags__list">
            {delivered.map((line) => (
              <li key={line.id}>
                <span>
                  <strong>{line.variety}</strong>
                  <small>
                    {unit(line)} · {line.contactName ?? "Sin cliente"}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
