import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { contactPeopleApi, contactsApi } from "../api/services";
import { askChoice, showNotice } from "../ui/dialogs";
import { paymentReminderMessage } from "../utils/payment-reminder";
import { whatsappUrl } from "../utils/phone";
import { todayLocal } from "../utils/format";
import type { Invoice } from "../api/types";

interface Target {
  label: string;
  phone: string;
  name: string | null;
}

/** Abre WhatsApp con un recordatorio de cobro ya escrito para el teléfono del dueño, el encargado o el cliente. */
export function PaymentReminderButton({
  invoice,
  compact = false,
}: {
  invoice: Pick<Invoice, "contactId" | "series" | "number" | "total" | "balanceDue" | "dueDate">;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const [contact, people] = await Promise.all([
        contactsApi.get(invoice.contactId),
        contactPeopleApi.list(invoice.contactId).catch(() => ({ items: [] })),
      ]);
      const targets: Target[] = [];
      for (const person of people.items) {
        if (person.phone && whatsappUrl(person.phone)) {
          targets.push({ label: `${person.name}${person.role ? ` (${person.role})` : ""} · ${person.phone}`, phone: person.phone, name: person.name });
        }
      }
      if (contact.phone && whatsappUrl(contact.phone)) {
        targets.push({ label: `${contact.tradeName || contact.legalName} · ${contact.phone}`, phone: contact.phone, name: null });
      }
      if (targets.length === 0) {
        await showNotice("Este cliente no tiene ningún móvil apuntado. Añádelo en su ficha (Personas de contacto).");
        return;
      }
      let target = targets[0]!;
      if (targets.length > 1) {
        const choice = await askChoice(
          "¿A quién le escribo?",
          targets.map((item, index) => ({ value: String(index), label: item.label })),
        );
        if (choice === null) return;
        target = targets[Number(choice)]!;
      }
      const text = paymentReminderMessage({
        recipientName: target.name,
        series: invoice.series,
        number: invoice.number,
        total: invoice.total,
        balanceDue: invoice.balanceDue ?? invoice.total,
        dueDate: invoice.dueDate,
        today: todayLocal(),
      });
      window.open(`${whatsappUrl(target.phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } catch {
      await showNotice("No se pudo preparar el recordatorio. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return compact ? (
    <button type="button" aria-label="Recordar cobro por WhatsApp" title="Recordar cobro" disabled={busy} onClick={() => void send()}>
      <MessageCircle aria-hidden="true" />
    </button>
  ) : (
    <button type="button" className="compact-action" disabled={busy} onClick={() => void send()}>
      <MessageCircle aria-hidden="true" /> Recordar cobro
    </button>
  );
}
