import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  FileText,
  Package,
  ScrollText,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  contactsApi,
  deliveryNotesApi,
  importsApi,
  invoicesApi,
  productsApi,
} from "../api/services";
import { useAuth } from "../auth/AuthProvider";
import { formatMoney } from "../utils/format";

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
      const [customers, products, imports, notes, invoices] = await Promise.all(
        [
          contactsApi.list({ isActive: true, pageSize: 1 }),
          productsApi.list({ isActive: true, pageSize: 1 }),
          importsApi.list(1, 100),
          deliveryNotesApi.list({ pendingInvoice: true, pageSize: 100 }),
          invoicesApi.list({ status: "issued", pageSize: 100 }),
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
  return (
    <div className="page dashboard-page">
      <header className="page-hero">
        <div>
          <p className="eyebrow">{user?.company.name}</p>
          <h1>
            {greeting()}, {user?.displayName.split(" ")[0]}
          </h1>
          <p>Ventas reales disponibles, todavía sin cobros ni deuda.</p>
        </div>
        <span className="hero-badge">FP</span>
      </header>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resumen operativo</p>
            <h2>Lo importante, a mano</h2>
          </div>
        </div>
        {summary.isError ? (
          <div className="inline-error" role="alert">
            No se ha podido cargar.{" "}
            <button onClick={() => void summary.refetch()}>Reintentar</button>
          </div>
        ) : (
          <div className="metric-grid" aria-busy={summary.isLoading}>
            <article>
              <ScrollText />
              <strong>{summary.data?.pendingNotes ?? "—"}</strong>
              <span>Albaranes por facturar</span>
            </article>
            <article>
              <FileText />
              <strong>{summary.data?.issuedInvoices ?? "—"}</strong>
              <span>Facturas emitidas</span>
            </article>
            <article>
              <FileText />
              <strong>
                {summary.data ? formatMoney(summary.data.invoicedTotal) : "—"}
              </strong>
              <span>Importe emitido</span>
            </article>
            <article>
              <Upload />
              <strong>{summary.data?.pendingImports ?? "—"}</strong>
              <span>Importaciones pendientes</span>
            </article>
          </div>
        )}
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Acciones rápidas</p>
            <h2>¿Por dónde empezamos?</h2>
          </div>
        </div>
        <div className="quick-actions">
          <Link to="/ventas/nuevo/albaran">
            <ScrollText />
            <span>
              <strong>Crear albarán</strong>
              <small>Con precio efectivo</small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/contactos/nuevo?tipo=customer">
            <Building2 />
            <span>
              <strong>Crear cliente</strong>
              <small>Datos fiscales</small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/productos/nuevo">
            <Package />
            <span>
              <strong>Crear producto</strong>
              <small>Precio, unidad e IVA</small>
            </span>
            <ArrowRight />
          </Link>
        </div>
      </section>
    </div>
  );
}
