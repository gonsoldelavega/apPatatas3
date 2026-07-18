import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FilePlus2, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { contactsApi, financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { PeriodPicker } from "../ui/PeriodPicker";
import { SelectField } from "../ui/SelectField";
import { formatMoney, formatQuantity } from "../utils/format";
import { currentPeriod, periodLabel, periodRange } from "../utils/period";
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
  const [period, setPeriod] = useState(currentPeriod()),
    [purchaseCategory, setPurchaseCategory] = useState(""),
    [purchaseSupplier, setPurchaseSupplier] = useState(""),
    [purchaseStatus, setPurchaseStatus] = useState(""),
    partialRange = periodRange(period),
    r =
      partialRange.from && partialRange.to
        ? { from: partialRange.from, to: partialRange.to }
        : (periodRange(currentPeriod()) as { from: string; to: string }),
    qc = useQueryClient(),
    purchases = useQuery({
      queryKey: ["purchases", r],
      queryFn: () => financeApi.purchases(r.from, r.to),
    }),
    recurring = useQuery({
      queryKey: ["recurring"],
      queryFn: financeApi.recurring,
    }),
    suppliers = useQuery({
      queryKey: ["suppliers"],
      queryFn: () =>
        contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
    });
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [taxRate, setTaxRate] = useState("0"),
    [chargeDay, setChargeDay] = useState("1"),
    [startsOn, setStartsOn] = useState(r.from),
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
        setStartsOn(r.from);
        setNotes("");
        setSupplierId("");
        setOpen(false);
        await qc.invalidateQueries({ queryKey: ["recurring"] });
      },
    }),
    remove = useMutation({
      mutationFn: financeApi.deactivateRecurring,
      onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
    });
  const periodMonths = monthsOf(r.from, r.to),
    recurringInMonth =
      recurring.data
        ?.map((x) => ({
          ...x,
          appliedMonths: periodMonths.filter((m) =>
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
          (!purchaseStatus || x.status === purchaseStatus),
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
        <p className="eyebrow">Compras y costes</p>
        <h1>Gastos</h1>
        <p>Facturas recibidas y cargos fijos mensuales.</p>
      </header>
      <section className="filter-card">
        <PeriodPicker value={period} onChange={setPeriod} />
      </section>
      <section className="expense-overview" aria-label="Resumen de gastos del periodo">
        <div>
          <span>Total del periodo</span>
          <strong>{formatMoney(String(purchaseTotal + recurringTotal))}</strong>
        </div>
        <dl>
          <div>
            <dt>Compras</dt>
            <dd>{formatMoney(String(purchaseTotal))}</dd>
          </div>
          <div>
            <dt>Fijos</dt>
            <dd>{formatMoney(String(recurringTotal))}</dd>
          </div>
        </dl>
      </section>
      <section className="filter-card">
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
          label="Estado"
          value={purchaseStatus}
          onChange={(e) => setPurchaseStatus(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="draft">Borrador</option>
          <option value="confirmed">Confirmada</option>
          <option value="cancelled">Cancelada</option>
        </SelectField>
      </section>
      <div className="finance-actions">
        <Link className="compact-action" to="/gastos/nuevo">
          <FilePlus2 />
          Registrar factura
        </Link>
        <button className="compact-action" onClick={() => setOpen(!open)}>
          <CalendarClock />
          Gasto fijo
        </button>
      </div>
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
      <section>
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
              </span>
              <strong className="entity-card__amount">
                {formatMoney(x.total)}
              </strong>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <span>
            <h2>Gastos mensuales</h2>
            <p>
              {recurringInMonth.length} cargos aplican en {periodLabel(period)}
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
      </section>
    </div>
  );
}
