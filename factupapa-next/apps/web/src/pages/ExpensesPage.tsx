import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FilePlus2, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { contactsApi, financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { formatMoney, formatQuantity, todayLocal } from "../utils/format";
const range = (m: string) => ({
    from: `${m}-01`,
    to: new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0))
      .toISOString()
      .slice(0, 10),
  }),
  cats: Record<string, string> = {
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
  chargeLabel = (day: number) => `Día ${day}`;

export function ExpensesPage() {
  const [month, setMonth] = useState(todayLocal().slice(0, 7)),
    [purchaseCategory, setPurchaseCategory] = useState(""),
    [purchaseSupplier, setPurchaseSupplier] = useState(""),
    r = range(month),
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
    [startsOn, setStartsOn] = useState(`${month}-01`),
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
        setStartsOn(`${month}-01`);
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
  const recurringInMonth =
      recurring.data?.filter((x) => monthContains(r.from, r.to, x.startsOn, x.endsOn)) ?? [],
    recurringTotal = recurringInMonth.reduce((total, x) => total + Number(x.amount), 0),
    filteredPurchases =
      purchases.data?.filter(
        (x) =>
          (!purchaseCategory || x.category === purchaseCategory) &&
          (!purchaseSupplier || x.supplierId === purchaseSupplier),
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
      <Field
        label="Mes"
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
      <section className="expense-overview" aria-label="Resumen de gastos del mes">
        <div>
          <span>Total del mes</span>
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
            <p>{recurringInMonth.length} cargos aplican en {month}</p>
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
              </span>
              <strong>{formatMoney(x.amount)}</strong>
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
