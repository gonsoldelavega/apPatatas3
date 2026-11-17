import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Refrigerator, Trash2, Undo2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { fridgeLinesApi, type FridgeLine } from "../api/services";
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

function useFridgeLines() {
  const queryClient = useQueryClient();
  const lines = useQuery({ queryKey: ["fridge-lines"], queryFn: fridgeLinesApi.list });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fridge-lines"] }),
      queryClient.invalidateQueries({ queryKey: ["potato-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["stock"] }),
    ]);
  };
  return { lines: lines.data?.items ?? [], refresh };
}

const amount = (line: Pick<FridgeLine, "bags" | "quantity">) =>
  line.bags ? `${formatQuantity(line.bags)} bolsas · ${formatQuantity(line.quantity)} kg` : `${formatQuantity(line.quantity)} kg`;

/**
 * Pizarra de lo que hay que preparar y para quién: se apunta el tipo (bastón con/sin piel, brava,
 * panadera, gajo…), las bolsas y el cliente. Al prepararlo se marca «Hecha» y pasa a la nevera.
 */
export function Pizarra({ items }: Props) {
  const customers = useCustomers();
  const { lines, refresh } = useFridgeLines();
  const [choice, setChoice] = useState<string>(BAG_VARIETIES[0]);
  const [custom, setCustom] = useState("");
  const [bags, setBags] = useState("");
  const [perBag, setPerBag] = useState("");
  const [contactId, setContactId] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const variety = choice === OTHER ? custom.trim() : choice;
  const product = productForVariety(variety, items);
  const defaultPerBag = Number(product?.unitsPerPackage ?? 0) > 0 ? String(Number(product!.unitsPerPackage)) : String(DEFAULT_BAG_KG);
  const kg = lineKg(bags, perBag || defaultPerBag);
  const valid = Boolean(variety) && Boolean(product) && kg !== null;

  const create = useMutation({
    mutationFn: (toPrepare: boolean) =>
      fridgeLinesApi.create({
        variety,
        productId: product!.productId,
        quantity: String(kg),
        bags: bags.replace(",", "."),
        contactId: contactId || null,
        note: note.trim() || null,
        toPrepare,
      }),
    onSuccess: async (_line, toPrepare) => {
      setBags("");
      setNote("");
      setSaved(toPrepare ? "Apuntado en la pizarra" : "Añadido a la nevera");
      await refresh();
    },
  });
  const made = useMutation({ mutationFn: (id: string) => fridgeLinesApi.made(id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => fridgeLinesApi.remove(id), onSuccess: refresh });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(null);
    if (valid) create.mutate(true);
  };
  const toPrepare = lines.filter((line) => !line.madeAt);

  return (
    <section className="dashboard-section workspace-block made-bags" aria-labelledby="pizarra-title">
      <div className="dashboard-section__heading">
        <h2 id="pizarra-title">
          <ClipboardList aria-hidden="true" /> Pizarra: por preparar
        </h2>
      </div>
      {toPrepare.length > 0 ? (
        <ul className="made-bags__list" aria-label="Lo que hay que preparar">
          {toPrepare.map((line) => (
            <li key={line.id}>
              <span>
                <strong>
                  {amount(line)} · {line.variety}
                </strong>
                <small>
                  Para: {line.contactName ?? "sin cliente"}
                  {line.note ? ` · ${line.note}` : ""}
                </small>
              </span>
              <button type="button" className="compact-action" onClick={() => made.mutate(line.id)} disabled={made.isPending}>
                <Check aria-hidden="true" /> Hecha
              </button>
              <button
                type="button"
                className="made-bags__undo"
                aria-label={`Quitar ${line.variety} de la pizarra`}
                onClick={async () => {
                  if (await askConfirm("¿Quitar esto de la pizarra?", { confirmLabel: "Quitar", danger: true })) remove.mutate(line.id);
                }}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="form-hint">No hay nada pendiente de preparar.</p>
      )}

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
          Apuntar para preparar
        </Button>
        <button
          type="button"
          className="made-bags__secondary"
          disabled={!valid || create.isPending}
          onClick={() => {
            setSaved(null);
            create.mutate(false);
          }}
        >
          Ya está hecha: a la nevera{kg ? ` · ${formatQuantity(String(kg))} kg` : ""}
        </button>
      </form>
      {saved && !create.isError && (
        <p className="action-feedback" role="status">
          {saved}
        </p>
      )}
      {(create.isError || made.isError || remove.isError) && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo guardar. Revisa los datos.
        </p>
      )}
    </section>
  );
}

/** Lo que ya está hecho en la nevera y espera entrega, con su tipo y su cliente. */
export function FridgeLinesList() {
  const { lines, refresh } = useFridgeLines();
  const deliver = useMutation({ mutationFn: (id: string) => fridgeLinesApi.deliver(id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => fridgeLinesApi.remove(id), onSuccess: refresh });
  const waiting = lines.filter((line) => line.madeAt && !line.deliveredAt);
  const delivered = lines.filter((line) => line.deliveredAt);
  if (!waiting.length && !delivered.length) return null;
  return (
    <div className="made-bags">
      <h3>
        <Refrigerator aria-hidden="true" /> En la nevera, para entregar
      </h3>
      {waiting.length > 0 ? (
        <ul className="made-bags__list" aria-label="Hecho y pendiente de entregar">
          {waiting.map((line) => (
            <li key={line.id}>
              <span>
                <strong>
                  {amount(line)} · {line.variety}
                </strong>
                <small>
                  Para: {line.contactName ?? "sin cliente"}
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
      ) : (
        <p className="form-hint">Nada hecho pendiente de entregar.</p>
      )}
      {delivered.length > 0 && (
        <details className="made-bags__done">
          <summary>Entregadas esta semana ({delivered.length})</summary>
          <ul className="made-bags__list">
            {delivered.map((line) => (
              <li key={line.id}>
                <span>
                  <strong>
                    {amount(line)} · {line.variety}
                  </strong>
                  <small>Para: {line.contactName ?? "sin cliente"}</small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(deliver.isError || remove.isError) && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo guardar.
        </p>
      )}
    </div>
  );
}
