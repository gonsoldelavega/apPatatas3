import { ArrowRight, Building2, Package, Store, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { contactsApi, importsApi, productsApi } from "../api/services";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 13) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function DashboardPage() {
  const { user } = useAuth();
  const counts = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [customers, suppliers, both, products, imports] = await Promise.all([
        contactsApi.list({ type: "customer", isActive: true, pageSize: 1 }),
        contactsApi.list({ type: "supplier", isActive: true, pageSize: 1 }),
        contactsApi.list({ type: "both", isActive: true, pageSize: 1 }),
        productsApi.list({ isActive: true, pageSize: 1 }),
        importsApi.list(1, 100)
      ]);
      return {
        customers: customers.total + both.total,
        suppliers: suppliers.total + both.total,
        products: products.total,
        pending: imports.items.filter((item) => ["pending", "validated", "importing"].includes(item.status)).length
      };
    }
  });
  return (
    <div className="page dashboard-page">
      <header className="page-hero">
        <div><p className="eyebrow">{user?.company.name}</p><h1>{greeting()}, {user?.displayName.split(" ")[0]}</h1><p>Todo lo necesario para mantener el catálogo al día.</p></div>
        <span className="hero-badge" aria-hidden="true">FP</span>
      </header>
      <section aria-labelledby="summary-title">
        <div className="section-heading"><div><p className="eyebrow">Resumen operativo</p><h2 id="summary-title">Lo importante, a mano</h2></div></div>
        {counts.isError ? <div className="inline-error" role="alert">No se ha podido cargar el resumen. <button onClick={() => void counts.refetch()}>Reintentar</button></div> : (
          <div className="metric-grid" aria-busy={counts.isLoading}>
            <article><Building2 /><strong>{counts.data?.customers ?? "—"}</strong><span>Clientes activos</span></article>
            <article><Store /><strong>{counts.data?.suppliers ?? "—"}</strong><span>Proveedores activos</span></article>
            <article><Package /><strong>{counts.data?.products ?? "—"}</strong><span>Productos activos</span></article>
            <article className={counts.data?.pending ? "metric--pending" : ""}><Upload /><strong>{counts.data?.pending ?? "—"}</strong><span>Importaciones pendientes</span></article>
          </div>
        )}
      </section>
      <section aria-labelledby="actions-title">
        <div className="section-heading"><div><p className="eyebrow">Acciones rápidas</p><h2 id="actions-title">¿Por dónde empezamos?</h2></div></div>
        <div className="quick-actions">
          <Link to="/contactos/nuevo?tipo=customer"><Building2 /><span><strong>Crear cliente</strong><small>Añade sus datos y contacto</small></span><ArrowRight /></Link>
          <Link to="/productos/nuevo"><Package /><span><strong>Crear producto</strong><small>Define precio, unidad e IVA</small></span><ArrowRight /></Link>
          <Link to="/importar"><Upload /><span><strong>Importar catálogo</strong><small>Revisa cada fila antes de confirmar</small></span><ArrowRight /></Link>
        </div>
      </section>
    </div>
  );
}
