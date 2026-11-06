import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Store, Trash2, Users } from "lucide-react";
import { tasksApi, type Side, type Task } from "../api/workspace";
import { todayLocal } from "../utils/format";
import { formatShortDate, isOverdue, sideLabel } from "./helpers";

export function TaskRow({
  task,
  sideNames,
  allowDelete = true,
}: {
  task: Task;
  sideNames: Record<Side, string> | undefined;
  allowDelete?: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const toggle = useMutation({ mutationFn: () => tasksApi.setDone(task.id, !task.done), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => tasksApi.remove(task.id), onSuccess: refresh });
  const overdue = !task.done && isOverdue(task.dueDate, todayLocal());

  return (
    <li className={`task-row${task.done ? " task-row--done" : ""}${overdue ? " task-row--overdue" : ""}`}>
      <button
        type="button"
        className="task-check"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Reabrir: ${task.title}` : `Marcar como hecha: ${task.title}`}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {task.done && <Check aria-hidden="true" />}
      </button>
      <div className="task-row__body">
        <strong>{task.title}</strong>
        <small>
          {task.contactName && (
            <span>
              <Store aria-hidden="true" /> {task.contactName}
            </span>
          )}
          {task.dueDate && (
            <span className={overdue ? "is-overdue" : ""}>
              <CalendarClock aria-hidden="true" /> {formatShortDate(task.dueDate)}
            </span>
          )}
          {task.assignedSide && (
            <span>
              <Users aria-hidden="true" /> {sideLabel(task.assignedSide, sideNames)}
            </span>
          )}
          {task.done && task.doneByName && <span>Hecha por {task.doneByName}</span>}
        </small>
        {task.details && <p>{task.details}</p>}
      </div>
      {allowDelete && (
        <button
          type="button"
          className="task-delete"
          aria-label={`Borrar tarea: ${task.title}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`¿Borrar la tarea «${task.title}»?`)) remove.mutate();
          }}
        >
          <Trash2 aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
