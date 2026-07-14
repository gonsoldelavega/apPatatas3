import { Building2, ChevronRight, Plus, Search, Store } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { contactsApi } from "../api/services";
import type { ContactType } from "../api/types";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";

type Filter = "all" | ContactType | "inactive";
const filterLabels: Record<Filter, string> = { all: "Todos", customer: "Clientes", supplier: "Proveedores", both: "Ambos", inactive: "Inactivos" };

export function ContactsListPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const contacts = useQuery({
    queryKey: ["contacts", search, filter, page],
    queryFn: () => contactsApi.list({
      search: search || undefined,
      type: filter !== "all" && filter !== "inactive" ? filter : undefined,
      isActive: filter === "inactive" ? false : true,
      page,
      pageSize: 20
    })
  });
  return (
    <section className="catalog-section" aria-labelledby="contacts-title">
      <div className="section-heading"><div><p className="eyebrow">Directorio</p><h2 id="contacts-title">Contactos</h2></div><Link className="compact-action" to="/contactos/nuevo"><Plus />Añadir</Link></div>
      <label className="search-box"><Search aria-hidden="true" /><span className="sr-only">Buscar contactos</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nombre, NIF, email o teléfono" /></label>
      <div className="filter-row" aria-label="Filtrar contactos">{Object.entries(filterLabels).map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value as Filter); setPage(1); }}>{label}</button>)}</div>
      {contacts.isLoading && <div className="card-list" aria-label="Cargando contactos">{[1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}</div>}
      {contacts.isError && <div className="inline-error" role="alert">No se han podido cargar los contactos. <button onClick={() => void contacts.refetch()}>Reintentar</button></div>}
      {contacts.data?.items.length === 0 && <EmptyState title="No hay contactos aquí" description={search ? "Prueba con otra búsqueda o cambia el filtro." : "Crea tu primer cliente o proveedor para empezar."} action={<Link className="button button--primary" to="/contactos/nuevo"><span>Crear contacto</span></Link>} />}
      <div className="card-list">
        {contacts.data?.items.map((contact) => (
          <Link className="entity-card" to={`/contactos/${contact.id}`} key={contact.id}>
            <span className="entity-card__icon">{contact.type === "supplier" ? <Store /> : <Building2 />}</span>
            <span className="entity-card__body"><strong>{contact.tradeName || contact.legalName}</strong><small>{contact.taxId || contact.email || contact.phone || "Sin datos adicionales"}</small><span className={`status ${contact.isActive ? "status--active" : "status--inactive"}`}>{contact.isActive ? filterLabels[contact.type] : "Inactivo"}</span></span>
            <ChevronRight aria-hidden="true" />
          </Link>
        ))}
      </div>
      {contacts.data && contacts.data.total > contacts.data.pageSize && <div className="pagination"><Button variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>Página {page}</span><Button variant="secondary" disabled={page * contacts.data.pageSize >= contacts.data.total} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div>}
    </section>
  );
}
