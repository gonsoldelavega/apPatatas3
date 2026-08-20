import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Camera,
  FileCheck2,
  FileUp,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ProductUnit, PurchaseLineInput } from "../api/types";
import { contactsApi, financeApi, productsApi } from "../api/services";
import { apiClient } from "../api/client";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { todayLocal } from "../utils/format";

type DraftPurchaseLine = PurchaseLineInput & { clientId: string };
type Confidence = "high" | "medium" | "low";
type ExtractedPurchase = {
  supplierId?: string;
  supplierName?: string;
  supplierTaxId?: string;
  supplierInvoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  subtotal?: string;
  taxTotal?: string;
  total?: string;
  concept?: string;
  purchasedSacks?: number;
  purchasedQuantityKg?: string;
  lines?: Array<{
    description: string;
    quantity: string;
    unit: "kg" | "g" | "unit";
    unitCost: string;
    taxRate: string;
    discount?: string;
    lineTotal?: string;
  }>;
  ocrConfidence?: number;
  source?: "pdf_text" | "ocr" | "vision";
  fieldConfidence?: Record<string, Confidence>;
  warnings?: string[];
};
type PurchaseDocumentResponse = { id: string; extractedData: ExtractedPurchase };

const emptyLine = (): DraftPurchaseLine => ({
  clientId: crypto.randomUUID(),
  productId: null,
  description: "",
  quantity: "",
  unit: "kg",
  unitCost: "",
  taxRate: "4",
});
const decimal = (value: string) => value.replace(",", ".");
const documentAccept = "application/pdf,image/jpeg,image/png,image/heic,image/heif";
const lineIsValid = (line: DraftPurchaseLine) => {
  const quantity = Number(decimal(line.quantity));
  const unitCost = Number(decimal(line.unitCost));
  const taxRate = Number(decimal(line.taxRate));
  return Boolean(
    line.description.trim() &&
      line.quantity.trim() &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      line.unitCost.trim() &&
      Number.isFinite(unitCost) &&
      unitCost >= 0 &&
      line.taxRate.trim() &&
      Number.isFinite(taxRate) &&
      taxRate >= 0 &&
      taxRate <= 100,
  );
};
const encoded = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });

export function PurchaseFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const importedDocumentId = searchParams.get("document");
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierTaxId, setNewSupplierTaxId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("mercancia");
  const [notes, setNotes] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(Boolean(importedDocumentId));
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [ocr, setOcr] = useState<ExtractedPurchase | null>(null);
  const [lines, setLines] = useState<DraftPurchaseLine[]>([emptyLine()]);
  const selectedDocument = useRef<File | null>(null);
  const appliedImportedDocument = useRef<string | null>(null);

  const suppliers = useQuery({
    queryKey: ["purchase-suppliers"],
    queryFn: () => contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
  });
  const products = useQuery({
    queryKey: ["purchase-products"],
    queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
  });
  const importedDocument = useQuery({
    queryKey: ["pending-purchase-document", importedDocumentId],
    queryFn: () => financeApi.pendingPurchaseDocument(importedDocumentId!),
    enabled: Boolean(importedDocumentId),
  });

  const patchLine = (index: number, value: Partial<PurchaseLineInput>) =>
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, ...value } : line,
      ),
    );

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

  const applyExtractedData = (id: string, extractedData: ExtractedPurchase) => {
    setDocumentId(id);
    setOcr(extractedData);
    if (extractedData.supplierId) setSupplierId(extractedData.supplierId);
    setNewSupplierName(extractedData.supplierName ?? "");
    setNewSupplierTaxId(extractedData.supplierTaxId ?? "");
    if (extractedData.supplierInvoiceNumber)
      setSupplierInvoiceNumber(extractedData.supplierInvoiceNumber);
    if (extractedData.issueDate) setIssueDate(extractedData.issueDate);
    if (extractedData.dueDate) setDueDate(extractedData.dueDate);
    if (extractedData.lines?.length) {
      setLines(
        extractedData.lines.map(({ discount, lineTotal, ...line }) => ({
          clientId: crypto.randomUUID(),
          productId: suggestProductId(line.description, line.unit),
          ...line,
          unitCost:
            lineTotal && Number(line.quantity) > 0 && Number(discount ?? 0) !== 0
              ? String(Math.round((Number(lineTotal) / Number(line.quantity)) * 10_000) / 10_000)
              : line.unitCost,
        })),
      );
    } else if (
      extractedData.concept ||
      extractedData.subtotal ||
      extractedData.purchasedQuantityKg
    ) {
      const quantity = extractedData.purchasedQuantityKg ?? "1";
      const subtotal = extractedData.subtotal ?? "";
      const taxRate =
        subtotal && extractedData.taxTotal
          ? String(Math.round((Number(extractedData.taxTotal) / Number(subtotal)) * 10_000) / 100)
          : "4";
      setLines([{
        clientId: crypto.randomUUID(),
        productId: suggestProductId(
          extractedData.concept ?? extractedData.supplierName ?? "",
          extractedData.purchasedQuantityKg ? "kg" : "unit",
        ),
        description: extractedData.concept ?? extractedData.supplierName ?? "Compra según factura",
        quantity,
        unit: extractedData.purchasedQuantityKg ? "kg" : "unit",
        unitCost:
          subtotal && Number(quantity) > 0
            ? String(Math.round((Number(subtotal) / Number(quantity)) * 10_000) / 10_000)
            : "",
        taxRate,
      }]);
    }
  };

  const upload = useMutation({
    mutationFn: async (file: File) =>
      apiClient.request<PurchaseDocumentResponse>("/purchase-documents", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          contentBase64: await encoded(file),
        }),
        timeoutMs: 120_000,
      }),
    onSuccess: ({ id, extractedData }, file) => {
      if (selectedDocument.current !== file) return;
      applyExtractedData(id, extractedData);
    },
  });

  useEffect(() => {
    const document = importedDocument.data;
    if (!document || appliedImportedDocument.current === document.id || !products.data) return;
    appliedImportedDocument.current = document.id;
    applyExtractedData(document.id, document.extractedData as ExtractedPurchase);
    void financeApi.downloadPurchaseDocument(document.id).then((blob) => {
      setDocumentFile(new File([blob], document.filename, { type: document.mimeType }));
    }).catch(() => setDocumentError("No se pudo abrir el adjunto original."));
  }, [importedDocument.data, products.data]);

  const createSupplier = useMutation({
    mutationFn: () =>
      contactsApi.create({
        type: "supplier",
        legalName: newSupplierName.trim(),
        tradeName: null,
        taxId: newSupplierTaxId.trim().toUpperCase() || null,
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
  });

  const allLinesValid = lines.length > 0 && lines.every(lineIsValid);
  const validLines = allLinesValid
    ? lines.map(({ clientId: _clientId, ...line }) => ({
        ...line,
        quantity: decimal(line.quantity),
        unitCost: decimal(line.unitCost),
        taxRate: decimal(line.taxRate),
      }))
    : [];
  const total = useMemo(
    () =>
      validLines.reduce(
        (sum, line) =>
          sum +
          Number(line.quantity) *
            Number(line.unitCost) *
            (1 + Number(line.taxRate) / 100),
        0,
      ),
    [validLines],
  );
  const save = useMutation({
    mutationFn: () =>
      financeApi.createPurchase({
        supplierId,
        documentId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
        issueDate,
        dueDate: dueDate || null,
        category,
        notes: notes.trim() || null,
        lines: validLines,
      }),
    onSuccess: (purchase) => navigate(`/gastos/${purchase.id}`),
  });

  useEffect(() => {
    if (!documentFile) {
      setDocumentPreview(null);
      return;
    }
    const url = URL.createObjectURL(documentFile);
    setDocumentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [documentFile]);

  const removeDocument = () => {
    selectedDocument.current = null;
    setDocumentFile(null);
    setDocumentId(null);
    setDocumentError(null);
    setOcr(null);
    upload.reset();
  };

  const selectDocument = (file?: File) => {
    if (!file) return;
    if (file.size > 10_000_000) {
      setDocumentError("La factura supera el límite de 10 MB.");
      return;
    }
    setDocumentError(null);
    selectedDocument.current = file;
    setDocumentFile(file);
    setDocumentId(null);
    setOcr(null);
    upload.mutate(file);
  };

  const warningLabel = (warning: string) =>
    ({
      totals_mismatch: "Los importes no cuadran: revisa base, IVA y total.",
      supplier_tax_id_missing: "No se reconoció el NIF del proveedor.",
      supplier_tax_id_own: "Se descartó tu propio NIF y se buscó el del proveedor.",
      line_amount_mismatch: "Alguna línea no cuadra con cantidad, precio y descuento.",
      vision_unavailable: "La visión no estaba disponible y se usó el OCR alternativo.",
      vision_budget_exhausted: "Se alcanzó el límite de lectura inteligente y se usó el OCR alternativo.",
      total_missing: "No se reconoció el total.",
      issue_date_missing: "No se reconoció la fecha.",
      possible_duplicate: "Posible factura duplicada.",
      ocr_failed: "La imagen no pudo leerse.",
      low_confidence: "Lectura poco nítida: revisa todos los campos.",
    })[warning] ?? "Campo pendiente de revisión.";
  const confidenceFor = (field: string) => ocr?.fieldConfidence?.[field];
  const confidenceClass = (field: string) => {
    const confidence = confidenceFor(field);
    return confidence ? `field--confidence-${confidence}` : "";
  };
  const confidenceHint = (field: string) => {
    const confidence = confidenceFor(field);
    return confidence === "low"
      ? "Dato dudoso: compruébalo en la factura original."
      : confidence === "medium"
        ? "Conviene comprobar este dato."
        : undefined;
  };

  return (
    <div className="page form-page purchase-form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/gastos" aria-label="Volver a gastos">
          <ArrowLeft />
        </Link>
        <div>
          <p className="eyebrow">Gasto o mercancía</p>
          <h1>Nueva compra</h1>
        </div>
      </header>

      <section className="upload-card purchase-capture-card">
        <p className="eyebrow">Lectura automática</p>
        <h2>Añade la factura</h2>
        <p>
          La IA extraerá proveedor, fechas, conceptos, cantidades, precios e IVA.
          Nada se registra hasta que revises y guardes la compra.
        </p>
        {!documentFile ? (
          <div className="purchase-capture-picker">
            <div className="purchase-capture-actions">
              <label className="purchase-capture-option purchase-capture-option--file">
                <FileUp />
                <span>
                  <strong>Elegir archivo</strong>
                  <small>PDF o imagen guardada</small>
                </span>
                <input
                  className="sr-only"
                  type="file"
                  accept={documentAccept}
                  onChange={(event) => {
                    selectDocument(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="purchase-capture-option purchase-capture-option--camera">
                <Camera />
                <span>
                  <strong>Hacer foto</strong>
                  <small>Abrir la cámara</small>
                </span>
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    selectDocument(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <p className="purchase-capture-hint">JPG, PNG, HEIC o PDF · máximo 10 MB</p>
          </div>
        ) : (
          <div className="attachment-card">
            <FileCheck2 />
            <span>
              <strong>{documentFile.name}</strong>
              <small>{(documentFile.size / 1024).toFixed(1)} KB</small>
            </span>
            <button className="icon-button" type="button" aria-label="Quitar factura" onClick={removeDocument}>
              <X />
            </button>
          </div>
        )}
        {upload.isPending && (
          <p className="ai-reading-status" role="status">
            <Sparkles /> Mejorando imagen y leyendo la factura…
          </p>
        )}
        {documentId && <p className="success-note">Factura leída, protegida y vinculada.</p>}
        {documentError && <div className="form-alert" role="alert">{documentError}</div>}
        {upload.isError && (
          <div className="form-alert" role="alert">
            No se pudo leer ni adjuntar la factura. Puedes reintentarlo o guardar la compra con los datos introducidos manualmente.
            <Button type="button" variant="secondary" onClick={() => documentFile && upload.mutate(documentFile)}>
              <RefreshCw /> Reintentar lectura
            </Button>
          </div>
        )}
        {ocr && (
          <div className="ocr-review" aria-label="Resultado de la lectura automática">
            <strong>Lectura automática: {ocr.ocrConfidence ?? 0}%</strong>
            <span>{ocr.source === "vision" ? "Anthropic Vision" : ocr.source === "pdf_text" ? "Texto del PDF interpretado" : "OCR alternativo"}</span>
            {ocr.supplierName && <span>Proveedor: {ocr.supplierName}</span>}
            {ocr.total && <span>Total detectado: {ocr.total} €</span>}
            {ocr.lines?.length ? <span>{ocr.lines.length} conceptos detectados para revisar.</span> : null}
            <span className="confidence-legend">
              <i className="confidence-dot confidence-dot--high" />Seguro
              <i className="confidence-dot confidence-dot--medium" />Revisar
              <i className="confidence-dot confidence-dot--low" />Dudoso
            </span>
            {ocr.warnings?.map((warning) => <span className="field-error" key={warning}>{warningLabel(warning)}</span>)}
          </div>
        )}
        {documentPreview && (
          <details
            className="document-preview"
            open={documentPreviewOpen}
            onToggle={(event) => setDocumentPreviewOpen(event.currentTarget.open)}
          >
            <summary>Factura original</summary>
            {documentFile?.type === "application/pdf" ? (
              <iframe src={documentPreview} title="Factura de compra" />
            ) : (
              <img src={documentPreview} alt="Factura de compra" />
            )}
          </details>
        )}
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">Proveedor</p><h2>Datos de la compra</h2></div>
          <button className="compact-action" type="button" onClick={() => setShowSupplierCreate((current) => !current)}>
            <Building2 /> Nuevo proveedor
          </button>
        </div>
        <SelectField label="Proveedor obligatorio" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
          <option value="">Selecciona un proveedor</option>
          {suppliers.data?.items.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>{supplier.tradeName || supplier.legalName}</option>
          ))}
        </SelectField>
        {ocr?.supplierName && !ocr.supplierId && !showSupplierCreate && (
          <button className="compact-action" type="button" onClick={() => setShowSupplierCreate(true)}>
            <Building2 /> Crear proveedor detectado
          </button>
        )}
        {showSupplierCreate && (
          <div className="inline-create-card">
            <strong>Revisar proveedor nuevo</strong>
            <Field className={confidenceClass("supplierName")} hint={confidenceHint("supplierName")} label="Nombre legal" value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} />
            <Field className={confidenceClass("supplierTaxId")} hint={confidenceHint("supplierTaxId")} label="NIF" value={newSupplierTaxId} onChange={(event) => setNewSupplierTaxId(event.target.value.toUpperCase())} />
            {createSupplier.isError && <p className="field-error" role="alert">No se pudo crear. Comprueba si ya existe.</p>}
            <div className="inline-create-card__actions">
              <button type="button" onClick={() => setShowSupplierCreate(false)}>Cancelar</button>
              <Button type="button" disabled={!newSupplierName.trim()} busy={createSupplier.isPending} onClick={() => createSupplier.mutate()}>
                Crear y seleccionar
              </Button>
            </div>
          </div>
        )}
        <Field className={confidenceClass("supplierInvoiceNumber")} hint={confidenceHint("supplierInvoiceNumber")} label="Número de factura del proveedor" value={supplierInvoiceNumber} onChange={(event) => setSupplierInvoiceNumber(event.target.value)} />
        <div className="form-grid">
          <Field className={confidenceClass("issueDate")} hint={confidenceHint("issueDate")} label="Fecha de emisión" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required />
          <Field className={confidenceClass("dueDate")} hint={confidenceHint("dueDate")} label="Fecha de vencimiento" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
        <SelectField label="Categoría" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="mercancia">Mercancía</option><option value="gestoria">Gestoría</option>
          <option value="transporte">Transporte</option><option value="suministros">Suministros</option>
          <option value="alquiler">Alquiler</option><option value="autonomo">Autónomo</option>
          <option value="impuestos">Impuestos</option><option value="otros">Otros</option>
        </SelectField>
        <label className="field"><span className="field__label">Notas</span>
          <textarea rows={3} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">Detalle</p><h2>Conceptos</h2></div>
          <strong>{new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(total)}</strong>
        </div>
        {lines.map((line, index) => (
          <div className="purchase-line-editor" key={line.clientId}>
            <SelectField
              label="Producto de stock"
              value={line.productId ?? ""}
              onChange={(event) => {
                const product = products.data?.items.find((item) => item.id === event.target.value);
                patchLine(index, {
                  productId: event.target.value || null,
                  description: product?.name ?? line.description,
                  unit: product?.unit ?? line.unit,
                });
              }}
            >
              <option value="">No afecta al stock</option>
              {products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </SelectField>
            <Field label="Descripción" value={line.description} onChange={(event) => patchLine(index, { description: event.target.value })} />
            <Field label="Cantidad" inputMode="decimal" value={line.quantity} onChange={(event) => patchLine(index, { quantity: event.target.value })} />
            <SelectField label="Unidad" value={line.unit} onChange={(event) => patchLine(index, { unit: event.target.value as ProductUnit })}>
              <option value="kg">kg</option><option value="g">g</option><option value="unit">unidad</option>
              <option value="box">caja</option><option value="custom">otra</option>
            </SelectField>
            <Field label="Coste unidad sin IVA" inputMode="decimal" value={line.unitCost} onChange={(event) => patchLine(index, { unitCost: event.target.value })} />
            <Field label="IVA %" inputMode="decimal" value={line.taxRate} onChange={(event) => patchLine(index, { taxRate: event.target.value })} />
            {lines.length > 1 && (
              <button className="icon-button" type="button" aria-label={`Eliminar concepto ${index + 1}`} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                <Trash2 />
              </button>
            )}
          </div>
        ))}
        {!allLinesValid && <p className="field-help" role="status">Completa descripción, cantidad, coste e IVA de todos los conceptos.</p>}
        <button className="compact-action" type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>
          <Plus /> Añadir concepto
        </button>
      </section>

      {save.isError && <div className="form-alert" role="alert">No se pudo guardar la compra. Revisa proveedor, fechas e importes.</div>}
      <div className="sticky-submit">
        <Button
          disabled={!supplierId || !issueDate || !allLinesValid || upload.isPending}
          busy={save.isPending}
          onClick={() => save.mutate()}
        >
          Guardar para revisión
        </Button>
      </div>
    </div>
  );
}
