import { apiClient } from "./client";

export type Side = "side_a" | "side_b";
export type OrderUnit = "kg" | "bolsa" | "unidad";

export interface OrderLine {
  id: string;
  productId: string | null;
  description: string;
  unit: OrderUnit;
  quantityOrdered: string;
  quantityDone: string;
  quantityPending: string;
}

export interface OrderProgressEvent {
  lineId: string;
  description: string;
  unit: OrderUnit;
  delta: string;
  doneAfter: string;
  createdByName: string;
  createdAt: string;
}

export interface Order {
  id: string;
  contactId: string;
  contactName: string;
  dueDate: string | null;
  notes: string | null;
  status: "open" | "completed" | "cancelled";
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
  lines: OrderLine[];
  history?: OrderProgressEvent[];
}

export interface OrderInput {
  contactId: string;
  dueDate?: string | null;
  notes?: string | null;
  lines: Array<{ productId?: string | null; description?: string; unit: OrderUnit; quantity: string }>;
}

export interface Task {
  id: string;
  title: string;
  details: string | null;
  contactId: string | null;
  contactName: string | null;
  assignedSide: Side | null;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
  doneByName: string | null;
  createdByName: string;
  createdAt: string;
}

export interface TaskInput {
  title: string;
  details?: string | null;
  contactId?: string | null;
  assignedSide?: Side | null;
  dueDate?: string | null;
}

export interface Note {
  id: string;
  contactId: string | null;
  contactName: string | null;
  title: string;
  body: string;
  pinned: boolean;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  body?: string | null;
  contactId?: string | null;
  pinned?: boolean;
}

export type LedgerKind = "expense" | "income" | "settlement";

export interface LedgerEntry {
  id: string;
  entryDate: string;
  kind: LedgerKind;
  side: Side;
  amount: string;
  concept: string;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  canEdit: boolean;
}

export interface LedgerSummary {
  sideNames: Record<Side, string>;
  balance: {
    debtorSide: Side | null;
    creditorSide: Side | null;
    debtorName: string | null;
    creditorName: string | null;
    amount: string;
  };
  totals: Record<Side, { expenses: string; income: string; settlements: string }>;
  result: { expenses: string; income: string; net: string };
}

const json = (body: unknown) => JSON.stringify(body);
const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const ordersApi = {
  list: (status: "open" | "completed" | "cancelled" | "all" = "open") =>
    apiClient.request<{ items: Order[] }>(`/orders${query({ status })}`),
  create: (input: OrderInput) => apiClient.request<Order>("/orders", { method: "POST", body: json(input) }),
  progress: (orderId: string, lineId: string, body: { delta: string } | { done: string }) =>
    apiClient.request<Order>(`/orders/${orderId}/lines/${lineId}/progress`, { method: "POST", body: json(body) }),
  cancel: (orderId: string) => apiClient.request<Order>(`/orders/${orderId}/cancel`, { method: "POST", body: "{}" }),
};

export const tasksApi = {
  list: (status: "open" | "done" | "all" = "open") => apiClient.request<{ items: Task[] }>(`/tasks${query({ status })}`),
  create: (input: TaskInput) => apiClient.request<Task>("/tasks", { method: "POST", body: json(input) }),
  setDone: (id: string, done: boolean) =>
    apiClient.request<Task>(`/tasks/${id}/${done ? "done" : "reopen"}`, { method: "POST", body: "{}" }),
  remove: (id: string) => apiClient.request<void>(`/tasks/${id}`, { method: "DELETE" }),
};

export const notesApi = {
  list: (params: { search?: string; contactId?: string } = {}) =>
    apiClient.request<{ items: Note[] }>(`/notes${query(params)}`),
  create: (input: NoteInput) => apiClient.request<Note>("/notes", { method: "POST", body: json(input) }),
  update: (id: string, input: Partial<NoteInput>) =>
    apiClient.request<Note>(`/notes/${id}`, { method: "PATCH", body: json(input) }),
  archive: (id: string) => apiClient.request<void>(`/notes/${id}`, { method: "DELETE" }),
};

export const ledgerApi = {
  summary: (period: { from?: string; to?: string } = {}) =>
    apiClient.request<LedgerSummary>(`/ledger/summary${query(period)}`),
  entries: (period: { from?: string; to?: string } = {}) =>
    apiClient.request<{ items: LedgerEntry[] }>(`/ledger/entries${query(period)}`),
  create: (input: {
    kind: LedgerKind;
    side: Side;
    amount: string;
    concept: string;
    entryDate?: string;
    notes?: string | null;
  }) => apiClient.request<LedgerEntry>("/ledger/entries", { method: "POST", body: json(input) }),
  remove: (id: string) => apiClient.request<void>(`/ledger/entries/${id}`, { method: "DELETE" }),
  settle: () => apiClient.request<LedgerEntry>("/ledger/settle", { method: "POST", body: "{}" }),
  saveNames: (input: { sideAName: string; sideBName: string }) =>
    apiClient.request<{ sideAName: string; sideBName: string }>("/ledger/settings", { method: "PUT", body: json(input) }),
};
