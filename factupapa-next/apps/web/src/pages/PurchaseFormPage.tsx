import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProductUnit, PurchaseLineInput } from "../api/types";
import { contactsApi, financeApi, productsApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { todayLocal } from "../utils/format";
const empty = (): PurchaseLineInput => ({
    productId: null,
    description: "",
    quantity: "1",
    unit: "kg",
    unitCost: "",
    taxRate: "4",
  }),
  encoded = (f: File) =>
    new Promise<string>((ok, no) => {
      const r = new FileReader();
      r.onerror = () => no(r.error);
      r.onload = () => ok(String(r.result).split(",", 2)[1] ?? "");
      r.readAsDataURL(f);
    });
export function PurchaseFormPage() {
  const nav = useNavigate(),
    [supplierId, setSupplierId] = useState(""),
    [number, setNumber] = useState(""),
    [issueDate, setIssueDate] = useState(todayLocal()),
    [dueDate, setDueDate] = useState(""),
    [category, setCategory] = useState("mercancia"),
    [documentId, setDocumentId] = useState<string | null>(null),
    [ocr, setOcr] = useState<
      Awaited<ReturnType<typeof financeApi.uploadPurchaseDocument>>["extractedData"] | null
    >(null),
    [lines, setLines] = useState([empty()]);
  const suppliers = useQuery({
      queryKey: ["purchase-suppliers"],
      queryFn: () =>
        contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
    }),
    products = useQuery({
      queryKey: ["purchase-products"],
      queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
    }),
    patch = (n: number, v: Partial<PurchaseLineInput>) =>
      setLines((x) => x.map((l, i) => (i === n ? { ...l, ...v } : l)));
  const upload = useMutation({
      mutationFn: async (f: File) =>
        financeApi.uploadPurchaseDocument({
          filename: f.name,
          mimeType: f.type,
          contentBase64: await encoded(f),
        }),
      onSuccess: (d) => {
        setDocumentId(d.id);
        setOcr(d.extractedData);
        if (d.extractedData.supplierId) setSupplierId(d.extractedData.supplierId);
        if (d.extractedData.supplierInvoiceNumber)
          setNumber(d.extractedData.supplierInvoiceNumber);
        if (d.extractedData.issueDate) setIssueDate(d.extractedData.issueDate);
        if (d.extractedData.dueDate) setDueDate(d.extractedData.dueDate);
        if (
          d.extractedData.concept ||
          d.extractedData.subtotal ||
          d.extractedData.purchasedQuantityKg
        ) {
          const subtotal = d.extractedData.subtotal ?? "";
          const quantity = d.extractedData.purchasedQuantityKg ?? "1";
          const taxRate =
            subtotal && d.extractedData.taxTotal
              ? String(
                  Math.round(
                    (Number(d.extractedData.taxTotal) / Number(subtotal)) * 10000,
                  ) / 100,
                )
              : "4";
          patch(0, {
            description: d.extractedData.concept ?? d.extractedData.supplierName ?? "Compra según factura",
            quantity,
            unit: d.extractedData.purchasedQuantityKg ? "kg" : "unit",
            unitCost:
              subtotal && Number(quantity) > 0
                ? String(
                    Math.round((Number(subtotal) / Number(quantity)) * 10_000) /
                      10_000,
                  )
                : "",
            taxRate,
          });
        }
      },
    }),
    save = useMutation({
      mutationFn: () =>
        financeApi.createPurchase({
          supplierId,
          documentId,
          supplierInvoiceNumber: number || null,
          issueDate,
          dueDate: dueDate || null,
          category,
          notes: null,
          lines: lines.filter((l) => l.description && l.unitCost),
        }),
      onSuccess: (x) => nav(`/gastos/${x.id}`),
    });
  return (
    <div className="page form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/gastos">
          <ArrowLeft />
        </Link>
        <h1>Nueva compra</h1>
      </header>
      <section className="upload-card">
        <label className="drop-zone">
          <FileUp />
          <strong>Seleccionar PDF o foto</strong>
          <span>Privado y siempre sujeto a revisión.</span>
          <input
            className="sr-only"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
            }}
          />
        </label>
        {upload.isPending && <p>Mejorando imagen y leyendo la factura…</p>}
        {upload.isError && (
          <p role="alert">
            No se pudo leer el documento. Puedes reintentarlo o introducir los datos
            manualmente.
          </p>
        )}
        {documentId && <p>Documento protegido y vinculado.</p>}
        {ocr && (
          <div className="ocr-review" aria-label="Resultado OCR">
            <strong>Lectura automática: {ocr.ocrConfidence ?? 0}%</strong>
            <span>{ocr.source === "pdf_text" ? "Texto original del PDF" : "OCR español/inglés"}</span>
            {ocr.supplierName && <span>Proveedor: {ocr.supplierName}</span>}
            {ocr.total && <span>Total detectado: {ocr.total} €</span>}
            {ocr.purchasedSacks && (
              <span>
                Compra detectada: {ocr.purchasedSacks} sacos · {ocr.purchasedQuantityKg} kg
              </span>
            )}
            {ocr.warnings?.map((warning) => (
              <span className="field-error" key={warning}>
                {{
                  totals_mismatch: "Los importes no cuadran: revisa base, IVA y total.",
                  supplier_tax_id_missing: "No se reconoció el NIF del proveedor.",
                  total_missing: "No se reconoció el total.",
                  issue_date_missing: "No se reconoció la fecha.",
                  possible_duplicate: "Posible factura duplicada.",
                  ocr_failed: "La imagen no pudo leerse.",
                  low_confidence: "Lectura poco nítida: comprueba todos los campos.",
                }[warning] ?? "Campo pendiente de revisión."}
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="form-card">
        <SelectField
          label="Proveedor obligatorio"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">Selecciona un proveedor</option>
          {suppliers.data?.items.map((x) => (
            <option key={x.id} value={x.id}>
              {x.tradeName || x.legalName}
            </option>
          ))}
        </SelectField>
        <Field
          label="Número de factura del proveedor"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <Field
          label="Fecha de vencimiento"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <SelectField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="mercancia">Mercancía</option>
          <option value="gestoria">Gestoría</option>
          <option value="transporte">Transporte</option>
          <option value="suministros">Suministros</option>
          <option value="alquiler">Alquiler</option>
          <option value="autonomo">Autónomo</option>
          <option value="impuestos">Impuestos</option>
          <option value="otros">Otros</option>
        </SelectField>
        <Field
          label="Fecha de emisión"
          type="date"
          value={issueDate}
          onChange={(e) => setIssueDate(e.target.value)}
        />
      </section>
      <section className="form-card">
        <h2>Conceptos</h2>
        {lines.map((l, n) => (
          <div className="purchase-line-editor" key={n}>
            <SelectField
              label="Producto de stock"
              value={l.productId ?? ""}
              onChange={(e) => {
                const p = products.data?.items.find(
                  (x) => x.id === e.target.value,
                );
                patch(n, {
                  productId: e.target.value || null,
                  description: p?.name ?? l.description,
                  unit: p?.unit ?? l.unit,
                });
              }}
            >
              <option value="">No afecta al stock</option>
              {products.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
            <Field
              label="Descripción"
              value={l.description}
              onChange={(e) => patch(n, { description: e.target.value })}
            />
            <Field
              label="Cantidad"
              value={l.quantity}
              onChange={(e) => patch(n, { quantity: e.target.value })}
            />
            <SelectField
              label="Unidad"
              value={l.unit}
              onChange={(e) =>
                patch(n, { unit: e.target.value as ProductUnit })
              }
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="unit">unidad</option>
            </SelectField>
            <Field
              label="Coste unidad sin IVA"
              value={l.unitCost}
              onChange={(e) => patch(n, { unitCost: e.target.value })}
            />
            <Field
              label="IVA %"
              value={l.taxRate}
              onChange={(e) => patch(n, { taxRate: e.target.value })}
            />
            {lines.length > 1 && (
              <button
                onClick={() => setLines((x) => x.filter((_, i) => i !== n))}
              >
                <Trash2 />
              </button>
            )}
          </div>
        ))}
        <button
          className="compact-action"
          onClick={() => setLines((x) => [...x, empty()])}
        >
          <Plus />
          Añadir concepto
        </button>
      </section>
      <Button
        disabled={
          !supplierId || !lines.some((l) => l.description && l.unitCost)
        }
        busy={save.isPending || upload.isPending}
        onClick={() => save.mutate()}
      >
        Guardar para revisión
      </Button>
    </div>
  );
}
