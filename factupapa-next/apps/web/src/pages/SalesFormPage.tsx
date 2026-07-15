import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  contactsApi,
  deliveryNotesApi,
  invoicesApi,
  productsApi,
} from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { todayLocal } from "../utils/format";
export function SalesFormPage() {
  const { kind } = useParams(),
    invoice = kind === "factura",
    navigate = useNavigate();
  const [contactId, setContactId] = useState(""),
    [productId, setProductId] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [series, setSeries] = useState(invoice ? "F" : "A"),
    [issueDate, setIssueDate] = useState(todayLocal());
  const contacts = useQuery({
      queryKey: ["sales-customers"],
      queryFn: () => contactsApi.list({ isActive: true, pageSize: 100 }),
    }),
    products = useQuery({
      queryKey: ["sales-products"],
      queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
    });
  const save = useMutation({
    mutationFn: async () => {
      const document = invoice
        ? await invoicesApi.create({ contactId, series, issueDate })
        : await deliveryNotesApi.create({ contactId, series, issueDate });
      return invoice
        ? invoicesApi.addLine(document.id, {
            productId,
            quantity: quantity.replace(",", "."),
          })
        : deliveryNotesApi.addLine(document.id, {
            productId,
            quantity: quantity.replace(",", "."),
          });
    },
    onSuccess: (document) =>
      navigate(`/ventas/${invoice ? "facturas" : "albaranes"}/${document.id}`, {
        replace: true,
      }),
  });
  return (
    <div className="page form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/ventas" aria-label="Volver">
          <ArrowLeft />
        </Link>
        <div>
          <p className="eyebrow">Nuevo borrador</p>
          <h1>{invoice ? "Nueva factura" : "Nuevo albarán"}</h1>
        </div>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (contactId && productId) save.mutate();
        }}
      >
        <section className="form-card">
          <h2>Documento</h2>
          <SelectField
            label="Cliente"
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            required
          >
            <option value="">Selecciona un cliente</option>
            {contacts.data?.items
              .filter((contact) => contact.type !== "supplier")
              .map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.tradeName || contact.legalName}
                </option>
              ))}
          </SelectField>
          <div className="form-grid">
            <Field
              label="Serie"
              value={series}
              onChange={(event) => setSeries(event.target.value)}
              required
            />
            <Field
              label="Fecha"
              type="date"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
              required
            />
          </div>
        </section>
        <section className="form-card">
          <h2>Primera línea</h2>
          <SelectField
            label="Producto"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            required
          >
            <option value="">Selecciona un producto</option>
            {products.data?.items.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Cantidad"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </section>
        {save.isError && (
          <div className="form-alert" role="alert">
            No se ha podido crear el borrador. Revisa cliente, producto y
            cantidad.
          </div>
        )}
        <div className="sticky-submit">
          <Button
            type="submit"
            icon={<Save />}
            busy={save.isPending}
            disabled={!contactId || !productId}
          >
            Crear borrador
          </Button>
        </div>
      </form>
    </div>
  );
}
