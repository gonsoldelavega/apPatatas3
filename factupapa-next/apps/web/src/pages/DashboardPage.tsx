import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Camera,
  CircleAlert,
  FileText,
  Package,
  Plus,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
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
import type { FinanceSummary, Invoice, MonthlyFinanceSummary } from "../api/types";
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

interface DashboardSummary {
  customers: number;
  pendingImports: number;
  pendingNotes: number;
  issuedInvoices: number;
  finance: FinanceSummary;
  monthly: MonthlyFinanceSummary[];
  recentInvoices: Invoice[];
}

const isPreview =
  typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app");

const previewSummary: DashboardSummary = {
  customers: 18,
  pendingImports: 1,
  pendingNotes: 3,
  issuedInvoices: 14,
  finance: {
    sales: "3420.00",
    purchases: "1540.30",
    recurring: "310.00",
    balance: "1569.70",
    stockKg: "1260",
    potentialRevenue: "2016.00",
    receivables: "545.00",
    overdueReceivables: "320.00",
    payables: "425.00",
  },
  monthly: [
    { month: "2026-02", sales: "2380", purchases: "1210", recurring: "290", balance: "880" },
    { month: "2026-03", sales: "2760", purchases: "1320", recurring: "305", balance: "1135" },
    { month: "2026-04", sales: "3010", purchases: "1440", recurring: "305", balance: "1265" },
    { month: "2026-05", sales: "2890", purchases: "1360", recurring: "310", balance: "1220" },
    { month: "2026-06", sales: "3180", purchases: "1490", recurring: "310", balance: "1380" },
    { month: "2026-07", sales: "3420", purchases: "1540.30", recurring: "310", balance: "1569.70" },
  ],
  recentInvoices: [
    {
      id: "preview-105",
      contactId: "preview-customer-1",
      number: 105,
      series: "FAC",
      issueDate: "2026-07-25",
      dueDate: "2026-08-09",
      operationStartDate: "2026-07-16",
      operationEndDate: "2026-07-31",
      deliveryDates: [],
      paymentTerms: null,
      generalInformation: null,
      status: "issued",
      paymentStatus: "unpaid",
      paidTotal: "0",
      balanceDue: "416",
      notes: null,
      subtotal: "400",
      taxTotal: "16",
      total: "416",
      sourceType: "manual",
      contactLegalName: "Bar Restaurante Ejemplo",
      contactTaxId: "TEST-B-0001",
      contactAddress: {},
    },
    {
      id: "preview-104",
      contactId: "preview-customer-2",
      number: 104,
      series: "FAC",
      issueDate: "2026-07-20",
      dueDate: "2026-08-04",
      operationStartDate: "2026-07-01",
      operationEndDate: "2026-07-15",
      deliveryDates: [],
      paymentTerms: null,
      generalInformation: null,
      status: "issued",
      paymentStatus: "paid",
      paidTotal: "250",
      balanceDue: "0",
      notes: null,
      subtotal: "240.38",
      taxTotal: "9.62",
      total: "250",
      sourceType: "manual",
      contactLegalName: "Pollería Pepe",
      contactTaxId: "TEST-B-0002",
      contactAddress: {},
    },
    {
      id: "preview-103",
      contactId: "preview-customer-3",
      number: 103,
      series: "FAC",
      issueDate: "2026-07-18",
      dueDate: "2026-08-02",
      operationStartDate: "2026-07-01",
      operationEndDate: "2026-07-15",
      deliveryDates: [],
      paymentTerms: null,
      generalInformation: null,
      status: "issued",
      paymentStatus: "partial",
      paidTotal: "200",
      balanceDue: "120",
      notes: null,
      subtotal: "307.69",
      taxTotal: "12.31",
      total: "320",
      sourceType: "manual",
      contactLegalName: "Carnicería Luis",
      contactTaxId: "TEST-B-0003",
      contactAddress: {},
    },
  ],
};

export function DashboardPage() {
  const { user } = useAuth();
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    enabled: !isPreview,
    queryFn: async (): Promise<DashboardSummary> => {
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

  const data = isPreview ? previewSummary : summary.data;
  const result = Number(data?.finance.balance ?? 0);
  const firstName = user?.displayName.split(" ")[0] || "Nando";

  return (
    <div className="page dashboard-page dashboard-premium">
      <header className="dashboard-topbar">
        <div>
          <div className="dashboard-brand">
            <strong>FactuPapa</strong>
            <span>
              {new Intl.DateTimeFormat("es-ES", {
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </span>
          </div>
          <h1>{greeting()}, {firstName}</h1>
          <p>Lo importante de tu negocio, en una sola vista.</p>
        </div>
        <span className="dashboard-avatar" aria-label="Perfil">
          {firstName.slice(0, 1).toUpperCase()}
        </span>
      </header>

      {summary.isError && !isPreview ? (
        <div className="inline-error" role="alert">
          No se ha podido cargar el resumen.
          <button type="button" onClick={() => void summary.refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <section className="result-card" aria-busy={summary.isLoading}>
          <div className="result-card__heading">
            <div>
              <span>Resultado del mes</span>
              <strong className={result >= 0 ? "is-positive" : "is-negative"}>
                {data ? formatMoney(data.finance.balance) : "—"}
              </strong>
            </div>
            <span className="result-card__trend">
              <TrendingUp aria-hidden="true" /> Mes actual
            </span>
          </div>
          <div className="result-card__metrics">
            <div><span>Facturado</span><b>{data ? formatMoney(data.finance.sales) : "—"}</b></div>
            <div><span>Compras y gastos</span><b>{data ? formatMoney(String(Number(data.finance.purchases) + Number(data.finance.recurring))) : "—"}</b></div>
            <div><span>Pendiente de cobro</span><b>{data ? formatMoney(data.finance.receivables) : "—"}</b></div>
          </div>
        </section>
      )}

      <section className="dashboard-actions" aria-label="Acciones principales">
        <div className="dashboard-actions__featured">
          <Link className="dashboard-action dashboard-action--primary" to="/ventas/nuevo/factura">
            <Plus aria-hidden="true" />
            <span><strong>Nueva factura</strong><small>Crear y emitir</small></span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="dashboard-action dashboard-action--capture" to="/gastos/nuevo?captura=1">
            <Camera aria-hidden="true" />
            <span><strong>Fotografiar compra</strong><small>Subir factura y revisar datos</small></span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="dashboard-actions__secondary">
          <Link to="/gastos/nuevo"><ShoppingBag aria-hidden="true" /><span>Compra manual</span></Link>
          <Link to="/ventas"><ReceiptText aria-hidden="true" /><span>Cobros</span></Link>
        </div>
      </section>

      <section className="dashboard-section attention-premium">
        <div className="dashboard-section__heading">
          <div><span>Prioridad</span><h2>Necesita tu atención</h2></div>
          <Sparkles aria-hidden="true" />
        </div>
        <div className="attention-list">
          {Number(data?.finance.overdueReceivables ?? 0) > 0 && (
            <Link to="/ventas" className="attention-row attention-row--danger">
              <CircleAlert aria-hidden="true" />
              <span><strong>{formatMoney(data?.finance.overdueReceivables ?? "0")} vencidos</strong><small>Revisa las facturas fuera de plazo</small></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {Boolean(data?.pendingNotes) && (
            <Link to="/ventas" className="attention-row">
              <FileText aria-hidden="true" />
              <span><strong>{data?.pendingNotes} albaranes sin facturar</strong><small>Puedes convertirlos desde Ventas</small></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {Boolean(data?.pendingImports) && (
            <Link to="/importar" className="attention-row">
              <CircleAlert aria-hidden="true" />
              <span><strong>{data?.pendingImports} importación pendiente</strong><small>Revisa los datos antes de confirmar</small></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {!Number(data?.finance.overdueReceivables ?? 0) && !data?.pendingNotes && !data?.pendingImports && (
            <p className="dashboard-all-clear">Todo está al día.</p>
          )}
        </div>
      </section>

      <section className="dashboard-section recent-premium">
        <div className="dashboard-section__heading">
          <div><span>Actividad</span><h2>Últimas facturas</h2></div>
          <Link to="/ventas">Ver todas</Link>
        </div>
        <div className="premium-document-list">
          {!data?.recentInvoices.length && <p className="empty-copy">Tu primera factura aparecerá aquí.</p>}
          {data?.recentInvoices.map((item) => (
            <Link key={item.id} to={`/ventas/facturas/${item.id}`}>
              <span className="document-symbol"><FileText aria-hidden="true" /></span>
              <span className="document-main">
                <strong>{item.contactLegalName}</strong>
                <small>{item.number ? `${item.series}-${item.number}` : "Borrador"} · {formatDate(item.issueDate)}</small>
              </span>
              <span className="document-amount">
                <strong>{formatMoney(item.total)}</strong>
                <small className={`payment-${item.paymentStatus ?? "unpaid"}`}>{item.paymentStatus === "paid" ? "Pagada" : item.paymentStatus === "partial" ? "Parcial" : item.paymentStatus === "overdue" ? "Vencida" : "Pendiente"}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <details className="dashboard-insights">
        <summary><span><strong>Más indicadores</strong><small>Stock, proveedores y evolución</small></span><ArrowRight aria-hidden="true" /></summary>
        <div className="insight-grid">
          <article><span>Stock disponible</span><strong>{data?.finance.stockKg ?? "—"} kg</strong><small>Venta potencial {data ? formatMoney(data.finance.potentialRevenue) : "—"}</small></article>
          <article><span>Proveedores pendientes</span><strong>{data ? formatMoney(data.finance.payables) : "—"}</strong><small>Compras confirmadas sin pagar</small></article>
          <article><span>Clientes activos</span><strong>{data?.customers ?? "—"}</strong><small>{data?.issuedInvoices ?? "—"} facturas emitidas</small></article>
        </div>
        {data?.monthly.length ? (
          <div className="premium-chart" aria-label="Ingresos y balance por mes">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data.monthly.map((row) => ({ label: monthLabel(row.month), Ingresos: Number(row.sales), Balance: Number(row.balance) }))} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={compactEuros} />
                <Tooltip formatter={(value) => formatMoney(String(value))} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "14px", color: "var(--ink)" }} />
                <Bar dataKey="Ingresos" fill="var(--chart-income)" radius={[5, 5, 0, 0]} maxBarSize={20} />
                <Line type="monotone" dataKey="Balance" stroke="var(--chart-balance)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--chart-balance)", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </details>

      <section className="dashboard-tools" aria-label="Herramientas del negocio">
        <Link to="/contactos/nuevo?tipo=customer"><Building2 aria-hidden="true" /><span>Nuevo cliente</span></Link>
        <Link to="/productos/nuevo"><Package aria-hidden="true" /><span>Nuevo producto</span></Link>
        <Link to="/stock"><TrendingUp aria-hidden="true" /><span>Ver stock</span></Link>
      </section>
    </div>
  );
}
