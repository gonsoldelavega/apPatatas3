import { formatDocumentNumber, formatMoney } from "./format";

const toDisplayDate = (iso: string) => iso.split("-").reverse().join("/");

export interface ReminderInput {
  /** Nombre de la persona a quien se escribe (si se conoce). */
  recipientName?: string | null;
  series: string;
  number: number | null;
  total: string;
  balanceDue: string;
  /** Vencimiento en formato AAAA-MM-DD. */
  dueDate: string | null;
  /** Hoy en formato AAAA-MM-DD (se inyecta para poder probarlo). */
  today: string;
}

/** Texto del recordatorio de cobro que se abre en WhatsApp. */
export function paymentReminderMessage(input: ReminderInput): string {
  const greeting = input.recipientName ? `Hola ${input.recipientName.split(/\s+/)[0]}` : "Hola";
  const invoice = formatDocumentNumber(input.series, input.number);
  const partial = Number(input.balanceDue) > 0 && Number(input.balanceDue) < Number(input.total) - 0.005;
  const pending = formatMoney(input.balanceDue);
  const amount = partial ? `quedan ${pending} pendientes de ${formatMoney(input.total)}` : `son ${pending}`;
  let when = "";
  if (input.dueDate) {
    when = input.dueDate < input.today ? ` y venció el ${toDisplayDate(input.dueDate)}` : ` y vence el ${toDisplayDate(input.dueDate)}`;
  }
  return `${greeting}, soy de Origen Patatas. Te recuerdo la factura ${invoice} (${amount})${when}. ¿Puedes confirmarme cuándo la pagas? Gracias.`;
}
