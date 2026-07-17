import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, FileUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProductUnit, PurchaseLineInput } from "../api/types";
import { contactsApi, financeApi, productsApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { todayLocal } from "../utils/format";

type DraftPurchaseLine = PurchaseLineInput & { clientId: string };

const empty = (): DraftPurchaseLine => ({
    clientId: crypto.randomUUID(),
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
    queryClient = useQueryClient(),
    [supplierId, setSupplierId] = useState(""),
    [newSupplierName, setNewSupplierName] = useState(""),
    [newSupplierTaxId, setNewSupplierTaxId] = useState(""),
    [showSupplierCreate, setShowSupplierCreate] = useState(false),
    [ignoreDetectedStock, setIgnoreDetectedStock] = useState(false),
    [acceptTotalMismatch, setAcceptTotalMismatch] = useState(false),
    [acceptWarnings, setAcceptWarnings] = useState(false),
    [uploadedFile, setUploadedFile] = useState<File | null>(null),
    [number, setNumber] = useState(""),
    [issueDate, setIssueDate] = useState(todayLocal()),
    [dueDate, setDueDate] = useState(""),
    [category, setCategory] = useState("mercancia"),
    [documentId, setDocumentId] = useState<string | null>(null),
    [ocr, setOcr] = useState<
      Awaited<ReturnType<typeof financeApi.uploadPurchaseDocument>>["extractedData"] | null
    >(null),
    [lines, setLines] = useState([empty()]);
  const calculatedTotal = useMemo(
      () =>
        lines.reduce(
          (sum, line) =>
            sum +
            Number(line.quantity || 0) *
              Number(line.unitCost || 0) *
              (1 + Number(line.taxRate || 0) / 100),
          0,
        ),
      [lines],
    ),
    totalMismatch = Boolean(
      ocr?.total &&
        lines.some((line) => line.quantity && line.unitCost) &&
        Math.abs(calculatedTotal - Number(ocr.total)) > 0.02,
    ),
    pendingWarnings = ocr?.warnings ?? [],
    fieldLevel = (field: string) => ocr?.fieldConfidence?.[field],
    fieldClass = (field: string) => {
      const level = fieldLevel(field);
      return level ? `field--confidence-${level}` : "";
    },
    confidenceDot = (field: string) => {
      const level = fieldLevel(field);
      return level ? (
        <span
          className={`confidence-dot confidence-dot--${level}`}
          title={{ high: "Fiable", medium: "Conviene revisar", low: "Dudoso" }[level]}
        />
      ) : null;
    };
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
  const suggestProductId = (description: string, unit: ProductUnit) => {
    const normalized = description.trim().toLowerCase();
    if (!normalized) return null;
    const exact = products.data?.items.find(
      (product) =>
        product.unit === unit &&
        normalized.includes(product.name.trim().toLowerCase()),
    );
    if (exact) return exact.id;
    const sameUnit = products.data?.items.filter((product) => product.unit === unit) ?? [];
    return sameUnit.length === 1 && unit === "kg" ? sameUnit[0].id : null;
  };
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
        setNewSupplierName(d.extractedData.supplierName ?? "");
        setNewSupplierTaxId(d.extractedData.supplierTaxId ?? "");
        setShowSupplierCreate(false);
        setIgnoreDetectedStock(false);
        setAcceptTotalMismatch(false);
        setAcceptWarnings(false);
        if (d.extractedData.supplierInvoiceNumber)
          setNumber(d.extractedData.supplierInvoiceNumber);
        if (d.extractedData.issueDate) setIssueDate(d.extractedData.issueDate);
        if (d.extractedData.dueDate) setDueDate(d.extractedData.dueDate);
        if (d.extractedData.lines?.length) {
          setLines(
            d.extractedData.lines.map(({ discount, lineTotal, ...line }) => ({
              clientId: crypto.randomUUID(),
              productId: suggestProductId(line.description, line.unit),
              ...line,
              unitCost:
                lineTotal &&
                Number(line.quantity) > 0 &&
                Math.abs(
                  Number(line.quantity) * Number(line.unitCost) -
                    Number(discount ?? 0) -
                    Number(lineTotal),
                ) <= 0.03 &&
                Number(discount ?? 0) !== 0
                  ? String(
                      Math.round(
                        (Number(lineTotal) / Number(line.quantity)) * 10_000,
                      ) / 10_000,
                    )
                  : line.unitCost,
            })),
          );
        } else if (
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
            productId: suggestProductId(
              d.extractedData.concept ?? d.extractedData.supplierName ?? "",
              d.extractedData.purchasedQuantityKg ? "kg" : "unit",
            ),
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
    createSupplier = useMutation({
      mutationFn: () =>
        contactsApi.create({
          type: "supplier",
          legalName: newSupplierName.trim(),
          tradeName: null,
          taxId: newSupplierTaxId.trim() || null,
          email: null,
          phone: null,
          address: {},
          notes: null,
        }),
      onSuccess: async (supplier) => {
        setSupplierId(supplier.id);
        setShowSupplierCreate(false);
        await queryClient.invalidateQueries({ queryKey: ["purchase-suppliers"] });
      },
    }),
    documentBlob = useQuery({
      queryKey: ["purchase-document", documentId],
      queryFn: () => financeApi.downloadPurchaseDocument(documentId!),
      enabled: Boolean(documentId),
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
          lines: lines
            .filter((l) => l.description && l.unitCost)
            .map(({ clientId: _clientId, ...line }) => line),
        }),
      onSuccess: (x) => nav(`/gastos/${x.id}`),
    });
  const documentUrl = useMemo(
    () =>
      documentBlob.data ? URL.createObjectURL(documentBlob.data) : null,
    [documentBlob.data],
  );
  useEffect(
    () => () => {
      if (documentUrl) URL.revokeObjectURL(documentUrl);
    },
    [documentUrl],
  );
  return (
    <div className="page form-page purchase-form-page">
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
              if (f) {
                setUploadedFile(f);
                upload.mutate(f);
              }
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
        {uploadedFile && !upload.isPending && (
          <button
            className="compact-action"
            type="button"
            onClick={() => upload.mutate(uploadedFile)}
          >
            <RefreshCw />
            Reintentar extracción
          </button>
        )}
        {documentUrl && (
          <details className="document-preview" open={ocr != null}>
            <summary>Ver documento subido</summary>
            {documentBlob.data?.type === "application/pdf" ? (
              <iframe src={documentUrl} title="Factura subida" />
            ) : (
              <img src={documentUrl} alt="Factura subida" />
            )}
          </details>
        )}
        {ocr && (
          <div className="ocr-review" aria-label="Resultado OCR">
            <strong>Lectura automática: {ocr.ocrConfidence ?? 0}%</strong>
            <span>
              {ocr.source === "vision"
                ? "Lectura con IA de visión"
                : ocr.source === "pdf_text"
                  ? ocr.fieldConfidence && Object.keys(ocr.fieldConfidence).length
                    ? "Texto del PDF interpretado con IA"
                    : "Texto original del PDF"
                  : "OCR español/inglés"}
            </span>
            {ocr.fieldConfidence && Object.keys(ocr.fieldConfidence).length > 0 && (
              <span className="confidence-legend">
                <span className="confidence-dot confidence-dot--high" /> fiable ·{" "}
                <span className="confidence-dot confidence-dot--medium" /> revisar ·{" "}
                <span className="confidence-dot confidence-dot--low" /> dudoso
              </span>
            )}
            {ocr.supplierName && (
              <span>
                {confidenceDot("supplierName")}Proveedor: {ocr.supplierName}
              </span>
            )}
            {ocr.supplierTaxId && (
              <span>
                {confidenceDot("supplierTaxId")}NIF detectado: {ocr.supplierTaxId}
              </span>
            )}
            {ocr.subtotal && (
              <span>
                {confidenceDot("subtotal")}Base imponible: {ocr.subtotal} €
              </span>
            )}
            {ocr.taxTotal && (
              <span>
                {confidenceDot("taxTotal")}Cuota de IVA: {ocr.taxTotal} €
              </span>
            )}
            {ocr.total && (
              <span>
                {confidenceDot("total")}Total detectado: {ocr.total} €
              </span>
            )}
            {ocr.lines?.length && (
              <span>{ocr.lines.length} conceptos detectados para revisar.</span>
            )}
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
                  supplier_tax_id_own:
                    "El NIF leído era el tuyo, no el del proveedor: se ha descartado.",
                  line_amount_mismatch:
                    "Alguna línea no cuadra (cantidad × precio − descuento).",
                  vision_unavailable:
                    "La lectura con IA no estaba disponible: se usó el OCR clásico.",
                  total_missing: "No se reconoció el total.",
                  issue_date_missing: "No se reconoció la fecha.",
                  possible_duplicate: "Posible factura duplicada.",
                  ocr_failed: "La imagen no pudo leerse.",
                  low_confidence: "Lectura poco nítida: comprueba todos los campos.",
                }[warning] ?? "Campo pendiente de revisión."}
              </span>
            ))}
            {pendingWarnings.length > 0 && (
              <label className="review-ack">
                <input
                  type="checkbox"
                  checked={acceptWarnings}
                  onChange={(e) => setAcceptWarnings(e.target.checked)}
                />
                He revisado los avisos y los campos marcados
              </label>
            )}
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
        {ocr?.supplierName && !ocr.supplierId && !showSupplierCreate && (
          <button
            className="compact-action"
            type="button"
            onClick={() => setShowSupplierCreate(true)}
          >
            <Building2 />
            Crear proveedor detectado
          </button>
        )}
        {showSupplierCreate && (
          <div className="inline-create-card" aria-label="Revisar proveedor nuevo">
            <strong>Revisa antes de crear el proveedor</strong>
            <p>Solo se guardarán los datos que confirmes.</p>
            <Field
              label="Nombre legal"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
            />
            <Field
              className={fieldClass("supplierTaxId")}
              label="NIF"
              value={newSupplierTaxId}
              onChange={(e) => setNewSupplierTaxId(e.target.value.toUpperCase())}
            />
            {createSupplier.isError && (
              <p className="field-error" role="alert">
                No se pudo crear. Comprueba si el proveedor o el NIF ya existen.
              </p>
            )}
            <div className="inline-create-card__actions">
              <button
                type="button"
                onClick={() => setShowSupplierCreate(false)}
                disabled={createSupplier.isPending}
              >
                Cancelar
              </button>
              <Button
                busy={createSupplier.isPending}
                disabled={!newSupplierName.trim()}
                onClick={() => createSupplier.mutate()}
              >
                Crear y seleccionar
              </Button>
            </div>
          </div>
        )}
        <Field
          className={fieldClass("supplierInvoiceNumber")}
          label="Número de factura del proveedor"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <Field
          className={fieldClass("dueDate")}
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
          className={fieldClass("issueDate")}
          label="Fecha de emisión"
          type="date"
          value={issueDate}
          onChange={(e) => setIssueDate(e.target.value)}
        />
      </section>
      <section className="form-card">
        <h2>Conceptos</h2>
        {ocr?.purchasedQuantityKg && !lines.some((line) => line.productId) && (
          <div className="stock-review-warning" role="status">
            <strong>Falta decidir el destino de {ocr.purchasedQuantityKg} kg</strong>
            <p>
              Selecciona debajo el producto para que la compra aumente el stock.
              Si no es mercancía vendible, indícalo expresamente.
            </p>
            <label>
              <input
                type="checkbox"
                checked={ignoreDetectedStock}
                onChange={(e) => setIgnoreDetectedStock(e.target.checked)}
              />
              No añadir estos kg al stock
            </label>
          </div>
        )}
        {lines.map((l, n) => (
          <div
            className={`purchase-line-editor${
              fieldLevel("lines") ? ` purchase-line-editor--${fieldLevel("lines")}` : ""
            }`}
            key={l.clientId}
          >
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
                if (e.target.value) setIgnoreDetectedStock(false);
              }}
            >
              <option value="">No afecta al stock</option>
              {products.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
            {l.productId && ocr && (
              <p className="field-help">
                Producto propuesto para actualizar stock. Revísalo antes de guardar.
              </p>
            )}
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
        {ocr?.total && (
          <div className={totalMismatch ? "total-review total-review--warning" : "total-review"}>
            <span>
              Total según conceptos <strong>{calculatedTotal.toFixed(2)} €</strong>
            </span>
            <span>
              Total leído <strong>{Number(ocr.total).toFixed(2)} €</strong>
            </span>
            {totalMismatch && (
              <label>
                <input
                  type="checkbox"
                  checked={acceptTotalMismatch}
                  onChange={(e) => setAcceptTotalMismatch(e.target.checked)}
                />
                He revisado y acepto esta diferencia
              </label>
            )}
          </div>
        )}
      </section>
      <Button
        disabled={
          !supplierId ||
          !lines.some((l) => l.description && l.unitCost) ||
          Boolean(
            ocr?.purchasedQuantityKg &&
              !lines.some((line) => line.productId) &&
              !ignoreDetectedStock,
          ) ||
          (totalMismatch && !acceptTotalMismatch) ||
          (pendingWarnings.length > 0 && !acceptWarnings)
        }
        busy={save.isPending || upload.isPending}
        onClick={() => save.mutate()}
      >
        Guardar para revisión
      </Button>
    </div>
  );
}
