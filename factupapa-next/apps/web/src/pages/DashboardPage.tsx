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
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  contactsApi,
  deliveryNotesApi,
  financeApi,
  importsApi,
  invoicesApi,
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

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit" }).format(
    new Date(`${month}-01T12:00:00`),
  );

const compactEuros = (value: number) =>
  `${new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value)} €`;

function sacksLabel(kgValue: string) {
  const kg = Number(kgValue);
  if (!Number.isFinite(kg) || kg <= 0) return "Sin sacos disponibles";
  const sacks = Math.floor(kg / 15);
  const rest = Math.round((kg % 15) * 100) / 100;
  return `${sacks} sacos completos + ${rest} kg`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const [customers, imports, notes, invoices, finance, monthly] =
        await Promise.all([
          contactsApi.list({ isActive: true, pageSize: 1 }),
          importsApi.list(1, 100),
          deliveryNotesApi.list({ pendingInvoice: true, pageSize: 100 }),
          invoicesApi.list({ pageSize: 100 }),
          financeApi.summary(),
          financeApi.monthlySummary(6),
        ]);

      return {
        customers: customers.total,
        pendingImports: imports.items.filter((item) =>
          ["pending", "validated", "importing"].includes(item.status),
        ).length,
        pendingNotes: notes.total,
        issuedInvoices: invoices.items.filter(
          (invoice) => invoice.status === "issued",
        ).length,
        finance,
        monthly,
        recentInvoices: invoices.items
          .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
          .slice(0, 3),
      };
    },
  });

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
          <p>Resumen operativo de {user?.company.name}.</p>
        </div>
        <span className="hero-badge" aria-label="Perfil">
          {user?.displayName.slice(0, 1).toUpperCase()}
        </span>
      </header>

      <section>
        {summary.isError ? (
          <div className="inline-error" role="alert">
            No se ha podido cargar el resumen.
            <button type="button" onClick={() => void summary.refetch()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="business-summary" aria-busy={summary.isLoading}>
            <p>FACTURACIÓN DEL MES</p>
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
              {sacksLabel(summary.data.finance.stockKg)} · Venta posible:{" "}
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
          <article
            className={
              Number(summary.data.finance.overdueReceivables ?? 0) > 0
                ? "metric-danger"
                : ""
            }
          >
            <span>Clientes pendientes</span>
            <strong>
              {formatMoney(summary.data.finance.receivables ?? "0")}
            </strong>
            <small>
              {formatMoney(summary.data.finance.overdueReceivables ?? "0")} vencidos
            </small>
          </article>
          <article>
            <span>Proveedores pendientes</span>
            <strong>{formatMoney(summary.data.finance.payables ?? "0")}</strong>
            <small>Compras confirmadas aún no pagadas</small>
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
          <div className="monthly-chart" aria-label="Ingresos y gastos por mes">
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart
                data={summary.data.monthly.map((row) => ({
                  label: monthLabel(row.month),
                  Ingresos: Number(row.sales),
                  Gastos: Number(row.purchases) + Number(row.recurring),
                  Balance: Number(row.balance),
                }))}
                barGap={2}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickFormatter={compactEuros}
                />
                <Tooltip
                  formatter={(value) => formatMoney(String(value))}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "12px",
                    color: "var(--ink)",
                  }}
                  cursor={{ fill: "var(--surface-soft)" }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: "var(--ink)" }}>{value}</span>
                  )}
                />
                <Bar
                  dataKey="Ingresos"
                  fill="var(--chart-income)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="Gastos"
                  fill="var(--chart-expense)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Line
                  type="monotone"
                  dataKey="Balance"
                  stroke="var(--chart-balance)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--chart-balance)", strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="monthly-balance__list">
            {summary.data.monthly.map((row) => (
              <article key={row.month}>
                <strong>{monthLabel(row.month)}</strong>
                <span>Ventas {formatMoney(row.sales)}</span>
                <span>
                  Costes{" "}
                  {formatMoney(
                    String(Number(row.purchases) + Number(row.recurring)),
                  )}
                </span>
                <b
                  className={
                    Number(row.balance) >= 0
                      ? "balance-positive"
                      : "balance-negative"
                  }
                >
                  {formatMoney(row.balance)}
                </b>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="home-shortcuts" aria-label="Acciones principales">
        <Link
          className="home-shortcut home-shortcut--primary"
          to="/ventas/nuevo/factura"
        >
          <Plus aria-hidden="true" />
          <span>Factura</span>
        </Link>
        <Link className="home-shortcut" to="/contactos/nuevo?tipo=customer">
          <Building2 aria-hidden="true" />
          <span>Cliente</span>
        </Link>
        <Link className="home-shortcut" to="/productos/nuevo">
          <Package aria-hidden="true" />
          <span>Producto</span>
        </Link>
        <Link className="home-shortcut" to="/gastos/nuevo">
          <Upload aria-hidden="true" />
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
              <CircleAlert aria-hidden="true" />
              <span>
                <strong>{summary.data?.pendingNotes} albaranes sin facturar</strong>
                <small>Se muestran únicamente porque siguen pendientes</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {Boolean(summary.data?.pendingImports) && (
            <Link to="/importar">
              <CircleAlert aria-hidden="true" />
              <span>
                <strong>{summary.data?.pendingImports} importaciones pendientes</strong>
                <small>Revisa los datos antes de confirmar</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </section>
      ) : null}

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Actividad reciente</p>
            <h2>Últimas facturas</h2>
          </div>
          <Link to="/ventas">Ver todas</Link>
        </div>
        <div className="recent-documents">
          {!summary.data?.recentInvoices.length && (
            <p className="empty-copy">Tu primera factura aparecerá aquí.</p>
          )}
          {summary.data?.recentInvoices.map((item) => (
            <Link key={item.id} to={`/ventas/facturas/${item.id}`}>
              <FileText aria-hidden="true" />
              <span>
                <strong>{item.number ? `${item.series}-${item.number}` : "Borrador"}</strong>
                <small>{formatDate(item.issueDate)}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
