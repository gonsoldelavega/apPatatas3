import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Camera,
  CircleAlert,
  FileText,
  Package,
  PackageSearch,
  Plus,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
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
import { formatDate, formatMoney } from "../utils/format";
import { currentPeriod, periodRange } from "../utils/period";

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit" }).format(
    new Date(`${month}-01T12:00:00`),
  );

const monthPickerLabel = (month: string) => {
  const parts = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(`${month}-01T12:00:00`));
  const label = `${parts.find((part) => part.type === "month")?.value ?? ""} ${
    parts.find((part) => part.type === "year")?.value ?? ""
  }`.trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const compactEuros = (value: number) =>
  `${new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value)} €`;

function DashboardSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <div className="dashboard-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

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
  import.meta.env.VITE_DEMO === "1" ||
  (typeof window !== "undefined" &&
    (window.location.search.includes("demo=1") ||
      window.location.hostname.endsWith(".vercel.app")));

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
  const [selectedMonth, setSelectedMonth] = useState(
    () => currentPeriod("month").month,
  );
  const selectedRange = periodRange({
    ...currentPeriod("month"),
    month: selectedMonth,
  });
  const summary = useQuery({
    queryKey: ["dashboard-summary", selectedMonth],
    enabled: !isPreview,
    queryFn: async (): Promise<DashboardSummary> => {
      const [customers, imports, notes, invoices, finance, monthly] =
        await Promise.all([
          contactsApi.list({ isActive: true, pageSize: 1 }),
          importsApi.list(1, 100),
          deliveryNotesApi.list({ pendingInvoice: true, pageSize: 100 }),
          invoicesApi.list({
            pageSize: 100,
            from: selectedRange.from,
            to: selectedRange.to,
          }),
          financeApi.summary(selectedRange.from, selectedRange.to),
          financeApi.monthlySummary(6),
        ]);

      return {
        customers: customers.total,
        pendingImports: imports.items.filter((item) =>
          ["pending", "validated", "importing"].includes(item.status),
        ).length,
        pendingNotes: notes.total,
        issuedInvoices: invoices.items.filter((invoice) => invoice.status === "issued").length,
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
  return (
    <div className="page dashboard-page dashboard-premium">
      <header className="dashboard-topbar dashboard-topbar--minimal">
        <h1>Resumen</h1>
      </header>

      {summary.isLoading && !isPreview ? (
        <DashboardSkeleton />
      ) : summary.isError && !isPreview ? (
        <div className="inline-error" role="alert">
          Error al cargar el resumen.
          <button type="button" onClick={() => void summary.refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <section className="result-card" aria-busy={summary.isLoading}>
          <div className="result-card__heading">
            <div>
              <span>Resultado de {monthLabel(selectedMonth)}</span>
              <strong className={result >= 0 ? "is-positive" : "is-negative"}>
                {data ? formatMoney(data.finance.balance) : "—"}
              </strong>
            </div>
            <label className="dashboard-month-picker dashboard-month-picker--ticket">
              <span className="sr-only">Mes del resumen</span>
              <span aria-hidden="true">{monthPickerLabel(selectedMonth)}</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => {
                  if (event.target.value) setSelectedMonth(event.target.value);
                }}
                aria-label="Mes del resumen"
              />
            </label>
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
            <span><strong>Nueva factura</strong></span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="dashboard-action dashboard-action--capture" to="/gastos/nuevo?captura=1">
            <Camera aria-hidden="true" />
            <span><strong>Registrar compra</strong></span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="dashboard-snapshot-grid" aria-label="Estado del negocio">
        <Link to="/ventas">
          <span><ReceiptText aria-hidden="true" /></span>
          <small>Facturas pendientes</small>
          <strong>{data ? formatMoney(data.finance.receivables) : "—"}</strong>
        </Link>
        <Link to="/ventas">
          <span><WalletCards aria-hidden="true" /></span>
          <small>Cobros vencidos</small>
          <strong>{data ? formatMoney(data.finance.overdueReceivables) : "—"}</strong>
        </Link>
        <Link to="/stock">
          <span><PackageSearch aria-hidden="true" /></span>
          <small>Stock disponible</small>
          <strong>{data?.finance.stockKg ?? "—"} kg</strong>
        </Link>
        <Link to="/gastos#gastos-fijos">
          <span><CalendarClock aria-hidden="true" /></span>
          <small>Gastos fijos</small>
          <strong>{data ? formatMoney(data.finance.recurring) : "—"}</strong>
        </Link>
      </section>

      <section className="dashboard-section attention-premium">
        <div className="dashboard-section__heading">
          <h2>Pendientes</h2>
        </div>
        <div className="attention-list">
          {summary.isLoading && !isPreview ? (
            <DashboardSkeleton rows={2} />
          ) : Number(data?.finance.overdueReceivables ?? 0) > 0 && (
            <Link to="/ventas" className="attention-row attention-row--danger">
              <CircleAlert aria-hidden="true" />
              <span><strong>{formatMoney(data?.finance.overdueReceivables ?? "0")} vencidos</strong></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {Boolean(data?.pendingNotes) && (
            <Link to="/ventas" className="attention-row">
              <FileText aria-hidden="true" />
              <span><strong>{data?.pendingNotes} albaranes sin facturar</strong></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {Boolean(data?.pendingImports) && (
            <Link to="/importar" className="attention-row">
              <CircleAlert aria-hidden="true" />
              <span><strong>{data?.pendingImports} importación pendiente</strong></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {!summary.isLoading && !Number(data?.finance.overdueReceivables ?? 0) && !data?.pendingNotes && !data?.pendingImports && (
            <p className="dashboard-all-clear">Sin pendientes</p>
          )}
        </div>
      </section>

      <section className="dashboard-section recent-premium">
        <div className="dashboard-section__heading">
          <h2>Actividad reciente</h2>
          <Link to="/ventas">Ver todas</Link>
        </div>
        <div className="premium-document-list">
          {summary.isLoading && !isPreview ? (
            <DashboardSkeleton rows={3} />
          ) : !data?.recentInvoices.length ? (
            <p className="empty-copy">Sin facturas</p>
          ) : null}
          {data?.recentInvoices.map((item) => (
            <Link key={item.id} to={`/ventas/facturas/${item.id}`}>
              <span className="document-symbol"><FileText aria-hidden="true" /></span>
              <span className="document-main">
                <strong>{item.contactLegalName}</strong>
                <small>{item.number ? `${item.series}-${item.number}` : "Borrador"} · {formatDate(item.issueDate)}</small>
              </span>
              <span className="document-amount">
                <strong>{formatMoney(item.total)}</strong>
                <small className={`payment-${item.paymentStatus ?? "unpaid"}`}>
                  {item.paymentStatus === "paid"
                    ? "Pagada"
                    : item.paymentStatus === "partial"
                      ? "Parcial"
                      : item.paymentStatus === "overdue"
                        ? "Vencida"
                        : "Pendiente"}
                </small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <details className="dashboard-insights">
        <summary><span><strong>Indicadores</strong></span><ArrowRight aria-hidden="true" /></summary>
        <div className="insight-grid">
          <article><span>Stock</span><strong>{data?.finance.stockKg ?? "—"} kg</strong><small>{data ? formatMoney(data.finance.potentialRevenue) : "—"} potencial</small></article>
          <article><span>Proveedores pendientes</span><strong>{data ? formatMoney(data.finance.payables) : "—"}</strong></article>
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

      <section className="dashboard-tools" aria-label="Herramientas">
        <Link to="/contactos/nuevo?tipo=customer"><Building2 aria-hidden="true" /><span>Nuevo cliente</span></Link>
        <Link to="/productos/nuevo"><Package aria-hidden="true" /><span>Nuevo producto</span></Link>
        <Link to="/stock"><TrendingUp aria-hidden="true" /><span>Stock</span></Link>
      </section>
    </div>
  );
}
