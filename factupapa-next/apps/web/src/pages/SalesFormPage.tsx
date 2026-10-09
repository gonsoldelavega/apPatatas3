import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Printer, Repeat, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Invoice } from "../api/types";
import {
  contactsApi,
  deliveryNotesApi,
  invoicesApi,
  pricingApi,
  productsApi,
  salesPreferencesApi,
} from "../api/services";
import { apiClient, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import {
  annualInvoiceSeries,
  formatDocumentNumber,
  formatMoney,
  formatQuantity,
  todayLocal,
} from "../utils/format";
import { bagLabel } from "../utils/packaging";
import { addCalendarDays, fortnightFor } from "../utils/invoice-period";
import { STANDARD_PAYMENT_DAYS } from "../utils/payment-terms";

type InvoiceMode = "single" | "fortnightly";

type DraftSalesLine = {
  clientId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  priceEdited: boolean;
  entryMode: "quantity" | "packages";
  packageQuantity: string;
  deliveryDate: string;
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
    deliveryDate: todayLocal(),
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
    [deliveryNotes, setDeliveryNotes] = useState(""),
    [invoiceNumber, setInvoiceNumber] = useState(""),
    [invoiceNumberEdited, setInvoiceNumberEdited] = useState(false),
    [issueDate, setIssueDate] = useState(todayLocal()),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("single"),
    [due, setDue] = useState(() => addCalendarDays(todayLocal(), STANDARD_PAYMENT_DAYS)),
    [includePaymentTerms, setIncludePaymentTerms] = useState(false),
    [terms, setTerms] = useState(""),
    [info, setInfo] = useState("");
  const deliverySeries = `ALB_${issueDate.slice(0, 4)}`;
  const [repeatMessage, setRepeatMessage] = useState<string | null>(null);

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
    prefix = prefs.data?.numberingMode === "live" ? prefs.data.invoicePrefix : "TEST",
    invoiceSeries = annualInvoiceSeries(prefix, issueDate),
    numberPreview = useQuery({
      queryKey: ["invoice-number-preview", invoiceSeries, issueDate],
      queryFn: () =>
        apiClient.request<{ series: string; number: number }>(
          `/invoices/number-preview?series=${encodeURIComponent(invoiceSeries)}&issueDate=${encodeURIComponent(issueDate)}`,
        ),
      enabled: invoice && Boolean(prefs.data) && Boolean(issueDate),
    }),
    deliveryNumberPreview = useQuery({
      queryKey: ["delivery-number-preview", deliverySeries],
      queryFn: () => deliveryNotesApi.numberPreview(deliverySeries),
      enabled: !invoice && issueDate.length >= 4,
    });

  const draftKey = `factupapa:sales-draft:${user?.company.id ?? "unknown"}:${user?.id ?? "unknown"}:${invoice ? "invoice" : "delivery"}`;

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (!saved) return;
    try {
      const d = JSON.parse(saved) as Partial<{
        contactId: string;
        lines: DraftSalesLine[];
        invoiceNumber: string;
        invoiceNumberEdited: boolean;
        issueDate: string;
        start: string;
        end: string;
        due: string;
        includePaymentTerms: boolean;
        terms: string;
        info: string;
        invoiceMode: InvoiceMode;
      }>;
      if (d.contactId) setContactId(d.contactId);
      if (d.lines?.length)
        setLines(d.lines.map((line) => ({ ...line, deliveryDate: line.deliveryDate || todayLocal() })));
      if (d.invoiceNumber) setInvoiceNumber(d.invoiceNumber);
      if (typeof d.invoiceNumberEdited === "boolean") setInvoiceNumberEdited(d.invoiceNumberEdited);
      if (d.issueDate) setIssueDate(d.issueDate);
      if (d.start) setStart(d.start);
      if (d.end) setEnd(d.end);
      if (typeof d.includePaymentTerms === "boolean") setIncludePaymentTerms(d.includePaymentTerms);
      if (d.due) setDue(d.due);
      if (d.terms) setTerms(d.terms);
      if (d.info) setInfo(d.info);
      if (d.invoiceMode) setInvoiceMode(d.invoiceMode);
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!invoice || invoiceNumberEdited || !numberPreview.data) return;
    setInvoiceNumber(String(numberPreview.data.number));
  }, [invoice, invoiceNumberEdited, numberPreview.data]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            contactId,
            lines,
            invoiceNumber,
            invoiceNumberEdited,
            issueDate,
            start,
            end,
            due,
            includePaymentTerms,
            terms,
            info,
            invoiceMode,
          }),
        ),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [contactId, lines, invoiceNumber, invoiceNumberEdited, issueDate, start, end, due, includePaymentTerms, terms, info, invoiceMode, draftKey]);

  const selectedContact = contacts.data?.items.find((x) => x.id === contactId);

  useEffect(() => {
    if (!invoice) return;
    const apply = Boolean(selectedContact?.applyInvoiceDefaults);
    setIncludePaymentTerms(apply);
    setTerms(apply ? selectedContact?.paymentTermsText ?? "" : "");
    setInfo(selectedContact?.applyInvoiceDefaults ? selectedContact.defaultInvoiceInformation ?? "" : "");
  }, [contactId, invoice, selectedContact]);

  useEffect(() => {
    if (!invoice) return;
    if (!includePaymentTerms) {
      setDue("");
      return;
    }
    const days = selectedContact?.paymentTermsDays || STANDARD_PAYMENT_DAYS;
    setDue(addCalendarDays(issueDate, days));
  }, [invoice, issueDate, includePaymentTerms, selectedContact?.paymentTermsDays]);

  useEffect(() => {
    if (!invoice) return;
    setInvoiceMode(selectedContact?.invoicePeriodMode === "fortnightly" ? "fortnightly" : "single");
  }, [contactId, invoice, selectedContact?.invoicePeriodMode]);

  useEffect(() => {
    if (!invoice) return;
    if (invoiceMode === "fortnightly") {
      const period = fortnightFor(issueDate);
      setStart(period.start);
      setEnd(period.end);
    } else {
      setStart("");
      setEnd("");
    }
  }, [invoice, invoiceMode, issueDate]);

  useEffect(() => {
    if (!effectivePrices.data) return;
    setLines((current) =>
      current.map((line) => {
        if (!line.productId || line.priceEdited) return line;
        const priced = effectivePrices.data.items.find((product) => product.id === line.productId);
        return priced ? { ...line, unitPrice: formatQuantity(priced.effectivePrice) } : line;
      }),
    );
  }, [effectivePrices.data]);

  const parsedInvoiceNumber = Number(invoiceNumber);
  const invoiceNumberInvalid = invoice && (!Number.isInteger(parsedInvoiceNumber) || parsedInvoiceNumber < 1);

  const repeatLast = useMutation({
    mutationFn: async () => {
      const page = await deliveryNotesApi.list({ contactId, pageSize: 10 });
      const last = page.items.find((note) => note.status === "issued" || note.status === "invoiced");
      return last ? deliveryNotesApi.get(last.id) : null;
    },
    onSuccess: (note) => {
      if (!note?.lines?.length) {
        setRepeatMessage("Este cliente aún no tiene albaranes anteriores.");
        return;
      }
      setLines(
        note.lines.map((line) => {
          const priced = effectivePrices.data?.items.find((product) => product.id === line.productId);
          return {
            ...createDraftLine(),
            productId: line.productId ?? "",
            quantity: formatQuantity(line.quantity),
            unitPrice: formatQuantity(priced?.effectivePrice ?? line.unitPrice),
          };
        }),
      );
      setRepeatMessage(
        `Cargado el pedido de ${formatDocumentNumber(note.series, note.number)}. Cambia las cantidades si hoy piden otra cosa.`,
      );
    },
    onError: () => setRepeatMessage("No se pudo cargar el último pedido."),
  });

  const save = useMutation({
    mutationFn: async (options: { emitAndPrint?: boolean; target?: Window | null } = {}) => {
      const lineDeliveryDates = invoice ? lines.map((line) => line.deliveryDate).filter(Boolean) : [];
      const d = invoice
        ? await apiClient.request<Invoice>("/invoices", {
            method: "POST",
            body: JSON.stringify({
              contactId,
              series: invoiceSeries,
              number: parsedInvoiceNumber,
              issueDate,
              dueDate: includePaymentTerms ? due || null : null,
              operationStartDate: start || null,
              operationEndDate: end || null,
              deliveryDates: [...new Set(lineDeliveryDates)].sort(),
              paymentTerms: includePaymentTerms ? terms || null : null,
              generalInformation: info || null,
              applyContactDefaults: false,
            }),
          })
        : await deliveryNotesApi.create({
            contactId,
            series: deliverySeries,
            issueDate,
            notes: deliveryNotes.trim() || null,
          });
      let result = d;
      for (const line of lines) {
        const product = products.data?.items.find((item) => item.id === line.productId);
        const quantity =
          line.entryMode === "packages" && product?.unitsPerPackage
            ? String(Number(line.packageQuantity.replace(",", ".")) * Number(product.unitsPerPackage))
            : line.quantity.replace(",", ".");
        result = invoice
          ? await invoicesApi.addLine(d.id, {
              productId: line.productId,
              quantity,
              unitPrice: line.unitPrice.replace(",", "."),
              ...(line.entryMode === "packages" ? { packageQuantity: line.packageQuantity.replace(",", ".") } : {}),
              deliveryDate: line.deliveryDate || null,
            })
          : await deliveryNotesApi.addLine(d.id, {
              productId: line.productId,
              quantity,
              unitPrice: line.unitPrice.replace(",", "."),
            });
      }
      if (!invoice && options.emitAndPrint) {
        try {
          result = await deliveryNotesApi.issue(d.id);
          const blob = await deliveryNotesApi.downloadPdf(d.id, { prices: true, copies: 1 });
          const url = URL.createObjectURL(blob);
          if (options.target) options.target.location.href = url;
          else window.open(url, "_blank", "noopener,noreferrer");
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (error) {
          options.target?.close();
          // El borrador ya existe: se abre para terminar de emitirlo desde el detalle.
          localStorage.removeItem(draftKey);
          nav(`/ventas/albaranes/${d.id}`);
          throw error;
        }
      }
      return result;
    },
    onSuccess: (d) => {
      localStorage.removeItem(draftKey);
      nav(`/ventas/${invoice ? "facturas" : "albaranes"}/${d.id}`);
    },
  });

  const invalidLine = lines.some((line) => {
    const amount = Number((line.entryMode === "packages" ? line.packageQuantity : line.quantity).replace(",", "."));
    const price = Number(line.unitPrice.replace(",", "."));
    return (
      !line.productId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !line.unitPrice ||
      !Number.isFinite(price) ||
      price < 0 ||
      (invoice && invoiceMode === "fortnightly" && (!line.deliveryDate || line.deliveryDate < start || line.deliveryDate > end))
    );
  });

  const estimatedTotal = lines.reduce((sum, line) => {
    const product = products.data?.items.find((item) => item.id === line.productId);
    const quantity =
      line.entryMode === "packages" && product?.unitsPerPackage
        ? Number(line.packageQuantity.replace(",", ".")) * Number(product.unitsPerPackage)
        : Number(line.quantity.replace(",", "."));
    const price = Number(line.unitPrice.replace(",", "."));
    const taxRate = Number(product?.taxRate ?? prefs.data?.defaultTaxRate ?? "0");
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || !Number.isFinite(taxRate)) return sum;
    // Los albaranes se valoran sin IVA; el IVA solo aparece en la factura.
    return sum + quantity * price * (invoice ? 1 + taxRate / 100 : 1);
  }, 0);

  const saveError = save.error instanceof ApiError && save.error.code === "invoice_number_conflict"
    ? "Ese número de factura ya existe en esta serie. Elige otro número."
    : "No se pudo guardar el borrador. Revisa cliente, número, cantidades y precios e inténtalo de nuevo.";

  return (
    <div className="page form-page sales-form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/ventas" aria-label="Volver a facturas"><ArrowLeft /></Link>
        <h1>{invoice ? "Nueva factura" : "Nuevo albarán"}</h1>
      </header>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate({}); }}>
        <section className="form-card">
          <SelectField label="Cliente" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Selecciona</option>
            {contacts.data?.items.filter((x) => x.type !== "supplier").map((x) => (
              <option value={x.id} key={x.id}>{x.tradeName || x.legalName}</option>
            ))}
          </SelectField>
          {invoice ? (
            <div className="invoice-number-editor">
              <Field
                label="Número de factura"
                type="number"
                inputMode="numeric"
                min={1}
                value={invoiceNumber}
                error={invoiceNumberInvalid ? "Introduce un número entero mayor que cero." : undefined}
                hint={numberPreview.isError ? "No se pudo obtener la sugerencia automática; puedes introducir el número manualmente." : "Sugerido por la secuencia actual. Puedes modificarlo antes de guardar."}
                onChange={(e) => {
                  setInvoiceNumber(e.target.value);
                  setInvoiceNumberEdited(true);
                }}
              />
              <div className="automatic-number">
                <span>{prefs.data?.numberingMode === "live" ? "Numeración real" : "Numeración de pruebas"}</span>
                <strong>Serie {prefix}/{issueDate.slice(0, 4)}</strong>
                <small>La secuencia se ajustará si cambias el número.</small>
              </div>
            </div>
          ) : (
            <div className="automatic-number">
              <span>Número sugerido</span>
              <strong>
                {deliveryNumberPreview.data
                  ? `ALB-${deliveryNumberPreview.data.number}/${issueDate.slice(0, 4)}`
                  : `ALB-…/${issueDate.slice(0, 4)}`}
              </strong>
              <small>Numeración correlativa automática; se asigna al emitir.</small>
            </div>
          )}
          <Field label="Fecha de emisión" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
        </section>

        {invoice && (
          <section className="form-card invoice-essentials-card">
            <h2>Pago</h2>
            <label className="invoice-option-toggle">
              <span><strong>Incluir condiciones de pago</strong><small>Actívalo solo para clientes que las necesiten.</small></span>
              <input type="checkbox" role="switch" checked={includePaymentTerms} onChange={(e) => setIncludePaymentTerms(e.target.checked)} />
            </label>
            {includePaymentTerms && (
              <div className="conditional-fields invoice-payment-fields">
                <Field label="Fecha límite de pago" type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
                <label className="field"><span>Condiciones de pago</span>
                  <textarea rows={4} placeholder="Ej.: pago por transferencia en un plazo de 3 días." value={terms} onChange={(e) => setTerms(e.target.value)} />
                </label>
              </div>
            )}
            <details className="form-options">
              <summary>Opciones avanzadas · {invoiceMode === "fortnightly" ? "quincenal" : "puntual"}</summary>
              <div className="segmented" role="group" aria-label="Tipo de factura">
                <button type="button" className={invoiceMode === "single" ? "active" : ""} aria-pressed={invoiceMode === "single"} onClick={() => setInvoiceMode("single")}>Puntual</button>
                <button type="button" className={invoiceMode === "fortnightly" ? "active" : ""} aria-pressed={invoiceMode === "fortnightly"} onClick={() => setInvoiceMode("fortnightly")}>Quincenal</button>
              </div>
              {invoiceMode === "fortnightly" && (
                <div className="invoice-period-summary"><span>Periodo quincenal</span><strong>{start} — {end}</strong><small>La fecha de entrega será obligatoria en cada producto.</small></div>
              )}
              <label className="field"><span>Información adicional (opcional)</span><textarea rows={3} value={info} onChange={(e) => setInfo(e.target.value)} /></label>
            </details>
          </section>
        )}

        {!invoice && (
          <section className="form-card">
            <button
              type="button"
              className="compact-action"
              disabled={!contactId || repeatLast.isPending}
              onClick={() => repeatLast.mutate()}
            >
              <Repeat /> Repetir último pedido
            </button>
            {repeatMessage && <p className="field-help" role="status">{repeatMessage}</p>}
            <label className="field">
              <span>Notas de entrega (salen impresas)</span>
              <textarea rows={2} value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} />
            </label>
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
                : bagLabel(quantity, selected?.unit ?? ""),
              deliveryDateError = invoice && invoiceMode === "fortnightly" && (!line.deliveryDate || line.deliveryDate < start || line.deliveryDate > end)
                ? `Debe estar entre ${start} y ${end}`
                : undefined;
            return (
              <div className="sales-line-editor" key={line.clientId}>
                <SelectField
                  label={`Producto ${index + 1}`}
                  value={line.productId}
                  onChange={(e) => {
                    const productId = e.target.value;
                    const priced = effectivePrices.data?.items.find((product) => product.id === productId);
                    const product = products.data?.items.find((item) => item.id === productId);
                    setLines((current) => current.map((item, n) => n === index ? {
                      ...item,
                      productId,
                      unitPrice: productId ? formatQuantity(priced?.effectivePrice ?? product?.salePrice ?? "0") : "",
                      priceEdited: false,
                    } : item));
                  }}
                >
                  <option value="">Selecciona</option>
                  {products.data?.items.map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}
                </SelectField>
                {invoice && (
                  <Field
                    label={`Fecha de entrega${invoiceMode === "fortnightly" ? " (obligatoria)" : " (opcional)"}`}
                    type="date"
                    value={line.deliveryDate}
                    required={invoiceMode === "fortnightly"}
                    error={deliveryDateError}
                    onChange={(e) => setLines((current) => current.map((item, n) => n === index ? { ...item, deliveryDate: e.target.value } : item))}
                  />
                )}
                {hasPackaging && (
                  <div className="segmented segmented--compact" role="group" aria-label="Cómo introducir la cantidad">
                    <button type="button" className={line.entryMode === "packages" ? "active" : ""} onClick={() => setLines((current) => current.map((x,n) => n === index ? {...x,entryMode:"packages"} : x))}>Por envases</button>
                    <button type="button" className={line.entryMode === "quantity" ? "active" : ""} onClick={() => setLines((current) => current.map((x,n) => n === index ? {...x,entryMode:"quantity"} : x))}>Por {selected?.unit === "kg" ? "kg" : "cantidad"}</button>
                  </div>
                )}
                {line.entryMode === "packages" && hasPackaging ? (
                  <Field label={selected?.packageKind === "bag" ? "Número de bolsas" : "Número de envases"} inputMode="decimal" value={line.packageQuantity} onChange={(e) => setLines((current) => current.map((x,n) => n === index ? {...x,packageQuantity:e.target.value} : x))} />
                ) : (
                  <Field label={selected?.unit === "kg" ? "Cantidad en kg" : "Cantidad"} inputMode="decimal" value={line.quantity} onChange={(e) => setLines((current) => current.map((x, n) => n === index ? { ...x, quantity: e.target.value } : x))} />
                )}
                <Field
                  label={`Precio sin IVA${selected?.unit === "kg" ? " por kg" : ""}`}
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(e) => setLines((current) => current.map((item, n) => n === index ? { ...item, unitPrice: e.target.value, priceEdited: true } : item))}
                />
                {packaging && <p className="field-help">Equivale a {packaging}</p>}
                {lines.length > 1 && <button type="button" className="compact-action" onClick={() => setLines((current) => current.filter((_, n) => n !== index))}><X /> Quitar</button>}
              </div>
            );
          })}
          <button
            type="button"
            className="compact-action sales-line-add-action"
            onClick={() => setLines((current) => [...current, createDraftLine()])}
          >
            <Plus /> Añadir otro producto
          </button>
        </section>

        {save.isError && <div className="form-alert" role="alert">{saveError}</div>}
        {invoice ? (
          <div className="sticky-submit invoice-sticky-submit">
            <span className="invoice-sticky-total"><small>Total estimado</small><strong>{formatMoney(String(estimatedTotal))}</strong></span>
            <Button type="submit" icon={<Save />} busy={save.isPending} disabled={!contactId || !issueDate || invalidLine || invoiceNumberInvalid || !invoiceNumber}>
              Revisar factura
            </Button>
          </div>
        ) : (
          <section className="form-card delivery-submit" aria-label="Guardar albarán">
            <div className="delivery-submit__total">
              <span>Total sin IVA</span>
              <strong>{formatMoney(String(estimatedTotal))}</strong>
            </div>
            <Button
              type="button"
              icon={<Printer />}
              busy={save.isPending}
              disabled={!contactId || !issueDate || invalidLine}
              onClick={() => save.mutate({ emitAndPrint: true, target: window.open("", "_blank") })}
            >
              Emitir e imprimir
            </Button>
            <Button type="submit" variant="secondary" icon={<Save />} busy={save.isPending} disabled={!contactId || !issueDate || invalidLine}>
              Guardar borrador
            </Button>
          </section>
        )}
      </form>
    </div>
  );
}
