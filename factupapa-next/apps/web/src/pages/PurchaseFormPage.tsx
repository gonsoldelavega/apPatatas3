import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, FileUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
    );
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
        if (d.extractedData.supplierInvoiceNumber)
          setNumber(d.extractedData.supplierInvoiceNumber);
        if (d.extractedData.issueDate) setIssueDate(d.extractedData.issueDate);
        if (d.extractedData.dueDate) setDueDate(d.extractedData.dueDate);
        if (d.extractedData.lines?.length) {
          setLines(
            d.extractedData.lines.map((line) => ({
              clientId: crypto.randomUUID(),
              productId: suggestProductId(line.description, line.unit),
              ...line,
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
            {ocr.supplierTaxId && <span>NIF detectado: {ocr.supplierTaxId}</span>}
            {ocr.total && <span>Total detectado: {ocr.total} €</span>}
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
          <div className="purchase-line-editor" key={l.clientId}>
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
          (totalMismatch && !acceptTotalMismatch)
        }
        busy={save.isPending || upload.isPending}
        onClick={() => save.mutate()}
      >
        Guardar para revisión
      </Button>
    </div>
  );
}
