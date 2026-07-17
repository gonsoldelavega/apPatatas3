import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FilePlus2, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { contactsApi, financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { formatMoney, todayLocal } from "../utils/format";
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
export function ExpensesPage() {
  const [month, setMonth] = useState(todayLocal().slice(0, 7)),
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
    [category, setCategory] = useState("gestoria"),
    [supplierId, setSupplierId] = useState("");
  const add = useMutation({
      mutationFn: () =>
        financeApi.createRecurring({
          supplierId: supplierId || null,
          name,
          category,
          amount,
          taxRate: "0",
          chargeDay: 1,
          startsOn: `${month}-01`,
          endsOn: null,
          notes: null,
        }),
      onSuccess: async () => {
        setOpen(false);
        await qc.invalidateQueries({ queryKey: ["recurring"] });
      },
    }),
    remove = useMutation({
      mutationFn: financeApi.deactivateRecurring,
      onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
    });
  return (
    <div className="page">
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
          <Button
            disabled={!name || !amount}
            busy={add.isPending}
            onClick={() => add.mutate()}
          >
            Guardar
          </Button>
        </section>
      )}
      <section>
        <h2>Facturas de compra</h2>
        <div className="card-list">
          {purchases.data?.map((x) => (
            <Link className="entity-card" to={`/gastos/${x.id}`} key={x.id}>
              <Receipt />
              <span className="entity-card__body">
                <strong>{x.supplierName}</strong>
                <small>
                  {x.supplierInvoiceNumber || "Sin número"} · {x.issueDate}
                </small>
              </span>
              <strong>{formatMoney(x.total)}</strong>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h2>Gastos mensuales</h2>
        {recurring.data
          ?.filter((x) => x.isActive)
          .map((x) => (
            <article className="entity-card" key={x.id}>
              <CalendarClock />
              <span className="entity-card__body">
                <strong>{x.name}</strong>
                <small>{cats[x.category]}</small>
              </span>
              <strong>{formatMoney(x.amount)}</strong>
              <button
                aria-label={`Desactivar ${x.name}`}
                onClick={() => remove.mutate(x.id)}
              >
                <Trash2 />
              </button>
            </article>
          ))}
      </section>
    </div>
  );
}
