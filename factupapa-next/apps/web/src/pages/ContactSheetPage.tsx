import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { contactsApi } from "../api/services";
import { PeopleSection } from "../contacts/PeopleSection";
import { AddressLine } from "../ui/AddressLine";
import { LoadingScreen } from "../ui/LoadingScreen";
import { telUrl } from "../utils/phone";

/**
 * Ficha de consulta de un cliente o proveedor para los socios: datos básicos y personas de contacto
 * (que sí pueden editar). Precios, condiciones de pago y cuentas son solo del maestro.
 */
export function ContactSheetPage() {
  const { id = "" } = useParams();
  const contact = useQuery({ queryKey: ["contact", id], queryFn: () => contactsApi.get(id) });
  if (contact.isLoading) return <LoadingScreen label="Cargando contacto" />;
  if (contact.isError || !contact.data) {
    return (
      <div className="page">
        <p className="form-hint">No se pudo cargar el contacto.</p>
        <Link to="/catalogo/contactos" className="back-link">
          <ArrowLeft aria-hidden="true" /> Volver
        </Link>
      </div>
    );
  }
  const item = contact.data;
  const tel = telUrl(item.phone);
  return (
    <div className="page workspace-page">
      <header className="page-heading">
        <div>
          <Link to="/catalogo/contactos" className="back-link">
            <ArrowLeft aria-hidden="true" /> Clientes
          </Link>
          <h1>{item.tradeName || item.legalName}</h1>
          <p className="form-hint">{item.type === "supplier" ? "Proveedor" : item.type === "both" ? "Cliente y proveedor" : "Cliente"}</p>
        </div>
      </header>
      <section className="detail-card">
        <h2>Datos</h2>
        <dl className="detail-list">
          <div>
            <dt>
              <Phone />
              Teléfono
            </dt>
            <dd>{item.phone ? <a href={tel ?? undefined}>{item.phone}</a> : "Sin teléfono"}</dd>
          </div>
          <div>
            <dt>
              <Mail />
              Email
            </dt>
            <dd>{item.email ? <a href={`mailto:${item.email}`}>{item.email}</a> : "Sin email"}</dd>
          </div>
          <div>
            <dt>
              <MapPin />
              Dirección
            </dt>
            <dd>
              <AddressLine address={item.address} />
            </dd>
          </div>
        </dl>
        {item.notes && (
          <div className="notes">
            <strong>Notas</strong>
            <p>{item.notes}</p>
          </div>
        )}
      </section>
      <PeopleSection contactId={id} />
    </div>
  );
}
