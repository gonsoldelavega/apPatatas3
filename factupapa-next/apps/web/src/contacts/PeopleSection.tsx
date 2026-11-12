import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { contactPeopleApi, type ContactPerson } from "../api/services";
import { Button } from "../ui/Button";
import { askConfirm } from "../ui/dialogs";
import { telUrl, whatsappUrl } from "../utils/phone";

const ROLE_SUGGESTIONS = ["Dueño", "Encargado", "Cocina", "Compras", "Administración"];

interface Draft {
  name: string;
  role: string;
  phone: string;
}
const empty: Draft = { name: "", role: "", phone: "" };

/** Personas de contacto: nombre, cargo y móvil, con acceso directo a WhatsApp y llamada. */
export function PeopleSection({ contactId }: { contactId: string }) {
  const queryClient = useQueryClient();
  const people = useQuery({ queryKey: ["contact-people", contactId], queryFn: () => contactPeopleApi.list(contactId) });
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["contact-people", contactId] });
  const save = useMutation({
    mutationFn: () => {
      const input = { name: draft.name.trim(), role: draft.role.trim() || null, phone: draft.phone.trim() || null };
      return editingId && editingId !== "new"
        ? contactPeopleApi.update(contactId, editingId, input)
        : contactPeopleApi.create(contactId, input);
    },
    onSuccess: async () => {
      setEditingId(null);
      setDraft(empty);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (personId: string) => contactPeopleApi.remove(contactId, personId),
    onSuccess: refresh,
  });

  const startEdit = (person: ContactPerson) => {
    setDraft({ name: person.name, role: person.role ?? "", phone: person.phone ?? "" });
    setEditingId(person.id);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.name.trim()) save.mutate();
  };
  const items = people.data?.items ?? [];

  return (
    <section className="detail-card people-section" aria-labelledby="people-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Teléfonos</p>
          <h2 id="people-title">Personas de contacto</h2>
        </div>
        {editingId === null && (
          <button
            type="button"
            className="compact-action"
            onClick={() => {
              setDraft(empty);
              setEditingId("new");
            }}
          >
            <Plus aria-hidden="true" /> Añadir
          </button>
        )}
      </div>

      {people.isLoading ? (
        <p className="form-hint">Cargando…</p>
      ) : people.isError ? (
        <p className="form-hint">No se pudieron cargar las personas de contacto.</p>
      ) : (
        items.length === 0 && editingId === null && (
          <p className="form-hint">Apunta aquí el nombre y el móvil del encargado, del dueño, etc.</p>
        )
      )}

      <ul className="people-list">
        {items.map((person) => {
          const wa = whatsappUrl(person.phone);
          const tel = telUrl(person.phone);
          return (
            <li key={person.id} className="people-list__item">
              <span className="people-list__who">
                <UserRound aria-hidden="true" />
                <span>
                  <strong>{person.name}</strong>
                  <small>
                    {[person.role, person.phone].filter(Boolean).join(" · ") || "Sin teléfono"}
                  </small>
                </span>
              </span>
              <span className="people-list__actions">
                {wa && (
                  <a className="people-list__link people-list__link--wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${person.name}`}>
                    <MessageCircle aria-hidden="true" /> WhatsApp
                  </a>
                )}
                {tel && (
                  <a className="people-list__link" href={tel} aria-label={`Llamar a ${person.name}`}>
                    <Phone aria-hidden="true" /> Llamar
                  </a>
                )}
                <button type="button" className="people-list__link" onClick={() => startEdit(person)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="people-list__link"
                  aria-label={`Borrar a ${person.name}`}
                  onClick={async () => {
                    if (await askConfirm(`¿Borrar a ${person.name} de los contactos?`, { danger: true })) remove.mutate(person.id);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {editingId !== null && (
        <form className="people-form" onSubmit={submit}>
          <label>
            <span>Nombre</span>
            <input value={draft.name} maxLength={120} autoComplete="off" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            <span>Cargo (encargado, dueño…)</span>
            <input list="people-roles" value={draft.role} maxLength={60} autoComplete="off" onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
            <datalist id="people-roles">
              {ROLE_SUGGESTIONS.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Móvil</span>
            <input type="tel" inputMode="tel" value={draft.phone} maxLength={30} autoComplete="off" placeholder="600 11 22 33" onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          </label>
          <div className="people-form__actions">
            <Button type="submit" busy={save.isPending} disabled={!draft.name.trim()}>
              Guardar
            </Button>
            <button type="button" className="people-list__link" onClick={() => setEditingId(null)}>
              Cancelar
            </button>
          </div>
          {save.isError && (
            <p className="action-feedback action-feedback--error" role="alert">
              No se pudo guardar. Revisa el nombre y el teléfono.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
