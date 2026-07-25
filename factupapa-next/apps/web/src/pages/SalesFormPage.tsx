import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  contactsApi,
  deliveryNotesApi,
  invoicesApi,
  pricingApi,
  productsApi,
  salesPreferencesApi,
} from "../api/services";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import {
  annualInvoiceSeries,
  formatQuantity,
  todayLocal,
} from "../utils/format";
import { bagLabel } from "../utils/packaging";
import { addCalendarDays, fortnightFor } from "../utils/invoice-period";

type DraftSalesLine = {
  clientId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  priceEdited: boolean;
  entryMode: "quantity" | "packages";
  packageQuantity: string;
};

function createDraftLine(): DraftSalesLine {
  return {
    clientId: crypto.randomUUID(),
    productId: "",
    quantity: "",
    unitPrice: "",
    priceEdited: false,
    entryMode: "quantity",
    packageQuantity: "",
  };
}

export function SalesFormPage() {
  const { user } = useAuth(),
    { kind } = useParams(),
    invoice = kind === "factura",
    nav = useNavigate(),
    [searchParams] = useSearchParams(),
    [contactId, setContactId] = useState(() => searchParams.get("contactId") ?? ""),
    [lines, setLines] = useState<DraftSalesLine[]>(() => [createDraftLine()]),
    [series, setSeries] = useState("A"),
    [issueDate, setIssueDate] = useState(todayLocal()),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [deliveryDates, setDeliveryDates] = useState<string[]>([]),
    [deliveryInput, setDeliveryInput] = useState(""),
    [due, setDue] = useState(""),
    [terms, setTerms] = useState(""),
    [info, setInfo] = useState(""),
    [includeTerms, setIncludeTerms] = useState(false);
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
    effectivePrices = useQuery({
      queryKey: ["sales-effective-prices", contactId],
      queryFn: () => pricingApi.list(contactId, { pageSize: 100 }),
      enabled: Boolean(contactId),
    }),
    prefix =
      prefs.data?.numberingMode === "live" ? prefs.data.invoicePrefix : "TEST";
  const draftKey = `factupapa:sales-draft:${user?.company.id ?? "unknown"}:${user?.id ?? "unknown"}:${invoice ? "invoice" : "delivery"}`;
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (!saved) return;
    try {
      const d = JSON.parse(saved) as Partial<{
        contactId: string;
        lines: DraftSalesLine[];
        issueDate: string;
        start: string;
        end: string;
        due: string;
        terms: string;
        info: string;
        includeTerms: boolean;
      }>;
      if (d.contactId) setContactId(d.contactId);
      if (d.lines?.length) setLines(d.lines);
      if (d.issueDate) setIssueDate(d.issueDate);
      if (d.start) setStart(d.start);
      if (d.end) setEnd(d.end);
      if (d.due) setDue(d.due);
      if (d.terms) setTerms(d.terms);
      if (d.info) setInfo(d.info);
      if (typeof d.includeTerms === "boolean") setIncludeTerms(d.includeTerms);
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey]);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            contactId,
            lines,
            issueDate,
            start,
            end,
            due,
            terms,
            info,
            includeTerms,
          }),
        ),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [contactId, lines, issueDate, start, end, due, terms, info, includeTerms, draftKey]);
  const selectedContact = contacts.data?.items.find((x) => x.id === contactId);
  useEffect(() => {
    if (!invoice) return;
    const applyTerms = Boolean(selectedContact?.applyInvoiceDefaults);
    setIncludeTerms(applyTerms);
    setTerms(applyTerms ? selectedContact?.paymentTermsText ?? "" : "");
    setInfo(
      applyTerms ? selectedContact?.defaultInvoiceInformation ?? "" : "",
    );
  }, [contactId, invoice, selectedContact]);
  useEffect(() => {
    if (!invoice || !includeTerms || !selectedContact?.paymentTermsDays) {
      setDue("");
      return;
    }
    if (selectedContact.paymentTermsDays > 0) {
      setDue(addCalendarDays(issueDate, selectedContact.paymentTermsDays));
    }
  }, [includeTerms, invoice, issueDate, selectedContact]);
  useEffect(() => {
    if (!invoice) return;
    if (selectedContact?.invoicePeriodMode === "fortnightly") {
      const period = fortnightFor(issueDate);
      setStart(period.start);
      setEnd(period.end);
    } else {
      setStart("");
      setEnd("");
    }
  }, [contactId, invoice, issueDate, selectedContact?.invoicePeriodMode]);
  useEffect(() => {
    if (!effectivePrices.data) return;
    setLines((current) =>
      current.map((line) => {
        if (!line.productId || line.priceEdited) return line;
        const priced = effectivePrices.data.items.find(
          (product) => product.id === line.productId,
        );
        return priced
          ? { ...line, unitPrice: formatQuantity(priced.effectivePrice) }
          : line;
      }),
    );
  }, [effectivePrices.data]);
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
            applyContactDefaults: includeTerms,
          })
        : await deliveryNotesApi.create({ contactId, series, issueDate });
      let result = d;
      for (const line of lines)
        result = invoice
          ? await invoicesApi.addLine(d.id, {
              productId: line.productId,
              quantity: line.quantity.replace(",", "."),
              unitPrice: line.unitPrice.replace(",", "."),
              ...(line.entryMode === "packages"
                ? { packageQuantity: line.packageQuantity.replace(",", ".") }
                : {}),
            })
          : await deliveryNotesApi.addLine(d.id, {
              productId: line.productId,
              quantity: line.quantity.replace(",", "."),
            });
      return result;
    },
    onSuccess: (d) => {
      localStorage.removeItem(draftKey);
      nav(`/ventas/${invoice ? "facturas" : "albaranes"}/${d.id}`);
    },
  });
  const invalidLine = lines.some((line) => {
    const amount = Number(
      (line.entryMode === "packages" ? line.packageQuantity : line.quantity).replace(",", "."),
    );
    const price = Number(line.unitPrice.replace(",", "."));
    return (
      !line.productId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !line.unitPrice ||
      !Number.isFinite(price) ||
      price < 0
    );
  });
  return (
    <div className="page form-page sales-form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/ventas" aria-label="Volver a facturas">
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
            required
          />
        </section>
        {invoice && (
          <section className="form-card">
            <h2>Periodo y pago</h2>
            {selectedContact?.invoicePeriodMode === "fortnightly" && (
              <div className="invoice-period-summary">
                <span>Periodo quincenal</span>
                <strong>{start} — {end}</strong>
                <small>Calculado automáticamente según la fecha de emisión.</small>
              </div>
            )}
            <label className="choice-row">
              <input
                type="checkbox"
                checked={includeTerms}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setIncludeTerms(checked);
                  setTerms(checked ? selectedContact?.paymentTermsText ?? "" : "");
                  setInfo(
                    checked
                      ? selectedContact?.defaultInvoiceInformation ?? ""
                      : "",
                  );
                }}
              />
              <span>
                <strong>Incluir condiciones de pago</strong>
                <small>Déjalo desactivado cuando el pago sea al momento.</small>
              </span>
            </label>
            {includeTerms && (
              <div className="conditional-fields">
                <Field
                  label="Fecha límite de pago"
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
                <label className="field">
                  <span>Condiciones y consecuencias del impago</span>
                  <textarea
                    rows={4}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                  />
                </label>
              </div>
            )}
            {selectedContact?.applyInvoiceDefaults && includeTerms && (
              <p className="field-help">
                Se han cargado las condiciones habituales de{" "}
                {selectedContact.tradeName || selectedContact.legalName}. Puedes
                corregirlas antes de revisar la factura.
              </p>
            )}
            <details className="form-options">
              <summary>Más opciones de la factura</summary>
              <div className="form-grid">
                <Field
                  label="Periodo desde"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
                <Field
                  label="Periodo hasta"
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
                  <Plus /> Añadir
                </button>
              </div>
              <div className="delivery-date-list">
                {deliveryDates.map((x) => (
                  <span key={x}>
                    {x}
                    <button
                      type="button"
                      aria-label={`Eliminar fecha de entrega ${x}`}
                      onClick={() =>
                        setDeliveryDates((dates) =>
                          dates.filter((date) => date !== x),
                        )
                      }
                    >
                      <X />
                    </button>
                  </span>
                ))}
              </div>
              <label className="field">
                <span>Información adicional (opcional)</span>
                <textarea
                  rows={3}
                  value={info}
                  onChange={(e) => setInfo(e.target.value)}
                />
              </label>
            </details>
          </section>
        )}
        <section className="form-card">
          <h2>Productos</h2>
          {lines.map((line, index) => {
            const selected = products.data?.items.find((x) => x.id === line.productId),
              hasPackaging = selected?.packageKind !== "none" && Boolean(selected?.unitsPerPackage),
              quantity = line.entryMode === "packages" && selected?.unitsPerPackage
                ? String(Number(line.packageQuantity.replace(",", ".")) * Number(selected.unitsPerPackage))
                : line.quantity.replace(",", "."),
              packaging = hasPackaging && quantity && Number.isFinite(Number(quantity))
                ? `${line.entryMode === "packages" ? line.packageQuantity : formatQuantity(String(Number(quantity) / Number(selected?.unitsPerPackage)))} ${selected?.packageLabel ?? "envases"} · ${formatQuantity(quantity)} ${selected?.unit}`
                : bagLabel(quantity, selected?.unit ?? "");
            return (
              <div className="sales-line-editor" key={line.clientId}>
                <SelectField
                  label={`Producto ${index + 1}`}
                  value={line.productId}
                  onChange={(e) => {
                    const productId = e.target.value;
                    const priced = effectivePrices.data?.items.find(
                      (product) => product.id === productId,
                    );
                    const product = products.data?.items.find(
                      (item) => item.id === productId,
                    );
                    setLines((current) =>
                      current.map((item, n) =>
                        n === index
                          ? {
                              ...item,
                              productId,
                              unitPrice: productId
                                ? formatQuantity(
                                    priced?.effectivePrice ??
                                      product?.salePrice ??
                                      "0",
                                  )
                                : "",
                              priceEdited: false,
                            }
                          : item,
                      ),
                    );
                  }}
                >
                  <option value="">Selecciona</option>
                  {products.data?.items.map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}
                </SelectField>
                {hasPackaging && (
                  <div className="segmented segmented--compact" role="group" aria-label="Cómo introducir la cantidad">
                    <button type="button" className={line.entryMode === "packages" ? "active" : ""}
                      onClick={() => setLines((current) => current.map((x,n) => n === index ? {...x,entryMode:"packages"} : x))}>
                      Por envases
                    </button>
                    <button type="button" className={line.entryMode === "quantity" ? "active" : ""}
                      onClick={() => setLines((current) => current.map((x,n) => n === index ? {...x,entryMode:"quantity"} : x))}>
                      Por {selected?.unit === "kg" ? "kg" : "cantidad"}
                    </button>
                  </div>
                )}
                {line.entryMode === "packages" && hasPackaging ? (
                  <Field
                    label={selected?.packageKind === "bag" ? "Número de bolsas" : "Número de envases"}
                    inputMode="decimal"
                    value={line.packageQuantity}
                    onChange={(e) => setLines((current) => current.map((x,n) => n === index ? {...x,packageQuantity:e.target.value} : x))}
                  />
                ) : (
                  <Field
                    label={selected?.unit === "kg" ? "Cantidad en kg" : "Cantidad"}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => setLines((current) => current.map((x, n) => n === index ? { ...x, quantity: e.target.value } : x))}
                  />
                )}
                <Field
                  label={`Precio sin IVA${selected?.unit === "kg" ? " por kg" : ""}`}
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(e) =>
                    setLines((current) =>
                      current.map((item, n) =>
                        n === index
                          ? {
                              ...item,
                              unitPrice: e.target.value,
                              priceEdited: true,
                            }
                          : item,
                      ),
                    )
                  }
                />
                {packaging && <p className="field-help">Equivale a {packaging}</p>}
                {lines.length > 1 && (
                  <button type="button" className="compact-action" onClick={() => setLines((current) => current.filter((_, n) => n !== index))}>
                    <X /> Quitar
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="compact-action" onClick={() => setLines((current) => [...current, createDraftLine()])}>
            <Plus /> Añadir producto
          </button>
        </section>
        {save.isError && (
          <div className="form-alert" role="alert">
            No se pudo guardar el borrador. Revisa cliente, cantidades y precios e inténtalo de nuevo.
          </div>
        )}
        <Button
          type="submit"
          icon={<Save />}
          busy={save.isPending}
          disabled={!contactId || !issueDate || invalidLine}
        >
          {invoice ? "Revisar factura" : "Crear albarán"}
        </Button>
      </form>
    </div>
  );
}
