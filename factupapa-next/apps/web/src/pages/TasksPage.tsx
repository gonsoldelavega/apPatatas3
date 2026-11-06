import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { tasksApi, type Side } from "../api/workspace";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { useCustomers, useSideNames } from "../workspace/hooks";
import { TaskRow } from "../workspace/TaskRow";

export function TasksPage() {
  const queryClient = useQueryClient();
  const customers = useCustomers();
  const sideNames = useSideNames();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [assignedSide, setAssignedSide] = useState<"" | Side>("");
  const [dueDate, setDueDate] = useState("");
  const [details, setDetails] = useState("");
  const tasks = useQuery({ queryKey: ["tasks", tab], queryFn: () => tasksApi.list(tab) });
  const create = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: title.trim(),
        contactId: contactId || null,
        assignedSide: assignedSide || null,
        dueDate: dueDate || null,
        details: details.trim() || null,
      }),
    onSuccess: async () => {
      setTitle("");
      setDetails("");
      setContactId("");
      setAssignedSide("");
      setDueDate("");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) create.mutate();
  };
  const items = tasks.data?.items ?? [];

  return (
    <div className="page workspace-page">
      <header className="page-heading">
        <div>
          <h1>Tareas</h1>
          <p className="form-hint">Lo que hay que hacer: llevar muestras, pasar a cobrar, recoger material…</p>
        </div>
      </header>

      <form className="detail-card workspace-form" onSubmit={submit}>
        <Field label="Nueva tarea" placeholder="Ej.: Llevar muestras al bar de la esquina" value={title} onChange={(event) => setTitle(event.target.value)} />
        <div className="workspace-form__row">
          <SelectField label="Cliente (opcional)" value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Ninguno</option>
            {(customers.data?.items ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.tradeName || customer.legalName}
              </option>
            ))}
          </SelectField>
          <SelectField label="Quién" value={assignedSide} onChange={(event) => setAssignedSide(event.target.value as "" | Side)}>
            <option value="">Cualquiera</option>
            <option value="side_a">{sideNames?.side_a ?? "Núcleo A"}</option>
            <option value="side_b">{sideNames?.side_b ?? "Núcleo B"}</option>
          </SelectField>
        </div>
        <Field label="Para cuándo (opcional)" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        <Field label="Detalles (opcional)" value={details} onChange={(event) => setDetails(event.target.value)} />
        <Button type="submit" icon={<Plus />} busy={create.isPending} disabled={!title.trim()}>
          Añadir tarea
        </Button>
        {create.isError && (
          <p className="action-feedback action-feedback--error" role="alert">
            No se pudo guardar la tarea.
          </p>
        )}
      </form>

      <div className="segmented" role="tablist" aria-label="Estado de las tareas">
        <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>
          Pendientes
        </button>
        <button type="button" role="tab" aria-selected={tab === "done"} className={tab === "done" ? "active" : ""} onClick={() => setTab("done")}>
          Hechas
        </button>
      </div>

      {tasks.isLoading ? (
        <p className="form-hint">Cargando tareas…</p>
      ) : items.length === 0 ? (
        <EmptyState title={tab === "open" ? "Nada pendiente" : "Todavía no hay tareas hechas"} description={tab === "open" ? "Añade una tarea arriba." : "Las tareas que marques como hechas aparecerán aquí."} />
      ) : (
        <ul className="task-list">
          {items.map((task) => (
            <TaskRow key={task.id} task={task} sideNames={sideNames} />
          ))}
        </ul>
      )}
    </div>
  );
}
