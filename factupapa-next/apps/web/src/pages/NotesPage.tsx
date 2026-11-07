import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff, Plus, Search, Store, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { notesApi, type Note } from "../api/workspace";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { useCustomers } from "../workspace/hooks";
import { formatShortDate } from "../workspace/helpers";
import { askConfirm } from "../ui/dialogs";

function NoteCard({ note }: { note: Note }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notes"] });
  const save = useMutation({
    mutationFn: () => notesApi.update(note.id, { title: title.trim(), body: body.trim() }),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const pin = useMutation({ mutationFn: () => notesApi.update(note.id, { pinned: !note.pinned }), onSuccess: refresh });
  const archive = useMutation({ mutationFn: () => notesApi.archive(note.id), onSuccess: refresh });

  return (
    <article className={`note-card${note.pinned ? " note-card--pinned" : ""}`}>
      <header>
        <div>
          <h3>{note.title}</h3>
          <p>
            {note.contactName && (
              <span>
                <Store aria-hidden="true" /> {note.contactName} ·{" "}
              </span>
            )}
            {note.updatedByName} · {formatShortDate(note.updatedAt)}
          </p>
        </div>
        <div className="note-card__tools">
          <button type="button" aria-label={note.pinned ? "Quitar de fijadas" : "Fijar arriba"} disabled={pin.isPending} onClick={() => pin.mutate()}>
            {note.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
          </button>
          <button
            type="button"
            aria-label={`Archivar nota: ${note.title}`}
            disabled={archive.isPending}
            onClick={async () => {
              if (await askConfirm(`¿Archivar la nota «${note.title}»?`)) archive.mutate();
            }}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </header>
      {editing ? (
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) save.mutate();
          }}
        >
          <Field label="Título" value={title} onChange={(event) => setTitle(event.target.value)} />
          <label className="field">
            <span className="field__label">Texto</span>
            <textarea className="note-textarea" rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <div className="workspace-form__actions">
            <Button type="submit" busy={save.isPending} disabled={!title.trim()}>
              Guardar
            </Button>
            <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          {note.body && <p className="note-card__body">{note.body}</p>}
          <button type="button" className="order-btn order-btn--quiet" onClick={() => setEditing(true)}>
            Editar
          </button>
        </>
      )}
    </article>
  );
}

export function NotesPage() {
  const queryClient = useQueryClient();
  const customers = useCustomers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contactId, setContactId] = useState("");
  const notes = useQuery({
    queryKey: ["notes", search.trim(), filter],
    queryFn: () => notesApi.list({ ...(search.trim() ? { search: search.trim() } : {}), ...(filter ? { contactId: filter } : {}) }),
  });
  const create = useMutation({
    mutationFn: () => notesApi.create({ title: title.trim(), body: body.trim(), contactId: contactId || null }),
    onSuccess: async () => {
      setTitle("");
      setBody("");
      setContactId("");
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) create.mutate();
  };
  const items = notes.data?.items ?? [];

  return (
    <div className="page workspace-page">
      <header className="page-heading page-heading--with-action">
        <div>
          <h1>Notas</h1>
          <p className="form-hint">Información común: qué ha dicho cada bar, cómo se llama el dueño, qué patata gasta…</p>
        </div>
        {!creating && (
          <button type="button" className="compact-action" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nueva
          </button>
        )}
      </header>

      {creating && (
        <form className="detail-card workspace-form" onSubmit={submit}>
          <Field label="Título" placeholder="Ej.: Qué quiere Bar Royal" value={title} onChange={(event) => setTitle(event.target.value)} />
          <SelectField label="Cliente (opcional)" value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Sin cliente</option>
            {(customers.data?.items ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.tradeName || customer.legalName}
              </option>
            ))}
          </SelectField>
          <label className="field">
            <span className="field__label">Texto</span>
            <textarea className="note-textarea" rows={5} placeholder="Dueño, tipo de patata, frecuencia, cómo paga…" value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <div className="workspace-form__actions">
            <Button type="submit" busy={create.isPending} disabled={!title.trim()}>
              Guardar nota
            </Button>
            <Button type="button" variant="quiet" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
          </div>
          {create.isError && (
            <p className="action-feedback action-feedback--error" role="alert">
              No se pudo guardar la nota.
            </p>
          )}
        </form>
      )}

      <div className="detail-card workspace-form workspace-filter">
        <Field label="Buscar en las notas" type="search" placeholder="Paco, agria, martes…" value={search} onChange={(event) => setSearch(event.target.value)} suffix={<Search aria-hidden="true" />} />
        <SelectField label="Cliente" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">Todos</option>
          {(customers.data?.items ?? []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.tradeName || customer.legalName}
            </option>
          ))}
        </SelectField>
      </div>

      {notes.isLoading ? (
        <p className="form-hint">Cargando notas…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No hay notas" description={search || filter ? "Ninguna nota coincide con la búsqueda." : "Apunta aquí lo que os cuenta cada bar para que lo veamos todos."} />
      ) : (
        <div className="note-list">
          {items.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
