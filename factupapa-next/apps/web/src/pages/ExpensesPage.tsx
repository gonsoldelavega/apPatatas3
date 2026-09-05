import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FilePlus2, Receipt, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { contactsApi, financeApi } from "../api/services";
import { ApiError } from "../api/client";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { PeriodPicker } from "../ui/PeriodPicker";
import { SelectField } from "../ui/SelectField";
import { formatMoney, formatQuantity } from "../utils/format";
import { currentPeriod, periodLabel, periodRange, shiftYearMonth } from "../utils/period";

const cats: Record<string, string> = {
  mercancia: "Mercancía",
  autonomo: "Cuota de autónomo",
  gestoria: "Gestoría",
  transporte: "Transporte",
  suministros: "Suministros",
  alquiler: "Alquiler",
  impuestos: "Impuestos",
  otros: "Otros",
};

const decimal = (value: string) => value.replace(",", ".");
const monthContains = (
  monthStart: string,
  monthEnd: string,
  startsOn: string,
  endsOn: string | null,
) => startsOn <= monthEnd && (!endsOn || endsOn >= monthStart);
const chargeLabel = (day: number) => `Día ${day}`;

function monthsOf(from: string, to: string) {
  const list: Array<{ start: string; end: string }> = [];
  let cursor = from.slice(0, 7);
  const last = to.slice(0, 7);
  while (cursor <= last && list.length < 12) {
    const year = Number(cursor.slice(0, 4));
    const monthNumber = Number(cursor.slice(5));
    list.push({
      start: `${cursor}-01`,
      end: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
    });
    cursor =
      monthNumber === 12
        ? `${year + 1}-01`
        : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  }
  return list;
}

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPeriod = {
    ...currentPeriod(
      (searchParams.get("period") as "all" | "month" | "quarter" | "year") || "all",
    ),
    month: searchParams.get("month") || currentPeriod("month").month,
    quarter: searchParams.get("quarter") || "1",
    year: searchParams.get("year") || currentPeriod("month").year,
  };
  const [period, setPeriod] = useState(initialPeriod);
  const [purchaseCategory, setPurchaseCategory] = useState(searchParams.get("category") || "");
  const [purchaseSupplier, setPurchaseSupplier] = useState(searchParams.get("supplier") || "");
  const [purchaseStatus, setPurchaseStatus] = useState(searchParams.get("status") || "");
  const [purchasePaymentStatus, setPurchasePaymentStatus] = useState(
    searchParams.get("payment") || "",
  );

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("period", period.kind);
    if (period.kind === "month") next.set("month", period.month);
    if (period.kind === "quarter") {
      next.set("quarter", period.quarter);
      next.set("year", period.year);
    }
    if (period.kind === "year") next.set("year", period.year);
    if (purchaseCategory) next.set("category", purchaseCategory);
    if (purchaseSupplier) next.set("supplier", purchaseSupplier);
    if (purchaseStatus) next.set("status", purchaseStatus);
    if (purchasePaymentStatus) next.set("payment", purchasePaymentStatus);
    setSearchParams(next, { replace: true });
  }, [
    period,
    purchaseCategory,
    purchaseSupplier,
    purchaseStatus,
    purchasePaymentStatus,
    setSearchParams,
  ]);

  const partialRange = periodRange(period);
  const purchaseRange =
    partialRange.from && partialRange.to
      ? { from: partialRange.from, to: partialRange.to }
      : null;
  const recurringRange = (purchaseRange ?? periodRange(currentPeriod())) as {
    from: string;
    to: string;
  };
  const qc = useQueryClient();

  const purchases = useQuery({
    queryKey: ["purchases", purchaseRange ?? "all"],
    queryFn: () => financeApi.purchases(purchaseRange?.from, purchaseRange?.to),
  });
  const recurring = useQuery({ queryKey: ["recurring"], queryFn: financeApi.recurring });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
  });
  const registryStatus = useQuery({
    queryKey: ["purchase-registry-status"],
    queryFn: financeApi.purchaseRegistryStatus,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [chargeDay, setChargeDay] = useState("1");
  const [startsOn, setStartsOn] = useState(recurringRange.from);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("gestoria");
  const [supplierId, setSupplierId] = useState("");

  const add = useMutation({
    mutationFn: () =>
      financeApi.createRecurring({
        supplierId: supplierId || null,
        name,
        category,
        amount: decimal(amount),
        taxRate: decimal(taxRate || "0"),
        chargeDay: Number(chargeDay),
        startsOn,
        endsOn: null,
        notes: notes || null,
      }),
    onSuccess: async () => {
      setName("");
      setAmount("");
      setTaxRate("0");
      setChargeDay("1");
      setStartsOn(recurringRange.from);
      setNotes("");
      setSupplierId("");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["recurring"] });
    },
  });

  const remove = useMutation({
    mutationFn: financeApi.deactivateRecurring,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const registrySync = useMutation({
    mutationFn: financeApi.syncPurchaseRegistry,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["purchases"] }),
        qc.invalidateQueries({ queryKey: ["suppliers"] }),
        qc.invalidateQueries({ queryKey: ["finance-summary"] }),
      ]);
    },
  });

  const periodMonths = purchaseRange ? monthsOf(purchaseRange.from, purchaseRange.to) : [];
  const recurringInMonth =
    recurring.data
      ?.map((item) => ({
        ...item,
        appliedMonths:
          period.kind === "all"
            ? Number(item.isActive)
            : periodMonths.filter((month) =>
                monthContains(month.start, month.end, item.startsOn, item.endsOn),
              ).length,
      }))
      .filter((item) => item.appliedMonths > 0) ?? [];
  const recurringTotal = recurringInMonth.reduce(
    (total, item) => total + Number(item.amount) * item.appliedMonths,
    0,
  );
  const filteredPurchases =
    purchases.data?.filter(
      (item) =>
        (!purchaseCategory || item.category === purchaseCategory) &&
        (!purchaseSupplier || item.supplierId === purchaseSupplier) &&
        (!purchaseStatus || item.status === purchaseStatus) &&
        (!purchasePaymentStatus || item.paymentStatus === purchasePaymentStatus),
    ) ?? [];
  const purchaseTotal = filteredPurchases.reduce(
    (total, item) => total + Number(item.total),
    0,
  );
  const formInvalid =
    !name.trim() ||
    !amount ||
    Number(decimal(amount)) <= 0 ||
    Number(decimal(taxRate || "0")) > 100 ||
    !Number.isInteger(Number(chargeDay)) ||
    Number(chargeDay) < 1 ||
    Number(chargeDay) > 28 ||
    !startsOn;

  return (
    <div className="page expenses-page">
      <header className="page-heading expenses-heading">
        <div>
          <p className="eyebrow">Control de costes</p>
          <h1>Compras y gastos</h1>
        </div>
        <Link className="primary-inline-action" to="/gastos/nuevo">
          <FilePlus2 aria-hidden="true" />
          Nueva compra
        </Link>
      </header>

      <nav className="business-tabs" aria-label="Secciones del negocio">
        <a className="active" href="#compras">Compras</a>
        <a href="#gastos-fijos">Gastos</a>
        <Link to="/catalogo/productos">Productos</Link>
        <Link to="/stock">Stock</Link>
      </nav>

      <section className="filter-card period-filter">
        <div className="month-quick-filter" aria-label="Mes rápido">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() =>
              setPeriod({ ...period, kind: "month", month: shiftYearMonth(period.month, -1) })
            }
          >
            ‹
          </button>
          <input
            aria-label="Seleccionar mes"
            type="month"
            value={period.month}
            onChange={(event) =>
              setPeriod({ ...period, kind: "month", month: event.target.value })
            }
          />
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() =>
              setPeriod({ ...period, kind: "month", month: shiftYearMonth(period.month, 1) })
            }
          >
            ›
          </button>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} allowAll hideMonthField />
      </section>

      <section className="expense-overview" aria-label="Resumen de gastos del periodo">
        <div>
          <span>Total del periodo</span>
          <strong>
            {formatMoney(
              String(purchaseTotal + (period.kind === "all" ? 0 : recurringTotal)),
            )}
          </strong>
        </div>
        <dl>
          <div><dt>Compras</dt><dd>{formatMoney(String(purchaseTotal))}</dd></div>
          <div>
            <dt>{period.kind === "all" ? "Fijos / mes" : "Fijos"}</dt>
            <dd>{formatMoney(String(recurringTotal))}</dd>
          </div>
        </dl>
      </section>

      <section className="purchase-ingestion-card" aria-labelledby="purchase-ingestion-title">
        <div className="purchase-ingestion-card__copy">
          <p className="eyebrow">Registro Maestro</p>
          <h2 id="purchase-ingestion-title">Compras automáticas supervisadas</h2>
          <p>
            Las facturas recibidas por correo o Drive se procesan fuera de la app y llegan al Registro Maestro. Factupapa importa únicamente las filas nuevas y evita duplicados.
          </p>
        </div>
        <div className="purchase-ingestion-card__actions">
          <button
            type="button"
            className="compact-action compact-action--strong"
            disabled={
              registrySync.isPending ||
              registryStatus.isLoading ||
              registryStatus.data?.configured !== true
            }
            onClick={() => registrySync.mutate()}
          >
            <RefreshCw className={registrySync.isPending ? "spin" : ""} />
            {registrySync.isPending ? "Importando…" : "Importar Registro Maestro"}
          </button>
          <Link className="compact-action" to="/gastos/nuevo">
            <FilePlus2 /> Registrar manualmente
          </Link>
        </div>
        <p className="purchase-ingestion-card__status">
          {registryStatus.isLoading
            ? "Comprobando conexión…"
            : registryStatus.data?.configured
              ? "Registro Maestro conectado."
              : "Registro Maestro no configurado en este entorno; la compra manual sigue disponible."}
        </p>
        {registrySync.data && (
          <p className="action-feedback" role="status">
            Registro sincronizado: {registrySync.data.imported} nuevas, {registrySync.data.skipped} ya existentes
            {registrySync.data.drafts
              ? ` y ${registrySync.data.drafts} pendientes de revisar`
              : ""}.
          </p>
        )}
        {registrySync.isError && (
          <p className="field-error" role="alert">
            {registrySync.error instanceof ApiError &&
            registrySync.error.code === "purchase_registry_not_configured"
              ? "No hay un Registro Maestro configurado."
              : "No se pudo leer el Registro Maestro. Comprueba que la fuente publicada siga disponible."}
          </p>
        )}
      </section>

      <details className="filter-sheet">
        <summary>Más filtros</summary>
        <section className="filter-card purchase-filters">
          <SelectField
            label="Categoría de compras"
            value={purchaseCategory}
            onChange={(event) => setPurchaseCategory(event.target.value)}
          >
            <option value="">Todas</option>
            {Object.entries(cats).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </SelectField>
          <SelectField
            label="Proveedor"
            value={purchaseSupplier}
            onChange={(event) => setPurchaseSupplier(event.target.value)}
          >
            <option value="">Todos</option>
            {suppliers.data?.items.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>
                {supplier.tradeName || supplier.legalName}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Estado del documento"
            value={purchaseStatus}
            onChange={(event) => setPurchaseStatus(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="draft">Borrador</option>
            <option value="confirmed">Confirmada</option>
            <option value="cancelled">Cancelada</option>
          </SelectField>
          <SelectField
            label="Estado del pago"
            value={purchasePaymentStatus}
            onChange={(event) => setPurchasePaymentStatus(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="unpaid">Pendiente</option>
            <option value="partial">Parcial</option>
            <option value="overdue">Vencida</option>
            <option value="paid">Pagada</option>
          </SelectField>
        </section>
      </details>

      <div className="finance-actions finance-actions--secondary">
        <button type="button" className="compact-action" onClick={() => setOpen(!open)}>
          <CalendarClock />
          {open ? "Cerrar gasto fijo" : "Añadir gasto fijo"}
        </button>
      </div>

      {open && (
        <section className="form-card recurring-expense-form">
          <div className="section-heading">
            <div><p className="eyebrow">Automático</p><h2>Nuevo gasto mensual</h2></div>
          </div>
          <Field label="Concepto" value={name} onChange={(event) => setName(event.target.value)} />
          <SelectField label="Categoría" value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(cats)
              .filter(([value]) => value !== "mercancia")
              .map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
          </SelectField>
          <SelectField
            label="Proveedor opcional"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">Sin proveedor</option>
            {suppliers.data?.items.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>
                {supplier.tradeName || supplier.legalName}
              </option>
            ))}
          </SelectField>
          <Field label="Importe mensual" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
          <div className="form-grid">
            <Field label="IVA" value={taxRate} inputMode="decimal" onChange={(event) => setTaxRate(event.target.value)} />
            <Field label="Día de cargo" type="number" min="1" max="28" value={chargeDay} onChange={(event) => setChargeDay(event.target.value)} />
          </div>
          <Field label="Activo desde" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
          <label className="field">
            <span>Notas privadas</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ej. domiciliado, revisar cada trimestre…"
            />
          </label>
          <Button disabled={formInvalid} busy={add.isPending} onClick={() => add.mutate()}>
            Guardar gasto fijo
          </Button>
        </section>
      )}

      <section id="compras">
        <div className="section-heading">
          <span>
            <h2>Facturas de compra</h2>
            <p>{filteredPurchases.length} facturas en el filtro</p>
          </span>
          <strong>{formatMoney(String(purchaseTotal))}</strong>
        </div>
        <div className="card-list">
          {filteredPurchases.map((purchase) => (
            <Link className="entity-card" to={`/gastos/${purchase.id}`} key={purchase.id}>
              <Receipt />
              <span className="entity-card__body">
                <strong>{purchase.supplierName}</strong>
                <small>{purchase.supplierInvoiceNumber || "Sin número"} · {purchase.issueDate}</small>
                <small>{cats[purchase.category] ?? purchase.category}</small>
                {purchase.status === "confirmed" && (
                  <small className={`payment-state payment-state--${purchase.paymentStatus}`}>
                    {({
                      unpaid: "Pendiente",
                      partial: "Pago parcial",
                      overdue: "Vencida",
                      paid: "Pagada",
                    } as const)[purchase.paymentStatus]}
                    {purchase.paymentStatus !== "paid"
                      ? ` · faltan ${formatMoney(purchase.balanceDue)}`
                      : ""}
                  </small>
                )}
              </span>
              <strong className="entity-card__amount">{formatMoney(purchase.total)}</strong>
            </Link>
          ))}
          {!purchases.isLoading && filteredPurchases.length === 0 && (
            <div className="expense-empty-state">
              <span className="expense-empty-state__icon"><Receipt /></span>
              <div>
                <strong>No hay compras en este filtro</strong>
                <p>Registra una compra o cambia el periodo y los filtros.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="gastos-fijos">
        <div className="section-heading">
          <span>
            <h2>Gastos mensuales</h2>
            <p>
              {period.kind === "all"
                ? `${recurringInMonth.length} gastos fijos activos`
                : `${recurringInMonth.length} cargos aplican en ${periodLabel(period)}`}
            </p>
          </span>
          <strong>{formatMoney(String(recurringTotal))}</strong>
        </div>
        <div className="card-list">
          {recurringInMonth.map((item) => (
            <article className="entity-card" key={item.id}>
              <CalendarClock />
              <span className="entity-card__body">
                <strong>{item.name}</strong>
                <small>
                  {cats[item.category] ?? item.category} · {chargeLabel(item.chargeDay)}
                  {item.supplierName ? ` · ${item.supplierName}` : ""}
                </small>
                <small>
                  Desde {item.startsOn}
                  {item.endsOn ? ` · hasta ${item.endsOn}` : ""}
                  {Number(item.taxRate) > 0 ? ` · IVA ${formatQuantity(item.taxRate)} %` : ""}
                </small>
                {item.notes && <small>{item.notes}</small>}
                {item.appliedMonths > 1 && <small>Aplica {item.appliedMonths} meses en el periodo</small>}
              </span>
              <strong>{formatMoney(String(Number(item.amount) * item.appliedMonths))}</strong>
              {item.isActive && (
                <button
                  type="button"
                  aria-label={`Desactivar ${item.name}`}
                  onClick={() =>
                    window.confirm("¿Desactivar este gasto mensual?") && remove.mutate(item.id)
                  }
                >
                  <Trash2 />
                </button>
              )}
            </article>
          ))}
          {!recurring.isLoading && recurringInMonth.length === 0 && (
            <div className="expense-empty-state">
              <span className="expense-empty-state__icon expense-empty-state__icon--fixed"><CalendarClock /></span>
              <div>
                <strong>{period.kind === "all" ? "No hay gastos fijos activos" : "No hay gastos mensuales en este periodo"}</strong>
                <p>Añade alquileres, cuotas o servicios para tenerlos controlados.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
