import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit3, Mail, MapPin, Phone, Search, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { contactsApi, pricingApi } from "../api/services";
import type { EffectiveProduct } from "../api/types";
import { PriceDialog } from "../pricing/PriceDialog";
import { AddressLine } from "../ui/AddressLine";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingScreen } from "../ui/LoadingScreen";
import { useToast } from "../ui/ToastProvider";
import { formatMoney, unitLabel } from "../utils/format";

export function ContactDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EffectiveProduct | null>(null);
  const contact = useQuery({ queryKey: ["contact", id], queryFn: () => contactsApi.get(id) });
  const prices = useQuery({ queryKey: ["prices", id, search], queryFn: () => pricingApi.list(id, { search: search || undefined, pageSize: 100 }), enabled: contact.isSuccess });
  const deactivate = useMutation({ mutationFn: () => contactsApi.deactivate(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["contacts"] }); toast.show("Contacto dado de baja"); navigate("/catalogo/contactos", { replace: true }); } });
  if (contact.isLoading) return <LoadingScreen label="Cargando contacto" />;
  if (contact.isError || !contact.data) return <div className="page"><EmptyState title="Contacto no disponible" description="No existe o no pertenece a tu empresa." action={<Link to="/catalogo/contactos">Volver al catálogo</Link>} /></div>;
  const item = contact.data;
  return (
    <div className="page detail-page">
      <header className="detail-header"><Link to="/catalogo/contactos" className="icon-button" aria-label="Volver"><ArrowLeft /></Link><div className="detail-header__title"><p className="eyebrow">{item.type === "both" ? "Cliente y proveedor" : item.type === "customer" ? "Cliente" : "Proveedor"}</p><h1>{item.tradeName || item.legalName}</h1><span className={`status ${item.isActive ? "status--active" : "status--inactive"}`}>{item.isActive ? "Activo" : "Inactivo"}</span></div><Link className="icon-button" to={`/contactos/${id}/editar`} aria-label="Editar contacto"><Edit3 /></Link></header>
      <section className="detail-card"><h2>Datos de contacto</h2><dl className="detail-list"><div><dt><Tag />Nombre fiscal</dt><dd>{item.legalName}{item.taxId && <small>{item.taxId}</small>}</dd></div><div><dt><Mail />Email</dt><dd>{item.email ? <a href={`mailto:${item.email}`}>{item.email}</a> : "Sin email"}</dd></div><div><dt><Phone />Teléfono</dt><dd>{item.phone ? <a href={`tel:${item.phone}`}>{item.phone}</a> : "Sin teléfono"}</dd></div><div><dt><MapPin />Dirección</dt><dd><AddressLine address={item.address} /></dd></div></dl>{item.notes && <div className="notes"><strong>Notas</strong><p>{item.notes}</p></div>}</section>
      <section aria-labelledby="prices-title"><div className="section-heading"><div><p className="eyebrow">Tarifa personalizada</p><h2 id="prices-title">Precios para este contacto</h2></div></div><label className="search-box"><Search /><span className="sr-only">Buscar productos</span><input type="search" placeholder="Buscar producto" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {prices.isLoading && <div className="skeleton-card" />}{prices.isError && <div className="inline-error" role="alert">No se han podido cargar los precios. <button onClick={() => void prices.refetch()}>Reintentar</button></div>}
        {prices.data?.items.length === 0 && <EmptyState title="No hay productos" description="Crea productos en el catálogo para asignar precios." />}
        <div className="price-list">{prices.data?.items.map((product) => <button key={product.id} className="price-row" onClick={() => setEditing(product)}><span><strong>{product.name}</strong><small>{product.sku || unitLabel(product.unit)}</small></span><span className="price-row__value"><strong>{formatMoney(product.effectivePrice)}</strong><small className={product.specificPrice ? "specific" : "general"}>{product.specificPrice ? "Específico" : "General"}</small></span></button>)}</div>
      </section>
      {item.isActive && <Button variant="danger" icon={<Trash2 />} busy={deactivate.isPending} onClick={() => { if (window.confirm("¿Dar de baja este contacto? Sus datos se conservarán.")) deactivate.mutate(); }}>Dar de baja</Button>}
      {editing && <PriceDialog contactId={id} product={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
