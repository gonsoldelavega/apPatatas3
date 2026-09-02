import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FilePlus2, MailCheck, Receipt, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { contactsApi, financeApi, gmailApi } from "../api/services";
import { ApiError } from "../api/client";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { PeriodPicker } from "../ui/PeriodPicker";
import { SelectField } from "../ui/SelectField";
import { formatMoney, formatQuantity } from "../utils/format";
import { currentPeriod, periodLabel, periodRange, shiftYearMonth } from "../utils/period";
const cats: Record<string, string> = {
    autonomo: "Cuota de autónomo",
    gestoria: "Gestoría",
    transporte: "Transporte",
    suministros: "Suministros",
    alquiler: "Alquiler",
    impuestos: "Impuestos",
    otros: "Otros",
  };

const decimal = (value: string) => value.replace(",", "."),
  monthContains = (monthStart: string, monthEnd: string, startsOn: string, endsOn: string | null) =>
    startsOn <= monthEnd && (!endsOn || endsOn >= monthStart),
  chargeLabel = (day: number) => `Día ${day}`,
  monthsOf = (from: string, to: string) => {
    const list: Array<{ start: string; end: string }> = [];
    let cursor = from.slice(0, 7);
    const last = to.slice(0, 7);
    while (cursor <= last && list.length < 12) {
      const year = Number(cursor.slice(0, 4)),
        monthNumber = Number(cursor.slice(5));
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
  };

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPeriod = { ...currentPeriod((searchParams.get("period") as "all" | "month" | "quarter" | "year") || "all"), month: searchParams.get("month") || currentPeriod("month").month, quarter: searchParams.get("quarter") || "1", year: searchParams.get("year") || currentPeriod("month").year };
  const [period, setPeriod] = useState(initialPeriod),
    [purchaseCategory, setPurchaseCategory] = useState(searchParams.get("category") || ""),
    [purchaseSupplier, setPurchaseSupplier] = useState(searchParams.get("supplier") || ""),
    [purchaseStatus, setPurchaseStatus] = useState(searchParams.get("status") || ""),
    [purchasePaymentStatus, setPurchasePaymentStatus] = useState(searchParams.get("payment") || "");
  useEffect(() => {
      const next = new URLSearchParams(); next.set("period", period.kind);
      if (period.kind === "month") next.set("month", period.month);
      if (period.kind === "quarter") { next.set("quarter", period.quarter); next.set("year", period.year); }
      if (period.kind === "year") next.set("year", period.year);
      if (purchaseCategory) next.set("category", purchaseCategory);
      if (purchaseSupplier) next.set("supplier", purchaseSupplier);
      if (purchaseStatus) next.set("status", purchaseStatus);
      if (purchasePaymentStatus) next.set("payment", purchasePaymentStatus);
      setSearchParams(next, { replace: true });
    }, [period, purchaseCategory, purchaseSupplier, purchaseStatus, purchasePaymentStatus, setSearchParams]);
  const partialRange = periodRange(period),
    purchaseRange =
      partialRange.from && partialRange.to
        ? { from: partialRange.from, to: partialRange.to }
        : null,
    recurringRange = (purchaseRange ?? periodRange(currentPeriod())) as {
      from: string;
      to: string;
    },
    qc = useQueryClient(),
    purchases = useQuery({
      queryKey: ["purchases", purchaseRange ?? "all"],
      queryFn: () => financeApi.purchases(purchaseRange?.from, purchaseRange?.to),
    }),
    recurring = useQuery({
      queryKey: ["recurring"],
      queryFn: financeApi.recurring,
    }),
    suppliers = useQuery({
      queryKey: ["suppliers"],
      queryFn: () =>
        contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
    }),
    registryStatus = useQuery({
      queryKey: ["purchase-registry-status"],
      queryFn: financeApi.purchaseRegistryStatus,
    }),
    gmail = useQuery({
      queryKey: ["gmail-connection"],
      queryFn: gmailApi.status,
    }),
    inbox = useQuery({
      queryKey: ["pending-purchase-documents"],
      queryFn: financeApi.pendingPurchaseDocuments,
    }),
    rejectedDocuments = useQuery({
      queryKey: ["rejected-purchase-documents"],
      queryFn: financeApi.rejectedPurchaseDocuments,
    });
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [taxRate, setTaxRate] = useState("0"),
    [chargeDay, setChargeDay] = useState("1"),
    [startsOn, setStartsOn] = useState(recurringRange.from),
    [notes, setNotes] = useState(""),
    [category, setCategory] = useState("gestoria"),
    [supplierId, setSupplierId] = useState("");
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
    }),
    remove = useMutation({
      mutationFn: financeApi.deactivateRecurring,
      onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
    }),
    registrySync = useMutation({
      mutationFn: financeApi.syncPurchaseRegistry,
      onSuccess: async () => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["purchases"] }),
          qc.invalidateQueries({ queryKey: ["suppliers"] }),
          qc.invalidateQueries({ queryKey: ["finance-summary"] }),
        ]);
      },
    }),
    gmailSync = useMutation({
      mutationFn: gmailApi.sync,
      onSuccess: async () => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["pending-purchase-documents"] }),
          qc.invalidateQueries({ queryKey: ["gmail-connection"] }),
        ]);
      },
    }),
    restoreDocument = useMutation({
      mutationFn: financeApi.restoreRejectedPurchaseDocument,
      onSuccess: async () => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["pending-purchase-documents"] }),
          qc.invalidateQueries({ queryKey: ["rejected-purchase-documents"] }),
        ]);
      },
    });
  const periodMonths = purchaseRange
      ? monthsOf(purchaseRange.from, purchaseRange.to)
      : [],
    recurringInMonth =
      recurring.data
        ?.map((x) => ({
          ...x,
          appliedMonths:
            period.kind === "all"
              ? Number(x.isActive)
              : periodMonths.filter((m) =>
                  monthContains(m.start, m.end, x.startsOn, x.endsOn),
                ).length,
        }))
        .filter((x) => x.appliedMonths > 0) ?? [],
    recurringTotal = recurringInMonth.reduce(
      (total, x) => total + Number(x.amount) * x.appliedMonths,
      0,
    ),
    filteredPurchases =
      purchases.data?.filter(
        (x) =>
          (!purchaseCategory || x.category === purchaseCategory) &&
          (!purchaseSupplier || x.supplierId === purchaseSupplier) &&
          (!purchaseStatus || x.status === purchaseStatus) &&
          (!purchasePaymentStatus || x.paymentStatus === purchasePaymentStatus),
      ) ?? [],
    purchaseTotal = filteredPurchases.reduce((total, x) => total + Number(x.total), 0),
    formInvalid =
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
      <header className="page-heading">
        <h1>Compras y gastos</h1>
      </header>
      <nav className="business-tabs" aria-label="Secciones del negocio">
        <a className="active" href="#compras">Compras</a>
        <a href="#gastos-fijos">Gastos</a>
        <Link to="/catalogo/productos">Productos</Link>
        <Link to="/stock">Stock</Link>
      </nav>
      <section className="filter-card period-filter">
        <div className="month-quick-filter" aria-label="Mes rápido">
          <button type="button" aria-label="Mes anterior" onClick={() => setPeriod({ ...period, kind: "month", month: shiftYearMonth(period.month, -1) })}>‹</button>
          <input aria-label="Seleccionar mes" type="month" value={period.month} onChange={(e) => setPeriod({ ...period, kind: "month", month: e.target.value })} />
          <button type="button" aria-label="Mes siguiente" onClick={() => setPeriod({ ...period, kind: "month", month: shiftYearMonth(period.month, 1) })}>›</button>
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
          <div>
            <dt>Compras</dt>
            <dd>{formatMoney(String(purchaseTotal))}</dd>
          </div>
          <div>
            <dt>{period.kind === "all" ? "Fijos / mes" : "Fijos"}</dt>
            <dd>{formatMoney(String(recurringTotal))}</dd>
          </div>
        </dl>
      </section>
      {(gmail.data?.connected || Boolean(inbox.data?.length)) && (
        <section id="recibidas-gmail" className="gmail-purchase-inbox" aria-labelledby="gmail-purchase-title">
          <div className="section-heading">
            <span>
              <h2 id="gmail-purchase-title">Recibidas por Gmail</h2>
              <p>
                {inbox.data?.length ?? 0} factura{inbox.data?.length === 1 ? "" : "s"} pendiente{inbox.data?.length === 1 ? "" : "s"} de revisar
              </p>
            </span>
            {gmail.data?.canRead ? (
              <button
                type="button"
                className="gmail-sync-button"
                disabled={gmailSync.isPending}
                onClick={() => gmailSync.mutate()}
              >
                <RefreshCw className={gmailSync.isPending ? "spin" : ""} />
                {gmailSync.isPending ? "Buscando…" : "Revisar ahora"}
              </button>
            ) : (
              <Link className="gmail-sync-button" to="/mas#integraciones">
                Autorizar Gmail
              </Link>
            )}
          </div>
          <div className="gmail-inbox-list">
            {inbox.data?.slice(0, 6).map((document) => {
              const extracted = document.extractedData as {
                supplierName?: string;
                supplierInvoiceNumber?: string;
                total?: string;
              };
              return (
                <Link
                  className="gmail-inbox-card"
                  to={`/gastos/nuevo?document=${document.id}`}
                  key={document.id}
                >
                  <MailCheck aria-hidden="true" />
                  <span>
                    <strong>{extracted.supplierName || document.subject || document.filename}</strong>
                    <small>
                      {extracted.supplierInvoiceNumber || document.senderEmail || "Adjunto recibido"}
                    </small>
                  </span>
                  <strong>{extracted.total ? formatMoney(extracted.total) : "Revisar"}</strong>
                </Link>
              );
            })}
          </div>
          {gmailSync.data && (
            <p className="action-feedback" role="status">
              Gmail revisado: {gmailSync.data.messagesScanned} correos, {gmailSync.data.ignored} ignorados, {gmailSync.data.autoImported} importados automáticamente, {gmailSync.data.review} para revisar y {gmailSync.data.duplicates} duplicados.
            </p>
          )}
          {gmailSync.isError && (
            <p className="field-error" role="alert">
              No se pudo revisar Gmail. Vuelve a autorizar la cuenta desde Otros si el permiso ha caducado.
            </p>
          )}
        </section>
      )}
      {Boolean(rejectedDocuments.data?.length) && (
        <details className="purchase-document-trash">
          <summary>
            <span><Trash2 aria-hidden="true" /> Descartadas</span>
            <strong>{rejectedDocuments.data?.length}</strong>
          </summary>
          <div className="purchase-document-trash__list">
            {rejectedDocuments.data?.map((document) => {
              const extracted = document.extractedData as { supplierName?: string };
              return (
                <article key={document.id}>
                  <span>
                    <strong>{extracted.supplierName || document.subject || document.filename}</strong>
                    <small>{document.filename}</small>
                  </span>
                  <button
                    type="button"
                    disabled={restoreDocument.isPending}
                    onClick={() => restoreDocument.mutate(document.id)}
                  >
                    <RotateCcw aria-hidden="true" /> Restaurar
                  </button>
                </article>
              );
            })}
          </div>
          {restoreDocument.isError && (
            <p className="field-error" role="alert">No se pudo restaurar el documento.</p>
          )}
        </details>
      )}
      <details className="filter-sheet">
        <summary>Más filtros</summary>
      <section className="filter-card purchase-filters">
        <SelectField
          label="Categoría de compras"
          value={purchaseCategory}
          onChange={(e) => setPurchaseCategory(e.target.value)}
        >
          <option value="">Todas</option>
          {Object.entries(cats).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Proveedor"
          value={purchaseSupplier}
          onChange={(e) => setPurchaseSupplier(e.target.value)}
        >
          <option value="">Todos</option>
          {suppliers.data?.items.map((x) => (
            <option value={x.id} key={x.id}>
              {x.tradeName || x.legalName}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Estado del documento"
          value={purchaseStatus}
          onChange={(e) => setPurchaseStatus(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="draft">Borrador</option>
          <option value="confirmed">Confirmada</option>
          <option value="cancelled">Cancelada</option>
        </SelectField>
        <SelectField
          label="Estado del pago"
          value={purchasePaymentStatus}
          onChange={(e) => setPurchasePaymentStatus(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="unpaid">Pendiente</option>
          <option value="partial">Parcial</option>
          <option value="overdue">Vencida</option>
          <option value="paid">Pagada</option>
        </SelectField>
      </section>
      </details>
      <div className="finance-actions">
        <Link className="compact-action" to="/gastos/nuevo">
          <FilePlus2 />
          Registrar factura
        </Link>
        <button
          type="button"
          className="compact-action"
          onClick={() => setOpen(!open)}
        >
          <CalendarClock />
          Gasto fijo
        </button>
        <button
          type="button"
          className="compact-action"
          disabled={
            registrySync.isPending ||
            registryStatus.isLoading ||
            registryStatus.data?.configured !== true
          }
          onClick={() => registrySync.mutate()}
        >
          <RefreshCw className={registrySync.isPending ? "spin" : ""} />
          {registrySync.isPending ? "Importando…" : "Importar registro Drive"}
        </button>
      </div>
      <details className="drive-sync-help">
        <summary>¿Qué hace el registro de Drive?</summary>
        <p>
          Importa compras nuevas desde una hoja o CSV maestro preparado para
          FactuPapa. No sube tus facturas a Drive ni lee tus carpetas personales.
        </p>
        {registryStatus.data?.configured === false && (
          <p className="drive-sync-help__state">
            No hay ningún registro maestro configurado, por eso la importación
            está desactivada. Puedes seguir cargando facturas con foto o archivo.
          </p>
        )}
        {registryStatus.data?.configured === true && (
          <p className="drive-sync-help__state">
            Registro conectado. El botón busca filas nuevas y evita duplicados.
          </p>
        )}
      </details>
      {registrySync.data && (
        <p className="action-feedback" role="status">
          Registro sincronizado: {registrySync.data.imported} nuevas,{" "}
          {registrySync.data.skipped} ya existentes
          {registrySync.data.drafts
            ? ` y ${registrySync.data.drafts} pendientes de revisar`
            : ""}.
        </p>
      )}
      {registrySync.isError && (
        <p className="field-error" role="alert">
          {registrySync.error instanceof ApiError &&
          registrySync.error.code === "purchase_registry_not_configured"
            ? "No hay un registro maestro configurado."
            : "No se pudo leer el registro maestro de Drive. Comprueba que la hoja publicada siga disponible."}
        </p>
      )}
      {open && (
        <section className="form-card">
          <h2>Nuevo gasto mensual</h2>
          <Field
            label="Concepto"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <SelectField
            label="Categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(cats).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Proveedor opcional"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Sin proveedor</option>
            {suppliers.data?.items.map((x) => (
              <option value={x.id} key={x.id}>
                {x.tradeName || x.legalName}
              </option>
            ))}
          </SelectField>
          <Field
            label="Importe mensual"
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="form-grid">
            <Field
              label="IVA"
              value={taxRate}
              inputMode="decimal"
              onChange={(e) => setTaxRate(e.target.value)}
            />
            <Field
              label="Día de cargo"
              type="number"
              min="1"
              max="28"
              value={chargeDay}
              onChange={(e) => setChargeDay(e.target.value)}
            />
          </div>
          <Field
            label="Activo desde"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <label className="field">
            <span>Notas privadas</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. domiciliado, revisar cada trimestre..."
            />
          </label>
          <Button
            disabled={formInvalid}
            busy={add.isPending}
            onClick={() => add.mutate()}
          >
            Guardar
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
          {filteredPurchases.map((x) => (
            <Link className="entity-card" to={`/gastos/${x.id}`} key={x.id}>
              <Receipt />
              <span className="entity-card__body">
                <strong>{x.supplierName}</strong>
                <small>
                  {x.supplierInvoiceNumber || "Sin número"} · {x.issueDate}
                </small>
                <small>{cats[x.category] ?? x.category}</small>
                {x.status === "confirmed" && (
                  <small className={`payment-state payment-state--${x.paymentStatus}`}>
                    {({
                      unpaid: "Pendiente",
                      partial: "Pago parcial",
                      overdue: "Vencida",
                      paid: "Pagada",
                    } as const)[x.paymentStatus]}
                    {x.paymentStatus !== "paid"
                      ? ` · faltan ${formatMoney(x.balanceDue)}`
                      : ""}
                  </small>
                )}
              </span>
              <strong className="entity-card__amount">
                {formatMoney(x.total)}
              </strong>
            </Link>
          ))}
          {!purchases.isLoading && filteredPurchases.length === 0 && (
            <div className="expense-empty-state">
              <span className="expense-empty-state__icon">
                <Receipt />
              </span>
              <div>
                <strong>Aún no hay facturas de compra</strong>
                <p>
                  Registra una factura o cambia los filtros para ver otros resultados.
                </p>
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
        {recurringInMonth.map((x) => (
            <article className="entity-card" key={x.id}>
              <CalendarClock />
              <span className="entity-card__body">
                <strong>{x.name}</strong>
                <small>
                  {cats[x.category]} · {chargeLabel(x.chargeDay)}
                  {x.supplierName ? ` · ${x.supplierName}` : ""}
                </small>
                <small>
                  Desde {x.startsOn}
                  {x.endsOn ? ` · hasta ${x.endsOn}` : ""}
                  {Number(x.taxRate) > 0 ? ` · IVA ${formatQuantity(x.taxRate)} %` : ""}
                </small>
                {x.notes && <small>{x.notes}</small>}
                {x.appliedMonths > 1 && (
                  <small>Aplica {x.appliedMonths} meses en el periodo</small>
                )}
              </span>
              <strong>
                {formatMoney(String(Number(x.amount) * x.appliedMonths))}
              </strong>
              {x.isActive && (
                <button
                  aria-label={`Desactivar ${x.name}`}
                  onClick={() =>
                    window.confirm("¿Desactivar este gasto mensual?") &&
                    remove.mutate(x.id)
                  }
                >
                  <Trash2 />
                </button>
              )}
            </article>
          ))}
        {!recurring.isLoading && recurringInMonth.length === 0 && (
          <div className="expense-empty-state">
            <span className="expense-empty-state__icon expense-empty-state__icon--fixed">
              <CalendarClock />
            </span>
            <div>
              <strong>
                {period.kind === "all"
                  ? "No hay gastos fijos activos"
                  : "No hay gastos mensuales en este periodo"}
              </strong>
              <p>
                Añade alquileres, cuotas o servicios para tenerlos siempre controlados.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
