import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  contactsApi,
  deliveryNotesApi,
  invoicesApi,
  productsApi,
  salesPreferencesApi,
} from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { annualInvoiceSeries, todayLocal } from "../utils/format";
import { bagLabel } from "../utils/packaging";
export function SalesFormPage() {
  const { kind } = useParams(),
    invoice = kind === "factura",
    nav = useNavigate(),
    [contactId, setContactId] = useState(""),
    [productId, setProductId] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [series, setSeries] = useState("A"),
    [issueDate, setIssueDate] = useState(todayLocal()),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [deliveryDates, setDeliveryDates] = useState<string[]>([]),
    [deliveryInput, setDeliveryInput] = useState(""),
    [due, setDue] = useState(""),
    [terms, setTerms] = useState(""),
    [info, setInfo] = useState("");
  const prefs = useQuery({
      queryKey: ["sales-preferences"],
      queryFn: salesPreferencesApi.get,
      enabled: invoice,
    }),
    contacts = useQuery({
      queryKey: ["sales-customers"],
      queryFn: () => contactsApi.list({ isActive: true, pageSize: 100 }),
    }),
    products = useQuery({
      queryKey: ["sales-products"],
      queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
    }),
    prefix =
      prefs.data?.numberingMode === "live" ? prefs.data.invoicePrefix : "TEST";
  const selectedProduct = products.data?.items.find((x) => x.id === productId),
    packaging = bagLabel(quantity.replace(",", "."), selectedProduct?.unit ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const d = invoice
        ? await invoicesApi.create({
            contactId,
            series: annualInvoiceSeries(prefix, issueDate),
            issueDate,
            dueDate: due || null,
            operationStartDate: start || null,
            operationEndDate: end || null,
            deliveryDates,
            paymentTerms: terms || null,
            generalInformation: info || null,
          })
        : await deliveryNotesApi.create({ contactId, series, issueDate });
      return invoice
        ? invoicesApi.addLine(d.id, {
            productId,
            quantity: quantity.replace(",", "."),
          })
        : deliveryNotesApi.addLine(d.id, {
            productId,
            quantity: quantity.replace(",", "."),
          });
    },
    onSuccess: (d) =>
      nav(`/ventas/${invoice ? "facturas" : "albaranes"}/${d.id}`),
  });
  return (
    <div className="page form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/ventas">
          <ArrowLeft />
        </Link>
        <h1>{invoice ? "Nueva factura" : "Nuevo albarán"}</h1>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <section className="form-card">
          <SelectField
            label="Cliente"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">Selecciona</option>
            {contacts.data?.items
              .filter((x) => x.type !== "supplier")
              .map((x) => (
                <option value={x.id} key={x.id}>
                  {x.tradeName || x.legalName}
                </option>
              ))}
          </SelectField>
          {invoice ? (
            <div className="automatic-number">
              <span>
                {prefs.data?.numberingMode === "live"
                  ? "Numeración real"
                  : "Numeración de pruebas"}
              </span>
              <strong>
                Serie {prefix}/{issueDate.slice(0, 4)}
              </strong>
              <small>El número se asigna al emitir</small>
            </div>
          ) : (
            <Field
              label="Serie"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
            />
          )}
          <Field
            label="Fecha de emisión"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </section>
        {invoice && (
          <section className="form-card">
            <h2>Fechas y condiciones</h2>
            <div className="form-grid">
              <Field
                label="Operaciones desde"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <Field
                label="Operaciones hasta"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="delivery-date-editor">
              <Field
                label="Añadir fecha de entrega"
                type="date"
                value={deliveryInput}
                onChange={(e) => setDeliveryInput(e.target.value)}
              />
              <button
                type="button"
                className="compact-action"
                onClick={() => {
                  if (deliveryInput && !deliveryDates.includes(deliveryInput)) {
                    setDeliveryDates((x) => [...x, deliveryInput].sort());
                    setDeliveryInput("");
                  }
                }}
              >
                <Plus />
                Añadir
              </button>
            </div>
            <div className="delivery-date-list">
              {deliveryDates.map((x) => (
                <span key={x}>
                  {x}
                  <button
                    type="button"
                    onClick={() =>
                      setDeliveryDates((d) => d.filter((y) => y !== x))
                    }
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
            <Field
              label="Fecha de vencimiento"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
            <label className="field">
              <span>Condiciones de pago</span>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Información general</span>
              <textarea
                value={info}
                onChange={(e) => setInfo(e.target.value)}
              />
            </label>
          </section>
        )}
        <section className="form-card">
          <SelectField
            label="Producto"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Selecciona</option>
            {products.data?.items.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </SelectField>
          <Field
            label={selectedProduct?.unit === "kg" ? "Cantidad en kg" : "Cantidad"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {packaging && <p className="field-help">Equivale a {packaging}</p>}
        </section>
        <Button
          type="submit"
          icon={<Save />}
          busy={save.isPending}
          disabled={!contactId || !productId}
        >
          {invoice ? "Revisar factura" : "Crear albarán"}
        </Button>
      </form>
    </div>
  );
}
