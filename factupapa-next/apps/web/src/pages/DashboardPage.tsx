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
  financeApi,
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
function sacksLabel(kgValue: string) {
  const kg = Number(kgValue);
  if (!Number.isFinite(kg) || kg <= 0) return "Sin sacos disponibles";
  const sacks = Math.floor(kg / 15),
    rest = Math.round((kg % 15) * 10_000) / 10_000;
  return `${sacks} sacos completos + ${rest} kg`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const [
        customers,
        products,
        imports,
        notes,
        invoices,
        preferences,
        finance,
        monthly,
      ] = await Promise.all([
        contactsApi.list({ isActive: true, pageSize: 1 }),
        productsApi.list({ isActive: true, pageSize: 1 }),
        importsApi.list(1, 100),
        deliveryNotesApi.list({ pendingInvoice: true, pageSize: 100 }),
        invoicesApi.list({ status: "issued", pageSize: 100 }),
        salesPreferencesApi.get(),
        financeApi.summary(),
        financeApi.monthlySummary(6),
      ]);
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
        finance,
        monthly,
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
  const preferDeliveryNotes =
    summary.data?.primarySalesFlow === "delivery_notes" ||
    (summary.data?.primarySalesFlow === "adaptive" &&
      summary.data.pendingNotes > summary.data.issuedInvoices);
  return (
    <div className="page dashboard-page">
      <header className="page-hero">
        <div>
          <div className="brand-row">
            <strong>FactuPapa</strong>
            <span>
              {new Intl.DateTimeFormat("es-ES", {
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </span>
          </div>
          <h1>
            {greeting()}, {user?.displayName.split(" ")[0]}{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p>{user?.company.name} está sincronizado y al día.</p>
        </div>
        <span className="hero-badge" aria-label="Perfil">
          {user?.displayName.slice(0, 1).toUpperCase()}
        </span>
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
            <strong>
              {summary.data ? formatMoney(summary.data.finance.sales) : "—"}
            </strong>
            <div>
              <span>
                Facturas <b>{summary.data?.issuedInvoices ?? "—"}</b>
              </span>
              <span>
                Clientes <b>{summary.data?.customers ?? "—"}</b>
              </span>
            </div>
          </div>
        )}
      </section>
      {summary.data && (
        <section className="metric-grid">
          <article>
            <span>Balance operativo del mes</span>
            <strong>{formatMoney(summary.data.finance.balance)}</strong>
          </article>
          <article>
            <span>Stock disponible</span>
            <strong>{summary.data.finance.stockKg} kg</strong>
            <small>
              {sacksLabel(summary.data.finance.stockKg)} ·{" "}
              Venta posible:{" "}
              {formatMoney(summary.data.finance.potentialRevenue)}
            </small>
          </article>
          <article>
            <span>Compras del mes</span>
            <strong>{formatMoney(summary.data.finance.purchases)}</strong>
          </article>
          <article>
            <span>Gastos fijos del mes</span>
            <strong>{formatMoney(summary.data.finance.recurring)}</strong>
          </article>
        </section>
      )}
      {summary.data?.monthly.length ? (
        <section className="monthly-balance">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Evolución</p>
              <h2>Balance de los últimos meses</h2>
            </div>
          </div>
          <div className="monthly-balance__list">
            {summary.data.monthly.map((row) => (
              <article key={row.month}>
                <strong>{new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit" }).format(new Date(`${row.month}-01T12:00:00`))}</strong>
                <span>Ventas {formatMoney(row.sales)}</span>
                <span>Costes {formatMoney(String(Number(row.purchases) + Number(row.recurring)))}</span>
                <b className={Number(row.balance) >= 0 ? "balance-positive" : "balance-negative"}>{formatMoney(row.balance)}</b>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="home-shortcuts" aria-label="Acciones principales">
        <Link
          className="home-shortcut home-shortcut--primary"
          to={
            preferDeliveryNotes
              ? "/ventas/nuevo/albaran"
              : "/ventas/nuevo/factura"
          }
        >
          <Plus />
          <span>{preferDeliveryNotes ? "Albarán" : "Factura"}</span>
        </Link>
        <Link className="home-shortcut" to="/contactos/nuevo?tipo=customer">
          <Building2 />
          <span>Cliente</span>
        </Link>
        <Link className="home-shortcut" to="/productos/nuevo">
          <Package />
          <span>Producto</span>
        </Link>
        <Link className="home-shortcut" to="/gastos/nuevo">
          <Upload />
          <span>Compra</span>
        </Link>
      </section>
      {summary.data?.pendingNotes || summary.data?.pendingImports ? (
        <section className="attention-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Necesita tu atención</p>
              <h2>Pendientes</h2>
            </div>
          </div>
          {Boolean(summary.data?.pendingNotes) && (
            <Link to="/ventas">
              <CircleAlert />
              <span>
                <strong>
                  {summary.data?.pendingNotes} albaranes sin facturar
                </strong>
                <small>Solo aparecen porque tienes actividad pendiente</small>
              </span>
              <ArrowRight />
            </Link>
          )}
          {Boolean(summary.data?.pendingImports) && (
            <Link to="/importar">
              <CircleAlert />
              <span>
                <strong>
                  {summary.data?.pendingImports} importaciones pendientes
                </strong>
                <small>Revisa los datos antes de confirmar</small>
              </span>
              <ArrowRight />
            </Link>
          )}
        </section>
      ) : null}
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Actividad reciente</p>
            <h2>Últimos documentos</h2>
          </div>
          <Link to="/ventas">Ver todo</Link>
        </div>
        <div className="recent-documents">
          {!summary.data?.recent.length && (
            <p className="empty-copy">Tu primera factura aparecerá aquí.</p>
          )}
          {summary.data?.recent.map((item) => (
            <Link
              key={`${item.label}-${item.id}`}
              to={`/ventas/${item.label === "Factura" ? "facturas" : "albaranes"}/${item.id}`}
            >
              <FileText />
              <span>
                <strong>{item.label}</strong>
                <small>{formatDate(item.date)}</small>
              </span>
              <ArrowRight />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
