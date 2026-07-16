import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  FileText,
  Package,
  Plus,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  contactsApi,
  deliveryNotesApi,
  importsApi,
  invoicesApi,
  productsApi,
  salesPreferencesApi,
} from "../api/services";
import { useAuth } from "../auth/AuthProvider";
import { formatDate, formatMoney } from "../utils/format";

function greeting() {
  const hour = new Date().getHours();
  return hour < 13
    ? "Buenos días"
    : hour < 20
      ? "Buenas tardes"
      : "Buenas noches";
}
function sum(values: string[]): string {
  const scale = 10_000n;
  const total = values.reduce((acc, value) => {
    const [integer, fraction = ""] = value.split(".");
    return acc + BigInt(integer!) * scale + BigInt(fraction.padEnd(4, "0"));
  }, 0n);
  return `${total / scale}.${(total % scale).toString().padStart(4, "0")}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const [customers, products, imports, notes, invoices, preferences] = await Promise.all(
        [
          contactsApi.list({ isActive: true, pageSize: 1 }),
          productsApi.list({ isActive: true, pageSize: 1 }),
          importsApi.list(1, 100),
          deliveryNotesApi.list({ pendingInvoice: true, pageSize: 100 }),
          invoicesApi.list({ status: "issued", pageSize: 100 }),
          salesPreferencesApi.get(),
        ],
      );
      return {
        customers: customers.total,
        products: products.total,
        pendingImports: imports.items.filter((item) =>
          ["pending", "validated", "importing"].includes(item.status),
        ).length,
        pendingNotes: notes.total,
        issuedInvoices: invoices.total,
        invoicedTotal: sum(invoices.items.map((invoice) => invoice.total)),
        primarySalesFlow: preferences.primarySalesFlow,
        recent: [
          ...notes.items.map((item) => ({
            id: item.id,
            label: "Albarán",
            date: item.issueDate,
          })),
          ...invoices.items.map((item) => ({
            id: item.id,
            label: "Factura",
            date: item.issueDate,
          })),
        ]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 3),
      };
    },
  });
  const preferDeliveryNotes = summary.data?.primarySalesFlow === "delivery_notes" ||
    (summary.data?.primarySalesFlow === "adaptive" && summary.data.pendingNotes > summary.data.issuedInvoices);
  return (
    <div className="page dashboard-page">
      <header className="page-hero">
        <div>
          <div className="brand-row"><strong>FactuPapa</strong><span>{new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date())}</span></div>
          <h1>
            {greeting()}, {user?.displayName.split(" ")[0]} <span aria-hidden="true">👋</span>
          </h1>
          <p>{user?.company.name} está sincronizado y al día.</p>
        </div>
        <span className="hero-badge" aria-label="Perfil">{user?.displayName.slice(0, 1).toUpperCase()}</span>
      </header>
      <section>
        {summary.isError ? (
          <div className="inline-error" role="alert">
            No se ha podido cargar.{" "}
            <button onClick={() => void summary.refetch()}>Reintentar</button>
          </div>
        ) : (
          <div className="business-summary" aria-busy={summary.isLoading}>
            <p>FACTURACIÓN EMITIDA</p>
            <strong>{summary.data ? formatMoney(summary.data.invoicedTotal) : "—"}</strong>
            <div><span>Facturas <b>{summary.data?.issuedInvoices ?? "—"}</b></span><span>Clientes <b>{summary.data?.customers ?? "—"}</b></span></div>
          </div>
        )}
      </section>
      <section className="home-shortcuts" aria-label="Acciones principales">
        <Link className="home-shortcut home-shortcut--primary" to={preferDeliveryNotes ? "/ventas/nuevo/albaran" : "/ventas/nuevo/factura"}><Plus /><span>{preferDeliveryNotes ? "Albarán" : "Factura"}</span></Link>
        <Link className="home-shortcut" to="/contactos/nuevo?tipo=customer"><Building2 /><span>Cliente</span></Link>
        <Link className="home-shortcut" to="/productos/nuevo"><Package /><span>Producto</span></Link>
        <Link className="home-shortcut" to="/importar"><Upload /><span>Importar</span></Link>
      </section>
      {(summary.data?.pendingNotes || summary.data?.pendingImports) ? <section className="attention-card">
        <div className="section-heading"><div><p className="eyebrow">Necesita tu atención</p><h2>Pendientes</h2></div></div>
        {Boolean(summary.data?.pendingNotes) && <Link to="/ventas"><CircleAlert /><span><strong>{summary.data?.pendingNotes} albaranes sin facturar</strong><small>Solo aparecen porque tienes actividad pendiente</small></span><ArrowRight /></Link>}
        {Boolean(summary.data?.pendingImports) && <Link to="/importar"><CircleAlert /><span><strong>{summary.data?.pendingImports} importaciones pendientes</strong><small>Revisa los datos antes de confirmar</small></span><ArrowRight /></Link>}
      </section> : null}
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Actividad reciente</p>
            <h2>Últimos documentos</h2>
          </div>
          <Link to="/ventas">Ver todo</Link>
        </div>
        <div className="recent-documents">
          {!summary.data?.recent.length && <p className="empty-copy">Tu primera factura aparecerá aquí.</p>}
          {summary.data?.recent.map((item) => <Link key={`${item.label}-${item.id}`} to={`/ventas/${item.label === "Factura" ? "facturas" : "albaranes"}/${item.id}`}><FileText /><span><strong>{item.label}</strong><small>{formatDate(item.date)}</small></span><ArrowRight /></Link>)}
        </div>
      </section>
    </div>
  );
}
