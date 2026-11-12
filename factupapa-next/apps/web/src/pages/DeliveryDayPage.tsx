import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, MapPin, MessageCircle, Phone, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { potatoApi } from "../api/services";
import { ordersApi, type DeliveryStop } from "../api/workspace";
import { OrderCard } from "../workspace/OrderCard";
import { fridgeHint, mapsUrl, stopAddress } from "../workspace/delivery";
import { formatShortDate, isOverdue } from "../workspace/helpers";
import { telUrl, whatsappUrl } from "../utils/phone";
import { todayLocal } from "../utils/format";

function Phones({ stop }: { stop: DeliveryStop }) {
  const entries = [
    ...stop.people.filter((person) => person.phone).map((person) => ({ label: person.role ? `${person.name} (${person.role})` : person.name, phone: person.phone! })),
    ...(stop.contactPhone ? [{ label: "Local", phone: stop.contactPhone }] : []),
  ];
  if (entries.length === 0) return null;
  return (
    <ul className="stop-phones">
      {entries.map((entry) => {
        const wa = whatsappUrl(entry.phone);
        const tel = telUrl(entry.phone);
        return (
          <li key={`${entry.label}${entry.phone}`}>
            <span>
              <strong>{entry.label}</strong>
              <small>{entry.phone}</small>
            </span>
            {tel && (
              <a className="people-list__link" href={tel} aria-label={`Llamar a ${entry.label}`}>
                <Phone aria-hidden="true" />
              </a>
            )}
            {wa && (
              <a className="people-list__link people-list__link--wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${entry.label}`}>
                <MessageCircle aria-hidden="true" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Reparto del día: lo que toca entregar hoy y lo atrasado, con teléfono, mapa y nevera de cada parada. */
export function DeliveryDayPage() {
  const today = todayLocal();
  const day = useQuery({ queryKey: ["orders", "delivery-day", today], queryFn: () => ordersApi.deliveryDay(today) });
  const potato = useQuery({ queryKey: ["potato-overview"], queryFn: potatoApi.overview });
  const stops = day.data?.items ?? [];
  const fridgeItems = potato.data?.items ?? [];

  return (
    <div className="page workspace-page delivery-day">
      <header className="page-heading">
        <div>
          <Link to="/pedidos" className="back-link">
            <ArrowLeft aria-hidden="true" /> Pedidos
          </Link>
          <h1>
            <Truck aria-hidden="true" /> Reparto de hoy
          </h1>
          <p className="form-hint">
            Pedidos para hoy y los que van atrasados. Marca lo entregado en cada línea y, al terminar, haz el albarán: al
            emitirlo baja la nevera.
          </p>
        </div>
      </header>

      {day.isLoading ? (
        <p className="form-hint">Cargando…</p>
      ) : day.isError ? (
        <div className="inline-error" role="alert">
          No se pudo cargar el reparto.
          <button type="button" onClick={() => void day.refetch()}>
            Reintentar
          </button>
        </div>
      ) : stops.length === 0 ? (
        <p className="workspace-empty">No hay entregas para hoy.</p>
      ) : (
        <div className="stop-list">
          {stops.map((stop, index) => {
            const address = stopAddress(stop.contactAddress);
            const map = mapsUrl(address);
            const late = isOverdue(stop.dueDate, today);
            const hints = stop.lines.map((line) => ({ line, hint: fridgeHint(line, fridgeItems) })).filter((entry) => entry.hint);
            return (
              <section key={stop.id} className={`stop-card${late ? " stop-card--late" : ""}`} aria-label={`Parada ${index + 1}: ${stop.contactName}`}>
                <header className="stop-card__head">
                  <span className="stop-card__number">{index + 1}</span>
                  <div>
                    <h2>{stop.contactName}</h2>
                    <small>{late ? `Atrasado · era para el ${formatShortDate(stop.dueDate)}` : "Para hoy"}</small>
                  </div>
                </header>
                {address && (
                  <p className="stop-card__address">
                    <MapPin aria-hidden="true" /> {address}
                    {map && (
                      <a href={map} target="_blank" rel="noopener noreferrer">
                        Cómo llegar
                      </a>
                    )}
                  </p>
                )}
                <Phones stop={stop} />
                {hints.length > 0 && (
                  <ul className="stop-fridge" aria-label="Nevera">
                    {hints.map(({ line, hint }) => (
                      <li key={line.id} className={hint!.short ? "is-short" : ""}>
                        <strong>{line.description}</strong> · {hint!.text}
                        {hint!.short && " · falta: haz una tirada"}
                      </li>
                    ))}
                  </ul>
                )}
                <OrderCard order={stop} />
                <Link className="compact-action stop-card__note" to={`/ventas/nuevo/albaran?contactId=${stop.contactId}`}>
                  <FileText aria-hidden="true" /> Hacer albarán
                </Link>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
